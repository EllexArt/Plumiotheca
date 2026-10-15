import {
  MAX_BLOCK_DEPTH,
  MAX_CHARACTERS,
  MAX_CHILDREN,
  MAX_HEADING_INLINE,
  MAX_LIST_DEPTH,
  MAX_NODES,
  MAX_PARAGRAPH_INLINE,
  MAX_TEXT,
  MAX_TOP_BLOCKS,
  newBlockId,
} from '@plumiotheca/editor-schema';
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

const number = new Intl.NumberFormat('fr-FR');
const TOO_LONG = `Chapitre trop long (${number.format(MAX_CHARACTERS)} caractères au plus) : découpez-le en plusieurs chapitres.`;

/**
 * Première limite de l'API que le document dépasserait, en clair ; null s'il les respecte.
 * Mêmes mesures que parseDocument (packages/editor-schema) : profondeur de chaque nœud sous
 * le document, listes emboîtées, longueur d'un texte, nombre d'éléments d'un bloc, taille du
 * chapitre. Sans ce contrôle, la modification passerait dans l'éditeur, puis plus aucune
 * sauvegarde ne passerait, avec un message qui ne dit pas où (#148).
 */
export function limitViolation(doc: PMNode): string | null {
  if (doc.childCount > MAX_TOP_BLOCKS || doc.textContent.length > MAX_CHARACTERS) return TOO_LONG;
  let nodes = 0;
  const walk = (node: PMNode, level: number, lists: number): string | null => {
    if (++nodes > MAX_NODES) return TOO_LONG;
    // Comme measure() : tout nœud compte (un séparateur ou un paragraphe vide aussi).
    if (level > MAX_BLOCK_DEPTH + 2) {
      return `Imbrication trop profonde (${MAX_BLOCK_DEPTH} niveaux au plus).`;
    }
    if (node.isText && (node.text?.length ?? 0) > MAX_TEXT) {
      return `Paragraphe trop long (${number.format(MAX_TEXT)} caractères au plus) : coupez-le en deux.`;
    }
    if (node.isInline) return null;
    const name = node.type.name;
    const list = name === 'bulletList' || name === 'orderedList';
    const depth = list ? lists + 1 : lists;
    if (depth > MAX_LIST_DEPTH) return `Listes imbriquées sur ${MAX_LIST_DEPTH} niveaux au plus.`;
    if ((list || name === 'blockquote') && node.childCount > MAX_CHILDREN) {
      return `Une citation ou une liste compte ${MAX_CHILDREN} éléments au plus : découpez-la.`;
    }
    const inline = name === 'heading' ? MAX_HEADING_INLINE : MAX_PARAGRAPH_INLINE;
    if (node.inlineContent && node.childCount > inline) {
      return 'Trop de mises en forme dans ce paragraphe : coupez-le en deux.';
    }
    let found: string | null = null;
    node.forEach((child) => {
      found ??= walk(child, level + 1, depth);
    });
    return found;
  };
  return walk(doc, 0, 0);
}

/** Le document respecte-t-il toutes les limites de l'API ? */
export const withinLimits = (doc: PMNode): boolean => limitViolation(doc) === null;

/**
 * Retire les identifiants d'un contenu collé : un collage est un nouveau bloc, sauf pour les
 * identifiants de `keep` (bloc déplacé dans le chapitre : glisser-déposer, couper-coller).
 */
function withoutIds(fragment: Fragment, keep: ReadonlySet<string> = new Set()): Fragment {
  const nodes: PMNode[] = [];
  fragment.forEach((node) => {
    if (node.isText) {
      const text = cleanInline(node.text ?? '');
      if (text) nodes.push(text === node.text ? node : node.type.schema.text(text, node.marks));
      return;
    }
    const id = node.attrs.id as string | null | undefined;
    const attrs =
      BLOCK_TYPES.includes(node.type.name) && !(id && keep.has(id))
        ? { ...node.attrs, id: null }
        : node.attrs;
    nodes.push(node.type.create(attrs, withoutIds(node.content, keep), node.marks));
  });
  return Fragment.fromArray(nodes);
}

