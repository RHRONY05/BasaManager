import { useRef, useCallback, type ComponentProps } from 'react';
import { NavLink } from 'react-router';
import { preloadRoute } from './preload';

export type PrefetchLinkProps = Omit<ComponentProps<typeof NavLink>, 'prefetch'> & {
  prefetch?: () => void | Promise<unknown>;
};

export function PrefetchLink({
  to,
  prefetch,
  onPointerEnter,
  onFocus,
  onTouchStart,
  ...rest
}: PrefetchLinkProps) {
  const hasPrefetched = useRef(false);

  const handlePrefetch = useCallback(() => {
    if (hasPrefetched.current) return;
    hasPrefetched.current = true;

    if (typeof to === 'string') {
      void preloadRoute(to);
    } else if (typeof to === 'object' && to.pathname) {
      void preloadRoute(to.pathname);
    }

    if (prefetch) {
      try {
        void prefetch();
      } catch {
        // Ignore prefetch failures
      }
    }
  }, [to, prefetch]);

  return (
    <NavLink
      to={to}
      onPointerEnter={(e) => {
        handlePrefetch();
        onPointerEnter?.(e);
      }}
      onFocus={(e) => {
        handlePrefetch();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        handlePrefetch();
        onTouchStart?.(e);
      }}
      {...rest}
    />
  );
}
