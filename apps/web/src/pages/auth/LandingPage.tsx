import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PlaceholderDataRegion } from '../../components/domain/PlaceholderDataRegion';

export default function LandingPage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8 py-8 min-w-0">
      <div className="space-y-4">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-fg tracking-tight break-words">
          {t('landing.title')}
        </h1>
        <p className="text-lg text-fg-muted max-w-2xl break-words">{t('landing.subtitle')}</p>
        <div className="flex flex-col sm:flex-row gap-4 pt-2">
          <Link
            to="/signup"
            className="inline-flex items-center justify-center min-h-tap min-w-tap px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base rounded-md bg-accent text-accent-fg font-medium hover:bg-accent-hover transition-colors whitespace-nowrap w-full sm:w-auto"
          >
            <span className="sm:hidden" title={t('actions.createAccount')}>
              {t('actions.createAccountShort')}
            </span>
            <span className="hidden sm:inline" title={t('actions.createAccount')}>
              {t('actions.createAccount')}
            </span>
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center justify-center min-h-tap min-w-tap px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base rounded-md border border-border text-fg font-medium hover:bg-surface-hover transition-colors whitespace-nowrap w-full sm:w-auto"
          >
            <span title={t('actions.signIn')}>{t('actions.signIn')}</span>
          </Link>
        </div>
      </div>

      <div className="pt-4">
        <PlaceholderDataRegion />
      </div>
    </div>
  );
}
