import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

describe('configuration', () => {
  it('a des valeurs par défaut sûres en développement', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      TRUST_PROXY: 0,
    });
    expect(config.CORS_ORIGINS).toContain('http://localhost:5173');
  });

  it('lit les origines CORS séparées par des virgules', () => {
    const config = loadConfig({ CORS_ORIGINS: 'https://a.example, https://b.example:8443' });
    expect(config.CORS_ORIGINS).toEqual(['https://a.example', 'https://b.example:8443']);
  });

  it('refuse une origine avec un chemin', () => {
    expect(() => loadConfig({ CORS_ORIGINS: 'https://a.example/app' })).toThrow(/CORS_ORIGINS/);
  });

  it('exige les origines CORS et le nombre de proxys en production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(
      /CORS_ORIGINS : Obligatoire en production[\s\S]*TRUST_PROXY : Obligatoire en production/,
    );
    expect(
      loadConfig({ NODE_ENV: 'production', CORS_ORIGINS: 'https://a.example', TRUST_PROXY: '0' })
        .TRUST_PROXY,
    ).toBe(0);
  });

  it('nomme la variable en cause sans afficher sa valeur', () => {
    const secret = 'pas-un-port-mais-un-secret';
    let message = '';
    try {
      loadConfig({ PORT: secret });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/PORT/);
    expect(message).not.toContain(secret);
  });
});
