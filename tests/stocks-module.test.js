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

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const parenStart = html.indexOf("(", start);
  let parenDepth = 0;
  let braceStart = -1;
  for (let index = parenStart; index < html.length; index += 1) {
    const char = html[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (parenDepth === 0) {
      braceStart = html.indexOf("{", index);
      break;
    }
  }
  assert.notEqual(braceStart, -1, `Missing function body for ${name}`);
  let depth = 0;
  for (let index = braceStart; index < html.length; index += 1) {
    const char = html[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

function loadStockConditionMatcher() {
  return new Function(`
    ${extractFunction("getStockExchange")}
    ${extractFunction("getStockBoardCategory")}
    ${extractFunction("getStockBoardType")}
    ${extractFunction("getStockStatus")}
    ${extractFunction("getStockTrend")}
    ${extractFunction("getStockConditionNumber")}
    ${extractFunction("stockMatchesConditions")}
    return { stockMatchesConditions };
  `)();
}

function loadStockSearchMatcher() {
  return new Function(`
    ${extractFunction("getStockPinyinCollator")}
    ${extractFunction("getStockTextInitial")}
    ${extractFunction("getStockTextInitials")}
    ${extractFunction("stockMatchesSearchText")}
    return { getStockTextInitials, stockMatchesSearchText };
  `)();
}

function loadStockChangeClass() {
  return new Function(`
    ${extractFunction("getStockChangeClass")}
    return { getStockChangeClass };
  `)();
}

function loadStockWatchlistAdder() {
  return new Function(`
    let stockUniverse = [];
    let stockWatchlist = [];
    let stockDataSource = "eastmoney";
    let activeFeature = "stocks";
    let saved = 0;
    let rendered = 0;
    const messages = [];
    function showToast(message, type = "") { messages.push({ message, type }); }
    function saveStockWatchlist() { saved += 1; }
    function renderStockSideList() { rendered += 1; }
    function renderStockPage() { rendered += 1; }
    async function refreshRealStockQuotes() { return false; }
    ${extractFunction("getStockIdentity")}
    ${extractFunction("cloneStock")}
    ${extractFunction("getStockByCode")}
    ${extractFunction("getStockId")}
    ${extractFunction("inferStockMarket")}
    ${extractFunction("makeStockIdentityPlaceholder")}
    ${extractFunction("addStockToWatchlist")}
    return {
      addStockToWatchlist,
      setUniverse(items) { stockUniverse = items; },
      state() { return { stockUniverse, stockWatchlist, saved, rendered, messages }; },
    };
  `)();
}

function loadStockFilterApplier() {
  return new Function(`
    let activeQuickStockFilter = "";
    let activeStockTags = [];
    let activeStockStrategy = "";
    let customStockStrategies = [];
    const defaultStockStrategies = [];
    const stockFilterTags = [
      { id: "sz-only", conditions: { exchange: "深交所" } }
    ];
    const stockFilters = {
      minChange: "",
      maxChange: "",
      minVolume: "",
      maxVolume: "",
      minPe: "",
      maxPe: "",
      minPb: "",
      maxPb: "",
      minRoe: "",
      maxRoe: "",
      industry: "all",
      metric: "all",
      logic: "and"
    };
    ${extractFunction("getStockExchange")}
    ${extractFunction("getStockBoardCategory")}
    ${extractFunction("getStockBoardType")}
    ${extractFunction("getStockStatus")}
    ${extractFunction("getStockTrend")}
    ${extractFunction("getCombinedStockConditions")}
    ${extractFunction("hasStockConditions")}
    ${extractFunction("getStockConditionNumber")}
    ${extractFunction("stockMatchesConditions")}
    ${extractFunction("getQuickFilterStocks")}
    ${extractFunction("applyStockFilters")}
    return {
      applyStockFilters,
      setQuickFilter(value) { activeQuickStockFilter = value; },
      setActiveTags(value) { activeStockTags = value; },
    };
  `)();
}

function loadStockMiniChartDrawer() {
  return new Function(`
    let stockApiReady = true;
    let activeFeature = "stocks";
    let stockMiniHistoryLoading = new Set();
    let marketIndices = [];
    let stockUniverse = [];
    let stockWatchlist = [];
    let loadCalls = 0;
    let drawCalls = 0;
    const canvas = {
      dataset: { stockChart: "sh600001" },
      drawnHistory: [],
    };
    const document = {
      querySelectorAll(selector) {
        return selector === "canvas[data-stock-chart]" ? [canvas] : [];
      },
    };
    function drawMiniKLine(target, history) {
      drawCalls += 1;
      target.drawnHistory = history;
    }
    async function loadRealStockHistory(stock) {
      loadCalls += 1;
      stock.history = [
        { open: 10, high: 11, low: 9, close: 10.5 },
        { open: 10.5, high: 12, low: 10, close: 11.8 },
      ];
      return true;
    }
    ${extractFunction("getStockIdentity")}
    ${extractFunction("getStockMiniChartHistory")}
    ${extractFunction("requestStockMiniChartHistory")}
    ${extractFunction("drawStockCanvases")}
    return {
      canvas,
      drawStockCanvases,
      setWatchlist(items) { stockWatchlist = items; },
      stats() { return { loadCalls, drawCalls }; },
    };
  `)();
}

function loadStockHistoryLoader(fetchItems = []) {
  return new Function("fetchItems", `
    let stockApiReady = true;
    let stockApiStatus = "live";
    let stockApiErrorMessage = "";
    let activeStockDailyPeriod = "day";
    let activeStockDailyRange = "60";
    const stockHistoryLoads = new Map();
    const stockDailyPeriods = [
      { id: "day", label: "日K", mode: "k", groupSize: 1 }
    ];
    const stockDailyRanges = [
      { id: "60", label: "60日", days: 60 }
    ];
    async function fetchStockApi() {
      return { items: fetchItems, source: "xueqiu", updatedAt: "2026-06-09T02:44:47.566Z" };
    }
    function getStockApiErrorMessage(error) {
      return error?.message || "历史K线加载失败";
    }
    ${extractFunction("getStockDailyK")}
    ${extractFunction("getStockDailyRange")}
    ${extractFunction("getStockDailyPeriod")}
    ${extractFunction("getStockHistoryRangeParam")}
    ${extractFunction("mergeStockHistory")}
    ${extractFunction("getStockIdentity")}
    ${extractFunction("getStockHistoryLoadKey")}
    ${extractFunction("loadRealStockHistory")}
    ${extractFunction("getStockDailyEmptyMessage")}
    return {
      loadRealStockHistory,
      getStockDailyEmptyMessage,
      getStockHistoryLoadKey,
      state() { return { stockApiStatus, stockApiErrorMessage }; },
    };
  `)(fetchItems);
}

function loadStockApiBaseUrl({ hostname = "127.0.0.1", stored = "", override = "" } = {}) {
  return new Function("hostname", "stored", "override", `
    const STOCK_API_BASE_URL_KEY = "glass_nav_stock_api_base_url";
    const STOCK_DEFAULT_API_BASE_URL = "https://tool-web-stock-api.onrender.com";
    const STOCK_LOCAL_API_BASE_URL = "http://127.0.0.1:8787";
    const localStorage = { getItem(key) { return key === STOCK_API_BASE_URL_KEY ? stored : ""; } };
    const window = { location: { hostname }, STOCK_API_BASE_URL: override };
    ${extractFunction("getDefaultStockApiBaseUrl")}
    ${extractFunction("getStockApiBaseUrl")}
    return getStockApiBaseUrl();
  `)(hostname, stored, override);
}

test("stocks module is registered and routed from the existing feature shell", () => {
  assert.match(html, /const STOCK_WATCHLIST_KEY = "glass_nav_stock_watchlist"/);
  assert.match(html, /const marketIndices = \[\]/);
  assert.match(html, /const stockUniverse = \[\]/);
  assert.match(html, /let stockApiStatus = "loading"/);
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
    "getStockApiBaseUrl",
    "fetchStockApi",
    "mapApiStock",
    "mergeStockQuote",
    "getStockHistoryRangeParam",
    "mergeStockHistory",
    "loadRealStockHistory",
    "loadRealStockUniverse",
    "refreshRealStockQuotes",
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
  assert.match(html, /const STOCK_API_BASE_URL_KEY = "glass_nav_stock_api_base_url"/);
  assert.match(html, /function searchStocks\(keyword\)/);
  assert.match(html, /stockUniverse\.filter\(stock =>/);
  assert.match(html, /\/v1\/stocks\/\$\{stock\.market\}\/\$\{stock\.code\}\/history/);
  assert.match(html, /\/v1\/quotes/);
  assert.match(html, /x-data-source/);
  assert.match(html, /stockDataSource = "xueqiu"/);
  assert.match(html, /stockApiErrorMessage/);
  assert.match(html, /function renderStockDataStatus\(\)/);
  assert.match(html, /function formatStockDataMeta\(stock\)/);
  assert.match(html, /stockDataSource = response\.source \|\| response\.headers\.get\("x-data-source"\) \|\| stockDataSource/);
  assert.match(html, /stockApiStatus = "live"/);
  assert.match(html, /source=\$\{escapeHTML\(stock\.source \|\| stockDataSource\)\}/);
  assert.match(html, /updatedAt/);
  assert.match(html, /delayed/);
  assert.match(html, /localStorage\.setItem\(STOCK_WATCHLIST_KEY/);
  assert.match(html, /openStockDetail\(first\)/);
  assert.doesNotMatch(html, /if \(first\) addStockToWatchlist\(first\.code, first\.market\)/);
  assert.match(html, /getStockMiniChartHistory\(stock, days\)/);
});

test("stocks module requires the backend API and does not fall back to generated mock quotes", () => {
  assert.match(html, /async function loadRealStockUniverse\(\{ force = false, foreground = true \} = \{\}\)/);
  assert.match(html, /const STOCK_UNIVERSE_LOAD_LIMIT = 6000/);
  assert.match(html, /fetchStockApi\(`\/v1\/stocks\/universe\?limit=\$\{STOCK_UNIVERSE_LOAD_LIMIT\}`\)/);
  assert.doesNotMatch(html, /STOCK_REAL_SEARCH_SEEDS/);
  assert.doesNotMatch(html, /encodeURIComponent\(seed\)/);
  assert.match(html, /stockUniverse\.splice\(0, stockUniverse\.length, \.\.\.mapped\)/);
  assert.match(html, /stockWatchlist = stockWatchlist\.map\(stock => getStockByCode\(stock\.code, stock\.market\) \|\| stock\)/);
  assert.match(html, /async function refreshRealStockQuotes\(\)/);
  assert.match(html, /body: JSON\.stringify\(\{ symbols \}\)/);
  assert.match(html, /response\.items\.forEach\(mergeStockQuote\)/);
  assert.match(html, /stockApiStatus = "error"/);
  assert.match(html, /stockApiErrorMessage = getStockApiErrorMessage\(error\)/);
  assert.match(html, /showToast\(stockApiErrorMessage, "error"\)/);
  assert.doesNotMatch(html, /marketIndices\.forEach\(mutateStockQuote\)/);
  assert.doesNotMatch(html, /stockUniverse\.forEach\(mutateStockQuote\)/);
  assert.doesNotMatch(html, /stockWatchlist\.forEach\(mutateStockQuote\)/);
  assert.doesNotMatch(html, /makeMockStockUniverse/);
  assert.doesNotMatch(html, /STOCK_MOCK_TOTAL/);
  assert.doesNotMatch(html, /stockDataSource = "mock-a-share"/);
  assert.match(html, /await loadRealStockUniverse\(\)/);
});

test("stocks default API base is configured to the public Render backend before startup", () => {
  const apiConfig = 'const STOCK_DEFAULT_API_BASE_URL = "https://tool-web-stock-api.onrender.com";';
  const configIndex = html.indexOf(apiConfig);
  const startupIndex = html.lastIndexOf("initializeRealStockData();");

  assert.notEqual(configIndex, -1);
  assert.notEqual(startupIndex, -1);
  assert.ok(configIndex < startupIndex);
});

test("stocks local static pages use the local API server by default", () => {
  assert.match(html, /const STOCK_LOCAL_API_BASE_URL = "http:\/\/127\.0\.0\.1:8787"/);
  assert.equal(loadStockApiBaseUrl({ hostname: "127.0.0.1" }), "http://127.0.0.1:8787");
  assert.equal(loadStockApiBaseUrl({ hostname: "localhost" }), "http://127.0.0.1:8787");
  assert.equal(loadStockApiBaseUrl({ hostname: "kid1412.dpdns.org" }), "https://tool-web-stock-api.onrender.com");
  assert.equal(loadStockApiBaseUrl({ hostname: "127.0.0.1", stored: "http://example.test/api/" }), "http://example.test/api");
  assert.equal(loadStockApiBaseUrl({ hostname: "127.0.0.1", override: "http://window.test/api/" }), "http://window.test/api");
});

test("stock daily list uses the unified loaded universe instead of paged universe loading", () => {
  assert.doesNotMatch(html, /const STOCK_UNIVERSE_PREFETCH_CONCURRENCY/);
  assert.doesNotMatch(html, /let activeStockUniversePage = 1/);
  assert.doesNotMatch(html, /const stockUniversePages = new Map\(\)/);
  assert.doesNotMatch(html, /const stockUniversePageLoads = new Map\(\)/);
  assert.doesNotMatch(html, /let stockUniversePrefetching = false/);
  assert.doesNotMatch(html, /function renderStockUniversePagination\(\)/);
  assert.doesNotMatch(html, /data-stock-daily-page="prev"/);
  assert.doesNotMatch(html, /data-stock-daily-page="next"/);
  assert.doesNotMatch(html, /data-stock-daily-page-input/);
  assert.doesNotMatch(html, /function setStockUniversePage\(action\)/);
  assert.doesNotMatch(html, /const dailyPageButton = event\.target\.closest\("\[data-stock-daily-page\]"\)/);
  assert.doesNotMatch(html, /const dailyPageInput = event\.target\.closest\("\[data-stock-daily-page-input\]"\)/);
  assert.match(html, /const source = stockUniverse/);
});

test("stock universe background preload prepares chart history from the unified universe", () => {
  assert.match(html, /const STOCK_UNIVERSE_CHART_PREFETCH_LIMIT = 30/);
  assert.match(html, /const stockHistoryLoads = new Map\(\)/);
  assert.match(html, /let stockUniverseChartPreloadRunning = false/);
  assert.match(html, /function getStockHistoryLoadKey\(stock\)/);
  assert.match(html, /async function loadRealStockHistory\(stock, \{ force = false, foreground = true \} = \{\}\)/);
  assert.match(html, /loadRealStockHistory\(stock, \{ foreground: false \}\)/);
});

test("stock universe chart preload follows the unified stock order", () => {
  const orderedChartBlock = extractBlock(
    /async function preloadStockUniverseCharts\(\) \{/,
    /\n    \}\n\n    function scheduleStockUniverseChartPreload/
  );

  assert.match(html, /function scheduleStockUniverseChartPreload\(\)/);
  assert.match(html, /function getStockUniverseChartPreloadStocks\(\)/);
  assert.match(orderedChartBlock, /const stocks = getStockUniverseChartPreloadStocks\(\)/);
  assert.doesNotMatch(orderedChartBlock, /stockUniverse\.slice\(0, STOCK_UNIVERSE_CHART_PREFETCH_LIMIT\)/);
  assert.match(orderedChartBlock, /for \(const stock of stocks\)/);
  assert.match(orderedChartBlock, /if \(activeFeature === "stocks"\) drawStockCanvases\(\)/);
});

test("stock universe chart preload prioritizes the active and visible daily stocks", () => {
  const candidatesBlock = extractBlock(
    /function getStockUniverseChartPreloadStocks\(\) \{/,
    /\n    \}\n\n    async function preloadStockUniverseCharts/
  );

  assert.match(candidatesBlock, /const seen = new Set\(\)/);
  assert.match(candidatesBlock, /addStock\(getActiveDailyStock\(\)\)/);
  assert.match(candidatesBlock, /const sortedStocks = getSortedDailyStocks\(\)/);
  assert.match(candidatesBlock, /stockDailyVirtualStart/);
  assert.match(candidatesBlock, /STOCK_DAILY_VIRTUAL_COUNT/);
  assert.match(candidatesBlock, /STOCK_DAILY_VIRTUAL_BUFFER/);
  assert.match(candidatesBlock, /STOCK_UNIVERSE_CHART_PREFETCH_LIMIT/);
  assert.doesNotMatch(candidatesBlock, /sortedStocks\.forEach\(addStock\)/);
});

test("stock daily list changes reschedule chart preload for newly visible rows", () => {
  const searchBlock = extractBlock(
    /function setStockDailySearch\(value\) \{/,
    /\n    \}\n\n    function setActiveDailyStock/
  );
  const filterBlock = extractBlock(
    /function toggleStockDailyFilter\(id\) \{/,
    /\n    \}\n\n    function getActiveDailyStock/
  );
  const sortBlock = extractBlock(
    /function setStockDailySort\(sort\) \{/,
    /\n    \}\n\n    function handleStockDailyListScroll/
  );
  const scrollBlock = extractBlock(
    /function handleStockDailyListScroll\(list\) \{/,
    /\n    \}\n\n    function createCustomStockStrategy/
  );

  assert.match(searchBlock, /scheduleStockUniverseChartPreload\(\)/);
  assert.match(filterBlock, /scheduleStockUniverseChartPreload\(\)/);
  assert.match(sortBlock, /scheduleStockUniverseChartPreload\(\)/);
  assert.match(scrollBlock, /scheduleStockUniverseChartPreload\(\)/);
});

test("stock chart preload queues a follow-up run when the visible window changes mid-preload", () => {
  const preloadBlock = extractBlock(
    /async function preloadStockUniverseCharts\(\) \{/,
    /\n    \}\n\n    function scheduleStockUniverseChartPreload/
  );
  const scheduleBlock = extractBlock(
    /function scheduleStockUniverseChartPreload\(\) \{/,
    /\n    \}\n\n    async function refreshRealStockQuotes/
  );

  assert.match(preloadBlock, /stockUniverseChartPreloadScheduled = false/);
  assert.match(preloadBlock, /if \(stockUniverseChartPreloadScheduled\) \{/);
  assert.match(preloadBlock, /scheduleStockUniverseChartPreload\(\)/);
  assert.match(scheduleBlock, /activeFeature !== "stocks"/);
  assert.match(scheduleBlock, /stockUniverseChartPreloadScheduled = true/);
  assert.match(scheduleBlock, /if \(stockUniverseChartPreloadRunning\) return/);
});

test("stock daily chart selection reuses cached or in-flight history requests", () => {
  const selectBlock = extractBlock(
    /function setActiveDailyStock\(id\) \{/,
    /\n    \}\n\n    function setStockDailyRange/
  );

  assert.match(selectBlock, /loadRealStockHistory\(stock\)\.then/);
  assert.doesNotMatch(selectBlock, /force:\s*true/);
});

test("stock daily chart redraws after empty or failed history loads", () => {
  const selectBlock = extractBlock(
    /function setActiveDailyStock\(id\) \{/,
    /\n    \}\n\n    function setStockDailyRange/
  );
  const rangeBlock = extractBlock(
    /function setStockDailyRange\(id\) \{/,
    /\n    \}\n\n    function getStockDailyRangeIndex/
  );
  const periodBlock = extractBlock(
    /function setStockDailyPeriod\(id\) \{/,
    /\n    \}\n\n    function zoomStockDailyRange/
  );
  const searchBlock = extractBlock(
    /function setStockDailySearch\(value\) \{/,
    /\n    \}\n\n    function setActiveDailyStock/
  );
  const filterBlock = extractBlock(
    /function toggleStockDailyFilter\(id\) \{/,
    /\n    \}\n\n    function getActiveDailyStock/
  );

  assert.match(selectBlock, /loadRealStockHistory\(stock\)\.then\(\(\) => \{/);
  assert.match(selectBlock, /if \(activeDailyStockId === id\) updateStockDailyChart\(\)/);
  assert.doesNotMatch(selectBlock, /if \(loaded && activeDailyStockId === id\)/);
  assert.match(rangeBlock, /loadRealStockHistory\(getActiveDailyStock\(\)\)\.then\(\(\) => \{/);
  assert.match(rangeBlock, /updateStockDailyChart\(\)/);
  assert.doesNotMatch(rangeBlock, /if \(loaded\) updateStockDailyChart\(\)/);
  assert.match(periodBlock, /loadRealStockHistory\(getActiveDailyStock\(\)\)\.then\(\(\) => \{/);
  assert.match(periodBlock, /updateStockDailyChart\(\)/);
  assert.doesNotMatch(periodBlock, /if \(loaded\) updateStockDailyChart\(\)/);
  assert.match(searchBlock, /loadRealStockHistory\(nextStock\)\.then\(\(\) => \{/);
  assert.match(searchBlock, /if \(activeDailyStockId === nextStock\.id\) updateStockDailyChart\(\)/);
  assert.doesNotMatch(searchBlock, /if \(loaded && activeDailyStockId === nextStock\.id\)/);
  assert.match(filterBlock, /loadRealStockHistory\(nextStock\)\.then\(\(\) => \{/);
  assert.match(filterBlock, /if \(activeDailyStockId === nextStock\.id\) updateStockDailyChart\(\)/);
  assert.doesNotMatch(filterBlock, /if \(loaded && activeDailyStockId === nextStock\.id\)/);
});

test("stocks data starts loading when the app opens", () => {
  const startupBlock = extractBlock(
    /const initialConfig = loadUserConfig\(\);/,
    /\n  <\/script>/
  );
  const loadUniverseBlock = extractBlock(
    /async function loadRealStockUniverse\(\{ force = false, foreground = true \} = \{\}\) \{/,
    /\n    \}\n\n    async function refreshRealStockQuotes/
  );

  assert.match(startupBlock, /initializeRealStockData\(\);\s*renderAppShell\(\)/);
  assert.match(loadUniverseBlock, /if \(!force && stockUniverse\.length\)/);
});

test("stock daily K view fetches real history for the active stock", () => {
  assert.match(html, /function getStockHistoryRangeParam\(\)/);
  assert.match(html, /async function loadRealStockHistory\(stock, \{ force = false, foreground = true \} = \{\}\)/);
  assert.match(html, /period=\$\{encodeURIComponent\(period\)\}&range=\$\{encodeURIComponent\(range\)\}/);
  assert.match(html, /stock\.dailyK = response\.items\.map\(mergeStockHistory\)/);
  assert.match(html, /await loadRealStockHistory\(getActiveDailyStock\(\)\)/);
  assert.match(html, /loadRealStockHistory\(stock\)\.then/);
  assert.match(html, /drawStockDailyCanvas\(\)/);
});

test("stock daily minute chart falls back to loaded K history when intraday is missing", () => {
  assert.match(html, /function getFallbackStockMinuteSeries\(stock\)/);
  assert.match(html, /return getFallbackStockMinuteSeries\(stock\)/);
  assert.match(html, /const history = getStockMiniChartHistory\(stock, 2\)/);
});

test("stock daily chart shows an explicit loading state while history is missing", () => {
  assert.match(html, /function drawStockDailyEmptyState\(canvas, message\)/);
  assert.match(html, /function getStockDailyEmptyMessage\(stock\)/);
  assert.match(html, /return "图表加载中";/);
  assert.match(html, /drawStockDailyEmptyState\(canvas, getStockDailyEmptyMessage\(stock\)\)/);
});

test("stock daily chart marks an empty history response instead of staying in loading state", async () => {
  const module = loadStockHistoryLoader([]);
  const stock = {
    market: "SZ",
    code: "000535",
    dailyK: [{ date: "2005-09-21", open: 0.5, high: 0.5, low: 0.5, close: 0.5, volume: 0 }],
    history: [{ open: 0.5, high: 0.5, low: 0.5, close: 0.5 }],
  };

  const loaded = await module.loadRealStockHistory(stock);

  assert.equal(loaded, false);
  assert.equal(stock.historyLoadKey, "SZ000535:day:60d");
  assert.equal(stock.historyLoadEmptyKey, "SZ000535:day:60d");
  assert.deepEqual(stock.dailyK, []);
  assert.deepEqual(stock.history, []);
  assert.equal(module.getStockDailyEmptyMessage(stock), "当前行情源未返回历史K线数据");
});

test("stock refresh updates existing nodes instead of rerendering the page", () => {
  assert.match(html, /data-stock-cell="price"/);
  assert.match(html, /data-stock-cell="changePercent"/);
  assert.match(html, /data-stock-quick-label="top-up"/);
  assert.match(html, /\.stock-tick-change/);
  assert.match(html, /@keyframes stockTickPulse/);

  const refreshBlock = extractBlock(
    /async function refreshStockPrices\(\) \{/,
    /\n    \}\n\n    function clearStockDragClasses/
  );
  assert.match(refreshBlock, /updateStockDynamicData\(\)/);
  assert.doesNotMatch(refreshBlock, /renderStockPage\(\)/);
  assert.doesNotMatch(refreshBlock, /innerHTML/);

  const dynamicUpdateBlock = extractBlock(
    /function updateStockDynamicData\(\) \{/,
    /\n    \}\n\n    async function refreshStockPrices/
  );
  assert.doesNotMatch(dynamicUpdateBlock, /updateStockMarketData\(\)/);
  assert.match(dynamicUpdateBlock, /updateStockWatchlistData\(\)/);
  assert.match(dynamicUpdateBlock, /updateQuickStockCards\(\)/);
  assert.match(dynamicUpdateBlock, /drawStockCanvases\(\)/);
});

test("stock watchlist add falls back to a placeholder while universe is loading", () => {
  const module = loadStockWatchlistAdder();

  assert.equal(module.addStockToWatchlist("603380", "SH"), true);

  const state = module.state();
  assert.equal(state.stockWatchlist.length, 1);
  assert.equal(state.stockWatchlist[0].code, "603380");
  assert.equal(state.stockWatchlist[0].market, "SH");
  assert.equal(state.stockWatchlist[0].name, "603380");
  assert.equal(state.saved, 1);
  assert.equal(state.rendered, 2);
  assert.equal(state.messages.at(-1).message, "已添加 603380");
  assert.equal(module.addStockToWatchlist("603380", "SH"), false);
});

test("stock quick observation filters ignore stale advanced filters", () => {
  const module = loadStockFilterApplier();
  const watchlist = [
    { name: "上交上涨", code: "600001", market: "SH", changePercent: 2.1, volume: 10000, pe: 10, pb: 1, roe: 8, industry: "电力", history: [] },
    { name: "深交下跌", code: "000001", market: "SZ", changePercent: -1.2, volume: 10000, pe: 10, pb: 1, roe: 8, industry: "银行", history: [] },
  ];

  module.setActiveTags(["sz-only"]);
  assert.deepEqual(module.applyStockFilters(watchlist).map(stock => stock.name), ["深交下跌"]);

  module.setQuickFilter("top-up");
  assert.deepEqual(module.applyStockFilters(watchlist).map(stock => stock.name), ["上交上涨"]);
  assert.match(html, /筛选结果\/自选总数/);
});

test("stock watchlist mini K chart loads missing history before drawing", async () => {
  const module = loadStockMiniChartDrawer();
  module.setWatchlist([
    {
      id: "sh600001",
      name: "上交股票",
      code: "600001",
      market: "SH",
      changePercent: 1,
      history: [],
    },
  ]);

  module.drawStockCanvases();
  assert.deepEqual(module.stats(), { loadCalls: 1, drawCalls: 0 });

  await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepEqual(module.stats(), { loadCalls: 1, drawCalls: 1 });
  assert.equal(module.canvas.drawnHistory.length, 2);
});

test("stock watchlist expanded row renders that stock daily K chart", () => {
  const detailBlock = extractBlock(
    /function renderStockDetailRow\(stock\) \{/,
    /\n    \}\n\n    function renderStockWatchlist/
  );

  assert.match(detailBlock, /stock-row-daily-detail/);
  assert.match(detailBlock, /日K图/);
  assert.match(detailBlock, /data-stock-detail-mode="day"/);
  assert.match(detailBlock, /data-stock-detail-mode="minute"/);
  assert.match(detailBlock, /getStockDetailChartMode\(\) === "day"/);
  assert.match(detailBlock, /getStockDetailChartMode\(\) === "minute"/);
  assert.match(detailBlock, /class="stock-detail-chart"/);
  assert.match(detailBlock, /data-stock-detail-chart="\$\{escapeHTML\(stock\.id\)\}"/);
  assert.match(detailBlock, /data-stock-chart="\$\{escapeHTML\(stock\.id\)\}"/);
  assert.match(detailBlock, /data-stock-chart-mode="\$\{escapeHTML\(getStockDetailChartMode\(\)\)\}"/);
  assert.match(detailBlock, /data-stock-chart-days="60"/);
  assert.doesNotMatch(detailBlock, /stock-detail-stat/);
});

test("stock watchlist expanded row shows market cap and turnover summary", () => {
  const detailBlock = extractBlock(
    /function renderStockDetailRow\(stock\) \{/,
    /\n    \}\n\n    function renderStockWatchlist/
  );

  assert.match(detailBlock, /const quote = getStockDailyQuoteSnapshot\(stock\)/);
  assert.match(detailBlock, /stock-detail-metrics/);
  assert.match(detailBlock, /总市值/);
  assert.match(detailBlock, /data-stock-detail-cell="marketCap"/);
  assert.match(detailBlock, /formatStockMarketCap\(stock\.marketCap\)/);
  assert.match(detailBlock, /换手率/);
  assert.match(detailBlock, /data-stock-detail-cell="turnover"/);
  assert.match(detailBlock, /quote\.turnover\.toFixed\(2\)/);
});

test("stock watchlist expanded chart can switch between daily K and minute", () => {
  const requiredFunctions = [
    "getStockDetailChartMode",
    "setStockDetailChartMode",
    "getStockDetailMinuteSeries",
    "drawStockDetailMinuteChart"
  ];

  for (const name of requiredFunctions) {
    assert.match(html, new RegExp(`function ${name}\\(`), `Missing ${name}`);
  }

  const clickBlock = extractBlock(
    /function handleStockContentClick\(event\) \{/,
    /\n    \}\n\n    function refreshCategorySection/
  );
  const drawBlock = extractBlock(
    /function drawStockCanvases\(\) \{/,
    /\n    \}\n\n    function drawMiniKLine/
  );

  assert.match(clickBlock, /event\.target\.closest\("\[data-stock-detail-mode\]"\)/);
  assert.match(clickBlock, /setStockDetailChartMode\(detailModeButton\.dataset\.stockDetailMode\)/);
  assert.match(drawBlock, /canvas\.dataset\.stockChartMode === "minute"/);
  assert.match(drawBlock, /drawStockDetailMinuteChart\(canvas, stock\)/);
});

test("stocks use A-share red for gains and green for losses", () => {
  const { getStockChangeClass } = loadStockChangeClass();

  assert.equal(getStockChangeClass(1.2), "up");
  assert.equal(getStockChangeClass(-1.2), "down");
  assert.match(html, /\.stock-change\.up\s*\{\s*color:\s*#f05a5a;/);
  assert.match(html, /\.stock-change\.down\s*\{\s*color:\s*#3ac97e;/);
  assert.match(html, /const color = up \? "#ff8b8b" : "#7ee787"/);
  assert.match(html, /ctx\.fillStyle = up \? "#ff8b8b" : "#7ee787"/);
  assert.match(html, /macdItem\.macd >= 0 \? "#ff8b8b" : "#7ee787"/);
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
    "getStockDailyK",
    "stockMatchesSearchText",
    "getDailyFilterTag",
    "setStockDailySearch",
    "getDailyFilteredStocks",
    "toggleStockDailyFilter",
    "renderStockDailySearch",
    "renderStockDailyFilters",
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
  assert.match(html, /const stockUniverse = \[\]/);
  assert.doesNotMatch(html, /stockUniverse\.push\(\.\.\.makeMockStockUniverse/);
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
  assert.match(html, /id="stockDailySearchInput"/);
  assert.match(html, /data-stock-daily-search/);
  assert.match(html, /placeholder="名称\/代码\/首字母"/);
  assert.match(html, /data-stock-daily-filter/);
  assert.match(html, /const stockDailyFilterTags = \[/);
  assert.match(html, /id: "non-bj"/);
  assert.match(html, /name: "非北交所"/);
  assert.match(html, /id: "non-gem-board"/);
  assert.match(html, /name: "非创业板"/);
  assert.match(html, /excludeBoardType: "创业板"/);
  assert.match(html, /activeStockDailyTags/);
  assert.match(html, /getDailyFilteredStocks\(\)\.length/);
  assert.match(html, /当前筛选条件没有匹配股票/);
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
  assert.match(clickBlock, /event\.target\.closest\("\[data-stock-daily-filter\]"\)/);
  assert.match(clickBlock, /toggleStockDailyFilter\(dailyFilterButton\.dataset\.stockDailyFilter\)/);
  assert.match(clickBlock, /event\.target\.closest\("\[data-stock-daily-range\]"\)/);
  assert.match(clickBlock, /event\.target\.closest\("\[data-stock-daily-sort\]"\)/);

  const inputBlock = extractBlock(
    /content\.addEventListener\("input", event => \{/,
    /\n    \}\);\n\n    content\.addEventListener\("scroll"/
  );
  assert.match(inputBlock, /#stockDailySearchInput/);
  assert.match(inputBlock, /setStockDailySearch\(dailySearch\.value\)/);

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

test("stock search supports Chinese pinyin initials", () => {
  const { getStockTextInitials, stockMatchesSearchText } = loadStockSearchMatcher();
  const maotai = {
    name: "贵州茅台",
    code: "600519",
    market: "SH",
    industry: "白酒",
  };
  const yidelong = {
    name: "易德龙",
    code: "603380",
    market: "SH",
    industry: "消费电子",
  };
  const energy = {
    name: "恒盛能源",
    code: "605580",
    market: "SH",
    industry: "电力",
  };
  const circuit = {
    name: "世运电路",
    code: "603920",
    market: "SH",
    industry: "元件",
  };

  assert.equal(getStockTextInitials("贵州茅台"), "gzmt");
  assert.equal(getStockTextInitials("宁德时代"), "ndsd");
  assert.equal(stockMatchesSearchText(maotai, "gzmt"), true);
  assert.equal(stockMatchesSearchText(maotai, "mt"), false);
  assert.equal(stockMatchesSearchText(maotai, "SH600519"), true);
  assert.equal(stockMatchesSearchText(maotai, "ndsd"), false);
  assert.equal(stockMatchesSearchText(yidelong, "ydl"), true);
  assert.equal(stockMatchesSearchText(energy, "ydl"), false);
  assert.equal(stockMatchesSearchText(circuit, "ydl"), false);
  assert.equal(stockMatchesSearchText(circuit, "sydl"), true);
});

test("stock condition matcher ignores omitted numeric fields for daily tag filters", () => {
  const { stockMatchesConditions } = loadStockConditionMatcher();
  const mainBoardStock = {
    id: "SH:600000",
    market: "SH",
    code: "600000",
    name: "浦发银行",
    boardType: "main",
    status: "normal",
    changePercent: 0.5,
    volume: 100000,
    pe: 10,
    pb: 1,
    roe: 8,
    history: [{ close: 10 }, { close: 10.1 }],
  };

  assert.equal(
    stockMatchesConditions(mainBoardStock, {
      status: "非ST",
      boardType: "非科创板",
      excludeExchange: "北交所",
      logic: "and",
    }),
    true,
  );
  assert.equal(stockMatchesConditions({ ...mainBoardStock, market: "SZ", code: "300750", boardType: "gem" }, { boardType: "非科创板", logic: "and" }), true);
  assert.equal(stockMatchesConditions({ ...mainBoardStock, market: "SZ", code: "300750", boardType: "gem" }, { excludeBoardType: "创业板", logic: "and" }), false);
  assert.equal(stockMatchesConditions({ ...mainBoardStock, market: "SZ", code: "300750", boardType: "创业板" }, { excludeBoardType: "创业板", logic: "and" }), false);
  assert.equal(stockMatchesConditions({ ...mainBoardStock, market: "SZ", code: "301001", boardType: "" }, { excludeBoardType: "创业板", logic: "and" }), false);
  assert.equal(stockMatchesConditions({ ...mainBoardStock, market: "SZ", code: "002415", boardType: "main" }, { excludeBoardType: "创业板", logic: "and" }), true);
  assert.equal(stockMatchesConditions({ ...mainBoardStock, market: "BJ", code: "920992" }, { excludeExchange: "北交所", logic: "and" }), false);
  assert.equal(stockMatchesConditions({ ...mainBoardStock, code: "688001", boardType: "star" }, { boardType: "非科创板", logic: "and" }), false);
  assert.equal(stockMatchesConditions({ ...mainBoardStock, name: "*ST艾艾", status: "normal" }, { status: "非ST", logic: "and" }), false);
  assert.equal(stockMatchesConditions({ ...mainBoardStock, market: "SH" }, { exchange: "深交所", logic: "and" }), false);
  assert.equal(stockMatchesConditions({ ...mainBoardStock, market: "SZ" }, { exchange: "深交所", logic: "and" }), true);
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
