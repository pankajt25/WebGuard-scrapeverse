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
 * URL. A row for a URL that doesn't match any tracked product yet (a new
 * store's product, seen for the first time) gets a new product entry
 * created automatically instead of being silently dropped.
 * @param {object[]} rows
 * @param {string} [storeName] - label to tag newly-created products with
 */
export async function applyRun(rows, storeName) {
  const state = await load();
  const now = new Date().toISOString();

  for (const row of rows) {
    let product = state.products.find((p) => p.url === row.url);

    if (!product) {
      if (row.price === null || row.price === undefined || row.price === '') continue; // don't create a product from a broken row
      product = {
        id: `p_${Math.random().toString(36).slice(2, 9)}`,
        name: row.name || 'Unknown product',
        url: row.url,
        category: storeName || 'Uncategorized',
        store: storeName || 'Unknown store',
        imageUrl: row.image_url || '',
        currency: row.currency || '',
        price: row.price,
        inStock: Boolean(row.in_stock),
        lastCheckedAt: now,
        simulatedBreak: false,
        history: []
      };
      state.products.push(product);
    }

    if (row.price !== null && row.price !== undefined && row.price !== '') {
      product.price = row.price;
      product.currency = row.currency || product.currency;
      product.history.push({ t: now, price: row.price, inStock: Boolean(row.in_stock) });
      if (product.history.length > 60) product.history = product.history.slice(-60);
    }
    product.inStock = row.in_stock === undefined ? product.inStock : Boolean(row.in_stock);
    product.lastCheckedAt = now;
    if (storeName && !product.store) product.store = storeName;
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

/**
 * Log a heal attempt — but if the most recent event has the exact same
 * prompt and status (e.g. the same field keeps breaking on every run),
 * merge into it with a repeat count instead of stacking up identical
 * entries. Keeps the timeline readable instead of spamming duplicates.
 */
export async function addHealEvent(event) {
  const state = await load();
  const last = state.healEvents[0];

  if (last && last.prompt === event.prompt && last.status === event.status) {
    last.repeatCount = (last.repeatCount || 1) + 1;
    last.finishedAt = event.finishedAt;
    last.verifyUrl = event.verifyUrl;
  } else {
    state.healEvents.unshift(event);
    state.healEvents = state.healEvents.slice(0, 25);
  }

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
