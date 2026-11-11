import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useRecordPayment, uploadFile } from '../../lib/api/payments.js';
import { useLeases } from '../../lib/api/leases.js';
import type { LeaseDto } from '@bm/shared/api/leases';
type ManualMethod = 'cash' | 'bkash' | 'nagad' | 'bank';

export interface RecordPaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RecordPaymentDialog({ isOpen, onClose, onSuccess }: RecordPaymentDialogProps) {
  const { t } = useTranslation();
  const recordPayment = useRecordPayment();
  const { data: leases = [] } = useLeases({ status: 'active' });

  const [leaseId, setLeaseId] = useState('');
  const [amountTaka, setAmountTaka] = useState('');
  const [method, setMethod] = useState<ManualMethod>('cash');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofFileId, setProofFileId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage(t('errors.fileTooLarge', 'Proof photo must be smaller than 5 MB'));
      return;
    }

    setProofFile(file);
    setIsUploading(true);
    setErrorMessage(null);

    try {
      const res = await uploadFile(file, 'payment_proof');
      setProofFileId(res.fileId);
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || t('errors.uploadFailed', 'Failed to upload photo'));
      setProofFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!leaseId) {
      setErrorMessage(t('errors.selectLease', 'Please select a unit/lease'));
      return;
    }

    const takaNum = parseFloat(amountTaka);
    if (isNaN(takaNum) || takaNum <= 0) {
      setErrorMessage(t('errors.invalidAmount', 'Please enter a valid amount'));
      return;
    }

    const amountPoisha = Math.round(takaNum * 100);

    try {
      await recordPayment.mutateAsync({
        leaseId,
        amountPoisha,
        method,
        reference: reference.trim() || undefined,
        paidOn,
        proofFileId: proofFileId || undefined,
      });

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || t('errors.generic', 'Failed to record payment'));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className="card w-full max-w-md p-6 space-y-5 bg-bg border border-border shadow-2xl relative animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-fg">{t('payments.recordTitle', 'Record Payment')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-muted hover:text-fg p-1 rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg flex items-start gap-2.5 text-xs text-danger">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1.5">
              {t('payments.selectUnit', 'Select Unit / Tenant')} *
            </label>
            <select
              required
              value={leaseId}
              onChange={(e) => setLeaseId(e.target.value)}
              className="input w-full"
            >
              <option value="">{t('actions.select', '-- Select Active Lease --')}</option>
              {leases.map((l: LeaseDto) => (
                <option key={l.id} value={l.id}>
                  {l.unit?.buildingName ? `${l.unit.buildingName} - ` : ''}
                  Unit {l.unit?.label || l.unitId} ({l.tenants?.[0]?.fullName || 'Active Tenant'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1.5">
              {t('payments.amount', 'Amount (৳)')} *
            </label>
            <input
              type="number"
              step="any"
              min="1"
              required
              value={amountTaka}
              onChange={(e) => setAmountTaka(e.target.value)}
              placeholder="e.g. 20000"
              className="input w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1.5">
                {t('payments.method', 'Payment Method')} *
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as ManualMethod)}
                className="input w-full"
              >
                <option value="cash">Cash</option>
                <option value="bkash">bKash</option>
                <option value="nagad">Nagad</option>
                <option value="bank">Bank Transfer</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1.5">
                {t('payments.paidOn', 'Date Paid')} *
              </label>
              <input
                type="date"
                required
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
                className="input w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1.5">
              {t('payments.reference', 'TrxID / Reference Note')}
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={method === 'cash' ? 'Cash collected in person' : 'e.g. TrxID or Cheque #'}
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1.5">
              {t('payments.proofAttachment', 'Attachment (Optional)')}
            </label>
            <div className="border border-dashed border-border rounded-lg p-3 text-center">
              {proofFile ? (
                <div className="flex items-center justify-between p-2 bg-muted/40 rounded-md">
                  <div className="flex items-center gap-2 truncate">
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                    <span className="text-xs text-fg truncate">{proofFile.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProofFile(null);
                      setProofFileId(null);
                    }}
                    className="text-fg-muted hover:text-danger p-1"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer block">
                  <Upload className="h-5 w-5 text-fg-muted mx-auto mb-1" />
                  <span className="text-xs text-accent font-medium">
                    {isUploading
                      ? t('status.uploading', 'Uploading...')
                      : t('actions.browsePhoto', 'Upload document / receipt')}
                  </span>
                  <p className="text-xs text-fg-muted mt-0.5">JPG, PNG, WebP up to 5 MB</p>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={isUploading}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="btn btn--secondary text-xs">
              {t('actions.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={recordPayment.isPending || isUploading}
              className="btn btn--primary text-xs flex items-center gap-1.5"
            >
              {(recordPayment.isPending || isUploading) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{t('payments.savePayment', 'Save & Allocate')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
