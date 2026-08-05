# 策略选股 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace condition-led stock screening with a free, end-of-day strategy snapshot that presents separate short-term and swing-trade research candidates without changing normal daily-K usage.

**Architecture:** A Node ESM strategy engine evaluates a prefiltered set of main-board daily bars and produces an explainable JSON snapshot. A GitHub Actions schedule invokes a scanner that writes static snapshot assets; the GitHub Pages UI reads those assets and renders a strategy-first view. Existing on-demand stock detail and daily-K code remain independent from the scanner and snapshot viewer.

**Tech Stack:** Node.js 22 ESM, GitHub Actions, GitHub Pages static JSON, vanilla browser JavaScript/CSS in `index.html`, Node built-in test runner.

## Global Constraints

- Include only listed, normal-status, non-ST, non-suspended A-share main-board stocks in strategy candidates.
- Exclude delisted, ST, suspended, STAR Market, ChiNext, and Beijing Stock Exchange stocks from strategy candidates; do not remove them from ordinary stock information.
- Keep existing daily-K API requests, history cache, charts, and detail-page behavior unchanged.
- Run the free scan after 16:10 China Standard Time on weekdays; label delayed or stale source data instead of presenting it as current.
- Limit deep daily-K retrieval to the top 600 liquid prefiltered stocks and use a maximum of two emitted candidates per industry per horizon.
- Emit research/observation candidates only. Do not include buy/sell calls, target returns, win rates, or profitability claims.
- Use `node --test` for all automated tests; do not add third-party dependencies.

---

## File Structure

- Create `src/stocks/strategy-selection-config.json`: versioned thresholds, strategy catalog, labels, and per-horizon display limits.
- Create `src/stocks/strategy-selection-engine.mjs`: pure daily-K eligibility, indicators, strategy matching, scoring, industry caps, and snapshot construction.
- Create `src/stocks/strategy-snapshot-runner.mjs`: provider orchestration, main-board prefiltering, bounded history loading, trade-date validation, and static artifact generation.
- Create `scripts/generate-strategy-snapshot.mjs`: command-line entry point that invokes the runner with the Eastmoney provider and writes status/snapshot assets.
- Create `.github/workflows/generate-strategy-snapshot.yml`: weekday scheduled and manual GitHub Actions workflow that commits changed static artifacts.
- Create `data/strategy-selection/.gitkeep`: retains the publish directory before the first successful run.
- Modify `index.html`: replace the condition-led filter view with a strategy snapshot view and preserve normal daily-K navigation.
- Create `tests/strategy-selection-engine.test.js`: deterministic rule, eligibility, score, and industry-cap tests.
- Create `tests/strategy-snapshot-runner.test.js`: fake-provider scanner, stale-data, failure, and artifact tests.
- Modify `tests/stocks-module.test.js`: assert the strategy snapshot UI, stale-state copy, and daily-K integration without legacy condition controls.
- Create `tests/strategy-snapshot-workflow.test.js`: assert workflow schedule, Node version, permissions, command, and guarded commit behavior.

## Task 1: Build the Pure Strategy Engine and Versioned Catalog

**Files:**
- Create: `src/stocks/strategy-selection-config.json`
- Create: `src/stocks/strategy-selection-engine.mjs`
- Test: `tests/strategy-selection-engine.test.js`

**Interfaces:**
- Consumes: stock summaries with `market`, `code`, `name`, `industry`, `boardType`, `status`, `amount`, `volume`, and a `dailyK` array of `{ time, open, high, low, close, volume, amount }`.
- Produces: `buildStrategySnapshot({ stocks, config, dataDate, generatedAt, source, coverage })`, returning `{ schemaVersion, dataDate, generatedAt, source, coverage, shortTerm, swing }`.
- Produces: `isStrategyEligible(stock)`, `getIndicators(stock, config)`, and `matchStrategies(stock, context, config)` for unit-level verification.

- [ ] **Step 1: Write failing eligibility and strategy tests**

