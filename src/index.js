const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const { parseIntOr, ensureDir, loadJson, writeJson, isAllowed } = require("./utils");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_DIR = path.resolve(process.env.LS_CONFIG_DIR || path.join(ROOT, "config"));
const DATA_DIR = path.resolve(process.env.LS_DATA_DIR || path.join(ROOT, "data"));
const OUTPUT_DIR = path.resolve(process.env.LS_OUTPUT_DIR || path.join(ROOT, "output"));

const CATEGORY_FILE = path.join(CONFIG_DIR, "categories.json");
const NEW_CATEGORY_FILE = path.join(CONFIG_DIR, "new-categories.json");
const DEFAULT_DOMAINS_FILE = path.join(DATA_DIR, "domains.txt");
const LEGACY_DOMAINS_FILE = path.join(ROOT, "domains.txt");
const WS_URL =
  "wss://production-gc.lsfilter.com" +
  "?a=0ef9b862-b74f-4e8d-8aad-be549c5f452a" +
  "&customer_id=74-1082-F000" +
  "&agentType=chrome_extension" +
  "&agentVersion=3.777.0" +
  "&userGuid=00000000-0000-0000-0000-000000000000";

ensureDir(CONFIG_DIR);
ensureDir(DATA_DIR);
ensureDir(OUTPUT_DIR);

let categories = loadJson(CATEGORY_FILE, []);
let newCategories = loadJson(NEW_CATEGORY_FILE, {});

function saveNewCategories() {
  try {
    writeJson(NEW_CATEGORY_FILE, newCategories);
  } catch (err) {
    // best-effort persistence for newly discovered categories
  }
}

function recordNewCategory(numKey, host) {
  let dirty = false;
  if (!newCategories[numKey]) {
    newCategories[numKey] = {
      CategoryNumber: numKey,
      CategoryName: "Unknown",
      Allow: false,
      examples: host ? [host] : [],
    };
    dirty = true;
  } else if (host) {
    const entry = newCategories[numKey];
    entry.examples = Array.isArray(entry.examples) ? entry.examples : [];
    if (!entry.examples.includes(host)) {
      entry.examples.push(host);
      dirty = true;
    }
  }
  if (dirty) saveNewCategories();
  return newCategories[numKey];
}

function normalizeHost(input) {
  if (!input) return "";
  try {
    const url = new URL(input.includes("://") ? input : `https://${input}`);
    return url.hostname;
  } catch (err) {
    return input;
  }
}

function lightspeedCategorize(num, host) {
  const numKey = String(num);
  const entry = categories.find((item) => String(item.CategoryNumber) === numKey);
  if (entry) {
    return [entry.CategoryName || "Uncategorized", isAllowed(entry.Allow)];
  }

  const discovered = newCategories[numKey] || recordNewCategory(numKey, host);
  if (!discovered) return [numKey, false];
  return [discovered.CategoryName || numKey, isAllowed(discovered.Allow)];
}

async function lookupDomain(host, { timeoutMs = 5000 } = {}) {
  const hostname = normalizeHost(host);
  if (!hostname) throw new Error("A host is required");

  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(WS_URL);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.terminate();
      reject(new Error("Lookup timed out"));
    }, timeoutMs);

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          action: "dy_lookup",
          host: hostname,
          ip: "174.85.104.135",
          customerId: "74-1082-F000",
        })
      );
    });

    ws.on("message", (msg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.close();
      let json;
      try {
        json = JSON.parse(msg.toString());
      } catch (err) {
        return reject(err);
      }
      const [category, allowed] = lightspeedCategorize(json.cat, hostname);
      resolve({ category, allowed, raw: json });
    });

    ws.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    ws.on("close", () => {
      clearTimeout(timer);
    });
  });
}

async function runLimited(jobs, limit, { onProgress } = {}) {
  const results = new Array(jobs.length);
  let index = 0;
  let done = 0;

  async function worker() {
    while (true) {
      const current = index;
      if (current >= jobs.length) return;
      index += 1;
      results[current] = await jobs[current]();
      done += 1;
      if (onProgress) onProgress(done, jobs.length, results[current]);
    }
  }

  const workers = Array(Math.min(limit, jobs.length)).fill(0).map(() => worker());
  await Promise.all(workers);
  return results;
}

