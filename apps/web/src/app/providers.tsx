import { type ReactNode, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/api/queryClient';
import { publicConfigQuery } from '../lib/api/publicConfig';
import '../lib/i18n';

export interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  useEffect(() => {
    // Prefetch public config once at startup (non-blocking)
    void queryClient.prefetchQuery(publicConfigQuery);
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