```js
test("strategy engine keeps only liquid normal main-board stocks", async () => {
  const { isStrategyEligible } = await import("../src/stocks/strategy-selection-engine.mjs");
  assert.equal(isStrategyEligible(mainBoardStock), true);
  assert.equal(isStrategyEligible({ ...mainBoardStock, name: "*ST 样本" }), false);
  assert.equal(isStrategyEligible({ ...mainBoardStock, status: "suspended" }), false);
  assert.equal(isStrategyEligible({ ...mainBoardStock, boardType: "gem" }), false);
});

test("strategy engine emits explainable short-term and swing candidates", async () => {
  const { buildStrategySnapshot } = await import("../src/stocks/strategy-selection-engine.mjs");
  const snapshot = buildStrategySnapshot({ stocks: fixtureStocks, config, dataDate: "2026-08-04", generatedAt: "2026-08-04T08:10:00.000Z", source: "fixture", coverage: { eligible: 4, prefetched: 4, evaluated: 4 } });
  assert.ok(snapshot.shortTerm.some(item => item.strategyId === "upper_shadow_reversal"));
  assert.ok(snapshot.swing.some(item => item.strategyId === "trend_breakout"));
  assert.match(snapshot.shortTerm[0].invalidation, /跌破/);
  assert.ok(snapshot.shortTerm[0].reasonCodes.length > 0);
});
```

- [ ] **Step 2: Run the new tests to verify they fail before implementation**

Run: `node --test tests/strategy-selection-engine.test.js`

Expected: FAIL because `strategy-selection-engine.mjs` does not exist.

- [ ] **Step 3: Define catalog and implement deterministic indicators**

Create `strategy-selection-config.json` with schema version `1.0`, `prefilter.maxStocks: 600`, `output.maxPerIndustry: 2`, `output.maxPerHorizon: 10`, MA windows of 5/10/20, and five enabled strategies: `leader_reacceleration`, `upper_shadow_reversal`, `strong_pullback_reclaim`, `trend_breakout`, and `trend_pullback`.

Implement the exported engine functions with these exact contracts:

```js
export function isStrategyEligible(stock) { /* normal, listed main-board and tradable */ }
export function getIndicators(stock, config) { /* MA, relative returns, volume/amount ratios and candles */ }
export function matchStrategies(stock, context, config) { /* returns immutable strategy matches */ }
export function buildStrategySnapshot({ stocks, config, dataDate, generatedAt, source, coverage }) { /* JSON-safe snapshot */ }
```

Implement short-term matches as: industry-strength/liquidity leader reacceleration, two-day upper-shadow-or-bearish-candle engulfing reversal with volume confirmation, and a 2–8-day strong-stock pullback reclaim. Implement swing matches as MA5/MA10/MA20 aligned 20-day breakout with volume confirmation and rising-MA20 pullback/reclaim. Attach a strategy-specific `observationReference`, `invalidation`, `riskLabel`, and non-empty `reasonCodes` to every match.

Rank within each horizon by strategy score, then liquidity; apply the two-per-industry cap before the ten-item display limit. Never merge short-term and swing ranks.

- [ ] **Step 4: Run unit tests and the existing selection tests**

Run: `node --test tests/strategy-selection-engine.test.js tests/stocks-module.test.js`

Expected: PASS. Existing tests still pass because the old inline selector has not yet been removed from the page.

- [ ] **Step 5: Commit the engine and catalog**

```powershell
git add src/stocks/strategy-selection-config.json src/stocks/strategy-selection-engine.mjs tests/strategy-selection-engine.test.js
git commit -m "feat: add strategy selection engine"
```

## Task 2: Generate Validated Static Snapshots from Market Data

**Files:**
- Create: `src/stocks/strategy-snapshot-runner.mjs`
- Create: `scripts/generate-strategy-snapshot.mjs`
- Create: `data/strategy-selection/.gitkeep`
- Test: `tests/strategy-snapshot-runner.test.js`

