import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CreditCard,
  Plus,
  Check,
  X,
  Download,
  Ban,
  FileImage,
  Clock,
  Loader2,
  Building as BuildingIcon,
} from 'lucide-react';
import { useAuth } from '../../app/auth/AuthContext.js';
import {
  usePayments,
  useConfirmPayment,
  getReceiptDownloadUrl,
  getFileSignedUrl,
} from '../../lib/api/payments.js';
import { useBuildings } from '../../lib/api/buildings.js';
import { formatMoney } from '../../lib/format.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { RecordPaymentDialog } from './RecordPaymentDialog.js';
import { RejectPaymentDialog } from './RejectPaymentDialog.js';
import { VoidPaymentDialog } from './VoidPaymentDialog.js';
import type { PaymentStatus } from '@bm/shared/api/payments';

export default function PaymentsPage() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const isLandlord = role === 'landlord';

  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [recordOpen, setRecordOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<{ id: string; receiptNumber?: string | null } | null>(null);

  const { data: buildings = [] } = useBuildings();
  const confirmPayment = useConfirmPayment();

  // Fetch pending claims
  const {
    data: pendingData,
    isPending: pendingLoading,
    isError: pendingError,
    error: pendingErr,
    refetch: refetchPending,
  } = usePayments({
    status: 'pending_claim',
    buildingId: selectedBuildingId || undefined,
  });

  // Fetch history payments
  const {
    data: historyData,
    isPending: historyLoading,
    isError: historyError,
    error: historyErr,
    refetch: refetchHistory,
  } = usePayments({
    status: statusFilter === 'all' ? undefined : (statusFilter as PaymentStatus),
    buildingId: selectedBuildingId || undefined,
  });

  const pendingClaims = Array.isArray(pendingData) ? pendingData : [];
  const historyPayments = Array.isArray(historyData) ? historyData : [];

  const handleConfirm = async (paymentId: string) => {
    try {
      await confirmPayment.mutateAsync(paymentId);
      void refetchPending();
      void refetchHistory();
    } catch (err: unknown) {
      alert((err as Error).message || 'Failed to confirm payment');
    }
  };

  const handleDownloadReceipt = async (receiptId: string) => {
    try {
      const res = await getReceiptDownloadUrl(receiptId);
      if ('downloadUrl' in res) {
        window.open(res.downloadUrl, '_blank');
      } else if ('status' in res && res.status === 'rendering') {
        alert(t('payments.renderingPdf', 'Receipt PDF is rendering, please check again in a few moments.'));
      }
    } catch (err: unknown) {
      alert((err as Error).message || 'Failed to get receipt download URL');
    }
  };

  const handleViewProof = async (proofFileId: string) => {
    try {
      const res = await getFileSignedUrl(proofFileId);
      window.open(res.url, '_blank');
    } catch (err: unknown) {
      alert((err as Error).message || 'Failed to open proof photo');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl min-w-0">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-fg break-words">
            {t('headings.payments', 'Payments & Receipts')}
          </h1>
          <p className="text-xs text-fg-muted mt-1">
            {t(
              'payments.staffSubtitle',
              'Verify incoming tenant claims, record cash/bank collections, and issue sequential receipts.',
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setRecordOpen(true)}
          className="btn btn--primary text-xs flex items-center gap-2 self-start sm:self-auto shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>{t('payments.recordPayment', 'Record Payment')}</span>
        </button>
      </div>

      {/* Building Filter & Tabs Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'pending'
                ? 'bg-accent text-accent-fg'
                : 'text-fg-muted hover:text-fg hover:bg-muted'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>{t('payments.pendingClaims', 'Pending Claims')}</span>
            {pendingClaims.length > 0 && (
              <span className="badge badge--warning text-xs px-1.5 py-0.5 rounded-full">
                {pendingClaims.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'history'
                ? 'bg-accent text-accent-fg'
                : 'text-fg-muted hover:text-fg hover:bg-muted'
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" />
            <span>{t('payments.allHistory', 'Payment History')}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'history' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input text-xs py-1 px-2.5"
            >
              <option value="all">{t('status.all', 'All Statuses')}</option>
              <option value="confirmed">{t('status.confirmed', 'Confirmed')}</option>
              <option value="pending_claim">{t('status.pending', 'Pending Claim')}</option>
              <option value="rejected">{t('status.rejected', 'Rejected')}</option>
              <option value="void">{t('status.void', 'Void')}</option>
            </select>
          )}

          {buildings.length > 1 && (
            <div className="flex items-center gap-1.5">
              <BuildingIcon className="h-3.5 w-3.5 text-fg-muted" />
              <select
                value={selectedBuildingId}
                onChange={(e) => setSelectedBuildingId(e.target.value)}
                className="input text-xs py-1 px-2.5"
              >
                <option value="">{t('actions.allBuildings', 'All Buildings')}</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Tab: Pending Claims Queue */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          {pendingLoading ? (
            <div data-skeleton aria-busy="true" className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : pendingError ? (
            <ErrorState
              message={pendingErr?.message ?? t('status.error')}
              onRetry={() => void refetchPending()}
            />
          ) : pendingClaims.length === 0 ? (
            <div className="card p-12 text-center space-y-2">
              <Clock className="h-8 w-8 text-fg-muted mx-auto" />
              <p className="font-semibold text-fg">
                {t('payments.noPending', 'No pending claims waiting for verification')}
              </p>
              <p className="text-xs text-fg-muted">
                {t(
                  'payments.noPendingDesc',
                  'When tenants pay outside the app and submit claims, they will appear here.',
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingClaims.map((claim) => (
                <div
                  key={claim.id}
                  className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 border-l-warning"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-fg">{formatMoney(claim.amountPoisha)}</span>
                      <span className="badge badge--warning text-xs capitalize font-semibold">
                        {claim.method}
                      </span>
                      {claim.unitLabel && (
                        <span className="badge badge--neutral text-xs">Unit {claim.unitLabel}</span>
                      )}
                      {claim.buildingName && (
                        <span className="text-xs text-fg-muted">({claim.buildingName})</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
                      <span>Paid: {claim.paidOn}</span>
                      {claim.reference && <span className="font-mono">Ref: {claim.reference}</span>}
                    </div>

                    {claim.proofFileId && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => handleViewProof(claim.proofFileId!)}
                          className="text-xs text-accent hover:underline flex items-center gap-1 font-medium"
                        >
                          <FileImage className="h-3.5 w-3.5" />
                          <span>{t('payments.viewProof', 'View Proof Screenshot')}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    <button
                      type="button"
                      disabled={confirmPayment.isPending}
                      onClick={() => handleConfirm(claim.id)}
                      className="btn btn--primary text-xs flex items-center gap-1.5"
                    >
                      {confirmPayment.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      <span>{t('actions.confirm', 'Confirm')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRejectId(claim.id)}
                      className="btn btn--secondary text-xs text-danger hover:bg-danger/10 border-danger/30 flex items-center gap-1.5"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>{t('actions.reject', 'Reject')}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Payment History */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {historyLoading ? (
            <div data-skeleton aria-busy="true" className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : historyError ? (
            <ErrorState
              message={historyErr?.message ?? t('status.error')}
              onRetry={() => void refetchHistory()}
            />
          ) : historyPayments.length === 0 ? (
            <div className="card p-12 text-center text-fg-muted space-y-2">
              <CreditCard className="h-8 w-8 text-fg-muted mx-auto" />
              <p className="font-semibold text-fg">{t('payments.emptyHistory', 'No payments found')}</p>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b border-border text-fg-muted uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Unit & Building</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Method</th>
                    <th className="p-3">Ref</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Receipt</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {historyPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3 whitespace-nowrap">{p.paidOn}</td>
                      <td className="p-3 whitespace-nowrap font-medium text-fg">
                        Unit {p.unitLabel || '—'}{' '}
                        {p.buildingName && (
                          <span className="text-fg-muted font-normal">({p.buildingName})</span>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap font-bold num text-fg">
                        {formatMoney(p.amountPoisha)}
                      </td>
                      <td className="p-3 whitespace-nowrap capitalize">{p.method}</td>
                      <td className="p-3 whitespace-nowrap font-mono text-xs text-fg-muted">
                        {p.reference || '—'}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`badge text-xs capitalize ${
                            p.status === 'confirmed'
                              ? 'badge--success'
                              : p.status === 'pending_claim'
                                ? 'badge--warning'
                                : 'badge--danger'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap font-mono text-xs">
                        {p.receipt ? p.receipt.number : '—'}
                      </td>
                      <td className="p-3 whitespace-nowrap text-right space-x-2">
                        {p.receipt && p.status === 'confirmed' && (
                          <button
                            type="button"
                            onClick={() => handleDownloadReceipt(p.receipt!.id)}
                            className="btn btn--secondary text-xs py-1 px-2 inline-flex items-center gap-1"
                          >
                            <Download className="h-3 w-3" />
                            <span>PDF</span>
                          </button>
                        )}

                        {isLandlord && p.status === 'confirmed' && (
                          <button
                            type="button"
                            onClick={() => setVoidTarget({ id: p.id, receiptNumber: p.receipt?.number })}
                            className="btn btn--secondary text-xs py-1 px-2 text-danger hover:bg-danger/10 border-danger/30 inline-flex items-center gap-1"
                          >
                            <Ban className="h-3 w-3" />
                            <span>Void</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <RecordPaymentDialog
        isOpen={recordOpen}
        onClose={() => setRecordOpen(false)}
        onSuccess={() => {
          void refetchPending();
          void refetchHistory();
        }}
      />

      <RejectPaymentDialog
        paymentId={rejectId}
        isOpen={Boolean(rejectId)}
        onClose={() => setRejectId(null)}
        onSuccess={() => {
          void refetchPending();
          void refetchHistory();
        }}
      />

      <VoidPaymentDialog
        paymentId={voidTarget?.id || null}
        receiptNumber={voidTarget?.receiptNumber}
        isOpen={Boolean(voidTarget)}
        onClose={() => setVoidTarget(null)}
        onSuccess={() => {
          void refetchHistory();
          void refetchPending();
        }}
      />
    </div>
  );
}
