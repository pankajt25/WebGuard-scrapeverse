# 🎯 WebGuard — submission write-up

## One-line pitch

A price and inventory tracker that catches its own scraper breaking and fixes it — via Bright Data Scraper Studio's AI self-healing — before a human ever notices the data went bad.

## The problem

Anyone tracking prices across stores eventually hits the same failure: the scraper runs fine for weeks, then a site redesign renames a class or moves a field, and the scraper starts returning nulls or garbage. Nothing crashes — it just quietly stops being useful. By the time someone checks the dashboard and notices the numbers look wrong, the tracker may have been broken for days.

## What WebGuard does about it

1. A Scraper Studio collector, built with a plain-language field spec (`scraper/products.json`), pulls name/price/currency/in-stock/image for a list of tracked products.
2. Every run, the backend's health monitor (`backend/lib/healthMonitor.js`) checks the result against two signals: are required fields (`name`, `price`) null or empty, and did the row count collapse relative to what was requested. Either one flags the run as unhealthy.
3. On an unhealthy run, the backend builds a specific heal prompt naming the broken field and calls Scraper Studio's AI self-healing (`refactor_template`, i.e. `scraper heal`), then either stops at the approval gate or auto-approves depending on `AUTO_APPROVE_HEALS`.
4. Every heal attempt — successful, pending, or failed — is logged to a visible timeline in the dashboard, so "self-healing" isn't a black box; you can see exactly what broke and what Scraper Studio's AI did about it.
5. The dashboard itself is the product: a price/stock tracker with sparklines, trend %, and a full price-history chart per product — something a small business or a deal-hunter would actually use day to day.

## Judging-criteria mapping

**Potential impact.** Anyone running scrapers for price monitoring, lead generation, or competitive intel hits the "silent breakage" problem eventually. This turns it from a support ticket into an automated repair.

**Creativity and innovation.** Most self-healing demos stop at "the scraper fixed itself" in a terminal. WebGuard treats healing as a product signal: the dashboard's health strip, the broken-field flag on the affected product card, and the heal timeline all make an invisible backend event visible and understandable to a non-technical user.

**Technical excellence.** Detection is explicit and testable (`assessHealth()` in `healthMonitor.js` — required-field nulls + row-count collapse, not a vibe check). The Bright Data client (`backend/lib/brightdata.js`) retries transient 5xx/network failures with backoff and fails fast on 4xx, matching Bright Data's own reference implementation. Demo mode and live mode share the exact same code path through `assessHealth` → `autoHeal`, so what you see in the demo is genuinely the same logic that runs against a real collector.

**Use of Scraper Studio.** The collector is the only thing that talks to the target site — see `scraper/SETUP.md` for the exact `brightdata scraper create` command and field descriptions used to build it. The backend calls the same two Collection API endpoints (`/dca/trigger`, `/dca/dataset`) the official CLI and Node.js boilerplate use, and drives healing through the same AI Flow endpoints (`refactor_template`, `resume_automation_job`) the CLI's `scraper heal`/`scraper approve` wrap.

**Reliability and self-healing.** This is the core of the project, not a bolt-on: every run is health-checked, every unhealthy run triggers a targeted heal (not a generic "try again"), and the loop is demonstrable without waiting for a real site redesign via the **Simulate site change** button on any product card.

**Presentation.** See `docs/DEMO_SCRIPT.md` for a 90-second walkthrough: healthy dashboard → simulate a break → watch detection, the heal prompt, and recovery, live.

## What's real vs. simulated in the submitted build

- The Bright Data client, health monitor, and dashboard are real, working code, not a mockup.
- Running in **demo mode** (the default) uses seed data and a simulated collector run so judges can see the full loop without an API key or spending credits. The simulated run and simulated heal call the exact same `assessHealth`/timeline/store code paths as live mode — only the data source (`brightdata.runCollector` vs. an in-memory generator) differs.
- Running in **live mode** (`DEMO_MODE=false` + a real `BRIGHT_DATA_API_TOKEN`/`BRIGHT_DATA_COLLECTOR_ID`) calls the real Bright Data API for both the run and the heal.
- Target URLs in `scraper/products.json` are placeholders — swap in real, publicly accessible product pages before building the live collector (see `scraper/SETUP.md`, step 1).
