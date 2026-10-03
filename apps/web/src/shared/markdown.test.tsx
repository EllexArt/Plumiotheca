import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from './markdown';

describe('Markdown', () => {
  it('titres décalés, paragraphes, gras, italique, listes', () => {
    render(<Markdown source={'## Un\n\n**1.1** Texte *doux*.\n\n- a\n- b'} headingOffset={1} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Un' })).toBeInTheDocument();
    expect(screen.getByText('1.1').tagName).toBe('STRONG');
    expect(screen.getByText('doux').tagName).toBe('EM');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('jamais de HTML brut ni de lien dangereux', () => {
    const { container } = render(
      <Markdown
        source={'<img src=x onerror=alert(1)> [piège](javascript:alert(1)) [aide](/aide)'}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/<img/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'piège' })).toBeNull();
    expect(screen.getByRole('link', { name: 'aide' })).toHaveAttribute('href', '/aide');
  });
});
