# Building the collector

These are the exact Bright Data CLI commands to create, test, and later heal the collector this project runs against. Do this once per target site (or once per hackathon submission).

## 0. Install and authenticate

```bash
curl -fsSL https://cli.brightdata.com/install.sh | sh   # macOS/Linux
# npm install -g @brightdata/cli                        # Windows / any platform

brightdata login --api-key <your-api-key>
# get the key from https://brightdata.com/cp/setting/users
# claim your $50 hackathon credit first: https://brdta.com/wemakedevs (code: wemakedevs, lowercase)
```

## 1. Pick a real target and swap it into `products.json`

Replace the placeholder URLs in `products.json` with real, publicly accessible product pages from the store you're tracking. Keep it to one product family (electronics, furniture, whatever) so the field descriptions below stay accurate across all of them.

## 2. Create the collector from the first URL

```bash
brightdata scraper create "<first-product-url>" \
  "Extract the product name, current price as a plain number, currency code, \
   whether it's in stock (true/false), and the main product image URL." \
  --name webguard-collector \
  -o scraper/create.json

# grab the collector id for everything that follows
COLLECTOR_ID=$(jq -r '.collector_id' scraper/create.json)
echo "$COLLECTOR_ID" > scraper/.collector_id
```

Keep the field descriptions close to what's in `products.json` → `field_descriptions_for_scraper_create` — Scraper Studio's AI uses this plain-language description both to build the extraction the first time and to repair it later, so specific wording here pays off during self-healing too.

## 3. Verify it against a second URL from the same store

```bash
brightdata scraper run "$COLLECTOR_ID" "<second-product-url>" --pretty
```

Check that `price` comes back as a bare number, `in_stock` as a real boolean, and `image_url` as a full URL. If a field is off, this is the moment to re-run `scraper create` with a sharper description — don't move on to batch mode with a shaky single-URL result.

## 4. Run the full batch

```bash
brightdata scraper run "$COLLECTOR_ID" \
  --input-file scraper/products.json \
  --pretty -o scraper/latest-run.json
```

(If `products.json`'s structure doesn't match what `--input-file` expects, pull just the `urls` array into its own file — `jq '.urls' scraper/products.json > scraper/urls.json` — and point `--input-file` at that instead.)

## 5. Wire it into the backend

Copy `backend/.env.example` to `backend/.env` and set:

```
BRIGHT_DATA_API_TOKEN=<your-api-key>
BRIGHT_DATA_COLLECTOR_ID=<the collector_id from step 2>
DEMO_MODE=false
```

From here, the backend's `POST /api/run` calls the same two endpoints the CLI uses under the hood (`/dca/trigger` and `/dca/dataset`) — see `backend/lib/brightdata.js`.

## 6. Self-healing, manually triggered for a test run

You don't need to wait for a real site redesign to see this work. Pick one field and deliberately ask for the wrong thing, then heal it:

```bash
brightdata scraper heal "$COLLECTOR_ID" \
  "Price returns null — the selector may have moved. Re-capture price and currency from the current page layout." \
  --url "<a-product-url-from-the-list>" \
  --pretty -o scraper/heal.json

# review scraper/heal.json's preview_result, then commit the fix
brightdata scraper approve "$COLLECTOR_ID" \
  --url "<same-product-url>" --pretty -o scraper/approve.json

# confirm it's fixed
brightdata scraper run "$COLLECTOR_ID" "<same-product-url>" --pretty
```

See `docs/SELF_HEALING.md` for how WebGuard's backend automates exactly this loop (`heal` → `approve`) without a human running commands, once it detects a broken field on its own.

## Adding a new store

Each store needs its own collector — a collector's extraction logic is generated around one site's specific markup and will not work on a different site (you'll see failed crawls / null fields if you try to reuse one collector across unrelated domains).

To add a new store:

1. **Pick a real, public product page** from the new site and confirm it's not behind a login/paywall.
2. **Create a collector for it:**
   ```bash
   brightdata scraper create "<a product URL from the new site>" \
     "Extract the product name, current price as a plain number, currency code, whether it's in stock (true/false), and the main product image URL." \
     --name webguard-<store-name>-collector \
     -o scraper/create-<store-name>.json
   ```
3. **Grab the collector_id** from the output, same as before.
4. **Add a new entry to the `stores` array in `scraper/products.json`:**
   ```json
   {
     "name": "Your Store Name",
     "collector_id": "c_xxxxxxxx",
     "urls": [
       { "url": "https://store.com/product-1" },
       { "url": "https://store.com/product-2" }
     ]
   }
   ```
5. **Restart the backend** and hit "Run Scraper Now" — the new store's products will run through its own collector and automatically appear on the dashboard the first time a successful row comes back (WebGuard creates a new tracked product automatically for any URL it hasn't seen before, tagged with the store name).

A store entry with an empty `"collector_id": ""` is skipped automatically on live runs — safe to leave as a placeholder while you're still building that collector.
