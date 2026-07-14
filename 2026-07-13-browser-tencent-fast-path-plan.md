# Browser Tencent K-line Fast Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the first stock K-line directly from Tencent without waiting for or depending on `/v1`, while retaining the backend as fallback, supporting ETF history when an ETF identity exists, and limiting background preload to 24 symbols.

**Architecture:** Keep `tencent-provider.mjs` as a browser-safe, token-free normalized adapter. `index.html` lazily imports it once, caches direct successes through the existing history cache, and calls the existing backend only when direct loading fails; startup loads the active chart and full universe independently and preserves placeholder history when canonical stock objects arrive.

**Tech Stack:** Browser dynamic ESM import, Fetch API, AbortController, IndexedDB cache already present in `index.html`, vanilla JavaScript, Node.js built-in test runner.

## Global Constraints

- Follow `2026-07-13-browser-tencent-fast-path-design.md`.
- Do not modify files under the managed read-only `server/` directory.
- Add no runtime dependency and require no Tencent token.
- Keep the default Tencent endpoint `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get`.
- Direct Tencent history gets one attempt with a 2,000 ms timeout; the existing `/v1` history request is the fallback.
- The stock universe, ETF universe, search, quotes, depth, and synchronization remain backend responsibilities.
- A stock chart must work with `/v1` unavailable by using a restored watchlist identity.
- ETF direct history applies only after the existing ETF universe supplies an identity.
- Never preload more than `STOCK_DAILY_VIRTUAL_COUNT + STOCK_DAILY_VIRTUAL_BUFFER`, currently 24 unique symbols.
- Preserve unrelated dirty-worktree changes.
- `.git` is read-only. Attempt scoped commits once; after `index.lock: Permission denied`, retain files and do not change permissions.

## File Map

- Modify `tencent-provider.mjs`: make environment and request headers safe in browsers.
- Modify `tests/tencent-provider.test.js`: prove browser construction and browser-safe headers.
- Modify `tests/xueqiu-provider.test.js`: remove the two superseded backend-composition tests from the abandoned read-only-server approach.
- Modify `index.html`: lazy provider import, direct-first history helper, stock/ETF integration, early startup, history merge, partial chart status, and bounded preload.
- Modify `tests/stocks-module.test.js`: direct/fallback/cache, integration, startup/state merge/status, and preload regression tests.

---

### Task 1: Make the Tencent Adapter Browser-Safe

**Files:**
- Modify: `tests/xueqiu-provider.test.js:612-end`
- Modify: `tests/tencent-provider.test.js`
- Modify: `tencent-provider.mjs:50-75`

**Interfaces:**
- Consumes: `createTencentProvider(options)` already implemented and covered by six passing contract tests.
- Produces: the same provider API without requiring Node's `process` global and without forbidden browser headers.

- [ ] **Step 1: Remove superseded backend-composition tests**

From `tests/xueqiu-provider.test.js`, remove the complete four top-level declarations appended after `server routes use xueqiu provider through the stock data provider layer`:

```text
createFakeTencentFirstFetch
createFakeTencentEtfServerFetch
xueqiu composition uses Tencent before credentialed history providers
xueqiu-mode server exposes Eastmoney ETF universe and Tencent ETF history
```

Those declarations test modifications under `server/`, which the approved browser-direct revision explicitly excludes. Leave every pre-existing Xueqiu and fallback test unchanged.

- [ ] **Step 2: Add failing browser-runtime tests**

Append to `tests/tencent-provider.test.js`:

```js
test("tencent provider constructs without the Node process global", async () => {
  const { createTencentProvider } = await import("../tencent-provider.mjs");
  const originalProcess = globalThis.process;
  let provider;
  try {
    globalThis.process = undefined;
    provider = createTencentProvider({
      fetchImpl: async () => jsonResponse({
        code: 0,
        data: { sh600519: { qfqday: [["2026-07-13", "10", "11", "12", "9", "1000"]] } },
      }),
    });
  } finally {
    globalThis.process = originalProcess;
  }
  const history = await provider.getHistory({ market: "SH", code: "600519", period: "day", range: "15d" });
  assert.equal(history.source, "tencent");
});

test("tencent provider sends only browser-safe request headers", async () => {
  const { createTencentProvider } = await import("../tencent-provider.mjs");
  let requestOptions;
  const provider = createTencentProvider({
    fetchImpl: async (_url, options) => {
      requestOptions = options;
      return jsonResponse({
        code: 0,
        data: { sh600519: { qfqday: [["2026-07-13", "10", "11", "12", "9", "1000"]] } },
      });
    },
  });
  await provider.getHistory({ market: "SH", code: "600519", period: "day", range: "15d" });
  assert.deepEqual(requestOptions.headers, { accept: "application/json,text/plain,*/*" });
});
```

