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
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [downloading, setDownloading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const { data: intent, isPending, isError, error } = usePaymentIntent(tranId, Boolean(tranId));

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    if (intent?.status === 'initiated' || isPending) {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [intent?.status, isPending]);

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

  const status = intent?.status || 'initiated';

  return (
    <div className="py-12 flex items-center justify-center p-4">
      <div className="card p-6 sm:p-8 max-w-md w-full space-y-6">
        {/* Status Graphic & Title */}
        <div className="text-center space-y-3">
          {status === 'initiated' && (
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

          {status === 'confirmed' && (
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

          {(status === 'failed' || status === 'cancelled') && (
            <>
              <div className="w-16 h-16 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto">
                <XCircle className="h-10 w-10" />
              </div>
              <h1 className="text-xl font-bold text-fg">
                {status === 'cancelled'
                  ? t('payments.paymentCancelled', 'Payment Cancelled')
                  : t('payments.paymentFailed', 'Payment Failed')}
              </h1>
              <p className="text-xs text-fg-muted leading-relaxed">
                {status === 'cancelled'
                  ? t(
                      'payments.cancelledDesc',
                      'You cancelled the transaction at the payment gateway. No funds were deducted.',
                    )
                  : t(
                      'payments.failedDesc',
                      'The payment gateway reported a failure. If funds were deducted, your bank or mobile wallet will reverse the transaction.',
                    )}
              </p>
            </>
          )}

          {status === 'flagged' && (
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
          <div className="flex justify-between items-center text-fg-muted">
            <span>{t('payments.transactionId', 'Transaction ID')}:</span>
            <span className="font-mono text-fg font-medium break-all">{tranId}</span>
          </div>
          {intent?.receiptNumber && (
            <div className="flex justify-between items-center text-fg-muted">
              <span>{t('payments.receiptNumber', 'Receipt Number')}:</span>
              <span className="font-mono font-bold text-fg">{intent.receiptNumber}</span>
            </div>
          )}
          {intent?.amountPoisha && (
            <div className="flex justify-between items-center text-fg-muted">
              <span>{t('payments.amount', 'Amount')}:</span>
              <span className="font-bold text-fg num">{formatMoney(intent.amountPoisha)}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-fg-muted">
            <span>{t('payments.method', 'Payment Method')}:</span>
            <span className="font-medium text-fg">SSLCommerz Sandbox</span>
          </div>
          <div className="flex justify-between items-center text-fg-muted">
            <span>{t('payments.status', 'Status')}:</span>
            <span
              className={`badge text-xs capitalize ${
                status === 'confirmed'
                  ? 'badge--success'
                  : status === 'initiated'
                    ? 'badge--warning'
                    : status === 'flagged'
                      ? 'badge--warning'
                      : 'badge--danger'
              }`}
            >
              {status}
            </span>
          </div>
        </div>

        {/* Timed helper message for long-running initiated intents */}
        {status === 'initiated' && elapsedSeconds > 30 && (
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
          {status === 'confirmed' && intent?.receiptId && (
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

          {status === 'confirmed' && (
            <Link
              to="/t/bills"
              className="btn btn--primary text-xs w-full flex items-center justify-center gap-1.5"
            >
              <span>{t('actions.backToBills', 'View My Bills')}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}

          {(status === 'failed' || status === 'cancelled') && (
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

          {(status === 'initiated' || status === 'flagged') && (
            <Link
              to="/t/bills"
              className="btn btn--secondary text-xs w-full flex items-center justify-center gap-1.5"
            >
              <span>{t('actions.backToBills', 'Back to Bills')}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
