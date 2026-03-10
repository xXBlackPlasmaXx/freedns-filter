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

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    const val = argv[i + 1];
    if (a === "--start" || a === "-s") {
      args.startPage = parseIntOr(val, undefined);
      i += 1;
    } else if (a === "--end" || a === "-e") {
      args.endPage = parseIntOr(val, undefined);
      i += 1;
    } else if (a === "--cookie" || a === "-c") {
      args.cookie = val || "";
      i += 1;
    } else if (a === "--domains-file" || a === "-d") {
      args.domainsFile = val;
      i += 1;
    } else if (a === "--no-prompt" || a === "--yes" || a === "--non-interactive") {
      args.noPrompt = true;
    }
  }
  return args;
}

function readDomainsFile(filePath) {
  const abs = path.resolve(filePath);
  const raw = fs.readFileSync(abs, "utf8");
  return raw
    .split(/[,\n\r]+/)
    .map((h) => h.trim())
    .filter(Boolean);
}

async function prompt(question, fallback, skip) {
  if (skip || !process.stdin.isTTY) return fallback;
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

  const cliArgs = parseArgs(process.argv);
  const envStart = parseIntOr(process.env.FREEDNS_START_PAGE, undefined);
  const envEnd = parseIntOr(process.env.FREEDNS_END_PAGE, undefined);
  const envCookie = process.env.FREEDNS_COOKIE || "";
  const domainsFileArg = cliArgs.domainsFile;

  // If a domains file is provided, skip scraping and go straight to checks.
  if (domainsFileArg) {
    const domains = readDomainsFile(domainsFileArg);
    if (!domains.length) {
      console.error(`No domains found in ${domainsFileArg}`);
      process.exit(1);
    }
    console.log(`Loaded ${domains.length} domains from ${domainsFileArg}; skipping FreeDNS scrape.`);

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
    return;
  }

  const startPage =
    cliArgs.startPage ?? envStart ?? (await prompt("Start page (default 1): ", 1, cliArgs.noPrompt));
  const endPageRaw =
    cliArgs.endPage ?? envEnd ?? (await prompt(`End page (default ${startPage}): `, startPage, cliArgs.noPrompt));
  const endPage = parseIntOr(endPageRaw, startPage);
  const safeEnd = endPage < startPage ? startPage : endPage;

  let cookie = cliArgs.cookie ?? envCookie;
  if (!cookie) cookie = await prompt("Session cookie (paste if logged-in, blank to skip): ", "", cliArgs.noPrompt);

  console.log(`Scraping FreeDNS pages ${startPage} to ${safeEnd} (public domains only)...`);
  const { domains, outputFile } = await scrapeFreeDns({
    startPage,
    endPage: safeEnd,
    outputFile: SCRAPE_OUTPUT,
    cookie,
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
