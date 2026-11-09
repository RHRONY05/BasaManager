import { describe, it, expect, vi } from 'vitest';
import { OrgsService } from './orgs.service';
import type { Db, TenantCtx } from '../../config/db';

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
});
