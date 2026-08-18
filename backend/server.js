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

const app = express();
app.use(cors());
app.use(express.json());

// ---- status -----------------------------------------------------------

app.get('/api/status', async (req, res) => {
  const state = await store.getState();
  res.json({
    mode: DEMO_MODE ? 'demo' : 'live',
    collectorConfigured: brightdata.isConfigured(),
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

// ---- run the collector -----------------------------------------------------------

app.post('/api/run', async (req, res) => {
  try {
    const products = await store.getProducts();
    const urls = products.map((p) => p.url);

    const rows = DEMO_MODE ? await simulateRun(products) : await brightdata.runCollector(urls);

    const assessment = assessHealth(rows, urls.length);
    await store.setCollectorHealth({
      healthy: assessment.healthy,
      brokenFields: assessment.brokenFields,
      lastCheckedAt: new Date().toISOString()
    });

    let healEvent = null;
    if (!assessment.healthy) {
      if (DEMO_MODE) {
        healEvent = await simulateHeal(assessment);
      } else {
        healEvent = await autoHeal(assessment, AUTO_APPROVE_HEALS);
      }
      await store.addHealEvent(healEvent);

      if (healEvent.status === 'done') {
        // fix committed — re-run to pick up corrected data
        const healedRows = DEMO_MODE ? await simulateRun(products, true) : await brightdata.runCollector(urls);
        await store.applyRun(healedRows);
        await store.setCollectorHealth({ healthy: true, brokenFields: [], lastCheckedAt: new Date().toISOString() });
      }
    } else {
      await store.applyRun(rows);
    }

    const state = await store.getState();
    res.json({
      assessment,
      healEvent,
      collectorHealth: state.collectorHealth,
      lastRunAt: state.lastRunAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    viewUrl: 'https://brightdata.com/cp/scrapers/c_demo_priceguard',
    diffSummary: `proposed template has 1 step(s) — selector for ${field} rebuilt against the current DOM`,
    error: null
  };
}

app.listen(PORT, () => {
  console.log(`PriceGuard API listening on http://localhost:${PORT} (${DEMO_MODE ? 'demo' : 'live'} mode)`);
});
