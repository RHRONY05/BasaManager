import React, { useState, useEffect, useCallback, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, AlertCircle, Loader2, CreditCard, ShieldCheck } from 'lucide-react';
import { useInitOnlinePayment } from '../../lib/api/payments.js';
import { parseTakaToPoisha, formatMoney } from '../../lib/format.js';

const payOnlineFormSchema = z.object({
  amountTaka: z
    .string()
    .min(1, 'Please enter a valid amount')
    .refine((val) => parseTakaToPoisha(val) >= 100_00, {
      message: 'Minimum online payment amount is ৳100',
    }),
});

type PayOnlineFormValues = z.infer<typeof payOnlineFormSchema>;

export interface PayOnlineDialogProps {
  leaseId: string;
  dueAmountPoisha?: number;
  isOpen: boolean;
  onClose: () => void;
}

export function PayOnlineDialog({ leaseId, dueAmountPoisha, isOpen, onClose }: PayOnlineDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const initPayment = useInitOnlinePayment();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const defaultTaka = dueAmountPoisha && dueAmountPoisha > 0 ? (dueAmountPoisha / 100).toString() : '1000';

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<PayOnlineFormValues>({
    resolver: zodResolver(payOnlineFormSchema),
    defaultValues: {
      amountTaka: defaultTaka,
    },
  });

  const handleClose = useCallback(() => {
    reset({
      amountTaka: defaultTaka,
    });
    setErrorMessage(null);
    onClose();
  }, [reset, defaultTaka, onClose]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    },
    [handleClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const onSubmit = async (values: PayOnlineFormValues) => {
    setErrorMessage(null);
    try {
      const amountPoisha = parseTakaToPoisha(values.amountTaka);
      const res = await initPayment.mutateAsync({
        leaseId,
        amountPoisha,
      });

      if (res.gatewayUrl) {
        window.location.assign(res.gatewayUrl);
      } else {
        throw new Error('Gateway URL missing from response');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('common.errorOccurred');
      setErrorMessage(msg);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md bg-surface text-fg rounded-2xl shadow-xl border border-border flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-base font-semibold text-fg">
                {t('payments.payOnlineTitle', 'Pay Online via SSLCommerz')}
              </h2>
              <p className="text-xs text-fg-muted mt-0.5">
                {t('payments.sslcommerzSubtitle', 'bKash, Nagad, Visa, Mastercard, Internet Banking')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-muted transition-colors min-h-tap"
            aria-label={t('actions.close', 'Close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {errorMessage && (
            <div className="p-3 bg-danger/10 border border-danger/30 rounded-xl text-xs text-danger flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {dueAmountPoisha !== undefined && dueAmountPoisha > 0 && (
            <div className="p-3 rounded-xl bg-accent/5 border border-accent/20 flex items-center justify-between text-xs">
              <span className="text-fg-muted">{t('billing.currentDue', 'Current Due')}:</span>
              <span className="font-bold text-accent text-sm">{formatMoney(dueAmountPoisha)}</span>
            </div>
          )}

          {/* Amount in Taka */}
          <div className="space-y-1.5">
            <label htmlFor="amountTaka" className="text-xs font-medium text-fg block">
              {t('payments.amountTaka', 'Payment Amount (৳ BDT)')}
              <span className="text-danger ml-0.5">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted font-bold text-sm">
                ৳
              </span>
              <input
                id="amountTaka"
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="1000"
                className="input pl-8 w-full font-bold text-base"
                {...register('amountTaka')}
              />
            </div>
            {errors.amountTaka && <p className="text-xs text-danger">{errors.amountTaka.message}</p>}
            <p className="text-xs text-fg-muted">
              {t('payments.minAmountNote', 'Minimum ৳100. Any excess over dues is kept as credit.')}
            </p>
          </div>

          {/* Security guarantee note */}
          <div className="p-3 rounded-xl bg-muted/40 border border-border/50 flex items-start gap-2 text-xs text-fg-muted">
            <ShieldCheck className="h-4 w-4 text-success shrink-0 mt-0.5" />
            <span>
              {t(
                'payments.sslcommerzSecureNote',
                'Your payment is securely processed through SSLCommerz sandbox gateway. You will be redirected to select your preferred payment method.',
              )}
            </span>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-end">
            <button
              type="button"
              onClick={handleClose}
              disabled={initPayment.isPending}
              className="btn btn--secondary text-xs w-full sm:w-auto"
            >
              {t('actions.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={initPayment.isPending}
              className="btn btn--primary text-xs w-full sm:w-auto flex items-center justify-center gap-2"
            >
              {initPayment.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t('payments.connectingGateway', 'Connecting to Gateway...')}</span>
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4" />
                  <span>{t('payments.proceedGateway', 'Proceed to Payment')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
