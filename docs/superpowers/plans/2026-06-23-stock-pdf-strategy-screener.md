# Stock PDF Strategy Screener Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic condition screener presets with PDF-derived hot-money strategy rules computed from current quote and daily K-line data.

**Architecture:** Keep the implementation inside the existing `index.html` stock module. Add pure signal helpers, wire strategy ids through the existing condition matcher, and render compact match reasons in the existing result table. Extend `tests/stocks-module.test.js` using the current function-extraction test style.

**Tech Stack:** Static HTML/CSS/JavaScript, Node built-in test runner, existing `node --test` tests.

---

## File Structure

- Modify `index.html`
  - Replace `defaultStockStrategies` with PDF-derived built-in strategy cards.
  - Expand technical signal helpers near `getStockTechnicalSignals`.
  - Add `getStockMatchReasons`.
  - Update technical pattern select options and result row rendering.
- Modify `tests/stocks-module.test.js`
  - Extend `loadStockConditionMatcher()` to expose `stockMatchesTechnicalPattern`, then add `getStockMatchReasons` in the reason cycle.
  - Add tests for PDF strategy patterns and match reasons.
- Do not commit or reference `tmp/` OCR files.

---

### Task 1: Add Failing Tests for PDF-Derived Strategy Signals

**Files:**
- Modify: `tests/stocks-module.test.js`
- Test: `tests/stocks-module.test.js`

- [ ] **Step 1: Extend the test loader**

In `loadStockConditionMatcher()`, return the already-extracted technical pattern matcher:

```js
return {
  stockMatchesConditions,
  stockMatchesTechnicalPattern,
  getStockTechnicalSignals,
};
```

- [ ] **Step 2: Add the failing strategy test**

Add this test after `stock condition matcher supports hot-money short-term technical patterns`:

```js
test("stock condition matcher supports PDF-derived hot-money strategy patterns", () => {
  const { stockMatchesConditions, getStockTechnicalSignals } = loadStockConditionMatcher();
  const base = {
    id: "SH600777",
    market: "SH",
    code: "600777",
    name: "策略样本",
    boardType: "main",
    status: "normal",
    price: 10,
    changePercent: 10,
    volume: 300000,
    pe: 18,
    pb: 2,
    roe: 9,
  };

  const dragonFirstNegative = {
    ...base,
    name: "龙头首阴",
    changePercent: -2,
    dailyK: [
      { open: 10, high: 10.2, low: 9.8, close: 10, volume: 100000 },
      { open: 11, high: 11, low: 11, close: 11, volume: 110000 },
      { open: 12.1, high: 12.1, low: 12.1, close: 12.1, volume: 115000 },
      { open: 13.31, high: 13.31, low: 13.31, close: 13.31, volume: 120000 },
      { open: 13.5, high: 13.8, low: 12.9, close: 13.05, volume: 180000 },
    ],
  };
  assert.equal(stockMatchesConditions(dragonFirstNegative, { technicalPattern: "dragon-first-negative", logic: "and" }), true);

  const dragonPullback = {
    ...base,
    name: "龙回头",
    changePercent: 3,
    dailyK: [
      { open: 10, high: 10.2, low: 9.9, close: 10, volume: 100000 },
      { open: 11, high: 11, low: 11, close: 11, volume: 120000 },
      { open: 12.1, high: 12.1, low: 12.1, close: 12.1, volume: 130000 },
      { open: 11.9, high: 12.0, low: 11.1, close: 11.3, volume: 90000 },
      { open: 11.4, high: 11.95, low: 11.3, close: 11.85, volume: 170000 },
    ],
  };
  assert.equal(stockMatchesConditions(dragonPullback, { technicalPattern: "dragon-pullback", logic: "and" }), true);

  const multiBoardRelay = {
    ...base,
    name: "连板接力",
    dailyK: [
      { open: 10, high: 10.1, low: 9.9, close: 10, volume: 100000 },
      { open: 11, high: 11, low: 10.9, close: 11, volume: 160000 },
      { open: 12.1, high: 12.1, low: 12, close: 12.1, volume: 200000 },
    ],
  };
  const relaySignals = getStockTechnicalSignals(multiBoardRelay);
  assert.equal(relaySignals.multiBoardRelay, true);
  assert.equal(relaySignals.consecutiveLimitCount, 2);
  assert.equal(stockMatchesConditions(multiBoardRelay, { technicalPattern: "multi-board-relay", logic: "and" }), true);

  const trendBreakout = {
    ...base,
    name: "趋势突破",
    changePercent: 5,
    dailyK: [
      { open: 9.8, high: 10, low: 9.6, close: 9.9, volume: 100000 },
      { open: 9.9, high: 10.1, low: 9.7, close: 10, volume: 105000 },
      { open: 10, high: 10.2, low: 9.9, close: 10.1, volume: 110000 },
      { open: 10.1, high: 10.25, low: 10, close: 10.2, volume: 115000 },
      { open: 10.2, high: 10.35, low: 10.1, close: 10.3, volume: 120000 },
      { open: 10.35, high: 11, low: 10.3, close: 10.9, volume: 260000 },
    ],
  };
  assert.equal(stockMatchesConditions(trendBreakout, { technicalPattern: "strong-trend-breakout", logic: "and" }), true);

  const unknownPattern = { ...trendBreakout };
  assert.equal(stockMatchesConditions(unknownPattern, { technicalPattern: "unknown-pdf-pattern", logic: "and" }), false);
});
```

