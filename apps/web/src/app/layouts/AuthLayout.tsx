import { Suspense } from 'react';
import { Outlet, Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { TopProgressBar } from '../../components/ui/TopProgressBar';
import { RouteSkeleton } from '../../components/ui/RouteSkeleton';
import { BrandMark } from '../../components/ui/BrandMark';
import {
  BuildingCutaway,
  SceneBackdrop,
  type CutawayFlat,
  type FlatStatus,
} from '../../components/illustrations/BuildingCutaway';

const AUTH_FLOORS: { level: number; flats: [CutawayFlat, CutawayFlat] }[] = [
  {
    level: 5,
    flats: [
      { id: '5A', status: 'paid' },
      { id: '5B', status: 'due' },
    ],
  },
  {
    level: 4,
    flats: [
      { id: '4A', status: 'paid' },
      { id: '4B', status: 'repair' },
    ],
  },
  {
    level: 3,
    flats: [
      { id: '3A', status: 'paid' },
      { id: '3B', status: 'vacant' },
    ],
  },
];

export function AuthLayout() {
  const location = useLocation();
  const { t } = useTranslation();
  const statusLabel = (s: FlatStatus) =>
    ({
      paid: t('auth.landing.statusPaid'),
      due: t('auth.landing.statusDue'),
      repair: t('auth.landing.statusRepair'),
      vacant: t('auth.landing.statusVacant'),
    })[s];

  return (
    <div className="min-h-dvh flex flex-col bg-bg text-fg">
      <TopProgressBar />

      {/* Mobile top bar (< 768px) */}
      <header className="md:hidden flex items-center justify-between px-4 py-2 border-b border-border-muted bg-bg shrink-0">
        <Link to="/" className="brand flex items-center gap-2.5 text-fg min-h-tap min-w-0">
          <span className="w-8 h-8 rounded-[var(--radius-md)] bg-accent text-accent-fg flex items-center justify-center shrink-0">
            <BrandMark className="brand__mark w-5 h-5" />
          </span>
          <span className="truncate font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">
            {t('appName')}
          </span>
        </Link>
      </header>

      {/* Split desktop layout (>= 768px) / single-column mobile */}
      <div className="flex-1 grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] min-h-0">
        {/* Desktop left panel (>= 768px): sky, building, sample bill */}
        <aside className="hidden md:block p-3 min-w-0" aria-label={t('appName')}>
          <div className="relative overflow-hidden h-full min-h-160 rounded-panel border border-border flex flex-col px-8 pt-8 lg:px-10 lg:pt-10">
            <SceneBackdrop clouds={false} />

            <Link to="/" className="relative brand flex items-center gap-2.5 text-fg min-h-tap self-start">
              <span className="w-9 h-9 rounded-[var(--radius-md)] bg-accent text-accent-fg flex items-center justify-center shrink-0">
                <BrandMark className="brand__mark w-6 h-6" />
              </span>
              <span className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">
                {t('appName')}
              </span>
              <span className="brand__bn text-fg-secondary text-sm" lang="bn">
                {t('brandBn')}
              </span>
            </Link>

            <h2 className="relative mt-10 max-w-md font-[family-name:var(--font-display)] text-panel leading-heading font-extrabold tracking-heading text-fg">
              {t('auth.asideTitle')}
            </h2>

            {/* building with the sample bill beside it */}
            <div className="relative mt-auto flex items-end gap-4 lg:gap-6 pt-10 mb-10">
              <div className="hidden lg:block w-1/2 max-w-65 shrink-0" aria-hidden="true">
                <BuildingCutaway
                  floors={AUTH_FLOORS}
                  selectedId="4A"
                  statusLabel={statusLabel}
                  flatLabel={(f) => f.id}
                  ariaLabel=""
                  showLevels={false}
                />
              </div>
              <div className="flex-1 min-w-0 mb-8 bg-surface rounded-[var(--radius-xl)] border border-border shadow-[var(--shadow-lg)] p-4">
                <div className="ledger ledger--sm flex flex-col gap-2">
                  <div className="ledger__row flex items-baseline justify-between gap-2">
                    <span className="ledger__label text-sm text-fg-secondary min-w-0">
                      {t('auth.sampleRent')}
                    </span>
                    <span className="ledger__amount text-sm font-semibold whitespace-nowrap tabular-nums text-fg">
                      {t('auth.sampleAmountRent')}
                    </span>
                  </div>
                  <div className="ledger__row flex flex-col gap-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="ledger__label text-sm text-fg-secondary min-w-0">
                        {t('auth.landing.electricity')}
                      </span>
                      <span className="ledger__amount text-sm font-semibold whitespace-nowrap tabular-nums text-fg">
                        {t('auth.sampleAmountElec')}
                      </span>
                    </div>
                    <span className="ledger__explain text-xs text-fg-muted">
                      {t('auth.sampleElecExplain')}
                    </span>
                  </div>
                  <div className="ledger__row flex items-baseline justify-between gap-2">
                    <span className="ledger__label text-sm text-fg-secondary min-w-0">
                      {t('auth.sampleService')}
                    </span>
                    <span className="ledger__amount text-sm font-semibold whitespace-nowrap tabular-nums text-fg">
                      {t('auth.sampleAmountService')}
                    </span>
                  </div>
                  <div className="ledger__total border-t-2 border-border pt-2 mt-1 flex items-baseline justify-between gap-2">
                    <span className="ledger__total-label text-sm font-bold text-fg min-w-0">
                      {t('auth.sampleMonth')}
                    </span>
                    <span className="ledger__total-amount font-[family-name:var(--font-display)] text-lg font-bold whitespace-nowrap tabular-nums text-accent-text">
                      {t('auth.sampleAmountTotal')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <p className="absolute left-8 lg:left-10 bottom-2.5 text-xs text-fg-secondary">
              {t('auth.asideFooter')}
            </p>
          </div>
        </aside>

        {/* Right side form area (Desktop) / Main area (Mobile) */}
        <main className="flex items-start md:items-center justify-center px-4 py-8 sm:p-8 lg:p-12 min-w-0">
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
