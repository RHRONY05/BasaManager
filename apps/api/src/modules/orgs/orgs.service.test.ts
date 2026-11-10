import { describe, it, expect, vi } from 'vitest';
import { OrgsService } from './orgs.service';
import type { Db, TenantCtx } from '../../config/db';
import { ApiError } from '../../lib/ApiError';

describe('OrgsService', () => {
  const tenantCtx: TenantCtx = {
    orgId: 'org-1',
    userId: 'u1',
    role: 'landlord',
  };

  it('retrieves org by id inside tenant context', async () => {
    const mockDb = {
      $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
        return fn({
          organization: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'org-1',
              name: 'Sunrise Heights',
              slug: 'sunrise-heights',
              status: 'active',
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
        });
      }),
    } as unknown as Db;

    const service = new OrgsService(mockDb);
    const org = await service.getOrg(tenantCtx);
    expect(org.name).toBe('Sunrise Heights');
  });

  it('updates org name', async () => {
    const mockDb = {
      $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
        return fn({
          organization: {
            update: vi.fn().mockResolvedValue({
              id: 'org-1',
              name: 'Updated Name',
              slug: 'sunrise-heights',
              status: 'active',
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
        });
      }),
    } as unknown as Db;

    const service = new OrgsService(mockDb);
    const updated = await service.updateOrg(tenantCtx, { name: 'Updated Name' });
    expect(updated.name).toBe('Updated Name');
  });

  it('lists members with caretaker buildings', async () => {
    const mockDb = {
      $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
        return fn({
          membership: {
            findMany: vi.fn().mockResolvedValue([
              {
                id: 'mem-1',
                userId: 'u1',
                role: 'landlord',
                status: 'active',
                createdAt: new Date(),
                user: { fullName: 'Landlord', email: 'll@test.com', phone: null },
                caretakerBuildings: [],
              },
              {
                id: 'mem-2',
                userId: 'u2',
                role: 'caretaker',
                status: 'active',
                createdAt: new Date(),
                user: { fullName: 'Caretaker', email: 'ct@test.com', phone: null },
                caretakerBuildings: [{ buildingId: 'b-1' }],
              },
            ]),
          },
        });
      }),
    } as unknown as Db;

    const service = new OrgsService(mockDb);
    const members = await service.getMembers(tenantCtx);
    expect(members).toHaveLength(2);
    expect(members[1]?.buildingIds).toEqual(['b-1']);
  });

  it('invites a caretaker and creates outbox record', async () => {
    const mockDb = {
      $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
        return fn({
          membership: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
          building: {
            count: vi.fn().mockResolvedValue(1),
            findMany: vi.fn().mockResolvedValue([{ id: 'b-1' }]),
          },
          invitation: {
            findFirst: vi.fn().mockResolvedValue(null),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            create: vi.fn().mockResolvedValue({
              id: 'inv-1',
              email: 'caretaker@test.com',
              role: 'caretaker',
              expiresAt: new Date(),
            }),
          },
          outboxMessage: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        });
      }),
    } as unknown as Db;

    const service = new OrgsService(mockDb);
    const res = await service.inviteCaretaker(tenantCtx, {
      email: 'caretaker@test.com',
      role: 'caretaker',
      buildingIds: ['b-1'],
    });

    expect(res.email).toBe('caretaker@test.com');
  });

  it('throws validation error if invited building does not belong to org', async () => {
    const mockDb = {
      $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
        return fn({
          membership: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
          building: {
            count: vi.fn().mockResolvedValue(0), // 0 found out of 1 provided
          },
        });
      }),
    } as unknown as Db;

    const service = new OrgsService(mockDb);
    await expect(
      service.inviteCaretaker(tenantCtx, {
        email: 'caretaker@test.com',
        role: 'caretaker',
        buildingIds: ['b-foreign'],
      }),
    ).rejects.toThrow(ApiError);
  });

  it('updates caretaker assigned buildings', async () => {
    const mockDb = {
      $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
        return fn({
          membership: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'mem-ct',
              orgId: 'org-1',
              role: 'caretaker',
            }),
          },
          building: {
            count: vi.fn().mockResolvedValue(1),
            findMany: vi.fn().mockResolvedValue([{ id: 'b-1' }]),
          },
          caretakerBuilding: {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({ id: 'cb-1' }),
          },
        });
      }),
    } as unknown as Db;

    const service = new OrgsService(mockDb);
    const res = await service.updateCaretakerBuildings(tenantCtx, 'mem-ct', { buildingIds: ['b-1'] });
    expect(res.buildingIds).toEqual(['b-1']);
  });

  it('rejects assigning buildings to a non-caretaker member', async () => {
    const mockDb = {
      $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
        return fn({
          membership: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'mem-tenant',
              orgId: 'org-1',
              role: 'tenant',
            }),
          },
        });
      }),
    } as unknown as Db;

    const service = new OrgsService(mockDb);
    await expect(
      service.updateCaretakerBuildings(tenantCtx, 'mem-tenant', { buildingIds: ['b-1'] }),
    ).rejects.toThrow(ApiError);
  });

  it('removes a caretaker member and revokes sessions', async () => {
    const mockDb = {
      $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
        return fn({
          membership: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'mem-ct',
              userId: 'u-ct',
              orgId: 'org-1',
              role: 'caretaker',
            }),
            update: vi.fn().mockResolvedValue({
              id: 'mem-ct',
              status: 'removed',
            }),
          },
          caretakerBuilding: {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          session: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        });
      }),
    } as unknown as Db;

    const service = new OrgsService(mockDb);
    const res = await service.removeMember(tenantCtx, 'mem-ct');
    expect(res.success).toBe(true);
  });

  it('prevents removing the landlord organization owner', async () => {
    const mockDb = {
      $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
        return fn({
          membership: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'mem-ll',
              userId: 'u-ll',
              orgId: 'org-1',
              role: 'landlord',
            }),
          },
        });
      }),
    } as unknown as Db;

    const service = new OrgsService(mockDb);
    await expect(service.removeMember(tenantCtx, 'mem-ll')).rejects.toThrow(ApiError);
  });

  it('rejects invite if user is already an active member of this organization', async () => {
    const mockDb = {
      $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
        return fn({
          membership: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'mem-existing',
              role: 'caretaker',
              status: 'active',
            }),
          },
        });
      }),
    } as unknown as Db;

    const service = new OrgsService(mockDb);
    await expect(
      service.inviteCaretaker(tenantCtx, {
        email: 'active@test.com',
        role: 'caretaker',
        buildingIds: ['b-1'],
      }),
    ).rejects.toThrow(ApiError);
  });

  it('rejects updating buildings for a removed caretaker member', async () => {
    const mockDb = {
      $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
        return fn({
          membership: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'mem-removed',
              role: 'caretaker',
              status: 'removed',
            }),
          },
        });
      }),
    } as unknown as Db;

    const service = new OrgsService(mockDb);
    await expect(
      service.updateCaretakerBuildings(tenantCtx, 'mem-removed', { buildingIds: ['b-1'] }),
    ).rejects.toThrow(ApiError);
  });

  it('rejects removing an already removed member', async () => {
    const mockDb = {
      $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
        return fn({
          membership: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'mem-removed',
              role: 'caretaker',
              status: 'removed',
            }),
          },
        });
      }),
    } as unknown as Db;

    const service = new OrgsService(mockDb);
    await expect(service.removeMember(tenantCtx, 'mem-removed')).rejects.toThrow(ApiError);
  });
});
