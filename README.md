# FreeDNS Filter Helper

Scrape FreeDNS public domains and bulk-check them against Lightspeed filter categories.

## Quick start

```bash
npm install
npm run cli          # interactive scrape + check
npm run cli:help     # show all flags & env vars
```

## CLI usage

Run `npm run cli` to walk through an interactive session, or pass flags for automation:

```bash
npm run cli -- --start 1 --end 2 --cookie "DNSID=...; ..." --no-prompt
```

| Flag | Description |
|------|-------------|
| `-s, --start <page>` | Start page for FreeDNS scrape (default: 1) |
| `-e, --end <page>` | End page (default: same as start) |
| `-c, --cookie <str>` | FreeDNS session cookie |
| `-d, --domains-file <path>` | Check domains from a file instead of scraping |
| `--no-prompt` | Run non-interactively with defaults / flags |
| `-h, --help` | Show built-in help |

### Outputs

| File | Contents |
|------|----------|
| `data/freedns-public.txt` | Scraped domain list |
| `output/results.json` | Allowed domains |
| `output/blocked.json` | Blocked domains |
| `config/new-categories.json` | Newly discovered categories |

## FreeDNS scrape only

```bash
npm run scrape:freedns
```

Defaults: registry `https://freedns.afraid.org/domain/registry/`, sort `2` (Status, Age), delay 1500 ms.
Gzip/deflate, Referer, and Accept-Language headers are set automatically; session cookie is passed when provided.

## Standalone lookup

```bash
npm start                           # reads data/domains.txt
LS_DOMAINS="a.com,b.com" npm start  # inline list
```

## Inputs

- **Domains** — edit `data/domains.txt` (comma or newline separated), set `LS_DOMAINS="a.com,b.com"`, or point to a file with `LS_DOMAINS_FILE=./my-domains.txt`.
- **Categories** — edit `config/categories.json` (`CategoryNumber`, `CategoryName`, `Allow`). Unknown IDs are auto-captured into `config/new-categories.json` with example hosts.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `LS_CONCURRENCY` | 5 | Parallel lookups |
| `LS_TIMEOUT_MS` | 5000 | Per-lookup timeout (ms) |
| `LS_CONFIG_DIR` | `config/` | Override config folder |
| `LS_DATA_DIR` | `data/` | Override data folder |
| `LS_OUTPUT_DIR` | `output/` | Override output folder |
| `FREEDNS_REGISTRY_URL` | *(default registry)* | Custom registry URL |
| `FREEDNS_SORT` | 2 | Sort value |
| `FREEDNS_QUERY` | *(empty)* | Search query |
| `FREEDNS_MAX_PAGES` | 1 | Max pages to scrape |
| `FREEDNS_DELAY_MS` | 1500 | Delay between pages (ms) |
| `FREEDNS_OUTPUT_FILE` | `data/freedns-public.txt` | Scrape output path |
| `FREEDNS_UA` | *(built-in)* | Custom User-Agent |
| `FREEDNS_ACCEPT_LANGUAGE` | `en-US,en;q=0.9` | Accept-Language header |
| `FREEDNS_COOKIE` | *(empty)* | Session cookie |

## Project structure

```
src/
  index.js          Main lookup engine & bulk runner
  utils.js          Shared helpers (parseIntOr, ensureDir, loadJson, …)
scripts/
  cli.js            Interactive / non-interactive scraper + checker
  freedns-scrape.js Standalone FreeDNS scraper
config/
  categories.json   Editable category map
  new-categories.json Auto-discovered categories
data/
  domains.txt       Domain input list
  freedns-public.txt Scraped domains
output/             Generated results (git-ignored)
```

## Typical edits

1. Update allow/block rules in `config/categories.json`.
2. Review & rename entries in `config/new-categories.json`.
3. Swap the domain list via `data/domains.txt`, `LS_DOMAINS`, or `LS_DOMAINS_FILE`.