- [ ] **Step 3: Run test to verify RED**

Run:

```bash
node --test tests/stocks-module.test.js
```

Expected: FAIL because `dragon-first-negative`, `dragon-pullback`, `multi-board-relay`, and `strong-trend-breakout` do not exist yet.

---

### Task 2: Implement Technical Signals and Fail-Closed Pattern Matching

**Files:**
- Modify: `index.html`
- Test: `tests/stocks-module.test.js`

- [ ] **Step 1: Add helper functions near `getStockConsecutiveLimitCount`**

Add pure helpers that operate on the same daily series:

```js
function getStockLimitRunBeforeLatest(stock) {
  const series = getStockKLineSeries(stock);
  let count = 0;
  for (let index = series.length - 2; index > 0; index -= 1) {
    if (!isStockLimitUpBar(stock, series[index], series[index - 1])) break;
    count += 1;
  }
  return count;
}

function getStockRecentLimitStats(stock, lookback = 10) {
  const series = getStockKLineSeries(stock);
  const end = Math.max(0, series.length - 1);
  const start = Math.max(1, end - (Number(lookback) || 10));
  let count = 0;
  let high = 0;
  let lastIndex = -1;
  for (let index = start; index < end; index += 1) {
    const bar = series[index];
    const previous = series[index - 1];
    high = Math.max(high, Number(bar.high || bar.close) || 0);
    if (isStockLimitUpBar(stock, bar, previous)) {
      count += 1;
      lastIndex = index;
    }
  }
  return { count, high, lastIndex };
}

function hasStockReversalPullback(stock, limitIndex) {
  const series = getStockKLineSeries(stock);
  if (limitIndex < 1 || limitIndex >= series.length - 1) return false;
  const limitHigh = Number(series[limitIndex].high || series[limitIndex].close) || 0;
  return series.slice(limitIndex + 1, series.length - 1).some((bar, offset) => {
    const previous = series[limitIndex + offset];
    const close = Number(bar.close) || 0;
    const previousClose = Number(previous?.close) || 0;
    return close > 0 && (close < previousClose || close < limitHigh);
  });
}

function isStockWeakOrNegativeBar(bar, previous) {
  if (!bar) return false;
  const open = Number(bar.open) || 0;
  const close = Number(bar.close) || 0;
  const previousClose = Number(previous?.close) || 0;
  return close > 0 && ((open > 0 && close < open) || (previousClose > 0 && close < previousClose));
}

function getStockRecentHigh(stock, lookback = 10) {
  const series = getStockKLineSeries(stock);
  const end = Math.max(0, series.length - 1);
  return series.slice(Math.max(0, end - (Number(lookback) || 10)), end)
    .reduce((max, item) => Math.max(max, Number(item.high || item.close) || 0), 0);
}
```

