# Tencent K-line Fast Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return the first stock or ETF K-line through a fast, token-free Tencent provider while the full universe loads independently, with bounded background preload and existing fallbacks preserved.

**Architecture:** Add one focused ESM provider that normalizes Tencent K-line payloads into the existing history contract. Compose it ahead of Xueqiu and Eastmoney only for history, expose Eastmoney's existing universe/search/ETF capabilities, and make the single-file frontend start active history before the universe while retaining loaded history across object replacement.

**Tech Stack:** Node.js built-in `fetch`, `AbortController`, ESM server modules, `node:test`, CommonJS test files, vanilla JavaScript in `index.html`, existing backend and IndexedDB caches.

## Global Constraints

- Follow `2026-07-13-tencent-kline-fast-path-design.md`.
- Add no runtime dependency and require no Tencent token.
- Default endpoint: `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get`.
- Accept only `SH`, `SZ`, `BJ`; six-digit codes; `day`, `week`, `month`; and `15d`, `30d`, `60d`, `120d`, `250d`, `500d`.
- Preserve the existing stock and ETF history HTTP contracts.
- Use one Tencent attempt with a 2,000 ms timeout before existing fallbacks.
- Do not execute or redistribute the bundled StockDB binaries.
- Never preload more than 24 unique active/visible symbols.
- Preserve unrelated dirty-worktree changes.
- `.git` is read-only in this sandbox. Attempt scoped commits once; on `index.lock: Permission denied`, do not change permissions.

## File Map

- Create `server/tencent-provider.js`: request, validation, normalization, errors.
- Create `tests/tencent-provider.test.js`: provider contract and failure behavior.
- Modify `server/stock-data-provider.js`: source ordering and ETF composition.
- Modify `server/mock-server.js`: injectable Tencent options.
- Modify `tests/xueqiu-provider.test.js`: composition and route coverage.
- Modify `index.html`: early history, state merge, parallel initialization, bounded preload.
- Modify `tests/stocks-module.test.js`: frontend regressions.

---

### Task 1: Tencent History Provider

**Files:**
- Create: `tests/tencent-provider.test.js`
- Create: `server/tencent-provider.js`

**Interfaces:**
- Consumes: `{ market, code, period, range }` and optional `{ fetchImpl, endpoint, timeoutMs, now }`.
- Produces: `createTencentProvider(options)` returning `{ id, sourceId, getHistory, getEtfHistory }`.
- Produces stock `{ stock, period, range, items, source, delayed, updatedAt }` and ETF `{ etf, period, range, items, source, delayed, updatedAt }` history.

- [ ] **Step 1: Write the failing provider tests**

