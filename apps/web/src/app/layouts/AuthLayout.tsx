import { Suspense } from 'react';
import { Outlet, Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { TopProgressBar } from '../../components/ui/TopProgressBar';
import { RouteSkeleton } from '../../components/ui/RouteSkeleton';
import { BrandMark } from '../../components/ui/BrandMark';

export function AuthLayout() {
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh flex flex-col bg-bg text-fg">
      <TopProgressBar />

      {/* Mobile top bar (< 768px) */}
      <header className="md:hidden flex items-center justify-between px-4 py-2 border-b border-border bg-surface shrink-0">
        <Link to="/" className="brand flex items-center gap-2 text-fg font-bold min-h-tap">
          <BrandMark className="brand__mark w-8 h-8" />
          <span className="truncate">{t('appName')}</span>
        </Link>
      </header>

      {/* Split desktop layout (>= 768px) / single-column mobile */}
      <div className="flex-1 grid md:grid-cols-2 min-h-0">
        {/* Desktop left aside (>= 768px) */}
        <aside
          className="hidden md:flex flex-col justify-between p-10 lg:p-12 bg-surface border-r border-border min-w-0"
          aria-label={t('appName')}
        >
          <Link to="/" className="brand flex items-center gap-2 text-fg font-bold text-lg min-h-tap">
            <BrandMark className="brand__mark w-8 h-8 shrink-0" />
            <span>{t('appName')}</span>
            <span className="brand__bn text-fg-muted font-normal text-sm" lang="bn">
              {t('brandBn')}
            </span>
          </Link>

          <div className="flex flex-col gap-6 max-w-md my-8">
            <h2 className="text-xl lg:text-2xl font-bold tracking-tight text-fg">{t('auth.asideTitle')}</h2>
            <div className="card card--tight bg-bg p-5 rounded-lg border border-border">
              <div className="ledger ledger--sm flex flex-col gap-2.5">
                <div className="ledger__row flex items-baseline justify-between gap-2">
                  <span className="ledger__label text-sm text-fg-secondary">{t('auth.sampleRent')}</span>
                  <span className="ledger__amount text-sm font-semibold whitespace-nowrap tabular-nums text-fg">
                    {t('auth.sampleAmountRent')}
                  </span>
                </div>
                <div className="ledger__row flex flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="ledger__label text-sm text-fg-secondary">
                      {t('auth.landing.electricity')}
                    </span>
                    <span className="ledger__amount text-sm font-semibold whitespace-nowrap tabular-nums text-fg">
                      {t('auth.sampleAmountElec')}
                    </span>
                  </div>
                  <span className="ledger__explain text-xs text-fg-muted">{t('auth.sampleElecExplain')}</span>
                </div>
                <div className="ledger__row flex items-baseline justify-between gap-2">
                  <span className="ledger__label text-sm text-fg-secondary">{t('auth.sampleService')}</span>
                  <span className="ledger__amount text-sm font-semibold whitespace-nowrap tabular-nums text-fg">
                    {t('auth.sampleAmountService')}
                  </span>
                </div>
                <div className="ledger__total border-t-2 border-border pt-2 mt-1 flex items-baseline justify-between gap-2">
                  <span className="ledger__total-label text-sm font-bold text-fg">
                    {t('auth.sampleMonth')}
                  </span>
                  <span className="ledger__total-amount text-base font-bold whitespace-nowrap tabular-nums text-accent">
                    {t('auth.sampleAmountTotal')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-fg-muted">{t('auth.asideFooter')}</p>
        </aside>

        {/* Right side form area (Desktop) / Main area (Mobile) */}
        <main className="flex items-center justify-center p-4 sm:p-6 md:p-10 min-w-0">
          <div className="w-full max-w-[var(--width-form)] min-w-0">
            <Suspense key={location.pathname} fallback={<RouteSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
