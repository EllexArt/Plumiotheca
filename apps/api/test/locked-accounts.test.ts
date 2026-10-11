import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { LockedAccountsService } from '../src/account/locked-accounts.service.js';
import { KeycloakAdminService } from '../src/auth/keycloak-admin.service.js';
import { User } from '../src/users/user.entity.js';
import { readyToken, start, token } from './support.js';

const DAY = 24 * 3_600_000;

/** Compte verrouillé par l'accueil (« moins de 15 ans »), daté de `daysAgo` jours. */
async function lockedAccount(ctx: Awaited<ReturnType<typeof start>>, daysAgo: number) {
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
  await users.update(user.id, { ageLockedAt: new Date(Date.now() - daysAgo * DAY) });
  return user;
}

describe('comptes verrouillés (moins de 15 ans)', () => {
  it('supprimés après 30 jours, dans Keycloak puis dans l’application ; les autres restent', async () => {
    const ctx = await start();
    const old = await lockedAccount(ctx, 31);
    const recent = await lockedAccount(ctx, 1);
    const readySub = randomUUID();
    await readyToken(ctx.app, { sub: readySub });
    const deleteUser = vi
      .spyOn(ctx.app.get(KeycloakAdminService), 'deleteUser')
      .mockResolvedValue(undefined);

    expect(await ctx.app.get(LockedAccountsService).purge()).toBe(1);

    expect(deleteUser).toHaveBeenCalledExactlyOnceWith(old.keycloakId);
    const users = ctx.app.get(DataSource).getRepository(User);
    expect(await users.findOneBy({ id: old.id })).toBeNull();
    expect(await users.findOneBy({ id: recent.id })).not.toBeNull();
    expect(await users.findOneBy({ keycloakId: readySub })).not.toBeNull();
    // Rien à refaire au passage suivant.
    expect(await ctx.app.get(LockedAccountsService).purge()).toBe(0);
  });

  it('Keycloak indisponible : la ligne reste, la tâche échoue (elle sera rejouée)', async () => {
    const ctx = await start();
    const old = await lockedAccount(ctx, 40);
    vi.spyOn(ctx.app.get(KeycloakAdminService), 'deleteUser').mockRejectedValue(
      new Error('Keycloak : suppression du compte refusée (503)'),
    );
    await expect(ctx.app.get(LockedAccountsService).purge()).rejects.toThrow('503');
    const users = ctx.app.get(DataSource).getRepository(User);
    expect(await users.findOneBy({ id: old.id })).not.toBeNull();
  });

  it('la base refuse un compte verrouillé sans date', async () => {
    const ctx = await start();
    const old = await lockedAccount(ctx, 2);
    await expect(
      ctx.app.get(DataSource).getRepository(User).update(old.id, { ageLockedAt: null }),
    ).rejects.toThrow(/users_locked_has_date/);
  });
});
