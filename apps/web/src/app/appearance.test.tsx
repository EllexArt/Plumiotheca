import { readdirSync, readFileSync } from 'node:fs';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { account, expectAccessible, mockApi, renderApp, signedIn } from '../test/render';
import { PALETTES } from './palettes';

const html = document.documentElement;

describe('ambiances (#77)', () => {
  it('une ambiance = un fichier de jetons, nommé dans la liste', () => {
    const files = readdirSync('src/styles/palettes').map((f) => f.replace(/\.css$/, ''));
    expect(files.sort()).toEqual(PALETTES.map((p) => p.id).sort());
  });

  it('appliquée avant le premier affichage (public/theme.js) : aucun flash', () => {
    localStorage.setItem('plumiotheca.ambiance', 'indigo');
    localStorage.setItem('plumiotheca.theme', 'dark');
    new Function(readFileSync('public/theme.js', 'utf8'))();
    expect(html.dataset.palette).toBe('indigo');
    expect(html.dataset.theme).toBe('dark');
  });

  it('paramètres : ambiance et mode appliqués aussitôt et gardés sur le compte ; accessible', async () => {
    signedIn();
    const calls = mockApi((url, init) => {
      if (url === '/api/moi/compte' && (init.method ?? 'GET') === 'GET') return { body: account() };
      if (url === '/api/moi/compte/apparence') {
        return { body: account({ appearance: JSON.parse(String(init.body)) as unknown }) };
      }
      return undefined;
    });
    renderApp('/compte');
    const group = await screen.findByRole('group', { name: 'Ambiance' });
    await userEvent.click(within(group).getByRole('radio', { name: /Bougie/ }));
    expect(html.dataset.palette).toBe('bougie');
    expect(localStorage.getItem('plumiotheca.ambiance')).toBe('bougie');
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Mode' })).getByRole('radio', { name: 'Sombre' }),
    );
    expect(html.dataset.theme).toBe('dark');
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'PUT').at(-1)?.body).toEqual({
        palette: 'bougie',
        mode: 'dark',
      }),
    );
    await expectAccessible();
  });

  it('autre appareil : l’apparence du compte s’applique dès qu’il est chargé', async () => {
    signedIn();
    mockApi((url) =>
      url === '/api/moi/compte'
        ? { body: account({ appearance: { palette: 'rouille', mode: 'dark' } }) }
        : undefined,
    );
    renderApp('/compte');
    await waitFor(() => expect(html.dataset.palette).toBe('rouille'));
    expect(html.dataset.theme).toBe('dark');
    expect(localStorage.getItem('plumiotheca.ambiance')).toBe('rouille');
  });
});
