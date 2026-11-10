import { useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ArrowRight,
  Banknote,
  ChartColumn,
  CheckCircle2,
  CreditCard,
  FolderLock,
  Smartphone,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { BrandMark } from '../../components/ui/BrandMark';
import { TopProgressBar } from '../../components/ui/TopProgressBar';
import {
  BuildingCutaway,
  SceneBackdrop,
  type CutawayFlat,
  type FlatStatus,
} from '../../components/illustrations/BuildingCutaway';
import { MeterArt, TapArt } from '../../components/illustrations/FeatureArt';
import { CaretakerSpot, LandlordSpot, TenantSpot } from '../../components/illustrations/RoleSpots';
import { Skyline } from '../../components/illustrations/Skyline';
import { formatMoney } from '../../lib/format';

/** Wide page frame: 1360 max with small side gutters, so content gets the width. */
const frame = 'max-w-[var(--width-frame)] mx-auto px-4 sm:px-6 lg:px-10 w-full';
const kicker = 'text-sm font-semibold text-accent-text';
const h2 =
  'font-[family-name:var(--font-display)] text-section leading-heading font-bold tracking-heading text-fg';
const display = 'font-[family-name:var(--font-display)]';

// ---- Sample building (illustrative data; amounts in poisha) -----------------------------------------
type SampleFlat = CutawayFlat & { rent: number; prev: number; units: number };
const SERVICE = 150000;
const GAS = 108000;
const WATER = 50000;
const UNIT_PRICE = 900;
const FLOORS: { level: number; flats: [SampleFlat, SampleFlat] }[] = [
  {
    level: 6,
    flats: [
      { id: '6A', status: 'paid', rent: 1400000, prev: 2210, units: 132 },
      { id: '6B', status: 'due', rent: 1450000, prev: 1980, units: 171 },
    ],
  },
  {
    level: 5,
    flats: [
      { id: '5A', status: 'paid', rent: 1350000, prev: 3105, units: 118 },
      { id: '5B', status: 'vacant', rent: 1350000, prev: 870, units: 0 },
    ],
  },
  {
    level: 4,
    flats: [
      { id: '4A', status: 'due', rent: 1200000, prev: 1240, units: 155 },
      { id: '4B', status: 'paid', rent: 1250000, prev: 2640, units: 140 },
    ],
  },
  {
    level: 3,
    flats: [
      { id: '3A', status: 'repair', rent: 1200000, prev: 1515, units: 149 },
      { id: '3B', status: 'paid', rent: 1200000, prev: 2002, units: 126 },
    ],
  },
  {
    level: 2,
    flats: [
      { id: '2A', status: 'paid', rent: 1150000, prev: 1764, units: 98 },
      { id: '2B', status: 'due', rent: 1150000, prev: 2380, units: 164 },
    ],
  },
];
const ALL_FLATS: SampleFlat[] = FLOORS.flatMap((f) => f.flats);
const billTotal = (f: SampleFlat) => f.rent + SERVICE + GAS + WATER + f.units * UNIT_PRICE;
const reading = (n: number) => n.toLocaleString('en-IN');
/** Flat 4A drives the worked examples below the hero, so every number on the page agrees. */
const EXAMPLE = ALL_FLATS.find((f) => f.id === '4A')!;
const EXAMPLE_RECEIPT = 'BM-2026-000214';
const COUNTS = ALL_FLATS.reduce((acc, f) => ({ ...acc, [f.status]: acc[f.status] + 1 }), {
  paid: 0,
  due: 0,
  repair: 0,
  vacant: 0,
} as Record<FlatStatus, number>);

const ROLES: { key: 'Landlord' | 'Caretaker' | 'Tenant'; Spot: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { key: 'Landlord', Spot: LandlordSpot },
  { key: 'Caretaker', Spot: CaretakerSpot },
  { key: 'Tenant', Spot: TenantSpot },
];

const STATUS_TONE: Record<FlatStatus, string> = {
  paid: 'bg-success-soft text-success-text border-success-border',
  due: 'bg-danger-soft text-danger-text border-danger-border',
  repair: 'bg-warning-soft text-warning-text border-warning-border',
  vacant: 'bg-neutral-soft text-fg-secondary border-border',
};

const statusLabelFor = (t: TFunction, s: FlatStatus) =>
  ({
    paid: t('auth.landing.statusPaid'),
    due: t('auth.landing.statusDue'),
    repair: t('auth.landing.statusRepair'),
    vacant: t('auth.landing.statusVacant'),
  })[s];

export default function LandingPage() {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState('4A');
  const flat = ALL_FLATS.find((f) => f.id === selectedId) ?? ALL_FLATS[0]!;
  const statusLabel = (s: FlatStatus) => statusLabelFor(t, s);

  return (
    <div className="min-h-dvh flex flex-col bg-bg text-fg [overflow-wrap:anywhere]">
      <TopProgressBar />

      {/* ---------- Navigation ---------- */}
      <header className="sticky top-0 z-[var(--z-nav)] bg-bg/85 backdrop-blur border-b border-border-muted shrink-0">
        <nav
          className={`${frame} h-16 flex items-center justify-between gap-3 min-w-0`}
          aria-label={t('nav.home')}
        >
          <Link
            to="/"
            aria-label={t('appName')}
            data-allow-wrap
            className="brand min-w-tap min-h-tap flex items-center gap-2.5 shrink-0 text-fg"
          >
            <span className="w-9 h-9 rounded-[var(--radius-md)] bg-accent text-accent-fg flex items-center justify-center">
              <BrandMark className="brand__mark w-6 h-6" />
            </span>
            <span className="hidden sm:flex flex-col leading-none">
              <span className={`${display} text-lg font-bold tracking-tight`}>{t('appName')}</span>
              <span className="brand__bn text-xs text-fg-muted mt-0.5" lang="bn">
                {t('brandBn')}
              </span>
            </span>
          </Link>

          <div className="hidden lg:flex items-center gap-8 text-sm font-medium text-fg-secondary">
            {(
              [
                ['#features', 'navFeatures'],
                ['#roles', 'navRoles'],
                ['#how', 'navHow'],
              ] as const
            ).map(([href, k]) => (
              <a
                key={k}
                href={href}
                className="hover:text-fg transition-colors min-h-tap inline-flex items-center"
              >
                {t(`auth.landing.${k}`)}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <Link
              to="/login"
              className="hidden sm:inline-flex items-center min-h-tap px-3 text-sm font-semibold text-fg hover:text-accent-text transition-colors whitespace-nowrap"
            >
              {t('auth.signIn')}
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center justify-center min-h-tap px-3 sm:px-4 rounded-full bg-fg text-surface text-sm font-semibold hover:bg-accent hover:text-accent-fg transition-colors whitespace-nowrap"
            >
              {t('auth.createAccount')}
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1 flex flex-col">
        {/* ---------- Hero: copy + building cut-away ---------- */}
        <section aria-labelledby="hero-h" className="pt-8 pb-16 md:pt-12 lg:pb-24">
          <div
            className={`${frame} grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-10 lg:gap-12 items-center`}
          >
            <div className="flex flex-col gap-6 min-w-0 lg:py-8">
              <p className={kicker}>{t('auth.landing.eyebrow')}</p>
              <h1
                id="hero-h"
                className={`${display} text-display leading-display font-extrabold tracking-display text-fg`}
              >
                {t('auth.landing.title')}
              </h1>
              <p className="text-lg text-fg-secondary leading-relaxed max-w-[var(--width-prose)]">
                {t('auth.landing.lead')}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center gap-2 min-h-13 px-6 rounded-full bg-accent text-accent-fg text-base font-semibold hover:bg-accent-hover transition-colors whitespace-nowrap"
                >
                  {t('auth.createAccount')}
                  <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center min-h-13 px-6 rounded-full border border-border-strong text-fg text-base font-semibold hover:bg-surface transition-colors whitespace-nowrap"
                >
                  {t('auth.signIn')}
                </Link>
              </div>
              <div className="flex flex-col gap-1.5 pt-4 border-t border-border-muted text-sm text-fg-muted">
                <span>{t('auth.landing.heroFacts')}</span>
                <span>{t('auth.landing.inviteNote')}</span>
              </div>
            </div>

            {/* building + selected flat's bill */}
            <div className="min-w-0">
              <div className="relative overflow-hidden rounded-panel border border-border px-6 sm:px-10 pt-16 sm:pt-20 xl:pr-80">
                <SceneBackdrop />
                <div className="relative mx-auto xl:mx-0 w-full max-w-100 sm:pl-6">
                  <BuildingCutaway
                    floors={FLOORS}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    statusLabel={statusLabel}
                    flatLabel={(f) => t('auth.landing.flatAria', { id: f.id, status: statusLabel(f.status) })}
                    ariaLabel={t('auth.landing.buildingAria')}
                  />
                </div>
                <div className="h-6" aria-hidden="true" />
                <div
                  className="hidden xl:block absolute right-6 top-1/2 -translate-y-1/2 w-71"
                  aria-live="polite"
                >
                  <BillCard flat={flat} />
                </div>
              </div>
              <div className="xl:hidden relative -mt-6 mx-3 sm:mx-auto max-w-90" aria-live="polite">
                <BillCard flat={flat} />
              </div>
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-fg-muted px-1">
                <span>{t('auth.landing.summary', COUNTS)}</span>
                <span className="font-semibold text-accent-text">{t('auth.landing.tapHint')}</span>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Features: sticky intro + four worked examples ---------- */}
        <section
          id="features"
          className="scroll-mt-20 bg-surface border-y border-border py-16 md:py-24"
          aria-labelledby="features-h"
        >
          <div className={`${frame} grid lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] gap-10 lg:gap-16`}>
            <div className="lg:sticky lg:top-28 self-start flex flex-col gap-4 min-w-0">
              <p className={kicker}>{t('auth.landing.featuresEyebrow')}</p>
              <h2 id="features-h" className={h2}>
                {t('auth.landing.featuresTitle')}
              </h2>
              <p className="text-base text-fg-secondary leading-relaxed max-w-md">
                {t('auth.landing.featuresLead')}
              </p>
              <AlsoIncluded className="hidden lg:flex pt-6 mt-2 border-t border-border-muted" />
            </div>

            <ol className="flex flex-col gap-5 list-none p-0 m-0 min-w-0">
              <Feature
                n="01"
                title={t('auth.landing.whyTitle')}
                desc={t('auth.landing.whyLead')}
                tone="bg-accent-soft"
              >
                <div className="flex flex-col sm:flex-row md:flex-col xl:flex-row items-center gap-4 sm:gap-5 min-w-0">
                  <MeterArt
                    reading={String(EXAMPLE.prev + EXAMPLE.units).padStart(5, '0')}
                    className="w-20 sm:w-28 h-auto shrink-0"
                  />
                  <div className="w-full flex-1 min-w-0 bg-surface rounded-[var(--radius-lg)] border border-border p-4 text-sm shadow-[var(--shadow-sm)]">
                    <Row label={t('auth.landing.meterPrev')} value={reading(EXAMPLE.prev)} mono />
                    <Row
                      label={t('auth.landing.meterCurr')}
                      value={reading(EXAMPLE.prev + EXAMPLE.units)}
                      mono
                    />
                    <div className="my-2 border-t border-dashed border-border-strong" />
                    <Row
                      label={t('auth.landing.electricity')}
                      value={formatMoney(EXAMPLE.units * UNIT_PRICE)}
                      strong
                    />
                    <p className="text-xs text-fg-muted font-mono mt-0.5">
                      {t('auth.landing.elecExplain', {
                        prev: reading(EXAMPLE.prev),
                        curr: reading(EXAMPLE.prev + EXAMPLE.units),
                        units: EXAMPLE.units,
                      })}
                    </p>
                  </div>
                </div>
              </Feature>

              <Feature
                n="02"
                title={t('auth.landing.point1Title')}
                desc={t('auth.landing.point1Desc')}
                tone="bg-success-soft"
              >
                <div className="flex flex-col gap-4 min-w-0">
                  <div className="relative min-w-0 bg-surface rounded-t-[var(--radius-lg)] p-4 pb-6 shadow-[var(--shadow-md)] [clip-path:polygon(0_0,100%_0,100%_calc(100%-8px),95%_100%,90%_calc(100%-8px),85%_100%,80%_calc(100%-8px),75%_100%,70%_calc(100%-8px),65%_100%,60%_calc(100%-8px),55%_100%,50%_calc(100%-8px),45%_100%,40%_calc(100%-8px),35%_100%,30%_calc(100%-8px),25%_100%,20%_calc(100%-8px),15%_100%,10%_calc(100%-8px),5%_100%,0_calc(100%-8px))]">
                    <p className="text-xs text-fg-muted">{t('auth.landing.receiptTitle')}</p>
                    <p className="font-mono text-sm font-semibold text-fg">{EXAMPLE_RECEIPT}</p>
                    <p className={`${display} mt-3 text-3xl font-bold tabular-nums tracking-tight`}>
                      {formatMoney(billTotal(EXAMPLE))}
                    </p>
                    <p className="text-xs text-fg-muted">{t('auth.landing.receiptVia')}</p>
                    <span className="absolute right-4 top-4 rotate-[-10deg] rounded-[var(--radius-sm)] border-2 border-success-primary px-2 py-0.5 text-xs font-extrabold uppercase tracking-stamp text-success-text">
                      {t('auth.landing.stampPaid')}
                    </span>
                  </div>
                  <ul className="flex flex-wrap gap-2 list-none p-0 m-0 min-w-0" aria-hidden="true">
                    {(
                      [
                        [CreditCard, 'payOnline'],
                        [Banknote, 'payCash'],
                        [Smartphone, 'payBkash'],
                      ] as const
                    ).map(([Icon, k]) => (
                      <li
                        key={k}
                        className="flex items-center gap-2 rounded-full bg-surface border border-border px-3 py-1.5 text-xs font-medium text-fg min-w-0"
                      >
                        <Icon className="w-3.5 h-3.5 text-success-text shrink-0" />
                        <span className="min-w-0">{t(`auth.landing.${k}`)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Feature>

              <Feature
                n="03"
                title={t('auth.landing.point2Title')}
                desc={t('auth.landing.point2Desc')}
                tone="bg-warning-soft"
              >
                <div className="flex flex-col gap-3 min-w-0">
                  <div className="flex gap-3 bg-surface rounded-[var(--radius-lg)] rounded-tl-[var(--radius-xs)] border border-border p-3 shadow-[var(--shadow-sm)] min-w-0">
                    <TapArt className="w-16 sm:w-20 h-auto rounded-[var(--radius-sm)] shrink-0 self-start" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-fg-muted">{t('auth.landing.repairFrom')}</p>
                      <p className="text-sm text-fg mt-0.5">{t('auth.landing.repairMsg')}</p>
                    </div>
                  </div>
                  <ol className="flex flex-col gap-2 list-none p-0 m-0 pl-1" aria-hidden="true">
                    {(['repairStep1', 'repairStep2', 'repairStep3'] as const).map((k, i) => (
                      <li key={k} className="flex items-center gap-2.5 text-sm min-w-0">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${i < 2 ? 'bg-success-primary text-surface' : 'border-2 border-dashed border-border-strong'}`}
                        >
                          {i < 2 && <CheckCircle2 className="w-3.5 h-3.5" />}
                        </span>
                        <span className={`min-w-0 ${i < 2 ? 'text-fg' : 'text-fg-muted'}`}>
                          {t(`auth.landing.${k}`)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </Feature>

              <Feature
                n="04"
                title={t('auth.landing.f4Title')}
                desc={t('auth.landing.f4Desc')}
                tone="bg-info-soft"
              >
                <div className="relative mx-auto my-2 w-full max-w-85 -rotate-2 bg-surface rounded-[var(--radius-sm)] p-5 pt-6 shadow-[var(--shadow-md)]">
                  <span
                    className="absolute left-1/2 -translate-x-1/2 -top-2 w-4 h-4 rounded-full bg-danger-primary shadow-[var(--shadow-sm)]"
                    aria-hidden="true"
                  />
                  <p className="text-xs font-semibold text-info-text">{t('auth.landing.noticeFrom')}</p>
                  <p className="mt-1.5 text-base text-fg leading-snug">{t('auth.landing.noticeSample')}</p>
                </div>
              </Feature>
            </ol>

            <AlsoIncluded className="lg:hidden flex" />
          </div>
        </section>

        {/* ---------- Roles: one row with dividers ---------- */}
        <section id="roles" className="scroll-mt-20 py-16 md:py-24" aria-labelledby="roles-h">
          <div className={frame}>
            <div className="flex flex-col gap-3 max-w-2xl mb-10 md:mb-14">
              <p className={kicker}>{t('auth.landing.rolesEyebrow')}</p>
              <h2 id="roles-h" className={h2}>
                {t('auth.landing.rolesTitle')}
              </h2>
            </div>
            <ul className="grid md:grid-cols-3 list-none p-0 m-0 border-t border-border md:divide-x divide-border">
              {ROLES.map(({ key, Spot }) => (
                <li
                  key={key}
                  className="flex flex-col gap-3 min-w-0 py-8 md:px-8 md:first:pl-0 md:last:pr-0 border-b md:border-b-0 border-border"
                >
                  <Spot className="w-32 h-auto -ml-3" />
                  <h3 className="text-2xl font-bold text-fg">{t(`auth.landing.role${key}Title`)}</h3>
                  <p className="text-base text-fg-secondary leading-relaxed">
                    {t(`auth.landing.role${key}Desc`)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section id="how" className="scroll-mt-20 pb-16 md:pb-24" aria-labelledby="how-h">
          <div className={frame}>
            <div className="rounded-panel bg-surface border border-border p-6 sm:p-10 lg:p-14">
              <div className="flex flex-col gap-3 max-w-2xl mb-10">
                <p className={kicker}>{t('auth.landing.howEyebrow')}</p>
                <h2 id="how-h" className={h2}>
                  {t('auth.landing.howTitle')}
                </h2>
              </div>
              <ol className="grid md:grid-cols-3 gap-8 md:gap-10 list-none p-0 m-0">
                {[1, 2, 3].map((n) => (
                  <li key={n} className="flex flex-col gap-3 min-w-0">
                    <span
                      className={`${display} text-6xl font-extrabold leading-none tracking-heading text-accent-soft-hover [-webkit-text-stroke:1.5px_var(--accent-primary)]`}
                      aria-hidden="true"
                    >
                      {n}
                    </span>
                    <h3 className="text-xl font-bold text-fg">{t(`auth.landing.step${n}Title`)}</h3>
                    <p className="text-base text-fg-secondary leading-relaxed">
                      {t(`auth.landing.step${n}Desc`)}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ---------- Call to action ---------- */}
        <section className="relative overflow-hidden bg-accent text-accent-fg" aria-labelledby="cta-h">
          <div
            className={`${frame} relative z-10 pt-16 pb-36 sm:pb-44 md:pt-20 flex flex-col md:flex-row md:items-end md:justify-between gap-8`}
          >
            <div className="flex flex-col gap-4 max-w-2xl min-w-0">
              <h2
                id="cta-h"
                className={`${display} text-cta leading-heading font-extrabold tracking-heading`}
              >
                {t('auth.landing.ctaTitle')}
              </h2>
              <p className="text-base sm:text-lg opacity-90 leading-relaxed">{t('auth.landing.ctaLead')}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 min-h-13 px-6 rounded-full bg-surface text-accent-text text-base font-semibold hover:bg-surface-hover transition-colors whitespace-nowrap"
              >
                {t('auth.createAccount')}
                <ArrowRight className="hidden sm:block w-4 h-4 shrink-0" aria-hidden="true" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center min-h-13 px-6 rounded-full border border-accent-fg text-base font-semibold hover:bg-accent-hover transition-colors whitespace-nowrap"
              >
                {t('auth.signIn')}
              </Link>
            </div>
          </div>
          <Skyline
            windowFill="var(--illo-window-lit)"
            className="absolute inset-x-0 bottom-0 w-full h-auto min-h-22 text-accent-pressed"
          />
        </section>
      </main>

      <footer className="bg-bg">
        <div
          className={`${frame} py-8 flex flex-col md:flex-row md:items-center justify-between gap-4 text-sm text-fg-muted`}
        >
          <div className="flex items-center gap-2.5 text-fg">
            <span className="w-8 h-8 rounded-[var(--radius-sm)] bg-accent text-accent-fg flex items-center justify-center shrink-0">
              <BrandMark className="w-5 h-5" />
            </span>
            <span className="font-semibold">{t('auth.landing.footerMade')}</span>
          </div>
          <span>{t('auth.landing.footerSandbox')}</span>
        </div>
      </footer>
    </div>
  );
}

/** The bill for whichever flat is selected in the hero building. */
function BillCard({ flat }: { flat: SampleFlat }) {
  const { t } = useTranslation();
  const elec = flat.units * UNIT_PRICE;
  const occupied = flat.status !== 'vacant';
  const total = billTotal(flat);
  const receiptNo = `BM-2026-000${200 + ALL_FLATS.indexOf(flat)}`;
  const rows: [string, number][] = [
    [t('auth.landing.rent'), flat.rent],
    [t('auth.landing.serviceCharge'), SERVICE],
    [t('auth.landing.gas'), GAS],
    [t('auth.landing.water'), WATER],
    [t('auth.landing.electricity'), elec],
  ];

  return (
    <div className="bg-surface rounded-[var(--radius-xl)] border border-border shadow-[var(--shadow-lg)] p-4 min-w-0">
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-border">
        <span className="text-sm font-semibold text-fg min-w-0">
          {t('auth.landing.billMonthFlat', { id: flat.id })}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap shrink-0 ${STATUS_TONE[flat.status]}`}
        >
          {statusLabelFor(t, flat.status)}
        </span>
      </div>
      {occupied ? (
        <>
          <div className="flex flex-col gap-1.5 pt-3 text-sm">
            {rows.map(([label, amount]) => (
              <Row key={label} label={label} value={formatMoney(amount)} />
            ))}
            <p className="text-xs text-fg-muted font-mono -mt-1">
              {t('auth.landing.elecExplain', {
                prev: reading(flat.prev),
                curr: reading(flat.prev + flat.units),
                units: flat.units,
              })}
            </p>
            <div className="flex items-baseline justify-between gap-2 border-t-2 border-border pt-2 mt-1">
              <span className="font-bold text-fg">{t('auth.landing.total')}</span>
              <span
                className={`${display} text-xl font-bold tabular-nums whitespace-nowrap text-accent-text`}
              >
                {formatMoney(total)}
              </span>
            </div>
          </div>
          {flat.status === 'due' ? (
            <div
              data-allow-wrap
              className="mt-3 rounded-full bg-accent text-accent-fg py-2.5 text-center text-sm font-semibold"
              aria-hidden="true"
            >
              {t('auth.landing.payNow', { amount: formatMoney(total) })}
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-success-text">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{t('auth.landing.paidReceipt', { no: receiptNo })}</span>
            </p>
          )}
          {flat.status === 'repair' && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning-text">
              <Wrench className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{t('auth.landing.repairNote')}</span>
            </p>
          )}
        </>
      ) : (
        <p className="pt-3 text-sm text-fg-muted">{t('auth.landing.vacantNote')}</p>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="min-w-0 text-fg-secondary">{label}</span>
      <span
        className={`tabular-nums whitespace-nowrap text-fg ${mono ? 'font-mono' : ''} ${strong ? 'font-bold' : 'font-medium'}`}
      >
        {value}
      </span>
    </div>
  );
}

function Feature({
  n,
  title,
  desc,
  tone,
  children,
}: {
  n: string;
  title: string;
  desc: string;
  tone: string;
  children: ReactNode;
}) {
  return (
    <li className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-6 md:gap-8 items-center min-w-0 rounded-card-lg border border-border bg-bg p-5 sm:p-7">
      <div className="flex flex-col gap-3 min-w-0">
        <span className="font-mono text-sm font-semibold text-accent-text">{n}</span>
        <h3 className="text-2xl font-bold text-fg leading-tight">{title}</h3>
        <p className="text-base text-fg-secondary leading-relaxed">{desc}</p>
      </div>
      <div className={`rounded-[var(--radius-xl)] ${tone} p-5 sm:p-6 min-w-0`}>{children}</div>
    </li>
  );
}

function AlsoIncluded({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const items: [LucideIcon, string, string][] = [
    [FolderLock, t('auth.landing.f5Title'), t('auth.landing.f5Desc')],
    [ChartColumn, t('auth.landing.f6Title'), t('auth.landing.f6Desc')],
  ];
  return (
    <div className={`flex-col gap-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[var(--tracking-wide)] text-fg-muted">
        {t('auth.landing.alsoTitle')}
      </p>
      {items.map(([Icon, title, desc]) => (
        <div key={title} className="flex gap-3 min-w-0">
          <Icon className="w-5 h-5 text-accent-text shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">{title}</p>
            <p className="text-sm text-fg-secondary leading-relaxed">{desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
