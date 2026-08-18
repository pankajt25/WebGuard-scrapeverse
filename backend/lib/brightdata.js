// Thin wrapper around Bright Data Scraper Studio's HTTP surface.
//
// Collection API (running the collector day-to-day):
//   POST /dca/trigger?collector=<id>   queue one or more inputs, returns a snapshot id
//   GET  /dca/dataset?id=<snapshot_id> poll for the finished results
//
// AI Flow API (self-healing an existing collector):
//   POST /dca/collectors/<id>/refactor_template       ask the AI to repair the extraction
//   POST /dca/collectors/<id>/resume_automation_job    approve (or reject) a proposed fix
//
// This mirrors the official brightdata/bright-data-scraper-studio-nodejs-project
// boilerplate for the Collection API calls, plus the heal/approve calls documented
// for the Bright Data CLI (`scraper heal` / `scraper approve`).

// NOTE: these read process.env fresh on every call rather than caching into
// module-level constants at import time. That matters because server.js
// loads .env AFTER its imports run (imports always execute before the rest
// of an ES module's top-level code) — caching here would permanently freeze
// these as empty, no matter what .env says.
function getApiBase() {
  return process.env.BRIGHT_DATA_API_BASE || 'https://api.brightdata.com';
}
function getToken() {
  return process.env.BRIGHT_DATA_API_TOKEN;
}
function getCollectorId() {
  return process.env.BRIGHT_DATA_COLLECTOR_ID;
}

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60; // ~5 minutes
const MAX_RETRIES = 3;

function assertConfigured() {
  if (!getToken() || !getCollectorId()) {
    throw new Error(
      'Bright Data is not configured. Set BRIGHT_DATA_API_TOKEN and BRIGHT_DATA_COLLECTOR_ID in backend/.env, or leave DEMO_MODE=true.'
    );
  }
}

