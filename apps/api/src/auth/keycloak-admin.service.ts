import { Inject, Injectable } from '@nestjs/common';
import { CONFIG } from '../config/config.module.js';
import type { Config } from '../config/env.js';

/**
 * Accès d'administration à Keycloak par le compte de service de l'API (client
 * « api-administration », droit manage-users seulement). Adresse du serveur : celle des clés
 * publiques (KEYCLOAK_JWKS_URL), qui peut être une adresse interne (conteneur) ; nom du
 * realm : celui de l'émetteur.
 */
@Injectable()
export class KeycloakAdminService {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(@Inject(CONFIG) private readonly config: Config) {}

  private get server(): string {
    return this.config.KEYCLOAK_JWKS_URL.slice(
      0,
      this.config.KEYCLOAK_JWKS_URL.indexOf('/realms/'),
    );
  }

  private get realm(): string {
    return encodeURIComponent(new URL(this.config.KEYCLOAK_ISSUER).pathname.split('/').at(-1)!);
  }

  /** Jeton du compte de service, réutilisé jusqu'à 30 s de son expiration. */
  private async accessToken(): Promise<string> {
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
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return this.token.value;
  }

  /** Supprime un compte Keycloak ; un compte déjà absent compte comme supprimé. */
  async deleteUser(keycloakId: string): Promise<void> {
    const res = await fetch(
      `${this.server}/admin/realms/${this.realm}/users/${encodeURIComponent(keycloakId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${await this.accessToken()}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`Keycloak : suppression du compte refusée (${res.status})`);
    }
  }
}
