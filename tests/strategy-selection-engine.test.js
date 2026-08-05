const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "stocks", "strategy-selection-config.json"), "utf8"));

function bars(values) {
  return values.map((close, index) => ({
    time: `2026-07-${String(index + 1).padStart(2, "0")}`,
    open: Number((close - 0.08).toFixed(2)),
    high: Number((close + 0.14).toFixed(2)),
    low: Number((close - 0.16).toFixed(2)),
    close,
    volume: 100_000 + index * 2_000,
    amount: 1_200_000_000 + index * 10_000_000,
  }));
}

function stock(overrides = {}) {
  const dailyK = bars([10, 10.03, 10.08, 10.14, 10.18, 10.24, 10.3, 10.36, 10.42, 10.48, 10.55, 10.63, 10.72, 10.82, 10.93, 11.05, 11.16, 11.27, 11.4, 11.55, 11.72, 11.9, 12.08, 12.28, 12.5]);
  dailyK[dailyK.length - 1] = { ...dailyK.at(-1), open: 12.18, high: 12.72, low: 12.08, close: 12.62, volume: 260_000, amount: 3_100_000_000 };
  return {
    id: "SH:600001",
    market: "SH",
    code: "600001",
    name: "样本股份",
    industry: "机械设备",
    boardType: "main",
    status: "normal",
    amount: 3_100_000_000,
    volume: 260_000,
    dailyK,
    ...overrides,
  };
}

test("strategy eligibility excludes ST, paused and non-main-board stocks", async () => {
  const { isStrategyEligible } = await import("../src/stocks/strategy-selection-engine.mjs");
  assert.equal(isStrategyEligible(stock()), true);
  assert.equal(isStrategyEligible(stock({ name: "*ST 样本" })), false);
  assert.equal(isStrategyEligible(stock({ status: "suspended" })), false);
  assert.equal(isStrategyEligible(stock({ boardType: "gem" })), false);
});

test("strategy snapshot separates explainable short-term and swing candidates", async () => {
  const { buildStrategySnapshot } = await import("../src/stocks/strategy-selection-engine.mjs");
  const result = buildStrategySnapshot({
    stocks: [stock(), stock({ id: "SZ:000002", market: "SZ", code: "000002", name: "样本二号", industry: "电子" })],
    config,
    dataDate: "2026-08-04",
    generatedAt: "2026-08-04T08:10:00.000Z",
    source: "fixture",
    coverage: { eligible: 2, prefetched: 2, evaluated: 2 },
  });
  assert.equal(result.schemaVersion, "1.0");
  assert.ok(result.swing.some(item => item.strategyId === "trend_breakout"));
  assert.ok(result.swing.every(item => item.horizon === "swing"));
  assert.ok(result.shortTerm.every(item => item.horizon === "shortTerm"));
  assert.ok(result.swing[0].reasonCodes.length > 0);
  assert.match(result.swing[0].invalidation, /跌破/);
});
