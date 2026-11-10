import { useParams, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { useTenantHistory } from '../../lib/api/leases';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';

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

  const formatMoney = (poisha: number) => {
    const bdt = Math.round(poisha / 100);
    return `৳${bdt.toLocaleString('en-US')}`;
  };

  return (
    <div className="space-y-6 max-w-5xl min-w-0">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-fg-muted">
        <Link to="/l/buildings" className="hover:text-fg transition-colors">
          {t('headings.buildings')}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span aria-current="page" className="text-fg font-medium">
          {t('tenantHistory.title')}
        </span>
      </nav>

      {/* Tenant Profile Header */}
      <div className="p-6 bg-surface border border-border rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-accent/15 text-accent flex items-center justify-center font-bold text-xl">
            {tenant.fullName.slice(0, 1) || 'T'}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-fg">{tenant.fullName}</h1>
            <p className="text-sm text-fg-muted">{tenant.email}</p>
            <p className="text-xs text-fg-muted mt-1">
              {t('tenantHistory.memberSince', { date: tenant.createdAt.slice(0, 10) })}
            </p>
          </div>
        </div>

        <span className="badge badge--neutral capitalize">{tenant.status}</span>
      </div>

      {/* Leases Section */}
      <div className="card">
        <div className="card__head flex items-center justify-between">
          <h2 className="card__title">{t('tenantHistory.leases')}</h2>
          <span className="text-xs text-fg-muted font-medium">{leases.length} total</span>
        </div>
        {leases.length === 0 ? (
          <div className="p-4">
            <EmptyState title={t('tenantHistory.noLeases')} description="" />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('tenantHistory.unit')}</th>
                  <th>Building</th>
                  <th>{t('leases.startDate')}</th>
                  <th className="r">{t('leases.monthlyRent')}</th>
                  <th className="r">{t('leases.depositHeld')}</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {leases.map((l) => (
                  <tr key={l.id}>
                    <td className="font-semibold text-fg">Unit {l.unit?.label}</td>
                    <td className="text-fg-secondary">{l.unit?.buildingName}</td>
                    <td>{l.startDate}</td>
                    <td className="r num font-medium">{formatMoney(l.monthlyRentPoisha)}</td>
                    <td className="r num text-accent">{formatMoney(l.depositHeldPoisha)}</td>
                    <td>
                      <span
                        className={`badge ${l.status === 'active' ? 'badge--success' : 'badge--neutral'}`}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="r">
                      <Link to={`/l/leases/${l.id}`} className="btn btn--secondary btn--sm">
                        {t('leases.openLease')}
                      </Link>
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
        <div className="card__head flex items-center justify-between">
          <h2 className="card__title">{t('tenantHistory.bills')}</h2>
          <span className="text-xs text-fg-muted font-medium">{bills.length} total</span>
        </div>
        {bills.length === 0 ? (
          <div className="p-4">
            <EmptyState title={t('tenantHistory.noBills')} description="" />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('tenantHistory.period')}</th>
                  <th className="r">{t('tenantHistory.amount')}</th>
                  <th>Due Date</th>
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
        <div className="card__head flex items-center justify-between">
          <h2 className="card__title">{t('tenantHistory.payments')}</h2>
          <span className="text-xs text-fg-muted font-medium">{payments.length} total</span>
        </div>
        {payments.length === 0 ? (
          <div className="p-4">
            <EmptyState title={t('tenantHistory.noPayments')} description="" />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
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
