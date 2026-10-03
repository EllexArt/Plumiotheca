import { z } from 'zod';

// Contenu d'un chapitre : JSON ProseMirror/TipTap, limité aux nœuds d'un texte littéraire.
// Tout objet est strict : un nœud, une marque ou un attribut non prévu est refusé. Aucun
// HTML, aucun lien, aucune image dans le texte (pas de XSS, pas de spam).

/** Identifiant stable d'un bloc : sert aux notes de lecture, à la reprise et aux différences. */
export const BLOCK_ID = /^[A-Za-z0-9_-]{8,32}$/;
const BlockId = z.string().regex(BLOCK_ID);

const MAX_TEXT = 20_000;

export const Mark = z.strictObject({
  type: z.enum(['bold', 'italic', 'underline', 'strike']),
});
export type Mark = z.infer<typeof Mark>;

export const Text = z.strictObject({
  type: z.literal('text'),
  // Pas de caractère de contrôle (hors tabulation) ; ProseMirror n'émet jamais de texte vide.
  text: z
    .string()
    .min(1)
    .max(MAX_TEXT)
    .regex(/^[\t\P{Cc}]*$/u),
  marks: z
    .array(Mark)
    .max(4)
    .refine((marks) => new Set(marks.map((m) => m.type)).size === marks.length, {
      message: 'Marque en double',
    })
    .optional(),
});

export const HardBreak = z.strictObject({ type: z.literal('hardBreak') });

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

export const Blockquote = z.strictObject({
  type: z.literal('blockquote'),
  attrs: z.strictObject(blockAttrs).optional(),
  content: z.array(Paragraph).min(1).max(500),
});

/** Séparateur de scène (« *** »). */
export const HorizontalRule = z.strictObject({
  type: z.literal('horizontalRule'),
  attrs: z.strictObject(blockAttrs).optional(),
});

export type ListItem = {
  type: 'listItem';
  attrs?: { id?: string | null | undefined } | undefined;
  content: (Paragraph | List)[];
};
export type List = {
  type: 'bulletList' | 'orderedList';
  attrs?: { id?: string | null | undefined; start?: number | undefined } | undefined;
  content: ListItem[];
};

export const ListItem: z.ZodType<ListItem> = z.lazy(() =>
  z.strictObject({
    type: z.literal('listItem'),
    attrs: z.strictObject(blockAttrs).optional(),
    content: z
      .array(z.union([Paragraph, List]))
      .min(1)
      .max(100),
  }),
);

export const List: z.ZodType<List> = z.lazy(() =>
  z.strictObject({
    type: z.enum(['bulletList', 'orderedList']),
    attrs: z
      .strictObject({ ...blockAttrs, start: z.int().min(0).max(10_000).optional() })
      .optional(),
    content: z.array(ListItem).min(1).max(500),
  }),
);

export const Block = z.union([Paragraph, Heading, Blockquote, HorizontalRule, List]);
export type Block = z.infer<typeof Block>;

export const ChapterDocument = z.strictObject({
  type: z.literal('doc'),
  content: z.array(Block).max(20_000),
});
export type ChapterDocument = z.infer<typeof ChapterDocument>;
