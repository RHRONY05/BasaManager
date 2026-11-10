import React from 'react';
import { useTranslation } from 'react-i18next';
import { Home, FileText, ArrowRight, CheckCircle2, AlertCircle, CreditCard } from 'lucide-react';
import { useActiveLease } from '../../lib/api/leases.js';
import { useDues } from '../../lib/api/billing.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { PrefetchLink } from '../../lib/router/PrefetchLink.js';
import { formatMoney } from '../../lib/format.js';

export default function HomePage() {
  const { t } = useTranslation();
  const {
    data: lease,
    isPending: leasePending,
    isError: leaseError,
    error: leaseErr,
    refetch: refetchLease,
  } = useActiveLease();
  const {
    data: dues,
    isPending: duesPending,
    isError: duesError,
    error: duesErr,
    refetch: refetchDues,
  } = useDues();

  if (leaseError || duesError) {
    const msg = leaseErr?.message || duesErr?.message || t('status.error');
    return (
      <ErrorState
        message={msg}
        onRetry={() => {
          void refetchLease();
          void refetchDues();
        }}
      />
    );
  }

  const isPending = leasePending || duesPending;
  const hasDues = dues && dues.totalPoisha > 0;
  const oldestDueBill = dues?.bills[0];

  return (
    <div className="space-y-6 max-w-xl min-w-0">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wider text-fg-muted font-bold">{t('headings.tenantHome')}</p>
        <h1 className="text-2xl font-bold text-fg break-words">{t('tenantPortal.welcomeTitle')}</h1>
      </div>

      {isPending ? (
        <div data-skeleton aria-busy="true" className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : lease ? (
        <div className="space-y-4">
          {/* Big Due Card */}
          {hasDues ? (
            <div className="card p-5 space-y-4 bg-accent/5 border-accent/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-accent" />
                  <span className="text-xs font-bold uppercase tracking-wider text-fg-muted">
                    {t('billing.totalDue')}
                  </span>
                </div>
                {oldestDueBill?.overdue && (
                  <span className="badge badge--danger text-xs flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {t('billing.status.overdue')}
                  </span>
                )}
              </div>

              <div>
                <p className="text-3xl font-extrabold num text-fg">{formatMoney(dues.totalPoisha)}</p>
                {oldestDueBill?.dueDate && (
                  <p className="text-xs text-fg-muted mt-1">
                    {t('billing.dueDate')}: {oldestDueBill.dueDate}
                  </p>
                )}
                {dues.creditPoisha > 0 && (
                  <p className="text-xs text-success font-medium mt-1">
                    {t('billing.creditApplied')}: {formatMoney(dues.creditPoisha)}
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <PrefetchLink
                  to="/t/bills"
                  className="btn btn--primary btn--sm flex-1 text-center justify-center"
                >
                  {t('billing.payNow')}
                </PrefetchLink>
                <PrefetchLink
                  to="/t/bills"
                  className="btn btn--secondary btn--sm flex-1 text-center justify-center"
                >
                  {t('billing.paidAnotherWay')}
                </PrefetchLink>
              </div>
            </div>
          ) : (
            <div className="card p-5 flex items-center justify-between gap-3 bg-success/5 border-success/30">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-success shrink-0" />
                <div>
                  <h2 className="font-bold text-sm text-fg">{t('billing.allPaid')}</h2>
                  <p className="text-xs text-fg-muted">{t('billing.allPaidDesc')}</p>
                </div>
              </div>
              <PrefetchLink
                to="/t/bills"
                className="text-xs text-accent hover:underline font-semibold shrink-0"
              >
                {t('headings.tenantBills')}
              </PrefetchLink>
            </div>
          )}

          {/* Lease Card */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Home className="h-5 w-5 text-accent" />
                <h2 className="font-bold text-base text-fg">
                  {t('leases.unitWithLabel', { label: lease.unit?.label ?? '—' })}
                  {lease.unit?.buildingName ? ` · ${lease.unit.buildingName}` : ''}
                </h2>
              </div>
              <span
                className={`badge capitalize ${
                  lease.status === 'active'
                    ? 'badge--success'
                    : lease.status === 'notice' || lease.status === 'pending'
                      ? 'badge--warning'
                      : 'badge--neutral'
                }`}
              >
                {t(`leases.status.${lease.status}`)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 py-2 border-y border-border/50 text-sm">
              <div>
                <span className="text-xs text-fg-muted">{t('tenantPortal.monthlyRent')}</span>
                <p className="font-bold num text-fg">{formatMoney(lease.monthlyRentPoisha)}</p>
              </div>
              <div>
                <span className="text-xs text-fg-muted">{t('tenantPortal.depositHeld')}</span>
                <p className="font-bold num text-accent">{formatMoney(lease.depositHeldPoisha)}</p>
              </div>
            </div>

            <PrefetchLink to="/t/lease" className="btn btn--secondary btn--sm w-full">
              <FileText className="h-4 w-4 mr-1.5" />
              {t('tenantPortal.leaseTitle')}
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </PrefetchLink>
          </div>
        </div>
      ) : (
        <div className="card p-6 text-center space-y-2">
          <p className="text-base font-semibold text-fg">{t('tenantPortal.noActiveLease')}</p>
          <p className="text-sm text-fg-muted">{t('tenantPortal.noActiveLeaseDesc')}</p>
        </div>
      )}
    </div>
  );
}