- [ ] **Step 3: Verify RED**

Run:

```powershell
node --test --test-name-pattern="without the Node process|browser-safe request headers" tests/tencent-provider.test.js
```

Expected: the first test fails with a `process` reference error and the second shows `referer` and `user-agent` in the actual headers.

- [ ] **Step 4: Implement browser-safe environment and headers**

In `createTencentProvider()` replace direct `process.env` access with:

```js
const environment = globalThis.process?.env || {};
const fetchImpl = options.fetchImpl || globalThis.fetch;
const endpoint = options.endpoint || environment.TENCENT_KLINE_URL || DEFAULT_ENDPOINT;
const timeoutMs = Math.max(1, Number(
  options.timeoutMs ?? environment.TENCENT_TIMEOUT_MS ?? 2_000,
));
```

Replace the request headers with:

```js
headers: {
  accept: "application/json,text/plain,*/*",
},
```

- [ ] **Step 5: Verify GREEN and retain all provider contracts**

Run:

```powershell
node --test tests/tencent-provider.test.js tests/xueqiu-provider.test.js
```

Expected: eight Tencent tests plus every pre-existing Xueqiu test pass; no backend-composition test remains.

- [ ] **Step 6: Attempt scoped commit**

```powershell
git add -- tencent-provider.mjs tests/tencent-provider.test.js tests/xueqiu-provider.test.js
git commit -m "feat: make Tencent history browser compatible"
```

Expected in this sandbox: `index.lock: Permission denied`; do not change Git permissions.

---

### Task 2: Add a Direct-First Browser History Client

**Files:**
- Modify: `tests/stocks-module.test.js:492-535`
- Modify: `index.html:3869-3885,3970-3975,4870-4915`

**Interfaces:**
- Produces: `getBrowserTencentProvider(): Promise<TencentProvider>`.
- Produces: `fetchFastMarketHistory(path, { market, code, period, range, type }): Promise<HistoryResponse>`.
- Direct success returns `{ ...response, stale: false, headers }`, writes the existing browser cache, and never calls `fetchStockApi`.
- Direct failure calls `fetchStockApi(path)` exactly once.

- [ ] **Step 1: Add a focused helper harness**

Add to `tests/stocks-module.test.js` after `loadStockHistoryLoader()`:

```js
function loadFastMarketHistoryClient({ directResponse, directError, backendResponse } = {}) {
  return new Function("directResponse", "directError", "backendResponse", `
    let backendCalls = 0;
    let stockCalls = 0;
    let etfCalls = 0;
    const cacheWrites = [];
    function getBrowserTencentProvider() {
      return Promise.resolve({
        getHistory(params) {
          stockCalls += 1;
          if (directError) return Promise.reject(directError);
          return Promise.resolve(directResponse);
        },
        getEtfHistory(params) {
          etfCalls += 1;
          if (directError) return Promise.reject(directError);
          return Promise.resolve(directResponse);
        },
      });
    }
    function getStockApiCacheRetentionMs() { return 30_000; }
    function getStockApiCacheKey(path) { return "cache:" + path; }
    function writeStockApiCache(key, value, retentionMs) {
      cacheWrites.push({ key, value, retentionMs });
      return Promise.resolve(true);
    }
    function fetchStockApi(path) {
      backendCalls += 1;
      return Promise.resolve({ ...backendResponse, path });
    }
    ${extractFunction("fetchFastMarketHistory")}
    return {
      fetchFastMarketHistory,
      state() { return { backendCalls, stockCalls, etfCalls, cacheWrites }; },
    };
  `)(directResponse, directError, backendResponse);
}
```

- [ ] **Step 2: Add failing direct, ETF, cache, and fallback tests**

