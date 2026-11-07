import { lazy, type ComponentType } from 'react';
import { createBrowserRouter } from 'react-router';
import { AuthLayout } from './layouts/AuthLayout';
import { LandlordLayout } from './layouts/LandlordLayout';
import { TenantLayout } from './layouts/TenantLayout';
import { AdminLayout } from './layouts/AdminLayout';
import RouteError from '../pages/shared/RouteError';
import NotFound from '../pages/shared/NotFound';
import { pageLoaders, type RoutePath } from '../lib/router/preload';

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

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    errorElement: <RouteError />,
    children: [
      {
        path: '/',
        Component: page('/'),
      },
      {
        path: '/login',
        Component: page('/login'),
      },
      {
        path: '/signup',
        Component: page('/signup'),
      },
    ],
  },
  {
    path: '/l',
    element: <LandlordLayout />,
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
        path: 'billing',
        Component: page('/l/billing'),
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
    element: <LandlordLayout />,
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
    element: <TenantLayout />,
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
        path: 'requests',
        Component: page('/t/requests'),
      },
      {
        path: 'notices',
        Component: page('/t/notices'),
      },
      {
        path: 'account',
        Component: page('/t/account'),
      },
    ],
  },
  {
    path: '/a',
    element: <AdminLayout />,
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
    element: <TenantLayout />,
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        Component: page('/account'),
      },
    ],
  },
  {
    path: '*',
    element: <NotFound />,
    errorElement: <RouteError />,
  },
]);
