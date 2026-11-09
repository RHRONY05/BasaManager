import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Building2, Plus, Check, ChevronRight, Users, AlertTriangle, Receipt, Send } from 'lucide-react';
import { useBuildings } from '../../lib/api/buildings';
import { useAuth } from '../../app/auth/AuthContext';
import { AddBuildingDialog } from './AddBuildingDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

export default function DashboardPage() {
  const { t } = useTranslation();
  const { activeOrg, user } = useAuth();
  const { data: buildings, isPending, isError, error, refetch } = useBuildings();
  const [isAddBuildingOpen, setIsAddBuildingOpen] = useState(false);

  const orgName = activeOrg?.orgName ?? 'Properties';
  const hasBuildings = buildings && buildings.length > 0;

  // Aggregate stats
  const totalUnits = buildings?.reduce((acc, b) => acc + (b.unitCount ?? 0), 0) ?? 0;
  const totalOccupied = buildings?.reduce((acc, b) => acc + (b.occupiedCount ?? 0), 0) ?? 0;
  const totalOutstanding = 0;
  const occupancyPercent = totalUnits > 0 ? Math.round((totalOccupied / totalUnits) * 100) : 0;

  const formatMoney = (poisha: number) => {
    const bdt = Math.round(poisha / 100);
    return `৳${bdt.toLocaleString('en-US')}`;
  };

  if (isError) {
    return <ErrorState message={error?.message ?? t('status.error')} onRetry={() => void refetch()} />;
  }

  if (isPending) {
    return (
      <div data-skeleton aria-busy="true" className="space-y-6 max-w-5xl min-w-0">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  // First-run experience: No buildings added yet
  if (!hasBuildings) {
    return (
      <div className="space-y-6 max-w-5xl min-w-0">
        <section className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-fg-muted font-bold">
            {t('onboarding.welcome')}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-fg">
            {t('onboarding.setupTitle', { orgName })}
          </h1>
          <p className="text-sm text-fg-muted">{t('onboarding.setupDesc')}</p>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Onboarding Checklist (Left 2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-fg">{t('onboarding.gettingStarted')}</h2>
              <span className="text-xs text-fg-muted font-semibold">
                {t('onboarding.progress', { done: 1, total: 5 })}
              </span>
            </div>

            <div className="meter" role="img" aria-label="1 of 5 steps done">
              <span style={{ width: '20%' }} />
            </div>

            <ol className="checklist">
              {/* Step 1: Email Verified */}
              <li className="check-step check-step--done">
                <span className="check-step__n">
                  <Check className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="check-step__body">
                  <span className="font-semibold text-sm text-fg">{t('onboarding.step1Title')}</span>
                  <span className="text-xs text-fg-muted">
                    {t('onboarding.step1Desc', { email: user?.email ?? '' })}
                  </span>
                </div>
              </li>

              {/* Step 2: Add Building (Current) */}
              <li className="check-step check-step--current">
                <span className="check-step__n">2</span>
                <div className="check-step__body">
                  <span className="font-semibold text-sm text-fg">{t('onboarding.step2Title')}</span>
                  <span className="text-xs text-fg-muted">{t('onboarding.step2Desc')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddBuildingOpen(true)}
                  className="btn btn--primary btn--sm shrink-0"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t('buildings.addBuilding')}
                </button>
              </li>

              {/* Step 3: Add units */}
              <li className="check-step">
                <span className="check-step__n">3</span>
                <div className="check-step__body">
                  <span className="font-semibold text-sm text-fg">{t('onboarding.step3Title')}</span>
                  <span className="text-xs text-fg-muted">{t('onboarding.step3Desc')}</span>
                </div>
              </li>

              {/* Step 4: Billing Settings */}
              <li className="check-step">
                <span className="check-step__n">4</span>
                <div className="check-step__body">
                  <span className="font-semibold text-sm text-fg">{t('onboarding.step4Title')}</span>
                  <span className="text-xs text-fg-muted">{t('onboarding.step4Desc')}</span>
                </div>
              </li>

              {/* Step 5: Invite tenant */}
              <li className="check-step">
                <span className="check-step__n">5</span>
                <div className="check-step__body">
                  <span className="font-semibold text-sm text-fg">{t('onboarding.step5Title')}</span>
                  <span className="text-xs text-fg-muted">{t('onboarding.step5Desc')}</span>
                </div>
              </li>
            </ol>
          </div>

          {/* Tenant Preview Card (Right col) */}
          <aside className="card p-5 space-y-4">
            <div>
              <h2 className="font-bold text-sm text-fg">{t('onboarding.previewTitle')}</h2>
              <p className="text-xs text-fg-muted mt-1">{t('onboarding.previewDesc')}</p>
            </div>

            <div className="due-card shadow-sm">
              <div className="due-card__top">
                <span className="font-bold text-sm text-fg">{t('onboarding.sampleNovember')}</span>
                <span className="badge badge--info">
                  <Send className="h-3 w-3 mr-1" aria-hidden="true" />
                  Issued
                </span>
              </div>

              <div className="ledger ledger--sm">
                <div className="ledger__row">
                  <span className="ledger__label">{t('onboarding.sampleRent')}</span>
                  <span className="ledger__leader" />
                  <span className="ledger__amount">৳12,000</span>
                </div>
                <div className="ledger__row">
                  <span className="ledger__label">{t('onboarding.sampleService')}</span>
                  <span className="ledger__leader" />
                  <span className="ledger__amount">৳3,080</span>
                </div>
                <div className="ledger__row">
                  <span className="ledger__label">{t('onboarding.sampleElec')}</span>
                  <span className="ledger__leader" />
                  <span className="ledger__amount">৳1,395</span>
                  <span className="ledger__explain">{t('onboarding.sampleElecExplain')}</span>
                </div>
                <div className="ledger__total">
                  <span className="ledger__total-label">{t('onboarding.sampleTotal')}</span>
                  <span className="ledger__total-amount">৳16,475</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-fg-muted italic">{t('onboarding.previewDisclaimer')}</p>
          </aside>
        </div>

        <AddBuildingDialog isOpen={isAddBuildingOpen} onClose={() => setIsAddBuildingOpen(false)} />
      </div>
    );
  }

  // Regular Dashboard with KPI tiles and buildings
  return (
    <div className="space-y-6 max-w-5xl min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-fg break-words">{t('headings.dashboard')}</h1>
          <p className="text-sm text-fg-muted">Overview for {orgName}</p>
        </div>
        <button type="button" onClick={() => setIsAddBuildingOpen(true)} className="btn btn--primary btn--sm">
          <Plus className="h-4 w-4 mr-1.5" />
          {t('buildings.addBuilding')}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="kpis">
        <div className="kpi">
          <span className="kpi__label">
            <Building2 className="h-4 w-4 text-accent" />
            {t('headings.buildings')}
          </span>
          <span className="kpi__value">{buildings.length}</span>
          <span className="kpi__meta">{totalUnits} units total</span>
        </div>

        <div className="kpi">
          <span className="kpi__label">
            <Users className="h-4 w-4 text-accent" />
            Occupancy
          </span>
          <span className="kpi__value">{occupancyPercent}%</span>
          <span className="kpi__meta">
            {totalOccupied} of {totalUnits} occupied
          </span>
        </div>

        <div className="kpi">
          <span className="kpi__label">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Outstanding
          </span>
          <span className={`kpi__value ${totalOutstanding > 0 ? 'text-danger' : 'text-fg'}`}>
            {formatMoney(totalOutstanding)}
          </span>
          <span className="kpi__meta">Across all buildings</span>
        </div>

        <div className="kpi">
          <span className="kpi__label">
            <Receipt className="h-4 w-4 text-accent" />
            Billed
          </span>
          <span className="kpi__value">৳0</span>
          <span className="kpi__meta">This month</span>
        </div>
      </div>

      {/* Buildings Quick List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-fg">{t('headings.buildings')}</h2>
          <Link to="/l/buildings" className="btn--link text-xs">
            View all ({buildings.length})
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {buildings.slice(0, 4).map((b) => (
            <Link
              key={b.id}
              to={`/l/buildings/${b.id}`}
              className="card p-4 hover:border-accent transition-colors group block no-underline"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-fg group-hover:text-accent transition-colors truncate">
                  {b.name}
                </span>
                <ChevronRight className="h-4 w-4 text-fg-muted group-hover:text-accent" />
              </div>
              <p className="text-xs text-fg-muted mt-1 truncate">{b.address}</p>
              <div className="flex items-center gap-4 text-xs text-fg-muted mt-3">
                <span>{b.unitCount ?? 0} units</span>
                <span>{b.occupiedCount ?? 0} occupied</span>
                <span>Bill day: {b.billDay}th</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <AddBuildingDialog isOpen={isAddBuildingOpen} onClose={() => setIsAddBuildingOpen(false)} />
    </div>
  );
}
