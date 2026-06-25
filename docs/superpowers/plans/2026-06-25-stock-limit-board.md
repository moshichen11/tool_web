# Stock Limit Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-market latest-trading-day `连板` stock subview that groups stocks from `1板` through the highest board and shows the selected stock's daily K chart.

**Architecture:** Keep the first pass inside the existing `index.html` stock module. Add pure limit-board grouping helpers next to the existing technical signal helpers, then add a dedicated stock subview that reuses the current daily K chart functions and background history loader.

**Tech Stack:** Static HTML/CSS/JavaScript in `index.html`, existing Node `node:test` coverage in `tests/stocks-module.test.js`, no new dependencies.

---

### Task 1: Limit-Board Grouping Helpers

**Files:**
- Modify: `tests/stocks-module.test.js`
- Modify: `index.html`

- [ ] **Step 1: Write the failing helper tests**

Add a `loadStockLimitBoardEngine()` helper near `loadStockConditionMatcher()`:

```js
function loadStockLimitBoardEngine() {
  return new Function(`
    let stockSelectionConfig = ${JSON.stringify(JSON.parse(fs.readFileSync(selectionConfigPath, "utf8")))};
    ${extractFunction("getStockDailyK")}
    ${extractFunction("getStockIdentity")}
    ${extractFunction("getStockBoardCategory")}
    ${extractFunction("getStockKLineSeries")}
    ${extractFunction("getStockMaValue")}
    ${extractFunction("getStockVolumeRatio")}
    ${extractFunction("getStockSelectionConfig")}
    ${extractFunction("getStockSelectionParameter")}
    ${extractFunction("getStockLimitThreshold")}
    ${extractFunction("isStockLimitUpBar")}
    ${extractFunction("isStockOneLineLimitUpBar")}
    ${extractFunction("getStockConsecutiveLimitCount")}
    ${extractFunction("getStockTechnicalSignals")}
    ${extractFunction("getStockLimitBoardItem")}
    ${extractFunction("getStockLimitBoardGroups")}
    ${extractFunction("getHighestStockLimitBoardLevel")}
    return { getStockLimitBoardItem, getStockLimitBoardGroups, getHighestStockLimitBoardLevel };
  `)();
}
```

Add tests:

```js
test("stock limit-board grouping separates first, second, and highest boards", () => {
  const { getStockLimitBoardGroups, getHighestStockLimitBoardLevel } = loadStockLimitBoardEngine();
  const firstBoard = {
    id: "SH:600201",
    market: "SH",
    code: "600201",
    name: "一板样本",
    boardType: "main",
    status: "normal",
    changePercent: 10,
    volume: 300000,
    marketCap: 80,
    industry: "电力",
    dailyK: [
      { open: 10, high: 10.2, low: 9.9, close: 10, volume: 100000 },
      { open: 10.1, high: 11, low: 10.1, close: 11, volume: 300000 },
    ],
  };
  const twoBoard = {
    ...firstBoard,
    id: "SZ:000202",
    market: "SZ",
    code: "000202",
    name: "二板样本",
    changePercent: 10,
    marketCap: 60,
    dailyK: [
      { open: 10, high: 10.1, low: 9.9, close: 10, volume: 100000 },
      { open: 10.3, high: 11, low: 10.2, close: 11, volume: 180000 },
      { open: 11.4, high: 12.1, low: 11.3, close: 12.1, volume: 260000 },
    ],
  };
  const threeOneLine = {
    ...firstBoard,
    id: "SH:600203",
    code: "600203",
    name: "三板一字样本",
    marketCap: 50,
    dailyK: [
      { open: 10, high: 10, low: 10, close: 10, volume: 90000 },
      { open: 11, high: 11, low: 11, close: 11, volume: 100000 },
      { open: 12.1, high: 12.1, low: 12.1, close: 12.1, volume: 110000 },
      { open: 13.31, high: 13.31, low: 13.31, close: 13.31, volume: 120000 },
    ],
  };
  const nonLimit = {
    ...firstBoard,
    id: "SH:600204",
    code: "600204",
    name: "未涨停样本",
    changePercent: 2,
    dailyK: [
      { open: 10, high: 10.3, low: 9.9, close: 10, volume: 100000 },
      { open: 10, high: 10.5, low: 9.9, close: 10.2, volume: 120000 },
    ],
  };

  const groups = getStockLimitBoardGroups([firstBoard, twoBoard, threeOneLine, nonLimit]);
  assert.deepEqual(groups.map(group => [group.level, group.count]), [[1, 1], [2, 1], [3, 1]]);
  assert.equal(groups[0].items[0].name, "一板样本");
  assert.equal(groups[1].items[0].name, "二板样本");
  assert.equal(groups[2].items[0].oneLineBoard, true);
  assert.equal(getHighestStockLimitBoardLevel(groups), 3);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/stocks-module.test.js`

