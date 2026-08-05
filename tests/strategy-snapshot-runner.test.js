const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "stocks", "strategy-selection-config.json"), "utf8"));

function makeProvider(date = "2026-08-04") {
  const history = Array.from({ length: 25 }, (_, index) => ({ time: `${date.slice(0, 8)}${String(index + 1).padStart(2, "0")}`, open: 10 + index * 0.1, high: 10.2 + index * 0.1, low: 9.9 + index * 0.1, close: 10.1 + index * 0.1, volume: 100000, amount: index === 24 ? 3000000000 : 1200000000 }));
  history[24] = { ...history[24], time: date, high: 12.8, close: 12.7, amount: 3000000000 };
  return {
    async getStockUniverse() { return { source: "fake", items: [{ market: "SH", code: "600001", name: "样本", industry: "机械", boardType: "main", status: "normal", volume: 200000, amount: 3000000000 }] }; },
    async getHistory() { return { items: history }; },
  };
}

test("snapshot runner writes current snapshot assets", async () => {
  const { runStrategySnapshot } = await import("../src/stocks/strategy-snapshot-runner.mjs");
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "strategy-runner-"));
  const result = await runStrategySnapshot({ provider: makeProvider(), config, now: () => new Date("2026-08-04T08:20:00.000Z"), outputDirectory });
  assert.equal(result.status, "ready");
  assert.equal(JSON.parse(fs.readFileSync(path.join(outputDirectory, "latest.json"), "utf8")).dataDate, "2026-08-04");
  assert.equal(JSON.parse(fs.readFileSync(path.join(outputDirectory, "status.json"), "utf8")).state, "ready");
});

test("snapshot runner preserves latest candidates when data is stale", async () => {
  const { runStrategySnapshot } = await import("../src/stocks/strategy-snapshot-runner.mjs");
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "strategy-stale-"));
  fs.writeFileSync(path.join(outputDirectory, "latest.json"), JSON.stringify({ dataDate: "2026-08-01" }));
  const result = await runStrategySnapshot({ provider: makeProvider("2026-08-01"), config, now: () => new Date("2026-08-04T08:20:00.000Z"), outputDirectory });
  assert.equal(result.status, "stale");
  assert.equal(JSON.parse(fs.readFileSync(path.join(outputDirectory, "latest.json"), "utf8")).dataDate, "2026-08-01");
});
