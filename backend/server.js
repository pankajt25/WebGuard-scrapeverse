import 'node:process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';

import * as store from './lib/store.js';
import * as brightdata from './lib/brightdata.js';
import { assessHealth, autoHeal } from './lib/healthMonitor.js';

// Load .env without an extra dependency
const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  const envText = await readFile(path.join(__dirname, '.env'), 'utf-8');
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
  // No .env file — fine, demo mode uses defaults below.
}

const DEMO_MODE = process.env.DEMO_MODE !== 'false';
const AUTO_APPROVE_HEALS = process.env.AUTO_APPROVE_HEALS === 'true';
const PORT = process.env.PORT || 4000;
const STORES_CONFIG_PATH = path.join(__dirname, '..', 'scraper', 'products.json');

/** Load the multi-store scraper config (one collector per store — see scraper/products.json). */
async function loadStoresConfig() {
  const raw = await readFile(STORES_CONFIG_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  return parsed.stores || [];
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Consolidated single-file dashboard — serves alongside the API on the same
// port, so `npm start` in backend/ alone is enough to see it, no separate
// frontend process needed. The React app in ../frontend is still the
// primary, richer dashboard; this is a lighter alternative reachable at the
// same origin as the API.

// ---- status -----------------------------------------------------------

app.get('/api/status', async (req, res) => {
  const state = await store.getState();
  let storeCount = 0;
  try {
    storeCount = (await loadStoresConfig()).filter((s) => s.collector_id).length;
  } catch {
    // stores config missing/invalid — fine, just report 0
  }
  res.json({
    mode: DEMO_MODE ? 'demo' : 'live',
    collectorConfigured: brightdata.isConfigured(),
    storeCount,
    lastRunAt: state.lastRunAt,
    collectorHealth: state.collectorHealth,
    productCount: state.products.length
  });
});

// ---- products -----------------------------------------------------------

app.get('/api/products', async (req, res) => {
  const products = await store.getProducts();
  res.json(
    products.map((p) => ({
      ...p,
      history: undefined, // list view gets a trimmed sparkline instead of full history
      sparkline: p.history.slice(-12).map((h) => h.price),
      trend: computeTrend(p.history)
    }))
  );
});

app.get('/api/products/:id', async (req, res) => {
  const product = await store.getProduct(req.params.id);
  if (!product) return res.status(404).json({ error: 'not found' });
  res.json({ ...product, trend: computeTrend(product.history) });
});

function computeTrend(history) {
  if (!history || history.length < 2) return 0;
  const first = history[0].price;
  const last = history[history.length - 1].price;
  if (!first) return 0;
  return Math.round(((last - first) / first) * 1000) / 10; // % change, 1 decimal
}

// ---- heal events -----------------------------------------------------------

app.get('/api/heal-events', async (req, res) => {
  res.json(await store.getHealEvents());
});

// ---- run the collector(s) -----------------------------------------------------------

app.post('/api/run', async (req, res) => {
  try {
    const result = DEMO_MODE ? await runDemo() : await runLiveAllStores();
    const state = await store.getState();
    res.json({
      ...result,
      collectorHealth: state.collectorHealth,
      lastRunAt: state.lastRunAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Live mode: run every configured store's collector in turn (each store has
 * its own collector — see scraper/products.json), health-check each
 * independently, and heal the specific store's collector if it's the one
 * that broke. Overall health shown on the dashboard is healthy only if
 * every store is healthy; brokenFields is the union across any unhealthy
 * stores.
 */
async function runLiveAllStores() {
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

      const healEvent = await autoHeal(assessment, s.collector_id, AUTO_APPROVE_HEALS);
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

async function runDemo() {
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

// ---- demo-only controls -----------------------------------------------------------

app.post('/api/simulate-break/:id', async (req, res) => {
  if (!DEMO_MODE) return res.status(400).json({ error: 'Only available in demo mode' });
  const product = await store.simulateBreak(req.params.id);
  if (!product) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true, product: product.name });
});

// ---- demo-mode simulation helpers -----------------------------------------------------------

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
  // clear the simulated break on every product that reported it, as if the fix landed
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

app.listen(PORT, () => {
  console.log(`WebGuard API listening on http://localhost:${PORT} (${DEMO_MODE ? 'demo' : 'live'} mode)`);
});
