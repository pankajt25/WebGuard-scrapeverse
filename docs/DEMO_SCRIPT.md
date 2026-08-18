# Demo script (~90 seconds)

**0:00–0:10 — Open on the dashboard.**
"This is PriceGuard — it tracks price and stock across six products through a Bright Data Scraper Studio collector, and it catches the collector breaking on its own."
Point at the pulse strip: healthy, mint dot, "collector healthy."

**0:10–0:25 — Tour the grid.**
Click through two or three product cards. Point out the sparkline, the price, the % trend badge, in-stock/out-of-stock. Click one card fully open to show the detail chart on the right — full price history, not just today's number.

**0:25–0:35 — Break it on purpose.**
Click **Simulate site change** on a product card. "This is standing in for what happens when the store redesigns its product page — the price field starts coming back empty."

**0:35–0:55 — Run and watch it detect + heal.**
Click **Run scraper now**. Narrate as it happens: the pulse strip flips to amber ("self-healing in progress"), then back to mint. Open the heal timeline panel and point at the new entry — the actual prompt PriceGuard sent to Scraper Studio's AI ("The 'price' field is returning null... re-identify it from the current page..."), and the diff summary describing what got fixed.

**0:55–1:10 — Show it's not a black box.**
"That prompt and diff are real outputs from Scraper Studio's self-healing flow — `refactor_template` and `resume_automation_job`, the same calls the Bright Data CLI's `scraper heal`/`scraper approve` make." Briefly show `backend/lib/healthMonitor.js` or `brightdata.js` on screen if doing a technical walkthrough.

**1:10–1:25 — Live mode note.**
"In live mode this talks to a real collector built in Scraper Studio — same code path, same detection logic, just a real API call instead of a simulated one." (Optional: show `scraper/SETUP.md` briefly.)

**1:25–1:30 — Close.**
Cut back to the healthy dashboard. "PriceGuard — built for Into the Scrape-Verse."

## Recording notes

- Run in demo mode (`DEMO_MODE=true`, the default) — no API key needed, nothing to redact.
- Pick a product with a visible price trend (up or down) for the "tour the grid" beat so the sparkline color reads clearly on camera.
- The amber "repairing" pulse only shows for a moment — if recording, consider a quick screen-record + trim rather than a live take, so the timing lands cleanly.
