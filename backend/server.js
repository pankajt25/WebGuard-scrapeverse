import 'node:process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';

import * as store from './lib/store.js';
import * as brightdata from './lib/brightdata.js';
import { loadStoresConfig, runLiveAllStores, runDemo } from './lib/runner.js';

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
    const result = DEMO_MODE ? await runDemo() : await runLiveAllStores(AUTO_APPROVE_HEALS);
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

// ---- demo-only controls -----------------------------------------------------------

app.post('/api/simulate-break/:id', async (req, res) => {
  if (!DEMO_MODE) return res.status(400).json({ error: 'Only available in demo mode' });
  const product = await store.simulateBreak(req.params.id);
  if (!product) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true, product: product.name });
});

app.listen(PORT, () => {
  console.log(`WebGuard API listening on http://localhost:${PORT} (${DEMO_MODE ? 'demo' : 'live'} mode)`);
});