Expected: FAIL with `Missing function getStockLimitBoardItem`.

- [ ] **Step 3: Implement the minimal helper functions**

Add after `getStockTechnicalSignals(stock)` in `index.html`:

```js
function getStockLimitBoardItem(stock) {
  const signals = getStockTechnicalSignals(stock);
  if (!signals.limitUp || signals.consecutiveLimitCount < 1) return null;
  return {
    stock,
    level: signals.consecutiveLimitCount,
    oneLineBoard: signals.oneLineBoard,
    volumeRatio: signals.volumeRatio,
    latestDate: getStockKLineSeries(stock).at(-1)?.time || getStockKLineSeries(stock).at(-1)?.date || ""
  };
}

function getStockLimitBoardGroups(list = stockUniverse) {
  const buckets = new Map();
  list.forEach(stock => {
    const item = getStockLimitBoardItem(stock);
    if (!item) return;
    if (!buckets.has(item.level)) buckets.set(item.level, []);
    buckets.get(item.level).push(item);
  });
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, items]) => ({
      level,
      label: `${level}板`,
      count: items.length,
      items: items.sort((a, b) =>
        (Number(b.stock.changePercent) || 0) - (Number(a.stock.changePercent) || 0) ||
        (Number(b.volumeRatio) || 0) - (Number(a.volumeRatio) || 0) ||
        (Number(a.stock.marketCap) || Number.POSITIVE_INFINITY) - (Number(b.stock.marketCap) || Number.POSITIVE_INFINITY)
      )
    }));
}

function getHighestStockLimitBoardLevel(groups = getStockLimitBoardGroups()) {
  return groups.reduce((max, group) => Math.max(max, group.level), 0);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/stocks-module.test.js`

Expected: PASS.

### Task 2: View State And Background History Loading

**Files:**
- Modify: `tests/stocks-module.test.js`
- Modify: `index.html`

- [ ] **Step 1: Write failing source-structure tests**

Add a test near stock view tests:

```js
test("stock limit-board view is registered and schedules full-market history loading", () => {
  assert.match(html, /id: "limit-board"/);
  assert.match(html, /name: "连板"/);
  assert.match(html, /let activeStockLimitBoardLevel = 0/);
  assert.match(html, /let stockLimitBoardHistoryLoading = false/);
  assert.match(html, /function scheduleStockLimitBoardHistoryLoad\(\)/);
  assert.match(html, /loadRealStockHistory\(stock, \{ foreground: false \}\)/);
  assert.match(html, /activeStockView === "limit-board"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/stocks-module.test.js`

Expected: FAIL because `limit-board` view state and scheduler are missing.

- [ ] **Step 3: Add state, view registration, and scheduler functions**

In `stockViews`, add:

```js
{ id: "limit-board", icon: "♟", name: "连板", desc: "最新交易日涨停高度" },
```

Near stock state variables, add:

```js
let activeStockLimitBoardLevel = 0;
let stockLimitBoardHistoryLoading = false;
let stockLimitBoardHistoryLoadToken = 0;
let stockLimitBoardHistoryLoaded = 0;
let stockLimitBoardHistoryTarget = 0;
```

Add functions near strategy history loading:

