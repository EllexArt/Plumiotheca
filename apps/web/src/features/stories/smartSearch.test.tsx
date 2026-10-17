import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectAccessible, mockApi, renderApp } from '../../test/render';
import { parseSearch, typing } from './searchSyntax';

const STORY = '01a102e1-bc65-7d35-b6b2-50377a7804f7';
const suggestions = {
  tags: [
    { name: 'Éphémère', stories: 12 },
    { name: 'Angst', stories: 1 },
  ],
  stories: [
    {
      id: STORY,
      title: 'La bibliothèque engloutie',
      language: 'fr',
      author: { handle: 'Ilse.Varenne', displayName: 'Ilse Varenne' },
    },
  ],
  authors: [{ handle: 'ilse', displayName: null }],
};

const paramsOf = (search: string) => Object.fromEntries(new URLSearchParams(search));

/** Explorer, avec des suggestions et des listes vides. */
function explore(path = '/') {
  const calls = mockApi((url) => {
    if (url.startsWith('/api/recherche/suggestions?')) return { body: suggestions };
    if (url.startsWith('/api/histoires?') || url.startsWith('/api/recherche?')) {
      return { body: { items: [], nextCursor: null, nextPage: null, total: 0 } };
    }
    if (url.startsWith('/api/selections?')) return { body: { items: [], nextCursor: null } };
    return undefined;
  });
  return { calls, ...renderApp(path) };
}

describe('syntaxe de la saisie (#31)', () => {
  it('« -tag » et « -"tag en plusieurs mots" » excluent ; le reste est cherché', () => {
    expect(parseSearch('dragons -angst -"slow burn" mer')).toEqual({
      text: 'dragons mer',
      sans: ['angst', 'slow burn'],
    });
    // Un tiret dans un mot n'est pas une exclusion.
    expect(parseSearch('slow-burn')).toEqual({ text: 'slow-burn', sans: [] });
  });

  it('fragment en cours : une exclusion commencée, sinon le texte cherché', () => {
    expect(typing('dragons -ang')).toEqual({ exclude: true, fragment: 'ang', rest: 'dragons' });
    expect(typing('mer -"slow b')).toEqual({ exclude: true, fragment: 'slow b', rest: 'mer' });
    expect(typing('dragons -angst ')).toEqual({
      exclude: false,
      fragment: 'dragons',
      rest: '-angst',
    });
  });
});

describe('barre de recherche intelligente (#31)', () => {
  it('suggestions groupées pendant la frappe, au clavier ; un tag choisi devient un filtre', async () => {
    const { calls, router } = explore();
    const field = await screen.findByRole('combobox', { name: 'Rechercher une histoire' });
    // Aucun appel avant la saisie.
    expect(calls.some((c) => c.url.includes('suggestions'))).toBe(false);
    await userEvent.type(field, 'ephem');

    const list = await screen.findByRole('listbox', { name: 'Suggestions' });
    expect(field).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('4 suggestions')).toBeInstanceOf(HTMLOutputElement);
    expect(
      within(list)
        .getAllByRole('group')
        .map((g) => g.getAttribute('aria-labelledby') && within(g).getAllByRole('option').length),
    ).toEqual([2, 1, 1]);
    expect(within(list).getByRole('group', { name: 'Tags' })).toBeInTheDocument();
    expect(within(list).getByRole('group', { name: 'Autrices et auteurs' })).toBeInTheDocument();
    await waitFor(() =>
      expect(
        paramsOf(calls.findLast((c) => c.url.includes('suggestions'))!.url.split('?')[1]!),
      ).toEqual({ q: 'ephem' }),
    );
    await expectAccessible();

    await userEvent.keyboard('{ArrowDown}');
    const first = within(list).getByRole('option', { name: /Avec le tag « Éphémère »/ });
    expect(field).toHaveAttribute('aria-activedescendant', first.id);
    expect(first).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Enter}');

    await waitFor(() =>
      expect(paramsOf(router.state.location.search)).toEqual({ tags: 'Éphémère' }),
    );
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
  });

  it('« -ang » : propose d’exclure un tag ; Échap ferme la liste', async () => {
    const { router } = explore();
    const field = await screen.findByRole('combobox', { name: 'Rechercher une histoire' });
    await userEvent.type(field, 'dragons -ang');
    const list = await screen.findByRole('listbox', { name: 'Suggestions' });
    // Une exclusion en cours ne propose que des tags.
    expect(within(list).getAllByRole('group')).toHaveLength(1);
    await userEvent.click(within(list).getByRole('option', { name: /Sans le tag « Angst »/ }));
    await waitFor(() =>
      expect(paramsOf(router.state.location.search)).toEqual({ q: 'dragons', sans: 'Angst' }),
    );

    await userEvent.type(screen.getByRole('combobox'), ' mer');
    await screen.findByRole('listbox', { name: 'Suggestions' });
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  });

  it('exclusions tapées : passées dans les filtres à la recherche', async () => {
    const { router } = explore();
    const field = await screen.findByRole('combobox', { name: 'Rechercher une histoire' });
    await userEvent.type(field, 'dragons -angst -"slow burn"{Enter}');
    await waitFor(() =>
      expect(paramsOf(router.state.location.search)).toEqual({
        q: 'dragons',
        sans: 'angst,slow burn',
      }),
    );
    expect(screen.getByRole('combobox')).toHaveValue('dragons');
  });

  it('une histoire ou une personne suggérée ouvre sa page', async () => {
    const { router } = explore();
    await userEvent.type(await screen.findByRole('combobox'), 'ilse');
    await userEvent.click(
      await screen.findByRole('option', { name: /La bibliothèque engloutie par Ilse Varenne/ }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe(`/histoires/${STORY}`));
  });
});
