import { Media, MAX_UPLOAD_BYTES, UploadTicket } from '@plumiotheca/contracts';
import sharp from 'sharp';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { DAILY_UPLOADS, MediaService } from '../src/media/media.service.js';
import { StorageService, TooLarge } from '../src/media/storage.service.js';
import { Media as MediaRow } from '../src/media/media.entity.js';
import { expectProblem, readyToken, start } from './support.js';

const bearer = (jwt: string) => ['Authorization', `Bearer ${jwt}`] as const;
type Ctx = Awaited<ReturnType<typeof start>>;

/** Stockage simulé : fichiers bruts en mémoire, images publiées capturées. */
function storage(ctx: Ctx, incoming: Map<string, Buffer | 'trop-gros'>) {
  const service = ctx.app.get(StorageService);
  const published = new Map<string, Buffer>();
  vi.spyOn(service, 'readIncoming').mockImplementation((key) => {
    const file = incoming.get(key);
    if (file === 'trop-gros') return Promise.reject(new TooLarge());
    return Promise.resolve(file ?? null);
  });
  vi.spyOn(service, 'removeIncoming').mockImplementation((key) => {
    incoming.delete(key);
    return Promise.resolve({} as never);
  });
  vi.spyOn(service, 'putPublic').mockImplementation((key, body) => {
    published.set(key, body);
    return Promise.resolve({} as never);
  });
  vi.spyOn(service, 'removePublic').mockImplementation((key) => {
    published.delete(key);
    return Promise.resolve({} as never);
  });
  vi.spyOn(service, 'listPublic').mockImplementation(() => Promise.resolve([...published.keys()]));
  return published;
}

