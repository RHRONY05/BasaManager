import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Download, ArrowRight, Clock } from 'lucide-react';
import { usePaymentIntent, getReceiptDownloadUrl } from '../../lib/api/payments.js';
import { formatMoney } from '../../lib/format.js';
import { useToast } from '../../components/ui/Toast.js';

export default function PaymentResultPage() {
  const [searchParams] = useSearchParams();
  const tranId = searchParams.get('tran') || '';
  const gatewayResult = searchParams.get('result') || '';
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [downloading, setDownloading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Stop polling at 60 seconds (spec: 06-UI.md)
  const isTimedOut = elapsedSeconds >= 60;
  const isPollingActive = Boolean(tranId) && !isTimedOut;
  const { data: intent, isPending, isError, error } = usePaymentIntent(tranId, isPollingActive);

  const intentStatus = intent?.status;
  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    if ((intentStatus === 'initiated' || isPending || !intent) && !isTimedOut) {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [intent, intentStatus, isPending, isTimedOut]);

  const handleDownloadReceipt = async (receiptId: string) => {
    try {
      setDownloading(true);
      const res = await getReceiptDownloadUrl(receiptId);
      if ('downloadUrl' in res && res.downloadUrl) {
        window.open(res.downloadUrl, '_blank');
      } else {
        showToast(
          t('payments.receiptRendering', 'Receipt is still being generated. Please check back shortly.'),
          'info',
        );
      }
    } catch {
      showToast(t('payments.receiptDownloadError', 'Failed to retrieve receipt download link.'), 'error');
    } finally {
      setDownloading(false);
    }
  };

  if (!tranId) {
    return (
      <div className="py-12 flex items-center justify-center p-4">
        <div className="card p-6 sm:p-8 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto">
            <XCircle className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-fg">
            {t('payments.invalidTransactionTitle', 'Invalid Transaction')}
          </h1>
          <p className="text-xs text-fg-muted">
            {t('payments.invalidTransactionDesc', 'No transaction reference was provided in the return URL.')}
          </p>
          <div className="pt-2">
            <Link to="/t/bills" className="btn btn--primary text-xs w-full">
              {t('actions.backToBills', 'Back to Bills')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-12 flex items-center justify-center p-4">
        <div className="card p-6 sm:p-8 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-fg">{t('status.error', 'Error')}</h1>
          <p className="text-xs text-fg-muted">
            {error?.message || t('common.errorOccurred', 'An unexpected error occurred.')}
          </p>
          <div className="pt-2">
            <Link to="/t/bills" className="btn btn--secondary text-xs w-full">
              {t('actions.backToBills', 'Back to Bills')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  let effectiveStatus:
    'initiated' | 'confirmed' | 'failed' | 'cancelled' | 'flagged' | 'expired' | 'still_processing';

  if (intent?.status === 'confirmed') {
    effectiveStatus = 'confirmed';
  } else if (intent?.status === 'flagged') {
    effectiveStatus = 'flagged';
  } else if (intent?.status === 'expired') {
    effectiveStatus = 'expired';
  } else if (intent?.status === 'cancelled' || gatewayResult === 'cancel') {
    effectiveStatus = 'cancelled';
  } else if (intent?.status === 'failed' || gatewayResult === 'fail') {
    effectiveStatus = 'failed';
  } else if (isTimedOut) {
    effectiveStatus = 'still_processing';
  } else {
    effectiveStatus = 'initiated';
  }

  return (
    <div className="py-12 flex items-center justify-center p-4">
      <div className="card p-6 sm:p-8 max-w-md w-full space-y-6">
        {/* Status Graphic & Title */}
        <div className="text-center space-y-3">
          {effectiveStatus === 'initiated' && (
            <>
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto animate-pulse">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
              <h1 className="text-xl font-bold text-fg">
                {t('payments.verifyingTitle', 'Verifying Payment...')}
              </h1>
              <p className="text-xs text-fg-muted leading-relaxed">
                {t(
                  'payments.verifyingDesc',
                  'Communicating with SSLCommerz gateway to confirm your payment. Please keep this window open.',
                )}
              </p>
            </>
          )}

          {effectiveStatus === 'still_processing' && (
            <>
              <div className="w-16 h-16 rounded-full bg-muted/60 text-fg-muted flex items-center justify-center mx-auto">
                <Clock className="h-8 w-8 text-fg-muted" />
              </div>
              <h1 className="text-xl font-bold text-fg">
                {t('payments.stillProcessingTitle', 'Still Processing')}
              </h1>
              <p className="text-xs text-fg-muted leading-relaxed">
                {t(
                  'payments.stillProcessingDesc',
                  "SSLCommerz hasn't confirmed yet. We'll notify you as soon as it does; don't pay twice.",
                )}
              </p>
            </>
          )}

          {effectiveStatus === 'confirmed' && (
            <>
              <div className="w-16 h-16 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <h1 className="text-2xl font-bold text-fg">
                {t('payments.paymentSuccessful', 'Payment Successful!')}
              </h1>
              {intent?.amountPoisha && (
                <p className="text-2xl font-extrabold text-success num mt-1">
                  {formatMoney(intent.amountPoisha)}
                </p>
              )}
              <p className="text-xs text-fg-muted">
                {t(
                  'payments.confirmedNote',
                  'Your online payment has been confirmed and credited towards your bills.',
                )}
              </p>
            </>
          )}

          {(effectiveStatus === 'failed' || effectiveStatus === 'cancelled') && (
            <>
              <div className="w-16 h-16 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto">
                <XCircle className="h-10 w-10" />
              </div>
              <h1 className="text-xl font-bold text-fg">
                {effectiveStatus === 'cancelled'
                  ? t('payments.paymentCancelled', 'Payment Cancelled')
                  : t('payments.paymentFailed', 'Payment Failed')}
              </h1>
              <p className="text-xs text-fg-muted leading-relaxed">
                {effectiveStatus === 'cancelled'
                  ? t('payments.cancelledDesc', 'You cancelled the payment. Nothing was charged.')
                  : t(
                      'payments.failedDesc',
                      'The bank declined it. No money was taken. You can try again or pay another way.',
                    )}
              </p>
            </>
          )}

          {effectiveStatus === 'expired' && (
            <>
              <div className="w-16 h-16 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto">
                <XCircle className="h-10 w-10" />
              </div>
              <h1 className="text-xl font-bold text-fg">
                {t('payments.paymentExpired', 'Payment Session Expired')}
              </h1>
              <p className="text-xs text-fg-muted leading-relaxed">
                {t(
                  'payments.expiredDesc',
                  'This payment session timed out without confirmation. No money was taken. You can try again from your bills page.',
                )}
              </p>
            </>
          )}

          {effectiveStatus === 'flagged' && (
            <>
              <div className="w-16 h-16 rounded-full bg-warning/10 text-warning flex items-center justify-center mx-auto">
                <AlertTriangle className="h-10 w-10" />
              </div>
              <h1 className="text-xl font-bold text-fg">
                {t('payments.underReviewTitle', 'Payment Under Review')}
              </h1>
              <p className="text-xs text-fg-muted leading-relaxed">
                {t(
                  'payments.flaggedDesc',
                  'We received notification of your payment, but the details require verification by our staff. Your account will be updated once reviewed.',
                )}
              </p>
            </>
          )}
        </div>

        {/* Transaction Details Box */}
        <div className="rounded-xl bg-muted/40 border border-border/60 p-4 space-y-2.5 text-xs">
          <div className="flex justify-between items-center gap-3 text-fg-muted">
            <span className="whitespace-nowrap shrink-0">
              {t('payments.transactionId', 'Transaction ID')}:
            </span>
            <span className="font-mono text-fg font-medium break-all text-right">{tranId}</span>
          </div>
          {intent?.receiptNumber && (
            <div className="flex justify-between items-center gap-3 text-fg-muted">
              <span className="whitespace-nowrap shrink-0">
                {t('payments.receiptNumber', 'Receipt Number')}:
              </span>
              <span className="font-mono font-bold text-fg text-right">{intent.receiptNumber}</span>
            </div>
          )}
          {intent?.amountPoisha && (
            <div className="flex justify-between items-center gap-3 text-fg-muted">
              <span className="whitespace-nowrap shrink-0">{t('payments.amount', 'Amount')}:</span>
              <span className="font-bold text-fg num text-right">{formatMoney(intent.amountPoisha)}</span>
            </div>
          )}
          <div className="flex justify-between items-center gap-3 text-fg-muted">
            <span className="whitespace-nowrap shrink-0">{t('payments.method', 'Payment Method')}:</span>
            <span className="font-medium text-fg text-right">
              {t('payments.sslcommerzSandbox', 'SSLCommerz Sandbox')}
            </span>
          </div>
          <div className="flex justify-between items-center gap-3 text-fg-muted">
            <span className="whitespace-nowrap shrink-0">{t('payments.status', 'Status')}:</span>
            <span
              className={`badge text-xs capitalize ${
                effectiveStatus === 'confirmed'
                  ? 'badge--success'
                  : effectiveStatus === 'initiated' ||
                      effectiveStatus === 'still_processing' ||
                      effectiveStatus === 'flagged'
                    ? 'badge--warning'
                    : 'badge--danger'
              }`}
            >
              {effectiveStatus === 'still_processing'
                ? t('payments.statusProcessing', 'Processing')
                : effectiveStatus}
            </span>
          </div>
        </div>

        {/* Timed helper message for long-running initiated intents */}
        {effectiveStatus === 'initiated' && elapsedSeconds > 30 && (
          <div className="p-3 bg-muted/60 rounded-xl text-xs text-fg-muted flex items-start gap-2 border border-border/50">
            <Clock className="h-4 w-4 shrink-0 mt-0.5 text-fg-muted" />
            <p>
              {t(
                'payments.slowVerificationNotice',
                'Verification is taking a little longer than usual. You can safely navigate away; your receipt will automatically appear in your bill details once confirmed.',
              )}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2 pt-2">
          {effectiveStatus === 'confirmed' && intent?.receiptId && (
            <button
              type="button"
              disabled={downloading}
              onClick={() => handleDownloadReceipt(intent.receiptId!)}
              className="btn btn--secondary text-xs w-full flex items-center justify-center gap-2"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span>{t('payments.viewReceipt', 'View Receipt')}</span>
            </button>
          )}

          {effectiveStatus === 'confirmed' && (
            <Link
              to="/t/bills"
              className="btn btn--primary text-xs w-full flex items-center justify-center gap-1.5"
            >
              <span>{t('actions.backToBills', 'View My Bills')}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}

          {(effectiveStatus === 'failed' ||
            effectiveStatus === 'cancelled' ||
            effectiveStatus === 'expired') && (
            <>
              <Link
                to="/t/bills"
                className="btn btn--primary text-xs w-full flex items-center justify-center gap-1.5"
              >
                <span>{t('actions.retryPayment', 'Back to Bills & Retry')}</span>
              </Link>
              <Link to="/t" className="btn btn--secondary text-xs w-full flex items-center justify-center">
                <span>{t('actions.goToDashboard', 'Dashboard')}</span>
              </Link>
            </>
          )}

          {effectiveStatus === 'still_processing' && (
            <>
              <Link
                to="/t/bills"
                className="btn btn--primary text-xs w-full flex items-center justify-center gap-1.5"
              >
                <span>{t('actions.backToBills', 'Back to Bills')}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/t" className="btn btn--secondary text-xs w-full flex items-center justify-center">
                <span>{t('actions.goToDashboard', 'Dashboard')}</span>
              </Link>
            </>
          )}

          {effectiveStatus === 'initiated' || effectiveStatus === 'flagged' ? (
            <Link
              to="/t/bills"
              className="btn btn--secondary text-xs w-full flex items-center justify-center gap-1.5"
            >
              <span>{t('actions.backToBills', 'Back to Bills')}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
