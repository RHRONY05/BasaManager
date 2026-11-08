import { describe, it, expect } from 'vitest';
import type { RouteObject } from 'react-router';
import { router } from './router';
import { ROUTE_PATHS } from '../lib/router/preload';

function collectPaths(routes: RouteObject[], base = ''): string[] {
  return routes.flatMap((route) => {
    const own =
      route.path === undefined ? base : `${base.replace(/\/$/, '')}/${route.path}`.replace(/^\/\//, '/');
    const here = !route.children && route.path !== '*' ? [own || '/'] : [];
    return [...here, ...collectPaths(route.children ?? [], own)];
  });
}

describe('router', () => {
  it('routes exactly the paths in ROUTE_PATHS (the list the e2e specs iterate)', () => {
    expect(collectPaths(router.routes).sort()).toEqual([...ROUTE_PATHS].sort());
  });
});
