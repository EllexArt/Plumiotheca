import type { Block, ChapterDocument, Inline } from '@plumiotheca/editor-schema';

/**
 * Éditeur simple (en attendant l'éditeur TipTap, #25) : le texte est saisi en clair.
 * Une ligne vide sépare deux paragraphes ; « ⁂ » ou « *** » seul sur sa ligne marque un
 * changement de scène ; un retour à la ligne simple reste dans le paragraphe.
 */
const SCENE = /^\s*(⁂|\*\s*\*\s*\*)\s*$/;

export function textToDocument(text: string): ChapterDocument {
  const content: Block[] = [];
  for (const chunk of text.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    if (SCENE.test(trimmed)) {
      content.push({ type: 'horizontalRule' });
      continue;
    }
    const inline: Inline[] = [];
    trimmed.split('\n').forEach((line, i) => {
      if (i > 0) inline.push({ type: 'hardBreak' });
      if (line) inline.push({ type: 'text', text: line });
    });
    content.push({ type: 'paragraph', content: inline });
  }
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

function blockText(block: Block): string {
  switch (block.type) {
    case 'horizontalRule':
      return '⁂';
    case 'paragraph':
    case 'heading':
      return (block.content ?? [])
        .map((node) => (node.type === 'text' ? node.text : '\n'))
        .join('');
    case 'blockquote':
      return block.content.map(blockText).join('\n\n');
    case 'bulletList':
    case 'orderedList':
      return block.content.map((item) => item.content.map(blockText).join('\n')).join('\n');
  }
}

/** Brouillon → texte de l'éditeur simple (la mise en forme fine n'y est pas reprise). */
export function documentToText(doc: ChapterDocument): string {
  return doc.content
    .map(blockText)
    .filter((text, i, all) => text || i < all.length - 1)
    .join('\n\n')
    .trim();
}
