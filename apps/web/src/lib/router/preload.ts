export const pageLoaders = {
  '/': () => import('../../pages/auth/LandingPage'),
  '/login': () => import('../../pages/auth/LoginPage'),
  '/signup': () => import('../../pages/auth/SignupPage'),
  '/verify-email': () => import('../../pages/auth/VerifyEmailPage'),
  '/forgot-password': () => import('../../pages/auth/ForgotPasswordPage'),
  '/reset-password': () => import('../../pages/auth/ResetPasswordPage'),
  '/invite/:token': () => import('../../pages/auth/InvitePage'),
  '/l': () => import('../../pages/landlord/DashboardPage'),
  '/l/buildings': () => import('../../pages/landlord/BuildingsPage'),
  '/l/buildings/:id': () => import('../../pages/landlord/BuildingDetailPage'),
  '/l/tenants': () => import('../../pages/landlord/TenantsPage'),
  '/l/leases/new': () => import('../../pages/landlord/CreateLeasePage'),
  '/l/leases/:id': () => import('../../pages/landlord/LeaseDetailPage'),
  '/l/tenants/:id': () => import('../../pages/landlord/TenantHistoryPage'),
  '/l/team': () => import('../../pages/landlord/TeamPage'),
  '/l/settings': () => import('../../pages/landlord/SettingsPage'),
  '/l/billing': () => import('../../pages/landlord/BillingPage'),
  '/l/payments': () => import('../../pages/landlord/PaymentsPage'),
  '/l/maintenance': () => import('../../pages/landlord/MaintenancePage'),
  '/c': () => import('../../pages/caretaker/TodayPage'),
  '/c/billing': () => import('../../pages/landlord/BillingPage'),
  '/c/payments': () => import('../../pages/landlord/PaymentsPage'),
  '/c/maintenance': () => import('../../pages/landlord/MaintenancePage'),
  '/c/notices': () => import('../../pages/caretaker/NoticesPage'),
  '/t': () => import('../../pages/tenant/HomePage'),
  '/t/bills': () => import('../../pages/tenant/BillsPage'),
  '/t/requests': () => import('../../pages/tenant/RequestsPage'),
  '/t/notices': () => import('../../pages/tenant/NoticesPage'),
  '/t/lease': () => import('../../pages/tenant/TenantLeasePage'),
  '/t/account': () => import('../../pages/tenant/TenantAccountPage'),
  '/a': () => import('../../pages/admin/AdminPage'),
  '/account': () => import('../../pages/shared/AccountPage'),
} as const;

export type RoutePath = keyof typeof pageLoaders;

/**
 * Every routed page path. The single source for the router test and the e2e specs (layout, states),
 * so a new page cannot be added without being audited.
 */
export const ROUTE_PATHS = Object.keys(pageLoaders) as RoutePath[];

const preloadedSet = new Set<string>();

export function preloadRoute(path: string): Promise<unknown> {
  const loader = pageLoaders[path as RoutePath];
  if (!loader) return Promise.resolve();
  preloadedSet.add(path);
  return loader();
}

export function idlePreloadRoutes(paths: readonly string[]): void {
  if (typeof window === 'undefined') return;

  const run = () => {
    for (const path of paths) {
      if (!preloadedSet.has(path)) {
        void preloadRoute(path);
      }
    }
  };

  if ('requestIdleCallback' in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(run);
  } else {
    setTimeout(run, 200);
  }
}
