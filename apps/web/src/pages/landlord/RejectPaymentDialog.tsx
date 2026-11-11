import React, { useState, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import { useRejectPayment } from '../../lib/api/payments.js';

export interface RejectPaymentDialogProps {
  paymentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RejectPaymentDialog({ paymentId, isOpen, onClose, onSuccess }: RejectPaymentDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const rejectPayment = useRejectPayment();
  const [reason, setReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !paymentId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmed = reason.trim();
    if (!trimmed) {
      setErrorMessage(t('errors.reasonRequired', 'A reason is required to reject this claim'));
      return;
    }

    try {
      await rejectPayment.mutateAsync({ paymentId, reason: trimmed });
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || t('errors.generic', 'Failed to reject payment'));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className="card w-full max-w-sm p-6 space-y-4 bg-bg border border-border shadow-2xl relative animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-base font-bold text-fg">
            {t('payments.rejectTitle', 'Reject Payment Claim')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('actions.close', 'Close')}
            className="text-fg-muted hover:text-fg p-1 rounded-md"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-fg-muted">
          {t(
            'payments.rejectWarning',
            'Explain to the tenant why this payment claim is being rejected (e.g. invalid TrxID, transfer not received).',
          )}
        </p>

        {errorMessage && (
          <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg flex items-start gap-2 text-xs text-danger">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1.5">
              {t('payments.rejectionReason', 'Rejection Reason')} *
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t(
                'payments.rejectionReasonPlaceholder',
                'e.g. No transaction received with this reference',
              )}
              className="input w-full"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="btn btn--secondary text-xs">
              {t('actions.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={rejectPayment.isPending}
              className="btn btn--danger text-xs flex items-center gap-1.5"
            >
              {rejectPayment.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{t('actions.reject', 'Reject Claim')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
