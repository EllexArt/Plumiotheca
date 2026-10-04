import { newBlockId } from '@plumiotheca/editor-schema';
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

/** Retire les identifiants d'un contenu collé : un collage est toujours un nouveau bloc. */
function withoutIds(fragment: Fragment): Fragment {
  const nodes: PMNode[] = [];
  fragment.forEach((node) => {
    if (node.isText) {
      nodes.push(node);
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
        },
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
