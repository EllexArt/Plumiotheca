import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

describe('configuration', () => {
  it('a des valeurs par défaut sûres en développement', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      NODE_ENV: 'development',
      DB_PORT: 5433,
      DB_MIGRATE_ON_START: true,
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

  it('exige en production les réglages qui n’ont pas de valeur sûre par défaut', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(
      /CORS_ORIGINS : Obligatoire[\s\S]*DB_PASSWORD : Obligatoire[\s\S]*KEYCLOAK_ISSUER : Obligatoire[\s\S]*TRUST_PROXY : Obligatoire/,
    );
    const config = loadConfig({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://a.example',
      TRUST_PROXY: '0',
      KEYCLOAK_ISSUER: 'https://compte.plumiotheca.example/realms/plumiotheca',
      DB_PASSWORD: 'secret',
    });
    expect(config.TRUST_PROXY).toBe(0);
    expect(config.DB_MIGRATE_ON_START).toBe(false);
    expect(config.KEYCLOAK_JWKS_URL).toBe(
      'https://compte.plumiotheca.example/realms/plumiotheca/protocol/openid-connect/certs',
    );
  });

  it('lit les clés publiques par un chemin interne si demandé (conteneur)', () => {
    const config = loadConfig({
      KEYCLOAK_JWKS_URL: 'http://keycloak:8080/realms/plumiotheca/protocol/openid-connect/certs',
    });
    expect(config.KEYCLOAK_ISSUER).toBe('http://localhost:8080/realms/plumiotheca');
    expect(config.KEYCLOAK_JWKS_URL).toContain('keycloak:8080');
    expect(config.JWT_CLIENTS).toEqual(['web']);
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
