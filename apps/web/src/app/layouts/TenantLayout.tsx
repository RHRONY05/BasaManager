import { Suspense, useEffect, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Home, Receipt, Wrench, Bell, User } from 'lucide-react';
import { PrefetchLink } from '../../lib/router/PrefetchLink';
import { idlePreloadRoutes } from '../../lib/router/preload';
import { TopProgressBar } from '../../components/ui/TopProgressBar';
import { RouteSkeleton } from '../../components/ui/RouteSkeleton';
import { OrgSwitcher } from '../../components/ui/OrgSwitcher';
import { AccountMenu } from '../../components/ui/AccountMenu';

export function TenantLayout() {
  const location = useLocation();
  const { t } = useTranslation();

  const navItems = useMemo(
    () => [
      { to: '/t', label: t('nav.home'), icon: Home, end: true },
      { to: '/t/bills', label: t('nav.bills'), icon: Receipt, end: false },
      { to: '/t/requests', label: t('nav.requests'), icon: Wrench, end: false },
      { to: '/t/notices', label: t('nav.notices'), icon: Bell, end: false },
      { to: '/t/account', label: t('nav.account'), icon: User, end: false },
    ],
    [t],
  );

  useEffect(() => {
    idlePreloadRoutes(navItems.map((item) => item.to));
  }, [navItems]);

  return (
    <div className="min-h-dvh flex flex-col bg-bg text-fg">
      <TopProgressBar />

      {/* Top Header (Desktop & Mobile) */}
      <header className="border-b border-border bg-surface shrink-0">
        <div className="max-w-content mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <PrefetchLink
              to="/t"
              className="text-base font-bold text-fg min-h-tap flex items-center whitespace-nowrap min-w-0 shrink-0"
            >
              <span title={t('appName')} className="truncate">
                {t('appName')}
              </span>
            </PrefetchLink>
            <OrgSwitcher />
          </div>

          {/* Desktop Top Nav (≥ md) */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <PrefetchLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-1.5 px-3 py-2 min-h-tap rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-accent text-accent-fg'
                        : 'text-fg-muted hover:text-fg hover:bg-surface-hover'
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span title={item.label} className="truncate">
                    {item.label}
                  </span>
                </PrefetchLink>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <AccountMenu />
          </div>
        </div>
      </header>

      {/* Centred Column (≤ 720 px) */}
      <main className="flex-1 w-full max-w-content mx-auto p-4 sm:p-6 min-w-0 pb-24 md:pb-6">
        <Suspense key={location.pathname} fallback={<RouteSkeleton />}>
          <Outlet />
        </Suspense>
      </main>

      {/* Mobile Bottom Tab Bar (< md, 5 items) */}
      <nav
        data-bottom-nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border min-h-bottom-nav pb-[env(safe-area-inset-bottom)] md:hidden flex items-stretch"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <PrefetchLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex-1 basis-0 min-w-0 min-h-bottom-nav flex flex-col items-center justify-center p-1 text-center whitespace-nowrap transition-colors ${
                  isActive ? 'text-accent font-medium' : 'text-fg-muted hover:text-fg'
                }`
              }
            >
              <Icon className="h-5 w-5 shrink-0 mb-1" aria-hidden="true" />
              <span title={item.label} className="text-xs truncate max-w-full block leading-none">
                {item.label}
              </span>
            </PrefetchLink>
          );
        })}
      </nav>
    </div>
  );
}