async function requestWithRetry(url, options, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (networkErr) {
      if (attempt === retries) throw networkErr;
      await sleep(2 ** attempt * 1000);
      continue;
    }
    if (res.ok) return res;
    if (res.status >= 400 && res.status < 500) {
      const body = await res.text().catch(() => '');
      throw new Error(`Bright Data API ${res.status}: ${body}`);
    }
    // 5xx — retry with backoff
    if (attempt === retries) {
      const body = await res.text().catch(() => '');
      throw new Error(`Bright Data API ${res.status} after ${retries} retries: ${body}`);
    }
    await sleep(2 ** attempt * 1000);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Known upstream data-quality issue: this collector's generated extraction
 * code sometimes selects multiple DOM elements holding the same price
 * (e.g. a duplicate for a sticky add-to-cart bar / mobile layout) and joins
 * their text before parsing to a number, producing the digit string
 * repeated back-to-back (e.g. price 1899 comes back as 189918991899).
 * Two `scraper heal` attempts targeting this in Scraper Studio did not fix
 * it in production runs (the healed preview looked correct but the fix did
 * not persist to `scraper run`) — see docs/KNOWN_ISSUES.md. Rather than
 * ship visibly wrong prices while that's unresolved upstream, detect the
 * exact repeated-digit-string pattern and recover the real value.
 * Returns the corrected price, or the original value if the pattern isn't
 * a clean repetition (so we never guess on a value we're not sure about).
 */
export function repairDuplicatedPrice(price) {
  if (typeof price !== 'number' || !Number.isFinite(price)) return price;
  const str = String(Math.trunc(price));

  // Require the recovered chunk to be at least 3 digits (>= ₹100). Below
  // that, a short chunk repeating is too likely to be a real price by
  // coincidence (e.g. 1010 is a plausible real price, not just "10" twice)
  // rather than evidence of the known duplication bug — in that case we'd
  // rather show the (possibly wrong) original than silently misfire on a
  // legitimate value.
  const MIN_CHUNK_DIGITS = 3;

  for (const repeats of [3, 2]) {
    if (str.length % repeats !== 0) continue;
    const chunkLen = str.length / repeats;
    if (chunkLen < MIN_CHUNK_DIGITS) continue;
    const chunk = str.slice(0, chunkLen);
    if (chunk.repeat(repeats) === str) {
      return Number(chunk);
    }
  }
  return price;
}

/** Apply repairDuplicatedPrice across a batch of rows, tracking what was fixed. */
export function repairRows(rows) {
  const repaired = [];
  for (const row of rows) {
    if (row.price === undefined || row.price === null) {
      repaired.push(row);
      continue;
    }
    const fixedPrice = repairDuplicatedPrice(row.price);
    if (fixedPrice !== row.price) {
      repaired.push({ ...row, price: fixedPrice, _repairedFrom: row.price });
    } else {
      repaired.push(row);
    }
  }
  return repaired;
}

/**
 * Trigger a collector run for one or more product URLs and block until the
 * snapshot has data (or we give up after MAX_POLL_ATTEMPTS).
 * @param {string[]} urls
 * @returns {Promise<object[]>} the raw collector output rows
 */
export async function runCollector(urls) {
  assertConfigured();
  const API_BASE = getApiBase();
  const TOKEN = getToken();
  const COLLECTOR_ID = getCollectorId();

  const triggerRes = await requestWithRetry(
    `${API_BASE}/dca/trigger?collector=${encodeURIComponent(COLLECTOR_ID)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(urls.map((url) => ({ url })))
    }
  );
  const { collection_id: snapshotId } = await triggerRes.json();
  if (!snapshotId) throw new Error('Bright Data did not return a collection_id/snapshot id.');

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const datasetRes = await requestWithRetry(
      `${API_BASE}/dca/dataset?id=${encodeURIComponent(snapshotId)}`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    const data = await datasetRes.json();
    if (Array.isArray(data) && data.length > 0) {
      const repaired = repairRows(data);
      const fixedCount = repaired.filter((r) => r._repairedFrom !== undefined).length;
      if (fixedCount > 0) {
        console.warn(
          `[brightdata] repaired ${fixedCount} duplicated-price value(s) from this run — see repairDuplicatedPrice() in lib/brightdata.js and docs/KNOWN_ISSUES.md`
        );
      }
      return repaired;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for snapshot ${snapshotId} after ${MAX_POLL_ATTEMPTS} polls.`);
}

/**
 * Ask Scraper Studio's AI to repair the collector's extraction for a specific
 * problem, using one URL as the verification target. Stops at the approval
 * gate unless autoApprove is true.
 * @param {string} prompt - what's wrong and what the correct output should be
 * @param {string} verifyUrl - a URL known to reproduce the problem
 * @param {boolean} autoApprove
 */
export async function healCollector(prompt, verifyUrl, autoApprove = false) {
  assertConfigured();
  const API_BASE = getApiBase();
  const TOKEN = getToken();
  const COLLECTOR_ID = getCollectorId();

  const healRes = await requestWithRetry(
    `${API_BASE}/dca/collectors/${encodeURIComponent(COLLECTOR_ID)}/refactor_template`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt, url: verifyUrl })
    }
  );
  const healResult = await healRes.json();

  if (healResult.status === 'awaiting_approval' && autoApprove) {
    return approveHeal();
  }
  return healResult;
}

/**
 * Commit (or reject) a self-healing fix left awaiting approval by healCollector().
 * @param {boolean} reject
 */
export async function approveHeal(reject = false) {
  assertConfigured();
  const API_BASE = getApiBase();
  const TOKEN = getToken();
  const COLLECTOR_ID = getCollectorId();

  const approveRes = await requestWithRetry(
    `${API_BASE}/dca/collectors/${encodeURIComponent(COLLECTOR_ID)}/resume_automation_job`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: !reject, auto_save: !reject })
    }
  );
  return approveRes.json();
}

export function isConfigured() {
  return Boolean(getToken() && getCollectorId());
}
