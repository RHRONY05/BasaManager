import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, User, Plus, Mail, RefreshCw, FileText } from 'lucide-react';
import { useLease, useResendInvite } from '../../lib/api/leases';
import { RecordDepositDialog } from './RecordDepositDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

export default function LeaseDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { t } = useTranslation();

  const { data: lease, isPending, isError, error, refetch } = useLease(id);
  const resendMutation = useResendInvite(id);

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

  const formatMoney = (poisha: number) => {
    const bdt = Math.round(poisha / 100);
    return `৳${bdt.toLocaleString('en-US')}`;
  };

  const handleResend = async () => {
    try {
      await resendMutation.mutateAsync();
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 4000);
    } catch {
      // handled by mutation
    }
  };

  const primaryTenant = lease.tenants.find((t) => t.isPrimary) ?? lease.tenants[0];

  return (
    <div className="space-y-6 max-w-5xl min-w-0">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-fg-muted">
        <Link to="/l/buildings" className="hover:text-fg transition-colors">
          {t('headings.buildings')}
        </Link>
        {lease.unit?.buildingId && (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <Link
              to={`/l/buildings/${lease.unit.buildingId}`}
              className="hover:text-fg transition-colors truncate max-w-xs"
            >
              {lease.unit.buildingName || 'Building'}
            </Link>
          </>
        )}
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span aria-current="page" className="text-fg font-medium">
          {t('headings.leaseDetail')}
        </span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <p className="text-xs uppercase tracking-wider text-fg-muted font-bold">
            {t('headings.leaseDetail')}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-fg truncate">
            Unit {lease.unit?.label ?? '—'}
            {lease.unit?.buildingName ? ` · ${lease.unit.buildingName}` : ''}
          </h1>
          <p className="text-sm text-fg-muted flex items-center gap-2">
            <User className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span>
              {primaryTenant?.fullName || 'Pending Tenant'} ({primaryTenant?.email || 'Invitation sent'})
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {lease.status === 'pending' ? (
            <span className="badge badge--warning">{t('leases.status.pending')}</span>
          ) : lease.status === 'active' ? (
            <span className="badge badge--success">{t('leases.status.active')}</span>
          ) : lease.status === 'notice' ? (
            <span className="badge badge--warning">{t('leases.status.notice')}</span>
          ) : (
            <span className="badge badge--neutral">{t('leases.status.ended')}</span>
          )}

          <button
            type="button"
            onClick={() => setIsDepositDialogOpen(true)}
            className="btn btn--primary btn--sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            {t('leases.recordDeposit')}
          </button>
        </div>
      </div>

      {/* Pending Invitation Alert */}
      {lease.status === 'pending' && (
        <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Mail className="h-5 w-5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-sm text-fg">{t('leases.status.pending')}</h2>
              <p className="text-xs text-fg-muted">{t('leases.pendingInviteAlert')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendMutation.isPending}
            className="btn btn--secondary btn--sm shrink-0"
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

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-surface border border-border rounded-lg space-y-1">
          <span className="text-xs text-fg-muted font-medium">{t('leases.monthlyRent')}</span>
          <p className="text-2xl font-bold num text-fg">{formatMoney(lease.monthlyRentPoisha)}</p>
          <span className="text-xs text-fg-muted">per month</span>
        </div>

        <div className="p-4 bg-surface border border-border rounded-lg space-y-1">
          <span className="text-xs text-fg-muted font-medium">{t('leases.depositHeld')}</span>
          <p className="text-2xl font-bold num text-accent">{formatMoney(lease.depositHeldPoisha)}</p>
          <span className="text-xs text-fg-muted">agreed: {formatMoney(lease.depositPoisha)}</span>
        </div>

        <div className="p-4 bg-surface border border-border rounded-lg space-y-1">
          <span className="text-xs text-fg-muted font-medium">{t('leases.startDate')}</span>
          <p className="text-xl font-bold text-fg">{lease.startDate}</p>
          <span className="text-xs text-fg-muted">
            household: {lease.householdSize} {lease.householdSize === 1 ? 'person' : 'people'}
          </span>
        </div>
      </div>

      {/* Details & Charges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Lease Details */}
        <div className="card">
          <div className="card__head">
            <h2 className="card__title">{t('headings.leaseDetail')}</h2>
          </div>
          <dl className="dl dl--grid p-4">
            <div className="dl__row">
              <dt>{t('leases.reviewUnit')}</dt>
              <dd>
                Unit {lease.unit?.label} (Floor {lease.unit?.floor ?? 1})
              </dd>
            </div>
            <div className="dl__row">
              <dt>{t('leases.household')}</dt>
              <dd>{lease.householdSize}</dd>
            </div>
            {lease.moveInReading !== null && (
              <div className="dl__row">
                <dt>{t('leases.moveInReading')}</dt>
                <dd className="num">{lease.moveInReading} units</dd>
              </div>
            )}
            <div className="dl__row">
              <dt>{t('leases.startDate')}</dt>
              <dd>{lease.startDate}</dd>
            </div>
            {lease.endDate && (
              <div className="dl__row">
                <dt>End date</dt>
                <dd>{lease.endDate}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Recurring Charges */}
        <div className="card">
          <div className="card__head flex items-center justify-between">
            <h2 className="card__title">{t('leases.chargesTitle')}</h2>
            <span className="text-xs font-semibold num text-fg">
              Total: {formatMoney(lease.charges.reduce((acc, c) => acc + c.amountPoisha, 0))}
            </span>
          </div>
          <div className="p-4 space-y-2">
            {lease.charges.map((c) => (
              <div key={c.id} className="flex justify-between py-1.5 border-b border-border/50 text-sm">
                <span className="text-fg-secondary">{c.name}</span>
                <span className="font-semibold num">{formatMoney(c.amountPoisha)}</span>
              </div>
            ))}
            {lease.charges.length === 0 && (
              <p className="text-xs text-fg-muted italic">{t('leases.noCharges')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Tenants Section */}
      <div className="card">
        <div className="card__head">
          <h2 className="card__title">{t('leases.tenants')}</h2>
        </div>
        <div className="p-4 space-y-3">
          {lease.tenants.map((tenant) => (
            <div
              key={tenant.membershipId}
              className="flex items-center justify-between p-3 bg-surface border border-border rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold">
                  {tenant.fullName.slice(0, 1) || 'T'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-fg">{tenant.fullName}</span>
                    {tenant.isPrimary && (
                      <span className="badge badge--neutral text-xs">{t('leases.primaryTenant')}</span>
                    )}
                  </div>
                  <span className="text-xs text-fg-muted">{tenant.email}</span>
                </div>
              </div>
              <Link to={`/l/tenants/${tenant.membershipId}`} className="btn btn--secondary btn--sm">
                <FileText className="h-4 w-4 mr-1.5" />
                {t('leases.viewHistory')}
              </Link>
            </div>
          ))}
          {lease.tenants.length === 0 && (
            <p className="text-sm text-fg-muted italic py-2">
              No tenants joined yet. Waiting for invitation acceptance.
            </p>
          )}
        </div>
      </div>

      {/* Deposit Dialog */}
      <RecordDepositDialog
        leaseId={lease.id}
        isOpen={isDepositDialogOpen}
        onClose={() => setIsDepositDialogOpen(false)}
        defaultAmount={
          lease.depositPoisha > lease.depositHeldPoisha
            ? Math.round((lease.depositPoisha - lease.depositHeldPoisha) / 100)
            : Math.round(lease.depositPoisha / 100)
        }
        onSuccess={() => void refetch()}
      />
    </div>
  );
}
