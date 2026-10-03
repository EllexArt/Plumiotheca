import type { Block, ChapterDocument, Inline } from '@plumiotheca/editor-schema';
import type { CSSProperties, ReactNode } from 'react';
import styles from './ChapterContent.module.css';

const align = (attrs?: { textAlign?: string | null }): CSSProperties | undefined =>
  attrs?.textAlign && attrs.textAlign !== 'left'
    ? { textAlign: attrs.textAlign as CSSProperties['textAlign'] }
    : undefined;

function inline(nodes: Inline[] | undefined): ReactNode {
  return nodes?.map((node, i) => {
    if (node.type === 'hardBreak') return <br key={i} />;
    let content: ReactNode = node.text;
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') content = <strong>{content}</strong>;
      else if (mark.type === 'italic') content = <em>{content}</em>;
      else if (mark.type === 'underline') content = <u>{content}</u>;
      else if (mark.type === 'strike') content = <s>{content}</s>;
    }
    return <span key={i}>{content}</span>;
  });
}

function block(node: Block, key: number): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return (
        <p key={key} id={node.attrs?.id ?? undefined} style={align(node.attrs)}>
          {inline(node.content)}
        </p>
      );
    case 'heading': {
      // Le titre du chapitre est le h1 : niveaux 2 et 3 dans le texte.
      const Tag = node.attrs.level === 2 ? 'h2' : 'h3';
      return (
        <Tag key={key} id={node.attrs.id ?? undefined} style={align(node.attrs)}>
          {inline(node.content)}
        </Tag>
      );
    }
    case 'horizontalRule':
      // Séparateur de scène : vrai séparateur (annoncé), « ⁂ » dessiné en CSS.
      return <hr key={key} aria-label="Changement de scène" className={styles.scene} />;
    case 'blockquote':
      return (
        <blockquote key={key} id={node.attrs?.id ?? undefined}>
          {node.content.map(block)}
        </blockquote>
      );
    case 'bulletList':
      return (
        <ul key={key} id={node.attrs?.id ?? undefined}>
          {node.content.map((item, i) => (
            <li key={i}>{item.content.map(block)}</li>
          ))}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={key} id={node.attrs?.id ?? undefined} start={node.attrs?.start}>
          {node.content.map((item, i) => (
            <li key={i}>{item.content.map(block)}</li>
          ))}
        </ol>
      );
  }
}

/**
 * Texte d'un chapitre (document TipTap validé par l'API) rendu en éléments React : jamais
 * de HTML brut. Les identifiants de blocs servent d'ancres (reprise de lecture, notes).
 */
export function ChapterContent({ doc }: { doc: ChapterDocument }) {
  return <div className={styles.content}>{doc.content.map(block)}</div>;
}
