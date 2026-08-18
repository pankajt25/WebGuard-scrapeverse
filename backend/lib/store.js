// Deliberately boring flat-file JSON store. Swapping this for Postgres/Mongo
// later only touches this file — nothing in server.js or healthMonitor.js
// knows or cares how persistence works.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.join(__dirname, '..', 'data', 'seed.json');
const STATE_PATH = path.join(__dirname, '..', 'data', 'state.json');

let cache = null;

async function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(STATE_PATH, 'utf-8'));
  } catch {
    cache = JSON.parse(await readFile(SEED_PATH, 'utf-8'));
    await persist();
  }
  return cache;
}

async function persist() {
  await writeFile(STATE_PATH, JSON.stringify(cache, null, 2));
}

export async function getState() {
  return load();
}

export async function getProducts() {
  const state = await load();
  return state.products;
}

export async function getProduct(id) {
  const state = await load();
  return state.products.find((p) => p.id === id);
}

export async function getHealEvents() {
  const state = await load();
  return state.healEvents;
}

/**
 * Apply a fresh batch of scraped rows: update each product's current
 * price/stock and append a history point. Rows are matched to products by
 * URL.
 */
export async function applyRun(rows) {
  const state = await load();
  const now = new Date().toISOString();

  for (const row of rows) {
    const product = state.products.find((p) => p.url === row.url);
    if (!product) continue;

    if (row.price !== null && row.price !== undefined && row.price !== '') {
      product.price = row.price;
      product.currency = row.currency || product.currency;
      product.history.push({ t: now, price: row.price, inStock: Boolean(row.in_stock) });
      if (product.history.length > 60) product.history = product.history.slice(-60);
    }
    product.inStock = row.in_stock === undefined ? product.inStock : Boolean(row.in_stock);
    product.lastCheckedAt = now;
  }

  state.lastRunAt = now;
  await persist();
  return state;
}

export async function setCollectorHealth(health) {
  const state = await load();
  state.collectorHealth = health;
  await persist();
  return state;
}

export async function addHealEvent(event) {
  const state = await load();
  state.healEvents.unshift(event);
  state.healEvents = state.healEvents.slice(0, 25);
  await persist();
  return state;
}

/** Demo-mode helper: corrupt one product's latest row to simulate a site redesign. */
export async function simulateBreak(productId) {
  const state = await load();
  const product = state.products.find((p) => p.id === productId);
  if (!product) return null;
  product.simulatedBreak = true;
  await persist();
  return product;
}

export async function clearSimulatedBreak(productId) {
  const state = await load();
  const product = state.products.find((p) => p.id === productId);
  if (!product) return null;
  product.simulatedBreak = false;
  await persist();
  return product;
}
