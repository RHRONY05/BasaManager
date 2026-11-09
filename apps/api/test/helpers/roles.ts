import { q } from './pg';
import { makeMembership } from './factories';
import { insertUser, loginAs, newAgent, type TestAgent, type TestCtx } from './auth';

export type Actor = {
  agent: TestAgent;
  userId: string;
  membershipId: string;
  email: string;
  password: string;
};

/** A signed-in agent holding an active membership with `role` in `orgId` (caretakers get `buildingIds`). */
export async function actorIn(
  ctx: TestCtx,
  orgId: string,
  role: 'landlord' | 'caretaker' | 'tenant',
  o: { buildingIds?: string[] } = {},
): Promise<Actor> {
  const u = await insertUser();
  const membershipId = await makeMembership(orgId, u.id, role);
  for (const b of o.buildingIds ?? []) {
    await q(`insert into caretaker_buildings (org_id, membership_id, building_id) values ($1,$2,$3)`, [
      orgId,
      membershipId,
      b,
    ]);
  }
  const agent = (await loginAs(newAgent(ctx), u.email, u.password)).set('X-Org-Id', orgId);
  return { agent, userId: u.id, membershipId, email: u.email, password: u.password };
}

/** Sign in the landlord that `makeOrg` created (it has no password yet, so give it one). */
export async function landlordOf(ctx: TestCtx, org: { id: string; landlordUserId: string }): Promise<Actor> {
  const donor = await insertUser();
  const email = donor.email;
  await q(
    `update users set email = $1, password_hash = (select password_hash from users where id = $2), email_verified_at = now() where id = $3`,
    [`ll-${email}`, donor.id, org.landlordUserId],
  );
  const agent = (await loginAs(newAgent(ctx), `ll-${email}`, donor.password)).set('X-Org-Id', org.id);
  const m = await q<{ id: string }>(`select id from memberships where org_id=$1 and role='landlord'`, [
    org.id,
  ]);
  return {
    agent,
    userId: org.landlordUserId,
    membershipId: m[0]!.id,
    email: `ll-${email}`,
    password: donor.password,
  };
}
