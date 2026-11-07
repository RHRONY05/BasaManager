import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

const configFile = fileURLToPath(import.meta.url);
const posix = (p: string) => p.replace(/\\/g, '/');
const docsDir = posix(path.resolve(path.dirname(configFile), '../../../docs')) + '/';

/**
 * Site config for the learning docs. The VitePress project root is apps/docs (the package that depends on
 * vitepress, so its imports resolve); the Markdown lives in ../../docs and is pulled in with `srcDir`.
 * Build: `pnpm --filter @bm/docs build` (`vitepress build .`).
 *
 * The Mermaid theme variables are the pastel palette of the `visual-diagram` skill, so Mermaid
 * diagrams (sequence, state) look like the hand-made SVG ones:
 * pink = people/external, blue = our system, purple = data stores, yellow = decision/warning, green = output.
 */
const palette = {
  pink: '#FEC8C3',
  blue: '#BFE3FD',
  purple: '#E3CCFD',
  yellow: '#FFF1B8',
  green: '#C9F2D6',
  ink: '#1f1f1f',
  line: '#6b6880',
};

const features = [
  ['auth', 'Auth & accounts'],
  ['organisations-and-staff', 'Organisations & staff'],
  ['buildings-and-units', 'Buildings & units'],
  ['tenants-and-leases', 'Tenants & leases'],
  ['billing', 'Billing'],
  ['payments', 'Payments'],
  ['receipts-and-statements', 'Receipts & statements'],
  ['maintenance', 'Maintenance'],
  ['notifications', 'Notifications'],
  ['notices', 'Notices'],
  ['documents', 'Documents'],
  ['dashboards-and-reports', 'Dashboards & reports'],
  ['admin', 'Admin'],
] as const;

const concepts = [
  ['authentication-and-sessions', 'Authentication & sessions'],
  ['authorization', 'Authorization'],
  ['multi-tenancy-and-rls', 'Multi-tenancy & row-level security'],
  ['validation-with-zod', 'Validation with Zod'],
  ['transactions-and-locking', 'Transactions & locking'],
  ['idempotency', 'Idempotency & unique constraints'],
  ['money-and-rounding', 'Money & rounding'],
  ['dates-and-timezones', 'Dates & time zones'],
  ['realtime-socketio', 'Real-time with Socket.io'],
  ['background-jobs', 'Background jobs & cron'],
  ['notification-pipeline-outbox', 'Notification pipeline (outbox)'],
  ['web-push-from-zero', 'Web Push from zero'],
  ['file-uploads-and-signed-urls', 'File uploads & signed URLs'],
  ['payment-gateways-and-webhooks', 'Payment gateways & webhooks'],
  ['pdf-generation', 'PDF generation'],
  ['caching-and-rate-limiting', 'Caching & rate limiting'],
  ['logging', 'Logging (Pino)'],
  ['sentry-from-zero', 'Sentry from zero'],
  ['environments', 'Environments & config'],
  ['ci-cd', 'CI/CD pipeline'],
  ['docker-and-vps', 'Docker & the VPS'],
  ['backups', 'Backups'],
  ['security-checklist', 'Security checklist'],
  ['testing-strategy', 'Testing strategy'],
  ['data-lifecycle-and-deletion', 'Data lifecycle & deletion'],
] as const;

const items = (dir: string, list: readonly (readonly [string, string])[]) =>
  list.map(([slug, text]) => ({ text, link: `/${dir}/${slug}` }));