- [ ] **Step 2: Expand `getStockTechnicalSignals`**

Add `ma10`, `ma20`, `previousMa10`, `limitRunBeforeLatest`, `recentLimitStats`, `recentHigh10`, `dragonFirstNegative`, `dragonPullback`, `multiBoardRelay`, and `strongTrendBreakout`.

- [ ] **Step 3: Update `stockMatchesTechnicalPattern`**

Map these ids:

```js
if (value === "dragon-first-negative") return signals.dragonFirstNegative;
if (value === "dragon-pullback") return signals.dragonPullback;
if (value === "multi-board-relay") return signals.multiBoardRelay;
if (value === "strong-trend-breakout") return signals.strongTrendBreakout;
```

Change the fallback from `return true;` to:

```js
return false;
```

- [ ] **Step 4: Run test to verify GREEN for signal matching**

Run:

```bash
node --test tests/stocks-module.test.js
```

Expected: tests still fail only where `getStockMatchReasons` or UI wiring has not been added. Existing technical-pattern tests should pass.

---

### Task 3: Add Match Reasons and Result Rendering

**Files:**
- Modify: `index.html`
- Modify: `tests/stocks-module.test.js`
- Test: `tests/stocks-module.test.js`

- [ ] **Step 1: Add failing reason test**

In `loadStockConditionMatcher()`, add this extraction and return value:

```js
${extractFunction("getStockMatchReasons")}

return {
  stockMatchesConditions,
  stockMatchesTechnicalPattern,
  getStockTechnicalSignals,
  getStockMatchReasons,
};
```

Add after the strategy signal test:

```js
test("stock match reasons explain PDF strategy matches", () => {
  const { getStockMatchReasons } = loadStockConditionMatcher();
  const stock = {
    id: "SH600888",
    market: "SH",
    code: "600888",
    name: "首板样本",
    boardType: "main",
    status: "normal",
    price: 11.44,
    changePercent: 10,
    volume: 420000,
    pe: 18,
    pb: 2,
    roe: 9,
    dailyK: [
      { open: 10, high: 10.2, low: 9.8, close: 10, volume: 100000 },
      { open: 10, high: 10.3, low: 9.9, close: 10.1, volume: 110000 },
      { open: 10.1, high: 10.35, low: 10, close: 10.2, volume: 120000 },
      { open: 10.2, high: 10.5, low: 10.1, close: 10.35, volume: 130000 },
      { open: 10.35, high: 10.5, low: 10.2, close: 10.4, volume: 140000 },
      { open: 10.4, high: 11.44, low: 10.3, close: 11.44, volume: 420000 },
    ],
  };

  const reasons = getStockMatchReasons(stock, { technicalPattern: "first-board", minVolumeRatio: "1.3", maPosition: "above-ma5" });
  assert.ok(reasons.includes("首板"));
  assert.ok(reasons.some(item => /^量比 /.test(item)));
  assert.ok(reasons.includes("站上MA5"));
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
node --test tests/stocks-module.test.js
```

Expected: FAIL because `getStockMatchReasons` does not exist.

- [ ] **Step 3: Implement `getStockMatchReasons` in `index.html`**

Add a pure helper after `stockMatchesTechnicalPattern`:

