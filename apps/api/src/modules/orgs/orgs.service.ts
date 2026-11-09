import type { UpdateOrgRequest } from '@bm/shared/api/auth';
import type { Db, TenantCtx } from '../../config/db';
import { ApiError } from '../../lib/ApiError';

export class OrgsService {
  constructor(private readonly prisma: Db) {}

  /**
   * Retrieves the current organisation details under tenant context.
   */
  async getOrg(tenantCtx: TenantCtx) {
    const org = await this.prisma.$tx(tenantCtx, async (tx) => {
      return tx.organization.findUnique({
        where: { id: tenantCtx.orgId! },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      });
    });

    if (!org) {
      throw ApiError.notFound('Organization not found');
    }

    return org;
  }

  /**
   * Updates organization name under tenant context (landlord only).
   */
  async updateOrg(tenantCtx: TenantCtx, data: UpdateOrgRequest) {
    const org = await this.prisma.$tx(tenantCtx, async (tx) => {
      return tx.organization.update({
        where: { id: tenantCtx.orgId! },
        data: {
          name: data.name.trim(),
        },
        select: {
          id: true,
          name: true,
          slug: true,
        },
      });
    });

    return org;
  }
}
