// Generates docs/reference/openapi.json from the shared Zod schemas (packages/shared), so the API
// reference can't drift from the contract. Owner: architect (04-API.md).
//
//   node scripts/openapi.mjs           write the file
//   node scripts/openapi.mjs --check   exit 1 if the committed file is out of date (CI)
//
// Node 22 runs the shared .ts sources directly (type stripping). The shared package uses extensionless
// relative imports (bundler style), so a small resolve hook retries them with `.ts`.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import * as prettier from 'prettier';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      const relative = specifier.startsWith('./') || specifier.startsWith('../');
      const hasExtension = /\.[cm]?[jt]s$/.test(specifier);
      if (err?.code === 'ERR_MODULE_NOT_FOUND' && relative && !hasExtension) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = resolve(root, 'docs/reference/openapi.json');

const shared = await import('../packages/shared/src/index.ts');
const {
  errorBodySchema,
  healthResponseSchema,
  readyResponseSchema,
  publicConfigResponseSchema,
  orgDetailResponseSchema,
  updateOrgRequestSchema,
  orgMembersResponseSchema,
  updateCaretakerBuildingsRequestSchema,
  inviteCaretakerRequestSchema,
  orgInvitesResponseSchema,
  createBuildingRequestSchema,
  updateBuildingRequestSchema,
  buildingResponseSchema,
  buildingsListResponseSchema,
  createUnitRequestSchema,
  updateUnitRequestSchema,
  unitResponseSchema,
  unitsListResponseSchema,
} = shared;

// Schemas with `.meta({ id })` in packages/shared become named components automatically.
const registry = new OpenAPIRegistry();

const json = (schema) => ({ 'application/json': { schema } });
const errorResponse = (description) => ({ description, content: json(errorBodySchema) });

