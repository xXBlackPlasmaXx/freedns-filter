const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const categoriesPath = path.join(__dirname, "json", "lightspeed.json");
const newCategoriesPath = path.join(__dirname, "json", "new-categories.json");

let lightspeedjson = [];
let newCategories = {};

try {
  lightspeedjson = JSON.parse(fs.readFileSync(categoriesPath, "utf8"));
} catch (err) {
  lightspeedjson = [];
}

try {
  newCategories = JSON.parse(fs.readFileSync(newCategoriesPath, "utf8"));
} catch (err) {
  newCategories = {};
}

function saveNewCategories() {
  try {
    fs.writeFileSync(newCategoriesPath, JSON.stringify(newCategories, null, 2));
  } catch (err) {
    // best-effort persistence
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
  const entry = lightspeedjson.find(
    (item) => String(item.CategoryNumber) === numKey
  );
  if (entry) {
    return [entry.CategoryName || "Uncategorized", entry.Allow === 1 || entry.Allow === true];
  }

  const discovered = newCategories[numKey] || recordNewCategory(numKey, host);
  if (!discovered) return [numKey, false];
  return [discovered.CategoryName || numKey, discovered.Allow === true || discovered.Allow === 1];
}

async function lookupDomain(host, { timeoutMs = 5000 } = {}) {
  const hostname = normalizeHost(host);
  if (!hostname) throw new Error("A host is required");

  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(
      "wss://production-gc.lsfilter.com?a=0ef9b862-b74f-4e8d-8aad-be549c5f452a&customer_id=74-1082-F000&agentType=chrome_extension&agentVersion=3.777.0&userGuid=00000000-0000-0000-0000-000000000000"
    );

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

module.exports = { lookupDomain, lightspeedCategorize };