```js
test("browser history uses Tencent directly and retains the response", async () => {
  const directResponse = { items: [{ time: "2026-07-13", close: 11 }], source: "tencent" };
  const client = loadFastMarketHistoryClient({ directResponse });
  const path = "/v1/stocks/SH/600519/history?period=day&range=60d";
  const response = await client.fetchFastMarketHistory(path, {
    market: "SH", code: "600519", period: "day", range: "60d", type: "stock",
  });
  const state = client.state();
  assert.equal(response.source, "tencent");
  assert.equal(response.stale, false);
  assert.equal(response.headers.get("x-data-source"), "tencent");
  assert.equal(state.stockCalls, 1);
  assert.equal(state.backendCalls, 0);
  assert.deepEqual(state.cacheWrites, [{ key: `cache:${path}`, value: directResponse, retentionMs: 30_000 }]);
});

test("browser ETF history uses the Tencent ETF method", async () => {
  const client = loadFastMarketHistoryClient({ directResponse: { items: [{ time: "2026-07-13", close: 4.74 }], source: "tencent" } });
  await client.fetchFastMarketHistory("/v1/etfs/SH/510300/history?period=day&range=60d", {
    market: "SH", code: "510300", period: "day", range: "60d", type: "etf",
  });
  assert.equal(client.state().etfCalls, 1);
  assert.equal(client.state().stockCalls, 0);
});

test("browser history falls back to the existing backend once", async () => {
  const backendResponse = { items: [{ time: "2026-07-12", close: 10 }], source: "eastmoney" };
  const client = loadFastMarketHistoryClient({ directError: new Error("cors blocked"), backendResponse });
  const path = "/v1/stocks/SH/600519/history?period=day&range=60d";
  const response = await client.fetchFastMarketHistory(path, {
    market: "SH", code: "600519", period: "day", range: "60d", type: "stock",
  });
  assert.equal(response.source, "eastmoney");
  assert.equal(response.path, path);
  assert.equal(client.state().backendCalls, 1);
  assert.equal(client.state().cacheWrites.length, 0);
});

test("stock page lazily imports one browser Tencent provider", () => {
  const loader = extractFunction("getBrowserTencentProvider");
  assert.match(html, /const TENCENT_PROVIDER_MODULE_URL = "\.\/tencent-provider\.mjs"/);
  assert.match(html, /let browserTencentProviderPromise = null/);
  assert.match(loader, /import\(TENCENT_PROVIDER_MODULE_URL\)/);
  assert.match(loader, /module\.createTencentProvider\(\)/);
  assert.match(loader, /browserTencentProviderPromise = null/);
});
```

- [ ] **Step 3: Verify RED**

Run:

```powershell
node --test --test-name-pattern="browser history|browser ETF" tests/stocks-module.test.js
```

Expected: the harness reports `Missing function fetchFastMarketHistory`.

- [ ] **Step 4: Implement lazy provider import**

Add near the stock API constants:

```js
const TENCENT_PROVIDER_MODULE_URL = "./tencent-provider.mjs";
```

Add near the stock/ETF in-flight maps:

```js
let browserTencentProviderPromise = null;
```

Add before `fetchStockApi()`:

```js
function getBrowserTencentProvider() {
  if (!browserTencentProviderPromise) {
    browserTencentProviderPromise = import(TENCENT_PROVIDER_MODULE_URL)
      .then(module => module.createTencentProvider())
      .catch(error => {
        browserTencentProviderPromise = null;
        throw error;
      });
  }
  return browserTencentProviderPromise;
}
```

- [ ] **Step 5: Implement direct-first history with cache and fallback**

Add after `getBrowserTencentProvider()`:

```js
function fetchFastMarketHistory(path, { market, code, period, range, type = "stock" }) {
  return getBrowserTencentProvider()
    .then(provider => {
      const load = type === "etf" ? provider.getEtfHistory : provider.getHistory;
      return load({ market, code, period, range });
    })
    .then(response => {
      const retentionMs = getStockApiCacheRetentionMs(path);
      if (retentionMs > 0) {
        void writeStockApiCache(getStockApiCacheKey(path), response, retentionMs);
      }
      const headers = new Headers({ "x-data-source": response.source || "tencent" });
      return { ...response, stale: false, headers };
    })
    .catch(() => fetchStockApi(path));
}
```

- [ ] **Step 6: Verify GREEN**

Run the three focused tests from Step 2. Expected: all pass, proving direct success bypasses `/v1`, ETF dispatch is correct, cache receives the raw response, and fallback occurs once.

