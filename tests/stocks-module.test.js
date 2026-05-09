const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function extractBlock(startPattern, endPattern) {
  const start = html.search(startPattern);
  assert.notEqual(start, -1, `Missing start pattern: ${startPattern}`);
  const rest = html.slice(start);
  const end = rest.search(endPattern);
  assert.notEqual(end, -1, `Missing end pattern: ${endPattern}`);
  return rest.slice(0, end);
}

test("stocks module is registered and routed from the existing feature shell", () => {
  assert.match(html, /const STOCK_WATCHLIST_KEY = "glass_nav_stock_watchlist"/);
  assert.match(html, /const marketIndices = \[/);
  assert.match(html, /const stockUniverse = \[/);
  assert.match(html, /activeFeature === "stocks"/);
  assert.match(html, /renderStockSideList\(\)/);
  assert.match(html, /renderStockPage\(\)/);
});

test("stocks tab is visible through the shared desktop and mobile feature lists", () => {
  assert.doesNotMatch(html, /item\.id === "game" \|\| item\.id === "stocks"/);
  assert.match(html, /if \(!isUnlocked && item\.id === "game"\) return false/);
});

test("stocks page defaults to the minute/K chart and omits the market dashboard module", () => {
  assert.match(html, /function renderStockPage\(\)\s*\{/);
  assert.match(html, /let activeStockView = "daily"/);
  assert.match(html, /class="stock-page"/);
  assert.match(html, /class="stock-search-form"/);
  assert.match(html, /id="stockSearchInput"/);
  assert.match(html, /placeholder="搜索股票代码或名称，例如 600519 \/ 茅台"/);
  assert.match(html, /id="stockSearchResults"/);
  assert.match(html, /class="stock-mobile-tabs"/);
  const stockViewsBlock = extractBlock(
    /const stockViews = \[/,
    /\n    \];\n    const stockDailyRanges/
  );
  assert.match(stockViewsBlock, /id: "daily"/);
  assert.match(html, /id: "watchlist"/);
  assert.match(html, /id: "filter"/);
  assert.doesNotMatch(stockViewsBlock, /id: "market"/);
  assert.doesNotMatch(stockViewsBlock, /大盘云图/);
  assert.match(html, /data-stock-view="\$\{item\.id\}"/);
  assert.match(html, /class="stock-filter-panel/);
  assert.match(html, /data-stock-filter-toggle/);
  assert.match(html, /data-stock-filter-apply/);
  assert.match(html, /data-stock-filter="minPe"/);
  assert.match(html, /data-stock-filter="maxPe"/);
  assert.match(html, /股票分时\/日K图/);
  assert.match(html, /分时、日K、周K、月K/);
  assert.doesNotMatch(html, /function renderStockMarketView/);
  assert.match(html, /class="stock-change-amount/);
  assert.match(html, /class="stock-watchlist-table-wrap"/);
  assert.match(html, /draggable="true" data-stock-row/);
  assert.match(html, /class="stock-detail-row/);
});

test("stock secondary sidebar switches modules instead of scrolling sections", () => {
  assert.match(html, /function setActiveStockView\(view\)/);
  assert.match(html, /function renderStockActiveView\(\)/);
  assert.match(html, /activeStockView === "watchlist"/);
  assert.match(html, /activeStockView === "filter"/);
  assert.match(html, /activeStockView === "daily"/);
  assert.match(html, /activeStockView = "daily"/);
  assert.doesNotMatch(html, /renderStockMarketView\(\)/);
  assert.match(html, /const viewButton = event\.target\.closest\("\[data-stock-view\]"\)/);
  assert.match(html, /setActiveStockView\(viewButton\.dataset\.stockView\)/);
  assert.doesNotMatch(html, /data-stock-section/);
  const stockSidebarClickBlock = extractBlock(
    /if \(activeFeature === "stocks"\) \{\s*const viewButton = event\.target\.closest\("\[data-stock-view\]"\)/,
    /\n      \}\n\n      if \(activeFeature === "game"\)/
  );
  assert.doesNotMatch(stockSidebarClickBlock, /scrollIntoView/);
});

test("stocks logic supports search, filters, watchlist persistence, sorting, charts, and refresh", () => {
  const requiredFunctions = [
    "loadStockWatchlist",
    "saveStockWatchlist",
    "searchStocks",
    "addStockToWatchlist",
    "removeStockFromWatchlist",
    "reorderWatchlist",
    "applyStockFilters",
    "refreshStockPrices",
    "scheduleStockRefresh",
    "drawStockCanvases",
    "openStockDetail",
    "getStockChangeAmount",
    "setQuickStockFilter",
    "getQuickFilterStocks",
    "toggleStockRowExpand",
    "updateStockDynamicData",
    "updateStockWatchlistData",
    "updateQuickStockCards"
  ];

  for (const name of requiredFunctions) {
    assert.match(html, new RegExp(`function ${name}\\(`), `Missing ${name}`);
  }

  assert.match(html, /setTimeout\(scheduleStockRefresh,\s*getStockRefreshDelay\(\)\)/);
  assert.match(html, /5000 \+ Math\.floor\(Math\.random\(\) \* 10001\)/);
  assert.match(html, /localStorage\.setItem\(STOCK_WATCHLIST_KEY/);
  assert.match(html, /openStockDetail\(first\)/);
  assert.doesNotMatch(html, /if \(first\) addStockToWatchlist\(first\.code, first\.market\)/);
  assert.match(html, /\.slice\(-5\)/);
});

test("stock refresh updates existing nodes instead of rerendering the page", () => {
  assert.match(html, /data-stock-cell="price"/);
  assert.match(html, /data-stock-cell="changePercent"/);
  assert.match(html, /data-stock-quick-label="top-up"/);
  assert.match(html, /\.stock-tick-change/);
  assert.match(html, /@keyframes stockTickPulse/);

  const refreshBlock = extractBlock(
    /function refreshStockPrices\(\) \{/,
    /\n    \}\n\n    function clearStockDragClasses/
  );
  assert.match(refreshBlock, /updateStockDynamicData\(\)/);
  assert.doesNotMatch(refreshBlock, /renderStockPage\(\)/);
  assert.doesNotMatch(refreshBlock, /innerHTML/);

  const dynamicUpdateBlock = extractBlock(
    /function updateStockDynamicData\(\) \{/,
    /\n    \}\n\n    function refreshStockPrices/
  );
  assert.doesNotMatch(dynamicUpdateBlock, /updateStockMarketData\(\)/);
  assert.match(dynamicUpdateBlock, /updateStockWatchlistData\(\)/);
  assert.match(dynamicUpdateBlock, /updateQuickStockCards\(\)/);
  assert.match(dynamicUpdateBlock, /drawStockCanvases\(\)/);
});

test("stock filter workspace is a vertical screener without market cards", () => {
  const filterViewBlock = extractBlock(
    /function renderStockFilterView\(\) \{/,
    /\n    \}\n\n    function renderStockActiveView/
  );
  assert.match(filterViewBlock, /class="stock-filter-layout"/);
  assert.match(filterViewBlock, /class="stock-filter-panel/);
  assert.match(filterViewBlock, /id="stockFilterResults"/);
  assert.ok(filterViewBlock.indexOf("stock-filter-panel") < filterViewBlock.indexOf("stock-filter-results"));
  assert.doesNotMatch(filterViewBlock, /stockMarketCloud|stock-market-grid|renderMarketCloud/);
  assert.match(filterViewBlock, /data-stock-filter="logic"/);
  assert.match(filterViewBlock, /renderStockFilterResultTable\(filteredStocks\)/);
  assert.match(html, /data-stock-sort="\$\{field\}"/);
  assert.match(html, /data-stock-page="next"/);
});

test("stock filter tags, guru strategies, sorting, and pagination are wired", () => {
  const requiredFunctions = [
    "getStockTrend",
    "getStockExchange",
    "getStockBoardType",
    "getStockStatus",
    "formatStockMarketCap",
    "getStockFilterResults",
    "applyStockTag",
    "toggleStockTag",
    "applyStockStrategy",
    "loadStockFilterState",
    "saveStockFilterState",
    "saveCustomStockStrategies",
    "createCustomStockStrategy",
    "editCustomStockStrategy",
    "setStockResultSort",
    "setStockResultPage",
    "setStockFilterSearch",
    "toggleStockFilterRowExpand",
    "renderStockFilterSearch",
    "renderStockFilterTags",
    "renderStockStrategies",
    "renderStockFilterDetailRow",
    "renderStockFilterResultTable"
  ];

  for (const name of requiredFunctions) {
    assert.match(html, new RegExp(`function ${name}\\(`), `Missing ${name}`);
  }

  assert.match(html, /const STOCK_STRATEGY_KEY = "glass_nav_stock_strategies"/);
  assert.match(html, /const STOCK_FILTER_STATE_KEY = "glass_nav_stock_filter_state"/);
  assert.match(html, /const stockFilterTags = \[/);
  assert.match(html, /marketCap:/);
  assert.match(html, /北交所/);
  assert.match(html, /非科创板/);
  assert.match(html, /非ST/);
  assert.match(html, /5日趋势上行/);
  assert.match(html, /15日趋势上行/);
  assert.match(html, /15日趋势下降/);
  assert.match(html, /30日趋势下降/);
  assert.match(html, /高ROE 2/);
  assert.match(html, /低市盈率 2/);
  assert.match(html, /data-stock-filter="minPb"/);
  assert.match(html, /data-stock-filter="maxPb"/);
  assert.match(html, /const defaultStockStrategies = \[/);
  assert.match(html, /退学炒股/);
  assert.match(html, /XX游资精选/);
  assert.match(html, /巴菲特精选/);
  assert.match(html, /彼得林奇/);
  assert.match(html, /let activeStockTags = \[\]/);
  assert.match(html, /activeStockTags\.includes\(tag\.id\)/);
  assert.match(html, /data-stock-tag="\$\{escapeHTML\(tag\.id\)\}"/);
  assert.match(html, /data-stock-strategy="\$\{escapeHTML\(strategy\.id\)\}"/);
  assert.match(html, /data-stock-strategy-add/);
  assert.match(html, /data-stock-strategy-edit/);
  assert.match(html, /id="stockFilterSearchInput"/);
  assert.match(html, /data-stock-filter-search/);
  assert.match(html, /市值/);
  assert.match(html, /renderStockSortButton\("marketCap", "市值"\)/);
  assert.match(html, /data-stock-cell="marketCap"/);
  assert.match(html, /data-stock-filter-detail-row/);
  assert.match(html, /stock-mini-chart/);
  assert.match(html, /data-stock-sort/);
  assert.match(html, /data-stock-page/);
  assert.match(html, /localStorage\.setItem\(STOCK_FILTER_STATE_KEY/);

  const clickBlock = extractBlock(
    /function handleStockContentClick\(event\) \{/,
    /\n    \}\n\n    function refreshCategorySection/
  );
  assert.match(clickBlock, /event\.target\.closest\("\[data-stock-tag\]"\)/);
  assert.match(clickBlock, /event\.target\.closest\("\[data-stock-strategy\]"\)/);
  assert.match(clickBlock, /event\.target\.closest\("\[data-stock-sort\]"\)/);
  assert.match(clickBlock, /event\.target\.closest\("\[data-stock-page\]"\)/);
  assert.match(clickBlock, /event\.target\.closest\("\[data-stock-filter-row\]"\)/);
  assert.match(clickBlock, /toggleStockFilterRowExpand\(filterRow\.dataset\.stockCode, filterRow\.dataset\.stockMarket\)/);

  const inputBlock = extractBlock(
    /content\.addEventListener\("input", event => \{/,
    /\n    \}\);\n\n    content\.addEventListener\("scroll"/
  );
  assert.match(inputBlock, /#stockFilterSearchInput/);
  assert.match(inputBlock, /setStockFilterSearch\(filterSearch\.value\)/);
});

test("stock minute and K module renders virtual stock list, range controls, canvas, and tooltip", () => {
  const requiredFunctions = [
    "makeStockDailyK",
    "getStockDailyK",
    "makeMockStockUniverse",
    "hydrateStockTechnicalData",
    "makeStockIntradaySeries",
    "makeStockOrderBook",
    "makeStockPriceDistribution",
    "renderStockDailyView",
    "renderStockDailyList",
    "renderStockDailyVirtualRows",
    "renderStockDailyRanges",
    "drawStockDailyCanvas",
    "handleStockDailyCanvasMove",
    "handleStockDailyListScroll",
    "setActiveDailyStock",
    "setStockDailyRange",
    "setStockDailySort",
    "updateStockDailyChart"
  ];

  for (const name of requiredFunctions) {
    assert.match(html, new RegExp(`function ${name}\\(`), `Missing ${name}`);
  }

  assert.match(html, /id: "daily"/);
  assert.match(html, /股票分时\/日K图/);
  assert.doesNotMatch(html, /name: "全市场日K图"/);
  assert.match(html, /const STOCK_MOCK_TOTAL = 200/);
  assert.match(html, /stockUniverse\.push\(\.\.\.makeMockStockUniverse\(STOCK_MOCK_TOTAL - stockUniverse\.length\)\)/);
  assert.match(html, /const stockDailyRanges = \[/);
  assert.match(html, /15日/);
  assert.match(html, /30日/);
  assert.match(html, /60日/);
  assert.match(html, /半年/);
  assert.match(html, /1年/);
  assert.match(html, /2年/);
  assert.match(html, /dailyK/);
  assert.match(html, /intraday/);
  assert.match(html, /multiDayMinute/);
  assert.match(html, /orderBook/);
  assert.match(html, /priceDistribution/);
  assert.match(html, /data-stock-daily-row/);
  assert.match(html, /data-stock-daily-list/);
  assert.match(html, /data-stock-daily-spacer="top"/);
  assert.match(html, /data-stock-daily-spacer="bottom"/);
  assert.match(html, /data-stock-daily-change/);
  assert.match(html, /data-stock-daily-range/);
  assert.match(html, /data-stock-daily-sort/);
  assert.match(html, /data-stock-daily-chart/);
  assert.match(html, /id="stockDailyTooltip"/);
  assert.match(html, /stock-daily-layout/);
  assert.match(html, /stock-daily-list/);
  assert.match(html, /stock-daily-canvas-wrap/);
  assert.match(html, /activeStockView === "daily"/);
  assert.match(html, /drawStockDailyCanvas\(\)/);

  const clickBlock = extractBlock(
    /function handleStockContentClick\(event\) \{/,
    /\n    \}\n\n    function refreshCategorySection/
  );
  assert.match(clickBlock, /event\.target\.closest\("\[data-stock-daily-row\]"\)/);
  assert.match(clickBlock, /event\.target\.closest\("\[data-stock-daily-range\]"\)/);
  assert.match(clickBlock, /event\.target\.closest\("\[data-stock-daily-sort\]"\)/);

  const scrollBlock = extractBlock(
    /content\.addEventListener\("scroll", event => \{/,
    /\n    \}, true\);/
  );
  assert.match(scrollBlock, /event\.target\.closest\("\[data-stock-daily-list\]"\)/);
  assert.match(scrollBlock, /handleStockDailyListScroll\(dailyList\)/);

  const moveBlock = extractBlock(
    /content\.addEventListener\("mousemove", event => \{/,
    /\n    \}\);\n\n    content\.addEventListener\("mouseout"/
  );
  assert.match(moveBlock, /handleStockDailyCanvasMove\(event, dailyCanvas\)/);
});

test("stock daily technical chart exposes quote metrics, MA, volume, MACD, periods and scrolling", () => {
  const requiredFunctions = [
    "renderStockDailyQuote",
    "renderStockDailyPeriods",
    "aggregateStockDailyK",
    "getStockPeriodK",
    "calculateStockMovingAverages",
    "calculateStockMacd",
    "getStockDailyViewport",
    "updateStockDailyViewport",
    "setStockDailyPeriod",
    "handleStockDailyWheel",
    "handleStockDailyPointerDown",
    "handleStockDailyPointerMove"
  ];

  for (const name of requiredFunctions) {
    assert.match(html, new RegExp(`function ${name}\\(`), `Missing ${name}`);
  }

  assert.match(html, /const stockDailyPeriods = \[/);
  assert.match(html, /分时/);
  assert.match(html, /3日/);
  assert.match(html, /5日/);
  assert.match(html, /日K/);
  assert.match(html, /周K/);
  assert.match(html, /月K/);
  assert.match(html, /更多/);
  assert.match(html, /data-stock-daily-quote/);
  assert.match(html, /data-stock-daily-stat="open"/);
  assert.match(html, /data-stock-daily-stat="prevClose"/);
  assert.match(html, /data-stock-daily-stat="turnover"/);
  assert.match(html, /data-stock-daily-stat="amount"/);
  assert.match(html, /今开/);
  assert.match(html, /昨收/);
  assert.match(html, /最高/);
  assert.match(html, /最低/);
  assert.match(html, /成交量/);
  assert.match(html, /成交额/);
  assert.match(html, /换手率/);
  assert.match(html, /总市值/);
  assert.match(html, /市盈率/);
  assert.match(html, /MA5/);
  assert.match(html, /MA10/);
  assert.match(html, /MA30/);
  assert.match(html, /MA60/);
  assert.match(html, /MACD/);
  assert.match(html, /DIF/);
  assert.match(html, /DEA/);
  assert.match(html, /data-stock-daily-period/);
  assert.match(html, /data-stock-daily-scroll/);
  assert.match(html, /data-stock-daily-depth/);
  assert.match(html, /stock-daily-depth/);
  assert.match(html, /委买/);
  assert.match(html, /委卖/);
  assert.match(html, /量价分布/);
  assert.match(html, /stock-daily-quote-grid/);
  assert.match(html, /stock-daily-period-row/);
  assert.match(html, /stock-daily-scrollbar/);

  const drawBlock = extractBlock(
    /function drawStockDailyCanvas\(\) \{/,
    /\n    \}\n\n    function updateStockDailyChart/
  );
  assert.match(drawBlock, /drawStockMinuteCanvas/);
  assert.match(drawBlock, /drawStockKCanvas/);
  assert.match(html, /function drawStockMinuteCanvas\(/);
  assert.match(html, /function drawStockKCanvas\(/);
  assert.match(html, /function getStockMinuteSeries\(/);
  assert.match(drawBlock, /calculateStockMovingAverages/);
  assert.match(drawBlock, /calculateStockMacd/);
  assert.match(html, /candlePane/);
  assert.match(html, /volumePane/);
  assert.match(html, /macdPane/);

  const clickBlock = extractBlock(
    /function handleStockContentClick\(event\) \{/,
    /\n    \}\n\n    function refreshCategorySection/
  );
  assert.match(clickBlock, /event\.target\.closest\("\[data-stock-daily-period\]"\)/);

  const inputBlock = extractBlock(
    /content\.addEventListener\("input", event => \{/,
    /\n    \}\);\n\n    content\.addEventListener\("scroll"/
  );
  assert.match(inputBlock, /event\.target\.closest\("\[data-stock-daily-scroll\]"\)/);

  assert.match(html, /content\.addEventListener\("wheel", event => \{/);
  assert.match(html, /content\.addEventListener\("pointerdown", event => \{/);
  assert.match(html, /content\.addEventListener\("pointermove", event => \{/);
  assert.match(html, /content\.addEventListener\("pointerup", event => \{/);
});

test("stock daily K chart supports Ctrl plus wheel range zoom", () => {
  assert.match(html, /let activeStockDailyRange = "60"/);
  assert.match(html, /let activeStockDailyPeriod = "day"/);

  const requiredFunctions = [
    "getStockDailyRangeIndex",
    "zoomStockDailyRange",
    "handleStockDailyPinchZoom"
  ];

  for (const name of requiredFunctions) {
    assert.match(html, new RegExp(`function ${name}\\(`), `Missing ${name}`);
  }

  const zoomBlock = extractBlock(
    /function zoomStockDailyRange\(direction\) \{/,
    /\n    \}\n\n    function setStockDailySort/
  );
  assert.match(zoomBlock, /stockDailyRanges/);
  assert.match(zoomBlock, /setStockDailyRange\(stockDailyRanges\[nextIndex\]\.id\)/);
  assert.match(zoomBlock, /activeStockDailyPeriod = "day"/);

  const wheelBlock = extractBlock(
    /function handleStockDailyWheel\(event, canvas\) \{/,
    /\n    \}\n\n    function handleStockDailyPointerDown/
  );
  assert.match(wheelBlock, /event\.ctrlKey/);
  assert.match(wheelBlock, /event\.preventDefault\(\)/);
  assert.match(wheelBlock, /zoomStockDailyRange\(event\.deltaY < 0 \? -1 : 1\)/);
  assert.match(wheelBlock, /updateStockDailyViewport\(meta\.viewport\.start \+ direction \* 3\)/);

  const pointerMoveBlock = extractBlock(
    /function handleStockDailyPointerMove\(event\) \{/,
    /\n    \}\n\n    function handleStockDailyPointerUp/
  );
  assert.match(pointerMoveBlock, /handleStockDailyPinchZoom\(event\)/);
});

test("stock minute and K chart updates are local and do not rerender the whole page", () => {
  const updateBlock = extractBlock(
    /function updateStockDailyChart\(\) \{/,
    /\n    \}\n\n    function handleStockDailyCanvasMove/
  );
  assert.match(updateBlock, /renderStockDailyQuote\(stock\)/);
  assert.match(updateBlock, /renderStockDailyDepth\(stock\)/);
  assert.match(updateBlock, /drawStockDailyCanvas\(\)/);
  assert.doesNotMatch(updateBlock, /renderStockPage\(\)/);

  const activeBlock = extractBlock(
    /function setActiveDailyStock\(id\) \{/,
    /\n    \}\n\n    function setStockDailyRange/
  );
  assert.match(activeBlock, /updateStockDailyChart\(\)/);
  assert.doesNotMatch(activeBlock, /renderStockPage\(\)/);

  const listScrollBlock = extractBlock(
    /function handleStockDailyListScroll\(list\) \{/,
    /\n    \}\n\n    function createCustomStockStrategy/
  );
  assert.match(listScrollBlock, /renderStockDailyList\(\)/);
  assert.match(listScrollBlock, /list\.innerHTML/);
  assert.doesNotMatch(listScrollBlock, /renderStockPage\(\)/);
});

test("stock daily technical chart is constrained inside the viewport", () => {
  const dailyCss = extractBlock(
    /\.stock-daily-layout\s*\{/,
    /\n    \.stock-daily-sidebar,/
  );
  assert.match(dailyCss, /max-height:\s*calc\(100vh - 170px\)/);
  assert.match(dailyCss, /overflow:\s*hidden/);

  const quoteGridCss = extractBlock(
    /\.stock-daily-quote-grid\s*\{/,
    /\n    \.stock-daily-stat\s*\{/
  );
  assert.match(quoteGridCss, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(quoteGridCss, /background:\s*rgba\(0,0,0,0\.18\)/);

  const canvasWrapCss = extractBlock(
    /\.stock-daily-canvas-wrap\s*\{/,
    /\n    \.stock-daily-canvas-wrap\.is-dragging/
  );
  assert.match(canvasWrapCss, /min-height:\s*clamp\(260px,\s*42vh,\s*420px\)/);
  assert.match(canvasWrapCss, /max-height:\s*clamp\(300px,\s*50vh,\s*460px\)/);
  assert.match(canvasWrapCss, /border:\s*0/);
  assert.match(canvasWrapCss, /border-radius:\s*0/);
  assert.match(canvasWrapCss, /background:\s*rgba\(0,0,0,0\.18\)/);

  const canvasCss = extractBlock(
    /\.stock-daily-canvas\s*\{/,
    /\n    \.stock-daily-tooltip\s*\{/
  );
  assert.doesNotMatch(canvasCss, /min-height:\s*540px/);
});

test("stock daily view uses the modern quote, control, list, and depth styling", () => {
  const quoteCss = extractBlock(
    /\.stock-daily-quote\s*\{/,
    /\n    \.stock-daily-quote-main\s*\{/
  );
  assert.match(quoteCss, /padding:\s*12px 12px 0/);
  assert.match(quoteCss, /border:\s*1px solid rgba\(255,255,255,0\.1\)/);
  assert.match(quoteCss, /background:\s*rgba\(0,0,0,0\.16\)/);

  const quoteMainCss = extractBlock(
    /\.stock-daily-quote-main\s*\{/,
    /\n    \.stock-daily-quote-name\s*\{/
  );
  assert.match(quoteMainCss, /display:\s*flex/);
  assert.match(quoteMainCss, /justify-content:\s*space-between/);
  assert.match(quoteMainCss, /border-bottom:\s*1px solid rgba\(255,255,255,0\.1\)/);

  const quoteNameCss = extractBlock(
    /\.stock-daily-quote-name strong\s*\{/,
    /\n    \.stock-daily-quote-code\s*\{/
  );
  assert.match(quoteNameCss, /font-size:\s*17px/);
  assert.match(quoteNameCss, /font-weight:\s*800/);

  const quoteCodeCss = extractBlock(
    /\.stock-daily-quote-code\s*\{/,
    /\n    \.stock-daily-quote-price\s*\{/
  );
  assert.match(quoteCodeCss, /font-size:\s*11px/);
  assert.match(quoteCodeCss, /color:\s*rgba\(255,255,255,0\.52\)/);

  const quotePriceCss = extractBlock(
    /\.stock-daily-quote-price strong\s*\{/,
    /\n    \.stock-daily-quote-price \.stock-change/
  );
  assert.match(quotePriceCss, /font-size:\s*30px/);
  assert.match(quotePriceCss, /font-weight:\s*800/);
  assert.match(html, /\.stock-daily-quote-price \.stock-change\s*\{[\s\S]*?font-size:\s*13px/);

  const statCss = extractBlock(
    /\.stock-daily-stat\s*\{/,
    /\n    \.stock-daily-stat:nth-child/
  );
  assert.match(statCss, /background:\s*rgba\(0,0,0,0\.18\)/);
  assert.match(statCss, /border-right:\s*1px solid rgba\(255,255,255,0\.1\)/);
  assert.match(statCss, /border-bottom:\s*1px solid rgba\(255,255,255,0\.1\)/);
  assert.match(html, /\.stock-daily-stat span\s*\{[\s\S]*?font-size:\s*10px/);
  assert.match(html, /\.stock-daily-stat strong\s*\{[\s\S]*?font-size:\s*12px[\s\S]*?font-weight:\s*760/);
  assert.match(html, /\.stock-daily-stat strong\[data-stock-daily-stat="high"\]\s*\{[\s\S]*?color:\s*#3ac97e/);
  assert.match(html, /\.stock-daily-stat strong\[data-stock-daily-stat="low"\]\s*\{[\s\S]*?color:\s*#f05a5a/);

  const rowCss = extractBlock(
    /\.stock-daily-row\s*\{/,
    /\n    \.stock-daily-row:hover/
  );
  assert.match(rowCss, /height:\s*52px/);
  assert.match(rowCss, /margin-bottom:\s*4px/);
  assert.match(rowCss, /border-radius:\s*8px/);
  assert.match(rowCss, /grid-template-columns:\s*28px minmax\(0,\s*1fr\) auto/);
  assert.match(html, /const STOCK_DAILY_ROW_HEIGHT = 56/);
  assert.match(html, /height:\$\{STOCK_DAILY_ROW_HEIGHT - 4\}px/);
  assert.match(html, /\.stock-daily-row:hover,[\s\S]*?border-color:\s*rgba\(58,201,126,0\.54\)[\s\S]*?background:\s*rgba\(58,201,126,0\.15\)/);
  assert.match(html, /\.stock-daily-row-change\s*\{[\s\S]*?text-align:\s*right/);

  const dailyButtonCss = extractBlock(
    /\.stock-daily-period-row \.stock-action,\s*\n    \.stock-daily-range-row \.stock-action\s*\{/,
    /\n    \.stock-daily-period-row \.stock-action:hover/
  );
  assert.match(dailyButtonCss, /padding:\s*4px 10px/);
  assert.match(dailyButtonCss, /border-radius:\s*6px/);
  assert.match(dailyButtonCss, /background:\s*transparent/);
  assert.match(dailyButtonCss, /border-color:\s*rgba\(255,255,255,0\.1\)/);
  assert.match(html, /\.stock-daily-period-row \.stock-action:hover,[\s\S]*?border-color:\s*rgba\(255,255,255,0\.2\)/);
  assert.match(html, /\.stock-daily-period-row \.stock-action\.active,[\s\S]*?color:\s*#3ac97e[\s\S]*?background:\s*rgba\(58,201,126,0\.14\)/);
  assert.match(html, /\.stock-daily-period-row \.stock-action\[data-stock-daily-period="minute"\]\.active,[\s\S]*?color:\s*#68cbff[\s\S]*?border-color:\s*rgba\(104,203,255,0\.4\)[\s\S]*?background:\s*rgba\(104,203,255,0\.15\)/);

  const depthCardCss = extractBlock(
    /\.stock-daily-depth-card\s*\{/,
    /\n    \.stock-daily-depth-title\s*\{/
  );
  assert.match(depthCardCss, /padding:\s*8px/);
  assert.match(depthCardCss, /background:\s*rgba\(0,0,0,0\.12\)/);

  const depthTitleCss = extractBlock(
    /\.stock-daily-depth-title\s*\{/,
    /\n    \.stock-daily-depth-row\s*\{/
  );
  assert.match(depthTitleCss, /font-size:\s*10px/);
  assert.match(depthTitleCss, /letter-spacing:\s*\.5px/);
  assert.match(depthTitleCss, /text-transform:\s*uppercase/);

  const depthBarCss = extractBlock(
    /\.stock-daily-depth-bar\s*\{/,
    /\n    \.stock-daily-depth-fill\s*\{/
  );
  assert.match(depthBarCss, /height:\s*4px/);
  assert.match(html, /\.stock-daily-depth-fill\s*\{[\s\S]*?background:\s*rgba\(58,201,126,0\.65\)/);
  assert.match(html, /\.stock-daily-depth-fill\.down\s*\{[\s\S]*?background:\s*rgba\(240,90,90,0\.65\)/);
});

test("quick observation cards expose the requested preset filters", () => {
  assert.match(html, /data-stock-quick-filter="top-up"/);
  assert.match(html, /上涨前2/);
  assert.match(html, /data-stock-quick-filter="top-down"/);
  assert.match(html, /下跌前2/);
  assert.match(html, /data-stock-quick-filter="high-roe"/);
  assert.match(html, /高ROE 2/);
  assert.match(html, /data-stock-quick-filter="high-pe"/);
  assert.match(html, /高市盈率 2/);
});

test("stocks module has responsive glass styling and mobile horizontal overflow", () => {
  assert.match(html, /\/\* Stock Module Styles \*\//);
  assert.match(html, /\.stock-card\s*\{[\s\S]*?background:\s*var\(--glass\)/);
  assert.match(html, /\.stock-change\.up\s*\{[\s\S]*?color:\s*#3ac97e/);
  assert.match(html, /\.stock-change\.down\s*\{[\s\S]*?color:\s*#f05a5a/);

  const mobileMedia = extractBlock(/@media \(max-width: 560px\) \{/, /\n    \}\n  <\/style>/);
  assert.match(mobileMedia, /\.stock-page\s*\{[\s\S]*?padding:\s*0/);
  assert.match(mobileMedia, /\.stock-main-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(mobileMedia, /\.stock-watchlist-table-wrap\s*\{[\s\S]*?overflow-x:\s*auto/);
});
