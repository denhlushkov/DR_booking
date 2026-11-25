#!/usr/bin/env node
/**
 * Перевірка надійності інтегрованої системи (NFR-03) на запущеному стенді docker compose:
 *  1) аварійне завершення процесу API → Docker автоматично перезапускає контейнер;
 *  2) недоступність PostgreSQL → API лишається живим і відповідає 503, після повернення БД — 200.
 *
 *   npm run stack:up && npm run test:resilience
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.BASE_URL ?? 'https://localhost:8443';
const RESULTS = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/results/nfr-03-resilience.json');

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const restarts = () => Number(sh('docker inspect -f "{{.RestartCount}}" dr-booking-server-1'));

function health() {
  return new Promise((resolvePromise) => {
    const req = request(`${BASE_URL}/api/v1/health`, { rejectUnauthorized: false, timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolvePromise({ status: res.statusCode, body: safeJson(body) }));
    });
    req.on('error', () => resolvePromise({ status: 0, body: null }));
    req.on('timeout', () => req.destroy());
    req.end();
  });
}

const safeJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 80);
  }
};

async function waitFor(predicate, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return Date.now() - started;
    await sleep(200);
  }
  throw new Error('Тайм-аут очікування');
}

const results = {};

// 1. Аварійне завершення процесу API.
const before = restarts();
// Аварія процесу Node всередині контейнера (як OOM-kill); docker kill вважався б ручною зупинкою.
try {
  sh('docker compose exec -T server sh -c "kill -9 $(pidof node)"');
} catch {
  // exec завершується з помилкою, бо контейнер зупиняється разом із процесом — це очікувано.
}
const recoveryMs = await waitFor(async () => restarts() > before && (await health()).status === 200);
results.apiCrash = {
  action: 'SIGKILL процесу Node у контейнері API',
  restartsBefore: before,
  restartsAfter: restarts(),
  recoveredInMs: recoveryMs,
  passed: true,
};
console.log(`1) API перезапущено автоматично за ${recoveryMs} мс (restarts ${before} → ${restarts()})`);

// 2. Недоступність БД.
const restartsBeforeDb = restarts();
sh('docker compose stop db');
const duringOutage = await health();
await sleep(5000);
const stillAlive = await health();
sh('docker compose start db');
const dbRecoveryMs = await waitFor(async () => (await health()).status === 200);
const restartsAfterDb = restarts();
results.databaseOutage = {
  action: 'docker compose stop db на ~5 с',
  healthDuringOutage: duringOutage,
  healthAfter5s: stillAlive.status,
  recoveredAfterDbStartInMs: dbRecoveryMs,
  apiRestartsDuringOutage: restartsAfterDb - restartsBeforeDb,
  passed: duringOutage.status === 503 && stillAlive.status === 503 && restartsAfterDb === restartsBeforeDb,
};
console.log(`2) БД недоступна → health ${duringOutage.status} ${JSON.stringify(duringOutage.body)}`);
console.log(`   API не перезапускався (${restartsAfterDb - restartsBeforeDb} перезапусків), відновлення після старту БД: ${dbRecoveryMs} мс`);

mkdirSync(dirname(RESULTS), { recursive: true });
writeFileSync(RESULTS, `${JSON.stringify({ measuredAt: new Date().toISOString(), ...results }, null, 2)}\n`);
const passed = results.apiCrash.passed && results.databaseOutage.passed;
console.log(passed ? 'PASS' : 'FAIL');
process.exit(passed ? 0 : 1);
