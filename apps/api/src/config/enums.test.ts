import { describe, it, expect } from 'vitest';
import { dbEnums } from '@bm/shared/enums';
import { $Enums } from '../generated/prisma/client';

// The shared Zod enums are the contract web and api use; the Prisma enums are what Postgres has.
// This fails when one side changes without the other (03-DATABASE.md "Conventions").
describe('shared enums match the database enums', () => {
  it('has the same enum names', () => {
    expect(Object.keys(dbEnums).sort()).toEqual(Object.keys($Enums).sort());
  });

  it.each(Object.keys($Enums))('%s has the same values in the same order', (name) => {
    const prismaValues = Object.values(($Enums as Record<string, Record<string, string>>)[name]!);
    const shared = dbEnums[name as keyof typeof dbEnums];
    expect(shared.options).toEqual(prismaValues);
  });
});
