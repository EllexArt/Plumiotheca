import {
  BLOCK_ID,
  type Block,
  ChapterDocument,
  type Inline,
  type List,
  type ListItem,
} from './schema.js';

type AnyBlock = Block | ListItem;

/** Imbrication maximale des listes (une liste dans une liste dans…). */
export const MAX_LIST_DEPTH = 4;
/** Un chapitre très long tient en 300 000 caractères (environ 50 000 mots). */
export const MAX_CHARACTERS = 300_000;

const children = (block: AnyBlock): AnyBlock[] =>
  block.type === 'blockquote' ||
  block.type === 'bulletList' ||
  block.type === 'orderedList' ||
  block.type === 'listItem'
    ? block.content
    : [];

/** Parcourt tous les blocs (y compris imbriqués), avec leur profondeur de liste. */
function* blocks(content: AnyBlock[], listDepth = 0): Generator<[AnyBlock, number]> {
  for (const block of content) {
    const depth =
      block.type === 'bulletList' || block.type === 'orderedList' ? listDepth + 1 : listDepth;
    yield [block, depth];
    yield* blocks(children(block), depth);
  }
}

const inlines = (block: AnyBlock): Inline[] =>
  block.type === 'paragraph' || block.type === 'heading' ? (block.content ?? []) : [];

/**
 * Valide un document reçu (structure stricte, limites de taille et d'imbrication).
 * Renvoie le document typé ou la liste des problèmes, sans jamais citer le texte.
 */
export function parseDocument(input: unknown) {
  const parsed = ChapterDocument.safeParse(input);
  if (!parsed.success) return parsed;
  let characters = 0;
  for (const [block, depth] of blocks(parsed.data.content)) {
    if (depth > MAX_LIST_DEPTH) {
      return failure(`Listes imbriquées sur plus de ${MAX_LIST_DEPTH} niveaux`);
    }
    for (const inline of inlines(block))
      if (inline.type === 'text') characters += inline.text.length;
  }
  if (characters > MAX_CHARACTERS) {
    return failure(`Chapitre trop long (${MAX_CHARACTERS} caractères au maximum) : découpez-le`);
  }
  return parsed;
}

function failure(message: string) {
  return {
    success: false as const,
    error: { issues: [{ path: [] as PropertyKey[], message, code: 'custom' }] },
    data: undefined,
  };
}

/** Nouvel identifiant de bloc (aléatoire, 12 caractères). */
export function newBlockId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % 64]).join('');
}

/**
 * Donne un identifiant à chaque bloc qui n'en a pas, et un nouveau au second d'un doublon
 * (bloc copié-collé). Les identifiants existants et uniques ne changent jamais : les notes
 * de lecture et la reprise de lecture restent accrochées au bon paragraphe.
 */
export function ensureBlockIds(
  doc: ChapterDocument,
  makeId: () => string = newBlockId,
): ChapterDocument {
  const copy = structuredClone(doc);
  const seen = new Set<string>();
  for (const [block] of blocks(copy.content)) {
    const attrs = ((block as { attrs?: { id?: string | null } }).attrs ??= {});
    if (!attrs.id || !BLOCK_ID.test(attrs.id) || seen.has(attrs.id)) {
      let id = makeId();
      while (seen.has(id)) id = makeId();
      attrs.id = id;
    }
    seen.add(attrs.id);
  }
  return copy;
}

/** Texte brut, un bloc par ligne (recherche, aperçu, lecture). */
export function plainText(doc: ChapterDocument): string {
  const lines: string[] = [];
  for (const [block] of blocks(doc.content)) {
    if (block.type === 'horizontalRule') lines.push('***');
    if (block.type === 'paragraph' || block.type === 'heading') {
      lines.push(
        inlines(block)
          .map((i) => (i.type === 'text' ? i.text : '\n'))
          .join(''),
      );
    }
  }
  return lines.join('\n');
}

/**
 * Nombre de mots, compté comme un traitement de texte : suites de caractères séparées par
 * des espaces et contenant une lettre ou un chiffre (« peut-être », « l'aube » : un mot ;
 * « « Viens ! » » : un mot). Le texte d'un bloc est mis bout à bout avant de compter, pour
 * qu'un mot à moitié en gras ne compte pas deux fois.
 */
export function wordCount(doc: ChapterDocument): number {
  let count = 0;
  for (const [block] of blocks(doc.content)) {
    const text = inlines(block)
      .map((i) => (i.type === 'text' ? i.text : ' '))
      .join('');
    for (const token of text.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(token)) count++;
  }
  return count;
}

/** Temps de lecture estimé, en minutes (230 mots par minute, au moins 1). */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 230));
}

export const emptyDocument = (): ChapterDocument => ({ type: 'doc', content: [] });

export type { List, ListItem };
