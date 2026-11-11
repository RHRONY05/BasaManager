import { lazy, type ComponentType } from 'react';
import { createBrowserRouter } from 'react-router';
import { AuthLayout } from './layouts/AuthLayout';
import { LandlordLayout } from './layouts/LandlordLayout';
import { TenantLayout } from './layouts/TenantLayout';
import { AdminLayout } from './layouts/AdminLayout';
import RouteError from '../pages/shared/RouteError';
import NotFound from '../pages/shared/NotFound';
import { pageLoaders, type RoutePath } from '../lib/router/preload';
import { RequireAuth, RequireRole, RedirectIfSignedIn } from './auth/guards';

// Pages are React.lazy components (not route `lazy`): React Router resolves route `lazy` inside the
// navigation, so the URL and active nav would not change until the chunk arrives. With React.lazy the
// navigation commits at once and the layout's keyed <Suspense> shows the route skeleton.
const pageCache = new Map<RoutePath, ComponentType>();
function page(path: RoutePath): ComponentType {
  let C = pageCache.get(path);
  if (!C) {
    C = lazy(pageLoaders[path]) as ComponentType;
    pageCache.set(path, C);
  }
  return C;
}

const Landing = page('/');
const Login = page('/login');
const Signup = page('/signup');

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <RedirectIfSignedIn>
        <Landing />
      </RedirectIfSignedIn>
    ),
    errorElement: <RouteError />,
  },
  {
    element: <AuthLayout />,
    errorElement: <RouteError />,
    children: [
      {
        path: '/login',
        element: (
          <RedirectIfSignedIn>
            <Login />
          </RedirectIfSignedIn>
        ),
      },
      {
        path: '/signup',
        element: (
          <RedirectIfSignedIn>
            <Signup />
          </RedirectIfSignedIn>
        ),
      },
      {
        path: '/verify-email',
        Component: page('/verify-email'),
      },
      {
        path: '/forgot-password',
        Component: page('/forgot-password'),
      },
      {
        path: '/reset-password',
        Component: page('/reset-password'),
      },
      {
        path: '/invite/:token',
        Component: page('/invite/:token'),
      },
    ],
  },
  {
    path: '/l',
    element: (
      <RequireRole roles={['landlord']}>
        <LandlordLayout />
      </RequireRole>
    ),
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        Component: page('/l'),
      },
      {
        path: 'buildings',
        Component: page('/l/buildings'),
      },
      {
        path: 'buildings/:id',
        Component: page('/l/buildings/:id'),
      },
      {
        path: 'tenants',
        Component: page('/l/tenants'),
      },
      {
        path: 'leases/new',
        Component: page('/l/leases/new'),
      },
      {
        path: 'leases/:id',
        Component: page('/l/leases/:id'),
      },
      {
        path: 'tenants/:id',
        Component: page('/l/tenants/:id'),
      },
      {
        path: 'team',
        Component: page('/l/team'),
      },
      {
        path: 'settings',
        Component: page('/l/settings'),
      },
      {
        path: 'billing',
        Component: page('/l/billing'),
      },
      {
        path: 'bills/:id',
        Component: page('/l/bills/:id'),
      },
      {
        path: 'payments',
        Component: page('/l/payments'),
      },
      {
        path: 'maintenance',
        Component: page('/l/maintenance'),
      },
    ],
  },
  {
    path: '/c',
    element: (
      <RequireRole roles={['caretaker']}>
        <LandlordLayout />
      </RequireRole>
    ),
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        Component: page('/c'),
      },
      {
        path: 'billing',
        Component: page('/c/billing'),
      },
      {
        path: 'payments',
        Component: page('/c/payments'),
      },
      {
        path: 'maintenance',
        Component: page('/c/maintenance'),
      },
      {
        path: 'notices',
        Component: page('/c/notices'),
      },
    ],
  },
  {
    path: '/t',
    element: (
      <RequireRole roles={['tenant']}>
        <TenantLayout />
      </RequireRole>
    ),
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        Component: page('/t'),
      },
      {
        path: 'bills',
        Component: page('/t/bills'),
      },
      {
        path: 'bills/:id',
        Component: page('/t/bills/:id'),
      },
      {
        path: 'requests',
        Component: page('/t/requests'),
      },
      {
        path: 'notices',
        Component: page('/t/notices'),
      },
      {
        path: 'lease',
        Component: page('/t/lease'),
      },
      {
        path: 'account',
        Component: page('/t/account'),
      },
    ],
  },
  {
    path: '/a',
    element: (
      <RequireRole roles={['admin']}>
        <AdminLayout />
      </RequireRole>
    ),
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        Component: page('/a'),
      },
    ],
  },
  {
    path: '/account',
    element: (
      <RequireAuth>
        <TenantLayout />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        Component: page('/account'),
      },
    ],
  },
  {
    path: '/pay/result',
    element: (
      <RequireRole roles={['tenant']}>
        <TenantLayout />
      </RequireRole>
    ),
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        Component: page('/pay/result'),
      },
    ],
  },
  {
    path: '*',
    element: <NotFound />,
    errorElement: <RouteError />,
  },
]);
