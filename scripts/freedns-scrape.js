const https = require("https");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function parseIntEnv(name, fallback) {
  const n = parseInt(process.env[name], 10);
  return Number.isNaN(n) ? fallback : n;
}

const DEFAULT_REGISTRY_URL = "https://freedns.afraid.org/domain/registry/";
const DEFAULT_SORT = "2"; // Status, Age
const DEFAULT_DELAY_MS = 1500;
const DEFAULT_OUTPUT_FILE = path.resolve(__dirname, "..", "data", "freedns-public.txt");
const DEFAULT_USER_AGENT = "lightspeed-freedns-scraper (+https://github.com/xXBlackPlasmaXx/freedns-filter)";
const DEFAULT_ACCEPT_LANGUAGE = "en-US,en;q=0.9";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchPage(url, userAgent, cookie, acceptLanguage = DEFAULT_ACCEPT_LANGUAGE) {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": userAgent,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Encoding": "gzip,deflate",
      "Accept-Language": acceptLanguage,
      Referer: "https://freedns.afraid.org/domain/registry/",
    };
    if (cookie) headers.Cookie = cookie;

    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => {
        chunks.push(chunk);
      });
      res.on("end", () => {
        const bodyBuffer = Buffer.concat(chunks);
        const encoding = (res.headers["content-encoding"] || "").toLowerCase();
        try {
          if (encoding.includes("gzip")) {
            return resolve(zlib.gunzipSync(bodyBuffer).toString());
          }
          if (encoding.includes("deflate")) {
            return resolve(zlib.inflateSync(bodyBuffer).toString());
          }
          return resolve(bodyBuffer.toString());
        } catch (err) {
          return reject(err);
        }
      });
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
  if (!html || html.length < 50) return new Set();
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

  // Fallback: if structured parse fails (0 results), use loose domain regex
  if (set.size === 0) {
    const loose = new Set();
    const regex = /([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
    let m;
    while ((m = regex.exec(html)) !== null) {
      const d = m[1].toLowerCase();
      if (d.length > 3 && d.includes(".")) loose.add(d);
    }
    return loose;
  }

  return set;
}

function buildPageUrl(registryUrl, page, { sort, query, includeSort = true } = {}) {
  try {
    const u = new URL(registryUrl);
    u.searchParams.set("page", String(page));
    if (includeSort && sort) u.searchParams.set("sort", sort);
    if (query) u.searchParams.set("q", query);
    return u.toString();
  } catch (err) {
    const sep = registryUrl.includes("?") ? "&" : "?";
    const base = `${registryUrl}${sep}page=${page}`;
    const sortPart = includeSort && sort ? `&sort=${encodeURIComponent(sort)}` : "";
    const qPart = query ? `&q=${encodeURIComponent(query)}` : "";
    return `${base}${sortPart}${qPart}`;
  }
}

async function scrapeFreeDns(options = {}) {
  const registryUrl = options.registryUrl || process.env.FREEDNS_REGISTRY_URL || DEFAULT_REGISTRY_URL;
  const sort = options.sort ?? process.env.FREEDNS_SORT ?? DEFAULT_SORT;
  const query = options.query ?? process.env.FREEDNS_QUERY ?? "";
  const startPage = options.startPage ?? parseIntEnv("FREEDNS_START_PAGE", 1);
  const endPage = options.endPage ?? parseIntEnv("FREEDNS_END_PAGE", parseIntEnv("FREEDNS_MAX_PAGES", 1));
  const delayMs = options.delayMs ?? parseIntEnv("FREEDNS_DELAY_MS", DEFAULT_DELAY_MS);
  const outputFile = options.outputFile || process.env.FREEDNS_OUTPUT_FILE || DEFAULT_OUTPUT_FILE;
  const userAgent = options.userAgent || process.env.FREEDNS_UA || DEFAULT_USER_AGENT;
  const cookie = options.cookie || process.env.FREEDNS_COOKIE || "";
  const acceptLanguage = options.acceptLanguage || process.env.FREEDNS_ACCEPT_LANGUAGE || DEFAULT_ACCEPT_LANGUAGE;
  const includeSortFallback = options.includeSortFallback !== false;

  const all = new Set();
  for (let page = startPage; page <= endPage; page += 1) {
    const url = buildPageUrl(registryUrl, page, { sort, query, includeSort: true });
    console.log(`Fetching page ${page}: ${url}`);
    const html = await fetchPage(url, userAgent, cookie, acceptLanguage);
    let found = parseDomains(html);
    if (found.size === 0 && includeSortFallback && sort) {
      const fallbackUrl = buildPageUrl(registryUrl, page, { sort: undefined, query, includeSort: false });
      console.log(`No domains found; retrying without sort: ${fallbackUrl}`);
      const html2 = await fetchPage(fallbackUrl, userAgent, cookie, acceptLanguage);
      found = parseDomains(html2);
    }
    console.log(`Found ${found.size} domains on page ${page}`);
    for (const d of found) all.add(d);
    if (page < endPage) await sleep(delayMs);
  }

  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const list = Array.from(all).sort();
  fs.writeFileSync(outputFile, list.join("\n"));
  console.log(`Wrote ${list.length} domains to ${outputFile}`);
  return { domains: list, outputFile };
}

if (require.main === module) {
  scrapeFreeDns().catch((err) => {
    console.error("Scrape failed:", err.message || err);
    process.exit(1);
  });
}

module.exports = { scrapeFreeDns };
