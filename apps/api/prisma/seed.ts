/**
 * Dev/staging demo data (03-DATABASE.md "Seed"): `pnpm db:seed`.
 *
 * V4 creates the skeleton: users, the demo org "Rahman Properties", memberships, 2 buildings in Chattogram
 * (Rahman Villa = submeter, Rahman Tower = prepaid), 10 units with their fixed charges, and the caretaker's
 * building assignment. Leases (V7), 3 months of bills (V8), payments of every method incl. one pending claim
 * (V9/V10), 5 maintenance requests (V12) and 2 notices (V13) are added by the tasks that build those
 * services, through the services. See `seed-repo.ts` for the growth plan.
 *
 * Runs as bm_app (`DATABASE_URL`) so RLS applies. Idempotent: users are upserted by email; if the demo org
 * already exists nothing else is written. Refuses to run when APP_ENV=prod. Password: `SEED_PASSWORD`.
 */
import argon2 from 'argon2';
import { z } from 'zod';
import { newId } from '@bm/shared/ids';
import { createPrisma } from '../src/config/db';
import { clock } from '../src/lib/clock';
import {
  addMember,
  assignCaretaker,
  createBuilding,
  createOrg,
  createUnit,
  upsertUser,
  type BuildingInput,
  type UnitInput,
} from './seed-repo';

// Tooling, not the app: it needs only these three variables (the app reads env through src/config/env.ts).
const seedEnv = z
  .object({
    DATABASE_URL: z.string().min(1),
    SEED_PASSWORD: z.string().min(10, 'SEED_PASSWORD must be at least 10 characters (02 password rule)'),
    APP_ENV: z.enum(['dev', 'test', 'staging', 'prod']).default('dev'),
  })
  .parse(process.env);

if (seedEnv.APP_ENV === 'prod') {
  throw new Error('db:seed refuses to run with APP_ENV=prod (demo data is dev/staging only)');
}

export const DEMO_ORG_SLUG = 'rahman-properties';
const taka = (n: number): bigint => BigInt(Math.round(n * 100));

const TENANTS = [
  'Farhana Akter',
  'Mizanur Rahman',
  'Nusrat Jahan',
  'Tanvir Hasan',
  'Sharmin Sultana',
  'Arif Chowdhury',
  'Rumana Begum',
  'Sajid Karim',
] as const;

const VILLA: BuildingInput = {
  name: 'Rahman Villa',
  address: 'House 12, Road 3',
  area: 'Khulshi',
  city: 'Chattogram',
  lat: 22.3569,
  lng: 91.8079,
  billDay: 1,
  dueDay: 10,
  graceDays: 2,
  lateFeeType: 'percent',
  lateFeeValue: 500, // 5 %
  electricityRatePoisha: 900, // ৳9.00 per unit
};

const TOWER: BuildingInput = {
  name: 'Rahman Tower',
  address: '45 CDA Avenue',
  area: 'Nasirabad',
  city: 'Chattogram',
  lat: 22.3667,
  lng: 91.8233,
  billDay: 1,
  dueDay: 7,
  graceDays: 0,
  lateFeeType: 'flat',
  lateFeeValue: 50000, // ৳500
  electricityRatePoisha: 0, // prepaid meters: the tenant pays the utility directly
};

const villaCharges = [
  { name: 'Service charge', amountPoisha: taka(1000) },
  { name: 'Water', amountPoisha: taka(500) },
  { name: 'Gas', amountPoisha: taka(1080) },
  { name: 'Garbage', amountPoisha: taka(100) },
];
const towerCharges = [
  { name: 'Service charge', amountPoisha: taka(1500) },
  { name: 'Lift', amountPoisha: taka(500) },
  { name: 'Garbage', amountPoisha: taka(100) },
];

