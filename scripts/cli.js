const path = require("path");
const fs = require("fs");
const readline = require("readline");
const { scrapeFreeDns } = require("./freedns-scrape");
const { runBulk } = require("../src/index");

function parseIntOr(val, fallback) {
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? fallback : n;
}

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.resolve(process.env.LS_DATA_DIR || path.join(ROOT, "data"));
const OUTPUT_DIR = path.resolve(process.env.LS_OUTPUT_DIR || path.join(ROOT, "output"));

const SCRAPE_OUTPUT = path.join(DATA_DIR, "freedns-public.txt");
const RESULTS_PATH = path.join(OUTPUT_DIR, "results.json");
const BLOCKED_PATH = path.join(OUTPUT_DIR, "blocked.json");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function prompt(question, fallback) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  const trimmed = answer.trim();
  if (!trimmed && fallback !== undefined) return fallback;
  const n = parseInt(trimmed, 10);
  return Number.isNaN(n) ? fallback : n;
}

async function main() {
  ensureDir(DATA_DIR);
  ensureDir(OUTPUT_DIR);

  const startPage = await prompt("Start page (default 1): ", 1);
  const endPage = await prompt(`End page (default ${startPage}): `, startPage);
  const safeEnd = endPage < startPage ? startPage : endPage;

  console.log(`Scraping FreeDNS pages ${startPage} to ${safeEnd} (public domains only)...`);
  const { domains, outputFile } = await scrapeFreeDns({
    startPage,
    endPage: safeEnd,
    outputFile: SCRAPE_OUTPUT,
  });

  if (!domains || domains.length === 0) {
    console.error("No domains scraped. Aborting check.");
    process.exit(1);
  }

  console.log(`Running domain checks for ${domains.length} domains...`);
  const concurrency = parseIntOr(process.env.LS_CONCURRENCY || process.env.CONCURRENCY, 5);
  const timeoutMs = parseIntOr(process.env.LS_TIMEOUT_MS, 5000);

  await runBulk({
    hosts: domains,
    concurrency,
    timeoutMs,
    resultsPath: RESULTS_PATH,
    blockedPath: BLOCKED_PATH,
  });

  console.log("Done. See output/results.json (allowed) and output/blocked.json (blocked).");
}

main().catch((err) => {
  console.error("CLI failed:", err.message || err);
  process.exit(1);
});
