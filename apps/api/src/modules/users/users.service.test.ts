import { describe, it, expect, vi } from 'vitest';
import { UsersService } from './users.service';
import type { Db } from '../../config/db';
import { hashPassword } from '../../lib/passwords';

describe('UsersService', () => {
  it('returns me data with user and memberships', async () => {
    const mockDb = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          email: 'u1@test.local',
          fullName: 'Test User',
          phone: null,
          emailVerifiedAt: new Date(),
          deletedAt: null,
        }),
      },
      $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
        return fn({
          membership: {
            findMany: vi.fn().mockResolvedValue([
              {
                orgId: 'org-1',
                role: 'landlord',
                status: 'active',
                org: { name: 'Org 1' },
              },
            ]),
          },
        });
      }),
    } as unknown as Db;

    const service = new UsersService(mockDb);
    const data = await service.getMe('u1');
    expect(data.user.email).toBe('u1@test.local');
    expect(data.memberships).toHaveLength(1);
    expect(data.memberships[0]!.orgName).toBe('Org 1');
  });

  it('updates me fields', async () => {
    const mockDb = {
      user: {
        update: vi.fn().mockResolvedValue({
          id: 'u1',
          email: 'u1@test.local',
          fullName: 'New Name',
          phone: '+8801700000000',
          emailVerifiedAt: new Date(),
          deletedAt: null,
        }),
      },
    } as unknown as Db;

    const service = new UsersService(mockDb);
    const updated = await service.updateMe('u1', { fullName: 'New Name', phone: '+8801700000000' });
    expect(updated.user.fullName).toBe('New Name');
  });

  it('changes password on valid current password', async () => {
    const currentHash = await hashPassword('Current-Password-123');
    const mockDb = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          passwordHash: currentHash,
          deletedAt: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      session: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as Db;

    const service = new UsersService(mockDb);
    const res = await service.changePassword('u1', 'fam-1', {
      currentPassword: 'Current-Password-123',
      newPassword: 'Brand-New-Password-456',
    });
    expect(res.ok).toBe(true);
    expect(mockDb.user.update).toHaveBeenCalled();
  });

  it('lists active sessions', async () => {
    const mockDb = {
      session: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 's1',
            familyId: 'f1',
            userAgent: 'Browser',
            ip: '127.0.0.1',
            createdAt: new Date(),
          },
        ]),
      },
    } as unknown as Db;

    const service = new UsersService(mockDb);
    const list = await service.listSessions('u1', 's1', 'f1');
    expect(list).toHaveLength(1);
    expect(list[0]!.current).toBe(true);
  });

  it('revokes session for device', async () => {
    const targetSessionId = 'a0000000-0000-0000-0000-000000000001';
    const mockDb = {
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: targetSessionId,
          familyId: 'fam-target',
          userId: 'u1',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as Db;

    const service = new UsersService(mockDb);
    const res = await service.revokeSession('u1', targetSessionId);
    expect(res.ok).toBe(true);
  });
});
