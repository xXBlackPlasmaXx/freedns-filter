const https = require("https");
const fs = require("fs");
const path = require("path");

function parseIntEnv(name, fallback) {
  const n = parseInt(process.env[name], 10);
  return Number.isNaN(n) ? fallback : n;
}

const REGISTRY_URL = process.env.FREEDNS_REGISTRY_URL || "https://freedns.afraid.org/domain/registry/";
const SORT_PARAM = process.env.FREEDNS_SORT || "2"; // 2 = Status, Age on freedns
const QUERY_PARAM = process.env.FREEDNS_QUERY || "";
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

function parseAgeToSeconds(text) {
  if (!text) return Number.MAX_SAFE_INTEGER;
  let total = 0;
  const regex = /(\d+)\s*([smhdw])/gi;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const val = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    if (unit === "s") total += val;
    else if (unit === "m") total += val * 60;
    else if (unit === "h") total += val * 3600;
    else if (unit === "d") total += val * 86400;
    else if (unit === "w") total += val * 604800;
  }
  return total === 0 ? Number.MAX_SAFE_INTEGER : total;
}

function parseDomains(html) {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const entries = [];
  for (const row of rows) {
    const cols = Array.from(row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((m) => m[1]);
    if (cols.length < 3) continue;
    const domainMatch = (cols[0].match(/>([^<>\s]+\.[^<>\s]+)</) || [])[1];
    if (!domainMatch) continue;
    const statusText = cols.join(" ").toLowerCase();
    if (!statusText.includes("public")) continue; // only public domains
    const ageText = cols[cols.length - 1].replace(/<[^>]+>/g, " ").trim();
    entries.push({ domain: domainMatch.toLowerCase(), ageSeconds: parseAgeToSeconds(ageText) });
  }
  // Sort by status (all public) then age ascending (oldest first)
  entries.sort((a, b) => a.ageSeconds - b.ageSeconds || a.domain.localeCompare(b.domain));
  const set = new Set(entries.map((e) => e.domain));
  return set;
}

function buildPageUrl(page, { includeSort = true } = {}) {
  try {
    const u = new URL(REGISTRY_URL);
    u.searchParams.set("page", String(page));
    if (includeSort && SORT_PARAM) u.searchParams.set("sort", SORT_PARAM);
    if (QUERY_PARAM) u.searchParams.set("q", QUERY_PARAM);
    return u.toString();
  } catch (err) {
    const sep = REGISTRY_URL.includes("?") ? "&" : "?";
    const base = `${REGISTRY_URL}${sep}page=${page}`;
    const sortPart = includeSort && SORT_PARAM ? `&sort=${encodeURIComponent(SORT_PARAM)}` : "";
    const qPart = QUERY_PARAM ? `&q=${encodeURIComponent(QUERY_PARAM)}` : "";
    return `${base}${sortPart}${qPart}`;
  }
}

async function scrape() {
  const all = new Set();
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = buildPageUrl(page, { includeSort: true });
    console.log(`Fetching page ${page}: ${url}`);
    const html = await fetchPage(url);
    let found = parseDomains(html);
    if (found.size === 0 && SORT_PARAM) {
      const fallbackUrl = buildPageUrl(page, { includeSort: false });
      console.log(`No domains found; retrying without sort: ${fallbackUrl}`);
      const html2 = await fetchPage(fallbackUrl);
      found = parseDomains(html2);
    }
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
