import { Fragment, type ReactNode } from 'react';

/**
 * Rendu d'un Markdown simple et de confiance (textes de Plumiotheca : charte, aide) :
 * titres, paragraphes, listes, **gras**, *italique*, [liens](https://…). Construit des
 * éléments React, jamais du HTML brut : rien ne peut s'injecter dans la page.
 *
 * `headingOffset` décale les niveaux (« # » devient h2 quand la page a déjà son h1).
 */
export function Markdown({
  source,
  headingOffset = 0,
}: {
  source: string;
  headingOffset?: number;
}) {
  const blocks = source.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const text = block.trim();
        if (!text) return null;
        const heading = /^(#{1,4})\s+(.*)$/s.exec(text);
        if (heading) {
          const level = Math.min(6, heading[1]!.length + headingOffset);
          const Tag = `h${level}` as 'h2';
          return <Tag key={i}>{inline(heading[2]!)}</Tag>;
        }
        const lines = text.split('\n');
        if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
          return (
            <ul key={i}>
              {lines.map((line, j) => (
                <li key={j}>{inline(line.replace(/^\s*[-*]\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{inline(lines.join(' '))}</p>;
      })}
    </>
  );
}

const TOKEN = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Liens permis : pages du site ou adresses https (jamais javascript:, data:…). */
const safeHref = (href: string) => (/^(https:\/\/|\/(?!\/)|#)/.test(href) ? href : undefined);

function inline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    parts.push(text.slice(last, match.index));
    const [, bold, italic, label, href] = match;
    if (bold !== undefined) parts.push(<strong key={match.index}>{inline(bold)}</strong>);
    else if (italic !== undefined) parts.push(<em key={match.index}>{inline(italic)}</em>);
    else {
      const url = safeHref(href!);
      parts.push(
        url ? (
          <a key={match.index} href={url}>
            {label}
          </a>
        ) : (
          label
        ),
      );
    }
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return parts.map((part, i) => <Fragment key={i}>{part}</Fragment>);
}
