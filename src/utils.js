const fs = require("fs");

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

module.exports = { parseIntOr, ensureDir, loadJson, writeJson, isAllowed };
