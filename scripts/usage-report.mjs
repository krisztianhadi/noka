#!/usr/bin/env node
/**
 * What this build cost, from two independent sources.
 *
 *   node scripts/usage-report.mjs                    # print tokens, split by peak/off-peak, estimated USD
 *   node scripts/usage-report.mjs --write            # refresh the blocks in docs/COSTS.md
 *   node scripts/usage-report.mjs --balance [note]   # record the provider balance now (actual USD ledger)
 *
 * Tokens come from the harness session logs (exact). Prices come from the
 * provider's published rates, split by the peak window below (an estimate).
 * The balance ledger is the only true money: it is what the provider actually
 * deducted between two runs.
 *
 * Rates: https://api-docs.deepseek.com/quick_start/pricing — deepseek-flash,
 * peak = 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday, excluding Chinese
 * public holidays. Everything else (and weekends entirely) is off-peak, at half
 * the peak rate.
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { zstdDecompressSync } from 'node:zlib';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh');
const COSTS_FILE = resolve('docs/COSTS.md');
const LEDGER_FILE = resolve('docs/costs/ledger.json');
const USAGE_START = '<!-- usage:start -->';
const USAGE_END = '<!-- usage:end -->';
const LEDGER_START = '<!-- ledger:start -->';
const LEDGER_END = '<!-- ledger:end -->';

/** Per 1M tokens, peak; off-peak is exactly half. */
const RATES = {
  cacheHit: { peak: 0.006, offPeak: 0.003 },
  cacheMiss: { peak: 0.3, offPeak: 0.15 },
  output: { peak: 1.2, offPeak: 0.6 },
};

const workspace = process.cwd();
const storeDir = join(DSH_HOME, 'sessions', `--${workspace.replace(/^\/+/, '').replace(/\//g, '-')}--`);

/** Peak: Mon–Fri, 01:00–04:00 and 06:00–10:00 UTC. Holidays are not modelled. */
function isPeak(timeMs) {
  const date = new Date(timeMs);
  const day = date.getUTCDay(); // 0 Sunday … 6 Saturday
  if (day === 0 || day === 6) return false;
  const hour = date.getUTCHours();
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

function readLog(file) {
  try {
    return execFileSync('zstdcat', [file], { maxBuffer: 1024 * 1024 * 1024 }).toString('utf8');
  } catch {
    try {
      return zstdDecompressSync(readFileSync(file)).toString('utf8');
    } catch {
      return '';
    }
  }
}

function usageOf(file) {
  const text = readLog(file);
  if (!text) return [];
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"')) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const usage = record?.data?.usage;
    if (!usage || typeof usage !== 'object') continue;
    rows.push({
      time: Number(record.time ?? 0),
      cacheMiss: Number(usage.inputTokens ?? 0),
      output: Number(usage.outputTokens ?? 0),
      cacheHit: Number(usage.cacheReadTokens ?? 0),
      cacheWrite: Number(usage.cacheWriteTokens ?? 0),
    });
  }
  return rows;
}

function costOf(rows) {
  let peakUsd = 0;
  let offPeakUsd = 0;
  const buckets = { peak: { cacheMiss: 0, cacheHit: 0, output: 0 }, offPeak: { cacheMiss: 0, cacheHit: 0, output: 0 } };

  for (const row of rows) {
    const bucket = isPeak(row.time) ? 'peak' : 'offPeak';
    for (const key of ['cacheMiss', 'cacheHit', 'output']) {
      buckets[bucket][key] += row[key];
      const rate = RATES[key === 'cacheMiss' ? 'cacheMiss' : key][bucket];
      const usd = (row[key] / 1_000_000) * rate;
      if (bucket === 'peak') peakUsd += usd;
      else offPeakUsd += usd;
    }
  }
  return { usd: peakUsd + offPeakUsd, peakUsd, offPeakUsd, buckets };
}

function sessions() {
  if (!existsSync(storeDir)) return [];
  return readdirSync(storeDir)
    .map((name) => ({
      file: join(storeDir, name, 'session.v4.jsonl.zstd'),
      id: name.replace(/^session-/, '').slice(0, 8),
    }))
    .filter((entry) => existsSync(entry.file))
    .map((entry) => ({ ...entry, rows: usageOf(entry.file) }))
    .filter((entry) => entry.rows.length > 0)
    .map((entry) => {
      const times = entry.rows.map((row) => row.time);
      const first = Math.min(...times);
      const last = Math.max(...times);
      const sum = (key) => entry.rows.reduce((acc, row) => acc + row[key], 0);
      const cost = costOf(entry.rows);
      return {
        id: entry.id,
        turns: entry.rows.length,
        first,
        last,
        cacheMiss: sum('cacheMiss'),
        cacheHit: sum('cacheHit'),
        cacheWrite: sum('cacheWrite'),
        output: sum('output'),
        total: sum('cacheMiss') + sum('cacheHit') + sum('cacheWrite') + sum('output'),
        ...cost,
      };
    })
    .sort((a, b) => a.first - b.first);
}

const fmt = (value) => value.toLocaleString('en-US');
const usd = (value) => `$${value.toFixed(4)}`;
const utc = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + 'Z';
const local = (ms) => new Date(ms + 7 * 3_600_000).toISOString().replace('T', ' ').slice(0, 16) + '+07';

