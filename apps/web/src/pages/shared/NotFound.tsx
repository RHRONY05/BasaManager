import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <main className="min-h-dvh flex items-center justify-center p-4 bg-bg text-fg">
      <div className="rounded-lg border border-border bg-surface p-8 text-center space-y-4 max-w-md w-full">
        <h1 className="text-2xl font-bold text-fg">{t('status.notFound')}</h1>
        <p className="text-fg-muted text-sm">{t('status.notFoundDesc')}</p>
        <div>
          <Link
            to="/"
            className="inline-flex items-center justify-center min-h-tap min-w-tap px-4 py-2 rounded-md bg-accent text-accent-fg font-medium hover:bg-accent-hover transition-colors whitespace-nowrap"
          >
            <span title={t('actions.goHome')}>{t('actions.goHome')}</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