**Interfaces:**
- Consumes: a provider with `getStockUniverse({ limit })` and `getHistory({ market, code, period, range })`, the catalog object, and `now()`.
- Produces: `runStrategySnapshot({ provider, config, now, outputDirectory })`, resolving to `{ status, dataDate, snapshotPath, statusPath }`.
- Produces: `status.json`, `latest.json`, dated `<YYYY-MM-DD>.json`, and `index.json` in `data/strategy-selection`.

- [ ] **Step 1: Write failing scanner artifact tests with a fake provider**

```js
test("runner writes latest, dated, index and success status for current daily bars", async () => {
  const result = await runStrategySnapshot({ provider: fakeProvider, config, now: () => new Date("2026-08-04T08:15:00.000Z"), outputDirectory });
  assert.equal(result.status, "ready");
  assert.equal(JSON.parse(readFileSync(join(outputDirectory, "latest.json"))).dataDate, "2026-08-04");
  assert.equal(JSON.parse(readFileSync(join(outputDirectory, "status.json"))).state, "ready");
});

test("runner preserves latest snapshot when the upstream daily bar is stale", async () => {
  writeFileSync(join(outputDirectory, "latest.json"), JSON.stringify({ dataDate: "2026-08-01" }));
  const result = await runStrategySnapshot({ provider: staleProvider, config, now: () => new Date("2026-08-04T08:15:00.000Z"), outputDirectory });
  assert.equal(result.status, "stale");
  assert.equal(JSON.parse(readFileSync(join(outputDirectory, "latest.json"))).dataDate, "2026-08-01");
});
```

- [ ] **Step 2: Run the scanner tests to verify they fail**

Run: `node --test tests/strategy-snapshot-runner.test.js`

Expected: FAIL because `strategy-snapshot-runner.mjs` does not exist.

- [ ] **Step 3: Implement bounded scanning and safe artifact writes**

In `runStrategySnapshot`, request the stock universe, filter with `isStrategyEligible`, sort by current `amount` descending and absolute `changePercent` descending, retain at most 600 stocks, then load `period: "day", range: "90d"` histories with a concurrency limit of four. Skip records without enough bars; attach normalized `dailyK` only to loaded records.

Derive the trade date from the latest completed daily bar and compare it to the China Standard Time calendar date represented by `now()`. For a missing, stale, or failed scan, write `status.json` with `{ state: "stale" | "failed", attemptedAt, message, lastSuccessfulDataDate }`, retain all prior candidate files, and return without an error exit. For a valid scan, call `buildStrategySnapshot`, write `latest.json`, the dated file, and `index.json` with the most recent 60 dates, then write `{ state: "ready", attemptedAt, dataDate, source }` to `status.json`.

In the CLI script, load the catalog, call `createEastmoneyProvider({})`, call the runner, log the JSON result, and set a nonzero exit code only for invalid local configuration or filesystem write errors.

- [ ] **Step 4: Run scanner, engine, and provider regression tests**

Run: `node --test tests/strategy-snapshot-runner.test.js tests/strategy-selection-engine.test.js tests/eastmoney-provider.test.js`

Expected: PASS. The fake provider proves no network is required for tests.

- [ ] **Step 5: Commit scanner artifacts and tests**

```powershell
git add src/stocks/strategy-snapshot-runner.mjs scripts/generate-strategy-snapshot.mjs data/strategy-selection/.gitkeep tests/strategy-snapshot-runner.test.js
git commit -m "feat: generate strategy snapshots"
```

## Task 3: Publish Snapshots on a Free Weekday Schedule

**Files:**
- Create: `.github/workflows/generate-strategy-snapshot.yml`
- Create: `tests/strategy-snapshot-workflow.test.js`

**Interfaces:**
- Consumes: `scripts/generate-strategy-snapshot.mjs` and writable repository contents permission.
- Produces: committed changes under `data/strategy-selection/` after successful or stale scan attempts.

