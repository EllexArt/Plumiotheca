import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { account, expectAccessible, mockApi, renderApp, signedIn } from '../../test/render';

const SEARCH = '01a102e1-0000-7000-8000-0000000000aa';
const STORY = '01a102e1-bc65-7d35-b6b2-50377a7804f7';
const NOTIF = '01a102e1-0000-7000-8000-0000000000bb';
const saved = (extra: Record<string, unknown> = {}) => ({
  id: SEARCH,
  name: 'marée',
  query: 'q=mar%C3%A9e&tags=fantasy',
  alerts: true,
  createdAt: '2026-11-20T10:00:00.000Z',
  ...extra,
});

/** Compte connecté ; recherches, listes et notifications simulées. */
function api(extra?: (url: string, method: string) => unknown) {
  signedIn();
  return mockApi((url, init) => {
    const method = init.method ?? 'GET';
    const custom = extra?.(url, method);
    if (custom) return custom as never;
    if (url === '/api/moi/compte') return { body: account() };
    if (url === '/api/moi/recherches' && method === 'POST') return { status: 201, body: saved() };
    if (url === '/api/moi/recherches') return { body: { items: [saved()] } };
    if (url.startsWith('/api/moi/recherches/') && method === 'DELETE') return { status: 204 };
    if (url.startsWith('/api/moi/recherches/')) return { body: saved({ alerts: false }) };
    if (url === '/api/moi/notifications/non-lues') return { body: { unread: 1 } };
    if (url.startsWith('/api/recherche?') || url.startsWith('/api/histoires?')) {
      return { body: { items: [], nextCursor: null, nextPage: null, total: 0 } };
    }
    if (url.startsWith('/api/moi/') || url.startsWith('/api/selections?')) {
      return { body: { items: [], nextCursor: null } };
    }
    return undefined;
  });
}

describe('recherches enregistrées (#80)', () => {
  it('Explorer : enregistrer la recherche en cours, nom proposé, alerte cochée ; accessible', async () => {
    const calls = api();
    renderApp('/?q=mar%C3%A9e&tags=fantasy');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Enregistrer cette recherche' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Enregistrer cette recherche' });
    expect(within(dialog).getByRole('textbox', { name: /Nom de la recherche/ })).toHaveValue(
      'marée · fantasy',
    );
    expect(within(dialog).getByRole('checkbox', { name: /M’alerter/ })).toBeChecked();
    await expectAccessible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')).toMatchObject({
        url: '/api/moi/recherches',
        body: { name: 'marée · fantasy', query: 'q=mar%C3%A9e&tags=fantasy', alerts: true },
      }),
    );
    expect(await screen.findByText(/Recherche « marée » enregistrée\./)).toBeInTheDocument();
  });

  it('sans recherche ou sans compte : pas de bouton', async () => {
    api();
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Explorer' });
    expect(screen.queryByRole('button', { name: 'Enregistrer cette recherche' })).toBeNull();
  });

  it('Mes lectures : rouvrir, alerte en un clic, supprimer (focus sur la section)', async () => {
    const calls = api();
    renderApp('/mes-lectures');
    const list = await screen.findByRole('list', { name: 'Mes recherches enregistrées' });
    expect(within(list).getByRole('link', { name: 'marée' })).toHaveAttribute(
      'href',
      '/?q=mar%C3%A9e&tags=fantasy',
    );
    await userEvent.click(
      within(list).getByRole('checkbox', {
        name: 'M’alerter des nouvelles histoires pour « marée »',
      }),
    );
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({
        url: `/api/moi/recherches/${SEARCH}`,
        body: { alerts: false },
      }),
    );
    await userEvent.click(within(list).getByRole('button', { name: 'Supprimer « marée »' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Mes recherches' })).toHaveFocus(),
    );
  });

  it('notification : nouvelles histoires pour la recherche ; « Ne plus m’alerter » en un clic', async () => {
    const calls = api((url) =>
      url === '/api/moi/notifications'
        ? {
            body: {
              items: [
                {
                  id: NOTIF,
                  kind: 'saved_search',
                  createdAt: '2026-11-23T07:23:00.000Z',
                  read: false,
                  search: { id: SEARCH, name: 'marée', query: 'q=mar%C3%A9e', alerts: true },
                  count: 4,
                  stories: [{ id: STORY, title: 'La bibliothèque engloutie', language: 'fr' }],
                },
              ],
              nextCursor: null,
            },
          }
        : undefined,
    );
    renderApp('/notifications');
    const list = await screen.findByRole('list', { name: 'Mes notifications' });
    expect(list).toHaveTextContent(
      '4 nouvelles histoires pour « marée » : La bibliothèque engloutie…',
    );
    expect(within(list).getByRole('link', { name: '4 nouvelles histoires' })).toHaveAttribute(
      'href',
      '/?q=mar%C3%A9e',
    );
    await expectAccessible();
    await userEvent.click(
      within(list).getByRole('button', { name: 'Ne plus m’alerter pour « marée »' }),
    );
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ body: { alerts: false } }),
    );
  });
});
