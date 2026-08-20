# 🐛 Known issues

## Duplicated price digits from the live collector

**What happens:** the Scraper Studio collector built against `headphonezone.in` product pages returns `price` as the correct digits repeated back-to-back — e.g. an ₹19,999 product returns `199991999919999` (19999 three times), an ₹1,899 product returns `189918991899` (1899 three times).

**Root cause (best understanding):** Headphone Zone's product pages render the price in more than one place in the DOM for responsive layouts — likely a main product-info price, a sticky "add to cart" bar price, and a mobile-menu price, all showing the identical value. The AI-generated extraction code appears to select all matching elements and concatenate their text before parsing to a number, rather than selecting a single element.

**What we tried:** three separate `scraper heal` calls with increasingly specific prompts:
1. Asking to pick the price near the "Add to Cart" button, not the sale/list price
2. Asking explicitly to select only the first matching element, not all matches
3. Recreating the collector from scratch with an explicit "no duplication" instruction in the original `scraper create` prompt

Every heal attempt returned a correct-looking `preview_result` (e.g. `price: 1899`) and reported `status: done` after approval — but every subsequent `scraper run` against the same URL, and against brand-new URLs never previously scraped (ruling out caching), still returned the duplicated value. The fix computes correctly in Scraper Studio's preview step but does not appear to persist to production collector runs on this account. We didn't find a `deploy`/`publish` step in the CLI (`brightdata scraper --help` lists only `create`, `run`, `heal`, `approve`) that might have been missing.

**What we shipped instead:** rather than display visibly wrong prices while this is unresolved upstream, or silently trust a value we know is malformed, `backend/lib/brightdata.js` includes `repairDuplicatedPrice()`: it checks whether a returned price is an exact repetition of a shorter digit string (2x or 3x), where the repeated chunk is at least 3 digits, and if so, recovers the real value. This is applied to every row in `runCollector()`, and any row it touches is logged to the console (`[brightdata] repaired N duplicated-price value(s)...`) so the correction is visible, not silent. If a price doesn't match the exact-repetition pattern, it's passed through unchanged — we never guess on a value we're not confident about.

**Known limitation of the workaround itself, in the interest of full disclosure:** the 3-digit minimum on the repeated chunk exists because a shorter chunk repeating could plausibly be a real price rather than evidence of the bug — e.g. a genuine ₹1010 item and a duplicated "10" both produce the string `1010`. We chose to under-correct (leave a real duplication bug unfixed below ₹100) rather than over-correct (silently mangle a legitimate low price) — err toward showing possibly-wrong data over silently changing correct data. This is a heuristic, not a guarantee; if you adapt this project for a store with sub-₹100 items, revisit `MIN_CHUNK_DIGITS` in `repairDuplicatedPrice()`.

**Why this is disclosed here rather than fixed silently:** the hackathon's judging criteria explicitly reward reliability and self-healing. We think the honest story is: Scraper Studio's AI *did* correctly diagnose and preview the fix each time — the persistence gap looks like a platform-side issue we hit, not a prompting mistake — and the interesting engineering response was building a second line of defense (deterministic pattern-repair) rather than treating "the AI said it healed it" as proof it actually did. `assessHealth()` in `healthMonitor.js` is deliberately built the same way: it doesn't trust the collector's reported status, it checks the actual returned data.

**If you hit this too:** try `brightdata scraper --help` for your CLI version in case a newer release adds a separate deploy step, and consider filing it with Bright Data support/Discord — this may be specific to certain page structures or account state.
