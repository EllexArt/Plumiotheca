import { MAX_BLOCK_DEPTH, MAX_LIST_DEPTH, newBlockId } from '@plumiotheca/editor-schema';
import { Extension } from '@tiptap/core';
import TextAlign from '@tiptap/extension-text-align';
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';

/** Blocs qui portent un identifiant stable (schéma de packages/editor-schema). */
export const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'horizontalRule',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
];

/**
 * Caractères que l'API refuse dans le texte (packages/editor-schema) : contrôles (hors
 * tabulation) et forçage du sens d'écriture (les isolats, utiles à l'arabe et à l'hébreu,
 * restent : décision 52). Un collage qui en contient ne pourrait jamais
 * être enregistré : ils sont retirés à l'entrée.
 */
// eslint-disable-next-line no-control-regex -- ce sont précisément les caractères refusés.
const FORBIDDEN = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u202A-\u202E]/g;

/** Texte collé brut : tabulation verticale (Word, messageries) → retour à la ligne. */
export const cleanPastedText = (text: string) => text.replace(/\v/g, '\n').replace(FORBIDDEN, '');

/** Texte d'un contenu collé mis en forme : caractères refusés retirés. */
const cleanInline = (text: string) => text.replace(/\v/g, ' ').replace(FORBIDDEN, '');

/**
 * Le document respecte-t-il les limites d'imbrication de l'API (blocs : MAX_BLOCK_DEPTH,
 * listes : MAX_LIST_DEPTH) ? Mesure identique à parseDocument : profondeur du texte sous
 * le document, et nombre de listes emboîtées.
 */
export function withinLimits(doc: PMNode): boolean {
  const walk = (node: PMNode, level: number, lists: number): boolean => {
    if (node.isInline) return level <= MAX_BLOCK_DEPTH + 2;
    const list = node.type.name === 'bulletList' || node.type.name === 'orderedList';
    const depth = list ? lists + 1 : lists;
    if (depth > MAX_LIST_DEPTH) return false;
    let ok = true;
    node.forEach((child) => {
      ok &&= walk(child, level + 1, depth);
    });
    return ok;
  };
  return walk(doc, 0, 0);
}

/** Retire les identifiants d'un contenu collé : un collage est toujours un nouveau bloc. */
function withoutIds(fragment: Fragment): Fragment {
  const nodes: PMNode[] = [];
  fragment.forEach((node) => {
    if (node.isText) {
      const text = cleanInline(node.text ?? '');
      if (text) nodes.push(text === node.text ? node : node.type.schema.text(text, node.marks));
      return;
    }
    const attrs = BLOCK_TYPES.includes(node.type.name) ? { ...node.attrs, id: null } : node.attrs;
    nodes.push(node.type.create(attrs, withoutIds(node.content), node.marks));
  });
  return Fragment.fromArray(nodes);
}

/**
 * Identifiants de blocs (#134) : chaque bloc garde le sien d'une sauvegarde à l'autre, pour
 * que notes de lecture et reprise restent accrochées au bon paragraphe. Un bloc né d'un
 * retour à la ligne (keepOnSplit: false) ou d'un collage en reçoit un nouveau ; en cas de
 * doublon, le premier garde l'identifiant. L'API complète et départage de son côté
 * (ensureBlockIds), cette extension évite simplement les allers-retours.
 */
export const BlockIds = Extension.create({
  name: 'blockIds',

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          id: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute('data-id'),
            renderHTML: (attributes) => (attributes.id ? { 'data-id': attributes.id } : {}),
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockIds'),
        props: {
          transformPasted: (slice) =>
            new Slice(withoutIds(slice.content), slice.openStart, slice.openEnd),
          transformPastedText: (text) => cleanPastedText(text),
        },
        // Jamais au-delà des limites d'imbrication de l'API (Tab de trop, collage profond) :
        // sinon plus aucune sauvegarde ne passerait.
        filterTransaction: (tr) => !tr.docChanged || withinLimits(tr.doc),
        appendTransaction: (transactions, _before, state) => {
          if (!transactions.some((t) => t.docChanged)) return null;
          const seen = new Set<string>();
          let tr: Transaction | null = null;
          state.doc.descendants((node, pos) => {
            if (!BLOCK_TYPES.includes(node.type.name)) return;
            const id = node.attrs.id as string | null;
            if (id && !seen.has(id)) {
              seen.add(id);
              return;
            }
            let next = newBlockId();
            while (seen.has(next)) next = newBlockId();
            seen.add(next);
            tr ??= state.tr;
            // Même taille de nœud : les positions suivantes restent valables.
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: next });
          });
          return tr ? (tr as Transaction).setMeta('addToHistory', false) : null;
        },
      }),
    ];
  },
});

/**
 * Configuration de l'éditeur : la même que le test de contrat de packages/editor-schema
 * (pas de code, de lien ni de titre de niveau 1 ; alignement), plus les identifiants.
 */
export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    code: false,
    codeBlock: false,
    link: false,
  }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  BlockIds,
];
