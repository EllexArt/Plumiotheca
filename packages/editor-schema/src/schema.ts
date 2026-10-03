import { z } from 'zod';

// Contenu d'un chapitre : JSON ProseMirror/TipTap, limité aux nœuds d'un texte littéraire,
// aligné sur ce que produit l'éditeur (StarterKit sans code, liens ni titre de niveau 1,
// avec alignement ; voir src/editor-contract.test.ts). Tout objet est strict : un nœud, une
// marque ou un attribut non prévu est refusé. Aucun HTML, lien ni image dans le texte.
//
// ⚠️ Ce schéma seul ne borne ni la profondeur ni la taille : passer par parseDocument().

/** Identifiant stable d'un bloc : sert aux notes de lecture, à la reprise et aux différences. */
export const BLOCK_ID = /^[A-Za-z0-9_-]{8,32}$/;
const BlockId = z.string().regex(BLOCK_ID);

const MAX_TEXT = 20_000;

export const Mark = z.strictObject({
  type: z.enum(['bold', 'italic', 'underline', 'strike']),
});
export type Mark = z.infer<typeof Mark>;

const Marks = z
  .array(Mark)
  .max(4)
  .refine((marks) => new Set(marks.map((m) => m.type)).size === marks.length, {
    message: 'Marque en double',
  })
  .optional();

export const Text = z.strictObject({
  type: z.literal('text'),
  text: z
    .string()
    .min(1)
    .max(MAX_TEXT)
    // Pas de caractère de contrôle (hors tabulation), ni de forçage du sens d'écriture
    // (U+202A à U+202E et isolats U+2066 à U+2069, procédés des textes « trompeurs ») ;
    // les marques LRM/RLM restent permises.
    .regex(/^[\t\P{Cc}]*$/u, { message: 'Caractère de contrôle interdit' })
    .regex(/^[^\u202A-\u202E\u2066-\u2069]*$/u, {
      message: 'Caractère de forçage du sens d’écriture interdit',
    })
    // Texte Unicode bien formé (pas de demi-paire isolée, que PostgreSQL refuserait).
    .regex(/^\P{Cs}*$/u, { message: 'Texte mal encodé' }),
  marks: Marks,
});

export const HardBreak = z.strictObject({ type: z.literal('hardBreak'), marks: Marks });

const Inline = z.discriminatedUnion('type', [Text, HardBreak]);
export type Inline = z.infer<typeof Inline>;

const TextAlign = z.enum(['left', 'center', 'right', 'justify']).nullable().optional();
/** L'identifiant peut manquer à la saisie (import, collage) : ensureBlockIds le complète. */
const blockAttrs = { id: BlockId.nullable().optional() };

export const Paragraph = z.strictObject({
  type: z.literal('paragraph'),
  attrs: z.strictObject({ ...blockAttrs, textAlign: TextAlign }).optional(),
  content: z.array(Inline).max(2_000).optional(),
});
export type Paragraph = z.infer<typeof Paragraph>;

export const Heading = z.strictObject({
  type: z.literal('heading'),
  // Le titre du chapitre est en dehors du texte : intertitres de niveau 2 et 3 seulement.
  attrs: z.strictObject({
    ...blockAttrs,
    level: z.union([z.literal(2), z.literal(3)]),
    textAlign: TextAlign,
  }),
  content: z.array(Inline).max(500).optional(),
});
export type Heading = z.infer<typeof Heading>;

/** Séparateur de scène (« *** »). */
export const HorizontalRule = z.strictObject({
  type: z.literal('horizontalRule'),
  attrs: z.strictObject(blockAttrs).optional(),
});
export type HorizontalRule = z.infer<typeof HorizontalRule>;

type Attrs = { id?: string | null | undefined };

export type Blockquote = { type: 'blockquote'; attrs?: Attrs | undefined; content: Block[] };
export type ListItem = {
  type: 'listItem';
  attrs?: Attrs | undefined;
  /** Comme dans l'éditeur : un paragraphe d'abord, puis d'autres blocs. */
  content: [Paragraph, ...Block[]];
};
export type List = {
  type: 'bulletList' | 'orderedList';
  attrs?:
    | (Attrs & {
        start?: number | undefined;
        type?: '1' | 'a' | 'A' | 'i' | 'I' | null | undefined;
      })
    | undefined;
  content: ListItem[];
};
export type Block = Paragraph | Heading | HorizontalRule | Blockquote | List;

// Récursifs (citation et listes) : la profondeur est bornée AVANT ce schéma par
// parseDocument(), pour qu'un document hostile ne fasse jamais déborder la pile.
export const Block: z.ZodType<Block> = z.lazy(() =>
  z.union([Paragraph, Heading, HorizontalRule, Blockquote, List]),
);

export const Blockquote: z.ZodType<Blockquote> = z.lazy(() =>
  z.strictObject({
    type: z.literal('blockquote'),
    attrs: z.strictObject(blockAttrs).optional(),
    content: z.array(Block).min(1).max(500),
  }),
);

export const ListItem: z.ZodType<ListItem> = z.lazy(() =>
  z.strictObject({
    type: z.literal('listItem'),
    attrs: z.strictObject(blockAttrs).optional(),
    content: z
      .tuple([Paragraph], Block)
      .refine((c) => c.length <= 100, { message: 'Trop de blocs' }),
  }),
);

export const List: z.ZodType<List> = z.lazy(() =>
  z.strictObject({
    type: z.enum(['bulletList', 'orderedList']),
    attrs: z
      .strictObject({
        ...blockAttrs,
        start: z.int().min(0).max(10_000).optional(),
        type: z.enum(['1', 'a', 'A', 'i', 'I']).nullable().optional(),
      })
      .optional(),
    content: z.array(ListItem).min(1).max(500),
  }),
);

/** Structure seule, sans limites de profondeur ni de taille : utiliser parseDocument(). */
export const UncheckedChapterDocument = z.strictObject({
  type: z.literal('doc'),
  content: z.array(Block).max(20_000),
});
export type ChapterDocument = { type: 'doc'; content: Block[] };