registry.registerPath({
  method: 'get',
  path: '/api/health',
  tags: ['Health'],
  summary: 'Liveness probe',
  description: 'Bare body (no `data` envelope). `release` is the git SHA of the running image.',
  responses: {
    200: { description: 'The process is up.', content: json(healthResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/ready',
  tags: ['Health'],
  summary: 'Readiness probe',
  description:
    'Bare body (no `data` envelope). 200 when Postgres and Redis both answer within 1 s; otherwise 503 with the same shape.',
  responses: {
    200: { description: 'Ready.', content: json(readyResponseSchema) },
    503: {
      description: 'A dependency did not answer in time.',
      content: json(readyResponseSchema),
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/public-config',
  tags: ['Config'],
  summary: 'Public runtime config for the web app',
  description: 'No auth. Values are public by design; `null` when not configured.',
  responses: {
    200: { description: 'The config.', content: json(publicConfigResponseSchema) },
    500: errorResponse('Unexpected error.'),
  },
});

// ── Organisation & Staff ─────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/org',
  tags: ['Organization'],
  summary: 'Get organization details',
  responses: {
    200: { description: 'Organization details.', content: json(orgDetailResponseSchema) },
    401: errorResponse('Unauthenticated'),
    404: errorResponse('Not found'),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/org',
  tags: ['Organization'],
  summary: 'Update organization name (Landlord only)',
  request: {
    body: { content: json(updateOrgRequestSchema) },
  },
  responses: {
    200: { description: 'Updated organization details.', content: json(orgDetailResponseSchema) },
    400: errorResponse('Validation failed'),
    403: errorResponse('Forbidden'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/org/members',
  tags: ['Organization'],
  summary: 'List organization members with caretaker buildings (Landlord only)',
  responses: {
    200: { description: 'Member list.', content: json(orgMembersResponseSchema) },
    403: errorResponse('Forbidden'),
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/org/members/{membershipId}/buildings',
  tags: ['Organization'],
  summary: 'Update caretaker assigned buildings (Landlord only)',
  request: {
    body: { content: json(updateCaretakerBuildingsRequestSchema) },
  },
  responses: {
    200: { description: 'Assigned buildings updated.' },
    400: errorResponse('Validation failed'),
    403: errorResponse('Forbidden'),
    404: errorResponse('Member not found'),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/org/members/{membershipId}',
  tags: ['Organization'],
  summary: 'Remove caretaker membership (Landlord only)',
  responses: {
    200: { description: 'Caretaker removed.' },
    400: errorResponse('Cannot remove landlord or tenant'),
    403: errorResponse('Forbidden'),
    404: errorResponse('Member not found'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/org/invites',
  tags: ['Organization'],
  summary: 'Invite a caretaker (Landlord only)',
  request: {
    body: { content: json(inviteCaretakerRequestSchema) },
  },
  responses: {
    201: { description: 'Invitation created.' },
    400: errorResponse('Validation failed'),
    403: errorResponse('Forbidden'),
    409: errorResponse('Active invitation exists'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/org/invites',
  tags: ['Organization'],
  summary: 'List pending organization invites (Landlord only)',
  responses: {
    200: { description: 'Pending invites list.', content: json(orgInvitesResponseSchema) },
    403: errorResponse('Forbidden'),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/org/invites/{id}',
  tags: ['Organization'],
  summary: 'Revoke an invitation (Landlord only)',
  responses: {
    200: { description: 'Invitation revoked.' },
    403: errorResponse('Forbidden'),
    404: errorResponse('Invitation not found'),
  },
});

// ── Buildings & Units ────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/buildings',
  tags: ['Buildings'],
  summary: 'List buildings scoped by role',
  responses: {
    200: { description: 'Buildings list.', content: json(buildingsListResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/buildings',
  tags: ['Buildings'],
  summary: 'Create building (Landlord only)',
  request: {
    body: { content: json(createBuildingRequestSchema) },
  },
  responses: {
    201: { description: 'Building created.', content: json(buildingResponseSchema) },
    400: errorResponse('Validation failed'),
    403: errorResponse('Forbidden'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/buildings/{id}',
  tags: ['Buildings'],
  summary: 'Get building details',
  responses: {
    200: { description: 'Building details.', content: json(buildingResponseSchema) },
    404: errorResponse('Building not found'),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/buildings/{id}',
  tags: ['Buildings'],
  summary: 'Update building settings (Landlord only)',
  request: {
    body: { content: json(updateBuildingRequestSchema) },
  },
  responses: {
    200: { description: 'Building updated.', content: json(buildingResponseSchema) },
    400: errorResponse('Validation failed'),
    403: errorResponse('Forbidden'),
    404: errorResponse('Building not found'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/buildings/{id}/archive',
  tags: ['Buildings'],
  summary: 'Archive building (Landlord only)',
  responses: {
    200: { description: 'Building archived.' },
    403: errorResponse('Forbidden'),
    409: errorResponse('Active leases exist'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/buildings/{id}/units',
  tags: ['Units'],
  summary: 'List units for building (Landlord and assigned Caretakers)',
  responses: {
    200: { description: 'Units list.', content: json(unitsListResponseSchema) },
    403: errorResponse('Forbidden'),
    404: errorResponse('Building not found'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/buildings/{id}/units',
  tags: ['Units'],
  summary: 'Create unit in building (Landlord only)',
  request: {
    body: { content: json(createUnitRequestSchema) },
  },
  responses: {
    201: { description: 'Unit created.', content: json(unitResponseSchema) },
    400: errorResponse('Validation failed'),
    403: errorResponse('Forbidden'),
    409: errorResponse('Duplicate label'),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/units/{id}',
  tags: ['Units'],
  summary: 'Update unit (Landlord only)',
  request: {
    body: { content: json(updateUnitRequestSchema) },
  },
  responses: {
    200: { description: 'Unit updated.', content: json(unitResponseSchema) },
    400: errorResponse('Validation failed'),
    403: errorResponse('Forbidden'),
    404: errorResponse('Unit not found'),
    409: errorResponse('Duplicate label'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/units/{id}/archive',
  tags: ['Units'],
  summary: 'Archive unit (Landlord only)',
  responses: {
    200: { description: 'Unit archived.' },
    403: errorResponse('Forbidden'),
    409: errorResponse('Active lease exists'),
  },
});

const document = new OpenApiGeneratorV31(registry.definitions).generateDocument({
  openapi: '3.1.0',
  info: {
    title: 'BasaManager API',
    version: '0.1.0',
    description:
      'Generated from packages/shared by scripts/openapi.mjs. Do not edit by hand. Conventions: .agent/04-API.md.',
  },
  servers: [{ url: '/' }],
});

// Format with the repo's Prettier config so `prettier --check .` agrees with the generated file.
const prettierOptions = (await prettier.resolveConfig(outFile)) ?? {};
const output = await prettier.format(JSON.stringify(document), {
  ...prettierOptions,
  parser: 'json',
});
JSON.parse(output);

if (process.argv.includes('--check')) {
  const current = existsSync(outFile) ? readFileSync(outFile, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== output) {
    process.stderr.write('docs/reference/openapi.json is out of date: run `pnpm openapi`.\n');
    process.exit(1);
  }
  process.stdout.write('docs/reference/openapi.json is up to date.\n');
} else {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, output);
  process.stdout.write(`Wrote ${outFile}\n`);
}
