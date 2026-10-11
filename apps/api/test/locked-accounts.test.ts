import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { LockedAccountsService } from '../src/account/locked-accounts.service.js';
import { KeycloakAdminService } from '../src/auth/keycloak-admin.service.js';
import { User } from '../src/users/user.entity.js';
import { readyToken, start, token } from './support.js';

const DAY = 24 * 3_600_000;
const HOUR = 3_600_000;

/** Compte verrouillé par l'accueil (« moins de 15 ans »), daté de `daysAgo` jours avant `now`. */
async function lockedAccount(ctx: Awaited<ReturnType<typeof start>>, daysAgo: number, now: Date) {
  const sub = randomUUID();
  await ctx.http
    .post('/api/moi/compte/premiere-visite')
    .set('Authorization', `Bearer ${await token({ sub })}`)
    .send({ age: 'under-15' })
    .expect(403);
  const users = ctx.app.get(DataSource).getRepository(User);
  const user = await users.findOneByOrFail({ keycloakId: sub });
  // Le verrouillage est daté par l'accueil lui-même.
  expect(user.ageLockedAt).toBeInstanceOf(Date);
  await users.update(user.id, { ageLockedAt: new Date(now.getTime() - daysAgo * DAY) });
  return user;
}

/** Base partagée entre les tests : chaque test part sans compte verrouillé. */
async function fresh() {
  const ctx = await start();
  await ctx.app.get(DataSource).getRepository(User).delete({ ageBand: 'under-15' });
  return ctx;
}

function keycloak(ctx: Awaited<ReturnType<typeof start>>) {
  const service = ctx.app.get(KeycloakAdminService);
  return {
    disable: vi.spyOn(service, 'disableUser').mockResolvedValue(undefined),
    remove: vi.spyOn(service, 'deleteUser').mockResolvedValue(undefined),
  };
}

describe('comptes verrouillés (moins de 15 ans)', () => {
  it('en deux temps : désactivé après 30 jours, supprimé au moins une heure après ; les autres restent', async () => {
    const ctx = await fresh();
    const now = new Date();
    const old = await lockedAccount(ctx, 31, now);
    const recent = await lockedAccount(ctx, 29, now);
    const readySub = randomUUID();
    await readyToken(ctx.app, { sub: readySub });
    const kc = keycloak(ctx);
    const purge = (at: Date) => ctx.app.get(LockedAccountsService).purge(at);
    const users = ctx.app.get(DataSource).getRepository(User);

    // 1re nuit : désactivation seulement, la ligne reste (le refus reste mémorisé).
    expect(await purge(now)).toEqual({ disabled: 1, deleted: 0, failed: 0 });
    expect(kc.disable).toHaveBeenCalledExactlyOnceWith(old.keycloakId);
    expect(kc.remove).not.toHaveBeenCalled();
    expect((await users.findOneByOrFail({ id: old.id })).agePurgeStartedAt).toEqual(now);

    // Moins d'une heure après : des jetons pourraient encore être valides, rien ne bouge.
    expect(await purge(new Date(now.getTime() + 30 * 60_000))).toEqual({
      disabled: 0,
      deleted: 0,
      failed: 0,
    });

    // Nuit suivante : suppression dans Keycloak puis dans la base.
    expect(await purge(new Date(now.getTime() + 2 * HOUR))).toEqual({
      disabled: 0,
      deleted: 1,
      failed: 0,
    });
    expect(kc.remove).toHaveBeenCalledExactlyOnceWith(old.keycloakId);
    expect(await users.findOneBy({ id: old.id })).toBeNull();
    expect(await users.findOneBy({ id: recent.id })).not.toBeNull();
    expect(await users.findOneBy({ keycloakId: readySub })).not.toBeNull();
    expect(kc.disable).toHaveBeenCalledTimes(1);
  });

  it('un compte en échec n’arrête pas les autres ; la tâche le signale', async () => {
    const ctx = await fresh();
    const now = new Date();
    const first = await lockedAccount(ctx, 45, now);
    const second = await lockedAccount(ctx, 40, now);
    const kc = keycloak(ctx);
    kc.disable.mockImplementation((id) =>
      id === first.keycloakId
        ? Promise.reject(new Error('Keycloak : désactivation refusée (503)'))
        : Promise.resolve(),
    );
    expect(await ctx.app.get(LockedAccountsService).purge(now)).toEqual({
      disabled: 1,
      deleted: 0,
      failed: 1,
    });
    const users = ctx.app.get(DataSource).getRepository(User);
    expect((await users.findOneByOrFail({ id: first.id })).agePurgeStartedAt).toBeNull();
    expect((await users.findOneByOrFail({ id: second.id })).agePurgeStartedAt).not.toBeNull();
  });

  it('suppression refusée par Keycloak : la ligne reste, pour le passage suivant', async () => {
    const ctx = await fresh();
    const now = new Date();
    const old = await lockedAccount(ctx, 40, now);
    const kc = keycloak(ctx);
    const purge = (at: Date) => ctx.app.get(LockedAccountsService).purge(at);
    await purge(now);
    kc.remove.mockRejectedValueOnce(new Error('Keycloak : suppression du compte refusée (503)'));
    expect((await purge(new Date(now.getTime() + 2 * HOUR))).failed).toBe(1);
    const users = ctx.app.get(DataSource).getRepository(User);
    expect(await users.findOneBy({ id: old.id })).not.toBeNull();
    expect((await purge(new Date(now.getTime() + 26 * HOUR))).deleted).toBe(1);
    expect(await users.findOneBy({ id: old.id })).toBeNull();
  });

  it('la base refuse une date sans verrouillage, et un verrouillage sans date', async () => {
    const ctx = await fresh();
    const now = new Date();
    const old = await lockedAccount(ctx, 2, now);
    const users = ctx.app.get(DataSource).getRepository(User);
    await expect(users.update(old.id, { ageLockedAt: null })).rejects.toThrow(
      /users_locked_has_date/,
    );
    const readySub = randomUUID();
    await readyToken(ctx.app, { sub: readySub });
    const ready = await users.findOneByOrFail({ keycloakId: readySub });
    await expect(users.update(ready.id, { ageLockedAt: now })).rejects.toThrow(
      /users_locked_has_date/,
    );
    await expect(users.update(ready.id, { agePurgeStartedAt: now })).rejects.toThrow(
      /users_locked_has_date/,
    );
  });
});
