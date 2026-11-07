import { Suspense } from 'react';
import { Outlet, Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LogIn } from 'lucide-react';
import { TopProgressBar } from '../../components/ui/TopProgressBar';
import { RouteSkeleton } from '../../components/ui/RouteSkeleton';

export function AuthLayout() {
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh flex flex-col bg-bg text-fg">
      <TopProgressBar />
      <header className="border-b border-border bg-surface shrink-0">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-16 flex items-center justify-between gap-2 min-w-0">
          <Link
            to="/"
            className="text-base sm:text-lg font-bold text-fg hover:text-accent transition-colors min-h-tap flex items-center whitespace-nowrap min-w-0"
          >
            <span title={t('appName')} className="truncate">{t('appName')}</span>
          </Link>
          <nav className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <Link
              to="/login"
              aria-label={t('actions.signIn')}
              className="inline-flex items-center justify-center min-h-tap min-w-tap px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium text-fg hover:text-accent transition-colors whitespace-nowrap"
            >
              <LogIn className="h-4 w-4 sm:hidden shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline" title={t('actions.signIn')}>
                {t('actions.signIn')}
              </span>
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center justify-center min-h-tap min-w-tap px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md bg-accent text-accent-fg hover:bg-accent-hover transition-colors whitespace-nowrap"
            >
              <span title={t('actions.signUp')}>{t('actions.signUp')}</span>
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 flex flex-col p-4 sm:p-6 md:p-8 min-w-0">
        <Suspense key={location.pathname} fallback={<RouteSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
