# 🎬 Demo script (~2 minutes, live-mode version)

This version shows the dashboard running in **live mode** against a real Bright Data collector — stronger for judging than the simulated version, since it shows genuine platform behavior including a real bug found along the way.

**0:00–0:15 — Open on the dashboard.**
"This is WebGuard — a price and inventory tracker built on Bright Data Scraper Studio, running right now in live mode against a real collector I built." Point at the mode pill (LIVE MODE) and the pulse strip ("collector connected").

**0:15–0:30 — Tour the grid.**
Click through two or three product cards — real Headphone Zone headphones. Point out the sparkline, price, trend %, in-stock/out-of-stock. Open one fully to show the price-history chart.

**0:30–0:55 — Trigger a real run and narrate what's actually happening.**
Click **Run scraper now**. While it's loading (this takes real time — it's genuinely calling Bright Data, not instant like a demo): "This is triggering my actual Scraper Studio collector against six live product pages and polling for results." When it finishes, point at the updated "Last run" timestamp.

**0:55–1:25 — The real bug, told honestly.**
Switch to the terminal running the backend. Point at the log line: `[brightdata] repaired N duplicated-price value(s)`. "While building this, I found a real bug — this collector's extraction occasionally returns a price as the same digits repeated back-to-back, like 1899 coming back as 189918991899. I tried fixing it with Scraper Studio's AI self-healing three separate times, with increasingly specific prompts — each attempt correctly diagnosed the problem and showed a fixed preview, but the fix never actually persisted to real runs. I documented the whole thing in `docs/KNOWN_ISSUES.md` and built a defensible workaround instead of hiding it: a function that detects the exact repeated-digit pattern and recovers the real value, logging every correction instead of applying it silently." Show `repairDuplicatedPrice()` in `backend/lib/brightdata.js` briefly.

**1:25–1:45 — Show the detection logic isn't a black box either.**
Briefly show `assessHealth()` in `healthMonitor.js`. "Every run gets checked for null required fields and row-count collapse — not just whether Scraper Studio says it succeeded, since I learned the hard way that a reported 'done' status doesn't always mean the fix actually shipped."

**1:45–2:00 — Close.**
Back to the dashboard. "WebGuard — built for Into the Scrape-Verse, using Bright Data Scraper Studio."

## Alternate: demo-mode version (if live mode isn't available when recording)

Use this if credits run out or the collector is unavailable at recording time — the self-heal loop is simulated but runs through the exact same code paths as live mode:

1. Click **Simulate site change** on a product card
2. Click **Run scraper now** — watch the pulse strip flip amber → mint, and a new entry land in the self-heal timeline
3. Explain: "This simulated run calls the identical `assessHealth()` and store logic that live mode uses — only the data source differs."

## Recording notes

- Live-mode version is stronger for judging (rule 3/5 explicitly require a real custom Scraper Studio collector) — use it if your Bright Data credits/collector are working when you record.
- The real run in live mode takes noticeably longer than demo mode (polling Bright Data) — don't cut that pause, it's proof it's real.
- Keep the terminal visible during the bug-explanation beat — the log line and code are your evidence this isn't just narrated, it's actually happening.
- Don't rush the `KNOWN_ISSUES.md` explanation — this is genuinely your strongest "technical excellence" and "understand your own project" material (rules 11/12).
