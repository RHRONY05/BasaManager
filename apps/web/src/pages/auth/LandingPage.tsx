import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Send, CheckCircle2, ReceiptText, Wrench } from 'lucide-react';
import { BrandMark } from '../../components/ui/BrandMark';
import { TopProgressBar } from '../../components/ui/TopProgressBar';

export default function LandingPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh flex flex-col bg-bg text-fg [overflow-wrap:anywhere]">
      <TopProgressBar />

      {/* Main navigation */}
      <header className="border-b border-border bg-surface shrink-0">
        <nav
          className="max-w-[var(--width-page)] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-2 min-w-0"
          aria-label={t('nav.home')}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to="/"
              aria-label={t('appName')}
              className="brand min-w-tap flex items-center gap-2 font-bold text-fg text-base sm:text-lg min-h-tap whitespace-nowrap"
            >
              <BrandMark className="brand__mark w-8 h-8 shrink-0" />
              <span className="hidden sm:inline">{t('appName')}</span>
            </Link>
            <span className="brand__bn text-fg-muted font-normal text-sm hidden sm:inline" lang="bn">
              {t('brandBn')}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/login"
              className="btn btn--ghost hidden sm:inline-flex text-sm min-h-tap px-3 py-1.5 font-medium hover:bg-muted rounded-md transition-colors whitespace-nowrap"
            >
              {t('auth.signIn')}
            </Link>
            <Link
              to="/signup"
              className="btn btn--primary text-sm min-h-tap px-2.5 sm:px-3 py-1.5 font-medium bg-accent text-accent-fg hover:bg-accent-hover rounded-md transition-colors whitespace-nowrap"
            >
              {t('auth.createAccount')}
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1 flex flex-col">
        {/* Hero Section */}
        <section
          className="max-w-[var(--width-page)] mx-auto px-4 sm:px-8 py-12 md:py-20 w-full"
          aria-labelledby="hero-h"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
            <div className="flex flex-col gap-5 min-w-0">
              <p className="text-xs uppercase tracking-wider font-semibold text-accent-text">
                {t('auth.landing.eyebrow')}
              </p>
              <h1
                id="hero-h"
                className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-fg leading-tight"
              >
                {t('auth.landing.title')}
              </h1>
              <p className="text-base sm:text-lg text-fg-secondary leading-relaxed max-w-xl">
                {t('auth.landing.lead')}
              </p>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 pt-2">
                <Link
                  to="/signup"
                  className="btn btn--primary btn--lg text-base text-center justify-center font-semibold bg-accent text-accent-fg hover:bg-accent-hover rounded-md px-4 py-2 min-h-control whitespace-normal sm:whitespace-nowrap"
                >
                  {t('auth.createAccount')}
                </Link>
                <Link
                  to="/login"
                  className="btn btn--secondary btn--lg text-base text-center justify-center font-semibold bg-surface border border-border-strong text-fg hover:bg-surface-hover rounded-md px-4 py-2 min-h-control whitespace-normal sm:whitespace-nowrap"
                >
                  {t('auth.signIn')}
                </Link>
              </div>
              <p className="text-xs sm:text-sm text-fg-muted">{t('auth.landing.inviteNote')}</p>
            </div>

            {/* Bill Preview Card */}
            <div
              className="relative min-w-0 p-4 sm:p-6 bg-surface rounded-xl border border-border shadow-md max-w-md mx-auto w-full"
              aria-label={t('auth.landing.stageExample')}
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <span className="font-semibold text-sm text-fg">{t('auth.landing.sampleMonthFlat')}</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-info-soft text-info-text border border-info-border">
                    <Send className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('auth.landing.issued')}</span>
                  </span>
                </div>

                <div className="ledger flex flex-col gap-2.5 text-sm">
                  <div className="ledger__row flex items-baseline justify-between gap-2">
                    <span className="ledger__label min-w-0 text-fg-secondary">{t('auth.landing.rent')}</span>
                    <span className="ledger__amount font-medium tabular-nums whitespace-nowrap text-fg">
                      ৳12,000
                    </span>
                  </div>
                  <div className="ledger__row flex items-baseline justify-between gap-2">
                    <span className="ledger__label min-w-0 text-fg-secondary">
                      {t('auth.landing.serviceCharge')}
                    </span>
                    <span className="ledger__amount font-medium tabular-nums whitespace-nowrap text-fg">
                      ৳1,500
                    </span>
                  </div>
                  <div className="ledger__row flex items-baseline justify-between gap-2">
                    <span className="ledger__label min-w-0 text-fg-secondary">{t('auth.landing.gas')}</span>
                    <span className="ledger__amount font-medium tabular-nums whitespace-nowrap text-fg">
                      ৳1,080
                    </span>
                  </div>
                  <div className="ledger__row flex items-baseline justify-between gap-2">
                    <span className="ledger__label min-w-0 text-fg-secondary">{t('auth.landing.water')}</span>
                    <span className="ledger__amount font-medium tabular-nums whitespace-nowrap text-fg">
                      ৳500
                    </span>
                  </div>
                  <div className="ledger__row flex flex-col gap-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="ledger__label min-w-0 text-fg-secondary">
                        {t('auth.landing.electricity')}
                      </span>
                      <span className="ledger__amount font-medium tabular-nums whitespace-nowrap text-fg">
                        ৳1,395
                      </span>
                    </div>
                    <span className="ledger__explain text-xs text-fg-muted">
                      {t('auth.landing.electricityExplain')}
                    </span>
                  </div>
                  <div className="ledger__total border-t-2 border-border pt-2 mt-1 flex items-baseline justify-between gap-2">
                    <span className="ledger__total-label font-bold text-fg">{t('auth.landing.total')}</span>
                    <span className="ledger__total-amount text-base font-bold tabular-nums whitespace-nowrap text-accent">
                      ৳16,475
                    </span>
                  </div>
                </div>

                <div
                  data-allow-wrap
                  className="btn btn--primary btn--block font-semibold bg-accent text-accent-fg py-2.5 rounded-md text-center text-sm cursor-default"
                  aria-hidden="true"
                >
                  {t('auth.landing.payNowSample')}
                </div>
              </div>

              {/* Toast sample badge */}
              <div
                className="mt-4 flex items-center gap-2 p-2.5 bg-inverse text-fg-inverse rounded-lg text-xs shadow-md"
                role="img"
                aria-label={t('auth.landing.toastSample')}
              >
                <CheckCircle2 className="w-4 h-4 text-success-primary shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">{t('auth.landing.toastSample')}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Why Landlords Switch */}
        <section className="bg-surface border-y border-border py-12 md:py-16 w-full" aria-labelledby="why-h">
          <div className="max-w-[var(--width-page)] mx-auto px-4 sm:px-8 grid md:grid-cols-2 gap-8 md:gap-12">
            <div className="flex flex-col gap-4 min-w-0">
              <p className="text-xs uppercase tracking-wider font-semibold text-accent-text">
                {t('auth.landing.whyEyebrow')}
              </p>
              <h2 id="why-h" className="text-xl sm:text-2xl font-bold tracking-tight text-fg">
                {t('auth.landing.whyTitle')}
              </h2>
              <p className="text-sm sm:text-base text-fg-secondary leading-relaxed">
                {t('auth.landing.whyLead')}
              </p>

              <div className="card bg-bg min-w-0 p-4 rounded-lg border border-border mt-2">
                <div className="ledger flex flex-col gap-2 text-xs sm:text-sm">
                  <div className="ledger__row flex flex-col gap-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="ledger__label min-w-0 text-fg-secondary">
                        {t('auth.landing.proratedRent')}
                      </span>
                      <span className="ledger__amount font-medium tabular-nums text-fg">৳5,200</span>
                    </div>
                    <span className="ledger__explain text-xs text-fg-muted">
                      {t('auth.landing.proratedExplain')}
                    </span>
                  </div>
                  <div className="ledger__row flex flex-col gap-0.5 border-t border-border-muted pt-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="ledger__label min-w-0 text-fg-secondary">
                        {t('auth.landing.lateFee')}
                      </span>
                      <span className="ledger__amount font-medium tabular-nums text-danger-text">+৳374</span>
                    </div>
                    <span className="ledger__explain text-xs text-fg-muted">
                      {t('auth.landing.lateFeeExplain')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6 justify-center min-w-0">
              <div className="flex gap-4">
                <span className="w-10 h-10 rounded-lg bg-accent-soft text-accent-text flex items-center justify-center shrink-0">
                  <ReceiptText className="w-5 h-5" aria-hidden="true" />
                </span>
                <div className="flex flex-col gap-1 min-w-0">
                  <h3 className="font-semibold text-base text-fg">{t('auth.landing.point1Title')}</h3>
                  <p className="text-sm text-fg-secondary leading-relaxed">{t('auth.landing.point1Desc')}</p>
                </div>
              </div>

              <div className="flex gap-4">
                <span className="w-10 h-10 rounded-lg bg-accent-soft text-accent-text flex items-center justify-center shrink-0">
                  <Wrench className="w-5 h-5" aria-hidden="true" />
                </span>
                <div className="flex flex-col gap-1 min-w-0">
                  <h3 className="font-semibold text-base text-fg">{t('auth.landing.point2Title')}</h3>
                  <p className="text-sm text-fg-secondary leading-relaxed">{t('auth.landing.point2Desc')}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Set Up In An Evening */}
        <section
          className="max-w-[var(--width-page)] mx-auto px-4 sm:px-8 py-12 md:py-16 w-full"
          aria-labelledby="how-h"
        >
          <h2 id="how-h" className="text-xl sm:text-2xl font-bold tracking-tight text-fg mb-8">
            {t('auth.landing.howTitle')}
          </h2>

          <ol className="grid sm:grid-cols-3 gap-6 list-none p-0 m-0">
            <li className="flex flex-col gap-2 min-w-0 p-5 bg-surface border border-border rounded-xl">
              <span className="text-2xl font-bold text-accent font-mono">01</span>
              <h3 className="font-semibold text-base text-fg">{t('auth.landing.step1Title')}</h3>
              <p className="text-sm text-fg-secondary leading-relaxed">{t('auth.landing.step1Desc')}</p>
            </li>
            <li className="flex flex-col gap-2 min-w-0 p-5 bg-surface border border-border rounded-xl">
              <span className="text-2xl font-bold text-accent font-mono">02</span>
              <h3 className="font-semibold text-base text-fg">{t('auth.landing.step2Title')}</h3>
              <p className="text-sm text-fg-secondary leading-relaxed">{t('auth.landing.step2Desc')}</p>
            </li>
            <li className="flex flex-col gap-2 min-w-0 p-5 bg-surface border border-border rounded-xl">
              <span className="text-2xl font-bold text-accent font-mono">03</span>
              <h3 className="font-semibold text-base text-fg">{t('auth.landing.step3Title')}</h3>
              <p className="text-sm text-fg-secondary leading-relaxed">{t('auth.landing.step3Desc')}</p>
            </li>
          </ol>

          <footer className="mt-16 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-fg-muted">
            <span>{t('auth.landing.footerMade')}</span>
            <span>{t('auth.landing.footerSandbox')}</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
