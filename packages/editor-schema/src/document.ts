import {
  BLOCK_ID,
  type Block,
  type ChapterDocument,
  type Inline,
  type ListItem,
  UncheckedChapterDocument,
} from './schema.js';

type AnyBlock = Block | ListItem;

/** Imbrication maximale des listes (une liste dans une liste dans…). */
export const MAX_LIST_DEPTH = 4;
/** Imbrication maximale des blocs (citations et listes confondues). */
export const MAX_BLOCK_DEPTH = 8;
/** Nombre maximal de nœuds d'un chapitre. */
export const MAX_NODES = 100_000;
/** Un chapitre très long tient en 300 000 caractères (environ 50 000 mots en français). */
export const MAX_CHARACTERS = 300_000;
/** Au-delà, les erreurs suivantes ne sont pas détaillées (réponse et calcul bornés). */
export const MAX_ISSUES = 20;

export interface DocumentIssue {
  /** Chemin dans le document (« content.3.content.0.text »). */
  path: string;
  message: string;
  code: string;
}

export type ParseResult =
  { success: true; data: ChapterDocument } | { success: false; issues: DocumentIssue[] };

const fail = (message: string, code = 'custom'): ParseResult => ({
  success: false,
  issues: [{ path: '', message, code }],
});

/**
 * Mesure la profondeur et le nombre de nœuds d'un document brut, sans récursion (aucun
 * débordement de pile possible), avant toute validation détaillée.
 */
function measure(input: unknown): { depth: number; nodes: number } {
  const stack: [unknown, number][] = [[input, 0]];
  let depth = 0;
  let nodes = 0;
  while (stack.length) {
    const [node, level] = stack.pop()!;
    nodes++;
    if (nodes > MAX_NODES || level > MAX_BLOCK_DEPTH + 3) return { depth: level, nodes };
    depth = Math.max(depth, level);
    const content = (node as { content?: unknown } | null)?.content;
    if (Array.isArray(content)) for (const child of content) stack.push([child, level + 1]);
  }
  return { depth, nodes };
}

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

/** Texte d'un bloc de texte, mis bout à bout (les retours à la ligne deviennent des espaces). */
const blockText = (block: AnyBlock) =>
  inlines(block)
    .map((i) => (i.type === 'text' ? i.text : ' '))
    .join('');

/**
 * Seule porte d'entrée pour un document reçu : profondeur et nombre de nœuds bornés d'abord
 * (sans récursion), puis structure stricte, puis taille. Ne lève jamais d'exception ; les
 * problèmes (20 au plus) ne citent jamais le texte.
 */
export function parseDocument(input: unknown): ParseResult {
  try {
    const { depth, nodes } = measure(input);
    // doc → bloc → … : MAX_BLOCK_DEPTH blocs imbriqués, plus le texte et ses marques.
    if (nodes > MAX_NODES) return fail(`Chapitre trop long (${MAX_NODES} éléments au maximum)`);
    if (depth > MAX_BLOCK_DEPTH + 2) {
      return fail(
        `Trop d’imbrications (citations et listes : ${MAX_BLOCK_DEPTH} niveaux, listes : ${MAX_LIST_DEPTH})`,
      );
    }
    const parsed = UncheckedChapterDocument.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        issues: parsed.error.issues.slice(0, MAX_ISSUES).map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
          code: issue.code,
        })),
      };
    }
    const doc = parsed.data;
    let characters = 0;
    for (const [block, listDepth] of blocks(doc.content)) {
      if (listDepth > MAX_LIST_DEPTH) {
        return fail(`Listes imbriquées sur plus de ${MAX_LIST_DEPTH} niveaux`);
      }
      for (const inline of inlines(block)) {
        if (inline.type === 'text') characters += inline.text.length;
      }
    }
    if (characters > MAX_CHARACTERS) {
      return fail(`Chapitre trop long (${MAX_CHARACTERS} caractères au maximum) : découpez-le`);
    }
    return { success: true, data: doc };
  } catch {
    return fail('Document illisible');
  }
}

/** Nouvel identifiant de bloc (aléatoire, 12 caractères). */
export function newBlockId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % 64]).join('');
}

export interface BlockIdOptions {
  /**
   * Version précédente du chapitre : quand deux blocs portent le même identifiant (copie
   * collée), il reste à celui dont le texte correspond au bloc d'origine.
   */
  previous?: ChapterDocument | null;
  makeId?: () => string;
}

/**
 * Donne un identifiant à chaque bloc qui n'en a pas, et un nouveau aux copies d'un doublon.
 * Les identifiants existants et uniques ne changent jamais : notes de lecture et reprise de
 * lecture restent accrochées au bon paragraphe.
 */
export function ensureBlockIds(
  doc: ChapterDocument,
  { previous = null, makeId = newBlockId }: BlockIdOptions = {},
): ChapterDocument {
  const copy = structuredClone(doc);
  const all = [...blocks(copy.content)].map(([block]) => block);
  const before = new Map<string, string>();
  if (previous) {
    for (const [block] of blocks(previous.content)) {
      const id = block.attrs?.id;
      if (id) before.set(id, blockText(block));
    }
  }
  // Pour chaque identifiant en double, le bloc qui le garde : celui dont le texte est celui
  // d'origine, à défaut le premier.
  const keeper = new Map<string, AnyBlock>();
  for (const block of all) {
    const id = block.attrs?.id;
    if (!id || !BLOCK_ID.test(id)) continue;
    const current = keeper.get(id);
    if (!current) keeper.set(id, block);
    else if (before.get(id) === blockText(block) && before.get(id) !== blockText(current)) {
      keeper.set(id, block);
    }
  }
  const seen = new Set<string>(keeper.keys());
  for (const block of all) {
    const attrs = ((block as { attrs?: { id?: string | null } }).attrs ??= {});
    if (attrs.id && keeper.get(attrs.id) === block) continue;
    let id = makeId();
    while (seen.has(id)) id = makeId();
    attrs.id = id;
    seen.add(id);
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

/** Langues écrites sans espaces entre les mots : découpage par dictionnaire (Intl.Segmenter). */
const WITHOUT_SPACES = /^(zh|ja|th|lo|km|my|bo)(-|$)/;

/**
 * Nombre de mots. Langues à espaces : compté comme un traitement de texte (suites séparées
 * par des espaces contenant une lettre ou un chiffre : « peut-être », « l'aube » = un mot).
 * Chinois, japonais, thaï… : découpage en mots selon la langue.
 */
export function wordCount(doc: ChapterDocument, language = 'fr'): number {
  const lang = language.toLowerCase();
  let segmenter: Intl.Segmenter | null = null;
  try {
    if (WITHOUT_SPACES.test(lang)) segmenter = new Intl.Segmenter(lang, { granularity: 'word' });
  } catch {
    // Code de langue invalide : découpage par espaces.
  }
  let count = 0;
  for (const [block] of blocks(doc.content)) {
    const text = blockText(block);
    if (segmenter) {
      for (const segment of segmenter.segment(text)) if (segment.isWordLike) count++;
    } else {
      for (const token of text.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(token)) count++;
    }
  }
  return count;
}

/** Temps de lecture estimé, en minutes (230 mots par minute, au moins 1). */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 230));
}

/** Document de départ : un paragraphe vide (ProseMirror exige au moins un bloc). */
export const emptyDocument = (): ChapterDocument => ({
  type: 'doc',
  content: [{ type: 'paragraph' }],
});
