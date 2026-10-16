import { randomUUID } from 'node:crypto';
import { MyAccount, PublicProfile } from '@plumiotheca/contracts';
import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { Media } from '../src/media/media.entity.js';
import { User } from '../src/users/user.entity.js';
import { expectProblem, readyToken, start } from './support.js';

const bearer = (jwt: string) => ['Authorization', `Bearer ${jwt}`] as const;
type Ctx = Awaited<ReturnType<typeof start>>;

/** Compte prêt, avec son jeton et son pseudonyme. */
async function person(ctx: Ctx) {
  const sub = randomUUID();
  const jwt = await readyToken(ctx.app, { sub });
  const user = await ctx.app
    .get(DataSource)
    .getRepository(User)
    .findOneByOrFail({ keycloakId: sub });
  return { jwt, user };
}

/** Image déjà téléversée, dans l'état voulu (le traitement est testé dans media.test.ts). */
async function image(
  ctx: Ctx,
  ownerId: string,
  kind: 'avatar' | 'cover' = 'avatar',
  status: 'ready' | 'processing' = 'ready',
) {
  const repo = ctx.app.get(DataSource).getRepository(Media);
  const media = await repo.save(
    repo.create({
      ownerId,
      kind,
      status,
      ...(status === 'ready' ? { width: 512, height: 512, processedAt: new Date() } : {}),
    }),
  );
  return media.id;
}

const setAvatar = (ctx: Ctx, jwt: string, body: unknown) =>
  ctx.http
    .put('/api/moi/compte/avatar')
    .set(...bearer(jwt))
    .send(body as object);

describe('avatar (#26)', () => {
  it('une image prête de la personne : avatar sur le compte et sur le profil public', async () => {
    const ctx = await start();
    const { jwt, user } = await person(ctx);
    const id = await image(ctx, user.id);
    const account = MyAccount.parse((await setAvatar(ctx, jwt, { mediaId: id }).expect(200)).body);
    expect(account.avatarUrl).toBe(`http://medias.web.garage.localhost:3902/${id}.webp`);
    const profile = PublicProfile.parse(
      (await ctx.http.get(`/api/pseudonymes/${user.handle}`).expect(200)).body,
    );
    expect(profile.avatarUrl).toBe(account.avatarUrl);
  });

  it('jamais une URL, ni l’image d’une autre personne, ni une couverture, ni une image non prête', async () => {
    const ctx = await start();
    const { jwt, user } = await person(ctx);
    const other = await person(ctx);
    await setAvatar(ctx, jwt, { mediaId: 'https://ailleurs.example/moi.png' }).expect(400);
    await setAvatar(ctx, jwt, { url: 'https://ailleurs.example/moi.png' }).expect(400);
    for (const id of [
      await image(ctx, other.user.id),
      await image(ctx, user.id, 'cover'),
      await image(ctx, user.id, 'avatar', 'processing'),
      randomUUID(),
    ]) {
      const res = await setAvatar(ctx, jwt, { mediaId: id }).expect(422);
      expect(expectProblem(res.body, 422).type).toBe('media-invalide');
    }
    const account = MyAccount.parse(
      (
        await ctx.http
          .get('/api/moi/compte')
          .set(...bearer(jwt))
          .expect(200)
      ).body,
    );
    expect(account.avatarUrl).toBeNull();
  });

  it('remplacer oublie l’ancienne image ; retirer l’avatar le vide', async () => {
    const ctx = await start();
    const { jwt, user } = await person(ctx);
    const repo = ctx.app.get(DataSource).getRepository(Media);
    const first = await image(ctx, user.id);
    const second = await image(ctx, user.id);
    await setAvatar(ctx, jwt, { mediaId: first }).expect(200);
    await setAvatar(ctx, jwt, { mediaId: second }).expect(200);
    expect(await repo.findOneBy({ id: first })).toBeNull();
    expect(await repo.findOneBy({ id: second })).not.toBeNull();

    const account = MyAccount.parse(
      (
        await ctx.http
          .delete('/api/moi/compte/avatar')
          .set(...bearer(jwt))
          .expect(200)
      ).body,
    );
    expect(account.avatarUrl).toBeNull();
    expect(await repo.findOneBy({ id: second })).toBeNull();
  });

  it('image supprimée : l’avatar disparaît avec elle', async () => {
    const ctx = await start();
    const { jwt, user } = await person(ctx);
    const id = await image(ctx, user.id);
    await setAvatar(ctx, jwt, { mediaId: id }).expect(200);
    await ctx.app.get(DataSource).getRepository(Media).delete(id);
    const users = ctx.app.get(DataSource).getRepository(User);
    expect((await users.findOneByOrFail({ id: user.id })).avatarMediaId).toBeNull();
  });
});
