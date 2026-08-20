// The actual "run the scraper(s) and self-heal if needed" logic, pulled out
// of server.js so it can be called two ways: from the Express API (a human
// clicking "Run Scraper Now"), and from scripts/run-and-heal.mjs (an
// unattended GitHub Actions run on a schedule). Same code path either way —
// scheduled runs aren't a separate, less-tested mechanism bolted on later.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as store from './store.js';
import * as brightdata from './brightdata.js';
import { assessHealth, autoHeal } from './healthMonitor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORES_CONFIG_PATH = path.join(__dirname, '..', '..', 'scraper', 'products.json');

/** Load the multi-store scraper config (one collector per store — see scraper/products.json). */
export async function loadStoresConfig() {
  const raw = await readFile(STORES_CONFIG_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  return parsed.stores || [];
}

/**
 * Live mode: run every configured store's collector in turn (each store has
 * its own collector — see scraper/products.json), health-check each
 * independently, and heal the specific store's collector if it's the one
 * that broke. Overall health is healthy only if every store is healthy;
 * brokenFields is the union across any unhealthy stores.
 * @param {boolean} autoApproveHeals
 */
export async function runLiveAllStores(autoApproveHeals) {
  const stores = await loadStoresConfig();
  const configuredStores = stores.filter((s) => s.collector_id);
  if (configuredStores.length === 0) {
    throw new Error('No store in scraper/products.json has a collector_id set yet — see scraper/SETUP.md.');
  }

  const storeResults = [];
  let anyHealEvent = null;
  const overallBrokenFields = new Set();
  let overallHealthy = true;

  for (const s of configuredStores) {
    const urls = s.urls.map((u) => u.url);
    let rows;
    try {
      rows = await brightdata.runCollector(s.collector_id, urls, s.name);
    } catch (err) {
      storeResults.push({ store: s.name, error: err.message });
      overallHealthy = false;
      continue;
    }

    const assessment = assessHealth(rows, urls.length);

    if (!assessment.healthy) {
      overallHealthy = false;
      assessment.brokenFields.forEach((f) => overallBrokenFields.add(f));

      const healEvent = await autoHeal(assessment, s.collector_id, autoApproveHeals);
      await store.addHealEvent({ ...healEvent, prompt: `[${s.name}] ${healEvent.prompt}` });
      anyHealEvent = healEvent;

      if (healEvent.status === 'done') {
        const healedRows = await brightdata.runCollector(s.collector_id, urls, s.name);
        await store.applyRun(healedRows, s.name);
      } else {
        await store.applyRun(rows, s.name); // still record whatever data did come back
      }
    } else {
      await store.applyRun(rows, s.name);
    }

    storeResults.push({ store: s.name, healthy: assessment.healthy, received: assessment.receivedCount, expected: assessment.expectedCount });
  }

  await store.setCollectorHealth({
    healthy: overallHealthy,
    brokenFields: Array.from(overallBrokenFields),
    lastCheckedAt: new Date().toISOString()
  });

  return { storeResults, healEvent: anyHealEvent };
}

export async function runDemo() {
  const products = await store.getProducts();
  const rows = await simulateRun(products);
  const assessment = assessHealth(rows, products.length);

  await store.setCollectorHealth({
    healthy: assessment.healthy,
    brokenFields: assessment.brokenFields,
    lastCheckedAt: new Date().toISOString()
  });

  let healEvent = null;
  if (!assessment.healthy) {
    healEvent = await simulateHeal(assessment);
    await store.addHealEvent(healEvent);

    if (healEvent.status === 'done') {
      const healedRows = await simulateRun(products, true);
      await store.applyRun(healedRows);
      await store.setCollectorHealth({ healthy: true, brokenFields: [], lastCheckedAt: new Date().toISOString() });
    }
  } else {
    await store.applyRun(rows);
  }

  return { assessment, healEvent };
}

async function simulateRun(products, forceHealed = false) {
  return products.map((p) => {
    const broken = !forceHealed && p.simulatedBreak;
    const drift = (Math.random() - 0.5) * 0.03;
    const nextPrice = broken ? null : Math.round(p.price * (1 + drift) * 100) / 100;
    return {
      url: p.url,
      name: broken ? null : p.name,
      price: nextPrice,
      currency: p.currency,
      in_stock: broken ? null : Math.random() > 0.05
    };
  });
}

async function simulateHeal(assessment) {
  const field = assessment.brokenFields[0];
  const sampleUrl = assessment.brokenRows[0]?.url;
  const startedAt = new Date().toISOString();
  await new Promise((r) => setTimeout(r, 600)); // feel like real AI-flow latency
  const state = await store.getState();
  for (const p of state.products) {
    if (p.simulatedBreak) await store.clearSimulatedBreak(p.id);
  }
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    prompt: `The "${field}" field is returning null or empty. The selector for this field likely moved after a layout change — re-identify it from the current page and capture the value again, keeping the same field name and type.`,
    verifyUrl: sampleUrl,
    status: 'done',
    viewUrl: 'https://brightdata.com/cp/scrapers/c_demo_webguard',
    diffSummary: `proposed template has 1 step(s) — selector for ${field} rebuilt against the current DOM`,
    error: null
  };
}