- [ ] **Step 7: Attempt scoped commit**

```powershell
git add -- index.html tests/stocks-module.test.js
git commit -m "feat: add browser-direct Tencent history"
```

Retain changes after the known Git permission denial.

---

### Task 3: Route Stock and ETF Loaders Through the Fast Client

**Files:**
- Modify: `tests/stocks-module.test.js:492-535,1235-1250`
- Modify: `index.html:5258-5310,5443-5500`

**Interfaces:**
- Consumes: `fetchFastMarketHistory()` from Task 2.
- Changes: `loadRealStockHistory()` accepts a valid identity even when `stockApiReady` is false.
- Changes: stock and ETF direct successes copy `source`, `updatedAt`, and `delayed` metadata to their objects.

- [ ] **Step 1: Update the stock-history harness before production code**

Inside `loadStockHistoryLoader()`, replace the fake `fetchStockApi()` with:

```js
async function fetchFastMarketHistory() {
  fetchCalls += 1;
  return { items: fetchItems, source: "tencent", updatedAt: "2026-07-13T11:00:00.000Z", ...responseOptions };
}
```

Expose this setter:

```js
setApiReady(value) { stockApiReady = Boolean(value); },
```

- [ ] **Step 2: Add failing readiness and integration tests**

```js
test("active stock history loads before the backend universe is ready", async () => {
  const module = loadStockHistoryLoader([
    { time: "2026-07-13", open: 10, high: 12, low: 9, close: 11, volume: 1000, amount: 2000 },
  ]);
  module.setApiReady(false);
  const stock = { id: "sh600519", market: "SH", code: "600519", dailyK: [], history: [] };
  const loaded = await module.loadRealStockHistory(stock);
  assert.equal(loaded, true);
  assert.equal(module.state().fetchCalls, 1);
  assert.equal(stock.dailyK.length, 1);
  assert.equal(stock.source, "tencent");
});

test("stock and ETF history loaders use the browser fast client", () => {
  const stockLoader = extractFunction("loadRealStockHistory");
  const etfLoader = extractFunction("loadRealEtfHistory");
  assert.match(stockLoader, /fetchFastMarketHistory\(path, \{/);
  assert.match(stockLoader, /type: "stock"/);
  assert.match(etfLoader, /fetchFastMarketHistory\(path, \{/);
  assert.match(etfLoader, /type: "etf"/);
  assert.doesNotMatch(stockLoader, /!stockApiReady/);
});
```

- [ ] **Step 3: Verify RED**

Run:

```powershell
node --test --test-name-pattern="before the backend universe|use the browser fast client" tests/stocks-module.test.js
```

Expected: the readiness guard returns false and both loaders still call the backend wrappers directly.

- [ ] **Step 4: Integrate stock history**

Replace the first guard with:

```js
if (!stock?.market || !stock?.code) return false;
```

Build the existing path once and call the fast client:

```js
const path = `/v1/stocks/${stock.market}/${stock.code}/history?period=${encodeURIComponent(period)}&range=${encodeURIComponent(range)}`;
const request = fetchFastMarketHistory(path, {
  market: stock.market,
  code: stock.code,
  period,
  range,
  type: "stock",
})
```

At the start of its successful `.then(response => {` block add:

```js
stock.source = response.source || stock.source;
stock.updatedAt = response.updatedAt || stock.updatedAt;
stock.delayed = Boolean(response.delayed ?? stock.delayed);
```

Leave existing stale, empty, load-key, and error logic unchanged.

- [ ] **Step 5: Integrate ETF history**

Use the parallel shape:

```js
const path = `/v1/etfs/${etf.market}/${etf.code}/history?period=${encodeURIComponent(period)}&range=${encodeURIComponent(range)}`;
const request = fetchFastMarketHistory(path, {
  market: etf.market,
  code: etf.code,
  period,
  range,
  type: "etf",
})
```

Copy `source`, `updatedAt`, and `delayed` in the ETF success block exactly as for stock, using the `etf` target.

- [ ] **Step 6: Verify GREEN**

Run `node --test tests/stocks-module.test.js`. Expected: all stock-module tests pass, including existing empty/stale/deduplication cases.

- [ ] **Step 7: Attempt scoped commit**

Attempt a commit for `index.html` and `tests/stocks-module.test.js`; retain verified files after the known denial.

---

### Task 4: Render the Active Chart Before the Universe and Preserve It