Create `tests/tencent-provider.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("tencent maps forward-adjusted daily history", async () => {
  const { createTencentProvider } = await import("../server/tencent-provider.js");
  const calls = [];
  const provider = createTencentProvider({
    now: () => new Date("2026-07-13T07:00:00.000Z"),
    fetchImpl: async (url, options) => {
      calls.push({ url: new URL(url), options });
      return jsonResponse({ code: 0, data: { sh600519: { qfqday: [
        ["2026-07-09", "1200", "1210", "1220", "1190", "10000"],
        ["2026-07-10", "1210", "1221", "1230", "1205", "12000"],
      ] } } });
    },
  });
  const history = await provider.getHistory({ market: "SH", code: "600519", period: "day", range: "15d" });
  assert.equal(calls[0].url.searchParams.get("param"), "sh600519,day,,,15,qfq");
  assert.equal(history.source, "tencent");
  assert.equal(history.updatedAt, "2026-07-13T07:00:00.000Z");
  assert.equal(history.stock.id, "SH:600519");
  assert.deepEqual(history.items[1], {
    time: "2026-07-10", open: 1210, high: 1230, low: 1205, close: 1221,
    volume: 12000, amount: 0, changeAmount: 11, changePercent: 0.91,
  });
});

test("tencent supports week, month, ETF, and raw BSE keys", async () => {
  const { createTencentProvider } = await import("../server/tencent-provider.js");
  const calls = [];
  const provider = createTencentProvider({ fetchImpl: async url => {
    const param = new URL(url).searchParams.get("param");
    calls.push(param);
    const [symbol, period] = param.split(",");
    const key = symbol.startsWith("bj") ? period : `qfq${period}`;
    return jsonResponse({ code: 0, data: { [symbol]: { [key]: [["2026-07-13", "10", "11", "12", "9", "1000"]] } } });
  } });
  const weekly = await provider.getHistory({ market: "SZ", code: "000001", period: "week", range: "30d" });
  const monthly = await provider.getHistory({ market: "SH", code: "600519", period: "month", range: "120d" });
  const bse = await provider.getHistory({ market: "BJ", code: "920992", period: "day", range: "60d" });
  const etf = await provider.getEtfHistory({ market: "SH", code: "510300", period: "day", range: "250d" });
  assert.deepEqual(calls, [
    "sz000001,week,,,30,qfq", "sh600519,month,,,120,qfq",
    "bj920992,day,,,60,qfq", "sh510300,day,,,250,qfq",
  ]);
  assert.equal(weekly.period, "week");
  assert.equal(monthly.period, "month");
  assert.equal(bse.items.length, 1);
  assert.equal(etf.etf.id, "ETF:SH:510300");
});

test("tencent validates requests and rejects empty history", async () => {
  const { createTencentProvider } = await import("../server/tencent-provider.js");
  let calls = 0;
  const provider = createTencentProvider({ fetchImpl: async () => {
    calls += 1;
    return jsonResponse({ code: 0, data: { sh600519: { qfqday: [] } } });
  } });
  for (const input of [
    { market: "US", code: "AAPL", period: "day", range: "30d" },
    { market: "SH", code: "600519", period: "minute", range: "30d" },
    { market: "SH", code: "600519", period: "day", range: "999d" },
  ]) {
    await assert.rejects(() => provider.getHistory(input), error => error.status === 400 && error.code === "VALIDATION_FAILED");
  }
  assert.equal(calls, 0);
  await assert.rejects(
    () => provider.getHistory({ market: "SH", code: "600519", period: "day", range: "30d" }),
    error => error.status === 502 && error.code === "MARKET_DATA_UNAVAILABLE" && /no usable/i.test(error.message),
  );
});

test("tencent limits rows to the requested range", async () => {
  const { createTencentProvider } = await import("../server/tencent-provider.js");
  const rows = Array.from({ length: 20 }, (_, index) => [
    `2026-06-${String(index + 1).padStart(2, "0")}`, "10", String(10 + index), "30", "9", "1000",
  ]);
  const provider = createTencentProvider({ fetchImpl: async () => jsonResponse({
    code: 0, data: { sh600519: { qfqday: rows } },
  }) });
  const history = await provider.getHistory({ market: "SH", code: "600519", period: "day", range: "15d" });
  assert.equal(history.items.length, 15);
  assert.equal(history.items[0].time, "2026-06-06");
});

test("tencent rejects HTTP, upstream-code, and malformed-JSON responses", async () => {
  const responses = [
    jsonResponse({}, 503),
    jsonResponse({ code: 123, msg: "upstream blocked" }),
    new Response("<html>bad gateway</html>", { status: 200 }),
  ];
  for (const response of responses) {
    const { createTencentProvider } = await import("../server/tencent-provider.js");
    const provider = createTencentProvider({ fetchImpl: async () => response });
    await assert.rejects(
      () => provider.getHistory({ market: "SH", code: "600519", period: "day", range: "30d" }),
      error => error.code === "MARKET_DATA_UNAVAILABLE",
    );
  }
});

test("tencent converts abort into a structured timeout", async () => {
  const { createTencentProvider } = await import("../server/tencent-provider.js");
  const provider = createTencentProvider({ timeoutMs: 1, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => {
      const error = new Error("aborted"); error.name = "AbortError"; reject(error);
    }, { once: true });
  }) });
  await assert.rejects(
    () => provider.getHistory({ market: "SH", code: "600519", period: "day", range: "30d" }),
    error => error.status === 504 && error.code === "MARKET_DATA_TIMEOUT",
  );
});
```

- [ ] **Step 2: Verify RED**

Run `node --test tests/tencent-provider.test.js`.

Expected: `ERR_MODULE_NOT_FOUND` for `server/tencent-provider.js`.

- [ ] **Step 3: Implement the provider**

Create `server/tencent-provider.js`:

