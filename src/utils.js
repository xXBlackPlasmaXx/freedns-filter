const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/**
 * Parse a value as an integer, returning `fallback` when the value is not a
 * finite number.
 */
function parseIntOr(val, fallback) {
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? fallback : n;
}

/** Recursively create a directory if it doesn't already exist. */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Read and parse a JSON file, returning `fallback` on any error. */
function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

/** Write a value to a JSON file with pretty-printing. */
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

/** Normalize an Allow field that may be `true`, `1`, or something else. */
function isAllowed(val) {
  return val === true || val === 1;
}

/**
 * Load an existing JSON array from `file`, merge `newEntries` by `keyField`
 * (newer entries win), and write the merged array back.
 */
function mergeAndWriteJsonArray(file, newEntries, keyField) {
  const existing = loadJson(file, []);
  const map = new Map();
  for (const entry of existing) map.set(entry[keyField], entry);
  for (const entry of newEntries) map.set(entry[keyField], entry);
  const merged = Array.from(map.values());
  writeJson(file, merged);
  return merged;
}

/** Bump the patch version in package.json and return the new version string. */
function bumpVersion(rootDir) {
  const pkgPath = path.join(rootDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const parts = (pkg.version || "1.0.0").split(".").map(Number);
  parts[2] = (parts[2] || 0) + 1;
  pkg.version = parts.join(".");
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  return pkg.version;
}

/** Stage changed output/config files, bump version, and commit. */
function autoCommit(rootDir, { allowed = 0, blocked = 0 } = {}) {
  try {
    const version = bumpVersion(rootDir);
    execSync("git add output/ config/ data/ package.json", { cwd: rootDir, stdio: "ignore" });
    const msg = `results: +${allowed} allowed, +${blocked} blocked (v${version})`;
    execSync(`git commit -m "${msg}"`, { cwd: rootDir, stdio: "ignore" });
    console.log(`Committed: ${msg}`);
    return true;
  } catch (err) {
    console.error("Auto-commit skipped:", err.message || err);
    return false;
  }
}

module.exports = { parseIntOr, ensureDir, loadJson, writeJson, isAllowed, mergeAndWriteJsonArray, bumpVersion, autoCommit };
