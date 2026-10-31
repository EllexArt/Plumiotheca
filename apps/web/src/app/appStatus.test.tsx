import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from '../test/render';

afterEach(() => {
  vi.restoreAllMocks();
});

const goOffline = (offline: boolean) => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(!offline);
  act(() => {
    window.dispatchEvent(new Event(offline ? 'offline' : 'online'));
  });
};

describe('hors ligne (#35)', () => {
  it('le dit dans une zone annoncée, puis le retire au retour du réseau', async () => {
    mockApi(() => undefined);
    renderApp('/charte');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Vous êtes hors ligne.')).toBeNull();

    goOffline(true);
    const message = screen.getByText('Vous êtes hors ligne.');
    expect(message.closest('output')).not.toBeNull();

    goOffline(false);
    expect(screen.queryByText('Vous êtes hors ligne.')).toBeNull();
  });
});