/** Photo de 2 000 × 1 000 avec des métadonnées qui ne doivent jamais être publiées. */
const photo = () =>
  sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#b0413e' } })
    .jpeg()
    .withExif({
      IFD0: { Artist: 'Nom Civil Secret', Copyright: 'Nom Civil Secret' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 51/1 24/1' },
    })
    .toBuffer();

async function upload(ctx: Ctx, jwt: string, kind: 'avatar' | 'cover') {
  const ticket = UploadTicket.parse(
    (
      await ctx.http
        .post('/api/medias')
        .set(...bearer(jwt))
        .send({ kind })
        .expect(201)
    ).body,
  );
  return ticket;
}

describe('images téléversées (#18)', () => {
  it('autorisation de téléverser : vers l’espace privé, 10 Mo au plus, sans compte refusée', async () => {
    const ctx = await start();
    await ctx.http.post('/api/medias').send({ kind: 'cover' }).expect(401);
    const jwt = await readyToken(ctx.app);
    const ticket = await upload(ctx, jwt, 'cover');
    expect(ticket.url).toMatch(/^http:\/\/localhost:3900\/medias-entrants\/?$/);
    expect(ticket.fields.key).toBe(ticket.id);
    expect(ticket.maxBytes).toBe(MAX_UPLOAD_BYTES);
    const policy = JSON.parse(Buffer.from(ticket.fields.Policy!, 'base64').toString()) as {
      conditions: unknown[];
    };
    expect(policy.conditions).toContainEqual(['content-length-range', 1, MAX_UPLOAD_BYTES]);
    // Un usage inconnu, ou une adresse à la place d'un fichier, est refusé.
    await ctx.http
      .post('/api/medias')
      .set(...bearer(jwt))
      .send({ kind: 'banniere' })
      .expect(400);
    await ctx.http
      .post('/api/medias')
      .set(...bearer(jwt))
      .send({ kind: 'cover', url: 'https://ailleurs.example/image.png' })
      .expect(400);
  });

  it('couverture : ré-encodée en WebP, 1 200 px de large, sans aucune métadonnée', async () => {
    const ctx = await start();
    const incoming = new Map<string, Buffer | 'trop-gros'>();
    const published = storage(ctx, incoming);
    const jwt = await readyToken(ctx.app);
    const ticket = await upload(ctx, jwt, 'cover');
    const original = await photo();
    expect(original.includes(Buffer.from('Nom Civil Secret'))).toBe(true);
    incoming.set(ticket.id, original);

    const submitted = Media.parse(
      (
        await ctx.http
          .post(`/api/medias/${ticket.id}/traitement`)
          .set(...bearer(jwt))
          .expect(202)
      ).body,
    );
    expect(submitted).toMatchObject({ status: 'processing', url: null });
    await ctx.app.get(MediaService).process(ticket.id);

    const media = Media.parse(
      (
        await ctx.http
          .get(`/api/medias/${ticket.id}`)
          .set(...bearer(jwt))
          .expect(200)
      ).body,
    );
    expect(media).toMatchObject({ status: 'ready', width: 1200, height: 600, rejection: null });
    expect(media.url).toBe(`http://medias.web.garage.localhost:3902/${ticket.id}.webp`);
    const out = published.get(`${ticket.id}.webp`)!;
    const meta = await sharp(out).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 1200, 600]);
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(out.includes(Buffer.from('Nom Civil Secret'))).toBe(false);
    // Le fichier brut est effacé dès le traitement.
    expect(incoming.has(ticket.id)).toBe(false);
  });

  it('avatar : PNG portrait recadré en carré de 512 px', async () => {
    const ctx = await start();
    const incoming = new Map<string, Buffer | 'trop-gros'>();
    const published = storage(ctx, incoming);
    const jwt = await readyToken(ctx.app);
    const ticket = await upload(ctx, jwt, 'avatar');
    const png = await sharp({
      create: { width: 300, height: 900, channels: 4, background: '#2b6cb0' },
    })
      .png()
      .toBuffer();
    incoming.set(ticket.id, png);
    await ctx.app.get(MediaService).process(ticket.id);
    const meta = await sharp(published.get(`${ticket.id}.webp`)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 512, 512]);
  });

  it.each([
    ['texte', () => Buffer.from('Bonjour, ceci n’est pas une image.'), 'format'],
    [
      'SVG',
      () =>
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
        ),
      'format',
    ],
    [
      'GIF',
      () =>
        sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } })
          .gif()
          .toBuffer(),
      'format',
    ],
    [
      'PNG tronqué',
      async () =>
        (
          await sharp({ create: { width: 400, height: 400, channels: 3, background: '#fff' } })
            .png()
            .toBuffer()
        ).subarray(0, 60),
      'illisible',
    ],
    ['plus de 10 Mo', () => 'trop-gros' as const, 'taille'],
    ['rien de téléversé', () => null, 'absent'],
  ])('%s : refusé (%s), rien de publié', async (_, file, rejection) => {
    const ctx = await start();
    const incoming = new Map<string, Buffer | 'trop-gros'>();
    const published = storage(ctx, incoming);
    const jwt = await readyToken(ctx.app);
    const ticket = await upload(ctx, jwt, 'cover');
    const content = await file();
    if (content) incoming.set(ticket.id, content);
    await ctx.app.get(MediaService).process(ticket.id);
    const media = Media.parse(
      (
        await ctx.http
          .get(`/api/medias/${ticket.id}`)
          .set(...bearer(jwt))
          .expect(200)
      ).body,
    );
    expect(media).toMatchObject({ status: 'rejected', rejection, url: null, width: null });
    expect(published.size).toBe(0);
    expect(incoming.has(ticket.id)).toBe(false);
  });

  it('l’image d’une autre personne : introuvable', async () => {
    const ctx = await start();
    const owner = await readyToken(ctx.app);
    const ticket = await upload(ctx, owner, 'cover');
    const other = await readyToken(ctx.app);
    await ctx.http
      .get(`/api/medias/${ticket.id}`)
      .set(...bearer(other))
      .expect(404);
    await ctx.http
      .post(`/api/medias/${ticket.id}/traitement`)
      .set(...bearer(other))
      .expect(404);
  });

  it(`${DAILY_UPLOADS} téléversements par jour au plus`, async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const repo = ctx.app.get(DataSource).getRepository(MediaRow);
    const mine = (await upload(ctx, jwt, 'cover')).id;
    const ownerId = (await repo.findOneByOrFail({ id: mine })).ownerId;
    await repo.insert(
      Array.from({ length: DAILY_UPLOADS - 1 }, () => ({ ownerId, kind: 'cover' as const })),
    );
    const res = await ctx.http
      .post('/api/medias')
      .set(...bearer(jwt))
      .send({ kind: 'cover' })
      .expect(429);
    expectProblem(res.body, 429);
  });

  it('ménage : téléversements abandonnés oubliés après un jour ; images sans média effacées', async () => {
    const ctx = await start();
    const incoming = new Map<string, Buffer | 'trop-gros'>();
    const published = storage(ctx, incoming);
    const jwt = await readyToken(ctx.app);
    const abandoned = await upload(ctx, jwt, 'cover');
    const fresh = await upload(ctx, jwt, 'cover');
    const repo = ctx.app.get(DataSource).getRepository(MediaRow);
    await repo.update(abandoned.id, { createdAt: new Date(Date.now() - 25 * 3_600_000) });
    published.set('01a102e1-0000-7000-8000-000000000000.webp', Buffer.from('orpheline'));

    const result = await ctx.app.get(MediaService).sweep();
    expect(result.forgotten).toBeGreaterThanOrEqual(1);
    expect(result.orphans).toBe(1);
    expect(await repo.findOneBy({ id: abandoned.id })).toBeNull();
    expect(await repo.findOneBy({ id: fresh.id })).not.toBeNull();
    expect(published.size).toBe(0);
  });
});