```js
function getStockMatchReasons(stock, conditions = {}) {
  const signals = getStockTechnicalSignals(stock);
  const reasons = [];
  const pattern = String(conditions.technicalPattern || "all");
  if (pattern === "first-board" && signals.firstBoard) reasons.push("首板");
  if (pattern === "oversold-first-board" && signals.oversoldFirstBoard) reasons.push("超跌首板");
  if (pattern === "reversal-board" && signals.reversalBoard) reasons.push("反包板");
  if (pattern === "dragon-first-negative" && signals.dragonFirstNegative) reasons.push("龙头首阴");
  if (pattern === "dragon-pullback" && signals.dragonPullback) reasons.push("龙回头");
  if (pattern === "third-one-line-board" && signals.thirdOneLineBoard) reasons.push("三板一字");
  if (pattern === "multi-board-relay" && signals.multiBoardRelay) reasons.push(`${signals.consecutiveLimitCount}连板`);
  if (pattern === "strong-trend-breakout" && signals.strongTrendBreakout) reasons.push("趋势突破");
  if (signals.limitUp) reasons.push("涨停");
  if (signals.volumeRatio > 0) reasons.push(`量比 ${signals.volumeRatio.toFixed(1)}`);
  if (signals.aboveMa5) reasons.push("站上MA5");
  if (signals.recentLimitCount > 0) reasons.push(`近10日${signals.recentLimitCount}次涨停`);
  return [...new Set(reasons)].slice(0, 5);
}
```

- [ ] **Step 4: Render reasons in result rows and details**

In `renderStockFilterResultTable`, add:

```js
const reasons = getStockMatchReasons(stock, getCombinedStockConditions());
```

Inside `.stock-name-cell`, add:

```html
<span class="stock-code">${reasons.length ? escapeHTML(reasons.join(" · ")) : escapeHTML(`${stock.industry} · ${formatStockDataMeta(stock)}`)}</span>
```

Keep the original industry/meta line when no reason exists.

- [ ] **Step 5: Run test to verify GREEN for reasons**

Run:

```bash
node --test tests/stocks-module.test.js
```

Expected: strategy and reason tests pass, unless UI wiring tests still expect old labels.

---

### Task 4: Replace Built-In Strategies and UI Wiring

**Files:**
- Modify: `index.html`
- Modify: `tests/stocks-module.test.js`
- Test: `tests/stocks-module.test.js`

- [ ] **Step 1: Add failing UI wiring assertions**

Update `stock filter tags, guru strategies, sorting, and pagination are wired` so it expects:

```js
assert.match(html, /PDF策略/);
assert.match(html, /赵老哥首板/);
assert.match(html, /林疯狂龙回头/);
assert.match(html, /作手新一三板一字/);
assert.match(html, /data-stock-risk/);
assert.doesNotMatch(html, /低市盈率 2/);
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
node --test tests/stocks-module.test.js
```

Expected: FAIL because old strategy labels are still present and new labels do not exist.

- [ ] **Step 3: Replace `defaultStockStrategies`**

Replace the current built-ins with:

```js
const defaultStockStrategies = [
  { id: "pdf-first-board", name: "赵老哥首板", desc: "首板涨停、放量、站上MA5，偏T+1超短", risk: "进攻", source: "PDF: 赵老哥交易系统总结", conditions: { technicalPattern: "first-board", minVolumeRatio: "1.3", maPosition: "above-ma5", status: "非ST", excludeExchange: "北交所" }, builtin: true },
  { id: "pdf-oversold-first-board", name: "作手新一超跌一板", desc: "短期下跌后的首板修复，要求放量", risk: "观察", source: "PDF: 作手新一主要战法", conditions: { technicalPattern: "oversold-first-board", minVolumeRatio: "1.2", status: "非ST", excludeExchange: "北交所" }, builtin: true },
  { id: "pdf-reversal-board", name: "反包板", desc: "近几日涨停后调整，再度涨停反包前高", risk: "进攻", source: "PDF: 林疯狂 / 作手新一反包", conditions: { technicalPattern: "reversal-board", minVolumeRatio: "1.2", status: "非ST", excludeExchange: "北交所" }, builtin: true },
  { id: "pdf-dragon-first-negative", name: "龙头首阴", desc: "连板后首个弱分歧，当前仅按量价结构观察", risk: "观察", source: "PDF: 林疯狂 / 乔帮主首阴", conditions: { technicalPattern: "dragon-first-negative", status: "非ST", excludeExchange: "北交所" }, builtin: true },
  { id: "pdf-dragon-pullback", name: "林疯狂龙回头", desc: "连板强势股回踩后放量转强", risk: "进攻", source: "PDF: 林疯狂总结", conditions: { technicalPattern: "dragon-pullback", minVolumeRatio: "1.2", status: "非ST", excludeExchange: "北交所" }, builtin: true },
  { id: "pdf-third-one-line", name: "作手新一三板一字", desc: "连续一字第三板，小分歧排板观察", risk: "高风险", source: "PDF: 作手新一独创战法", conditions: { technicalPattern: "third-one-line-board", status: "非ST", excludeExchange: "北交所" }, builtin: true },
  { id: "pdf-multi-board-relay", name: "连板接力", desc: "2板以上连续涨停，按高度与量能观察", risk: "高风险", source: "PDF: 作手新一连板战法", conditions: { technicalPattern: "multi-board-relay", status: "非ST", excludeExchange: "北交所" }, builtin: true },
  { id: "pdf-strong-trend-breakout", name: "强势趋势突破", desc: "多头均线、放量突破近高", risk: "观察", source: "PDF: 强势股趋势突破案例", conditions: { technicalPattern: "strong-trend-breakout", minVolumeRatio: "1.3", maPosition: "above-ma5", status: "非ST", excludeExchange: "北交所" }, builtin: true },
];
```

