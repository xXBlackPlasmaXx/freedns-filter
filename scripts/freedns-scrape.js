const https = require("https");
const fs = require("fs");
const path = require("path");

function parseIntEnv(name, fallback) {
  const n = parseInt(process.env[name], 10);
  return Number.isNaN(n) ? fallback : n;
}

const REGISTRY_URL = process.env.FREEDNS_REGISTRY_URL || "https://freedns.afraid.org/domain/registry/";
const MAX_PAGES = parseIntEnv("FREEDNS_MAX_PAGES", 1);
const DELAY_MS = parseIntEnv("FREEDNS_DELAY_MS", 1500);
const OUTPUT_FILE = process.env.FREEDNS_OUTPUT_FILE || path.resolve(__dirname, "..", "data", "freedns-public.txt");
const USER_AGENT = process.env.FREEDNS_UA || "lightspeed-freedns-scraper (+https://github.com/xXBlackPlasmaXx/freedns-filter)";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": USER_AGENT } }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      let data = "";
      res.on("data", (chunk) => {
        data += chunk.toString();
      });
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
  });
}

function parseDomains(html) {
  const set = new Set();
  const regex = /([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const domain = match[1].toLowerCase();
    if (domain.length > 3 && domain.includes(".")) {
      set.add(domain);
    }
  }
  return set;
}

async function scrape() {
  const all = new Set();
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = page === 1 ? REGISTRY_URL : `${REGISTRY_URL}${REGISTRY_URL.includes("?") ? "&" : "?"}page=${page}`;
    console.log(`Fetching page ${page}: ${url}`);
    const html = await fetchPage(url);
    const found = parseDomains(html);
    console.log(`Found ${found.size} domains on page ${page}`);
    for (const d of found) all.add(d);
    if (page < MAX_PAGES) await sleep(DELAY_MS);
  }

  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const list = Array.from(all).sort();
  fs.writeFileSync(OUTPUT_FILE, list.join("\n"));
  console.log(`Wrote ${list.length} domains to ${OUTPUT_FILE}`);
}

scrape().catch((err) => {
  console.error("Scrape failed:", err.message || err);
  process.exit(1);
});
