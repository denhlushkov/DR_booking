#!/usr/bin/env node
/**
 * Навантажувальний тест інтегрованої системи (NFR-01, FR-04).
 *
 *   npm run stack:up && npm run test:load
 *
 * Сценарій 1 (NFR-01): 50 одночасних з'єднань протягом 20 с виконують запит перевірки доступності
 *   GET /api/v1/resources?from&to (пошук вільних місць). Вимога: час відповіді ≤ 300 мс.
 * Сценарій 2 (FR-04): 50 одночасних запитів на бронювання ОДНОГО слота — успішним має бути рівно один.
 *
 * Запити йдуть через Nginx (HTTPS), як від реального браузера. Результати зберігаються в docs/results/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import autocannon from 'autocannon';

const BASE_URL = process.env.BASE_URL ?? 'https://localhost:8443';
const CONNECTIONS = Number(process.env.CONNECTIONS ?? 50);
const DURATION_S = Number(process.env.DURATION ?? 20);
const LIMIT_MS = 300;
const RESULTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/results');

// Локальний стенд має самопідписаний сертифікат.
const insecureAgentOptions = { rejectUnauthorized: false };
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function call(method, path, { token, body } = {}) {
  return new Promise((resolvePromise, reject) => {
    const url = new URL(`/api/v1${path}`, BASE_URL);
    const payload = body ? JSON.stringify(body) : undefined;
    const req = httpsRequest(
      url,
      {
        method,
        ...insecureAgentOptions,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolvePromise({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login(email, password) {
  const res = await call('POST', '/auth/login', { body: { email, password } });
  if (res.status !== 200) throw new Error(`Вхід ${email} не вдався: ${res.status}`);
  return res.body.token;
}

function runAutocannon(options) {
  return new Promise((resolvePromise, reject) => {
    const instance = autocannon(options, (err, result) => (err ? reject(err) : resolvePromise(result)));
    autocannon.track(instance, { renderProgressBar: false, renderResultsTable: false, renderLatencyTable: false });
  });
}

function save(name, data) {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(resolve(RESULTS_DIR, `${name}.json`), `${JSON.stringify({ measuredAt: new Date().toISOString(), ...data }, null, 2)}\n`);
}

async function scenarioAvailability(token) {
  const from = new Date(Date.now() + 2 * 86_400_000);
  from.setUTCHours(8, 0, 0, 0);
  const to = new Date(from.getTime() + 60 * 60_000);
  const path = `/api/v1/resources?from=${from.toISOString()}&to=${to.toISOString()}`;

  console.log(`\n[NFR-01] ${CONNECTIONS} з'єднань × ${DURATION_S} с: GET ${path}`);
  const result = await runAutocannon({
    url: new URL(path, BASE_URL).toString(),
    connections: CONNECTIONS,
    duration: DURATION_S,
    headers: { authorization: `Bearer ${token}` },
  });

  const latency = result.latency;
  const summary = {
    scenario: 'GET /api/v1/resources?from&to (перевірка доступності)',
    connections: CONNECTIONS,
    durationSeconds: DURATION_S,
    requests: result.requests.total,
    requestsPerSecond: Math.round(result.requests.average),
    latencyMs: {
      avg: latency.average,
      p50: latency.p50,
      p90: latency.p90,
      p97_5: latency.p97_5,
      p99: latency.p99,
      max: latency.max,
    },
    errors: result.errors,
    timeouts: result.timeouts,
    non2xx: result.non2xx,
    limitMs: LIMIT_MS,
    passed: latency.p99 <= LIMIT_MS && result.errors === 0 && result.non2xx === 0,
  };
  console.table(summary.latencyMs);
  console.log(`  запитів: ${summary.requests} (${summary.requestsPerSecond}/с), помилок: ${summary.errors}, non-2xx: ${summary.non2xx}`);
  console.log(`  p99 = ${latency.p99} мс ${summary.passed ? '≤' : '>'} ${LIMIT_MS} мс → ${summary.passed ? 'PASS' : 'FAIL'}`);
  save('nfr-01-load-test', summary);
  return summary.passed;
}

async function scenarioConcurrentBooking(adminToken, employeeToken) {
  const resource = await call('POST', '/resources', {
    token: adminToken,
    body: { name: `Load-test стіл ${Date.now()}`, type: 'DESK', floor: 9 },
  });
  const start = new Date(Date.now() + 3 * 86_400_000);
  start.setUTCHours(9, 0, 0, 0);
  const slot = {
    resourceId: resource.body.id,
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 60 * 60_000).toISOString(),
  };

  console.log(`\n[FR-04] ${CONNECTIONS} одночасних POST /bookings на один слот`);
  const started = performance.now();
  const responses = await Promise.all(
    Array.from({ length: CONNECTIONS }, () => call('POST', '/bookings', { token: employeeToken, body: slot })),
  );
  const elapsedMs = Math.round(performance.now() - started);
  const byStatus = responses.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  const passed = byStatus[201] === 1 && byStatus[409] === CONNECTIONS - 1;

  console.log(`  відповіді: ${JSON.stringify(byStatus)} за ${elapsedMs} мс → ${passed ? 'PASS' : 'FAIL'}`);
  save('fr-04-concurrent-booking', {
    scenario: `${CONNECTIONS} одночасних запитів на бронювання одного слота`,
    responsesByStatus: byStatus,
    elapsedMs,
    expected: { 201: 1, 409: CONNECTIONS - 1 },
    passed,
  });
  return passed;
}

const health = await call('GET', '/health');
if (health.status !== 200) {
  console.error(`Стенд недоступний (${BASE_URL}): ${health.status}. Запустіть: npm run stack:up`);
  process.exit(1);
}
const adminToken = await login('admin@company.com', 'Admin12345');
const employeeToken = await login('employee@company.com', 'Employee12345');

const ok1 = await scenarioAvailability(employeeToken);
const ok2 = await scenarioConcurrentBooking(adminToken, employeeToken);
process.exit(ok1 && ok2 ? 0 : 1);