/** Identifiants des blocs d'un contenu. */
function idsOf(fragment: Fragment, into = new Set<string>()): Set<string> {
  fragment.forEach((node) => {
    const id = node.attrs.id as string | null | undefined;
    if (id && BLOCK_TYPES.includes(node.type.name)) into.add(id);
    idsOf(node.content, into);
  });
  return into;
}

/**
 * Identifiants de blocs (#134, #147) : chaque bloc garde le sien d'une sauvegarde à l'autre,
 * pour que notes de lecture et reprise restent accrochées au bon paragraphe.
 *
 * - Retour à la ligne : le nouveau bloc en reçoit un nouveau (keepOnSplit: false) ; Entrée
 *   au début d'un paragraphe insère un paragraphe vide au-dessus, le texte garde le sien.
 * - Collage : nouveaux identifiants, sauf pour un bloc déplacé dans le chapitre
 *   (glisser-déposer, ou couper puis coller), qui garde le sien.
 * - Doublons : laissés à l'API, qui départage d'après le texte enregistré (ensureBlockIds) ;
 *   l'éditeur reprend ensuite le document complété. Ici, seuls les blocs sans identifiant
 *   en reçoivent un.
 */
declare module '@tiptap/core' {
  interface EditorEvents {
    /** Modification refusée par l'éditeur (limite de l'API, #148), avec la raison. */
    refused: { reason: string };
  }
}

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

  // Avant les raccourcis de StarterKit (Entrée au début d'un paragraphe).
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        const block = $from.parent;
        if (!empty || $from.parentOffset !== 0 || !block.isTextblock || !block.content.size) {
          return false;
        }
        // Dans une liste : comportement habituel (nouvel élément de liste).
        if ($from.depth > 1 && $from.node(-1).type.name === 'listItem') return false;
        // Paragraphe vide au-dessus : le texte garde son bloc, donc son identifiant.
        return editor
          .chain()
          .insertContentAt($from.before(), { type: 'paragraph' }, { updateSelection: false })
          .run();
      },
    };
  },

  addProseMirrorPlugins() {
    // Identifiants des blocs coupés : collés ensuite, ce sont des blocs déplacés.
    let cut = new Set<string>();
    return [
      new Plugin({
        key: new PluginKey('blockIds'),
        props: {
          handleDOMEvents: {
            cut: (view) => {
              cut = idsOf(view.state.selection.content().content);
              return false;
            },
          },
          transformPasted: (slice, view) => {
            // Glisser-déposer dans le chapitre : le bloc est déplacé, il garde son identifiant.
            const moved = view.dragging?.move ? idsOf(slice.content) : new Set<string>();
            // Couper puis coller : identifiants gardés s'ils ne sont plus dans le chapitre.
            const present = idsOf(view.state.doc.content);
            for (const id of cut) if (!present.has(id)) moved.add(id);
            return new Slice(withoutIds(slice.content, moved), slice.openStart, slice.openEnd);
          },
          transformPastedText: (text) => cleanPastedText(text),
        },
        // Jamais au-delà des limites de l'API (Tab de trop, collage trop profond ou trop long,
        // paragraphe démesuré) : sinon plus aucune sauvegarde ne passerait. Le refus est dit.
        filterTransaction: (tr) => {
          if (!tr.docChanged) return true;
          const refused = limitViolation(tr.doc);
          if (refused) this.editor.emit('refused', { reason: refused });
          return !refused;
        },
        appendTransaction: (transactions, _before, state) => {
          if (!transactions.some((t) => t.docChanged)) return null;
          const present = idsOf(state.doc.content);
          let tr: Transaction | null = null;
          state.doc.descendants((node, pos) => {
            if (!BLOCK_TYPES.includes(node.type.name) || node.attrs.id) return;
            let next = newBlockId();
            while (present.has(next)) next = newBlockId();
            present.add(next);
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