**Files:**
- Modify: `tests/stocks-module.test.js:535-570,1230-1250`
- Modify: `index.html:5162-5175,5995-6008,6070-6085,7607-7617`

**Interfaces:**
- Produces: `mergeStockLoadedHistory(target, source)`.
- Changes: `loadRealStockUniverse({ force, foreground, notify })` can suppress only its eager toast.
- Adds: `stockApiStatus === "chart-live"` for direct chart success without a universe.

- [ ] **Step 1: Add failing merge, startup-order, and status tests**

```js
function loadStockHistoryStateMerger() {
  return new Function(`
    ${extractFunction("mergeStockLoadedHistory")}
    return mergeStockLoadedHistory;
  `)();
}

test("canonical universe stocks retain history loaded on placeholders", () => {
  const merge = loadStockHistoryStateMerger();
  const canonical = { id: "sh600519", market: "SH", code: "600519", name: "贵州茅台", dailyK: [], history: [] };
  const placeholder = {
    id: "sh600519", market: "SH", code: "600519", source: "tencent",
    dailyK: [{ time: "2026-07-13", close: 1210.99 }],
    history: [{ open: 1200, high: 1220, low: 1190, close: 1210.99 }],
    historyLoadKey: "SH600519:day:60d", historyLoadEmptyKey: "",
    historyLoadErrorKey: "", historyLoadErrorMessage: "", historyDataStale: false,
  };
  const result = merge(canonical, placeholder);
  assert.equal(result, canonical);
  assert.equal(canonical.name, "贵州茅台");
  assert.equal(canonical.source, "tencent");
  assert.deepEqual(canonical.dailyK, placeholder.dailyK);
  assert.notEqual(canonical.dailyK, placeholder.dailyK);
});

test("real stock initialization starts active history before universe completion", () => {
  const block = extractBlock(
    /async function initializeRealStockData\(\) \{/,
    /\n    \}\n\n    function getStockChangeClass/,
  );
  assert.ok(block.indexOf("loadRealStockHistory(activeStock)") < block.indexOf("loadRealStockUniverse({ notify: false })"));
  assert.match(block, /Promise\.all\(\[historyRequest, universeRequest\]\)/);
  assert.match(block, /stockWatchlist\[0\]/);
  assert.match(block, /makeStockIdentityPlaceholder\(defaultStockWatchCodes\[0\]\)/);
  assert.match(block, /mergeStockLoadedHistory\(canonical, activeStock\)/);
  assert.match(block, /stockApiStatus = "chart-live"/);
  assert.match(html, /async function loadRealStockUniverse\(\{ force = false, foreground = true, notify = true \} = \{\}\)/);
});

test("stock status distinguishes a direct chart from a loaded universe", () => {
  const status = extractFunction("renderStockDataStatus");
  assert.match(status, /stockApiStatus === "chart-live"/);
  assert.match(status, /图表直连可用/);
  assert.match(status, /股票列表暂不可用/);
});
```

Update the existing unified-list assertion to require:

```js
assert.match(html, /const source = stockUniverse\.length \? stockUniverse : stockWatchlist/);
```

In the existing `stock daily K view fetches real history for the active stock` test, replace the sequential-start assertion with:

```js
assert.match(html, /loadRealStockHistory\(activeStock\)\.then/);
```

In `stocks data starts loading when the app opens`, update the universe-function extraction start pattern to include `notify = true`.

- [ ] **Step 2: Verify RED**

Run the four tests containing `retain history`, `initialization starts`, `status distinguishes`, and `unified loaded universe`. Expected: missing merge function, sequential initialization, no chart-live branch, and universe-only daily source.

- [ ] **Step 3: Implement history-preserving universe storage**

Add before `storeStockUniverse()`:

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
    "source", "updatedAt", "delayed", "historyLoadKey", "historyLoadEmptyKey",
    "historyLoadErrorKey", "historyLoadErrorMessage", "historyDataStale",
  ].forEach(key => {
    if (source[key] !== undefined) target[key] = source[key];
  });
  return target;
}
```

Start `storeStockUniverse()` with:

```js
const previousByIdentity = new Map(
  [...stockUniverse, ...stockWatchlist].map(stock => [getStockIdentity(stock), stock])
);
const mapped = (response.items || [])
  .map(mapApiStock)
  .filter(Boolean)
  .map(stock => mergeStockLoadedHistory(stock, previousByIdentity.get(getStockIdentity(stock))));
