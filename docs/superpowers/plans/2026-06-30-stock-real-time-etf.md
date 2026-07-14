# Stock Real-Time ETF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a realtime ETF subview to the stock module with backend ETF provider contracts, route support, and a frontend ETF browser that reuses existing quote/K-line behavior.

**Architecture:** ETF data is a separate instrument flow from `stockUniverse`, with optional provider methods exposed through `/v1/etfs/*`. The first working path supports mock/test data and Eastmoney public ETF list/quote/history mapping, while providers without ETF support return explicit capability errors. The frontend adds an `etf` stock subview and keeps ETF state separate from stock daily, screener, and limit-board state.

**Tech Stack:** Native HTML/CSS/JS in `index.html`, Node ESM backend modules in `server/*.js`, Node built-in test runner in `tests/*.test.js`, TypeScript contract source in `src/stocks/contracts.ts`, OpenAPI YAML in `docs/openapi/stocks.openapi.yaml`.

---

## File Structure

- Modify `src/stocks/contracts.ts`: add ETF contract types, ETF API methods, and include `etf` in stock view identifiers.
- Modify `docs/openapi/stocks.openapi.yaml`: add `/v1/etfs/*` paths and ETF schemas.
- Modify `server/mock-data.js`: add explicit test/demo ETF fixtures and ETF history/depth-compatible helpers.
- Modify `server/stock-data-provider.js`: add mock ETF provider methods and pass through Eastmoney ETF support.
- Modify `server/eastmoney-provider.js`: add ETF universe, search, quote, and history provider methods using the existing fetch helper and quote/K-line mapping style.
- Modify `server/routes.js`: add ETF REST routes and provider capability handling.
- Modify `index.html`: add ETF state, data loading helpers, render helpers, event handlers, and `stockViews` registration.
- Modify `tests/stocks-contracts.test.js`: assert ETF contracts and OpenAPI paths exist.
- Modify `tests/mock-server.test.js`: verify ETF routes, error behavior, and mock ETF fixtures.
- Modify `tests/eastmoney-provider.test.js`: verify Eastmoney ETF universe/quote/history mapping.
- Modify `tests/stocks-module.test.js`: verify ETF subview registration, rendering, event routing, and exclusion from stock-specific views.

### Task 1: Contract And OpenAPI Surface

**Files:**
- Modify: `src/stocks/contracts.ts`
- Modify: `docs/openapi/stocks.openapi.yaml`
- Test: `tests/stocks-contracts.test.js`

- [ ] **Step 1: Write failing contract tests**

Add assertions in `tests/stocks-contracts.test.js`:

```js
test("contracts and OpenAPI expose ETF instrument routes separately from stocks", () => {
  [
    "export interface EtfIdentity",
    "export interface EtfSummary",
    "export interface EtfQuote",
    "export interface EtfHistoryResponse",
    "getEtfUniverse(",
    "searchEtfs(",
    "getEtfQuote(",
    "getEtfHistory(",
    '"etf"',
  ].forEach(item => assertIncludes(contracts, item));

  [
    "/v1/etfs/universe:",
    "/v1/etfs/search:",
    "/v1/etfs/{market}/{code}/quote:",
    "/v1/etfs/{market}/{code}/history:",
    "EtfSummary:",
    "EtfQuote:",
    "EtfHistoryResponse:",
  ].forEach(item => assertIncludes(openapi, item));
});
```

- [ ] **Step 2: Run the failing contract test**

Run: `node --test tests/stocks-contracts.test.js`

Expected: FAIL because ETF interfaces and OpenAPI paths are missing.

- [ ] **Step 3: Add minimal contract definitions**

Add ETF types near the stock identity and quote types in `src/stocks/contracts.ts`, add `"etf"` to `STOCK_VIEWS`, and add ETF API methods to `StockApiContract`.

- [ ] **Step 4: Add minimal OpenAPI ETF paths and schemas**

Add `/v1/etfs/universe`, `/v1/etfs/search`, `/v1/etfs/{market}/{code}/quote`, `/v1/etfs/{market}/{code}/history`, plus `EtfSummary`, `EtfQuote`, and `EtfHistoryResponse` schemas.

- [ ] **Step 5: Run the contract test**

Run: `node --test tests/stocks-contracts.test.js`

Expected: PASS.

### Task 2: Backend ETF Routes And Mock Provider

**Files:**
- Modify: `server/mock-data.js`
- Modify: `server/stock-data-provider.js`
- Modify: `server/routes.js`
- Test: `tests/mock-server.test.js`

- [ ] **Step 1: Write failing route tests**

Add a test in `tests/mock-server.test.js` that requests:

```js
const universe = await requestJson(server.url, "/v1/etfs/universe?limit=10");
assert.equal(universe.response.status, 200);
assert.equal(universe.response.headers.get("x-data-source"), "mock-a-share");
assert.ok(universe.body.items.length >= 2);
assert.equal(universe.body.items[0].type, "etf");

const search = await requestJson(server.url, "/v1/etfs/search?q=300&limit=5");
assert.equal(search.response.status, 200);
assert.ok(search.body.items.some(item => item.code === "510300"));

const quote = await requestJson(server.url, "/v1/etfs/SH/510300/quote");
assert.equal(quote.response.status, 200);
assert.equal(quote.body.id, "ETF:SH:510300");

const history = await requestJson(server.url, "/v1/etfs/SH/510300/history?period=day&range=30d");
assert.equal(history.response.status, 200);
assert.equal(history.body.etf.id, "ETF:SH:510300");
assert.equal(history.body.items.length, 30);

const missing = await requestJson(server.url, "/v1/etfs/SH/000000/quote");
assert.equal(missing.response.status, 404);
assert.equal(missing.body.code, "NOT_FOUND");
```