```js
function hasStockLimitBoardHistoryReady(stock) {
  const loadKey = getStockHistoryLoadKey(stock);
  const dailyK = getStockDailyK(stock);
  return Boolean(dailyK.length) || stock.historyLoadKey === loadKey || stock.historyLoadEmptyKey === loadKey || stock.historyLoadErrorKey === loadKey;
}

function getStockLimitBoardHistoryCandidates() {
  if (!stockApiReady) return [];
  return stockUniverse.filter(stock => !hasStockLimitBoardHistoryReady(stock));
}

async function loadStockLimitBoardHistories(token) {
  const batchSize = STOCK_STRATEGY_HISTORY_BATCH_SIZE;
  while (token === stockLimitBoardHistoryLoadToken) {
    const batch = getStockLimitBoardHistoryCandidates().slice(0, batchSize);
    if (!batch.length) break;
    await Promise.all(batch.map(stock => loadRealStockHistory(stock, { foreground: false })));
    stockLimitBoardHistoryLoaded += batch.length;
    if (activeFeature === "stocks" && activeStockView === "limit-board") renderStockPage();
  }
  if (token === stockLimitBoardHistoryLoadToken) {
    stockLimitBoardHistoryLoading = false;
    stockLimitBoardHistoryLoaded = 0;
    stockLimitBoardHistoryTarget = 0;
    if (activeFeature === "stocks" && activeStockView === "limit-board") renderStockPage();
  }
}

function scheduleStockLimitBoardHistoryLoad() {
  if (!stockApiReady || stockLimitBoardHistoryLoading) return;
  const candidates = getStockLimitBoardHistoryCandidates();
  if (!candidates.length) return;
  stockLimitBoardHistoryLoadToken += 1;
  stockLimitBoardHistoryLoading = true;
  stockLimitBoardHistoryLoaded = 0;
  stockLimitBoardHistoryTarget = candidates.length;
  loadStockLimitBoardHistories(stockLimitBoardHistoryLoadToken);
}
```

In `setActiveStockView(view)`, after `activeStockView = view;`, call:

```js
if (activeStockView === "limit-board") scheduleStockLimitBoardHistoryLoad();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/stocks-module.test.js`

Expected: PASS.

### Task 3: Limit-Board Rendering And Daily K Chart Reuse

**Files:**
- Modify: `tests/stocks-module.test.js`
- Modify: `index.html`

- [ ] **Step 1: Write failing rendering tests**

Add:

```js
test("stock limit-board view renders grouped board levels and reuses daily K chart controls", () => {
  assert.match(html, /function renderStockLimitBoardView\(\)/);
  assert.match(html, /function renderStockLimitBoardLevels/);
  assert.match(html, /function renderStockLimitBoardList/);
  assert.match(html, /data-stock-limit-board-level/);
  assert.match(html, /data-stock-limit-board-row/);
  assert.match(html, /renderStockDailyQuote\(stock\)/);
  assert.match(html, /renderStockDailyPeriods\(\)/);
  assert.match(html, /renderStockDailyRanges\(\)/);
  assert.match(html, /data-stock-daily-chart/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/stocks-module.test.js`

Expected: FAIL because render helpers are missing.

- [ ] **Step 3: Add render helpers and route the active view**

Add render helpers near `renderStockDailyView()`:

