import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { useVoidPayment } from '../../lib/api/payments.js';

export interface VoidPaymentDialogProps {
  paymentId: string | null;
  receiptNumber?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function VoidPaymentDialog({
  paymentId,
  receiptNumber,
  isOpen,
  onClose,
  onSuccess,
}: VoidPaymentDialogProps) {
  const { t } = useTranslation();
  const voidPayment = useVoidPayment();
  const [reason, setReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !paymentId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmed = reason.trim();
    if (!trimmed) {
      setErrorMessage(t('errors.reasonRequired', 'A reason is required to void this payment'));
      return;
    }

    try {
      await voidPayment.mutateAsync({ paymentId, reason: trimmed });
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || t('errors.generic', 'Failed to void payment'));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className="card w-full max-w-md p-6 space-y-4 bg-bg border border-border shadow-2xl relative animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-danger shrink-0" />
            <h2 className="text-base font-bold text-fg">
              {t('payments.voidTitle', 'Void Recorded Payment')}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-fg-muted hover:text-fg p-1 rounded-md">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-xs text-danger space-y-1">
          <p className="font-semibold">{t('payments.voidRuleTitle', 'Rule 6 Reversal Notice')}</p>
          <p>
            {t(
              'payments.voidRuleExplain',
              'Voiding this payment will permanently remove its allocations from all bills, reverse any overpayment credits, re-open affected bills as unpaid, and mark receipt {{receipt}} as VOID.',
              { receipt: receiptNumber || '' },
            )}
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-xs text-danger">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1.5">
              {t('payments.voidReason', 'Reason for Voiding')} *
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Payment recorded twice by mistake / cheque bounced"
              className="input w-full"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="btn btn--secondary text-xs">
              {t('actions.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={voidPayment.isPending}
              className="btn btn--danger text-xs flex items-center gap-1.5"
            >
              {voidPayment.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{t('actions.confirmVoid', 'Confirm Void')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