- [ ] **Step 2: Run the failing route tests**

Run: `node --test tests/mock-server.test.js`

Expected: FAIL because `/v1/etfs/*` routes are missing.

- [ ] **Step 3: Add mock ETF fixtures and provider methods**

Add `createInitialEtfs()` to `server/mock-data.js`. In `server/stock-data-provider.js`, add mock methods `getEtfUniverse`, `searchEtfs`, `getEtfQuote`, and `getEtfHistory` that use these fixtures and `makeHistory()`.

- [ ] **Step 4: Add ETF routes**

In `server/routes.js`, add GET handlers for `/v1/etfs/universe`, `/v1/etfs/search`, `/v1/etfs/{market}/{code}/quote`, and `/v1/etfs/{market}/{code}/history`. Use the same cache/error/header style as stock routes.

- [ ] **Step 5: Run the route tests**

Run: `node --test tests/mock-server.test.js`

Expected: PASS.

### Task 3: Eastmoney ETF Provider Support

**Files:**
- Modify: `server/eastmoney-provider.js`
- Modify: `server/stock-data-provider.js`
- Test: `tests/eastmoney-provider.test.js`

- [ ] **Step 1: Write failing provider tests**

Add test fixtures for an ETF list row such as `510300` and quote/K-line responses. Assert:

```js
const etfs = await provider.getEtfUniverse({ limit: 100 });
assert.equal(etfs.items[0].id, "ETF:SH:510300");
assert.equal(etfs.items[0].type, "etf");
assert.equal(etfs.items[0].category, "宽基");

const search = await provider.searchEtfs({ q: "沪深300", limit: 5 });
assert.equal(search.items[0].code, "510300");

const quote = await provider.getEtfQuote({ market: "SH", code: "510300" });
assert.equal(quote.id, "ETF:SH:510300");
assert.equal(quote.source, "eastmoney");

const history = await provider.getEtfHistory({ market: "SH", code: "510300", period: "day", range: "30d" });
assert.equal(history.etf.id, "ETF:SH:510300");
assert.equal(history.items.length, 2);
```

- [ ] **Step 2: Run the failing provider test**

Run: `node --test tests/eastmoney-provider.test.js`

Expected: FAIL because Eastmoney ETF methods are missing.

- [ ] **Step 3: Implement Eastmoney ETF mapping**

Add ETF list constants, `etfListSummary()`, `classifyEtfTheme()`, and provider methods. Reuse `getJson()`, `quoteFromEastmoney()`, `getHistory()`-style K-line parsing, and secid conversion.

- [ ] **Step 4: Wire Eastmoney methods through provider factory**

Ensure `createStockDataProvider({ dataSource: "eastmoney" })` returns the Eastmoney ETF methods.

- [ ] **Step 5: Run provider tests**

Run: `node --test tests/eastmoney-provider.test.js`

Expected: PASS.

### Task 4: Frontend ETF View

**Files:**
- Modify: `index.html`
- Test: `tests/stocks-module.test.js`

- [ ] **Step 1: Write failing frontend tests**

Add static tests asserting:

```js
assert.match(html, /id: "etf"/);
assert.match(html, /name: "行业ETF"/);
assert.match(html, /let etfUniverse = \[\]/);
assert.match(html, /function loadRealEtfUniverse\(\)/);
assert.match(html, /function renderStockEtfView\(\)/);
assert.match(html, /activeStockView === "etf"/);
assert.match(html, /data-stock-etf-row/);
assert.match(html, /data-stock-etf-category/);
assert.match(html, /data-stock-daily-chart/);
assert.doesNotMatch(extractFunction("getStockLimitBoardUniverse"), /etfUniverse/);
```

- [ ] **Step 2: Run the failing frontend test**

Run: `node --test tests/stocks-module.test.js`

Expected: FAIL because the ETF view is missing.

- [ ] **Step 3: Add ETF frontend state and API helpers**

Add ETF state variables, `mapApiEtf()`, `fetchEtfApi()`, `loadRealEtfUniverse()`, `loadRealEtfHistory()`, `getFilteredEtfs()`, and `getActiveEtf()` near the existing stock helpers.

- [ ] **Step 4: Add ETF render helpers**

Add `renderStockEtfView()`, `renderStockEtfFilters()`, `renderStockEtfList()`, and `renderStockEtfQuote()` reusing existing stock CSS classes and the K-line canvas structure.

- [ ] **Step 5: Add ETF interaction handlers**

Handle `[data-stock-etf-row]`, `[data-stock-etf-category]`, `[data-stock-etf-search]`, and `[data-stock-etf-sort]`. Row selection updates `activeEtfId` only.

- [ ] **Step 6: Run frontend tests**

Run: `node --test tests/stocks-module.test.js`

Expected: PASS.

### Task 5: Final Verification

**Files:**
- No new source files.

- [ ] **Step 1: Run targeted tests**

Run: `node --test tests/stocks-contracts.test.js tests/mock-server.test.js tests/eastmoney-provider.test.js tests/stocks-module.test.js`

Expected: PASS.

- [ ] **Step 2: Run full test suite if targeted tests pass**

Run: `node --test tests/*.test.js`

Expected: PASS.

- [ ] **Step 3: Inspect worktree**

Run: `git status --short`

Expected: ETF files changed plus pre-existing unrelated dirty files still visible. Do not revert unrelated user changes.