function logCategorySummary(results) {
  const counts = new Map();
  for (const r of results) {
    const key = String(r.raw && r.raw.cat !== undefined ? r.raw.cat : "unknown");
    const name = r.category || "Unknown";
    const entry = counts.get(key) || { name, total: 0, allowed: 0, blocked: 0 };
    entry.name = name;
    entry.total += 1;
    if (r.allowed === true) entry.allowed += 1;
    else entry.blocked += 1;
    counts.set(key, entry);
  }
  const summary = Array.from(counts.entries())
    .map(([cat, info]) => ({ Cat: cat, Name: info.name, Allowed: info.allowed, Blocked: info.blocked, Total: info.total }))
    .sort((a, b) => Number(a.Cat) - Number(b.Cat));
  console.log("\nCategory summary:");
  console.table(summary);
}

function readHosts(domainsArg, filePath) {
  if (domainsArg) {
    return domainsArg
      .split(/[,\n\r]+/)
      .map((h) => h.trim())
      .filter(Boolean);
  }

  const candidateFiles = [filePath, LEGACY_DOMAINS_FILE];
  for (const candidate of candidateFiles) {
    if (!candidate) continue;
    try {
      const raw = fs.readFileSync(candidate, "utf8");
      const hosts = raw
        .split(/[\n\r,]+/)
        .map((h) => h.trim())
        .filter(Boolean);
      if (hosts.length > 0) return hosts;
    } catch (err) {
      // try next
    }
  }
  return [];
}

async function runBulk({ hosts, concurrency, timeoutMs, resultsPath, blockedPath }) {
  const jobs = hosts.map((host) => async () => {
    try {
      const res = await lookupDomain(host, { timeoutMs });
      return { host, ...res };
    } catch (err) {
      return { host, error: err.message || String(err) };
    }
  });

  const isTTY = process.stdout.isTTY;
  const results = await runLimited(jobs, concurrency, {
    onProgress(done, total, result) {
      const host = result.host || "";
      const status = result.allowed ? "\x1b[32m✓\x1b[0m" : result.error ? "\x1b[33m!\x1b[0m" : "\x1b[31m✗\x1b[0m";
      const line = `  [${done}/${total}] ${status} ${host}`;
      if (isTTY) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(line);
      }
    },
  });
  if (isTTY) process.stdout.write("\n");

  logCategorySummary(results);

  const allowed = results.filter((r) => r.allowed === true);
  const blocked = results.filter((r) => r.allowed !== true);

  try {
    writeJson(resultsPath, allowed);
    console.log(`Allowed written to ${resultsPath}`);
  } catch (err) {
    console.error("Failed to write allowed results", err.message || err);
  }

  try {
    writeJson(blockedPath, blocked);
    console.log(`Blocked written to ${blockedPath}`);
  } catch (err) {
    console.error("Failed to write blocked results", err.message || err);
  }

  console.log(`\n  Allowed: ${allowed.length}   Blocked: ${blocked.length}   Total: ${results.length}`);

  return { allowed, blocked, all: results };
}

async function main() {
  const domainsArg = process.env.LS_DOMAINS || process.argv[2] || "";
  const fileArg = process.env.LS_DOMAINS_FILE || process.argv[3] || DEFAULT_DOMAINS_FILE;

  const hosts = readHosts(domainsArg, path.resolve(fileArg));
  if (hosts.length === 0) {
    console.error("No valid domains found. Provide comma/line-separated domains or populate a domains.txt file.");
    process.exit(1);
  }

  const concurrency = parseIntOr(process.env.LS_CONCURRENCY || process.env.CONCURRENCY, 5);
  const timeoutMs = parseIntOr(process.env.LS_TIMEOUT_MS, 5000);
  const resultsPath = path.join(OUTPUT_DIR, "results.json");
  const blockedPath = path.join(OUTPUT_DIR, "blocked.json");

  await runBulk({ hosts, concurrency, timeoutMs, resultsPath, blockedPath });
}

if (require.main === module) {
  main();
}

module.exports = {
  lookupDomain,
  lightspeedCategorize,
  runBulk,
  readHosts,
};