```js
const DEFAULT_ENDPOINT = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get";
const RANGE_COUNTS = new Map([["15d", 15], ["30d", 30], ["60d", 60], ["120d", 120], ["250d", 250], ["500d", 500]]);
const MARKET_PREFIX = new Map([["SH", "sh"], ["SZ", "sz"], ["BJ", "bj"]]);
const PERIODS = new Set(["day", "week", "month"]);

function makeTencentError(status, code, message, details) {
  const error = new Error(message); error.status = status; error.code = code; error.details = details; return error;
}
function round(value, digits = 2) {
  const number = Number(value); return Number.isFinite(number) ? Number(number.toFixed(digits)) : 0;
}
function normalizeRows(rows) {
  return rows.map((row, index) => {
    if (!Array.isArray(row) || row.length < 6) return null;
    const time = String(row[0] || "");
    const [open, close, high, low, volume] = row.slice(1, 6).map(Number);
    if (!time || ![open, close, high, low, volume].every(Number.isFinite)) return null;
    const previousClose = index > 0 ? Number(rows[index - 1]?.[2]) : close;
    const changeAmount = Number.isFinite(previousClose) ? close - previousClose : 0;
    return {
      time, open: round(open, 4), high: round(high, 4), low: round(low, 4), close: round(close, 4),
      volume: Math.round(volume), amount: 0, changeAmount: round(changeAmount),
      changePercent: round(previousClose ? changeAmount / previousClose * 100 : 0),
    };
  }).filter(Boolean);
}

export function createTencentProvider(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const endpoint = options.endpoint || process.env.TENCENT_KLINE_URL || DEFAULT_ENDPOINT;
  const timeoutMs = Math.max(1, Number(options.timeoutMs ?? process.env.TENCENT_TIMEOUT_MS ?? 2_000));
  const now = options.now || (() => new Date());
  async function loadHistory(params, kind) {
    const market = String(params?.market || "").toUpperCase();
    const code = String(params?.code || "").trim();
    const period = String(params?.period || "");
    const range = String(params?.range || "");
    const prefix = MARKET_PREFIX.get(market);
    const count = RANGE_COUNTS.get(range);
    if (!prefix || !/^\d{6}$/.test(code)) throw makeTencentError(400, "VALIDATION_FAILED", `Unsupported Tencent identity ${market}:${code}`);
    if (!PERIODS.has(period)) throw makeTencentError(400, "VALIDATION_FAILED", `Unsupported Tencent period ${period}`);
    if (!count) throw makeTencentError(400, "VALIDATION_FAILED", `Unsupported Tencent range ${range}`);
    if (!fetchImpl) throw makeTencentError(500, "INTERNAL_ERROR", "fetch is unavailable");
    const symbol = `${prefix}${code}`;
    const url = new URL(endpoint); url.searchParams.set("param", `${symbol},${period},,,${count},qfq`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, headers: {
        accept: "application/json,text/plain,*/*", referer: "https://gu.qq.com/", "user-agent": "Mozilla/5.0",
      } });
      if (!response.ok) throw makeTencentError(response.status, "MARKET_DATA_UNAVAILABLE", `Tencent HTTP ${response.status}`);
      let result;
      try { result = await response.json(); } catch (_error) { throw makeTencentError(502, "MARKET_DATA_UNAVAILABLE", "Tencent returned invalid JSON"); }
      if (Number(result?.code || 0) !== 0) throw makeTencentError(502, "MARKET_DATA_UNAVAILABLE", result?.msg || "Tencent request failed", { upstreamCode: result?.code });
      const node = result?.data?.[symbol];
      const rows = node?.[`qfq${period}`] || node?.[period];
      const items = normalizeRows(Array.isArray(rows) ? rows : []).slice(-count);
      if (!items.length) throw makeTencentError(502, "MARKET_DATA_UNAVAILABLE", `Tencent returned no usable ${period} rows for ${symbol}`);
      const identity = kind === "etf"
        ? { etf: { id: `ETF:${market}:${code}`, type: "etf", market, code } }
        : { stock: { id: `${market}:${code}`, market, code } };
      return { ...identity, period, range, items, source: "tencent", delayed: false, updatedAt: now().toISOString() };
    } catch (error) {
      if (error?.name === "AbortError") throw makeTencentError(504, "MARKET_DATA_TIMEOUT", `Tencent request timed out after ${timeoutMs}ms`);
      if (error?.code) throw error;
      throw makeTencentError(502, "MARKET_DATA_UNAVAILABLE", error?.message || "Tencent request failed");
    } finally { clearTimeout(timer); }
  }
  return {
    id: "tencent", sourceId: "tencent",
    getHistory: params => loadHistory(params, "stock"),
    getEtfHistory: params => loadHistory(params, "etf"),
  };
}
```

- [ ] **Step 4: Verify GREEN**

Run `node --test tests/tencent-provider.test.js`.

Expected: 6 pass, 0 fail, no unhandled rejection.

- [ ] **Step 5: Attempt scoped commit**

Run:

```powershell
git add -- server/tencent-provider.js tests/tencent-provider.test.js
git commit -m "feat: add Tencent K-line provider"
```