function balance() {
  let key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    try {
      const credentials = readFileSync(join(DSH_HOME, '.credentials.yaml'), 'utf8');
      key = /DEEPSEEK_API_KEY:\s*["']?([^"'\s]+)/.exec(credentials)?.[1];
    } catch {
      /* fall through to the error below */
    }
  }
  if (!key) throw new Error('No DEEPSEEK_API_KEY in the environment or ~/.dsh/.credentials.yaml');
  return fetch('https://api.deepseek.com/user/balance', { headers: { Authorization: `Bearer ${key}` } })
    .then((response) => response.json())
    .then((body) => {
      const info = body?.balance_infos?.[0];
      if (!info) throw new Error(`Unexpected balance response: ${JSON.stringify(body).slice(0, 120)}`);
      return { currency: info.currency, total: Number(info.total_balance), toppedUp: Number(info.topped_up_balance) };
    });
}

function readLedger() {
  if (!existsSync(LEDGER_FILE)) return [];
  try {
    const parsed = JSON.parse(readFileSync(LEDGER_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function usageTable(list) {
  const lines = [
    '| Session (UTC) | Local (+07) | Turns | Cache-miss in | Cache-hit in | Output | Peak | Off-peak | Est. USD |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  let totals = { turns: 0, cacheMiss: 0, cacheHit: 0, output: 0, peakUsd: 0, offPeakUsd: 0, usd: 0 };
  for (const entry of list) {
    lines.push(
      `| ${utc(entry.first)} → ${utc(entry.last).slice(11)} (${entry.id}) | ${local(entry.first)} | ${entry.turns} | ${fmt(entry.cacheMiss)} | ${fmt(entry.cacheHit)} | ${fmt(entry.output)} | ${usd(entry.peakUsd)} | ${usd(entry.offPeakUsd)} | ${usd(entry.usd)} |`,
    );
    for (const key of Object.keys(totals)) {
      if (key in entry) totals[key] += entry[key];
    }
  }
  lines.push(
    `| **Total** | | **${fmt(totals.turns)}** | **${fmt(totals.cacheMiss)}** | **${fmt(totals.cacheHit)}** | **${fmt(totals.output)}** | **${usd(totals.peakUsd)}** | **${usd(totals.offPeakUsd)}** | **${usd(totals.usd)}** |`,
  );
  return { table: lines.join('\n'), totals };
}

function ledgerTable(rows) {
  const lines = ['| Recorded (UTC) | Balance | Change | Note |', '|---|---:|---:|---|'];
  let previous = null;
  for (const row of rows) {
    const change = previous === null ? '—' : `−$${(previous - row.total).toFixed(4)}`;
    lines.push(`| ${utc(row.at)} | $${row.total.toFixed(2)} | ${change} | ${row.note ?? ''} |`);
    previous = row.total;
  }
  const spent = rows.length > 1 ? rows[0].total - rows[rows.length - 1].total : null;
  return {
    table: lines.join('\n'),
    spent,
    span: rows.length > 1 ? `${utc(rows[0].at)} → ${utc(rows[rows.length - 1].at)}` : null,
  };
}

function replaceBlock(text, start, end, body) {
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!pattern.test(text)) throw new Error(`Missing ${start} … ${end} markers in docs/COSTS.md`);
  return text.replace(pattern, `${start}\n${body}\n${end}`);
}

const list = sessions();
const { table, totals } = usageTable(list);
const ledger = readLedger();
const ledgerView = ledgerTable(ledger);

if (process.argv.includes('--balance')) {
  const note = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
  const current = await balance();
  const rows = [...ledger, { at: Date.now(), total: current.total, currency: current.currency, note }];
  mkdirSync(dirname(LEDGER_FILE), { recursive: true });
  writeFileSync(LEDGER_FILE, JSON.stringify(rows, null, 2) + '\n');
  console.log(`Recorded balance: ${current.currency} ${current.total.toFixed(2)} → ${LEDGER_FILE}`);
  const updated = ledgerTable(rows);
  if (updated.spent !== null) {
    console.log(`Spent across ${updated.span}: $${updated.spent.toFixed(2)} (provider-calculated)`);
  }
}

if (process.argv.includes('--write')) {
  let text = readFileSync(COSTS_FILE, 'utf8');
  const usageBody = [
    table,
    '',
    `_Estimated from the published deepseek-flash rates, peak and off-peak; generated ${new Date().toISOString().slice(0, 10)} by \`node scripts/usage-report.mjs --write\`._`,
  ].join('\n');
  const ledgerBody = [
    ledgerView.table,
    ledgerView.spent !== null
      ? `\n**Actually spent across ${ledgerView.span}: $${ledgerView.spent.toFixed(2)}** — this is the provider's own arithmetic.`
      : '\n_Only one balance recorded so far, so there is nothing to subtract yet. Run `--balance` again after the next block of work._',
  ].join('\n');
  text = replaceBlock(text, USAGE_START, USAGE_END, usageBody);
  text = replaceBlock(text, LEDGER_START, LEDGER_END, ledgerBody);
  writeFileSync(COSTS_FILE, text);
  console.log(`Updated ${COSTS_FILE}`);
} else if (!process.argv.includes('--balance')) {
  console.log(`workspace: ${workspace}`);
  console.log(`sessions: ${list.length}\n`);
  console.log(table);
  console.log(`\nEstimated total: ${usd(totals.usd)}`);
  if (ledgerView.spent !== null) console.log(`Actually spent (balance ledger): $${ledgerView.spent.toFixed(2)}`);
}
