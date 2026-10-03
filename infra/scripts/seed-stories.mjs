// Histoires de démonstration, publiées par l'API avec les comptes de démonstration
// (pnpm infra:seed d'abord). Idempotent : une histoire déjà présente n'est pas recréée.
// Usage : node infra/scripts/seed-stories.mjs (API lancée sur le port 3000).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { infraEnv, root } from './keycloak-admin.mjs';
import { login } from './oidc-test.mjs';

const API = process.env.API_URL ?? 'http://localhost:3000';
const password = infraEnv().DEMO_PASSWORD;
if (!password) throw new Error('DEMO_PASSWORD absent de infra/.env : lancez « pnpm infra:seed ».');
const charterVersion = readFileSync(join(root, 'packages/contracts/src/charter.ts'), 'utf8').match(
  /CHARTER_VERSION = '([^']+)'/,
)[1];

/** Connexion d'un compte de démonstration ; accueil fait si besoin. */
async function session(username, handle, displayName) {
  const { tokens } = await login(username, password);
  if (!tokens?.access_token) {
    throw new Error(`Connexion impossible pour ${username} : lancez « pnpm infra:seed ».`);
  }
  const call = async (method, path, body) => {
    const res = await fetch(`${API}/api${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
    return json;
  };
  const me = await call('GET', '/moi/compte');
  if (me.step === 'first-visit') {
    await call('POST', '/moi/compte/premiere-visite', { handle, age: '18+', charterVersion });
  } else if (me.step === 'charter') {
    await call('POST', '/moi/compte/charte', { charterVersion });
  }
  await call('PATCH', '/moi/compte/profil', { displayName });
  return call;
}

/** Texte → document : une ligne vide entre deux paragraphes, « *** » pour une scène. */
const doc = (text) => ({
  type: 'doc',
  content: text
    .trim()
    .split(/\n\s*\n/)
    .map((p) =>
      p.trim() === '***'
        ? { type: 'horizontalRule' }
        : {
            type: 'paragraph',
            content: [{ type: 'text', text: p.trim().replace(/\s*\n\s*/g, ' ') }],
          },
    ),
});

async function publish(call, story) {
  const mine = await call('GET', '/moi/histoires');
  if (mine.some((s) => s.title === story.title)) {
    console.log(`• ${story.title} : déjà là`);
    return;
  }
  const { chapters, ...fields } = story;
  const created = await call('POST', '/histoires', { language: 'fr', ...fields });
  for (const chapter of chapters) {
    const c = await call('POST', `/histoires/${created.id}/chapitres`, { title: chapter.title });
    await call('PUT', `/histoires/${created.id}/chapitres/${c.id}/brouillon`, {
      draft: doc(chapter.text),
      version: c.draftVersion,
    });
    await call('POST', `/histoires/${created.id}/chapitres/${c.id}/publication`);
  }
  await call('POST', `/histoires/${created.id}/publication`);
  console.log(`✓ ${story.title} (${chapters.length} chapitres)`);
}

const ilse = await session('autrice-demo', 'Ilse.Varenne', 'Ilse Varenne');
const theo = await session('jardinier-demo', 'Theo.B', 'Théo B.');

await publish(ilse, {
  title: 'Lettres à une étoile morte',
  summary:
    'Chaque soir, depuis la station Héliotrope, Nour écrit à sa sœur restée sur Terre. Les lettres mettent onze ans à arriver. Les réponses, elles, arrivent beaucoup trop vite.',
  rating: 'teen',
  completion: 'in_progress',
  majorWarnings: ['character_death'],
  tags: ['science-fiction', 'épistolaire', 'deuil', 'sœurs'],
  chapters: [
    {
      title: 'Première lettre',
      text: `
Chère Léa,

La station tourne si lentement qu'on oublie qu'elle tourne. Par le hublot de ma cabine, je vois la même étoile tous les soirs, un point orange un peu tremblant. Le chef d'équipe dit qu'elle est morte depuis longtemps et que nous ne voyons que sa lumière d'avant. Je trouve ça rassurant, je ne sais pas pourquoi.

Ici, tout le monde parle à voix basse. Pas pour ne pas déranger : c'est l'acoustique. Les couloirs avalent les sons. Le premier jour, j'ai cru que j'étais devenue sourde.

Tu me manques comme un pull qu'on a oublié dans un train. Je sais exactement où il est, et je ne peux rien y faire.

Ta sœur qui flotte un peu,
Nour`,
    },
    {
      title: 'La réponse',
      text: `
Le message est arrivé pendant mon quart de nuit. Un seul paragraphe, signé Léa.

Je l'ai relu trois fois avant de comprendre ce qui clochait. Elle répondait à ma lettre. Ma lettre partie la veille, qui devait voyager onze ans avant de toucher l'antenne de Kourou.

***

J'ai montré l'écran à Ilyès, le technicien des communications. Il a vérifié les horodatages, les relais, les sommes de contrôle. Tout était normal. Tout, sauf l'heure d'envoi : dans trois ans.

« C'est une erreur d'horloge », a-t-il dit. Puis il a éteint la console et il n'a plus rien dit du tout.

Dans la lettre, Léa écrivait : « Ne regarde pas l'étoile orange trop longtemps. Elle te regarde aussi. »`,
    },
  ],
});