export default withMermaid(
  defineConfig({
    title: 'BasaManager Docs',
    description:
      'Learning documentation for BasaManager: how every feature works, where its data lives, and why.',
    lang: 'en',
    srcDir: '../../docs',
    cleanUrls: true,
    vite: {
      plugins: [
        {
          // The Markdown lives in ../../docs, outside this package, so Vite would look for `vue` and friends
          // in the repo root (where pnpm installs none). Resolve every bare import made by a page as if it were
          // made from this config file, i.e. from apps/docs/node_modules.
          name: 'bm-resolve-bare-imports-from-apps-docs',
          enforce: 'pre',
          async resolveId(source, importer, options) {
            if (!importer || !posix(importer).startsWith(docsDir)) return null;
            if (/^(\.|\/|\0|[a-zA-Z]:[\\/])/.test(source)) return null;
            return this.resolve(source, configFile, { ...options, skipSelf: true });
          },
        },
      ],
    },
    // The brief requires dead links to fail the build.
    ignoreDeadLinks: false,
    lastUpdated: false,
    head: [['link', { rel: 'icon', href: 'data:,' }]],
    themeConfig: {
      search: { provider: 'local' },
      nav: [
        { text: 'Start', link: '/' },
        { text: 'Learning path', link: '/learning-path' },
        { text: 'Features', link: '/features/' },
        { text: 'Concepts', link: '/concepts/' },
      ],
      sidebar: [
        {
          text: 'Overview',
          items: [
            { text: 'Start here', link: '/' },
            { text: 'Learning path', link: '/learning-path' },
            { text: 'System context', link: '/overview/system-context' },
            { text: 'Architecture', link: '/overview/architecture' },
            { text: 'Request lifecycle', link: '/overview/request-lifecycle' },
            { text: 'Repo map', link: '/overview/repo-map' },
            { text: 'Data map', link: '/overview/data-map' },
            { text: 'Glossary', link: '/overview/glossary' },
          ],
        },
        {
          text: 'Concepts',
          collapsed: true,
          items: [{ text: 'All concepts', link: '/concepts/' }, ...items('concepts', concepts)],
        },
        {
          text: 'Features',
          collapsed: true,
          items: [{ text: 'All features', link: '/features/' }, ...items('features', features)],
        },
        {
          text: 'Operations',
          collapsed: true,
          items: [
            { text: 'Runbooks', link: '/operations/' },
            { text: 'Deploy', link: '/operations/deploy' },
            { text: 'Roll back', link: '/operations/rollback' },
            { text: 'Backup & restore drill', link: '/operations/backup-and-restore' },
            { text: 'Rotate a secret', link: '/operations/rotate-a-secret' },
            { text: 'Incident playbook', link: '/operations/incident-playbook' },
            { text: 'Reading logs & Sentry', link: '/operations/reading-logs-and-sentry' },
          ],
        },
        {
          text: 'Decisions',
          collapsed: true,
          items: [
            { text: 'About ADRs', link: '/decisions/' },
            { text: 'ADR-001 Monorepo', link: '/decisions/ADR-001-monorepo' },
          ],
        },
        {
          text: 'Reference',
          collapsed: true,
          items: [
            { text: 'Reference', link: '/reference/' },
            { text: 'Environment variables', link: '/reference/env-vars' },
            { text: 'Error codes', link: '/reference/error-codes' },
          ],
        },
      ],
      outline: { level: [2, 3] },
      footer: {
        message: 'Describes the code as it is. If a page and the code disagree, the code wins: fix the page.',
      },
    },
    mermaid: {
      theme: 'base',
      themeVariables: {
        fontFamily: "'Segoe UI', Inter, Helvetica, Arial, sans-serif",
        primaryColor: palette.blue,
        primaryTextColor: palette.ink,
        primaryBorderColor: palette.line,
        secondaryColor: palette.purple,
        tertiaryColor: palette.green,
        lineColor: palette.line,
        textColor: palette.ink,
        noteBkgColor: palette.yellow,
        noteTextColor: palette.ink,
        actorBkg: palette.pink,
        actorBorder: palette.line,
        actorTextColor: palette.ink,
        signalColor: palette.line,
        signalTextColor: palette.ink,
        labelBoxBkgColor: palette.yellow,
        labelBoxBorderColor: palette.line,
        labelTextColor: palette.ink,
        activationBkgColor: palette.blue,
        activationBorderColor: palette.line,
        sequenceNumberColor: palette.ink,
      },
    },
  }),
);
