/**
 * Post-deploy smoke test. Plain Node (no test runner): `node tests/smoke.ts <baseUrl>`.
 *   SMOKE_EXPECT_SHA   the commit that must be running (checked against /api/health "release")
 *   SMOKE_EXPECT_ENV   expected appEnv from /api/public-config (staging | prod)
 *   SMOKE_DOCS_URL     optional: also check the docs site answers 200
 *   SMOKE_FORCE_FAIL=1 deliberately fail (used once to prove the automatic rollback)
 *   SMOKE_ATTEMPTS     how many times to retry the whole check (default 12, 5 s apart: DNS/TLS/containers may still be settling)
 * When auth exists (V5) add: log in as the smoke user and read one resource.
 */
const base = (process.argv[2] ?? '').replace(/\/$/, '');
if (!base) {
  console.error('usage: node tests/smoke.ts <baseUrl>');
  process.exit(2);
}
const expectSha = process.env['SMOKE_EXPECT_SHA'] ?? '';
const expectEnv = process.env['SMOKE_EXPECT_ENV'] ?? '';
const docsUrl = process.env['SMOKE_DOCS_URL'] ?? '';
const forceFail = process.env['SMOKE_FORCE_FAIL'] === '1';
const attempts = Number(process.env['SMOKE_ATTEMPTS'] ?? 12);

async function get(path: string, url = base): Promise<Response> {
  return fetch(`${url}${path}`, { signal: AbortSignal.timeout(10_000), redirect: 'manual' });
}

async function check(name: string, fn: () => Promise<void>): Promise<string | null> {
  try {
    await fn();
    console.log(`  ok   ${name}`);
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  FAIL ${name}: ${msg}`);
    return `${name}: ${msg}`;
  }
}

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

async function runOnce(): Promise<string[]> {
  const failures: (string | null)[] = [];
  failures.push(
    await check('GET /api/health returns the deployed SHA', async () => {
      const res = await get('/api/health');
      assert(res.status === 200, `status ${res.status}`);
      const body = (await res.json()) as { status?: string; release?: string };
      assert(body.status === 'ok', `status field is ${String(body.status)}`);
      if (forceFail) assert(false, 'SMOKE_FORCE_FAIL=1 (deliberate failure to prove rollback)');
      if (expectSha) assert(body.release === expectSha, `release ${String(body.release)} != expected ${expectSha}`);
    }),
  );
  failures.push(
    await check('GET /api/ready is 200 (database + redis)', async () => {
      const res = await get('/api/ready');
      assert(res.status === 200, `status ${res.status}`);
    }),
  );
  failures.push(
    await check('GET /api/public-config has appEnv', async () => {
      const res = await get('/api/public-config');
      assert(res.status === 200, `status ${res.status}`);
      const body = (await res.json()) as { data?: { appEnv?: string } };
      assert(Boolean(body.data?.appEnv), 'appEnv missing');
      if (expectEnv) assert(body.data?.appEnv === expectEnv, `appEnv ${String(body.data?.appEnv)} != ${expectEnv}`);
    }),
  );
  failures.push(
    await check('GET / serves the web build', async () => {
      const res = await get('/');
      assert(res.status === 200, `status ${res.status}`);
      const html = await res.text();
      assert(html.includes('id="root"'), 'no #root in the page');
    }),
  );
  if (docsUrl) {
    failures.push(
      await check('docs site answers 200', async () => {
        const res = await get('/', docsUrl.replace(/\/$/, ''));
        assert(res.status === 200, `status ${res.status}`);
      }),
    );
  }
  return failures.filter((f): f is string => f !== null);
}

console.log(`smoke: ${base}${expectSha ? ` expecting ${expectSha.slice(0, 8)}` : ''}`);
let failed: string[] = [];
for (let i = 1; i <= attempts; i += 1) {
  console.log(`attempt ${i}/${attempts}`);
  failed = await runOnce();
  if (failed.length === 0) {
    console.log('SMOKE PASSED');
    process.exit(0);
  }
  if (forceFail) break;
  if (i < attempts) await new Promise((r) => setTimeout(r, 5_000));
}
console.error(`SMOKE FAILED (${failed.length} check(s)):\n- ${failed.join('\n- ')}`);
process.exit(1);