await publish(ilse, {
  title: 'La bibliothèque engloutie',
  summary:
    "Quand la marée se retire, elle rend une bibliothèque que tout le monde croyait perdue. Ilse y cherche les livres inachevés de sa mère, et découvre que quelqu'un continue de les écrire.",
  rating: 'general',
  completion: 'in_progress',
  majorWarnings: [],
  tags: ['fantasy', 'mystère', 'secrets de famille'],
  chapters: [
    {
      title: 'Ce que la mer rend',
      text: `
La ville basse n'avait jamais vu la mer reculer si loin. Au matin, entre les barques couchées, il y avait des toits, des rues, et une porte de bronze qui portait encore son nom : Bibliothèque.

Ilse descendit la première. Le sable était tiède, plein de petits coquillages roses qui craquaient sous ses bottes. Derrière elle, Tomas portait la lanterne et ne disait rien, ce qui chez lui voulait dire qu'il avait peur.

La porte n'était pas fermée. Elle n'avait jamais été fermée, comprit Ilse en la poussant : la mer l'avait simplement gardée pour plus tard.`,
    },
    {
      title: 'Les registres mouillés',
      text: `
À l'intérieur, l'air sentait le sel et le papier. Les étagères montaient jusqu'au plafond, ruisselantes, chargées de volumes gonflés d'eau.

Au comptoir de prêt, un registre était resté ouvert. La dernière ligne datait de vingt ans. Le nom de l'emprunteuse était celui de sa mère.

***

« Elle venait ici ? » demanda Tomas.

Ilse ne répondit pas. Sous le nom de sa mère, d'une encre toute fraîche, quelqu'un avait ajouté une ligne. La date était celle d'aujourd'hui.`,
    },
    {
      title: 'La marée basse',
      text: `
La marée avait rendu les étagères une à une, ruisselantes, couvertes de sel. Ilse posa la main sur le dos d'un volume : le cuir était tiède, comme si quelqu'un venait de le refermer.

« Tu crois qu'ils se souviennent de nous ? » demanda Tomas.

Elle ne répondit pas. Au fond de la salle, une lampe s'était rallumée toute seule, et les pages d'un livre ouvert tournaient lentement, sans le moindre souffle de vent.

Ilse compta les marches qui descendaient vers l'eau noire. Quarante-deux. Exactement le nombre de chapitres que sa mère n'avait jamais terminés.`,
    },
  ],
});

await publish(theo, {
  title: 'Le dernier tramway',
  summary:
    "Minuit dix, ligne 3. Deux inconnus, un tramway qui ne s'arrête plus aux arrêts prévus, et toute une ville qui défile à l'envers.",
  rating: 'general',
  completion: 'completed',
  majorWarnings: [],
  tags: ['urbain', 'nuit', 'rencontre', 'réalisme magique'],
  chapters: [
    {
      title: 'Minuit dix',
      text: `
Le tramway arriva avec quatre minutes d'avance, ce qui n'était jamais arrivé dans l'histoire de la ligne 3.

Sacha monta sans réfléchir. À l'intérieur, une seule passagère, assise tout au fond, un carnet sur les genoux. Elle leva les yeux, sourit comme on sourit à quelqu'un qu'on attendait, puis se remit à écrire.

Les portes se fermèrent. Sur l'écran, au lieu de « Prochain arrêt : République », s'afficha un mot que Sacha ne connaissait pas : Avant.`,
    },
    {
      title: 'Terminus',
      text: `
Ils roulèrent longtemps. Par les vitres, la ville défilait à l'envers : les immeubles neufs redevenaient des chantiers, les chantiers des terrains vagues, et les cafés fermés rouvraient un par un leurs volets.

« Tu descends où ? » demanda enfin la passagère.

Sacha regarda le plan au-dessus des portes. Toutes les stations portaient des noms de souvenirs. Il y avait son école, la maison de sa grand-mère, un banc dont il avait oublié l'existence.

***

Il descendit au terminus, qui portait simplement son prénom. Quand il se retourna, le tramway était vide, et sur le siège du fond quelqu'un avait oublié un carnet. À la première page, de sa propre écriture : « Pour la prochaine fois. »`,
    },
  ],
});

console.log('Histoires de démonstration prêtes : http://localhost:5173');
