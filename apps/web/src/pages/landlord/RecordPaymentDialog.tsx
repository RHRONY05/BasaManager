import React, { useState, useEffect, useCallback, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Upload, X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useRecordPayment, uploadFile } from '../../lib/api/payments.js';
import { useLeases } from '../../lib/api/leases.js';
import { parseTakaToPoisha } from '../../lib/format.js';
import type { LeaseDto } from '@bm/shared/api/leases';

const getTodayDhaka = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());

const recordPaymentFormSchema = z.object({
  leaseId: z.string().min(1, 'Please select a unit/lease'),
  amountTaka: z
    .string()
    .min(1, 'Please enter a valid amount')
    .refine((val) => parseTakaToPoisha(val) > 0, { message: 'Payment amount must be positive' }),
  method: z.enum(['cash', 'bkash', 'nagad', 'bank']),
  reference: z.string().max(100).optional(),
  paidOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .refine((s) => new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, {
      message: 'Invalid calendar date',
    }),
});

type RecordPaymentFormValues = z.infer<typeof recordPaymentFormSchema>;

export interface RecordPaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RecordPaymentDialog({ isOpen, onClose, onSuccess }: RecordPaymentDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const recordPayment = useRecordPayment();
  const { data: leases = [] } = useLeases({ status: 'active' });

  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofFileId, setProofFileId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<RecordPaymentFormValues>({
    resolver: zodResolver(recordPaymentFormSchema),
    defaultValues: {
      leaseId: '',
      amountTaka: '',
      method: 'cash',
      reference: '',
      paidOn: getTodayDhaka(),
    },
  });

  const handleClose = useCallback(() => {
    reset({
      leaseId: '',
      amountTaka: '',
      method: 'cash',
      reference: '',
      paidOn: getTodayDhaka(),
    });
    setProofFile(null);
    setProofFileId(null);
    setErrorMessage(null);
    onClose();
  }, [reset, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

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

  const onSubmit = async (data: RecordPaymentFormValues) => {
    setErrorMessage(null);
    const amountPoisha = parseTakaToPoisha(data.amountTaka);

    try {
      await recordPayment.mutateAsync({
        leaseId: data.leaseId,
        amountPoisha,
        method: data.method,
        reference: data.reference?.trim() || undefined,
        paidOn: data.paidOn,
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
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className="card w-full max-w-md p-6 space-y-5 bg-bg border border-border shadow-2xl relative animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-bold text-fg">
            {t('payments.recordTitle', 'Record Payment')}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('actions.close', 'Close')}
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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1.5">
              {t('payments.selectUnit', 'Select Unit / Tenant')} *
            </label>
            <select {...register('leaseId')} className="input w-full">
              <option value="">{t('actions.select', '-- Select Active Lease --')}</option>
              {leases.map((l: LeaseDto) => (
                <option key={l.id} value={l.id}>
                  {l.unit?.buildingName ? `${l.unit.buildingName} - ` : ''}
                  Unit {l.unit?.label || l.unitId} ({l.tenants?.[0]?.fullName || 'Active Tenant'})
                </option>
              ))}
            </select>
            {errors.leaseId && <p className="text-xs text-danger mt-1">{errors.leaseId.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1.5">
              {t('payments.amount', 'Amount (৳)')} *
            </label>
            <input
              type="number"
              step="any"
              min="1"
              {...register('amountTaka')}
              placeholder={t('payments.amountPlaceholder', 'e.g. 20000')}
              className="input w-full"
            />
            {errors.amountTaka && <p className="text-xs text-danger mt-1">{errors.amountTaka.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1.5">
                {t('payments.paymentMethod', 'Method')} *
              </label>
              <select {...register('method')} className="input w-full">
                <option value="cash">{t('payments.methodCash', 'Cash')}</option>
                <option value="bkash">{t('payments.methodBkash', 'bKash')}</option>
                <option value="nagad">{t('payments.methodNagad', 'Nagad')}</option>
                <option value="bank">{t('payments.methodBank', 'Bank Transfer')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1.5">
                {t('payments.paidOn', 'Payment Date')} *
              </label>
              <input type="date" {...register('paidOn')} className="input w-full" />
              {errors.paidOn && <p className="text-xs text-danger mt-1">{errors.paidOn.message}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1.5">
              {t('payments.reference', 'Reference / TrxID / Note')}
            </label>
            <input
              type="text"
              {...register('reference')}
              placeholder={t('payments.referencePlaceholder', 'e.g. Cash collected / Bank Ref BL92A8ZK1')}
              className="input w-full"
            />
            {errors.reference && <p className="text-xs text-danger mt-1">{errors.reference.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1.5">
              {t('payments.proofPhoto', 'Proof Document / Receipt Photo')} (Optional)
            </label>
            <div className="flex items-center gap-3">
              <label className="btn btn--secondary text-xs cursor-pointer flex items-center gap-2">
                <Upload className="h-4 w-4" />
                <span>
                  {isUploading
                    ? t('payments.uploading', 'Uploading...')
                    : t('payments.chooseFile', 'Choose Photo')}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isUploading}
                />
              </label>
              {proofFile && (
                <div className="flex items-center gap-1.5 text-xs text-success font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="truncate max-w-48">{proofFile.name}</span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-border">
            <button type="button" onClick={handleClose} className="btn btn--secondary text-xs">
              {t('actions.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={recordPayment.isPending || isUploading}
              className="btn btn--primary text-xs flex items-center gap-1.5"
            >
              {recordPayment.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{t('payments.recordBtn', 'Save & Allocate')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