- [ ] **Step 1: Write the failing workflow-contract test**

```js
test("strategy snapshot workflow has weekday post-close schedule and guarded commit", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  assert.match(workflow, /cron:\s*["']10 8 \* \* 1-5["']/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /node-version:\s*["']22["']/);
  assert.match(workflow, /node scripts\/generate-strategy-snapshot\.mjs/);
  assert.match(workflow, /git diff --quiet \|\|/);
});
```

- [ ] **Step 2: Run the workflow test to verify it fails**

Run: `node --test tests/strategy-snapshot-workflow.test.js`

Expected: FAIL because the workflow file does not exist.

- [ ] **Step 3: Add the GitHub Actions workflow**

Create a workflow named `Generate strategy snapshot` with `on.schedule` cron `10 8 * * 1-5` and `workflow_dispatch`. Set `permissions.contents: write`, use `actions/checkout@v4`, `actions/setup-node@v4` with Node 22, run `node scripts/generate-strategy-snapshot.mjs`, configure the bot identity, and commit only when `git diff --quiet` reports changed generated assets. Use commit message `chore: update strategy snapshot`.

- [ ] **Step 4: Run the workflow test and full local suite**

Run: `node --test tests/strategy-snapshot-workflow.test.js tests/strategy-snapshot-runner.test.js tests/strategy-selection-engine.test.js`

Expected: PASS.

- [ ] **Step 5: Commit workflow support**

```powershell
git add .github/workflows/generate-strategy-snapshot.yml tests/strategy-snapshot-workflow.test.js
git commit -m "ci: schedule strategy snapshot generation"
```

## Task 4: Replace the Condition-Led UI with a Snapshot Strategy View

**Files:**
- Modify: `index.html:1381-1936` (replace condition-filter-specific styles with strategy snapshot styles)
- Modify: `index.html:4093-4205` (replace filter labels and state with snapshot state)
- Modify: `index.html:9000-9240` (replace legacy strategy/filter rendering with snapshot rendering)
- Modify: `tests/stocks-module.test.js`

**Interfaces:**
- Consumes: `./data/strategy-selection/latest.json`, `./data/strategy-selection/status.json`, and `./data/strategy-selection/index.json`.
- Produces: `loadStrategySnapshot()`, `renderStrategySelectionPage()`, `renderStrategyCandidateTable(horizon)`, and `openStrategyCandidate(candidate)` in `index.html`.
- Preserves: `loadRealStockHistory`, `fetchFastMarketHistory`, `fetchStockApi`, stock-detail selection, and all existing daily-K interfaces.

- [ ] **Step 1: Write failing browser-module tests for snapshot rendering and K-line handoff**

```js
test("strategy view loads static snapshots and presents separate horizons", () => {
  const page = loadStrategySnapshotView({ snapshot: fixtureSnapshot, status: { state: "ready" } });
  assert.match(page.render(), /短线候选/);
  assert.match(page.render(), /波段候选/);
  assert.match(page.render(), /研究候选/);
  assert.doesNotMatch(page.render(), /多条件筛选自选股/);
});

test("strategy candidate opens the existing stock detail and leaves daily-K fetching intact", () => {
  const page = loadStrategySnapshotView({ snapshot: fixtureSnapshot, status: { state: "ready" } });
  page.openStrategyCandidate(fixtureSnapshot.shortTerm[0]);
  assert.deepEqual(page.opened(), { market: "SH", code: "600001" });
});
```

- [ ] **Step 2: Run the focused UI tests to verify they fail**

Run: `node --test tests/stocks-module.test.js --test-name-pattern="strategy view|strategy candidate"`

Expected: FAIL because the snapshot view helpers do not exist.

- [ ] **Step 3: Implement snapshot state, rendering, and graceful stale handling**

Rename the visible feature label to `策略选股` while retaining the internal `filter` route identifier to avoid unrelated navigation changes. Add state for latest snapshot, status, historical index, loading state, and selected horizon/date. `loadStrategySnapshot()` fetches all three static files with `cache: "no-store"`; a missing first snapshot displays a neutral “尚未生成收盘策略快照” panel, and a stale/failed status displays the last valid date and the status message.

