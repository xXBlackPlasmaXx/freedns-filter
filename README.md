# FreeDNS Filter Helper

Minimal Node.js helper to bulk-check domains against Lightspeed and record category decisions.

## What’s here
- `src/index.js`: single entry point (lookup + bulk runner).
- `config/categories.json`: editable allow/block map by category ID.
- `config/new-categories.json`: auto-populated with unknown category IDs and example hosts; edit this to name/allow new categories.
- `data/domains.txt`: sample domains list; replace with your own.
- `output/`: generated results (`results.json`, `blocked.json`) on each run (git-ignored).

## Setup
```bash
npm install
```

## Run
- Use sample domains file:
```bash
npm start
```
- Override domains inline:
```bash
LS_DOMAINS="example.com,wikipedia.org" npm start
```
- Point to a different file:
```bash
LS_DOMAINS_FILE=./my-domains.txt npm start
```

## Config knobs
- `LS_CONCURRENCY` (default 5): parallel lookups.
- `LS_TIMEOUT_MS` (default 5000): per-lookup timeout.
- `LS_CONFIG_DIR`, `LS_DATA_DIR`, `LS_OUTPUT_DIR`: override default folders if needed.

## Outputs
- Allowed: `output/results.json`
- Blocked: `output/blocked.json`
- Unknown categories are appended to `config/new-categories.json` with examples; edit `CategoryName`/`Allow` to teach the tool.

## Housekeeping
- `node_modules/` and `output/` are git-ignored.
- Keep category mappings editable in `config/` rather than hardcoding.
- Replace `data/domains.txt` with your real list; it’s just a placeholder.
