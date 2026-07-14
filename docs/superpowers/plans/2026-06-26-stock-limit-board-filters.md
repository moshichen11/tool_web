# Stock Limit Board Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add default-on ST and Growth Enterprise Market exclusion filters to the existing `连板` stock subview.

**Architecture:** Keep the change inside the existing stock module in `index.html`. Reuse `getStockStatus()` and `getStockBoardCategory()` for classification, and filter before quote limit-up candidate selection so grouping and background K-line loading stay aligned.

**Tech Stack:** Static HTML/CSS/JavaScript in `index.html`, existing Node `node:test` source tests in `tests/stocks-module.test.js`, no new dependencies.

---

### Task 1: Helper And Source Tests

**Files:**
- Modify: `tests/stocks-module.test.js`
- Modify: `index.html`

- [ ] **Step 1: Write failing tests**

Add assertions that `stockPassesLimitBoardFilters()` defaults to excluding ST and `SZ 30` Growth Enterprise Market stocks, and that the limit-board sidebar renders `data-stock-limit-board-filter`.

- [ ] **Step 2: Verify failure**

Run: `node --test tests/stocks-module.test.js`

Expected: FAIL with missing `stockPassesLimitBoardFilters` or missing filter control markup.

- [ ] **Step 3: Implement minimal helper and UI**

Add default-on state booleans, a `stockPassesLimitBoardFilters(stock)` helper, a `renderStockLimitBoardFilters()` helper, and call the filter helper inside `getStockLimitBoardUniverse()`.

- [ ] **Step 4: Verify pass**

Run: `node --test tests/stocks-module.test.js`

Expected: PASS for the focused module tests.

### Task 2: Interaction

**Files:**
- Modify: `tests/stocks-module.test.js`
- Modify: `index.html`

- [ ] **Step 1: Write failing interaction assertions**

Assert that `toggleStockLimitBoardFilter(filter)` exists and that click handling calls it from `data-stock-limit-board-filter`.

- [ ] **Step 2: Verify failure**

Run: `node --test tests/stocks-module.test.js`

Expected: FAIL with missing toggle handler.

- [ ] **Step 3: Implement toggle handler**

Toggle the chosen boolean, reset the active board level, increment the history load token to supersede old candidate loads, refresh the limit-board panel, and schedule history loading.

- [ ] **Step 4: Verify all tests**

Run: `node --test tests/stocks-module.test.js tests/stocks-contracts.test.js`

Expected: PASS.
