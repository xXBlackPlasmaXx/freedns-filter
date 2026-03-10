const fs = require("fs");
const path = require("path");
const { loadJson } = require("../src/utils");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.resolve(process.env.LS_OUTPUT_DIR || path.join(ROOT, "output"));

const resultsPath = path.join(OUTPUT_DIR, "results.json");
const outPath = path.join(OUTPUT_DIR, "allowed-domains.txt");

const results = loadJson(resultsPath, []);
const domains = results.map((r) => r.host).filter(Boolean).sort();

fs.writeFileSync(outPath, domains.join("\n") + "\n");
console.log(`Wrote ${domains.length} domains to ${outPath}`);
