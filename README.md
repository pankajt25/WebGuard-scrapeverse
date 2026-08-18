# PriceGuard

**A self-healing price & inventory tracker built on Bright Data Scraper Studio.**

Built for [Into the Scrape-Verse](https://www.wemakedevs.org/hackathons/scrape-verse) (WeMakeDevs × Bright Data, Aug 17–23 2026).

PriceGuard watches a list of e-commerce product pages, pulls price and stock data through a Scraper Studio collector, and keeps a running history so you can see price drops, stock-outs, and trend lines over time. When the target site redesigns its layout and the collector starts returning empty or null fields, PriceGuard's health monitor detects it automatically and triggers Bright Data's AI self-healing flow (`scraper heal` → approve) to repair the extraction — no manual selector fixing.

```
Scraper Studio collector  →  backend health monitor  →  JSON store  →  React dashboard
        ▲                           │
        └──────── self-heal ────────┘   (triggered automatically on broken extraction)
```

## AI assistance disclosure

Per the hackathon rules (AI coding assistants are allowed if disclosed), here's what was used and how:

- **Claude (Anthropic)** was used as an AI coding assistant for the majority of this project's code: the backend (Express server, Bright Data API client, health-detection logic, JSON store), the frontend (React dashboard, components, styling), and this documentation.
- **What I (the participant) actually did:** ran every `brightdata` CLI command myself against my own Bright Data account and credits; created the collector, tested it, and drove the `heal`/`approve` cycle through multiple real attempts; discovered that the collector was returning a real data-quality bug (prices coming back as duplicated digit strings, e.g. `1899` returned as `189918991899`) that three separate AI-assisted heal attempts in Scraper Studio did not actually resolve in production runs; debugged a real load-order bug in the backend (Bright Data credentials were being read into memory before the `.env` file was parsed, so live mode silently behaved like it had no credentials) by working through the actual server logs and testing hypotheses until we isolated the cause; verified the final fix against live scraper output myself before considering it working.
- **Full details on the price-duplication bug, what was tried, and why the shipped fix works the way it does** are documented in `docs/KNOWN_ISSUES.md` — written to be an honest account of a real debugging process, not a claim that everything worked perfectly on the first try.
- I can explain the scraper's field extraction, the health-check logic in `backend/lib/healthMonitor.js`, why `repairDuplicatedPrice()` exists and what it does and doesn't fix, and the overall architecture (`docs/ARCHITECTURE.md`) — this wasn't generated and submitted without understanding it.



| Folder | What it is |
|---|---|
| `scraper/` | Everything needed to build the Scraper Studio collector itself: the field spec, seed product list, and the exact CLI commands to create/run/heal it |
| `backend/` | Node.js/Express API that triggers the collector, polls for results, runs the health check, stores history, and drives self-healing |
| `frontend/` | React + Vite dashboard: product grid, price-history charts, collector health badge, self-heal event timeline |
| `docs/` | Submission write-up, architecture notes, judging-criteria mapping, and a demo script |

## Two ways to run it

**Demo mode (default, no Bright Data account needed)** — the backend ships with 14 days of realistic seed data for 6 products and a button that simulates a site redesign so you can see detection → heal → recovery end-to-end without spending any credits. This is what you want for a first look or a screen recording.

**Live mode** — point it at a real Scraper Studio collector using your own Bright Data API key and it trigger real collector runs and real `scraper heal` calls. See `scraper/SETUP.md` for the exact CLI commands to build the collector, and `backend/.env.example` for the keys to fill in.

## Quick start (demo mode)

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

Open the dashboard, hit **Simulate Site Change** on any product card, and watch the health badge flip from healthy → broken → self-healing → healthy again, with the event logged in the timeline.

## Quick start (live mode)

1. Follow `scraper/SETUP.md` to build a collector in Scraper Studio with the Bright Data CLI (`brightdata scraper create ...`) using the field spec in `scraper/products.json`.
2. Copy `backend/.env.example` to `backend/.env` and fill in `BRIGHT_DATA_API_TOKEN`, `BRIGHT_DATA_COLLECTOR_ID`, and set `DEMO_MODE=false`.
3. `npm start` in `backend/`, `npm run dev` in `frontend/`, same as above.
4. Hit **Run Scraper Now** to trigger a real collector run.

## Judging-criteria alignment

See `docs/SUBMISSION.md` for the full write-up. Short version: Scraper Studio is the only thing that talks to the target site (`Use of Scraper Studio`); the health monitor treats null/missing fields and row-count drops as first-class signals and calls `scraper heal` automatically (`Reliability and self-healing`); the dashboard is the actual product a buyer would use (`Best UI` / `Potential impact`); the backend is organized into small, single-purpose modules with no dead code (`Best Clean Code`).

## Tech stack

- **Scraping:** Bright Data Scraper Studio (collector) + Bright Data CLI for build/heal
- **Backend:** Node.js, Express, native `fetch`, a flat-file JSON store (swap for Postgres/Mongo trivially — see `backend/lib/store.js`)
- **Frontend:** React 18, Vite, Recharts
- **No external services required to demo** — everything runs locally