Expected in this sandbox: known `index.lock` denial; retain files without altering permissions.

---

### Task 2: Compose Tencent History and Restore ETF Capabilities

**Files:**
- Modify: `server/stock-data-provider.js:1-50,246-291`
- Modify: `server/mock-server.js:44-65`
- Modify: `tests/xueqiu-provider.test.js:344-469`

**Interfaces:**
- Consumes: `createTencentProvider({ fetchImpl, endpoint, timeoutMs, now })`.
- Produces: `loadHistoryWithFallback(providers, params, method = "getHistory")`.
- Produces in `xueqiu` mode: Eastmoney stock universe/search and ETF universe/search/quote; Tencent-first stock and ETF history.

- [ ] **Step 1: Add failing composition tests**

Append to `tests/xueqiu-provider.test.js`:

```js
function createFakeTencentFirstFetch() {
  const calls = [];
  async function fakeFetch(url) {
    const parsed = new URL(url); calls.push(parsed);
    if (parsed.hostname !== "web.ifzq.gtimg.cn") throw new Error(`Unexpected fallback ${parsed.hostname}`);
    const symbol = parsed.searchParams.get("param").split(",")[0];
    return jsonResponse({ code: 0, data: { [symbol]: {
      qfqday: [["2026-07-13", "10", "11", "12", "9", "1000"]],
    } } });
  }
  fakeFetch.calls = calls; return fakeFetch;
}

function createFakeTencentEtfServerFetch() {
  const calls = [];
  async function fakeFetch(url) {
    const parsed = new URL(url); calls.push(parsed);
    if (parsed.hostname === "web.ifzq.gtimg.cn") {
      const symbol = parsed.searchParams.get("param").split(",")[0];
      return jsonResponse({ code: 0, data: { [symbol]: {
        qfqday: [["2026-07-13", "4.70", "4.74", "4.82", "4.68", "10000"]],
      } } });
    }
    if (parsed.hostname === "push2delay.eastmoney.com") {
      return jsonResponse({ rc: 0, data: { total: 1, diff: [{
        f2: 4.74, f3: 0.5, f4: 0.02, f5: 10000, f6: 47400,
        f12: "510300", f13: 1, f14: "沪深300ETF", f100: "ETF",
      }] } });
    }
    return jsonResponse({ error_code: 404, error_description: "not found" }, { status: 404 });
  }
  fakeFetch.calls = calls; return fakeFetch;
}

test("xueqiu composition uses Tencent before credentialed history providers", async () => {
  const { createStockDataProvider } = await import("../server/stock-data-provider.js");
  const fetchImpl = createFakeTencentFirstFetch();
  const provider = createStockDataProvider({
    dataSource: "xueqiu", xueqiuCookie: "expired-cookie", fetchImpl,
  });
  const history = await provider.getHistory({ market: "SH", code: "600519", period: "day", range: "30d" });
  assert.equal(history.source, "tencent");
  assert.equal(history.items.length, 1);
  assert.deepEqual(fetchImpl.calls.map(call => call.hostname), ["web.ifzq.gtimg.cn"]);
});

test("xueqiu-mode server exposes Eastmoney ETF universe and Tencent ETF history", async () => {
  const { createMockServer } = await import("../server/mock-server.js");
  const fetchImpl = createFakeTencentEtfServerFetch();
  const server = createMockServer({ port: 0, dataSource: "xueqiu", xueqiuCookie: "expired-cookie", fetchImpl });
  await server.start();
  try {
    const universe = await requestJson(server.url, "/v1/etfs/universe?limit=10");
    const history = await requestJson(server.url, "/v1/etfs/SH/510300/history?period=day&range=30d");
    assert.equal(universe.response.status, 200);
    assert.equal(universe.response.headers.get("x-data-source"), "eastmoney");
    assert.equal(universe.body.items[0].code, "510300");
    assert.equal(history.response.status, 200);
    assert.equal(history.response.headers.get("x-data-source"), "tencent");
    assert.equal(history.body.etf.id, "ETF:SH:510300");
  } finally { await server.stop(); }
});
```

Use the file's existing `jsonResponse(body, init)` helper exactly as defined. The `404` call above must therefore pass `{ status: 404 }`, not the numeric shorthand used in Task 1.

- [ ] **Step 2: Verify RED**

Run:

```powershell
node --test --test-name-pattern="Tencent|xueqiu-mode server" tests/xueqiu-provider.test.js
```

Expected: stock history attempts Xueqiu instead of returning Tencent; ETF universe returns `501`.

