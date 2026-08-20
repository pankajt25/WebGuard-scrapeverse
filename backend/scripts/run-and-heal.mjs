#!/usr/bin/env node
// Standalone entry point for unattended runs — GitHub Actions calls this
// directly (see .github/workflows/self-heal.yml) instead of hitting the
// Express API, so a scheduled run doesn't need a server process at all.
// Uses the exact same runLiveAllStores() from lib/runner.js that the "Run
// Scraper Now" button in the dashboard calls — a cron run and a manual
// click go through identical logic, not a separate, less-tested path.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runLiveAllStores } from '../lib/runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env for local runs; in CI, GitHub Actions injects env vars directly
// via `env:` in the workflow, so a missing .env file here is normal and fine.
try {
  const envText = await readFile(path.join(__dirname, '..', '.env'), 'utf-8');
  for (const line of envText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {
  // no .env — fine in CI
}

const AUTO_APPROVE_HEALS = process.env.AUTO_APPROVE_HEALS === 'true';

const startedAt = new Date().toISOString();
console.log(`[run-and-heal] starting at ${startedAt}`);

try {
  const result = await runLiveAllStores(AUTO_APPROVE_HEALS);

  console.log(`[run-and-heal] store results:`);
  let anyStoreErrored = false;
  for (const r of result.storeResults) {
    if (r.error) {
      console.log(`  ✗ ${r.store}: ERROR — ${r.error}`);
      anyStoreErrored = true;
    } else {
      console.log(`  ${r.healthy ? '✓' : '⚠'} ${r.store}: ${r.received}/${r.expected} rows${r.healthy ? '' : ' — unhealthy'}`);
    }
  }

  if (result.healEvent) {
    console.log(`[run-and-heal] self-heal triggered: status=${result.healEvent.status}`);
    console.log(`  prompt: ${result.healEvent.prompt}`);
  } else if (!anyStoreErrored) {
    console.log('[run-and-heal] no self-heal needed this run — all configured stores healthy.');
  }

  console.log(`[run-and-heal] finished at ${new Date().toISOString()}`);

  // Exit non-zero if any store genuinely failed to scrape, so a failed run
  // shows up as a red X in the Actions tab instead of a misleading green
  // checkmark — a heal attempt (even one still awaiting approval) is a
  // handled, expected outcome and still exits 0; an unrecoverable per-store
  // error is not.
  process.exit(anyStoreErrored ? 1 : 0);
} catch (err) {
  console.error(`[run-and-heal] FAILED: ${err.message}`);
  process.exit(1);
}
