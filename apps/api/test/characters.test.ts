import { randomBytes } from 'node:crypto';
import {
  ChapterDraft,
  SearchPage,
  StoryDetail,
  StoryPage,
  parseRelationship,
  relationshipKey,
} from '@plumiotheca/contracts';
import { describe, expect, it } from 'vitest';
import { SearchService } from '../src/stories/search.service.js';
import { expectProblem, readyToken, start } from './support.js';

const bearer = (jwt: string) => ['Authorization', `Bearer ${jwt}`] as const;
type Ctx = Awaited<ReturnType<typeof start>>;
// Lettres au hasard, capitalisées : des noms propres propres à chaque test.
const name = () =>
  'Z' + Array.from(randomBytes(9), (b) => String.fromCharCode(97 + (b % 26))).join('');

/** Histoire publiée (un chapitre), indexée. */
async function story(ctx: Ctx, jwt: string, body: Record<string, unknown>) {
  const created = StoryDetail.parse(
    (
      await ctx.http
        .post('/api/histoires')
        .set(...bearer(jwt))
        .send({ language: 'fr', rating: 'general', majorWarnings: [], ...body })
        .expect(201)
    ).body,
  );
  const chapter = ChapterDraft.parse(
    (
      await ctx.http
        .post(`/api/histoires/${created.id}/chapitres`)
        .set(...bearer(jwt))
        .send({ title: 'Un' })
        .expect(201)
    ).body,
  );
  const text = { type: 'paragraph', content: [{ type: 'text', text: 'Il était une fois.' }] };
  await ctx.http
    .put(`/api/histoires/${created.id}/chapitres/${chapter.id}/brouillon`)
    .set(...bearer(jwt))
    .send({ draft: { type: 'doc', content: [text] }, version: chapter.draftVersion })
    .expect(200);
  await ctx.http
    .post(`/api/histoires/${created.id}/chapitres/${chapter.id}/publication`)
    .set(...bearer(jwt))
    .expect(201);
  await ctx.http
    .post(`/api/histoires/${created.id}/publication`)
    .set(...bearer(jwt))
    .expect(201);
  const search = ctx.app.get(SearchService);
  await search.waitForTask(await search.sync(created.id));
  return created;
}

describe('relations (syntaxe)', () => {
  it('« / » romantique, « & » platonique ; l’ordre des personnages ne compte pas', () => {
    expect(parseRelationship('Ilse/Tomas')).toEqual({
      kind: 'romantic',
      names: ['Ilse', 'Tomas'],
    });
    expect(parseRelationship('Ilse & sa mère')).toEqual({
      kind: 'platonic',
      names: ['Ilse', 'sa mère'],
    });
    expect(relationshipKey('romantic', ['Tomas', 'ilse'])).toBe(
      relationshipKey('romantic', ['Ilse', 'Tomas']),
    );
    for (const bad of ['Ilse', 'Ilse/Tomas & Mia', 'Ilse/ilse', 'Ilse/', 'A/B/C/D/E/F']) {
      expect(parseRelationship(bad)).toBeNull();
    }
  });
});

describe('personnages et relations (#79)', () => {
  it('« Ilse/Tomas » et « Ilse & sa mère » sur la même histoire ; personnages ajoutés d’eux-mêmes', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const [ilse, tomas, mia] = [name(), name(), name()];
    const created = await story(ctx, jwt, {
      title: 'Les marées',
      characters: [mia],
      relationships: [`${ilse}/${tomas}`, `${ilse} & sa mère`],
    });
    expect(created.relationships).toEqual([`${ilse}/${tomas}`, `${ilse} & sa mère`]);
    expect(created.characters).toEqual([mia, ilse, tomas, 'sa mère']);

    // Une autre histoire avec la même relation, écrite autrement : la même relation.
    const other = await story(ctx, jwt, {
      title: 'Le retour',
      relationships: [`${tomas.toUpperCase()} / ${ilse}`],
    });
    expect(other.relationships).toEqual([`${ilse}/${tomas}`]);

    // Modifier une seule liste garde l'autre.
    const updated = StoryDetail.parse(
      (
        await ctx.http
          .patch(`/api/histoires/${created.id}`)
          .set(...bearer(jwt))
          .send({ characters: [mia] })
          .expect(200)
      ).body,
    );
    expect(updated.relationships).toHaveLength(2);
    await ctx.http
      .patch(`/api/histoires/${created.id}`)
      .set(...bearer(jwt))
      .send({ relationships: ['Ilse/Ilse'] })
      .expect(400);
  });

  it('filtres et facettes : liste et recherche', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const [ilse, tomas, mia] = [name(), name(), name()];
    const first = await story(ctx, jwt, {
      title: `Premier ${ilse}`,
      relationships: [`${ilse}/${tomas}`],
    });
    await story(ctx, jwt, {
      title: `Second ${ilse}`,
      relationships: [`${tomas}/${ilse}`, `${ilse} & ${mia}`],
    });
    await story(ctx, jwt, { title: `Troisieme ${ilse}`, characters: [mia] });
    const handle = first.author.handle;
    const list = async (params: string) =>
      StoryPage.parse(
        (await ctx.http.get(`/api/histoires?pseudonyme=${handle}&${params}`).expect(200)).body,
      );
    const titles = (items: { title: string }[]) => items.map((s) => s.title.split(' ')[0]).sort();

    const romance = await list(`relations=${encodeURIComponent(`${tomas}/${ilse}`)}`);
    expect(titles(romance.items)).toEqual(['Premier', 'Second']);
    expect(titles((await list(`personnages=${encodeURIComponent(mia)}`)).items)).toEqual([
      'Second',
      'Troisieme',
    ]);
    // Platonique et romantique : deux relations différentes.
    expect((await list(`relations=${encodeURIComponent(`${ilse} & ${tomas}`)}`)).items).toEqual([]);
    const all = await list('');
    expect(all.facets?.relationships).toEqual([
      { name: `${ilse}/${tomas}`, stories: 2 },
      { name: `${ilse} & ${mia}`, stories: 1 },
    ]);
    // Trois personnages à égalité (deux histoires chacun) : l'ordre suit les noms.
    expect(all.facets?.characters).toHaveLength(3);
    expect(all.facets?.characters).toEqual(
      expect.arrayContaining([ilse, tomas, mia].map((n) => ({ name: n, stories: 2 }))),
    );

    const find = async (params: string) =>
      SearchPage.parse((await ctx.http.get(`/api/recherche?q=${ilse}&${params}`).expect(200)).body);
    expect(
      titles((await find(`relations=${encodeURIComponent(`${ilse}/${tomas}`)}`)).items),
    ).toEqual(['Premier', 'Second']);
    expect((await find('')).facets?.relationships).toContainEqual({
      name: `${ilse}/${tomas}`,
      stories: 2,
    });
    expectProblem((await ctx.http.get('/api/histoires?relations=Ilse').expect(400)).body, 400);
  });
});