```js
function renderStockLimitBoardLevels(groups = getStockLimitBoardGroups()) {
  if (!groups.length) return `<div class="stock-empty">最新交易日暂无涨停连板数据。</div>`;
  if (!activeStockLimitBoardLevel || !groups.some(group => group.level === activeStockLimitBoardLevel)) {
    activeStockLimitBoardLevel = getHighestStockLimitBoardLevel(groups);
  }
  return `
    <div class="stock-limit-board-levels" aria-label="连板高度">
      ${groups.map(group => `
        <button class="stock-daily-filter ${group.level === activeStockLimitBoardLevel ? "active" : ""}" type="button" data-stock-limit-board-level="${group.level}" aria-pressed="${group.level === activeStockLimitBoardLevel}">
          ${group.level}板 <span>${group.count}只</span>
        </button>
      `).join("")}
    </div>
  `;
}

function getActiveStockLimitBoardGroup(groups = getStockLimitBoardGroups()) {
  if (!activeStockLimitBoardLevel || !groups.some(group => group.level === activeStockLimitBoardLevel)) {
    activeStockLimitBoardLevel = getHighestStockLimitBoardLevel(groups);
  }
  return groups.find(group => group.level === activeStockLimitBoardLevel) || groups[groups.length - 1] || null;
}

function renderStockLimitBoardList(group = getActiveStockLimitBoardGroup()) {
  if (!group?.items?.length) return `<div class="stock-empty">当前板数没有匹配股票。</div>`;
  return group.items.map((item, index) => {
    const stock = item.stock;
    const exists = stockWatchlist.some(watch => getStockIdentity(watch) === getStockIdentity(stock));
    return `
      <div class="stock-daily-row ${stock.id === activeDailyStockId ? "active" : ""}" role="button" tabindex="0" data-stock-limit-board-row="${escapeHTML(stock.id)}" aria-pressed="${stock.id === activeDailyStockId}">
        <span class="stock-daily-index">${String(index + 1).padStart(3, "0")}</span>
        <span class="stock-daily-meta">
          <span class="stock-daily-name">${escapeHTML(stock.name)} ${item.oneLineBoard ? "<em>一字</em>" : ""}</span>
          <span class="stock-daily-code">${escapeHTML(stock.market)} ${escapeHTML(stock.code)} · ${escapeHTML(getStockIndustryLabel(stock))}</span>
        </span>
        <span class="stock-daily-row-change stock-change ${getStockChangeClass(stock.changePercent)}">${item.level}板 · 量比 ${Number(item.volumeRatio || 0).toFixed(1)}</span>
        <button class="stock-daily-add ${exists ? "is-added" : ""}" type="button" data-stock-daily-add="${escapeHTML(stock.code)}" data-stock-market="${escapeHTML(stock.market)}" aria-label="${exists ? "已在自选股中" : `添加${escapeHTML(stock.name)}到自选股`}">${exists ? "✓" : "+"}</button>
      </div>
    `;
  }).join("");
}

function renderStockLimitBoardView() {
  scheduleStockLimitBoardHistoryLoad();
  const groups = getStockLimitBoardGroups();
  const group = getActiveStockLimitBoardGroup(groups);
  const stock = group?.items?.find(item => item.stock.id === activeDailyStockId)?.stock || group?.items?.[0]?.stock || getActiveDailyStock();
  if (stock) activeDailyStockId = stock.id;
  const statusText = stockLimitBoardHistoryLoading
    ? `最新交易日 · K线补齐中 ${Math.min(stockLimitBoardHistoryLoaded, stockLimitBoardHistoryTarget)}/${stockLimitBoardHistoryTarget}`
    : `最新交易日 · 已评估 ${stockUniverse.length} 只`;
  return `
    <div class="stock-daily-layout stock-limit-board-layout">
      <aside class="stock-card stock-daily-sidebar">
        <div class="stock-section-head">
          <h2 class="stock-section-title">连板高度</h2>
          <span class="stock-refresh-note">${escapeHTML(statusText)}</span>
        </div>
        ${renderStockLimitBoardLevels(groups)}
        <div class="stock-daily-list" data-stock-limit-board-list aria-label="连板股票列表">${renderStockLimitBoardList(group)}</div>
      </aside>
      <section class="stock-card stock-daily-chart-card">
        ${stock ? `
          <div class="stock-section-head">
            <div>
              <h2 class="stock-section-title" data-stock-daily-title>${escapeHTML(stock.name)} 日K图</h2>
              <span class="stock-refresh-note" data-stock-daily-meta>${escapeHTML(stock.market)} ${escapeHTML(stock.code)} · ${escapeHTML(getStockDailyPeriod().label)} · ${escapeHTML(getStockDailyRange().label)}</span>
            </div>
          </div>
          ${renderStockDailyQuote(stock)}
          <div class="stock-daily-control-row">
            <div class="stock-daily-period-row">${renderStockDailyPeriods()}</div>
            <div class="stock-daily-range-row ${stockDailyMoreOpen ? "" : "is-hidden"}">${renderStockDailyRanges()}</div>
          </div>
          <div class="stock-daily-canvas-wrap">
            <canvas class="stock-daily-canvas" data-stock-daily-chart width="960" height="560" aria-label="${escapeHTML(stock.name)}日K图"></canvas>
            <div class="stock-daily-tooltip" id="stockDailyTooltip" role="tooltip"></div>
          </div>
          ${renderStockDailyScrollbar()}
          ${renderStockDailyDepth(stock)}
        ` : `<div class="stock-empty">正在等待全市场日K数据。</div>`}
      </section>
    </div>
  `;
}
```

Route in `renderStockActiveView()`:

```js
if (activeStockView === "limit-board") return renderStockLimitBoardView();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/stocks-module.test.js`

Expected: PASS.

### Task 4: Limit-Board Interactions

**Files:**
- Modify: `tests/stocks-module.test.js`
- Modify: `index.html`

- [ ] **Step 1: Write failing interaction source tests**

Add:

```js
test("stock limit-board interaction handlers switch board level and selected chart stock", () => {
  assert.match(html, /function setStockLimitBoardLevel\(level\)/);
  assert.match(html, /function setActiveLimitBoardStock\(id\)/);
  assert.match(html, /data-stock-limit-board-level/);
  assert.match(html, /setStockLimitBoardLevel\(limitBoardLevelButton\.dataset\.stockLimitBoardLevel\)/);
  assert.match(html, /data-stock-limit-board-row/);
  assert.match(html, /setActiveLimitBoardStock\(limitBoardRow\.dataset\.stockLimitBoardRow\)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/stocks-module.test.js`

Expected: FAIL because interaction helpers are missing.

- [ ] **Step 3: Add interaction helpers and event bindings**

Add near daily setters:

```js
function setStockLimitBoardLevel(level) {
  const numeric = Number(level) || 0;
  const groups = getStockLimitBoardGroups();
  if (!groups.some(group => group.level === numeric)) return;
  activeStockLimitBoardLevel = numeric;
  const nextStock = getActiveStockLimitBoardGroup(groups)?.items?.[0]?.stock;
  if (nextStock) activeDailyStockId = nextStock.id;
  renderStockPage();
  if (nextStock) {
    loadRealStockHistory(nextStock).then(() => {
      if (activeDailyStockId === nextStock.id) updateStockDailyChart();
    });
  }
}

function setActiveLimitBoardStock(id) {
  const stock = stockUniverse.find(item => item.id === id);
  if (!stock) return;
  activeDailyStockId = id;
  stockDailyViewportStart = -1;
  updateStockDailyChart();
  loadRealStockHistory(stock).then(() => {
    if (activeDailyStockId === id) updateStockDailyChart();
  });
}
```

In the stock click handler before generic daily row handling:

```js
const limitBoardLevelButton = event.target.closest("[data-stock-limit-board-level]");
if (limitBoardLevelButton) {
  setStockLimitBoardLevel(limitBoardLevelButton.dataset.stockLimitBoardLevel);
  return;
}

const limitBoardRow = event.target.closest("[data-stock-limit-board-row]");
if (limitBoardRow) {
  setActiveLimitBoardStock(limitBoardRow.dataset.stockLimitBoardRow);
  return;
}
```

Add matching keyboard handling where daily rows already handle Enter/Space:

```js
const limitBoardRow = event.target.closest("[data-stock-limit-board-row]");
if (limitBoardRow && (event.key === "Enter" || event.key === " ")) {
  event.preventDefault();
  setActiveLimitBoardStock(limitBoardRow.dataset.stockLimitBoardRow);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/stocks-module.test.js`

Expected: PASS.

### Task 5: Contracts, Styling, And Final Verification

**Files:**
- Modify: `src/stocks/contracts.ts`
- Modify: `docs/stocks/state-machine-data-flow.md`
- Modify: `index.html`
- Test: `tests/stocks-contracts.test.js`
- Test: `tests/stocks-module.test.js`

- [ ] **Step 1: Write failing contract/documentation tests**

Update the existing contract/view tests to expect `limit-board` in `STOCK_VIEWS` and state-machine docs.

Expected assertions:

```js
assert.match(contractsSource, /"limit-board"/);
assert.match(stateMachineSource, /`limit-board`/);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/stocks-contracts.test.js tests/stocks-module.test.js`

Expected: FAIL because contracts and docs still list only `daily`, `watchlist`, and `filter`.

- [ ] **Step 3: Update contract and docs**

In `src/stocks/contracts.ts`, change:

```ts
export const STOCK_VIEWS = ["daily", "watchlist", "filter", "limit-board"] as const;
```

In `docs/stocks/state-machine-data-flow.md`, add `limit-board` to the subview table with:

```md
| `limit-board` | 连板 tab | `activeDailyStockId`、board level、full-market K-line progress | 后台补齐 K 线，分组面板可局部更新，右侧复用 daily canvas |
```

Add compact CSS classes in `index.html`:

```css
.stock-limit-board-levels {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.stock-limit-board-layout .stock-daily-row em {
  color: var(--stock-up);
  font-style: normal;
  font-size: 11px;
}
```

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/stocks-module.test.js tests/stocks-contracts.test.js`

Expected: PASS.

- [ ] **Step 5: Run full tests**

Run: `node --test tests/*.test.js`

Expected: PASS.
