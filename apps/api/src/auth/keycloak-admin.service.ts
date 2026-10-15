import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { CONFIG } from '../config/config.module.js';
import type { Config } from '../config/env.js';

const TokenResponse = z.object({ access_token: z.string().min(1), expires_in: z.number() });

/**
 * Accès d'administration à Keycloak par le compte de service de l'API (client
 * « api-administration »). Aucun rôle d'administration : une permission fine « gérer les
 * utilisateurs » (FGAP v2), qui permet de désactiver, déconnecter et supprimer un compte,
 * mais ni de lister les comptes ni d'attribuer un rôle (infra/scripts/keycloak-service.mjs).
 *
 * Adresse du serveur : celle des clés publiques (KEYCLOAK_JWKS_URL, qui peut être une
 * adresse interne, la console d'administration n'étant pas exposée) ; realm : celui de
 * l'émetteur. Les deux contiennent « /realms/<realm> » (vérifié au chargement de la config).
 */
@Injectable()
export class KeycloakAdminService {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(@Inject(CONFIG) private readonly config: Config) {}

  private get server(): string {
    const url = this.config.KEYCLOAK_JWKS_URL;
    return url.slice(0, url.indexOf('/realms/'));
  }

  private get realm(): string {
    return encodeURIComponent(new URL(this.config.KEYCLOAK_ISSUER).pathname.split('/').at(-1)!);
  }

  get configured(): boolean {
    return Boolean(this.config.KEYCLOAK_ADMIN_CLIENT_SECRET);
  }

  /** Jeton du compte de service, réutilisé jusqu'à 30 s de son expiration. */
  async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const secret = this.config.KEYCLOAK_ADMIN_CLIENT_SECRET;
    if (!secret) throw new Error('Compte de service Keycloak non configuré');
    const res = await fetch(`${this.server}/realms/${this.realm}/protocol/openid-connect/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.KEYCLOAK_ADMIN_CLIENT_ID,
        client_secret: secret,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Keycloak : jeton du compte de service refusé (${res.status})`);
    const body = TokenResponse.safeParse(await res.json());
    if (!body.success) throw new Error('Keycloak : réponse de jeton inattendue');
    this.token = {
      value: body.data.access_token,
      expiresAt: Date.now() + body.data.expires_in * 1000,
    };
    return this.token.value;
  }

  /** Appel à l'API d'administration ; un 401 (secret changé, jeton révoqué) : jeton neuf, une fois. */
  private async call(method: string, path: string, body?: unknown): Promise<Response> {
    const send = async () =>
      fetch(`${this.server}/admin/realms/${this.realm}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${await this.accessToken()}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    const res = await send();
    if (res.status !== 401) return res;
    this.token = null;
    return send();
  }

  /**
   * Désactive un compte et ferme ses sessions : plus de nouveau jeton (première étape de la
   * suppression). Un compte déjà absent compte comme fait.
   */
  async disableUser(keycloakId: string): Promise<void> {
    const id = encodeURIComponent(keycloakId);
    const disabled = await this.call('PUT', `/users/${id}`, { enabled: false });
    if (disabled.status === 404) return;
    if (!disabled.ok) throw new Error(`Keycloak : désactivation refusée (${disabled.status})`);
    const out = await this.call('POST', `/users/${id}/logout`);
    if (!out.ok && out.status !== 404) {
      throw new Error(`Keycloak : déconnexion refusée (${out.status})`);
    }
  }

  /** Supprime un compte ; un compte déjà absent compte comme supprimé. */
  async deleteUser(keycloakId: string): Promise<void> {
    const res = await this.call('DELETE', `/users/${encodeURIComponent(keycloakId)}`);
    if (!res.ok && res.status !== 404) {
      throw new Error(`Keycloak : suppression du compte refusée (${res.status})`);
    }
  }
}
