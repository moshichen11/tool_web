# Stock API Client Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep stock universes and K-line charts usable through transient API/provider failures while displaying the correct failure layer.

**Architecture:** Keep the existing backend unchanged because `server/` is sandbox read-only. Extend the browser API client with structured HTTP errors, one bounded retry for cacheable GET requests, and an IndexedDB cache with an in-memory fallback. On final failure, return a retained cached response marked stale; loaders render it and show a non-blocking warning.

**Tech Stack:** Browser Fetch API, IndexedDB, plain JavaScript in `index.html`, and `node:test`.

## Global Constraints

- Modify only root-level files and writable tests; preserve all existing user changes.
- Add no dependency and do not fabricate market data.
- Cache only stock/ETF universe and history GET responses.
- Retain universe responses for 7 days and history for 30 days.
- Retry a cacheable GET once after a transient network error or HTTP 502/503/504.
- Raw fetch rejection without cached data remains a local/network error.
- Structured `MARKET_DATA_*` HTTP errors remain upstream-provider errors.
- Cached fallback returns `stale: true`, `x-cache: CLIENT-STALE`, and never replaces a newer successful cache entry.

---

### Task 1: Structured Errors and Bounded Retry

**Files:**
- Modify: `tests/stocks-module.test.js`
- Modify: `index.html`

**Interfaces:**
- Produces: `createStockApiError(response, body)` with `name`, `status`, `code`, and `traceId`.
- Produces: `shouldRetryStockApiRequest(error, method, attempt)`.
- Modifies: `fetchStockApi(path, options)` to make at most two attempts for cacheable GET requests.

- [ ] Add tests proving a 502 response becomes a `StockApiError`, a 502 then 200 succeeds after two calls, and a raw `TypeError` remains the local/network message.
- [ ] Run `node --test tests/stocks-module.test.js` and observe failures caused by missing structured fields and retry.
- [ ] Add the minimal helpers and loop in `index.html`; preserve response status/body instead of throwing a plain `Error`.
- [ ] Run the same test file and verify all tests pass.

### Task 2: IndexedDB Cache and Stale Fallback

**Files:**
- Modify: `tests/stocks-module.test.js`
- Modify: `index.html`

**Interfaces:**
- Produces: `getStockApiCacheRetentionMs(path, options)`.
- Produces: `readStockApiCache(cacheKey)` and `writeStockApiCache(cacheKey, value, retentionMs)`.
- Produces: `getStockApiCachedResponse(record)` marked `CLIENT-STALE`.
- Consumes: only successful universe/history JSON bodies.

- [ ] Add tests proving the memory fallback round-trips values without IndexedDB, expired records are rejected, successful cacheable GET results are stored, and exhausted transient failures return retained cached data.
- [ ] Run `node --test tests/stocks-module.test.js` and observe failures caused by missing cache functions.
- [ ] Implement IndexedDB database `tool_web_stock_cache`, version 1, store `responses`, plus an in-memory fallback. Store `{ key, value, cachedAt, retainUntil }` and delete expired records on read.
- [ ] Update `fetchStockApi` to write fresh success in the background and read retained cache only after final failure.
- [ ] Run the same test file and verify all tests pass.

### Task 3: Stale Rendering and Regression Verification

**Files:**
- Modify: `tests/stocks-module.test.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: response `stale` boolean.
- Produces: warning `上游行情源暂时不可用，当前显示缓存行情。` while retaining universe/history arrays.

- [ ] Add tests showing a stale universe still makes `stockApiReady` true and stale history keeps/loads chart arrays with a warning.
- [ ] Run the tests and observe the missing-warning failures.
- [ ] Update stock and ETF universe/history loaders to treat stale data as successful display data, set warning status, and never clear arrays because of the stale flag.
- [ ] Run `node --test tests/stocks-module.test.js` and verify GREEN.
- [ ] Run `node --test tests/*.test.js`, then `git diff --check` and inspect the final diff for unrelated changes.
