import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { account, expectAccessible, mockApi, renderApp, signedIn } from '../../test/render';

const STORY = '01a102e1-bc65-7d35-b6b2-50377a7804f7';
const CHAPTER = '01a102e1-bc65-7d35-b6b2-50377a7804f8';
const notification = (id: string, read: boolean, number = 2) => ({
  id,
  kind: 'new_chapter',
  createdAt: '2026-10-20T10:00:00.000Z',
  read,
  story: { id: STORY, title: 'Le phare', language: 'fr' },
  chapter: { id: CHAPTER, number, title: 'La tempête' },
});
const N1 = '01a102e1-0000-7000-8000-000000000001';
const N2 = '01a102e1-0000-7000-8000-000000000002';

/** Compte connecté avec ces notifications (et ce nombre de non lues). */
function withNotifications(items: unknown[], unread: number) {
  signedIn();
  return mockApi((url, init) => {
    const method = init.method ?? 'GET';
    if (url === '/api/moi/compte' && method === 'GET') return { body: account() };
    if (url === '/api/moi/compte/notifications') {
      return { body: { ...account(), emailDigest: 'weekly' } };
    }
    if (url === '/api/moi/notifications/non-lues') return { body: { unread } };
    if (url === '/api/moi/notifications') return { body: { items, nextCursor: null } };
    if (method === 'POST' && url.startsWith('/api/moi/notifications/')) return { status: 204 };
    if (url.startsWith('/api/histoires')) return { status: 404 };
    return undefined;
  });
}

describe('notifications (#33)', () => {
  it('en-tête : lien vers les notifications, avec le nombre de non lues dit en toutes lettres', async () => {
    withNotifications([], 3);
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(
      await within(nav).findByRole('link', { name: 'Notifications (3 non lues)' }),
    ).toHaveAttribute('href', '/notifications');
  });

  it('sans compte : pas de lien', async () => {
    mockApi(() => undefined);
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    await within(nav).findByRole('link', { name: 'Mes lectures' });
    expect(within(nav).queryByRole('link', { name: /Notifications/ })).toBeNull();
  });

  it('page : non lues signalées ; ouvrir un chapitre le marque lu ; tout marquer comme lu ; accessible', async () => {
    const calls = withNotifications([notification(N1, false), notification(N2, true, 1)], 1);
    const { router } = renderApp('/notifications');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Notifications' }),
    ).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Mes notifications' });
    const [unread, read] = within(list).getAllByRole('listitem');
    expect(unread).toHaveTextContent('Non lue');
    expect(read).not.toHaveTextContent('Non lue');
    expect(screen.getByText('1 notification non lue')).toBeInstanceOf(HTMLOutputElement);
    await expectAccessible();

    const all = screen.getByRole('button', { name: 'Tout marquer comme lu' });
    await userEvent.click(all);
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/tout-lu'))).toBe(true),
    );
    expect(all).toBeInTheDocument();

    await userEvent.click(within(unread!).getByRole('link', { name: 'Chapitre 2 : La tempête' }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.url.endsWith(`/${N1}/lue`))).toBe(true),
    );
    expect(router.state.location.pathname).toBe(`/histoires/${STORY}/chapitres/${CHAPTER}`);
  });

  it('aucune notification : le dire, avec le lien vers Mes lectures', async () => {
    withNotifications([], 0);
    renderApp('/notifications');
    expect(await screen.findByText(/Aucune notification pour l’instant/)).toBeInTheDocument();
    expect(screen.getByText('Tout est lu.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tout marquer comme lu' })).toBeNull();
  });

  it('e-mail récapitulatif : jamais par défaut ; un choix est enregistré aussitôt', async () => {
    const calls = withNotifications([], 0);
    renderApp('/notifications');
    const group = await screen.findByRole('group', { name: 'Recevoir un e-mail récapitulatif' });
    expect(within(group).getByRole('radio', { name: /Jamais/ })).toBeChecked();
    await userEvent.click(within(group).getByRole('radio', { name: /Chaque semaine/ }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')).toMatchObject({
        url: '/api/moi/compte/notifications',
        body: { emailDigest: 'weekly' },
      }),
    );
    await waitFor(() =>
      expect(within(group).getByRole('radio', { name: /Chaque semaine/ })).toBeChecked(),
    );
  });
});
