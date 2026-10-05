#!/usr/bin/env node
/**
 * Smoke load test (§11, Phase 9). It answers one question: does the responder page hold up
 * under a small burst, and what does it cost per request. It is not a benchmark and not a
 * capacity plan — the honest numbers come from the host the service actually runs on, and
 * this runs against whatever origin it is pointed at.
 *
 * The responder page is the one that matters: a stranger in a street on a bad connection,
 * and the only page in the product that must render in one request with no JavaScript.
 *
 *   pnpm load:test                                     # 10 s, 20 at a time, against :3200
 *   pnpm load:test --slug ABC… --duration 20 --concurrency 50
 *   pnpm load:test --origin https://noka.example      # against a deployment
 *
 * GET only, so the PIN limiter is not involved: this measures rendering and the database
 * lookup, not the attempt counter. It creates nothing and writes nothing.
 */
import { getSql } from '@/db/client';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const [key, value] = process.argv[i].replace(/^--/, '').split('=');
  args.set(key, value ?? process.argv[i + 1] ?? '');
}

const origin = (args.get('origin') ?? process.env.LOAD_TEST_ORIGIN ?? 'http://127.0.0.1:3200').replace(/\/$/, '');
const durationSeconds = Number(args.get('duration') ?? 10);
const concurrency = Number(args.get('concurrency') ?? 20);
/** How long a single request may take before it counts as a failure. */
const timeoutMs = Number(args.get('timeout') ?? 10_000);

async function pickSlug() {
  const explicit = args.get('slug');
  if (explicit) return explicit;
  if (!process.env.DATABASE_URL) return 'A'.repeat(26);
  const sql = getSql();
  const rows = await sql`select slug from cards where active order by created_at desc limit 1`;
  return rows[0]?.slug ?? 'A'.repeat(26);
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

async function measure(path, slug) {
  const target = `${origin}${path.replace('{slug}', slug)}`;
  const latencies = [];
  const statuses = new Map();
  let bytes = 0;
  let failures = 0;

  const deadline = Date.now() + durationSeconds * 1000;

  async function worker() {
    while (Date.now() < deadline) {
      const started = performance.now();
      try {
        const response = await fetch(target, {
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
          headers: { 'accept-language': 'en' },
        });
        const body = await response.arrayBuffer();
        bytes += body.byteLength;
        statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
      } catch {
        failures += 1;
      }
      latencies.push(performance.now() - started);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  latencies.sort((a, b) => a - b);
  const total = latencies.length;
  const slowest = latencies[total - 1] ?? 0;
  return {
    path: target,
    requests: total,
    rps: total / durationSeconds,
    failures,
    statuses: [...statuses.entries()].sort().map(([status, count]) => `${status}×${count}`).join(' ') || 'none',
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    slowest,
    kbPerRequest: total > 0 ? bytes / total / 1024 : 0,
  };
}

const slug = await pickSlug();
console.log(`load test — ${origin}, ${durationSeconds}s at ${concurrency} concurrent, slug ${slug.slice(0, 6)}…`);

const results = [];
for (const path of ['/c/{slug}', '/healthz', '/']) {
  results.push(await measure(path, slug));
}

console.log('');
for (const result of results) {
  console.log(
    [
      result.path.replace(origin, ''),
      `${result.rps.toFixed(1)} rps`,
      `p50 ${result.p50.toFixed(0)}ms`,
      `p95 ${result.p95.toFixed(0)}ms`,
      `p99 ${result.p99.toFixed(0)}ms`,
      `max ${result.slowest.toFixed(0)}ms`,
      `${result.kbPerRequest.toFixed(1)} kB`,
      result.statuses,
      result.failures > 0 ? `${result.failures} FAILED` : 'no failures',
    ].join('  '),
  );
}

const responder = results[0];
if (responder.failures > 0 || !responder.statuses.includes('200')) {
  console.error('\nThe responder page did not stay up under load.');
  process.exit(1);
}
