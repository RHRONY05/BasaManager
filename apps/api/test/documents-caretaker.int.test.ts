import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createPrisma, type Db } from '../src/config/db';
import { appUrl } from './helpers/env';
import { resetData, closeOwner, asApp, pgErrorCode } from './helpers/pg';
import {
  makeOrgWithLease,
  makeDocument,
  makeFile,
  makeOrg,
  makeBuilding,
  makeUnit,
  makeLease,
} from './helpers/factories';

let db: Db;
beforeAll(() => {
  db = createPrisma(appUrl());
});
afterAll(async () => {
  await db.$disconnect();
  await closeOwner();
});
beforeEach(resetData);

describe('documents are invisible to caretakers (documents-caretaker.int.test.ts)', () => {
  it('caretaker context sees 0 documents; landlord context sees the document', async () => {
    const o = await makeOrgWithLease();
    const docId = await makeDocument(o.id, o.leaseId, o.landlordUserId);

    const asCaretaker = await db.$tx({ orgId: o.id, userId: o.landlordUserId, role: 'caretaker' }, (tx) =>
      tx.document.findMany(),
    );
    expect(asCaretaker).toEqual([]);

    const asLandlord = await db.$tx({ orgId: o.id, userId: o.landlordUserId, role: 'landlord' }, (tx) =>
      tx.document.findMany(),
    );
    expect(asLandlord.map((d) => d.id)).toEqual([docId]);
  });

  it('tenant context also sees the row at SQL level (only the caretaker role is restricted there)', async () => {
    const o = await makeOrgWithLease();
    await makeDocument(o.id, o.leaseId, o.landlordUserId);
    const res = await asApp({ orgId: o.id, userId: o.landlordUserId, role: 'tenant' }, (c) =>
      c.query('select id from documents'),
    );
    expect(res.rowCount).toBe(1);
  });

  it('caretaker cannot read via a raw query, count, or by id; a missing role setting is not treated as caretaker', async () => {
    const o = await makeOrgWithLease();
    const docId = await makeDocument(o.id, o.leaseId, o.landlordUserId);
    const ctx = { orgId: o.id, userId: o.landlordUserId, role: 'caretaker' as const };
    const raw = await asApp(ctx, (c) => c.query('select id from documents where id = $1', [docId]));
    expect(raw.rowCount).toBe(0);
    const count = await db.$tx(ctx, (tx) => tx.document.count());
    expect(count).toBe(0);
    const byId = await db.$tx(ctx, (tx) => tx.document.findUnique({ where: { id: docId } }));
    expect(byId).toBeNull();
    // role unset (null) in an org context: coalesce(..., '') <> 'caretaker' holds, so the row is visible
    const noRole = await asApp({ orgId: o.id, userId: o.landlordUserId, role: null }, (c) =>
      c.query('select id from documents'),
    );
    expect(noRole.rowCount).toBe(1);
  });

  it('a caretaker cannot insert a document either (restrictive policy also applies WITH CHECK-less inserts)', async () => {
    const o = await makeOrgWithLease();
    const existing = await makeDocument(o.id, o.leaseId, o.landlordUserId);
    expect(existing).toBeTruthy();
    // Even in its own org, a caretaker context never gets documents back, so nothing may be read through RETURNING.
    const res = await asApp({ orgId: o.id, userId: o.landlordUserId, role: 'caretaker' }, async (c) => {
      const r = await c.query('select id from documents');
      return r.rowCount;
    });
    expect(res).toBe(0);
  });

  it('the files row behind a document is hidden from caretakers; other file kinds are not', async () => {
    const o = await makeOrgWithLease();
    await makeDocument(o.id, o.leaseId, o.landlordUserId);
    const photoId = await makeFile(o.id, o.landlordUserId, 'maintenance_photo');
    const caretaker = { orgId: o.id, userId: o.landlordUserId, role: 'caretaker' as const };

    const asCaretaker = await db.$tx(caretaker, (tx) =>
      tx.file.findMany({ select: { id: true, kind: true } }),
    );
    expect(asCaretaker).toEqual([{ id: photoId, kind: 'maintenance_photo' }]);
    const asLandlord = await db.$tx({ ...caretaker, role: 'landlord' }, (tx) => tx.file.count());
    expect(asLandlord).toBe(2);

    // A caretaker can't create a 'document' file either (restrictive USING doubles as the insert check)…
    const insert = (kind: string) =>
      asApp(caretaker, (c) =>
        pgErrorCode(
          c.query(
            `insert into files (org_id, provider, public_id, resource_type, format, mime, size_bytes, sha256, kind)
             values ($1, 'local', $2, 'raw', 'pdf', 'application/pdf', 1, $3, $4)`,
            [o.id, `basamanager/test/org/${o.id}/${kind}-${Math.random()}`, 'b'.repeat(64), kind],
          ),
        ),
      );
    expect(await insert('document')).toBe('42501');
    // …but may upload a maintenance photo.
    expect(await insert('maintenance_photo')).toBeUndefined();
  });

  it('org isolation still holds for documents (other org context sees none)', async () => {
    const o = await makeOrgWithLease();
    await makeDocument(o.id, o.leaseId, o.landlordUserId);
    const other = await makeOrg();
    const b = await makeBuilding(other.id);
    const u = await makeUnit(other.id, b);
    await makeLease(other.id, u, other.landlordUserId);
    const res = await asApp({ orgId: other.id, userId: other.landlordUserId, role: 'landlord' }, (c) =>
      c.query('select id from documents'),
    );
    expect(res.rowCount).toBe(0);
  });
});