- [ ] **Step 3: Make fallback method-aware**

Import the new provider in `server/stock-data-provider.js`:

```js
import { createTencentProvider } from "./tencent-provider.js";
```

Replace `loadHistoryWithFallback` with:

```js
async function loadHistoryWithFallback(providers, params, method = "getHistory") {
  let fallbackHistory = null;
  let lastError = null;
  for (const provider of providers) {
    const load = provider?.[method];
    if (typeof load !== "function") continue;
    try {
      const history = await load(params);
      if (hasHistoryItems(history)) return history;
      if (!fallbackHistory && history) fallbackHistory = history;
    } catch (error) {
      lastError = error;
      if (!shouldContinueHistoryFallback(error)) throw error;
    }
  }
  if (fallbackHistory) return fallbackHistory;
  if (lastError) throw lastError;
  return null;
}
```

- [ ] **Step 4: Compose Tencent and Eastmoney capabilities**

Inside `dataSource === "xueqiu"`, after creating Eastmoney, create:

```js
const tencentProvider = createTencentProvider({
  fetchImpl: options.fetchImpl,
  endpoint: options.tencentKlineUrl,
  timeoutMs: options.tencentTimeoutMs,
  now: options.now,
});
```

Replace the returned object with:

```js
return {
  ...provider,
  getStockUniverse: eastmoneyProvider.getStockUniverse,
  searchStocks: eastmoneyProvider.searchStocks,
  getEtfUniverse: eastmoneyProvider.getEtfUniverse,
  searchEtfs: eastmoneyProvider.searchEtfs,
  getEtfQuote: eastmoneyProvider.getEtfQuote,
  async getHistory(params) {
    const providers = useTushareHistoryFallback
      ? [tencentProvider, provider, eastmoneyProvider, tushareProvider]
      : [tencentProvider, provider, eastmoneyProvider];
    return loadHistoryWithFallback(providers, params);
  },
  async getEtfHistory(params) {
    return loadHistoryWithFallback([tencentProvider, eastmoneyProvider], params, "getEtfHistory");
  },
};
```

In `server/mock-server.js`, pass these fields before `fetchImpl`:

```js
tencentKlineUrl: options.tencentKlineUrl,
tencentTimeoutMs: options.tencentTimeoutMs,
```

- [ ] **Step 5: Verify GREEN and existing fallbacks**

Run:

```powershell
node --test tests/tencent-provider.test.js tests/xueqiu-provider.test.js tests/eastmoney-provider.test.js tests/mock-server.test.js
```

Expected: all targeted tests pass. Existing Xueqiu-to-Eastmoney/Tushare tests may record one new Tencent `404`, then must preserve their original asserted source.

- [ ] **Step 6: Attempt scoped commit**

Run:

```powershell
git add -- server/stock-data-provider.js server/mock-server.js tests/xueqiu-provider.test.js
git commit -m "feat: prefer Tencent for chart history"
```

On the known sandbox denial, retain verified changes without changing Git permissions.

---

### Task 3: Start the First Chart Early and Bound Preload

**Files:**
- Modify: `tests/stocks-module.test.js:492-532,1094-1137,1230-1251`
- Modify: `index.html:3886-3892,5162-5175,5313-5344,5443-5500,5995-6008,7607-7611`

**Interfaces:**
- Produces: `mergeStockLoadedHistory(target, source)` that mutates and returns the canonical target.
- Changes: `loadRealStockHistory()` accepts valid identities before `stockApiReady`.
- Changes: `initializeRealStockData()` invokes history before universe, awaits both, then synchronizes the canonical object.
- Changes: `getStockUniverseChartPreloadStocks()` returns at most 24 unique active/visible stocks.

- [ ] **Step 1: Add failing early-history and state-merge tests**

Expose this method from the existing `loadStockHistoryLoader()` test harness:

```js
setApiReady(value) { stockApiReady = Boolean(value); },
```

Add:

```js
test("active stock history starts before the full universe is ready", async () => {
  const module = loadStockHistoryLoader([
    { time: "2026-07-13", open: 10, high: 12, low: 9, close: 11, volume: 1000, amount: 2000 },
  ]);
  module.setApiReady(false);
  const stock = { id: "SH:600519", market: "SH", code: "600519", dailyK: [], history: [] };
  const loaded = await module.loadRealStockHistory(stock);
  assert.equal(loaded, true);
  assert.equal(module.state().fetchCalls, 1);
  assert.equal(stock.dailyK.length, 1);
});

function loadStockHistoryStateMerger() {
  return new Function(`
    ${extractFunction("mergeStockLoadedHistory")}
    return mergeStockLoadedHistory;
  `)();
}

test("canonical universe stocks retain history loaded on placeholders", () => {
  const merge = loadStockHistoryStateMerger();
  const canonical = { id: "SH:600519", market: "SH", code: "600519", name: "贵州茅台", dailyK: [], history: [] };
  const placeholder = {
    id: "SH:600519", market: "SH", code: "600519",
    dailyK: [{ time: "2026-07-13", close: 1210.99 }],
    history: [{ open: 1200, high: 1220, low: 1190, close: 1210.99 }],
    historyLoadKey: "SH:600519:day:60d", historyLoadEmptyKey: "",
    historyLoadErrorKey: "", historyLoadErrorMessage: "", historyDataStale: false,
  };
  const result = merge(canonical, placeholder);
  assert.equal(result, canonical);
  assert.equal(canonical.name, "贵州茅台");
  assert.deepEqual(canonical.dailyK, placeholder.dailyK);
  assert.notEqual(canonical.dailyK, placeholder.dailyK);
  assert.equal(canonical.historyLoadKey, "SH:600519:day:60d");
});
```

- [ ] **Step 2: Replace old preload assertions and add initialization-order coverage**

In the preload tests, replace assertions for page size/radius/page offsets with:

```js
assert.match(html, /const STOCK_UNIVERSE_CHART_PRELOAD_LIMIT = STOCK_DAILY_VIRTUAL_COUNT \+ STOCK_DAILY_VIRTUAL_BUFFER/);
assert.doesNotMatch(html, /STOCK_UNIVERSE_CHART_PRELOAD_PAGE_RADIUS/);
assert.doesNotMatch(candidatesBlock, /const pageOffsets = \[0\]/);
assert.match(candidatesBlock, /const end = Math\.min\(sortedStocks\.length, start \+ STOCK_UNIVERSE_CHART_PRELOAD_LIMIT\)/);
assert.match(candidatesBlock, /sortedStocks\.slice\(start, end\)\.forEach\(addStock\)/);
```

Add:

```js
test("real stock initialization starts active history before universe loading", () => {
  const block = extractBlock(
    /async function initializeRealStockData\(\) \{/,
    /\n    \}\n\n    function getStockChangeClass/,
  );
  assert.ok(block.indexOf("loadRealStockHistory(activeStock)") < block.indexOf("loadRealStockUniverse()"));
  assert.match(block, /stockWatchlist\[0\]/);
  assert.match(block, /makeStockIdentityPlaceholder\(defaultStockWatchCodes\[0\]\)/);
  assert.match(block, /Promise\.all\(\[historyRequest, universeRequest\]\)/);
  assert.match(block, /mergeStockLoadedHistory\(canonical, activeStock\)/);
  assert.match(block, /if \(historyLoaded && activeFeature === "stocks"\)/);
  const dailySource = extractBlock(
    /function getDailyFilteredStocks\(\) \{/,
    /\n    \}\n\n    function toggleStockDailyFilter/,
  );
  assert.match(dailySource, /stockUniverse\.length \? stockUniverse : stockWatchlist/);
});
```

- [ ] **Step 3: Verify RED**

Run:

```powershell
node --test --test-name-pattern="before the full universe|retain history loaded|initialization starts|background preload|prioritizes the active" tests/stocks-module.test.js
```

Expected: the readiness guard returns `false`; the merge helper is missing; old radius constants remain; initialization is sequential.

- [ ] **Step 4: Implement loaded-history merging**

Add before `storeStockUniverse()` in `index.html`:

```js
function mergeStockLoadedHistory(target, source) {
  if (!target || !source || target === source) return target;
  if (Array.isArray(source.dailyK) && source.dailyK.length) {
    target.dailyK = source.dailyK.map(item => ({ ...item }));
  }
  if (Array.isArray(source.history) && source.history.length) {
    target.history = source.history.map(item => ({ ...item }));
  }
  [
    "historyLoadKey", "historyLoadEmptyKey", "historyLoadErrorKey",
    "historyLoadErrorMessage", "historyDataStale",
  ].forEach(key => {
    if (source[key] !== undefined) target[key] = source[key];
  });
  return target;
}
```

Change the start of `storeStockUniverse()` to:

```js
const previousByIdentity = new Map(
  [...stockUniverse, ...stockWatchlist].map(stock => [getStockIdentity(stock), stock])
);
const mapped = (response.items || [])
  .map(mapApiStock)
  .filter(Boolean)
  .map(stock => mergeStockLoadedHistory(stock, previousByIdentity.get(getStockIdentity(stock))));
```