Replace the condition form, quick tags, custom strategy editor, and browser-side history queue for this view with four sections: short-term candidates, swing candidates, strategy/data-limit explanation, and historical snapshot selector. Candidate rows show score, strategy, reason labels, observation reference, invalidation, risk label, liquidity, trade date, and a `研究候选，非交易指令` label. Keep the existing open-detail action; it resolves the candidate by market/code and uses the current detail/history flow, never copying or overwriting `dailyK`.

- [ ] **Step 4: Run focused UI tests and all stock-module tests**

Run: `node --test tests/stocks-module.test.js`

Expected: PASS. Daily-K tests remain green and no visible label says `条件选股`.

- [ ] **Step 5: Commit the UI replacement**

```powershell
git add index.html tests/stocks-module.test.js
git commit -m "feat: show strategy selection snapshots"
```

## Task 5: Verify End-to-End Contracts and Document the Operational Boundary

**Files:**
- Modify: `docs/superpowers/specs/2026-08-04-strategy-stock-selection-design.md`
- Modify: `docs/superpowers/plans/2026-08-04-strategy-stock-selection.md`

**Interfaces:**
- Consumes: generated JSON schema, workflow file, and browser snapshot loader.
- Produces: an explicit operator checklist for enabling Actions and confirming the first generated snapshot.

- [ ] **Step 1: Add a failing contract assertion for the published data files**

```js
test("published strategy assets use the documented relative paths", () => {
  const html = readFileSync(indexPath, "utf8");
  assert.match(html, /\.\/data\/strategy-selection\/latest\.json/);
  assert.match(html, /\.\/data\/strategy-selection\/status\.json/);
  assert.match(html, /\.\/data\/strategy-selection\/index\.json/);
});
```

- [ ] **Step 2: Run the contract assertion to verify it fails before the final wiring is present**

Run: `node --test tests/stocks-module.test.js --test-name-pattern="published strategy assets"`

Expected: FAIL until Task 4 adds every path.

- [ ] **Step 3: Add the operator checklist and final contract test**

Append a concise `运营启用` section to the design document: enable GitHub Actions write permission, run `Generate strategy snapshot` manually once after a market close, verify `data/strategy-selection/latest.json`, and verify the GitHub Pages strategy view shows its data date. State that GitHub’s schedule can be delayed and that the status label, not page load time, determines freshness.

Place the published-asset assertion in the existing snapshot UI test block so it checks the final HTML paths without duplicating test harness code.

- [ ] **Step 4: Run complete regression and static checks**

Run: `node --test tests/*.test.js`

Run: `git diff --check`

Expected: all tests PASS and no whitespace errors.

- [ ] **Step 5: Commit documentation and verification**

```powershell
git add docs/superpowers/specs/2026-08-04-strategy-stock-selection-design.md docs/superpowers/plans/2026-08-04-strategy-stock-selection.md tests/stocks-module.test.js
git commit -m "docs: document strategy snapshot operations"
```

## Self-Review

- Spec coverage: Tasks 1–2 implement the defined five daily-K strategies, eligibility, scores, reasons, invalidations, industry limits, static snapshots, stale protection, and no daily-K mutation. Task 3 implements free post-close scheduling. Task 4 implements the four strategy views and existing daily-K handoff. Task 5 covers documented enablement and full verification.
- Placeholder scan: no unfinished markers, deferred steps, or unspecified error-handling language remain. Each task gives exact files, interfaces, test names, commands, and implementation behavior.
- Type consistency: Task 1 defines the snapshot `{ shortTerm, swing }` shape; Task 2 writes that shape to static assets; Task 4 consumes those exact keys. Task 2 defines `status.json`; Task 4 consumes its `state`, data date, and message fields. All workflow paths match the scanner output directory.
