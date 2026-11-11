import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Calendar, FileText, CheckCircle2, Download, CreditCard, Clock } from 'lucide-react';
import { useBill } from '../../lib/api/billing.js';
import { usePayments, getReceiptDownloadUrl } from '../../lib/api/payments.js';
import { formatMoney, formatNumber } from '../../lib/format.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { useToast } from '../../components/ui/Toast.js';
import { ClaimPaymentDialog } from './ClaimPaymentDialog.js';

export default function TenantBillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [claimOpen, setClaimOpen] = useState(false);

  const { data: bill, isPending, isError, error, refetch } = useBill(id);
  const { data: paymentsData, refetch: refetchPayments } = usePayments(
    bill ? { leaseId: bill.leaseId } : undefined,
  );

  const payments = Array.isArray(paymentsData) ? paymentsData : [];

  if (isPending) {
    return (
      <div data-skeleton aria-busy="true" className="space-y-6 max-w-xl">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !bill) {
    return <ErrorState message={error?.message ?? t('status.error')} onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-6 max-w-xl min-w-0">
      <div>
        <button
          type="button"
          className="text-xs text-fg-muted hover:text-fg flex items-center gap-1.5 transition-colors font-medium min-h-tap"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" />
          {t('actions.back', 'Back')}
        </button>
      </div>

      {/* Header */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-fg">{bill.periodMonth.slice(0, 7)}</h1>
            <p className="text-xs text-fg-muted mt-1 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                {t('billing.dueDate')}: {bill.dueDate}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`badge text-xs capitalize ${
                bill.status === 'paid'
                  ? 'badge--success'
                  : bill.status === 'partially_paid'
                    ? 'badge--warning'
                    : 'badge--neutral'
              }`}
            >
              {t(`billing.status.${bill.status}`)}
            </span>
            {bill.overdue && (
              <span className="badge badge--danger text-xs">{t('billing.status.overdue')}</span>
            )}
          </div>
        </div>

        {/* Financial KPI */}
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/50 text-sm">
          <div>
            <span className="text-xs text-fg-muted">{t('billing.total')}</span>
            <p className="font-bold num text-sm sm:text-base text-fg">{formatMoney(bill.totalPoisha)}</p>
          </div>
          <div>
            <span className="text-xs text-fg-muted">{t('billing.paid')}</span>
            <p className="font-bold num text-sm sm:text-base text-fg-muted">{formatMoney(bill.paidPoisha)}</p>
          </div>
          <div>
            <span className="text-xs text-fg-muted">{t('billing.balance')}</span>
            <p
              className={`font-bold num text-sm sm:text-base ${
                bill.balancePoisha > 0 ? 'text-accent' : 'text-fg'
              }`}
            >
              {formatMoney(bill.balancePoisha)}
            </p>
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="card divide-y divide-border/60">
        <div className="p-4 bg-muted/40 font-semibold text-xs text-fg-muted uppercase tracking-wider flex justify-between">
          <span>{t('billing.lineItems', 'Line Items')}</span>
          <span>{t('billing.amount', 'Amount')}</span>
        </div>

        {bill.lines && bill.lines.length > 0 ? (
          bill.lines.map((line) => {
            const meta = line.meta as Record<string, unknown> | undefined;
            return (
              <div key={line.id} className="p-4 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-fg">{line.label}</span>
                    <span className="badge badge--neutral text-xs capitalize">
                      {t(`billing.lines.${line.kind}`, line.kind)}
                    </span>
                  </div>

                  {line.kind === 'electricity' && meta && (
                    <p className="text-xs text-fg-muted">
                      {t(
                        meta.meterReplaced
                          ? 'billing.electricityExplainReplaced'
                          : 'billing.electricityExplain',
                        {
                          prev: formatNumber(Number(meta.prev)),
                          curr: formatNumber(Number(meta.curr)),
                          units: formatNumber(Number(meta.units)),
                          rate: formatMoney(Number(meta.ratePoisha), { forceDecimals: true }),
                        },
                      )}
                    </p>
                  )}

                  {meta && typeof meta.factor === 'number' && meta.factor < 1 && (
                    <p className="text-xs text-fg-muted">
                      {t('billing.prorated', 'Prorated factor')}: {meta.factor.toFixed(4)}
                    </p>
                  )}

                  {line.reason && <p className="text-xs text-fg-muted italic">"{line.reason}"</p>}
                </div>

                <div className="text-right">
                  <p className="font-bold num text-sm text-fg">{formatMoney(line.amountPoisha)}</p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-6 text-center text-sm text-fg-muted">
            <FileText className="h-6 w-6 mx-auto mb-1 text-fg-muted" />
            {t('billing.noLines', 'No bill lines found')}
          </div>
        )}
      </div>

      {bill.status === 'paid' ? (
        <div className="card p-4 flex items-center gap-3 bg-success/10 border-success/30">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
          <p className="text-xs text-fg">{t('billing.allPaidDesc')}</p>
        </div>
      ) : (
        <div className="card p-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-accent/5 border-accent/20">
          <div>
            <p className="text-xs font-semibold text-fg">
              {t('payments.unpaidBanner', 'Remaining balance due: ')}
              <span className="text-accent">{formatMoney(bill.balancePoisha)}</span>
            </p>
            <p className="text-xs text-fg-muted mt-0.5">
              {t(
                'payments.unpaidHint',
                'Paid via bKash, Nagad, bank or cash? Submit a claim for staff to confirm.',
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setClaimOpen(true)}
            className="btn btn--primary text-xs w-full sm:w-auto shrink-0 flex items-center gap-1.5"
          >
            <CreditCard className="h-3.5 w-3.5" />
            <span>{t('payments.claimAction', 'Submit Payment Claim')}</span>
          </button>
        </div>
      )}

      {/* Payment History & Receipts */}
      <div className="card divide-y divide-border/60">
        <div className="p-4 bg-muted/40 font-semibold text-xs text-fg-muted uppercase tracking-wider flex justify-between items-center">
          <span>{t('payments.history', 'Payments & Claims')}</span>
          <span className="text-xs font-normal lowercase">{payments.length} record(s)</span>
        </div>

        {payments.length > 0 ? (
          payments.map((p) => (
            <div
              key={p.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-fg text-sm">{formatMoney(p.amountPoisha)}</span>
                  <span className="capitalize text-fg-muted font-medium">({p.method})</span>
                  <span
                    className={`badge text-xs capitalize ${
                      p.status === 'confirmed'
                        ? 'badge--success'
                        : p.status === 'pending_claim'
                          ? 'badge--warning'
                          : 'badge--danger'
                    }`}
                  >
                    {p.status === 'pending_claim'
                      ? t('payments.pendingStatus', 'Pending Verification')
                      : p.status}
                  </span>
                </div>
                <p className="text-fg-muted flex flex-wrap items-center gap-1 break-words">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>{p.paidOn}</span>
                  {p.reference && <span className="break-all">· Ref: {p.reference}</span>}
                </p>
                {p.rejectedReason && (
                  <p className="text-danger italic break-words">
                    {t('payments.reason', 'Reason')}: {p.rejectedReason}
                  </p>
                )}
              </div>

              {p.receipt && p.status === 'confirmed' && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await getReceiptDownloadUrl(p.receipt!.id);
                      if ('downloadUrl' in res) {
                        window.open(res.downloadUrl, '_blank');
                      }
                    } catch (err: unknown) {
                      showToast((err as Error).message || 'Failed to download receipt', 'error');
                    }
                  }}
                  className="btn btn--secondary text-xs flex items-center gap-1.5 shrink-0 self-start sm:self-auto min-h-tap"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{t('payments.receipt', 'Receipt')}</span>
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="p-4 text-center text-xs text-fg-muted">
            {t('payments.noPayments', 'No payment claims submitted yet')}
          </div>
        )}
      </div>

      {bill && (
        <ClaimPaymentDialog
          leaseId={bill.leaseId}
          defaultAmountTaka={bill.balancePoisha > 0 ? bill.balancePoisha / 100 : undefined}
          isOpen={claimOpen}
          onClose={() => setClaimOpen(false)}
          onSuccess={() => {
            void refetch();
            void refetchPayments();
          }}
        />
      )}
    </div>
  );
}
