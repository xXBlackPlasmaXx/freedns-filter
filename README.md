# FreeDNS Filter Helper

Node.js tool to bulk-check domains against Lightspeed, capture categories, and keep mappings editable.

## Quick start
```bash
npm install
npm start
```

## FreeDNS registry scrape (optional)
- Respect FreeDNS robots.txt and ToS. Current disallows: `/zc.php`, `/tools/contact.php`, `/subdomain/edit.php`, `/password/`. The registry page is allowed.
- Fetch public domains into `data/freedns-public.txt`:
```bash
npm run scrape:freedns
```
- Env knobs: `FREEDNS_REGISTRY_URL` (default https://freedns.afraid.org/domain/registry/), `FREEDNS_MAX_PAGES` (default 1), `FREEDNS_DELAY_MS` (default 1500), `FREEDNS_OUTPUT_FILE` (default data/freedns-public.txt), `FREEDNS_UA` to override User-Agent.
- Then point the checker at the scraped list: `LS_DOMAINS_FILE=data/freedns-public.txt npm start`.

## Inputs
- Domain list: edit `data/domains.txt` (comma or newline separated), or set `LS_DOMAINS="a.com,b.com"`, or point to a file with `LS_DOMAINS_FILE=./my-domains.txt`.
- Category map: edit `config/categories.json` (CategoryNumber, CategoryName, Allow).

## What happens
- Looks up each domain via Lightspeed.
- Splits results into allowed and blocked.
- Records any unknown category IDs into `config/new-categories.json` with example hosts for later labeling.

## Outputs
- Allowed: `output/results.json`
- Blocked: `output/blocked.json`
- Unknown categories collected in: `config/new-categories.json`

## Tunables (env vars)
- `LS_CONCURRENCY` (default 5): parallel lookups.
- `LS_TIMEOUT_MS` (default 5000): per-lookup timeout in ms.
- `LS_CONFIG_DIR`, `LS_DATA_DIR`, `LS_OUTPUT_DIR`: override folders if you want a different layout.

## Folder map
- `src/index.js` — main runner (lookup + bulk).
- `config/` — editable category mappings and discovered categories.
- `data/` — domain list input.
- `output/` — generated results (git-ignored).

## Typical edits
- Add or change categories in `config/categories.json`.
- Approve/rename discovered categories in `config/new-categories.json` by setting `CategoryName` and `Allow`.
- Swap the domain list in `data/domains.txt` or pass `LS_DOMAINS`/`LS_DOMAINS_FILE`.

## Notes
- Keep category data in `config/`; no hardcoding needed.
- Outputs are ignored by git so the repo stays clean.
