import { useTranslation } from 'react-i18next';
import { useActiveLease } from '../../lib/api/leases';
import { useOrg } from '../../lib/api/org';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatMoney } from '../../lib/format';

export default function TenantLeasePage() {
  const { t } = useTranslation();
  const { data: lease, isPending, isError, error, refetch } = useActiveLease();
  const { data: org } = useOrg();

  if (isError) {
    return <ErrorState message={error?.message ?? t('status.error')} onRetry={() => void refetch()} />;
  }

  if (isPending) {
    return (
      <div data-skeleton aria-busy="true" className="space-y-6 max-w-2xl mx-auto min-w-0">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!lease) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <EmptyState
          title={t('tenantPortal.noActiveLease')}
          description={t('tenantPortal.noActiveLeaseDesc')}
        />
      </div>
    );
  }

  const totalCharges = lease.charges.reduce((acc, c) => acc + c.amountPoisha, 0);
  const totalMonthly = lease.monthlyRentPoisha + totalCharges;

  return (
    <div className="space-y-6 max-w-2xl mx-auto min-w-0">
      {/* Header */}
      <div className="space-y-1 min-w-0">
        <p className="text-xs uppercase tracking-wider text-fg-muted font-bold">
          {t('headings.tenantLease')}
        </p>
        <h1
          className="text-2xl sm:text-3xl font-bold text-fg truncate"
          title={`${t('leases.unitWithLabel', { label: lease.unit?.label ?? '—' })}${lease.unit?.buildingName ? ` · ${lease.unit.buildingName}` : ''}`}
        >
          {t('leases.unitWithLabel', { label: lease.unit?.label ?? '—' })}
          {lease.unit?.buildingName ? ` · ${lease.unit.buildingName}` : ''}
        </h1>
        <p className="text-sm text-fg-muted">{t('tenantPortal.leaseSubtitle')}</p>
      </div>

      {/* Top Financial Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 bg-surface border border-border rounded-lg space-y-1">
          <span className="text-xs text-fg-muted font-medium">{t('tenantPortal.monthlyRent')}</span>
          <p className="text-2xl font-bold num text-fg">{formatMoney(lease.monthlyRentPoisha)}</p>
          <span className="text-xs text-fg-muted">{t('leases.billedMonthly')}</span>
        </div>

        <div className="p-4 bg-surface border border-border rounded-lg space-y-1">
          <span className="text-xs text-fg-muted font-medium">{t('tenantPortal.depositHeld')}</span>
          <p className="text-2xl font-bold num text-accent">{formatMoney(lease.depositHeldPoisha)}</p>
          <span className="text-xs text-fg-muted">
            {t('leases.agreedDeposit', { amount: formatMoney(lease.depositPoisha) })}
          </span>
        </div>
      </div>

      {/* Tenancy & Lease Details */}
      <div className="card">
        <div className="card__head">
          <h2 className="card__title">{t('tenantPortal.tenancyDetails')}</h2>
        </div>
        <dl className="dl dl--grid p-4">
          <div className="dl__row">
            <dt>{t('tenantPortal.buildingInfo')}</dt>
            <dd className="font-semibold text-fg">
              {t('leases.unitFloorInfo', {
                label: lease.unit?.label ?? '—',
                floor: lease.unit?.floor ?? 1,
                building: lease.unit?.buildingName ?? '',
              })}
            </dd>
          </div>
          <div className="dl__row">
            <dt>{t('tenantPortal.startDate')}</dt>
            <dd>{lease.startDate}</dd>
          </div>
          <div className="dl__row">
            <dt>{t('tenantPortal.householdSize')}</dt>
            <dd>{t('leases.residentCount', { count: lease.householdSize })}</dd>
          </div>
          {lease.moveInReading !== null && (
            <div className="dl__row">
              <dt>{t('tenantPortal.submeterReading')}</dt>
              <dd className="num font-semibold">
                {t('leases.electricityUnits', { count: lease.moveInReading })}
              </dd>
            </div>
          )}
          <div className="dl__row">
            <dt>{t('leases.statusLabel')}</dt>
            <dd>
              <span className={`badge ${lease.status === 'active' ? 'badge--success' : 'badge--warning'}`}>
                {t(`leases.status.${lease.status}`)}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {/* Monthly Recurring Charges Breakdown */}
      <div className="card">
        <div className="card__head flex items-center justify-between">
          <h2 className="card__title">{t('tenantPortal.chargesBreakdown')}</h2>
          <span className="text-xs font-semibold num text-fg">
            {t('leases.totalRecurring', { amount: formatMoney(totalCharges) })}
          </span>
        </div>
        <div className="p-4 space-y-2">
          <div className="flex justify-between py-1.5 border-b border-border/50 text-sm">
            <span className="font-medium text-fg">{t('tenantPortal.monthlyRent')}</span>
            <span className="num font-bold text-fg">{formatMoney(lease.monthlyRentPoisha)}</span>
          </div>
          {lease.charges.map((charge) => (
            <div key={charge.id} className="flex justify-between py-1.5 border-b border-border/50 text-sm">
              <span className="text-fg-secondary">{charge.name}</span>
              <span className="num font-medium text-fg">{formatMoney(charge.amountPoisha)}</span>
            </div>
          ))}
          <div className="flex justify-between pt-3 font-bold text-base text-fg">
            <span>{t('leases.reviewTotalMonthly')}</span>
            <span className="num text-accent">{formatMoney(totalMonthly)}</span>
          </div>
        </div>
      </div>

      {/* Building Management / Landlord Info */}
      <div className="card card--tight">
        <div className="card__head">
          <h2 className="card__title">{t('tenantPortal.landlordContact')}</h2>
        </div>
        <div className="p-4 space-y-2 text-sm">
          <p className="font-semibold text-fg">{org?.name ?? t('leases.buildingManagement')}</p>
          <p className="text-xs text-fg-muted">{t('tenantPortal.contactSupport')}</p>
        </div>
      </div>
    </div>
  );
}