Leave the rest of the function unchanged so canonical quote/name/industry fields still come from the universe.

- [ ] **Step 5: Implement early active history and race-safe initialization**

Replace the first `loadRealStockHistory()` guard with:

```js
if (!stock?.market || !stock?.code) return false;
```

Replace `initializeRealStockData()` with:

```js
async function initializeRealStockData() {
  const activeStock = getActiveDailyStock()
    || stockWatchlist.find(stock => getStockIdentity(stock) === activeDailyStockId)
    || stockWatchlist[0]
    || makeStockIdentityPlaceholder(defaultStockWatchCodes[0]);
  if (activeStock && !activeDailyStockId) activeDailyStockId = activeStock.id;
  const synchronizeHistory = historyLoaded => {
    if (!historyLoaded || !activeStock) return historyLoaded;
    const canonical = getStockByCode(activeStock.code, activeStock.market);
    if (canonical) mergeStockLoadedHistory(canonical, activeStock);
    const watchStock = stockWatchlist.find(stock => getStockIdentity(stock) === getStockIdentity(activeStock));
    if (watchStock) mergeStockLoadedHistory(watchStock, activeStock);
    return historyLoaded;
  };
  const historyRequest = (activeStock ? loadRealStockHistory(activeStock) : Promise.resolve(false))
    .then(historyLoaded => {
      synchronizeHistory(historyLoaded);
      if (historyLoaded && activeFeature === "stocks") {
        renderStockSideList();
        renderStockPage();
      }
      return historyLoaded;
    });
  const universeRequest = loadRealStockUniverse();
  const [historyLoaded, loaded] = await Promise.all([historyRequest, universeRequest]);
  synchronizeHistory(historyLoaded);

  if (activeFeature === "stocks") {
    renderStockSideList();
    renderStockPage();
  }
  if (!loaded || activeFeature !== "stocks") return;
  if (activeStockView === "limit-board") scheduleStockLimitBoardHistoryLoad();
  updateStockDynamicData();
  scheduleStockUniverseChartPreload();
}
```

Change `getDailyFilteredStocks()` so the chart can render the restored placeholder before the universe arrives:

```js
const source = stockUniverse.length ? stockUniverse : stockWatchlist;
```

- [ ] **Step 6: Replace radius preload with the visible 24-symbol window**

Replace the page-size, radius, and computed-limit constants with:

```js
const STOCK_UNIVERSE_CHART_PRELOAD_LIMIT = STOCK_DAILY_VIRTUAL_COUNT + STOCK_DAILY_VIRTUAL_BUFFER;
```

Replace `getStockUniverseChartPreloadStocks()`:

```js
function getStockUniverseChartPreloadStocks() {
  const candidates = [];
  const seen = new Set();
  const addStock = stock => {
    if (!stock || candidates.length >= STOCK_UNIVERSE_CHART_PRELOAD_LIMIT) return;
    const identity = getStockIdentity(stock);
    if (!identity || seen.has(identity)) return;
    seen.add(identity); candidates.push(stock);
  };
  addStock(getActiveDailyStock());
  const sortedStocks = getSortedDailyStocks();
  const maxStart = Math.max(0, sortedStocks.length - STOCK_DAILY_VIRTUAL_COUNT);
  const start = Math.max(0, Math.min(maxStart, stockDailyVirtualStart));
  const end = Math.min(sortedStocks.length, start + STOCK_UNIVERSE_CHART_PRELOAD_LIMIT);
  sortedStocks.slice(start, end).forEach(addStock);
  return candidates.slice(0, STOCK_UNIVERSE_CHART_PRELOAD_LIMIT);
}
```

- [ ] **Step 7: Verify GREEN**

Run `node --test tests/stocks-module.test.js`.

Expected: all stock-module tests pass. Update only assertions that intentionally described the removed radius behavior.

- [ ] **Step 8: Attempt scoped commit**

Run:

```powershell
git add -- index.html tests/stocks-module.test.js
git commit -m "perf: load active stock chart before universe"
```

On the known sandbox denial, retain verified changes without changing Git permissions.
---

### Task 4: Full Regression and Live Local Verification

**Files:**
- Verify all files changed in Tasks 1–3.
- Create no production file in this task.

**Interfaces:**
- Consumes: static server `127.0.0.1:8000` and API `127.0.0.1:8787`.
- Produces: fresh full-suite output and live route evidence for stock, ETF, source, and latency.

