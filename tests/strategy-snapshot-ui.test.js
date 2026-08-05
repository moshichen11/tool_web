const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("strategy selection view loads static snapshots without replacing daily-K loaders", () => {
  assert.match(html, /name: "策略选股"/);
  assert.match(html, /\.\/data\/strategy-selection\/latest\.json/);
  assert.match(html, /\.\/data\/strategy-selection\/status\.json/);
  assert.match(html, /短线候选（1–5 日）/);
  assert.match(html, /波段候选（1–4 周）/);
  assert.match(html, /function loadRealStockHistory/);
  assert.match(html, /data-strategy-candidate/);
});