```

Keep the rest of the function unchanged.

- [ ] **Step 4: Add notification control to universe loading**

Change the signature to:

```js
async function loadRealStockUniverse({ force = false, foreground = true, notify = true } = {}) {
```

In its catch block, gate only the toast:

```js
if (activeFeature === "stocks" && notify) showToast(stockApiErrorMessage, "error");
```

Status and error-message assignment remain unchanged.

- [ ] **Step 5: Implement parallel startup and chart-live reconciliation**

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
  const historyRequest = loadRealStockHistory(activeStock).then(historyLoaded => {
    synchronizeHistory(historyLoaded);
    if (historyLoaded && activeFeature === "stocks") {
      renderStockSideList();
      renderStockPage();
    }
    return historyLoaded;
  });
  const universeRequest = loadRealStockUniverse({ notify: false });
  const [historyLoaded, loaded] = await Promise.all([historyRequest, universeRequest]);
  synchronizeHistory(historyLoaded);

  if (!loaded && historyLoaded) {
    stockApiStatus = "chart-live";
    stockApiErrorMessage = "";
    stockDataSource = activeStock.source || "tencent";
  } else if (!loaded && !historyLoaded && activeFeature === "stocks") {
    showToast(stockApiErrorMessage || "行情接口不可用", "error");
  }
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

- [ ] **Step 6: Render placeholder stocks and chart-live status**

In `getDailyFilteredStocks()` use:

```js
const source = stockUniverse.length ? stockUniverse : stockWatchlist;
```

In `renderStockDataStatus()`, before the `live` branch, add:

```js
if (stockApiStatus === "chart-live") {
  return `<div class="stock-refresh-note is-warning" data-stock-api-status>source=${escapeHTML(stockDataSource)} · 图表直连可用 · 股票列表暂不可用</div>`;
}
```

- [ ] **Step 7: Verify GREEN**

Run `node --test tests/stocks-module.test.js`. Expected: all tests pass, active placeholder history survives universe replacement, and the exact reported `最近请求失败` state is replaced by `chart-live` only when direct history succeeded and the universe failed.

- [ ] **Step 8: Attempt scoped commit**

Attempt a scoped commit for `index.html` and `tests/stocks-module.test.js`; retain changes after the known denial.

---

### Task 5: Bound Background Preload to the Visible Window

**Files:**
- Modify: `tests/stocks-module.test.js:1094-1145`
- Modify: `index.html:3886-3892,5313-5344`

**Interfaces:**
- Produces: `getStockUniverseChartPreloadStocks()` returning no more than 24 unique active/visible stocks.

- [ ] **Step 1: Replace old radius assertions with failing visible-window assertions**

Use:

```js
assert.match(html, /const STOCK_UNIVERSE_CHART_PRELOAD_LIMIT = STOCK_DAILY_VIRTUAL_COUNT \+ STOCK_DAILY_VIRTUAL_BUFFER/);
assert.doesNotMatch(html, /STOCK_UNIVERSE_CHART_PRELOAD_PAGE_RADIUS/);
assert.doesNotMatch(candidatesBlock, /const pageOffsets = \[0\]/);
assert.match(candidatesBlock, /const end = Math\.min\(sortedStocks\.length, start \+ STOCK_UNIVERSE_CHART_PRELOAD_LIMIT\)/);
assert.match(candidatesBlock, /sortedStocks\.slice\(start, end\)\.forEach\(addStock\)/);
assert.match(candidatesBlock, /return candidates\.slice\(0, STOCK_UNIVERSE_CHART_PRELOAD_LIMIT\)/);
```

- [ ] **Step 2: Verify RED**

Run the two tests containing `background preload` and `prioritizes the active`. Expected: old radius constants and page offsets violate the new assertions.

- [ ] **Step 3: Replace the preload constants**

```js
const STOCK_UNIVERSE_CHART_PRELOAD_LIMIT = STOCK_DAILY_VIRTUAL_COUNT + STOCK_DAILY_VIRTUAL_BUFFER;
```

- [ ] **Step 4: Replace the candidate function**

```js
function getStockUniverseChartPreloadStocks() {
  const candidates = [];
  const seen = new Set();
  const addStock = stock => {
    if (!stock || candidates.length >= STOCK_UNIVERSE_CHART_PRELOAD_LIMIT) return;
    const identity = getStockIdentity(stock);
    if (!identity || seen.has(identity)) return;
    seen.add(identity);
    candidates.push(stock);
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

- [ ] **Step 5: Verify GREEN**

Run `node --test tests/stocks-module.test.js`. Expected: all stock module tests pass and no radius symbol remains.

- [ ] **Step 6: Attempt scoped commit**

Attempt the scoped commit; preserve files after the known `.git` denial.

---

### Task 6: Full Regression and Live Direct-Path Verification

**Files:**
- Verify: `tencent-provider.mjs`, `index.html`, and all modified tests.
- Create no production file.

**Interfaces:**
- Produces fresh automated and live evidence that direct history succeeds while local history remains unavailable.

- [ ] **Step 1: Run the complete suite**

```powershell
node --test tests/*.test.js
```

Expected: every test passes, with 0 failures and 0 cancellations. Record the fresh count.

- [ ] **Step 2: Check syntax and patch hygiene**

```powershell
node --check tencent-provider.mjs
git diff --check -- index.html tests/stocks-module.test.js tests/tencent-provider.test.js tests/xueqiu-provider.test.js
```

Expected: exit 0; line-ending warnings are acceptable, whitespace errors are not.

- [ ] **Step 3: Verify the real Tencent adapter for stock and ETF identities**

```powershell
node -e 'import("./tencent-provider.mjs").then(async ({createTencentProvider})=>{const p=createTencentProvider();for(const [type,market,code] of [["stock","SH","600519"],["stock","SZ","300750"],["etf","SH","510300"]]){const t=Date.now();const r=type==="etf"?await p.getEtfHistory({market,code,period:"day",range:"30d"}):await p.getHistory({market,code,period:"day",range:"30d"});console.log(JSON.stringify({type,market,code,source:r.source,items:r.items.length,ms:Date.now()-t}))}})'
```

Expected: all three return `source: "tencent"`, at least one item, and each completes below 2,000 ms under the current network.

- [ ] **Step 4: Prove the observed backend failure is bypassed**

With the current local API still running, record its history result without changing it:

```powershell
node -e 'fetch("http://127.0.0.1:8787/v1/stocks/SH/600519/history?period=day&range=60d").then(async r=>console.log(JSON.stringify({status:r.status,body:await r.json()})))'
```

Expected in the diagnosed environment: backend remains `502 MARKET_DATA_UNAVAILABLE`, while Step 3 succeeds. This A/B evidence proves the new first path no longer depends on the failing route.

- [ ] **Step 5: Verify static delivery of the ESM adapter**

Check or start the existing static server on port 8000, then run:

```powershell
$response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/tencent-provider.mjs' -TimeoutSec 10
[pscustomobject]@{
  Status = $response.StatusCode
  ContentType = $response.Headers['Content-Type']
  HasFactory = $response.Content.Contains('export function createTencentProvider')
} | Format-List
```

Expected: status 200, JavaScript-compatible content type, and `HasFactory: True`.

- [ ] **Step 6: Verify the served frontend contains the complete direct path**

```powershell
$page = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/index.html' -TimeoutSec 10
[pscustomobject]@{
  Status = $page.StatusCode
  HasDynamicProvider = $page.Content.Contains('import(TENCENT_PROVIDER_MODULE_URL)')
  HasFastHistory = $page.Content.Contains('fetchFastMarketHistory(path')
  HasChartLive = $page.Content.Contains('图表直连可用')
  HasVisibleLimit = $page.Content.Contains('STOCK_DAILY_VIRTUAL_COUNT + STOCK_DAILY_VIRTUAL_BUFFER')
} | Format-List
```

Expected: status 200 and all four markers `True`.

- [ ] **Step 7: Final state and intended commit**

```powershell
git status --short
git diff --stat -- index.html tencent-provider.mjs tests/tencent-provider.test.js tests/xueqiu-provider.test.js tests/stocks-module.test.js
```

Suggested commit when Git becomes writable:

```powershell
git add -- index.html tencent-provider.mjs tests/tencent-provider.test.js tests/xueqiu-provider.test.js tests/stocks-module.test.js
git commit -m "feat: load stock charts directly from Tencent"
```

Do not claim completion unless the full suite, live Tencent checks, and static-delivery checks all pass.
