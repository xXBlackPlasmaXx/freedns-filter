# FreeDNS Filter Helper

Node.js tool to scrape FreeDNS public domains and bulk-check them against Lightspeed with editable category mappings.

## Quick start
- Install deps and run the combined scraper + checker:
```bash
npm install
npm run cli
```

## CLI (scrape + check)
- Command: `npm run cli`
- Prompts for start/end pages unless provided via flags or env; cookies are optional and only needed if the registry requires login.
- Outputs: [data/freedns-public.txt](data/freedns-public.txt), [output/results.json](output/results.json) (allowed), [output/blocked.json](output/blocked.json) (blocked).
- Flags: `--start/-s`, `--end/-e`, `--cookie/-c`, `--domains-file/-d`, `--no-prompt` (skip prompts, use defaults/env/flags).
- Example non-interactive run:
```bash
npm run cli -- --start 1 --end 2 --cookie "DNSID=...; ..." --no-prompt
```

## FreeDNS scrape only
- Command: `npm run scrape:freedns`
- Defaults: registry https://freedns.afraid.org/domain/registry/, sort `2` (Status, Age), delay 1500 ms, output [data/freedns-public.txt](data/freedns-public.txt).
- Env knobs: `FREEDNS_REGISTRY_URL`, `FREEDNS_SORT`, `FREEDNS_QUERY`, `FREEDNS_MAX_PAGES`, `FREEDNS_DELAY_MS`, `FREEDNS_OUTPUT_FILE`, `FREEDNS_UA`, `FREEDNS_ACCEPT_LANGUAGE`, `FREEDNS_COOKIE`.
- Gzip/deflate, Referer, and Accept-Language headers are set; session cookie is passed if provided.

## Inputs
- Domains: edit [data/domains.txt](data/domains.txt) (comma or newline separated), or set `LS_DOMAINS="a.com,b.com"`, or point to a file with `LS_DOMAINS_FILE=./my-domains.txt`.
- Categories: edit [config/categories.json](config/categories.json) (CategoryNumber, CategoryName, Allow). Unknown IDs are captured into [config/new-categories.json](config/new-categories.json) with example hosts.

## Outputs
- Scraped list: [data/freedns-public.txt](data/freedns-public.txt)
- Allowed results: [output/results.json](output/results.json)
- Blocked results: [output/blocked.json](output/blocked.json)
- Newly seen categories: [config/new-categories.json](config/new-categories.json)

## Tunables (env)
- `LS_CONCURRENCY` (default 5) — parallel lookups
- `LS_TIMEOUT_MS` (default 5000) — per-lookup timeout in ms
- `LS_CONFIG_DIR`, `LS_DATA_DIR`, `LS_OUTPUT_DIR` — override folders
- FreeDNS scrape: `FREEDNS_*` and `FREEDNS_COOKIE`

## Folder map
- [src/index.js](src/index.js) — main lookup + bulk runner
- [scripts/cli.js](scripts/cli.js) — interactive/non-interactive scraper + checker
- [scripts/freedns-scrape.js](scripts/freedns-scrape.js) — standalone scraper
- [config/](config) — category maps (editable and discovered)
- [data/](data) — domain inputs
- [output/](output) — generated results (git-ignored)

## Typical edits
- Update categories in [config/categories.json](config/categories.json)
- Approve/rename discovered categories in [config/new-categories.json](config/new-categories.json)
- Swap domain list via [data/domains.txt](data/domains.txt), `LS_DOMAINS`, or `LS_DOMAINS_FILE`