- [ ] **Step 4: Update strategy card rendering**

In `renderStockStrategies()`, render built-in risk/source metadata:

```html
${strategy.risk ? `<span class="stock-strategy-meta" data-stock-risk="${escapeHTML(strategy.risk)}">${escapeHTML(strategy.risk)} · ${escapeHTML(strategy.source || "PDF策略")}</span>` : ""}
```

Change the group title from `游资短线模式` to `PDF策略`.

- [ ] **Step 5: Update technical pattern select options**

Add options for:

```html
<option value="dragon-first-negative">龙头首阴</option>
<option value="dragon-pullback">龙回头</option>
<option value="multi-board-relay">连板接力</option>
<option value="strong-trend-breakout">强势趋势突破</option>
```

Keep existing `first-board`, `reversal-board`, `oversold-first-board`, and `third-one-line-board`.

- [ ] **Step 6: Update label helper**

Update `getStockTechnicalSignalLabel()` to prefer:

```js
if (signals.multiBoardRelay) return `${signals.consecutiveLimitCount}连板`;
if (signals.thirdOneLineBoard) return "三板一字";
if (signals.dragonFirstNegative) return "龙头首阴";
if (signals.dragonPullback) return "龙回头";
if (signals.strongTrendBreakout) return "趋势突破";
```

- [ ] **Step 7: Run test to verify GREEN for UI wiring**

Run:

```bash
node --test tests/stocks-module.test.js
```

Expected: all `stocks-module.test.js` tests pass.

---

### Task 5: Regression Verification

**Files:**
- No additional file edits expected.

- [ ] **Step 1: Run focused stock module tests**

Run:

```bash
node --test tests/stocks-module.test.js
```

Expected: exit code 0.

- [ ] **Step 2: Run stock contract/server smoke tests that may touch screener behavior**

Run:

```bash
node --test tests/stocks-contracts.test.js tests/mock-server.test.js
```

Expected: exit code 0.

- [ ] **Step 3: Check final diff**

Run:

```bash
git diff -- index.html tests/stocks-module.test.js docs/superpowers/plans/2026-06-23-stock-pdf-strategy-screener.md
```

Expected: only the strategy screener implementation, tests, and implementation plan are changed.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add index.html tests/stocks-module.test.js docs/superpowers/plans/2026-06-23-stock-pdf-strategy-screener.md
git commit -m "feat: add pdf strategy stock screener"
```

Expected: commit succeeds and excludes `tmp/` OCR artifacts.

---

## Self-Review

- Spec coverage: all PDF-derived strategy mappings in the design have a matching implementation task and tests.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: strategy ids use `pdf-*` for cards and technical pattern ids use matcher ids such as `dragon-pullback`.
