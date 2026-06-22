# Stock Chart Window Preload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make daily K chart selection feel instant for stocks on the current list page and nearby pages.

**Architecture:** Extend the existing frontend-only chart preload path. Keep `loadRealStockHistory()` as the single history loader and reuse its in-flight/cache key behavior, while changing candidate selection from a small visible slice to a page-radius queue.

**Tech Stack:** Static `index.html` JavaScript, existing `/v1/stocks/{market}/{code}/history` API, Node `node --test` contract tests.

---

### Task 1: Test The Preload Policy

**Files:**
- Modify: `tests/stocks-module.test.js`

- [ ] Add assertions that the stock chart preload defines a page size, a nearby page radius, and a per-run request limit.
- [ ] Add assertions that candidate selection calculates the current page from `stockDailyVirtualStart`, includes pages around the current page, and caps each preload run.
- [ ] Run `node --test tests/stocks-module.test.js` and confirm the new test fails before implementation.

### Task 2: Implement Nearby Page Preloading

**Files:**
- Modify: `index.html`

- [ ] Replace the fixed `STOCK_UNIVERSE_CHART_PREFETCH_LIMIT` policy with page-based constants.
- [ ] Update `getStockUniverseChartPreloadStocks()` so it adds the active stock first, then stocks from the current page and five pages on either side.
- [ ] Keep `preloadStockUniverseCharts()` sequential and capped per run so click-triggered foreground loads stay responsive and backend limits are respected.
- [ ] Keep existing scheduling behavior for scroll/search and in-flight request reuse.

### Task 3: Verify

**Files:**
- Test: `tests/stocks-module.test.js`

- [ ] Run `node --test tests/stocks-module.test.js`.
- [ ] Inspect `git diff -- index.html tests/stocks-module.test.js docs/superpowers/plans/2026-06-22-stock-chart-window-preload.md`.
