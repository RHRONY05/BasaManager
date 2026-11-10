import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Providers } from './app/providers';
import { router } from './app/router';
import { queryClient } from './lib/api/queryClient';
import { publicConfigQuery } from './lib/api/publicConfig';
import { initSentry } from './lib/sentry';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource-variable/noto-sans-bengali/wght.css';
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
  .then((config) => initSentry(config))
  .catch(() => undefined);