const VILLA_UNITS: UnitInput[] = [
  { label: '1A', floor: 1, type: 'family_flat', rentPoisha: taka(12000), electricityMode: 'submeter', charges: villaCharges },
  { label: '1B', floor: 1, type: 'family_flat', rentPoisha: taka(12000), electricityMode: 'submeter', charges: villaCharges },
  { label: '2A', floor: 2, type: 'family_flat', rentPoisha: taka(14000), electricityMode: 'submeter', charges: villaCharges },
  { label: '2B', floor: 2, type: 'family_flat', rentPoisha: taka(14000), electricityMode: 'submeter', charges: villaCharges },
  { label: '3A', floor: 3, type: 'family_flat', rentPoisha: taka(15000), electricityMode: 'submeter', charges: villaCharges },
  { label: '3B', floor: 3, type: 'bachelor_flat', rentPoisha: taka(9000), electricityMode: 'submeter', charges: villaCharges },
]; // prettier-ignore

const TOWER_UNITS: UnitInput[] = [
  { label: 'G-Shop', floor: 0, type: 'shop', rentPoisha: taka(20000), electricityMode: 'prepaid', charges: [towerCharges[0]!] },
  { label: '2A', floor: 2, type: 'family_flat', rentPoisha: taka(18000), electricityMode: 'prepaid', charges: towerCharges },
  { label: '3A', floor: 3, type: 'bachelor_flat', rentPoisha: taka(10000), electricityMode: 'prepaid', charges: towerCharges },
  { label: '4-R1', floor: 4, type: 'room', rentPoisha: taka(5000), electricityMode: 'prepaid', charges: towerCharges },
]; // prettier-ignore

async function main(): Promise<void> {
  const db = createPrisma(seedEnv.DATABASE_URL);
  try {
    const now = clock.now();
    // 02 "Auth": argon2id m=19456, t=2, p=1. One hash for every demo user (same password).
    const passwordHash = await argon2.hash(seedEnv.SEED_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    const user = (email: string, fullName: string, isPlatformAdmin = false) =>
      upsertUser(db, { email, fullName, passwordHash, isPlatformAdmin }, now);

    const landlordId = await user('landlord@demo.test', 'Abdur Rahman');
    const caretakerId = await user('caretaker@demo.test', 'Jamal Uddin');
    const tenantIds: string[] = [];
    for (const [i, name] of TENANTS.entries()) tenantIds.push(await user(`tenant${i + 1}@demo.test`, name));
    await user('admin@demo.test', 'Platform Admin', true);
    const userCount = 3 + tenantIds.length;

    // Is the demo org already there? Only an admin context can look across orgs.
    const existing = await db.$tx({ orgId: null, userId: landlordId, role: null, isAdmin: true }, (tx) =>
      tx.organization.findUnique({ where: { slug: DEMO_ORG_SLUG }, select: { id: true } }),
    );
    if (existing) {
      console.log(`db:seed: "${DEMO_ORG_SLUG}" already exists (${existing.id}); users upserted, nothing else.`);
      return;
    }

    // The new org's id must be the transaction's app.org_id, or the org_self policy refuses the insert.
    const orgId = newId();
    await db.$tx({ orgId, userId: landlordId, role: 'landlord' }, async (tx) => {
      await createOrg(tx, { id: orgId, name: 'Rahman Properties', slug: DEMO_ORG_SLUG, isDemo: true, createdBy: landlordId });
      await addMember(tx, orgId, landlordId, 'landlord');
      const caretakerMembership = await addMember(tx, orgId, caretakerId, 'caretaker');
      for (const id of tenantIds) await addMember(tx, orgId, id, 'tenant');

      const villaId = await createBuilding(tx, orgId, VILLA);
      const towerId = await createBuilding(tx, orgId, TOWER);
      for (const u of VILLA_UNITS) await createUnit(tx, orgId, villaId, u);
      for (const u of TOWER_UNITS) await createUnit(tx, orgId, towerId, u);
      await assignCaretaker(tx, orgId, caretakerMembership, villaId);
    }, { timeout: 30_000 }); // prettier-ignore

    console.log(
      `db:seed: created "Rahman Properties" (${orgId}): ${userCount} users, 2 buildings, ${VILLA_UNITS.length + TOWER_UNITS.length} units.`,
    );
  } finally {
    await db.$disconnect();
  }
}

await main();
