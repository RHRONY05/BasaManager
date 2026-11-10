import { useState, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertCircle, Check } from 'lucide-react';
import { useRecordDeposit } from '../../lib/api/leases';
import type { DepositEntryKind } from '@bm/shared';

export interface RecordDepositDialogProps {
  leaseId: string;
  isOpen: boolean;
  onClose: () => void;
  defaultAmount?: number;
  onSuccess?: () => void;
}

export function RecordDepositDialog({
  leaseId,
  isOpen,
  onClose,
  defaultAmount,
  onSuccess,
}: RecordDepositDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const recordMutation = useRecordDeposit(leaseId);

  const [kind, setKind] = useState<DepositEntryKind>('received');
  const [amount, setAmount] = useState<number | ''>(defaultAmount ?? 30000);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (amount === '' || Number(amount) <= 0) {
      setError(t('leases.depositAmount') + ' must be greater than 0');
      return;
    }

    try {
      await recordMutation.mutateAsync({
        kind,
        amountPoisha: Math.round(Number(amount) * 100),
        note: note.trim() || undefined,
      });

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('status.error');
      setError(msg);
    }
  };

  return (
    <div className="scrim flex items-center justify-center p-4 z-50">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="dialog w-full max-w-md">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div>
            <h2 id={titleId} className="dialog__title">
              {t('leases.recordDepositTitle')}
            </h2>
            <p className="text-xs text-fg-muted mt-0.5">{t('leases.recordDepositDesc')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn--ghost p-2 min-h-tap min-w-tap"
            aria-label={t('actions.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div role="alert" className="field-error">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="field">
            <label htmlFor="deposit-kind" className="label">
              {t('leases.depositKind')}
            </label>
            <select
              id="deposit-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as DepositEntryKind)}
              className="select"
            >
              <option value="received">{t('leases.kindReceived')}</option>
              <option value="refunded">{t('leases.kindRefunded')}</option>
              <option value="applied_to_dues">{t('leases.kindApplied')}</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="deposit-amount" className="label">
              {t('leases.depositAmount')}
            </label>
            <div className="input-group">
              <span className="input-group__affix">৳</span>
              <input
                id="deposit-amount"
                type="number"
                min={1}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                className="input input--num"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="deposit-note" className="label">
              {t('leases.depositNote')}
            </label>
            <input
              id="deposit-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('leases.depositNotePlaceholder')}
              className="input"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="btn btn--ghost btn--sm">
              {t('actions.cancel')}
            </button>
            <button
              type="submit"
              disabled={recordMutation.isPending}
              aria-busy={recordMutation.isPending}
              className="btn btn--primary btn--sm"
            >
              {recordMutation.isPending ? (
                <>
                  <span className="spinner mr-2" aria-hidden="true" />
                  {t('leases.creating')}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1.5" />
                  {t('leases.saveDeposit')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
