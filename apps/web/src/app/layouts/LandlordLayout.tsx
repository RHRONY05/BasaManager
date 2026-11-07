import { Suspense, useEffect, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Building2,
  Receipt,
  CreditCard,
  Wrench,
  CheckSquare,
  Bell,
  User,
} from 'lucide-react';
import { PrefetchLink } from '../../lib/router/PrefetchLink';
import { idlePreloadRoutes } from '../../lib/router/preload';
import { TopProgressBar } from '../../components/ui/TopProgressBar';
import { RouteSkeleton } from '../../components/ui/RouteSkeleton';

export function LandlordLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const isCaretaker = location.pathname.startsWith('/c');

  const navItems = useMemo(
    () =>
      isCaretaker
        ? [
            { to: '/c', label: t('nav.today'), icon: CheckSquare, end: true },
            { to: '/c/billing', label: t('nav.billing'), icon: Receipt, end: false },
            { to: '/c/payments', label: t('nav.payments'), icon: CreditCard, end: false },
            { to: '/c/maintenance', label: t('nav.maintenance'), icon: Wrench, end: false },
            { to: '/c/notices', label: t('nav.notices'), icon: Bell, end: false },
          ]
        : [
            { to: '/l', label: t('nav.dashboard'), icon: LayoutDashboard, end: true },
            { to: '/l/buildings', label: t('nav.buildings'), icon: Building2, end: false },
            { to: '/l/billing', label: t('nav.billing'), icon: Receipt, end: false },
            { to: '/l/payments', label: t('nav.payments'), icon: CreditCard, end: false },
            { to: '/l/maintenance', label: t('nav.maintenance'), icon: Wrench, end: false },
          ],
    [isCaretaker, t],
  );

  useEffect(() => {
    idlePreloadRoutes(navItems.map((item) => item.to));
  }, [navItems]);

  return (
    <div className="min-h-dvh flex flex-col md:flex-row bg-bg text-fg">
      <TopProgressBar />

      {/* Desktop Sidebar (≥ md) */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-surface shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <PrefetchLink
            to={isCaretaker ? '/c' : '/l'}
            className="text-lg font-bold text-fg hover:text-accent transition-colors min-h-tap flex items-center whitespace-nowrap min-w-0"
          >
            <span title={t('appName')} className="truncate">
              {t('appName')}
            </span>
          </PrefetchLink>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <PrefetchLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 min-h-tap rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-accent text-accent-fg'
                      : 'text-fg-muted hover:text-fg hover:bg-surface-hover'
                  }`
                }
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span title={item.label} className="truncate">
                  {item.label}
                </span>
              </PrefetchLink>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border">
          <PrefetchLink
            to="/account"
            className="flex items-center gap-3 px-3 py-2.5 min-h-tap rounded-md text-sm font-medium text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors whitespace-nowrap"
          >
            <User className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span title={t('nav.account')} className="truncate">
              {t('nav.account')}
            </span>
          </PrefetchLink>
        </div>
      </aside>

      {/* Mobile Top Bar (< md) */}
      <header className="md:hidden border-b border-border bg-surface shrink-0">
        <div className="h-14 px-4 flex items-center justify-between">
          <PrefetchLink
            to={isCaretaker ? '/c' : '/l'}
            className="text-base font-bold text-fg min-h-tap flex items-center whitespace-nowrap min-w-0"
          >
            <span title={t('appName')} className="truncate">
              {t('appName')}
            </span>
          </PrefetchLink>
          <PrefetchLink
            to="/account"
            aria-label={t('nav.account')}
            className="min-h-tap min-w-tap inline-flex items-center justify-center text-fg-muted hover:text-fg"
          >
            <User className="h-5 w-5 shrink-0" />
          </PrefetchLink>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 min-w-0 pb-24 md:pb-6">
        <Suspense key={location.pathname} fallback={<RouteSkeleton />}>
          <Outlet />
        </Suspense>
      </main>

      {/* Mobile Bottom Tab Bar (< md, ≤ 5 items) */}
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
