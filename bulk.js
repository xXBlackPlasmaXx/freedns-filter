const fs = require("fs");
const path = require("path");
const { lookupDomain } = require("./lightspeed");

function logCategorySummary(results) {
  const counts = new Map();
  for (const r of results) {
    const key = String(r.raw && r.raw.cat !== undefined ? r.raw.cat : "unknown");
    const name = r.category || "Unknown";
    const entry = counts.get(key) || { name, total: 0, allowed: 0 };
    entry.name = name;
    entry.total += 1;
    if (r.allowed === true) entry.allowed += 1;
    counts.set(key, entry);
  }
  const summary = Array.from(counts.entries())
    .map(([cat, info]) => ({ cat, name: info.name, total: info.total, allowed: info.allowed }))
    .sort((a, b) => Number(a.cat) - Number(b.cat));
  console.log("Category summary:");
  console.log(JSON.stringify(summary, null, 2));
}

function parseIntOr(val, fallback) {
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? fallback : n;
}

async function runLimited(jobs, limit) {
  const results = new Array(jobs.length);
  let index = 0;

  async function worker() {
    while (true) {
      const current = index;
      if (current >= jobs.length) return;
      index += 1;
      results[current] = await jobs[current]();
    }
  }

  const workers = Array(Math.min(limit, jobs.length)).fill(0).map(() => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  const input = process.argv[2] || "";
  const fileArg = process.argv[3];

  let hosts = [];
  if (input) {
    hosts = input.split(",").map((h) => h.trim()).filter(Boolean);
  } else {
    const domainsPath = fileArg
      ? path.resolve(fileArg)
      : path.join(process.cwd(), "domains.txt");
    try {
      const raw = fs.readFileSync(domainsPath, "utf8");
      hosts = raw
        .split(/[,\n\r]+/)
        .map((h) => h.trim())
        .filter(Boolean);
      if (hosts.length === 0) {
        console.error(`No domains found in ${domainsPath}`);
        process.exit(1);
      }
    } catch (err) {
      console.error(
        "Provide domains separated by commas, e.g. node bulk.js \"a.com,b.com\" or place them in domains.txt (one per line or comma-separated)."
      );
      process.exit(1);
    }
  }

  if (hosts.length === 0) {
    console.error("No valid domains found in input.");
    process.exit(1);
  }

  const concurrency = parseIntOr(process.env.LS_CONCURRENCY || process.env.CONCURRENCY, 5);
  const timeoutMs = parseIntOr(process.env.LS_TIMEOUT_MS, 5000);

  const jobs = hosts.map((host) => async () => {
    try {
      const res = await lookupDomain(host, { timeoutMs });
      return { host, ...res };
    } catch (err) {
      return { host, error: err.message || String(err) };
    }
  });

  const results = await runLimited(jobs, concurrency);

  logCategorySummary(results);

  const allowed = results.filter((r) => r.allowed === true);
  const blocked = results.filter((r) => r.allowed !== true);

  const allowedPath = path.join(process.cwd(), "results.json");
  const blockedPath = path.join(process.cwd(), "blocked.json");

  try {
    fs.writeFileSync(allowedPath, JSON.stringify(allowed, null, 2));
    console.log(`Allowed written to ${allowedPath}`);
  } catch (err) {
    console.error("Failed to write results.json", err.message || err);
  }

  try {
    fs.writeFileSync(blockedPath, JSON.stringify(blocked, null, 2));
    console.log(`Blocked written to ${blockedPath}`);
  } catch (err) {
    console.error("Failed to write blocked.json", err.message || err);
  }

  console.log("Allowed results:");
  console.log(JSON.stringify(allowed, null, 2));
}

main();
