import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { useTenantHistory } from '../../lib/api/leases';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { PrefetchLink } from '../../lib/router/PrefetchLink';
import { formatMoney } from '../../lib/format';

export default function TenantHistoryPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { t } = useTranslation();

  const { data: history, isPending, isError, error, refetch } = useTenantHistory(id);

  if (isError) {
    return <ErrorState message={error?.message ?? t('status.error')} onRetry={() => void refetch()} />;
  }

  if (isPending || !history) {
    return (
      <div data-skeleton aria-busy="true" className="space-y-6 max-w-5xl min-w-0">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-72" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  const { tenant, leases, bills, payments } = history;

  return (
    <div className="space-y-6 max-w-5xl min-w-0">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-fg-muted flex-wrap">
        <PrefetchLink
          to="/l/buildings"
          className="hover:text-fg transition-colors min-h-tap inline-flex items-center py-2"
        >
          {t('headings.buildings')}
        </PrefetchLink>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span aria-current="page" className="text-fg font-medium min-h-tap inline-flex items-center py-2">
          {t('tenantHistory.title')}
        </span>
      </nav>

      {/* Tenant Profile Header */}
      <div className="p-4 sm:p-6 bg-surface border border-border rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 min-w-0">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0 w-full sm:w-auto">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-accent/15 text-accent flex items-center justify-center font-bold text-lg sm:text-xl shrink-0">
            {tenant.fullName.slice(0, 1) || 'T'}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-fg truncate block" title={tenant.fullName}>
              {tenant.fullName}
            </h1>
            <p className="text-sm text-fg-muted truncate block" title={tenant.email}>
              {tenant.email}
            </p>
            <p
              className="text-xs text-fg-muted mt-1 truncate block"
              title={t('tenantHistory.memberSince', { date: tenant.createdAt.slice(0, 10) })}
            >
              {t('tenantHistory.memberSince', { date: tenant.createdAt.slice(0, 10) })}
            </p>
          </div>
        </div>

        <span className="badge badge--neutral capitalize shrink-0">{tenant.status}</span>
      </div>

      {/* Leases Section */}
      <div className="card">
        <div className="card__head flex flex-wrap items-center justify-between gap-2">
          <h2 className="card__title">{t('tenantHistory.leases')}</h2>
          <span className="text-xs text-fg-muted font-medium">
            {t('tenantHistory.totalLeases', { count: leases.length })}
          </span>
        </div>
        {leases.length === 0 ? (
          <div className="p-4">
            <EmptyState title={t('tenantHistory.noLeases')} description="" />
          </div>
        ) : (
          <div className="table-wrap overflow-x-auto" data-scroll-x>
            <table className="table">
              <thead>
                <tr>
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
                {leases.map((l) => (
                  <tr key={l.id}>
                    <td className="font-semibold text-fg">
                      {t('leases.unitWithLabel', { label: l.unit?.label ?? '—' })}
                    </td>
                    <td className="text-fg-secondary">{l.unit?.buildingName}</td>
                    <td>{l.startDate}</td>
                    <td className="r num font-medium">{formatMoney(l.monthlyRentPoisha)}</td>
                    <td className="r num text-accent">{formatMoney(l.depositHeldPoisha)}</td>
                    <td>
                      <span
                        className={`badge ${l.status === 'active' ? 'badge--success' : 'badge--neutral'}`}
                      >
                        {t(`leases.status.${l.status}`, { defaultValue: l.status })}
                      </span>
                    </td>
                    <td className="r">
                      <PrefetchLink to={`/l/leases/${l.id}`} className="btn btn--secondary btn--sm">
                        {t('leases.openLease')}
                      </PrefetchLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bills Section */}
      <div className="card">
        <div className="card__head flex flex-wrap items-center justify-between gap-2">
          <h2 className="card__title">{t('tenantHistory.bills')}</h2>
          <span className="text-xs text-fg-muted font-medium">
            {t('tenantHistory.totalBills', { count: bills.length })}
          </span>
        </div>
        {bills.length === 0 ? (
          <div className="p-4">
            <EmptyState title={t('tenantHistory.noBills')} description="" />
          </div>
        ) : (
          <div className="table-wrap overflow-x-auto" data-scroll-x>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('tenantHistory.period')}</th>
                  <th className="r">{t('tenantHistory.amount')}</th>
                  <th>{t('tenantHistory.dueDate')}</th>
                  <th>{t('tenantHistory.status')}</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td className="font-medium text-fg">{b.periodMonth}</td>
                    <td className="r num font-bold">{formatMoney(b.totalPoisha)}</td>
                    <td>{b.dueDate}</td>
                    <td>
                      <span className={`badge ${b.status === 'paid' ? 'badge--success' : 'badge--warning'}`}>
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payments Section */}
      <div className="card">
        <div className="card__head flex flex-wrap items-center justify-between gap-2">
          <h2 className="card__title">{t('tenantHistory.payments')}</h2>
          <span className="text-xs text-fg-muted font-medium">
            {t('tenantHistory.totalPayments', { count: payments.length })}
          </span>
        </div>
        {payments.length === 0 ? (
          <div className="p-4">
            <EmptyState title={t('tenantHistory.noPayments')} description="" />
          </div>
        ) : (
          <div className="table-wrap overflow-x-auto" data-scroll-x>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('tenantHistory.date')}</th>
                  <th className="r">{t('tenantHistory.amount')}</th>
                  <th>{t('tenantHistory.method')}</th>
                  <th>{t('tenantHistory.receipt')}</th>
                  <th>{t('tenantHistory.status')}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.createdAt.slice(0, 10)}</td>
                    <td className="r num font-bold text-success">{formatMoney(p.amountPoisha)}</td>
                    <td className="capitalize">{p.method}</td>
                    <td className="num">{p.receiptNumber ?? '—'}</td>
                    <td>
                      <span className="badge badge--success">{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
