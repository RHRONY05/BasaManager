import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLeases } from '../../lib/api/leases';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { PrefetchLink } from '../../lib/router/PrefetchLink';
import { formatMoney } from '../../lib/format';
import type { LeaseStatus } from '@bm/shared/enums';

export default function TenantsPage() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  const {
    data: leases = [],
    isPending,
    isError,
    error,
    refetch,
  } = useLeases({
    status: statusFilter ? (statusFilter as LeaseStatus) : undefined,
  });

  if (isError) {
    return <ErrorState message={error?.message ?? t('status.error')} onRetry={() => void refetch()} />;
  }

  const filtered = leases.filter((l) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const primaryTenant = l.tenants.find((t) => t.isPrimary) ?? l.tenants[0];
    const matchTenant =
      primaryTenant?.fullName.toLowerCase().includes(term) ||
      primaryTenant?.email.toLowerCase().includes(term);
    const matchUnit = l.unit?.label.toLowerCase().includes(term);
    const matchBuilding = l.unit?.buildingName?.toLowerCase().includes(term);
    return matchTenant || matchUnit || matchBuilding;
  });

  return (
    <div className="space-y-6 max-w-5xl min-w-0">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wider text-fg-muted font-bold">{t('headings.tenants')}</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-fg break-words">{t('headings.tenants')}</h1>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('leases.searchPlaceholder')}
          aria-label={t('leases.searchPlaceholder')}
          className="input flex-1"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label={t('leases.allStatuses')}
          className="select sm:w-48"
        >
          <option value="">{t('leases.allStatuses')}</option>
          <option value="pending">{t('leases.status.pending')}</option>
          <option value="active">{t('leases.status.active')}</option>
          <option value="notice">{t('leases.status.notice')}</option>
          <option value="ended">{t('leases.status.ended')}</option>
        </select>
      </div>

      {isPending ? (
        <div data-skeleton aria-busy="true" className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-6">
          <EmptyState title={t('tenantHistory.noLeases')} description="" />
        </div>
      ) : (
        <div className="table-wrap overflow-x-auto" data-scroll-x>
          <table className="table">
            <thead>
              <tr>
                <th>{t('leases.reviewTenant')}</th>
                <th>{t('tenantHistory.unit')}</th>
                <th>{t('common.building')}</th>
                <th>{t('leases.startDate')}</th>
                <th className="r">{t('leases.monthlyRent')}</th>
                <th className="r">{t('leases.depositHeld')}</th>
                <th>{t('leases.statusLabel')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lease) => {
                const primaryTenant = lease.tenants.find((t) => t.isPrimary) ?? lease.tenants[0];
                return (
                  <tr key={lease.id}>
                    <td>
                      <div className="font-semibold text-fg">
                        {primaryTenant?.fullName || t('leases.pendingTenant')}
                      </div>
                      <div className="text-xs text-fg-muted">
                        {primaryTenant?.email || t('leases.invitationSent')}
                      </div>
                    </td>
                    <td className="font-medium text-fg">
                      {t('leases.unitWithLabel', { label: lease.unit?.label ?? '—' })}
                    </td>
                    <td className="text-fg-secondary">{lease.unit?.buildingName ?? '—'}</td>
                    <td>{lease.startDate}</td>
                    <td className="r num font-semibold">{formatMoney(lease.monthlyRentPoisha)}</td>
                    <td className="r num text-accent font-medium">{formatMoney(lease.depositHeldPoisha)}</td>
                    <td>
                      <span
                        className={`badge ${
                          lease.status === 'active'
                            ? 'badge--success'
                            : lease.status === 'pending'
                              ? 'badge--warning'
                              : 'badge--neutral'
                        }`}
                      >
                        {t(`leases.status.${lease.status}`, { defaultValue: lease.status })}
                      </span>
                    </td>
                    <td className="r">
                      <PrefetchLink to={`/l/leases/${lease.id}`} className="btn btn--secondary btn--sm">
                        {t('leases.openLease')}
                      </PrefetchLink>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
