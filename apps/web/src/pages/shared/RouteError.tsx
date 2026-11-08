import { useEffect } from 'react';
import { useRouteError, useNavigate, Link } from 'react-router';
import { captureError } from '../../lib/sentry';
import { useTranslation } from 'react-i18next';

export default function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    captureError(error);
  }, [error]);

  const errorMessage =
    error instanceof Error ? error.message : typeof error === 'string' ? error : t('status.routeError');

  const handleRetry = () => {
    navigate(0);
  };

  return (
    <main className="min-h-dvh flex items-center justify-center p-4 bg-bg text-fg">
      <div
        role="alert"
        className="rounded-lg border border-border bg-surface p-8 text-center space-y-4 max-w-md w-full"
      >
        <h1 className="text-2xl font-bold text-fg">{t('status.error')}</h1>
        <p className="text-fg-muted text-sm break-words">{errorMessage}</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center justify-center min-h-tap min-w-tap px-4 py-2 rounded-md bg-accent text-accent-fg font-medium hover:bg-accent-hover transition-colors whitespace-nowrap cursor-pointer w-full sm:w-auto"
          >
            <span title={t('actions.retry')}>{t('actions.retry')}</span>
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center min-h-tap min-w-tap px-4 py-2 rounded-md border border-border text-fg font-medium hover:bg-surface-hover transition-colors whitespace-nowrap w-full sm:w-auto"
          >
            <span title={t('actions.goHome')}>{t('actions.goHome')}</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
