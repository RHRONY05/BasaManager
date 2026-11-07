import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Providers } from './app/providers';
import { router } from './app/router';
import { queryClient } from './lib/api/queryClient';
import { publicConfigQuery } from './lib/api/publicConfig';
import { initSentry, captureError } from './lib/sentry';
import './styles/globals.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  );
}

// Start Sentry once the public config (DSN, environment) is known. Never blocks rendering.
void queryClient
  .fetchQuery(publicConfigQuery)
  .then((config) => {
    const on = initSentry(config);
    // TEMPORARY (V3): one test error to prove Sentry works; removed right after verification.
    if (on && new URLSearchParams(window.location.search).has('sentry-test')) {
      captureError(new Error('BasaManager web Sentry test error (V3)'));
    }
  })
  .catch(() => undefined);
