import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Calendar, AlertTriangle, PlusCircle, FileText, Sparkles, Ban } from 'lucide-react';
import {
  useBill,
  useIssueBill,
  useAddAdjustment,
  useWaiveLateFee,
  useVoidBill,
} from '../../lib/api/billing.js';
import { formatMoney, formatNumber } from '../../lib/format.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { useAuth } from '../../app/auth/AuthContext.js';

export default function BillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isLandlord = role === 'landlord';

  const { data: bill, isPending, isError, error, refetch } = useBill(id);

  // Mutations
  const issueBill = useIssueBill();
  const addAdjustment = useAddAdjustment();
  const waiveLateFee = useWaiveLateFee();
  const voidBill = useVoidBill();

  // Dialog states
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');

  const [showWaiveDialog, setShowWaiveDialog] = useState(false);
  const [waiveReason, setWaiveReason] = useState('');

  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  if (isPending) {
    return (
      <div data-skeleton aria-busy="true" className="space-y-6 max-w-3xl">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !bill) {
    return <ErrorState message={error?.message ?? t('status.error')} onRetry={() => void refetch()} />;
  }

  const handleIssue = async () => {
    if (!id) return;
    await issueBill.mutateAsync(id);
  };

  const handleAddAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !adjustmentAmount || !adjustmentReason.trim()) return;
    await addAdjustment.mutateAsync({
      billId: id,
      data: {
        amountPoisha: parseInt(adjustmentAmount, 10),
        reason: adjustmentReason.trim(),
      },
    });
    setShowAdjustmentDialog(false);
    setAdjustmentAmount('');
    setAdjustmentReason('');
  };

  const handleWaiveLateFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !waiveReason.trim()) return;
    await waiveLateFee.mutateAsync({
      billId: id,
      data: {
        reason: waiveReason.trim(),
      },
    });
    setShowWaiveDialog(false);
    setWaiveReason('');
  };

  const handleVoidBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    await voidBill.mutateAsync({
      billId: id,
      data: {
        reason: voidReason.trim() || undefined,
      },
    });
    setShowVoidDialog(false);
    setVoidReason('');
  };

  const hasLateFeeLine = bill.lines?.some((l) => l.kind === 'late_fee' && l.amountPoisha > 0);

  return (
    <div className="space-y-6 max-w-3xl min-w-0">
      {/* Back button */}
      <div>
        <button
          type="button"
          className="text-xs text-fg-muted hover:text-fg flex items-center gap-1.5 transition-colors font-medium"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" />
          {t('actions.back', 'Back')}
        </button>
      </div>

      {/* Bill Header Card */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-fg">
                {t('billing.billFor', {
                  unit: bill.unitLabel
                    ? t('billing.unitLabel', { label: bill.unitLabel })
                    : bill.leaseId.slice(0, 8),
                  month: bill.periodMonth.slice(0, 7),
                })}
              </h1>
              <span
                className={`badge text-xs capitalize ${
                  bill.status === 'paid'
                    ? 'badge--success'
                    : bill.status === 'partially_paid'
                      ? 'badge--warning'
                      : bill.status === 'void'
                        ? 'badge--neutral'
                        : 'badge--neutral'
                }`}
              >
                {t(`billing.status.${bill.status}`)}
              </span>
              {bill.overdue && (
                <span className="badge badge--danger text-xs">{t('billing.status.overdue')}</span>
              )}
            </div>
            <p className="text-xs text-fg-muted mt-1 flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                {t('billing.dueDate')}: {bill.dueDate}
              </span>
              {bill.issuedAt && (
                <>
                  <span>•</span>
                  <span>
                    {t('billing.issuedAt', 'Issued')}: {bill.issuedAt.slice(0, 10)}
                  </span>
                </>
              )}
            </p>
          </div>

          {/* Action buttons (Landlord only) */}
          {isLandlord && (
            <div className="flex flex-wrap items-center gap-2">
              {bill.status === 'draft' && (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={bill.needsReading || issueBill.isPending}
                  onClick={handleIssue}
                >
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  {t('billing.issue')}
                </button>
              )}

              {bill.status !== 'paid' && bill.status !== 'void' && (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setShowAdjustmentDialog(true)}
                >
                  <PlusCircle className="h-4 w-4 mr-1.5" />
                  {t('billing.addAdjustment')}
                </button>
              )}

              {hasLateFeeLine && (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm text-warning"
                  onClick={() => setShowWaiveDialog(true)}
                >
                  <AlertTriangle className="h-4 w-4 mr-1.5" />
                  {t('billing.waiveLateFee')}
                </button>
              )}

              {bill.status !== 'void' && Number(bill.paidPoisha) === 0 && (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm text-danger"
                  onClick={() => setShowVoidDialog(true)}
                >
                  <Ban className="h-4 w-4 mr-1.5" />
                  {t('billing.void')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Financial KPI bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-border/50 text-sm">
          <div>
            <span className="text-xs text-fg-muted">{t('billing.total')}</span>
            <p className="font-bold num text-base text-fg">{formatMoney(bill.totalPoisha)}</p>
          </div>
          <div>
            <span className="text-xs text-fg-muted">{t('billing.paid')}</span>
            <p className="font-bold num text-base text-fg-muted">{formatMoney(bill.paidPoisha)}</p>
          </div>
          <div className="col-span-2 sm:col-span-2">
            <span className="text-xs text-fg-muted">{t('billing.balance')}</span>
            <p className={`font-bold num text-lg ${bill.balancePoisha > 0 ? 'text-accent' : 'text-fg'}`}>
              {formatMoney(bill.balancePoisha)}
            </p>
          </div>
        </div>
      </div>

      {/* Bill Lines */}
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

      {/* Adjustment Dialog */}
      {showAdjustmentDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-fg">{t('billing.addAdjustment')}</h2>
            <form onSubmit={handleAddAdjustment} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-fg-muted block mb-1">
                  {t('billing.adjustmentAmount')}
                </label>
                <input
                  type="number"
                  className="input w-full num"
                  placeholder="e.g. 50000 or -25000"
                  value={adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(e.target.value)}
                  required
                />
                <span className="text-xs text-fg-muted block mt-1">{t('billing.discountHint')}</span>
              </div>

              <div>
                <label className="text-xs font-semibold text-fg-muted block mb-1">
                  {t('billing.reason')}
                </label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder={t('billing.reasonPlaceholder')}
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setShowAdjustmentDialog(false)}
                >
                  {t('actions.cancel', 'Cancel')}
                </button>
                <button type="submit" className="btn btn--primary btn--sm" disabled={addAdjustment.isPending}>
                  {t('actions.save', 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Waive Late Fee Dialog */}
      {showWaiveDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-fg">{t('billing.waiveLateFee')}</h2>
            <form onSubmit={handleWaiveLateFee} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-fg-muted block mb-1">
                  {t('billing.reason')}
                </label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder={t('billing.reasonPlaceholder')}
                  value={waiveReason}
                  onChange={(e) => setWaiveReason(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setShowWaiveDialog(false)}
                >
                  {t('actions.cancel', 'Cancel')}
                </button>
                <button type="submit" className="btn btn--primary btn--sm" disabled={waiveLateFee.isPending}>
                  {t('billing.waiveLateFee')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Void Dialog */}
      {showVoidDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-fg">{t('billing.void')}</h2>
            <p className="text-sm text-fg-muted">{t('billing.voidConfirm')}</p>
            <form onSubmit={handleVoidBill} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-fg-muted block mb-1">
                  {t('billing.reason')} ({t('common.optional', 'Optional')})
                </label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder={t('billing.reasonPlaceholder')}
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setShowVoidDialog(false)}
                >
                  {t('actions.cancel', 'Cancel')}
                </button>
                <button type="submit" className="btn btn--danger btn--sm" disabled={voidBill.isPending}>
                  {t('billing.void')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
