<div align="center">

# 🕸️ WebGuard

### A self-healing price & inventory tracker built on Bright Data Scraper Studio

[![Hackathon](https://img.shields.io/badge/hackathon-Into%20the%20Scrape--Verse-e23636?style=flat-square)](https://www.wemakedevs.org/hackathons/scrape-verse)
[![Bright Data](https://img.shields.io/badge/powered%20by-Bright%20Data%20Scraper%20Studio-3b82f6?style=flat-square)](https://brightdata.com)
[![Node](https://img.shields.io/badge/node-%3E%3D20-34d399?style=flat-square)](https://nodejs.org)
[![Status](https://img.shields.io/badge/status-live-34d399?style=flat-square)]()

Built for [Into the Scrape-Verse](https://www.wemakedevs.org/hackathons/scrape-verse) — WeMakeDevs × Bright Data, Aug 17–23 2026

</div>

---

## What it does

WebGuard watches a list of e-commerce product pages, pulls price and stock data through a Scraper Studio collector, and keeps a running history so you can see price drops, stock-outs, and trend lines over time.

When the target site redesigns its layout and the collector starts returning empty or null fields, WebGuard's health monitor **detects it automatically** and triggers Bright Data's AI self-healing flow (`scraper heal` → `approve`) to repair the extraction — no manual selector fixing.

```
 Scraper Studio collector  ──▶  backend health monitor  ──▶  JSON store  ──▶  React dashboard
         ▲                              │
         └───────────── self-heal ◀─────┘   (triggered automatically on broken extraction)
```

<br>

## 📁 What's in this repo

| Folder | What it is |
|---|---|
| `scraper/` | Multi-store collector config: field spec, one entry per store with its own `collector_id`, and the exact CLI commands to create/run/heal each one |
| `backend/` | Node.js/Express API that triggers each store's collector, polls for results, runs the health check, stores history, drives self-healing, and serves a consolidated single-file dashboard directly |
| `frontend/` | React + Vite dashboard: product grid, price-history charts, collector health badge, self-heal event timeline |
| `docs/` | Submission write-up, architecture notes, judging-criteria mapping, a demo script, and an honest log of a real bug found along the way |

<br>

## 🏗️ Complete architecture

### Data flow

```
                    ┌────────────────────────────┐      ┌────────────────────────────┐
                    │  Store A's Scraper Studio  │      │  Store B's Scraper Studio  │
                    │  collector (own c_id)      │      │  collector (own c_id)      │  ...one per store, since a
                    │  POST /dca/trigger          │      │  POST /dca/trigger          │  collector's extraction logic
                    │  GET  /dca/dataset           │      │  GET  /dca/dataset           │  is built for ONE site's markup
                    └──────────────┬─────────────┘      └──────────────┬─────────────┘
                                   │ rows: [{url, name, price, currency, in_stock, image_url}]
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ backend/server.js   POST /api/run   →  runLiveAllStores()                              │
│                                                                                          │
│   for each store with a collector_id set:                                              │
│     rows ──▶ brightdata.runCollector(collectorId, urls, storeName)                      │
│                   │  (applies repairDuplicatedPrice() to every row automatically —       │
│                   │   see "a real bug" below)                                            │
│                   ▼                                                                     │
│           healthMonitor.assessHealth(rows, expectedCount)                                │
│                   │                                                                     │
│         healthy   │   unhealthy (null required field or row-count collapse)              │
│           │        │                                                                     │
│           ▼        ▼                                                                     │
│   store.applyRun   healthMonitor.autoHeal(assessment, collectorId)                       │
│   (price history,         │            (heals THIS store's collector only —              │
│    auto-creates            │             other stores keep running independently)         │
│    new products)           ▼                                                             │
│                    brightdata.healCollector(collectorId, prompt, verifyUrl)               │
│                    POST /dca/collectors/{id}/refactor_template                            │
│                             │                                                             │
│              awaiting_approval        (AUTO_APPROVE_HEALS=true)                           │
│                       │                          │                                        │
│                       ▼                          ▼                                        │
│              logged for review        brightdata.approveHeal(collectorId)                 │
│                                        POST .../resume_automation_job                     │
│                                                   │                                        │
│                                                   ▼                                        │
│                                     re-run that store's collector, apply fixed rows        │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                    backend/data/state.json (products, per-store history, heal events — deduped by repeatCount)
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                              ▼
        GET /api/products, /heal-events    served directly by Express:
                    │                       backend/public/index.html
                    ▼                       (zero-build single-file dashboard,
        React dashboard (frontend/)          same origin as the API, `npm start` alone is enough)
```

### Why multi-store needs one collector per site

A Scraper Studio collector's extraction code is generated for one site's specific DOM structure. Real evidence from this project: running the Headphone Zone collector against `books.toscrape.com` and `amkette.com` in the same batch produced `"Parse error: Cannot read properties of undefined (reading 'split')"` for both — the generated code crashes trying to read a value from a page structure it was never built for. `scraper/products.json`'s `stores` array reflects this: each store is its own object with its own `collector_id`, and `runLiveAllStores()` in `server.js` loops through them independently — one store's collector breaking (and healing) never affects another's.

### Why detection is a separate module

`healthMonitor.js` takes rows in and returns an assessment out — it doesn't know about HTTP, Express, the store, or even Bright Data. That makes it reusable identically for every store's collector, and for demo mode's simulated rows, so the demo is an honest representation of the real logic rather than a separate mocked-up path.

### Why a flat-file store

For a week-long hackathon build, `backend/data/state.json` (seeded from `data/seed.json` on first run) is the right amount of infrastructure — no database to provision, and the whole state is easy to inspect or reset by hand (`rm backend/data/state.json`). `store.js` is the only file that touches persistence.

### Two UIs, on purpose

`frontend/` (React + Vite) is the primary dashboard used for active development. `backend/public/index.html` is a zero-dependency, zero-build alternative served directly by Express on the same port as the API — useful when you want the whole project running from a single `npm start` in `backend/` with nothing else to install or configure. Both talk to the exact same `/api/*` endpoints.

Full write-up with extension ideas (adding required fields, alerting, scheduling) in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

<br>

## 🚀 Two ways to run it

<table>
<tr>
<td width="50%" valign="top">

### 🎭 Demo mode
*(default, no Bright Data account needed)*

Ships with 14 days of realistic seed data for 6 products and a button that simulates a site redesign so you can see detection → heal → recovery end-to-end without spending any credits. Best for a first look.

</td>
<td width="50%" valign="top">

### ⚡ Live mode
*(real Bright Data collector)*

Point it at a real Scraper Studio collector using your own API key — triggers real collector runs and real `scraper heal` calls. See `scraper/SETUP.md` for the CLI commands, `backend/.env.example` for the keys.

</td>
</tr>
</table>

### Quick start — demo mode

```bash
# Terminal 1 — backend
cd backend
npm install
npm start
# → API on http://localhost:4000, DEMO_MODE=true by default

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
# → dashboard on http://localhost:5173
```

Open the dashboard, hit **Simulate Site Change** on any product card, then **Run Scraper Now** — watch the health badge flip healthy → broken → self-healing → healthy again, with the event logged in the timeline.

### Quick start — live mode

1. Follow `scraper/SETUP.md` to build a collector **per store** in Scraper Studio with the Bright Data CLI (`brightdata scraper create ...`).
2. Paste each store's `collector_id` directly into its entry in `scraper/products.json` (not `.env` — collector IDs are per-store, not global).
3. Copy `backend/.env.example` to `backend/.env`, fill in `BRIGHT_DATA_API_TOKEN` (account-wide), and set `DEMO_MODE=false`.
4. `npm start` in `backend/` — either open `http://localhost:4000` directly (consolidated single-file dashboard) or also run `npm run dev` in `frontend/` for the React version on `http://localhost:5173`.
5. Hit **Run Scraper Now** — it runs every store with a `collector_id` set, independently.

<br>

## 🏆 Judging-criteria alignment

Full write-up in `docs/SUBMISSION.md` — short version:

- **Use of Scraper Studio** — Scraper Studio is the only thing that talks to the target site
- **Reliability & self-healing** — the health monitor treats null/missing fields and row-count drops as first-class signals and calls `scraper heal` automatically
- **Potential impact / Best UI** — the dashboard is the actual product a buyer would use
- **Technical excellence** — a real platform bug was found, documented, and worked around defensibly (see below) rather than hidden

<br>

## 🐛 A real bug, found and documented honestly

While building this, the collector was found to return prices as duplicated digit strings (`1899` → `189918991899`). Three separate `scraper heal` attempts in Scraper Studio each correctly diagnosed the problem and previewed a fix — but the fix never persisted to production runs. Rather than hide it, the whole debugging process is written up in **[`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md)**, and a defensible, logged workaround (`repairDuplicatedPrice()`) ships in `backend/lib/brightdata.js`.

<br>

## 🤖 AI assistance disclosure

Per the hackathon rules (AI coding assistants are allowed if disclosed):

- **Claude (Anthropic)** was used as an AI coding assistant for most of this project's code — the backend, frontend, and documentation.
- **What I (the participant) actually did:** ran every `brightdata` CLI command myself against my own Bright Data account and credits; created the collector, tested it, and drove the `heal`/`approve` cycle through multiple real attempts; discovered the price-duplication bug and confirmed three AI-assisted heal attempts didn't actually fix it in production; debugged a real load-order bug in the backend (credentials were read into memory before `.env` was parsed) by working through server logs and testing hypotheses until the cause was isolated; verified the final fix against live scraper output myself.
- I can explain the scraper's field extraction, the health-check logic in `backend/lib/healthMonitor.js`, why `repairDuplicatedPrice()` exists and what it does and doesn't fix, and the overall architecture in `docs/ARCHITECTURE.md`.

<br>

## 🛠️ Tech stack

| | |
|---|---|
| **Scraping** | Bright Data Scraper Studio (collector) + Bright Data CLI for build/heal |
| **Backend** | Node.js, Express, native `fetch`, a flat-file JSON store (swap for Postgres/Mongo — see `backend/lib/store.js`) |
| **Frontend** | React 18, Vite, Recharts — plus a zero-build single-file alternative served directly by the backend |
| **Automation** | GitHub Actions runs the real scraper + self-heal on a schedule (`.github/workflows/self-heal.yml`) — see below |
| **Runs** | Entirely locally to demo — no external services required |

<br>

## ⏰ Scheduled automation (GitHub Actions)

`.github/workflows/self-heal.yml` runs the exact same scrape-and-heal logic as the dashboard's "Run Scraper Now" button (`backend/lib/runner.js`, shared by both), unattended, every 6 hours — plus a manual trigger from the Actions tab for on-demand runs.

If the scraped data changed, the workflow commits the updated `backend/data/state.json` back to the repo. That means the commit history itself is real, timestamped evidence that unattended runs actually happened — not just a claim.

**To enable it in your own fork/clone:**
1. Go to your repo → Settings → Secrets and variables → Actions → New repository secret
2. Name: `BRIGHT_DATA_API_TOKEN`, value: your Bright Data API key
3. Go to the Actions tab → "Scheduled scrape & self-heal" → Run workflow, to trigger it manually and verify it works before waiting for the schedule

A failed store (bad credentials, Bright Data outage, etc.) makes the workflow run show a red ✗ in the Actions tab, not a misleading green checkmark — see `backend/scripts/run-and-heal.mjs`.

<div align="center">
<br>

*Built with 🕸️ for Into the Scrape-Verse*

</div>
