import { describe, it, expect } from 'vitest';
import { createPrisma, TenantContextMissing, TENANT_MODELS } from './db';

// No database needed: the guard throws before any connection is made, and ctx validation happens first.
describe('tenant extension (unit)', () => {
  const db = createPrisma('postgresql://nobody:nothing@127.0.0.1:1/none');

  it('TenantContextMissing carries model and operation', () => {
    const e = new TenantContextMissing('Building', 'findMany');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('TenantContextMissing');
    expect(e.message).toContain('Building.findMany');
    expect(e.model).toBe('Building');
  });

  it('rejects tenant models outside $tx without touching the database', async () => {
    await expect(db.building.findMany()).rejects.toBeInstanceOf(TenantContextMissing);
    await expect(db.organization.findFirst()).rejects.toBeInstanceOf(TenantContextMissing);
    expect(TENANT_MODELS.has('User')).toBe(false);
  });

  it('$tx validates the context ids before opening a transaction', async () => {
    await expect(
      db.$tx({ orgId: 'x', userId: crypto.randomUUID(), role: null }, async () => 1),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      db.$tx({ orgId: null, userId: 'not-a-uuid', role: null }, async () => 1),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('accepts an onQuery hook (query events on)', () => {
    const withEvents = createPrisma('postgresql://nobody:nothing@127.0.0.1:1/none', { onQuery: () => {} });
    expect(typeof withEvents.$tx).toBe('function');
  });
});
