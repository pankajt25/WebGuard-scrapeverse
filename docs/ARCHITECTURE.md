# 🏗️ Architecture

## Data flow

```
                     ┌─────────────────────────┐
                     │   Scraper Studio         │
                     │   collector (c_...)      │
                     │   POST /dca/trigger       │
                     │   GET  /dca/dataset       │
                     └────────────┬─────────────┘
                                  │ rows: [{ url, name, price, currency, in_stock }]
                                  ▼
┌──────────────────────────────────────────────────────────────┐
│ backend/server.js  POST /api/run                              │
│                                                                 │
│   rows ──▶ healthMonitor.assessHealth(rows, expectedCount)     │
│                   │                                            │
│         healthy   │   unhealthy (null field or row-count drop) │
│           │        │                                            │
│           ▼        ▼                                            │
│   store.applyRun   healthMonitor.autoHeal(assessment)           │
│   (price history)         │                                     │
│                            ▼                                    │
│                   brightdata.healCollector()                    │
│                   POST /dca/collectors/{id}/refactor_template   │
│                            │                                     │
│              awaiting_approval        (AUTO_APPROVE_HEALS=true) │
│                       │                          │               │
│                       ▼                          ▼               │
│              logged for review        brightdata.approveHeal()  │
│                                        POST .../resume_automation_job │
│                                                   │               │
│                                                   ▼               │
│                                     re-run collector, apply fixed rows │
└──────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                     store/state.json (products, history, heal events)
                                  │
                                  ▼
                     GET /api/products, /api/products/:id, /api/heal-events
                                  │
                                  ▼
                     React dashboard (product grid, price chart, timeline)
```

## Why health detection is a separate module

`healthMonitor.js` doesn't know about HTTP, Express, or the store — it takes rows in and returns an assessment out. That makes the detection logic unit-testable in isolation and reusable identically in demo mode (simulated rows) and live mode (real Bright Data rows), which is also why the demo is an honest representation of the live behavior rather than a separate mocked-up flow.

## Why a flat-file store

For a week-long hackathon build, a JSON file (`backend/data/state.json`, seeded from `backend/data/seed.json` on first run) is the right amount of infrastructure — no database to provision, and the whole state is easy to inspect or reset by hand. `store.js` is the only file that touches persistence; swapping in Postgres or MongoDB later means rewriting the functions in that one file, not touching `server.js`, `healthMonitor.js`, or the frontend.

## Extending it

- **More products:** add URLs to `scraper/products.json`, add matching entries to `backend/data/seed.json` (or just let a live run populate them — `applyRun` matches by URL and skips rows it doesn't recognize).
- **More required fields:** extend `REQUIRED_FIELDS` in `healthMonitor.js` — e.g. add `image_url` if a missing image should also count as a broken run.
- **Alerting:** `store.addHealEvent()` is the single choke point for every heal attempt — hook a webhook or email call in right after it in `server.js` to notify a team when a repair happens.
- **Scheduling:** `POST /api/run` is a plain HTTP endpoint — call it from a cron job, a GitHub Action, or `setInterval` in a small wrapper script for unattended monitoring.