- [ ] **Step 1: Run the complete automated suite**

Run:

```powershell
node --test tests/*.test.js
```

Expected: every test passes with 0 failures and 0 cancellations. Record the fresh total.

- [ ] **Step 2: Verify syntax and patch hygiene**

Run:

```powershell
node --check server/tencent-provider.js
node --check server/stock-data-provider.js
node --check server/mock-server.js
git diff --check -- index.html server/tencent-provider.js server/stock-data-provider.js server/mock-server.js tests/tencent-provider.test.js tests/xueqiu-provider.test.js tests/stocks-module.test.js
```

Expected: exit 0. Line-ending conversion warnings are acceptable; whitespace errors are not.

- [ ] **Step 3: Restart only the project API**

Run after checking that any 8787 listener is this project's `server/mock-server.js`:

```powershell
$connection = Get-NetTCPConnection -State Listen -LocalPort 8787 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($connection) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)"
  if ($process.CommandLine -notmatch 'server[\\/]mock-server\.js') {
    throw "Port 8787 belongs to an unrelated process: $($process.CommandLine)"
  }
  Stop-Process -Id $connection.OwningProcess
}
Start-Process -FilePath node -ArgumentList @('server/mock-server.js') -WorkingDirectory (Get-Location) -WindowStyle Hidden
$deadline = (Get-Date).AddSeconds(15)
do {
  try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/v1/health' -TimeoutSec 2 }
  catch { $health = $null }
  if (-not $health) { Start-Sleep -Milliseconds 250 }
} until ($health -or (Get-Date) -ge $deadline)
if (-not $health) { throw 'Stock API did not become healthy within 15 seconds' }
```

Expected: `{ status: "ok" }`. Never stop a process that fails the command-line check.

- [ ] **Step 4: Verify cold stock and ETF history routes**

Run immediately after restart:

```powershell
$targets = @(
  'http://127.0.0.1:8787/v1/stocks/SH/600519/history?period=day&range=30d',
  'http://127.0.0.1:8787/v1/stocks/SZ/300750/history?period=week&range=60d',
  'http://127.0.0.1:8787/v1/etfs/SH/510300/history?period=day&range=30d'
)
$results = foreach ($url in $targets) {
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 10
  $watch.Stop()
  $body = $response.Content | ConvertFrom-Json
  [pscustomobject]@{
    Url = $url; Status = $response.StatusCode
    Source = $response.Headers['x-data-source']; Cache = $response.Headers['x-cache']
    Items = @($body.items).Count; Milliseconds = $watch.ElapsedMilliseconds
  }
}
$results | Format-Table -AutoSize
```

Expected for all: HTTP `200`, source `tencent`, cache `MISS`, items greater than 0, and time below 2,000 ms under the current network.

- [ ] **Step 5: Verify ETF universe and served frontend**

Run:

```powershell
$etfs = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8787/v1/etfs/universe?limit=10' -TimeoutSec 15
$page = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/index.html' -TimeoutSec 10
[pscustomobject]@{
  EtfStatus = $etfs.StatusCode; EtfSource = $etfs.Headers['x-data-source']
  PageStatus = $page.StatusCode
  HasVisiblePreloadLimit = $page.Content.Contains('STOCK_DAILY_VIRTUAL_COUNT + STOCK_DAILY_VIRTUAL_BUFFER')
  HasStructuredErrors = $page.Content.Contains('StockApiError')
} | Format-List
```

Expected: ETF `200` rather than `501`, source `eastmoney`, page `200`, both markers `True`.

- [ ] **Step 6: Observe the real first-chart ordering**

Open `http://127.0.0.1:8000`, press `Ctrl+F5`, enter the stock page, and use the Network panel. Confirm active `/history` starts before `/v1/stocks/universe?limit=6000` finishes, returns `200` with `x-data-source: tencent`, and the UI does not show the local-API connection error.

- [ ] **Step 7: Record final state and intended commit**

Run:

```powershell
git status --short
git diff --stat -- index.html server/tencent-provider.js server/stock-data-provider.js server/mock-server.js tests/tencent-provider.test.js tests/xueqiu-provider.test.js tests/stocks-module.test.js
```

Suggested final commit when Git is writable:

```powershell
git add -- index.html server/tencent-provider.js server/stock-data-provider.js server/mock-server.js tests/tencent-provider.test.js tests/xueqiu-provider.test.js tests/stocks-module.test.js
git commit -m "feat: add fast resilient Tencent stock charts"
```

Do not claim completion unless the full suite and every live route check pass.
