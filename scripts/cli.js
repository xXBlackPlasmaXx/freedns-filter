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

async function promptText(question, fallback, skip) {
  if (skip || !process.stdin.isTTY) return fallback;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  const trimmed = answer.trim();
  if (!trimmed && fallback !== undefined) return fallback;
  return trimmed;
}

async function main() {
  ensureDir(DATA_DIR);
  ensureDir(OUTPUT_DIR);

  const cliArgs = parseArgs(process.argv);
  const envStart = parseIntOr(process.env.FREEDNS_START_PAGE, undefined);
  const envEnd = parseIntOr(process.env.FREEDNS_END_PAGE, undefined);
  const envCookie = process.env.FREEDNS_COOKIE || "";
  const defaultRegistry = process.env.FREEDNS_REGISTRY_URL;
  const defaultSort = process.env.FREEDNS_SORT;
  const defaultQuery = process.env.FREEDNS_QUERY || "";
  const defaultDelay = parseIntOr(process.env.FREEDNS_DELAY_MS, 1500);
  const defaultOutputFile = process.env.FREEDNS_OUTPUT_FILE || SCRAPE_OUTPUT;
  const defaultConcurrency = parseIntOr(process.env.LS_CONCURRENCY || process.env.CONCURRENCY, 5);
  const defaultTimeout = parseIntOr(process.env.LS_TIMEOUT_MS, 5000);

  const domainsFilePrompt = await promptText(
    "Domains file to check instead of scraping (leave blank to scrape FreeDNS): ",
    cliArgs.domainsFile || "",
    cliArgs.noPrompt
  );
  const domainsFile = domainsFilePrompt || cliArgs.domainsFile;

  // If a domains file is provided, skip scraping and go straight to checks.
  if (domainsFile) {
    const domains = readDomainsFile(domainsFile);
    if (!domains.length) {
      console.error(`No domains found in ${domainsFile}`);
      process.exit(1);
    }
    console.log(`Loaded ${domains.length} domains from ${domainsFile}; skipping FreeDNS scrape.`);

    const concurrency = await prompt(
      `Lookup concurrency (default ${defaultConcurrency}): `,
      defaultConcurrency,
      cliArgs.noPrompt
    );
    const timeoutMs = await prompt(
      `Per-lookup timeout ms (default ${defaultTimeout}): `,
      defaultTimeout,
      cliArgs.noPrompt
    );

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

  const startPage = await prompt("Start page (default 1): ", cliArgs.startPage ?? envStart ?? 1, cliArgs.noPrompt);
  const endPageRaw = await prompt(
    `End page (default ${startPage}): `,
    cliArgs.endPage ?? envEnd ?? startPage,
    cliArgs.noPrompt
  );
  const endPage = parseIntOr(endPageRaw, startPage);
  const safeEnd = endPage < startPage ? startPage : endPage;

  const registryUrl = await promptText(
    "Registry URL (default https://freedns.afraid.org/domain/registry/): ",
    defaultRegistry || "https://freedns.afraid.org/domain/registry/",
    cliArgs.noPrompt
  );

  const sort = await promptText("Sort value (default 2 = Status, Age): ", defaultSort || "2", cliArgs.noPrompt);
  const query = await promptText("Search query (default empty): ", defaultQuery, cliArgs.noPrompt);

  const outputFile = await promptText(
    `Output file for scraped domains (default ${defaultOutputFile}): `,
    defaultOutputFile,
    cliArgs.noPrompt
  );

  const delayMs = await prompt("Delay between pages ms (default 1500): ", defaultDelay, cliArgs.noPrompt);

  let cookie = cliArgs.cookie ?? envCookie;
  if (!cookie)
    cookie = await promptText("Session cookie (paste if logged-in; leave blank if public pages work): ", "", cliArgs.noPrompt);

  console.log(`Scraping FreeDNS pages ${startPage} to ${safeEnd} (public domains only)...`);
  const { domains } = await scrapeFreeDns({
    startPage,
    endPage: safeEnd,
    outputFile,
    cookie,
    registryUrl,
    sort,
    query,
    delayMs,
  });

  if (!domains || domains.length === 0) {
    console.error("No domains scraped. Aborting check.");
    process.exit(1);
  }

  const concurrency = await prompt(
    `Lookup concurrency (default ${defaultConcurrency}): `,
    defaultConcurrency,
    cliArgs.noPrompt
  );
  const timeoutMs = await prompt(
    `Per-lookup timeout ms (default ${defaultTimeout}): `,
    defaultTimeout,
    cliArgs.noPrompt
  );

  console.log(`Running domain checks for ${domains.length} domains...`);
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
