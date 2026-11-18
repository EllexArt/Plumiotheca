import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { account, expectAccessible, mockApi, renderApp, signedIn } from '../../test/render';

const A = '01a102e1-0000-7000-8000-00000000000a';
const B = '01a102e1-0000-7000-8000-00000000000b';
const OP = '01a102e1-0000-7000-8000-0000000000f1';

const tag = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  normalized: name.toLowerCase().replace(/[\s-]+/g, ''),
  canonical: null,
  parent: null,
  synonyms: [],
  children: [],
  stories: 3,
  ...extra,
});
const operation = {
  id: OP,
  kind: 'merge',
  summary: '« slow-burn » rattaché comme synonyme à « Slow burn »',
  by: 'ilse',
  at: '2026-11-10T10:00:00.000Z',
  revertedAt: null,
  revertible: true,
};

/** Compte connecté, jardinier ou non. */
function garden(roles: string[], reply?: (url: string, method: string) => unknown) {
  signedIn();
  return mockApi((url, init) => {
    const method = init.method ?? 'GET';
    const custom = reply?.(url, method);
    if (custom) return custom as never;
    if (url === '/api/moi/compte') return { body: account() };
    if (url === '/api/moi/session') return { body: { roles, rolesAwaitingMfa: [], mfa: false } };
    if (url.startsWith('/api/jardinage/tags?')) {
      return {
        body: {
          items: [
            tag(A, 'Slow burn', { synonyms: [{ id: B, name: 'slow-burn' }] }),
            tag(B, 'slow-burn', { canonical: { id: A, name: 'Slow burn' }, stories: 1 }),
          ],
        },
      };
    }
    if (url.startsWith('/api/jardinage/journal?') || url === '/api/jardinage/journal') {
      return { body: { items: [operation], nextCursor: null } };
    }
    if (url.startsWith('/api/jardinage/journal/')) return { status: 204 };
    if (url.startsWith('/api/jardinage/tags/')) return { body: tag(A, 'Slow burn') };
    if (url.startsWith('/api/moi/')) return { body: { items: [], nextCursor: null, unread: 0 } };
    return undefined;
  });
}

describe('jardinage des tags (#78)', () => {
  it('sans le rôle : page réservée, pas de lien dans le menu', async () => {
    garden([]);
    renderApp('/jardinage');
    expect(await screen.findByText(/réservée aux jardiniers et jardinières/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Mon compte/ }));
    expect(screen.queryByRole('menuitem', { name: 'Jardinage des tags' })).toBeNull();
  });

  it('chercher, rattacher comme synonyme, résultat annoncé ; accessible', async () => {
    const calls = garden(['jardinage-tags']);
    renderApp('/jardinage');
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Chercher un tag' }), 'slow');
    await userEvent.click(screen.getByRole('button', { name: 'Chercher' }));
    const list = await screen.findByRole('list', { name: 'Tags trouvés pour « slow »' });
    const [canonical, synonym] = within(list).getAllByRole('listitem');
    expect(canonical).toHaveTextContent('3 histoires · synonymes : « slow-burn »');
    expect(synonym).toHaveTextContent('synonyme de « Slow burn »');
    await expectAccessible();

    await userEvent.click(within(canonical!).getByText('Modifier'));
    await userEvent.type(
      within(canonical!).getByRole('textbox', {
        name: /Rattacher comme synonyme de \(tag « Slow burn »\)/,
      }),
      'Lent',
    );
    await userEvent.click(within(canonical!).getByRole('button', { name: 'Rattacher' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')).toMatchObject({
        url: `/api/jardinage/tags/${A}/fusion`,
        body: { into: 'Lent' },
      }),
    );
    expect(
      await screen.findByText('« Slow burn » rattaché comme synonyme à « Lent ».'),
    ).toBeInstanceOf(HTMLOutputElement);
    await expectAccessible();
  });

  it('une opération refusée : le message de l’API est dit', async () => {
    garden(['jardinage-tags'], (url, method) =>
      method === 'PUT' && url.endsWith('/parent')
        ? {
            status: 409,
            body: {
              type: 'boucle-de-tags',
              title: '« Slow burn » est déjà rangé sous « slow-burn » : ce serait une boucle.',
              status: 409,
            },
          }
        : undefined,
    );
    renderApp('/jardinage');
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Chercher un tag' }), 'slow');
    await userEvent.click(screen.getByRole('button', { name: 'Chercher' }));
    const [canonical] = within(
      await screen.findByRole('list', { name: 'Tags trouvés pour « slow »' }),
    ).getAllByRole('listitem');
    await userEvent.click(within(canonical!).getByText('Modifier'));
    await userEvent.type(
      within(canonical!).getByRole('textbox', { name: /Ranger sous le tag/ }),
      'slow-burn',
    );
    await userEvent.click(within(canonical!).getByRole('button', { name: 'Ranger' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ce serait une boucle');
  });

  it('journal : annuler une opération ; le focus va au journal', async () => {
    const calls = garden(['jardinage-tags']);
    renderApp('/jardinage');
    const journal = await screen.findByRole('list', { name: 'Opérations' });
    expect(within(journal).getByText(/@ilse, le 10 novembre 2026/)).toBeInTheDocument();
    await userEvent.click(within(journal).getByRole('button', { name: /^Annuler/ }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')?.url).toBe(
        `/api/jardinage/journal/${OP}/annulation`,
      ),
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Journal' })).toHaveFocus());
  });

  it('avec le rôle : lien dans le menu du compte', async () => {
    garden(['jardinage-tags']);
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: /Mon compte/ }));
    expect(await screen.findByRole('menuitem', { name: 'Jardinage des tags' })).toHaveAttribute(
      'href',
      '/jardinage',
    );
  });
});
