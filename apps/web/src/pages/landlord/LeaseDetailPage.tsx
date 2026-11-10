import { useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, User, Plus, Mail, RefreshCw, FileText } from 'lucide-react';
import { useLease, useResendInvite } from '../../lib/api/leases';
import { RecordDepositDialog } from './RecordDepositDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { PrefetchLink } from '../../lib/router/PrefetchLink';
import { formatMoney } from '../../lib/format';

export default function LeaseDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { t } = useTranslation();

  const { data: lease, isPending, isError, error, refetch } = useLease(id);
  const resendMutation = useResendInvite(id);

  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');
  const [isDepositDialogOpen, setIsDepositDialogOpen] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  if (isError) {
    return <ErrorState message={error?.message ?? t('status.error')} onRetry={() => void refetch()} />;
  }

  if (isPending || !lease) {
    return (
      <div data-skeleton aria-busy="true" className="space-y-6 max-w-5xl min-w-0">
        <Skeleton className="h-6 w-48" />
        <div className="space-y-2">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const handleResend = async () => {
    try {
      await resendMutation.mutateAsync();
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 4000);
    } catch {
      // Error is caught and rendered in the alert below
    }
  };

  const primaryTenant = lease.tenants.find((t) => t.isPrimary) ?? lease.tenants[0];

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
        {lease.unit?.buildingId && (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <PrefetchLink
              to={`/l/buildings/${lease.unit.buildingId}`}
              className="hover:text-fg transition-colors truncate max-w-xs min-h-tap inline-flex items-center py-2"
              title={lease.unit.buildingName || t('common.building')}
            >
              {lease.unit.buildingName || t('common.building')}
            </PrefetchLink>
          </>
        )}
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span aria-current="page" className="text-fg font-medium min-h-tap inline-flex items-center py-2">
          {t('headings.leaseDetail')}
        </span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <p
            className="text-xs uppercase tracking-wider text-fg-muted font-bold truncate block"
            title={t('headings.leaseDetail')}
          >
            {t('headings.leaseDetail')}
          </p>
          <h1
            className="text-2xl sm:text-3xl font-bold text-fg truncate"
            title={`${t('leases.unitWithLabel', { label: lease.unit?.label ?? '—' })}${lease.unit?.buildingName ? ` · ${lease.unit.buildingName}` : ''}`}
          >
            {t('leases.unitWithLabel', { label: lease.unit?.label ?? '—' })}
            {lease.unit?.buildingName ? ` · ${lease.unit.buildingName}` : ''}
          </h1>
          <p className="text-sm text-fg-muted flex items-center gap-2 flex-wrap">
            <User className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span className="truncate" title={primaryTenant?.fullName || t('leases.pendingTenant')}>
              {primaryTenant?.fullName || t('leases.pendingTenant')} (
              {primaryTenant?.email || t('leases.invitationSent')})
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {lease.status === 'pending' ? (
            <span className="badge badge--warning">{t('leases.status.pending')}</span>
          ) : lease.status === 'active' ? (
            <span className="badge badge--success">{t('leases.status.active')}</span>
          ) : lease.status === 'notice' ? (
            <span className="badge badge--warning">{t('leases.status.notice')}</span>
          ) : (
            <span className="badge badge--neutral">{t('leases.status.ended')}</span>
          )}

          <button type="button" onClick={() => setIsDepositDialogOpen(true)} className="btn btn--primary">
            <Plus className="h-4 w-4 mr-1.5" />
            {t('leases.recordDeposit')}
          </button>
        </div>
      </div>

      {/* Pending Invitation Alert */}
      {lease.status === 'pending' && (
        <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Mail className="h-5 w-5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="font-semibold text-sm text-fg">{t('leases.status.pending')}</h2>
              <p className="text-xs text-fg-muted">{t('leases.pendingInviteAlert')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendMutation.isPending}
            className="btn btn--secondary shrink-0 w-full sm:w-auto"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${resendMutation.isPending ? 'animate-spin' : ''}`} />
            {resendMutation.isPending ? t('leases.resending') : t('leases.resendInvite')}
          </button>
        </div>
      )}

      {resendSuccess && (
        <div className="p-3 bg-success/15 border border-success/30 rounded text-sm text-success font-medium">
          {t('leases.inviteResent')}
        </div>
      )}

      {resendMutation.isError && (
        <div
          role="alert"
          className="p-3 bg-danger/15 border border-danger/30 rounded text-sm text-danger flex items-center justify-between"
        >
          <span>{resendMutation.error?.message ?? t('status.error')}</span>
          <button type="button" onClick={handleResend} className="btn btn--secondary btn--sm">
            {t('status.retry')}
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-border gap-2 sm:gap-4">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`min-h-tap px-3 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center justify-center ${
            activeTab === 'overview'
              ? 'border-accent text-accent'
              : 'border-transparent text-fg-muted hover:text-fg'
          }`}
        >
          {t('leases.overviewTab')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`min-h-tap px-3 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center justify-center ${
            activeTab === 'history'
              ? 'border-accent text-accent'
              : 'border-transparent text-fg-muted hover:text-fg'
          }`}
        >
          {t('leases.historyTab')}
        </button>
      </div>

      {activeTab === 'overview' ? (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-surface border border-border rounded-lg space-y-1 min-w-0">
              <span className="text-xs text-fg-muted font-medium">{t('leases.monthlyRent')}</span>
              <p
                className="text-2xl font-bold num text-fg truncate"
                title={formatMoney(lease.monthlyRentPoisha)}
              >
                {formatMoney(lease.monthlyRentPoisha)}
              </p>
              <span className="text-xs text-fg-muted">{t('leases.perMonth')}</span>
            </div>

            <div className="p-4 bg-surface border border-border rounded-lg space-y-1 min-w-0">
              <span className="text-xs text-fg-muted font-medium">{t('leases.depositHeld')}</span>
              <p
                className="text-2xl font-bold num text-accent truncate"
                title={formatMoney(lease.depositHeldPoisha)}
              >
                {formatMoney(lease.depositHeldPoisha)}
              </p>
              <span
                className="text-xs text-fg-muted truncate block"
                title={t('leases.agreedDeposit', { amount: formatMoney(lease.depositPoisha) })}
              >
                {t('leases.agreedDeposit', { amount: formatMoney(lease.depositPoisha) })}
              </span>
            </div>

            <div className="p-4 bg-surface border border-border rounded-lg space-y-1 min-w-0">
              <span className="text-xs text-fg-muted font-medium">{t('leases.startDate')}</span>
              <p className="text-xl font-bold text-fg">{lease.startDate}</p>
              <span className="text-xs text-fg-muted">
                {t('leases.household')}: {t('leases.personCount', { count: lease.householdSize })}
              </span>
            </div>
          </div>

          {/* Details & Charges */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lease Details */}
            <div className="card min-w-0">
              <div className="card__head">
                <h2 className="card__title">{t('headings.leaseDetail')}</h2>
              </div>
              <dl className="dl sm:dl--grid">
                <div className="dl__row">
                  <dt>{t('leases.reviewUnit')}</dt>
                  <dd>
                    {lease.unit?.floor != null
                      ? t('leases.unitFloorInfo', {
                          label: lease.unit?.label ?? '—',
                          floor: lease.unit.floor,
                          building: lease.unit?.buildingName ?? '',
                        })
                      : t('leases.unitInfo', {
                          label: lease.unit?.label ?? '—',
                          building: lease.unit?.buildingName ?? '',
                        })}
                  </dd>
                </div>
                <div className="dl__row">
                  <dt>{t('leases.household')}</dt>
                  <dd>{lease.householdSize}</dd>
                </div>
                {lease.moveInReading !== null && (
                  <div className="dl__row">
                    <dt>{t('leases.moveInReading')}</dt>
                    <dd className="num">{t('leases.electricityUnits', { count: lease.moveInReading })}</dd>
                  </div>
                )}
                <div className="dl__row">
                  <dt>{t('leases.startDate')}</dt>
                  <dd>{lease.startDate}</dd>
                </div>
                {lease.endDate && (
                  <div className="dl__row">
                    <dt>{t('leases.endDate')}</dt>
                    <dd>{lease.endDate}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Recurring Charges */}
            <div className="card min-w-0">
              <div className="card__head flex flex-wrap items-center justify-between gap-2">
                <h2 className="card__title">{t('leases.chargesTitle')}</h2>
                <span className="text-xs font-semibold num text-fg">
                  {t('leases.totalCharges', {
                    amount: formatMoney(lease.charges.reduce((acc, c) => acc + c.amountPoisha, 0)),
                  })}
                </span>
              </div>
              <div className="space-y-2 min-w-0">
                {lease.charges.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50 text-sm"
                  >
                    <span className="text-fg-secondary truncate min-w-0" title={c.name}>
                      {c.name}
                    </span>
                    <span className="font-semibold num shrink-0">{formatMoney(c.amountPoisha)}</span>
                  </div>
                ))}
                {lease.charges.length === 0 && (
                  <p className="text-xs text-fg-muted italic">{t('leases.noCharges')}</p>
                )}
              </div>
            </div>
          </div>

          {/* Tenants Section */}
          <div className="card min-w-0">
            <div className="card__head">
              <h2 className="card__title">{t('leases.tenants')}</h2>
            </div>
            <div className="space-y-3 min-w-0">
              {lease.tenants.map((tenant) => (
                <div
                  key={tenant.membershipId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-surface border border-border rounded-lg min-w-0"
                >
                  <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
                    <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold shrink-0">
                      {tenant.fullName.slice(0, 1) || 'T'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-fg truncate block" title={tenant.fullName}>
                          {tenant.fullName}
                        </span>
                        {tenant.isPrimary && (
                          <span className="badge badge--neutral text-xs shrink-0">
                            {t('leases.primaryTenant')}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-fg-muted truncate block" title={tenant.email}>
                        {tenant.email}
                      </span>
                    </div>
                  </div>
                  <PrefetchLink
                    to={`/l/tenants/${tenant.membershipId}`}
                    className="btn btn--secondary btn--block sm:btn--sm sm:w-auto shrink-0"
                  >
                    <FileText className="h-4 w-4 mr-1.5" />
                    {t('leases.viewHistory')}
                  </PrefetchLink>
                </div>
              ))}
              {lease.tenants.length === 0 && (
                <p className="text-sm text-fg-muted italic py-2">{t('leases.noTenantsJoined')}</p>
              )}
            </div>
          </div>
        </>
      ) : (
        /* History Tab */
        <div className="card min-w-0">
          <div className="card__head flex flex-wrap items-center justify-between gap-2">
            <h2 className="card__title">{t('leases.depositLedger')}</h2>
            <span className="text-xs font-semibold num text-accent">
              {t('leases.depositHeld')}: {formatMoney(lease.depositHeldPoisha)}
            </span>
          </div>
          <div className="p-4">
            <p className="text-sm text-fg-muted">
              {t('leases.agreedDeposit', { amount: formatMoney(lease.depositPoisha) })} ·{' '}
              {t('leases.depositHeld')}: {formatMoney(lease.depositHeldPoisha)}
            </p>
          </div>
        </div>
      )}

      {/* Deposit Dialog */}
      <RecordDepositDialog
        leaseId={lease.id}
        isOpen={isDepositDialogOpen}
        onClose={() => setIsDepositDialogOpen(false)}
        defaultAmount={
          lease.depositPoisha > lease.depositHeldPoisha ? lease.depositPoisha - lease.depositHeldPoisha : 0
        }
        onSuccess={() => void refetch()}
      />
    </div>
  );
}
