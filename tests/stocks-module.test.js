const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const selectionConfigPath = path.join(__dirname, "..", "src", "stocks", "selection-config.json");

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
    let stockSelectionConfig = ${JSON.stringify(JSON.parse(fs.readFileSync(selectionConfigPath, "utf8")))};
    ${extractFunction("getStockDailyK")}
    ${extractFunction("getStockIdentity")}
    ${extractFunction("getStockExchange")}
    ${extractFunction("getStockBoardCategory")}
    ${extractFunction("getStockBoardType")}
    ${extractFunction("getStockStatus")}
    ${extractFunction("getStockTrend")}
    ${extractFunction("getStockKLineSeries")}
    ${extractFunction("getStockMaValue")}
    ${extractFunction("getStockVolumeRatio")}
    ${extractFunction("getStockSelectionConfig")}
    ${extractFunction("getStockSelectionParameter")}
    ${extractFunction("getStockLimitThreshold")}
    ${extractFunction("isStockLimitUpBar")}
    ${extractFunction("isStockOneLineLimitUpBar")}
    ${extractFunction("getStockConsecutiveLimitCount")}
    ${extractFunction("getStockLimitRunBeforeLatest")}
    ${extractFunction("getStockRecentLimitStats")}
    ${extractFunction("hasStockReversalPullback")}
    ${extractFunction("isStockWeakOrNegativeBar")}
    ${extractFunction("getStockRecentHigh")}
    ${extractFunction("getStockTechnicalSignals")}
    ${extractFunction("stockMatchesTechnicalPattern")}
    ${extractFunction("getStockMatchReasons")}
    ${extractFunction("getStockConditionNumber")}
    ${extractFunction("stockMatchesConditions")}
    return { stockMatchesConditions, stockMatchesTechnicalPattern, getStockTechnicalSignals, getStockMatchReasons };
  `)();
}

function loadStockLimitBoardEngine() {
  return new Function(`
    let stockSelectionConfig = ${JSON.stringify(JSON.parse(fs.readFileSync(selectionConfigPath, "utf8")))};
    ${extractFunction("getStockDailyK")}
    ${extractFunction("getStockIdentity")}
    ${extractFunction("getStockExchange")}
    ${extractFunction("getStockBoardCategory")}
    ${extractFunction("getStockBoardType")}
    ${extractFunction("getStockStatus")}
    ${extractFunction("getStockKLineSeries")}
    ${extractFunction("getStockMaValue")}
    ${extractFunction("getStockVolumeRatio")}
    ${extractFunction("getStockSelectionConfig")}
    ${extractFunction("getStockSelectionParameter")}
    ${extractFunction("getStockLimitThreshold")}
    ${extractFunction("isStockLimitUpBar")}
    ${extractFunction("isStockOneLineLimitUpBar")}
    ${extractFunction("getStockConsecutiveLimitCount")}
    ${extractFunction("getStockLimitRunBeforeLatest")}
    ${extractFunction("getStockRecentLimitStats")}
    ${extractFunction("hasStockReversalPullback")}
    ${extractFunction("isStockWeakOrNegativeBar")}
    ${extractFunction("getStockRecentHigh")}
    ${extractFunction("getStockTechnicalSignals")}
    let excludeStockLimitBoardSt = true;
    let excludeStockLimitBoardGem = true;
    ${extractFunction("stockPassesLimitBoardFilters")}
    ${extractFunction("getStockLimitBoardItem")}
    ${extractFunction("getStockLimitBoardGroups")}
    ${extractFunction("getHighestStockLimitBoardLevel")}
    return { stockPassesLimitBoardFilters, getStockLimitBoardItem, getStockLimitBoardGroups, getHighestStockLimitBoardLevel };
  `)();
}

function loadAutomatedStockSelectionEngine(config) {
  return new Function("config", `
    let stockUniverse = [];
    let stockSelectionConfig = config;
    let stockSelectionConfigStatus = "ready";
    let stockSelectionDataVersion = 1;
    let stockSelectionContextCache = null;
    let stockSelectionContextCacheVersion = -1;
    ${extractFunction("getStockDailyK")}
    ${extractFunction("getStockIdentity")}
    ${extractFunction("getStockExchange")}
    ${extractFunction("getStockBoardCategory")}
    ${extractFunction("getStockBoardType")}
    ${extractFunction("getStockStatus")}
    ${extractFunction("getStockKLineSeries")}
    ${extractFunction("getStockMaValue")}
    ${extractFunction("getStockVolumeRatio")}
    ${extractFunction("getStockLimitThreshold")}
    ${extractFunction("isStockLimitUpBar")}
    ${extractFunction("isStockOneLineLimitUpBar")}
    ${extractFunction("getStockConsecutiveLimitCount")}
    ${extractFunction("getStockLimitRunBeforeLatest")}
    ${extractFunction("getStockRecentLimitStats")}
    ${extractFunction("getStockRecentHigh")}
    ${extractFunction("getStockSelectionConfig")}
    ${extractFunction("getStockSelectionParameter")}
    ${extractFunction("getStockSelectionWindow")}
    ${extractFunction("getStockSelectionStrategyConfig")}
    ${extractFunction("getStockSelectionEnabledStrategies")}
    ${extractFunction("getStockSelectionClosePosition")}
    ${extractFunction("getStockSelectionReturn")}
    ${extractFunction("getStockSelectionPreviousHigh")}
    ${extractFunction("getStockSelectionAverageAmount")}
    ${extractFunction("getStockSelectionAmountRatio")}
    ${extractFunction("getStockSelectionLimitUpCount")}
    ${extractFunction("getStockSelectionIndicators")}
    ${extractFunction("getPercentileRank")}
    ${extractFunction("buildStockSelectionContext")}
    ${extractFunction("getStockSelectionContext")}
    ${extractFunction("stockPassesSelectionBaseFilter")}
    ${extractFunction("matchAutomatedStockStrategy")}
    ${extractFunction("getAutomatedStockSelection")}
    return {
      getAutomatedStockSelection,
      setUniverse(items) {
        stockUniverse = items;
        stockSelectionDataVersion += 1;
        stockSelectionContextCache = null;
      },
    };
  `)(config);
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
    const DEFAULT_STOCK_WATCH_GROUP_ID = "default";
    let stockUniverse = [];
    let stockWatchlist = [];
    let stockWatchGroups = [{ id: DEFAULT_STOCK_WATCH_GROUP_ID, name: "默认分组", stockIds: [] }];
    let activeStockWatchGroupId = DEFAULT_STOCK_WATCH_GROUP_ID;
    let activeStockView = "watchlist";
    let stockDataSource = "eastmoney";
    let activeFeature = "stocks";
    let saved = 0;
    let savedGroups = 0;
    let rendered = 0;
    let sideRendered = 0;
    let pageRendered = 0;
    let dailyButtonsRefreshed = 0;
    const messages = [];
    function showToast(message, type = "") { messages.push({ message, type }); }
    function saveStockWatchlist() { saved += 1; }
    function saveStockWatchGroups() { savedGroups += 1; }
    function renderStockSideList() { rendered += 1; sideRendered += 1; }
    function renderStockPage() { rendered += 1; pageRendered += 1; }
    function refreshStockDailyAddButtons() { dailyButtonsRefreshed += 1; }
    async function refreshRealStockQuotes() { return false; }
    ${extractFunction("getStockIdentity")}
    ${extractFunction("cloneStock")}
    ${extractFunction("getStockByCode")}
    ${extractFunction("getStockId")}
    ${extractFunction("inferStockMarket")}
    ${extractFunction("makeStockIdentityPlaceholder")}
    ${extractFunction("getDefaultStockWatchGroup")}
    ${extractFunction("repairStockWatchGroups")}
    ${extractFunction("getStockWatchGroupById")}
    ${extractFunction("addStockToWatchlist")}
    return {
      addStockToWatchlist,
      setUniverse(items) { stockUniverse = items; },
      setActiveView(value) { activeStockView = value; },
      state() {
        return {
          stockUniverse,
          stockWatchlist,
          stockWatchGroups,
          saved,
          savedGroups,
          rendered,
          sideRendered,
          pageRendered,
          dailyButtonsRefreshed,
          messages
        };
      },
    };
  `)();
}

function loadStockFilterApplier() {
  return new Function(`
    let activeQuickStockFilter = "";
    let activeStockTags = [];
    let activeStockStrategy = "";
    let customStockStrategies = [];
    const defaultStockStrategies = [
      { id: "all_automated", selectionStrategyId: "all" }
    ];
    const stockFilterTags = [
      { id: "sz-only", conditions: { exchange: "深交所" } }
    ];
    const stockFilters = {
      trend: "",
      trendDays: "15",
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
      technicalPattern: "all",
      minVolumeRatio: "",
      maxVolumeRatio: "",
      maPosition: "all",
      industry: "all",
      metric: "all",
      logic: "and"
    };
    ${extractFunction("getStockDailyK")}
    ${extractFunction("getStockExchange")}
    ${extractFunction("getStockBoardCategory")}
    ${extractFunction("getStockBoardType")}
    ${extractFunction("getStockStatus")}
    ${extractFunction("getStockTrend")}
    ${extractFunction("getStockKLineSeries")}
    ${extractFunction("getStockMaValue")}
    ${extractFunction("getStockVolumeRatio")}
    ${extractFunction("getStockLimitThreshold")}
    ${extractFunction("isStockLimitUpBar")}
    ${extractFunction("isStockOneLineLimitUpBar")}
    ${extractFunction("getStockConsecutiveLimitCount")}
    ${extractFunction("getStockLimitRunBeforeLatest")}
    ${extractFunction("getStockRecentLimitStats")}
    ${extractFunction("hasStockReversalPullback")}
    ${extractFunction("isStockWeakOrNegativeBar")}
    ${extractFunction("getStockRecentHigh")}
    ${extractFunction("getStockTechnicalSignals")}
    ${extractFunction("stockMatchesTechnicalPattern")}
    ${extractFunction("getStockStrategyById")}
    ${extractFunction("getCombinedStockConditions")}
    ${extractFunction("hasStockConditions")}
    ${extractFunction("getStockConditionNumber")}
    ${extractFunction("stockMatchesConditions")}
    ${extractFunction("getQuickFilterStocks")}
    function getAutomatedStockSelection() {
      return { isCandidate: false, strategyIds: [] };
    }
    ${extractFunction("applyStockFilters")}
    return {
      applyStockFilters,
      setQuickFilter(value) { activeQuickStockFilter = value; },
      setActiveTags(value) { activeStockTags = value; },
      setActiveStrategy(value) { activeStockStrategy = value; },
    };
  `)();
}

function loadStockStrategyController() {
  return new Function(`
    let activeQuickStockFilter = "top-up";
    let activeStockTags = ["exchange-sh"];
    let activeStockStrategy = "";
    let stockResultPage = 3;
    let saved = 0;
    let rendered = 0;
    let historyScheduled = 0;
    const defaultStockStrategies = [
      { id: "pdf-first-board", conditions: { technicalPattern: "first-board", minVolumeRatio: "1.3", maPosition: "above-ma5", status: "非ST", excludeExchange: "北交所" } }
    ];
    const customStockStrategies = [];
    const stockFilters = {
      trend: "",
      trendDays: "15",
      minChange: "-5",
      maxChange: "8",
      minVolume: "10000",
      maxVolume: "500000",
      minPe: "10",
      maxPe: "35",
      minPb: "1",
      maxPb: "5",
      minRoe: "6",
      maxRoe: "20",
      technicalPattern: "dragon-pullback",
      minVolumeRatio: "2.4",
      maxVolumeRatio: "5",
      maPosition: "below-ma5",
      industry: "银行",
      metric: "low-pe",
      logic: "or"
    };
    function saveStockFilterState() { saved += 1; }
    function renderStockPage() { rendered += 1; }
    function scheduleStockStrategyHistoryLoad() { historyScheduled += 1; }
    ${extractFunction("resetStockAuxiliaryFilters")}
    ${extractFunction("getStockStrategyById")}
    ${extractFunction("applyStockStrategy")}
    return {
      applyStockStrategy,
      state() {
        return {
          activeQuickStockFilter,
          activeStockTags,
          activeStockStrategy,
          stockResultPage,
          stockFilters,
          saved,
          rendered,
          historyScheduled,
        };
      },
    };
  `)();
}

function loadStockWatchlistGroupManager(initialStorage = {}) {
  return new Function("initialStorage", `
    const STOCK_WATCHLIST_KEY = "glass_nav_stock_watchlist";
    const STOCK_WATCHLIST_GROUPS_KEY = "glass_nav_stock_watchlist_groups";
    const DEFAULT_STOCK_WATCH_GROUP_ID = "default";
    const defaultStockWatchCodes = [];
    let stockUniverse = [];
    let stockWatchlist = [];
    let stockWatchGroups = [];
    let activeStockWatchGroupId = DEFAULT_STOCK_WATCH_GROUP_ID;
    let activeFeature = "stocks";
    let activeStockView = "watchlist";
    let stockDataSource = "eastmoney";
    let savedWatchlist = 0;
    let savedGroups = 0;
    let rendered = 0;
    let sideRendered = 0;
    let idSeq = 0;
    const messages = [];
    const storage = { ...initialStorage };
    const localStorage = {
      getItem(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
      setItem(key, value) { storage[key] = String(value); },
      removeItem(key) { delete storage[key]; },
    };
    function makeId() { idSeq += 1; return "group-" + idSeq; }
    function showToast(message, type = "") { messages.push({ message, type }); }
    function renderStockSideList() { sideRendered += 1; }
    function renderStockPage() { rendered += 1; }
    function refreshStockDailyAddButtons() {}
    ${extractFunction("getStockIdentity")}
    ${extractFunction("cloneStock")}
    ${extractFunction("getStockByCode")}
    ${extractFunction("getStockId")}
    ${extractFunction("inferStockMarket")}
    ${extractFunction("makeStockIdentityPlaceholder")}
    ${extractFunction("normalizeStock")}
    ${extractFunction("loadStockWatchlist")}
    ${extractFunction("saveStockWatchlist")}
    ${extractFunction("loadStockWatchGroups")}
    ${extractFunction("saveStockWatchGroups")}
    ${extractFunction("getDefaultStockWatchGroup")}
    ${extractFunction("getStockWatchGroupById")}
    ${extractFunction("getStockWatchGroupStockIds")}
    ${extractFunction("getStockWatchGroupCount")}
    ${extractFunction("getStockWatchlistForGroup")}
    ${extractFunction("repairStockWatchGroups")}
    ${extractFunction("addStockWatchGroup")}
    ${extractFunction("renameStockWatchGroup")}
    ${extractFunction("deleteStockWatchGroup")}
    ${extractFunction("addStockToWatchlist")}
    return {
      bootstrap() {
        stockWatchlist = loadStockWatchlist();
        stockWatchGroups = loadStockWatchGroups(stockWatchlist);
        return this.state();
      },
      addStockToWatchlist,
      addStockWatchGroup,
      renameStockWatchGroup,
      deleteStockWatchGroup,
      setUniverse(items) { stockUniverse = items; },
      state() {
        return {
          stockWatchlist,
          stockWatchGroups,
          activeStockWatchGroupId,
          storage,
          messages,
          savedWatchlist,
          savedGroups,
          rendered,
          sideRendered,
        };
      },
      groupStocks(id) { return getStockWatchlistForGroup(id).map(stock => getStockIdentity(stock)); },
      groupCount(id) { return getStockWatchGroupCount(id); },
    };
  `)(initialStorage);
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

function loadStockHistoryLoader(fetchItems = [], responseOptions = {}) {
  return new Function("fetchItems", "responseOptions", `
    const STOCK_API_STALE_MESSAGE = "上游行情源暂时不可用，当前显示缓存行情。";
    let stockApiReady = true;
    let stockApiStatus = "live";
    let stockApiErrorMessage = "";
    let stockSelectionDataVersion = 0;
    let stockSelectionContextCache = null;
    let fetchCalls = 0;
    let activeStockDailyPeriod = "day";
    let activeStockDailyRange = "60";
    const stockHistoryLoads = new Map();
    const stockDailyPeriods = [
      { id: "day", label: "日K", mode: "k", groupSize: 1 }
    ];
    const stockDailyRanges = [
      { id: "60", label: "60日", days: 60 }
    ];
    async function fetchFastMarketHistory() {
      fetchCalls += 1;
      return { items: fetchItems, source: "tencent", updatedAt: "2026-07-13T11:00:00.000Z", ...responseOptions };
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
      setApiReady(value) { stockApiReady = Boolean(value); },
      state() { return { stockApiStatus, stockApiErrorMessage, fetchCalls }; },
    };
  `)(fetchItems, responseOptions);
}

function loadFastMarketHistoryClient({ directResponse, directError, backendResponse } = {}) {
  return new Function("directResponse", "directError", "backendResponse", `
    let backendCalls = 0;
    let stockCalls = 0;
    let etfCalls = 0;
    const cacheWrites = [];
    function getBrowserTencentProvider() {
      return Promise.resolve({
        getHistory() {
          stockCalls += 1;
          if (directError) return Promise.reject(directError);
          return Promise.resolve(directResponse);
        },
        getEtfHistory() {
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

test("browser history uses Tencent directly and retains the response", async () => {
  const directResponse = {
    items: [{ time: "2026-07-13", close: 11 }],
    source: "tencent",
  };
  const client = loadFastMarketHistoryClient({ directResponse });
  const path = "/v1/stocks/SH/600519/history?period=day&range=60d";

  const response = await client.fetchFastMarketHistory(path, {
    market: "SH",
    code: "600519",
    period: "day",
    range: "60d",
    type: "stock",
  });
  const state = client.state();

  assert.equal(response.source, "tencent");
  assert.equal(response.stale, false);
  assert.equal(response.headers.get("x-data-source"), "tencent");
  assert.equal(state.stockCalls, 1);
  assert.equal(state.backendCalls, 0);
  assert.deepEqual(state.cacheWrites, [{
    key: `cache:${path}`,
    value: directResponse,
    retentionMs: 30_000,
  }]);
});

test("browser ETF history uses the Tencent ETF method", async () => {
  const client = loadFastMarketHistoryClient({
    directResponse: {
      items: [{ time: "2026-07-13", close: 4.74 }],
      source: "tencent",
    },
  });

  await client.fetchFastMarketHistory(
    "/v1/etfs/SH/510300/history?period=day&range=60d",
    { market: "SH", code: "510300", period: "day", range: "60d", type: "etf" },
  );

  assert.equal(client.state().etfCalls, 1);
  assert.equal(client.state().stockCalls, 0);
});

test("browser history falls back to the existing backend once", async () => {
  const backendResponse = {
    items: [{ time: "2026-07-12", close: 10 }],
    source: "eastmoney",
  };
  const client = loadFastMarketHistoryClient({
    directError: new Error("cors blocked"),
    backendResponse,
  });
  const path = "/v1/stocks/SH/600519/history?period=day&range=60d";

  const response = await client.fetchFastMarketHistory(path, {
    market: "SH",
    code: "600519",
    period: "day",
    range: "60d",
    type: "stock",
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

test("active stock history loads before the backend universe is ready", async () => {
  const module = loadStockHistoryLoader([
    {
      time: "2026-07-13",
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 1000,
      amount: 2000,
    },
  ]);
  module.setApiReady(false);
  const stock = {
    id: "sh600519",
    market: "SH",
    code: "600519",
    dailyK: [],
    history: [],
  };

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

function loadStockHistoryStateMerger() {
  return new Function(`
    ${extractFunction("mergeStockLoadedHistory")}
    return mergeStockLoadedHistory;
  `)();
}

test("canonical universe stocks retain history loaded on placeholders", () => {
  const merge = loadStockHistoryStateMerger();
  const canonical = {
    id: "sh600519",
    market: "SH",
    code: "600519",
    name: "贵州茅台",
    dailyK: [],
    history: [],
  };
  const placeholder = {
    id: "sh600519",
    market: "SH",
    code: "600519",
    source: "tencent",
    dailyK: [{ time: "2026-07-13", close: 1210.99 }],
    history: [{ open: 1200, high: 1220, low: 1190, close: 1210.99 }],
    historyLoadKey: "SH600519:day:60d",
    historyLoadEmptyKey: "",
    historyLoadErrorKey: "",
    historyLoadErrorMessage: "",
    historyDataStale: false,
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

  assert.ok(
    block.indexOf("loadRealStockHistory(activeStock)")
      < block.indexOf("loadRealStockUniverse({ notify: false })"),
  );
  assert.match(block, /Promise\.all\(\[historyRequest, universeRequest\]\)/);
  assert.match(block, /stockWatchlist\[0\]/);
  assert.match(block, /makeStockIdentityPlaceholder\(defaultStockWatchCodes\[0\]\)/);
  assert.match(block, /mergeStockLoadedHistory\(canonical, activeStock\)/);
  assert.match(block, /stockApiStatus = "chart-live"/);
  assert.match(
    html,
    /async function loadRealStockUniverse\(\{ force = false, foreground = true, notify = true \} = \{\}\)/,
  );
});

test("stock status distinguishes a direct chart from a loaded universe", () => {
  const status = extractFunction("renderStockDataStatus");

  assert.match(status, /stockApiStatus === "chart-live"/);
  assert.match(status, /图表直连可用/);
  assert.match(status, /股票列表暂不可用/);
});

function loadStockUniverseLoader(response) {
  return new Function("response", `
    const STOCK_API_STALE_MESSAGE = "上游行情源暂时不可用，当前显示缓存行情。";
    const STOCK_UNIVERSE_LOAD_LIMIT = 6000;
    const stockUniverse = [];
    let stockApiReady = false;
    let stockApiLoading = false;
    let stockApiStatus = "loading";
    let stockApiErrorMessage = "";
    let activeFeature = "";
    function fetchStockApi() { return Promise.resolve(response); }
    function storeStockUniverse(value) { stockUniverse.splice(0, stockUniverse.length, ...(value.items || [])); }
    function scheduleStockUniverseChartPreload() {}
    function showToast() {}
    function renderStockPage() {}
    ${extractFunction("loadRealStockUniverse").replace("function loadRealStockUniverse", "async function loadRealStockUniverse")}
    return {
      loadRealStockUniverse,
      state() { return { stockApiReady, stockApiStatus, stockApiErrorMessage, stockUniverse }; },
    };
  `)(response);
}

function loadStockQuoteRefresher(errorMessage = "Xueqiu outbound rate limit exceeded") {
  return new Function("errorMessage", `
    const STOCK_DAILY_FAST_MODE = false;
    let stockApiReady = true;
    let stockApiStatus = "live";
    let stockApiErrorMessage = "";
    let stockDataSource = "eastmoney";
    let activeFeature = "stocks";
    const messages = [];
    const stockWatchlist = [];
    const stockUniverse = [
      { id: "SH:600000", market: "SH", code: "600000", name: "浦发银行" },
      { id: "SZ:000001", market: "SZ", code: "000001", name: "平安银行" }
    ];
    function getStockIdentity(stock) { return stock.id || stock.market + stock.code; }
    function getStockApiErrorMessage(error) { return error?.message || "报价刷新失败"; }
    function showToast(message, type = "") { messages.push({ message, type }); }
    function mergeStockQuote() {}
    async function fetchStockApi() { throw new Error(errorMessage); }
    ${extractFunction("refreshRealStockQuotes").replace("function refreshRealStockQuotes", "async function refreshRealStockQuotes")}
    return {
      refreshRealStockQuotes,
      state() { return { stockApiReady, stockApiStatus, stockApiErrorMessage, messages }; },
    };
  `)(errorMessage);
}

function loadStockApiErrorFormatter() {
  return new Function(`
    ${extractFunction("getStockApiErrorMessage")}
    return getStockApiErrorMessage;
  `)();
}

function loadStockApiClient(responses) {
  return new Function("responses", `
    const STOCK_API_RETRY_ATTEMPTS = 2;
    const STOCK_API_RETRY_DELAY_MS = 0;
    const STOCK_API_UNIVERSE_CACHE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
    const STOCK_API_HISTORY_CACHE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
    const STOCK_API_CACHE_DB_NAME = "tool_web_stock_cache";
    const STOCK_API_CACHE_DB_VERSION = 1;
    const STOCK_API_CACHE_STORE = "responses";
    const stockApiMemoryCache = new Map();
    let stockApiCacheDbPromise = null;
    let fetchCalls = 0;
    const window = { indexedDB: null };
    function getStockApiBaseUrl() { return "https://stock-api.test"; }
    async function fetch() {
      const next = responses[fetchCalls];
      fetchCalls += 1;
      if (next instanceof Error) throw next;
      if (!next) throw new Error("Missing test response");
      return next;
    }
    ${extractFunction("getStockApiCacheRetentionMs")}
    ${extractFunction("getStockApiCacheKey")}
    ${extractFunction("openStockApiCacheDb")}
    ${extractFunction("readStockApiCache").replace("function readStockApiCache", "async function readStockApiCache")}
    ${extractFunction("writeStockApiCache").replace("function writeStockApiCache", "async function writeStockApiCache")}
    ${extractFunction("getStockApiCachedResponse")}
    ${extractFunction("createStockApiError")}
    ${extractFunction("isTransientStockApiError")}
    ${extractFunction("shouldRetryStockApiRequest")}
    ${extractFunction("waitForStockApiRetry")}
    ${extractFunction("fetchStockApi").replace("function fetchStockApi", "async function fetchStockApi")}
    return {
      fetchStockApi,
      getStockApiCacheKey,
      readStockApiCache,
      writeStockApiCache,
      state() { return { fetchCalls }; },
    };
  `)(responses);
}

function renderStockDataStatusFixture({
  status = "live",
  loaded = 4,
  total = 4,
  source = "eastmoney",
  error = "",
} = {}) {
  return new Function("fixture", `
    let stockApiStatus = fixture.status;
    let stockUniverseTotal = fixture.total;
    let stockDataSource = fixture.source;
    let stockApiErrorMessage = fixture.error;
    const stockUniverse = Array.from({ length: fixture.loaded }, (_, index) => ({ code: String(index) }));
    ${extractFunction("escapeHTML")}
    ${extractFunction("renderStockDataStatus")}
    return renderStockDataStatus();
  `)({ status, loaded, total, source, error });
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
  assert.match(html, /const STOCK_DAILY_FAST_MODE = true;/);
  assert.match(html, /class="stock-page"/);
  assert.match(html, /class="stock-search-form"/);
  assert.match(html, /id="stockSearchInput"/);
  assert.match(html, /placeholder="搜索股票代码或名称，例如 600519 \/ 茅台"/);
  assert.match(html, /id="stockSearchResults"/);
  assert.match(html, /class="stock-mobile-tabs"/);
  const stockViewsBlock = extractBlock(
    /const stockViews = \[/,
    /\n\s+\];\n\s+const STOCK_DAILY_FAST_MODE/
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

test("stock limit-board view is registered and schedules candidate history loading", () => {
  assert.match(html, /id: "limit-board"/);
  assert.match(html, /name: "连板"/);
  assert.match(html, /let activeStockLimitBoardLevel = 0/);
  assert.match(html, /let stockLimitBoardHistoryLoading = false/);
  assert.match(html, /function scheduleStockLimitBoardHistoryLoad\(\)/);
  assert.match(html, /loadRealStockHistory\(stock, \{ foreground: false \}\)/);
  assert.match(html, /activeStockView === "limit-board"/);
});

test("stock ETF view is registered with independent state and rendering", () => {
  const limitBoardUniverseBlock = extractFunction("getStockLimitBoardUniverse");

  assert.match(html, /id: "etf"/);
  assert.match(html, /name: "行业ETF"/);
  assert.match(html, /let etfUniverse = \[\]/);
  assert.match(html, /let activeEtfId = ""/);
  assert.match(html, /function loadRealEtfUniverse\(\)/);
  assert.match(html, /function loadRealEtfHistory\(/);
  assert.match(html, /function renderStockEtfView\(\)/);
  assert.match(html, /activeStockView === "etf"/);
  assert.match(html, /data-stock-etf-row/);
  assert.match(html, /data-stock-etf-category/);
  assert.match(html, /data-stock-daily-chart/);
  assert.doesNotMatch(limitBoardUniverseBlock, /etfUniverse/);
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
  assert.match(html, /async function loadRealStockUniverse\(\{ force = false, foreground = true, notify = true \} = \{\}\)/);
  assert.match(html, /const STOCK_UNIVERSE_LOAD_LIMIT = 6000/);
  assert.match(html, /fetchStockApi\(`\/v1\/stocks\/universe\?limit=\$\{STOCK_UNIVERSE_LOAD_LIMIT\}`\)/);
  assert.doesNotMatch(html, /STOCK_REAL_SEARCH_SEEDS/);
  assert.doesNotMatch(html, /encodeURIComponent\(seed\)/);
  assert.match(html, /stockUniverse\.splice\(0, stockUniverse\.length, \.\.\.mapped\)/);
  assert.match(html, /stockWatchlist = stockWatchlist\.map\(stock => getStockByCode\(stock\.code, stock\.market\) \|\| stock\)/);
  assert.match(html, /async function refreshRealStockQuotes\(\)/);
  assert.match(html, /body: JSON\.stringify\(\{ symbols \}\)/);
  assert.match(html, /response\.items\.forEach\(mergeStockQuote\)/);
  assert.match(html, /stockApiStatus = stockUniverse\.length \? "live" : "error"/);
  assert.match(html, /stockApiErrorMessage = getStockApiErrorMessage\(error\)/);
  assert.match(html, /实时行情刷新失败，继续使用已载入数据/);
  assert.doesNotMatch(html, /marketIndices\.forEach\(mutateStockQuote\)/);
  assert.doesNotMatch(html, /stockUniverse\.forEach\(mutateStockQuote\)/);
  assert.doesNotMatch(html, /stockWatchlist\.forEach\(mutateStockQuote\)/);
  assert.doesNotMatch(html, /makeMockStockUniverse/);
  assert.doesNotMatch(html, /STOCK_MOCK_TOTAL/);
  assert.doesNotMatch(html, /stockDataSource = "mock-a-share"/);
  assert.match(html, /const universeRequest = loadRealStockUniverse\(\{ notify: false \}\)/);
});

test("stock API network errors are normalized before rendering", () => {
  const formatError = loadStockApiErrorFormatter();
  const networkMessage = "行情接口连接失败，请确认本地股票 API 已启动，或检查当前网络/隧道是否可访问。";
  const providerMessage = "上游行情源暂时不可用，请稍后重试；已加载的数据会继续保留。";

  assert.equal(formatError(new TypeError("fetch failed")), networkMessage);
  assert.equal(formatError(new TypeError("Failed to fetch")), networkMessage);
  assert.equal(formatError(new Error("NetworkError when attempting to fetch resource.")), networkMessage);
  assert.equal(formatError(Object.assign(new Error("fetch failed"), {
    name: "StockApiError",
    status: 502,
    code: "MARKET_DATA_UNAVAILABLE",
  })), providerMessage);
  assert.equal(formatError(new Error("XUEQIU_COOKIE is required")), "XUEQIU_COOKIE is required");
  assert.equal(formatError(null), "行情接口不可用，请检查后端服务和 Xueqiu 凭据配置。");
});

test("stock API client preserves structured upstream failures", async () => {
  const makeFailure = () => new Response(JSON.stringify({
    code: "MARKET_DATA_UNAVAILABLE",
    message: "fetch failed",
    traceId: "trace-provider",
  }), {
    status: 502,
    headers: { "content-type": "application/json" },
  });
  const client = loadStockApiClient([makeFailure(), makeFailure()]);

  await assert.rejects(
    () => client.fetchStockApi("/v1/stocks/SH/600519/history?period=day&range=60d"),
    error => error.name === "StockApiError" &&
      error.status === 502 &&
      error.code === "MARKET_DATA_UNAVAILABLE" &&
      error.traceId === "trace-provider"
  );
  assert.equal(client.state().fetchCalls, 2);
});

test("stock API client retries one transient upstream failure", async () => {
  const client = loadStockApiClient([
    new Response(JSON.stringify({ code: "MARKET_DATA_UNAVAILABLE", message: "fetch failed" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    }),
    new Response(JSON.stringify({ items: [{ code: "600519" }], source: "eastmoney" }), {
      status: 200,
      headers: { "content-type": "application/json", "x-data-source": "eastmoney" },
    }),
  ]);

  const result = await client.fetchStockApi("/v1/stocks/universe?limit=6000");

  assert.equal(client.state().fetchCalls, 2);
  assert.equal(result.items[0].code, "600519");
});

test("stock API cache keeps retained values in memory when IndexedDB is unavailable", async () => {
  const client = loadStockApiClient([]);

  await client.writeStockApiCache("history-key", { items: [{ close: 1210.99 }] }, 100, 1_000);

  assert.deepEqual(await client.readStockApiCache("history-key", 1_050), {
    key: "history-key",
    value: { items: [{ close: 1210.99 }] },
    cachedAt: 1_000,
    retainUntil: 1_100,
  });
  assert.equal(await client.readStockApiCache("history-key", 1_101), null);
});

test("stock API client stores fresh cacheable responses", async () => {
  const path = "/v1/stocks/universe?limit=6000";
  const client = loadStockApiClient([
    new Response(JSON.stringify({ items: [{ code: "600519" }], source: "eastmoney" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ]);

  await client.fetchStockApi(path);
  const cached = await client.readStockApiCache(client.getStockApiCacheKey(path));

  assert.deepEqual(cached.value.items, [{ code: "600519" }]);
});

test("stock API client returns retained cache after transient attempts fail", async () => {
  const path = "/v1/stocks/SH/600519/history?period=day&range=60d";
  const failure = () => new Response(JSON.stringify({
    code: "MARKET_DATA_UNAVAILABLE",
    message: "fetch failed",
    traceId: "trace-provider",
  }), {
    status: 502,
    headers: { "content-type": "application/json" },
  });
  const client = loadStockApiClient([failure(), failure()]);
  await client.writeStockApiCache(client.getStockApiCacheKey(path), {
    items: [{ time: "2026-07-10", close: 1204.98 }],
    source: "eastmoney",
  }, 60_000);

  const result = await client.fetchStockApi(path);

  assert.equal(client.state().fetchCalls, 2);
  assert.equal(result.stale, true);
  assert.equal(result.headers.get("x-cache"), "CLIENT-STALE");
  assert.equal(result.headers.get("x-data-stale"), "true");
  assert.equal(result.items[0].close, 1204.98);
});

test("stock API client does not hide validation failures behind retained cache", async () => {
  const path = "/v1/stocks/SH/600519/history?period=invalid&range=60d";
  const client = loadStockApiClient([
    new Response(JSON.stringify({
      code: "VALIDATION_FAILED",
      message: "period is invalid",
      traceId: "trace-validation",
    }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }),
  ]);
  await client.writeStockApiCache(client.getStockApiCacheKey(path), {
    items: [{ time: "2026-07-10", close: 1204.98 }],
  }, 60_000);

  await assert.rejects(
    () => client.fetchStockApi(path),
    error => error.name === "StockApiError" &&
      error.status === 400 &&
      error.code === "VALIDATION_FAILED"
  );
  assert.equal(client.state().fetchCalls, 1);
});

test("stock API client retries a non-JSON 503 response", async () => {
  const client = loadStockApiClient([
    new Response("Service temporarily unavailable", {
      status: 503,
      headers: { "content-type": "text/html" },
    }),
    new Response(JSON.stringify({ items: [{ code: "600519" }], source: "eastmoney" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ]);

  const result = await client.fetchStockApi("/v1/stocks/universe?limit=6000");

  assert.equal(client.state().fetchCalls, 2);
  assert.equal(result.items[0].code, "600519");
});

test("stock universe treats retained cache as usable data with a warning", async () => {
  const module = loadStockUniverseLoader({
    items: [{ market: "SH", code: "600519", name: "贵州茅台" }],
    source: "eastmoney",
    stale: true,
  });

  const loaded = await module.loadRealStockUniverse();
  const state = module.state();

  assert.equal(loaded, true);
  assert.equal(state.stockApiReady, true);
  assert.equal(state.stockUniverse.length, 1);
  assert.equal(state.stockApiStatus, "error");
  assert.equal(state.stockApiErrorMessage, "上游行情源暂时不可用，当前显示缓存行情。");
});

test("stock history renders retained K lines and surfaces a stale warning", async () => {
  const module = loadStockHistoryLoader([
    { time: "2026-07-10", open: 1190, high: 1215, low: 1170, close: 1204.98, volume: 1804 },
  ], { stale: true });
  const stock = { market: "SH", code: "600519", dailyK: [], history: [] };

  const loaded = await module.loadRealStockHistory(stock);
  const state = module.state();

  assert.equal(loaded, true);
  assert.equal(stock.dailyK.length, 1);
  assert.equal(state.stockApiStatus, "error");
  assert.equal(state.stockApiErrorMessage, "上游行情源暂时不可用，当前显示缓存行情。");
  assert.match(extractFunction("loadRealEtfHistory"), /STOCK_API_STALE_MESSAGE/);
});

test("stock status keeps loaded universe context after a later request failure", () => {
  const statusHtml = renderStockDataStatusFixture({
    status: "error",
    loaded: 5866,
    total: 5866,
    error: "行情接口连接失败，请确认本地股票 API 已启动，或检查当前网络/隧道是否可访问。",
  });

  assert.match(statusHtml, /class="stock-refresh-note is-warning"/);
  assert.match(statusHtml, /已载入 5866\/5866 只/);
  assert.match(statusHtml, /最近请求失败/);
  assert.doesNotMatch(statusHtml, /fetch failed/);
});

test("stock quote refresh failures keep loaded universe live instead of showing connection failure", async () => {
  const module = loadStockQuoteRefresher();

  const refreshed = await module.refreshRealStockQuotes();
  const state = module.state();

  assert.equal(refreshed, false);
  assert.equal(state.stockApiReady, true);
  assert.equal(state.stockApiStatus, "live");
  assert.equal(state.stockApiErrorMessage, "Xueqiu outbound rate limit exceeded");
  assert.deepEqual(state.messages, [
    {
      message: "实时行情刷新失败，继续使用已载入数据：Xueqiu outbound rate limit exceeded",
      type: "warning",
    },
  ]);
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
  assert.match(html, /const source = stockUniverse\.length \? stockUniverse : stockWatchlist/);
});

test("stock universe background preload prepares chart history from the unified universe", () => {
  assert.match(html, /const STOCK_UNIVERSE_CHART_PRELOAD_LIMIT = STOCK_DAILY_VIRTUAL_COUNT \+ STOCK_DAILY_VIRTUAL_BUFFER/);
  assert.doesNotMatch(html, /STOCK_UNIVERSE_CHART_PRELOAD_PAGE_RADIUS/);
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
  assert.match(candidatesBlock, /const end = Math\.min\(sortedStocks\.length, start \+ STOCK_UNIVERSE_CHART_PRELOAD_LIMIT\)/);
  assert.match(candidatesBlock, /sortedStocks\.slice\(start, end\)\.forEach\(addStock\)/);
  assert.match(candidatesBlock, /return candidates\.slice\(0, STOCK_UNIVERSE_CHART_PRELOAD_LIMIT\)/);
  assert.doesNotMatch(candidatesBlock, /const pageOffsets = \[0\]/);
  assert.doesNotMatch(candidatesBlock, /sortedStocks\.forEach\(addStock\)/);
});

test("stock daily list changes do not schedule chart preload in fast daily mode", () => {
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
  assert.doesNotMatch(filterBlock, /scheduleStockUniverseChartPreload\(\)/);
  assert.doesNotMatch(sortBlock, /scheduleStockUniverseChartPreload\(\)/);
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
    /async function loadRealStockUniverse\(\{ force = false, foreground = true, notify = true \} = \{\}\) \{/,
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
  assert.match(html, /loadRealStockHistory\(activeStock\)\.then/);
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

test("stock daily chart does not repeatedly request a known empty history response", async () => {
  const module = loadStockHistoryLoader([]);
  const stock = {
    market: "SH",
    code: "600669",
    dailyK: [{ date: "2024-01-18", open: 0.38, high: 0.38, low: 0.38, close: 0.38, volume: 0 }],
    history: [{ open: 0.38, high: 0.38, low: 0.38, close: 0.38 }],
  };

  const firstLoaded = await module.loadRealStockHistory(stock);
  const secondLoaded = await module.loadRealStockHistory(stock);

  assert.equal(firstLoaded, false);
  assert.equal(secondLoaded, false);
  assert.equal(module.state().fetchCalls, 1);
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

test("daily K watchlist add updates the add button without rerendering the stock page", () => {
  const module = loadStockWatchlistAdder();
  module.setActiveView("daily");
  module.setUniverse([
    { id: "sh600519", market: "SH", code: "600519", name: "贵州茅台", industry: "白酒", price: 1500 }
  ]);

  assert.equal(module.addStockToWatchlist("600519", "SH"), true);

  const state = module.state();
  assert.equal(state.stockWatchlist.length, 1);
  assert.equal(state.sideRendered, 1);
  assert.equal(state.pageRendered, 0);
  assert.equal(state.dailyButtonsRefreshed, 1);
});

test("stock watchlist groups migrate legacy watchlist and support multi-group membership", () => {
  const legacyStock = { market: "SH", code: "600519", name: "贵州茅台", industry: "白酒", price: 1500 };
  const module = loadStockWatchlistGroupManager({
    glass_nav_stock_watchlist: JSON.stringify([legacyStock]),
  });

  let state = module.bootstrap();
  assert.equal(state.stockWatchGroups.length, 1);
  assert.equal(state.stockWatchGroups[0].id, "default");
  assert.equal(state.stockWatchGroups[0].name, "默认分组");
  assert.deepEqual(state.stockWatchGroups[0].stockIds, ["SH600519"]);
  assert.equal(module.groupCount("default"), 1);

  const shortTerm = module.addStockWatchGroup("短线观察");
  const trend = module.addStockWatchGroup("趋势池");
  assert.equal(module.addStockToWatchlist("000001", "SZ", [shortTerm.id, trend.id]), true);
  assert.deepEqual(module.groupStocks(shortTerm.id), ["SZ000001"]);
  assert.deepEqual(module.groupStocks(trend.id), ["SZ000001"]);

  assert.equal(module.addStockToWatchlist("000001", "SZ", [shortTerm.id, trend.id]), false);
  assert.deepEqual(module.groupStocks(shortTerm.id), ["SZ000001"]);
  assert.deepEqual(module.groupStocks(trend.id), ["SZ000001"]);

  assert.equal(module.renameStockWatchGroup(shortTerm.id, "短线重点"), true);
  state = module.state();
  assert.equal(state.stockWatchGroups.find(group => group.id === shortTerm.id).name, "短线重点");

  assert.equal(module.deleteStockWatchGroup(shortTerm.id), true);
  state = module.state();
  assert.equal(state.stockWatchGroups.some(group => group.id === shortTerm.id), false);
  assert.equal(state.stockWatchGroups.some(group => group.id === "default"), true);
});

test("daily K list exposes trailing add buttons and watchlist group modal controls", () => {
  const dailyRowsBlock = extractFunction("renderStockDailyVirtualRows");
  const clickBlock = extractFunction("handleStockContentClick");
  const modalBlock = extractBlock(
    /function renderModal\(\) \{/,
    /\n    \}\n\n    function readSiteFields/
  );
  const watchlistViewBlock = extractFunction("renderStockWatchlistView");
  const watchGroupBarBlock = extractFunction("renderStockWatchGroupBar");

  assert.match(dailyRowsBlock, /data-stock-daily-add/);
  assert.match(dailyRowsBlock, /stock-daily-add/);
  assert.doesNotMatch(dailyRowsBlock, /<button class="stock-daily-row/);
  assert.ok(clickBlock.indexOf("data-stock-daily-add") < clickBlock.indexOf("data-stock-daily-row"));
  assert.match(clickBlock, /addStockFromDailyListToWatchlist/);
  assert.match(modalBlock, /stock-watch-group-select/);
  assert.match(modalBlock, /data-stock-watch-group-choice/);
  assert.match(modalBlock, /data-confirm-stock-watch-group-select/);
  assert.match(watchlistViewBlock, /renderStockWatchGroupBar\(\)/);
  assert.match(watchGroupBarBlock, /data-stock-watch-group-add/);
});

test("stock watchlist dynamic count uses the active group total", () => {
  const updateBlock = extractFunction("updateStockWatchlistData");
  assert.match(updateBlock, /getStockWatchlistForGroup\(activeStockWatchGroupId\)/);
  assert.match(updateBlock, /applyStockFilters\(groupStocks, \{ includeStrategy: false \}\)/);
  assert.match(updateBlock, /\$\{filteredStocks\.length\}\/\$\{groupStocks\.length\} 只/);
  assert.doesNotMatch(updateBlock, /\$\{filteredStocks\.length\}\/\$\{stockWatchlist\.length\} 只/);
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
  assert.match(html, /筛选结果\/当前分组总数/);
});

test("watchlist group filtering ignores the active condition strategy", () => {
  const module = loadStockFilterApplier();
  const watchlist = [
    { name: "默认自选", code: "600001", market: "SH", changePercent: 0.2, volume: 10000, pe: 10, pb: 1, roe: 8, industry: "电力", history: [] },
  ];

  module.setActiveStrategy("all_automated");

  assert.deepEqual(module.applyStockFilters(watchlist).map(stock => stock.name), []);
  assert.deepEqual(module.applyStockFilters(watchlist, { includeStrategy: false }).map(stock => stock.name), ["默认自选"]);

  const watchlistViewBlock = extractFunction("renderStockWatchlistView");
  assert.match(watchlistViewBlock, /applyStockFilters\(groupStocks, \{ includeStrategy: false \}\)/);
  const updateBlock = extractFunction("updateStockWatchlistData");
  assert.match(updateBlock, /applyStockFilters\(groupStocks, \{ includeStrategy: false \}\)/);
});

test("watchlist quick observation cards use the active group stocks", () => {
  const quickCardsBlock = extractFunction("renderQuickStockCards");
  const pageBlock = extractFunction("renderStockPage");

  assert.match(quickCardsBlock, /function renderQuickStockCards\(list = stockWatchlist\)/);
  assert.match(quickCardsBlock, /getQuickFilterStocks\("top-up", list\)/);
  assert.match(quickCardsBlock, /getQuickFilterStocks\("top-down", list\)/);
  assert.match(quickCardsBlock, /getQuickFilterStocks\("high-roe", list\)/);
  assert.match(quickCardsBlock, /getQuickFilterStocks\("high-pe", list\)/);
  assert.match(pageBlock, /const activeWatchGroupStocks = activeStockView === "watchlist" \? getStockWatchlistForGroup\(activeStockWatchGroupId\) : \[\]/);
  assert.match(pageBlock, /renderQuickStockCards\(activeWatchGroupStocks\)/);
  assert.doesNotMatch(pageBlock, /renderQuickStockCards\(\)/);
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
  const resultPanelBlock = extractFunction("renderStockFilterResultsPanel");
  assert.match(filterViewBlock, /class="stock-filter-layout"/);
  assert.match(filterViewBlock, /class="stock-filter-panel/);
  assert.match(resultPanelBlock, /id="stockFilterResults"/);
  assert.ok(filterViewBlock.indexOf("stock-filter-panel") < filterViewBlock.indexOf("renderStockFilterResultsPanel"));
  assert.doesNotMatch(filterViewBlock, /stockMarketCloud|stock-market-grid|renderMarketCloud/);
  assert.match(filterViewBlock, /data-stock-filter="logic"/);
  assert.match(resultPanelBlock, /renderStockFilterResultTable\(filteredStocks\)/);
  assert.match(html, /data-stock-sort="\$\{field\}"/);
  assert.match(html, /data-stock-page="next"/);
});

test("stock strategy screener, sorting, and pagination are wired", () => {
  const requiredFunctions = [
    "getStockTrend",
    "getStockKLineSeries",
    "getStockMaValue",
    "getStockVolumeRatio",
    "getStockLimitThreshold",
    "isStockLimitUpBar",
    "isStockOneLineLimitUpBar",
    "getStockConsecutiveLimitCount",
    "getStockLimitRunBeforeLatest",
    "getStockRecentLimitStats",
    "hasStockReversalPullback",
    "isStockWeakOrNegativeBar",
    "getStockRecentHigh",
    "getStockTechnicalSignals",
    "stockMatchesTechnicalPattern",
    "getStockMatchReasons",
    "getStockTechnicalSignalLabel",
    "getStockExchange",
    "getStockBoardType",
    "getStockStatus",
    "formatStockMarketCap",
    "getStockFilterResults",
    "getStockStrategyById",
    "resetStockAuxiliaryFilters",
    "applyStockStrategy",
    "getStockStrategyHistoryCandidates",
    "scheduleStockStrategyHistoryLoad",
    "loadStockStrategyHistories",
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
    "renderStockStrategies",
    "renderStockFilterDetailRow",
    "renderStockFilterResultTable"
  ];

  for (const name of requiredFunctions) {
    assert.match(html, new RegExp(`function ${name}\\(`), `Missing ${name}`);
  }

  assert.match(html, /const STOCK_STRATEGY_KEY = "glass_nav_stock_strategies"/);
  assert.match(html, /const STOCK_FILTER_STATE_KEY = "glass_nav_stock_filter_state"/);
  assert.match(html, /marketCap:/);
  assert.match(html, /北交所/);
  assert.match(html, /非科创板/);
  assert.match(html, /非ST/);
  assert.match(html, /5日线之上/);
  assert.match(html, /data-stock-filter="minPb"/);
  assert.match(html, /data-stock-filter="maxPb"/);
  assert.match(html, /data-stock-filter="minVolumeRatio"/);
  assert.match(html, /data-stock-filter="maPosition"/);
  assert.match(html, /const defaultStockStrategies = \[/);
  assert.match(html, /策略模板/);
  assert.match(html, /全部策略/);
  assert.match(html, /热点龙头放量/);
  assert.match(html, /真突破/);
  assert.match(html, /平台突破/);
  assert.match(html, /首板/);
  assert.match(html, /强势首阴/);
  assert.match(html, /上影反包/);
  assert.match(html, /龙回头/);
  assert.match(html, /趋势低吸/);
  assert.match(html, /板块补涨/);
  assert.match(html, /自动选股规格: first_limit_up/);
  assert.match(html, /data-stock-risk/);
  assert.match(html, /trend_volume_leader/);
  assert.match(html, /true_breakout/);
  assert.match(html, /first_limit_up/);
  assert.match(html, /dragon_return/);
  assert.doesNotMatch(html, /低市盈率 2/);
  assert.match(html, /getStockSelectionMatchReasons\(stock\)/);
  assert.match(html, /短线信号/);
  assert.match(html, /let activeStockStrategy = defaultStockStrategies\[0\]\?\.id \|\| ""/);
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
  assert.doesNotMatch(clickBlock, /event\.target\.closest\("\[data-stock-tag\]"\)/);
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

test("stock strategy screener removes deprecated tag and technical-pattern controls from the filter UI", () => {
  const filterViewBlock = extractBlock(
    /function renderStockFilterView\(\) \{/,
    /\n    \}\n\n    function renderStockActiveView/
  );
  const strategyCss = extractBlock(
    /\.stock-strategy-list\s*\{/,
    /\n    \.stock-strategy-list::-webkit-scrollbar/
  );

  assert.match(filterViewBlock, /策略模板/);
  assert.match(filterViewBlock, /renderStockStrategies\(\)/);
  assert.match(filterViewBlock, /scheduleStockStrategyHistoryLoad\(\)/);
  assert.doesNotMatch(filterViewBlock, /筛选标签/);
  assert.doesNotMatch(filterViewBlock, /renderStockFilterTags/);
  assert.doesNotMatch(filterViewBlock, /短线形态/);
  assert.doesNotMatch(filterViewBlock, /data-stock-filter="technicalPattern"/);
  assert.match(strategyCss, /display:\s*grid/);
  assert.match(strategyCss, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(180px,\s*1fr\)\)/);
  assert.doesNotMatch(strategyCss, /overflow-x:\s*auto/);
});

test("automated stock selection thresholds are loaded from a config file", () => {
  const config = JSON.parse(fs.readFileSync(selectionConfigPath, "utf8"));

  assert.equal(config.version, "1.0");
  assert.equal(config.default_parameters.volume_expand_ratio, 1.5);
  assert.equal(config.default_parameters.min_avg_amount_5d, 1000000000);
  assert.ok(config.strategies.some(strategy => strategy.id === "trend_volume_leader" && strategy.enabled));
  assert.ok(config.strategies.some(strategy => strategy.id === "board_reseal" && strategy.enabled === false));
  assert.match(html, /src\/stocks\/selection-config\.json/);
  assert.match(html, /function getStockSelectionParameter\(/);
  assert.match(html, /function getAutomatedStockSelection\(/);
  assert.doesNotMatch(html, /minVolumeRatio: "1\.3"/);
  assert.doesNotMatch(html, /minVolumeRatio: "1\.2"/);
});

test("automated stock selection is whitelist-only and returns reason-coded candidates", () => {
  const config = JSON.parse(fs.readFileSync(selectionConfigPath, "utf8"));
  const module = loadAutomatedStockSelectionEngine(config);
  const baseK = [
    { close: 10, high: 10.2, low: 9.9, open: 10, volume: 100000, amount: 1200000000 },
    { close: 10.1, high: 10.2, low: 10, open: 10.05, volume: 110000, amount: 1250000000 },
    { close: 10.15, high: 10.25, low: 10.05, open: 10.1, volume: 105000, amount: 1260000000 },
    { close: 10.2, high: 10.3, low: 10.1, open: 10.15, volume: 100000, amount: 1240000000 },
    { close: 10.25, high: 10.35, low: 10.15, open: 10.2, volume: 106000, amount: 1270000000 },
  ];
  const firstLimitUp = {
    id: "SH600101",
    market: "SH",
    code: "600101",
    name: "热点首板",
    industry: "机器人",
    boardType: "main",
    status: "normal",
    price: 11.28,
    changePercent: 10.05,
    volume: 320000,
    amount: 3600000000,
    dailyK: [
      ...baseK,
      { close: 11.28, high: 11.28, low: 10.7, open: 10.75, volume: 320000, amount: 3600000000 },
    ],
  };
  const oneWordLimitUp = {
    ...firstLimitUp,
    id: "SH600102",
    code: "600102",
    name: "一字观察",
    dailyK: [
      ...baseK,
      { close: 11.28, high: 11.28, low: 11.28, open: 11.28, volume: 320000, amount: 3600000000 },
    ],
  };
  const noPattern = {
    ...firstLimitUp,
    id: "SH600103",
    code: "600103",
    name: "无模板",
    price: 10.28,
    changePercent: 0.3,
    volume: 130000,
    amount: 1300000000,
    dailyK: [
      ...baseK,
      { close: 10.28, high: 10.32, low: 10.18, open: 10.22, volume: 130000, amount: 1300000000 },
    ],
  };
  const weakSectorStock = {
    ...noPattern,
    id: "SZ000501",
    market: "SZ",
    code: "000501",
    name: "弱板块",
    industry: "银行",
    dailyK: [
      { close: 10, high: 10.1, low: 9.9, open: 10, volume: 100000, amount: 1200000000 },
      { close: 9.9, high: 10, low: 9.85, open: 9.95, volume: 100000, amount: 1200000000 },
      { close: 9.8, high: 9.9, low: 9.75, open: 9.85, volume: 100000, amount: 1200000000 },
      { close: 9.7, high: 9.8, low: 9.65, open: 9.75, volume: 100000, amount: 1200000000 },
      { close: 9.65, high: 9.72, low: 9.6, open: 9.68, volume: 100000, amount: 1200000000 },
      { close: 9.62, high: 9.7, low: 9.58, open: 9.64, volume: 100000, amount: 1200000000 },
    ],
  };
  module.setUniverse([firstLimitUp, oneWordLimitUp, noPattern, weakSectorStock]);

  const selected = module.getAutomatedStockSelection(firstLimitUp);
  assert.equal(selected.isCandidate, true);
  assert.ok(selected.strategyIds.includes("first_limit_up"));
  assert.ok(selected.reasonCodes.includes("FIRST_LIMIT_UP"));
  assert.ok(selected.reasonCodes.includes("HOT_SECTOR"));
  assert.ok(selected.reasonCodes.includes("SECTOR_LEADER"));
  assert.equal(selected.isTradable, true);
  assert.ok(selected.totalScore > 0);

  const oneWord = module.getAutomatedStockSelection(oneWordLimitUp);
  assert.equal(oneWord.isCandidate, true);
  assert.equal(oneWord.isTradable, false);
  assert.ok(oneWord.reasonCodes.includes("ONE_WORD_UNTRADABLE"));

  const rejected = module.getAutomatedStockSelection(noPattern);
  assert.equal(rejected.isCandidate, false);
  assert.deepEqual(rejected.strategyIds, []);
  assert.ok(rejected.reasonCodes.includes("NO_STRATEGY_MATCH"));
});

test("applying a stock strategy clears stale auxiliary filters and queues K-line loading", () => {
  const module = loadStockStrategyController();

  module.applyStockStrategy("pdf-first-board");

  const state = module.state();
  assert.equal(state.activeQuickStockFilter, "");
  assert.deepEqual(state.activeStockTags, []);
  assert.equal(state.activeStockStrategy, "pdf-first-board");
  assert.equal(state.stockResultPage, 1);
  assert.equal(state.stockFilters.minPe, "");
  assert.equal(state.stockFilters.maxPe, "");
  assert.equal(state.stockFilters.technicalPattern, "all");
  assert.equal(state.stockFilters.minVolumeRatio, "");
  assert.equal(state.stockFilters.maPosition, "all");
  assert.equal(state.stockFilters.industry, "all");
  assert.equal(state.stockFilters.metric, "all");
  assert.equal(state.stockFilters.trend, "");
  assert.equal(state.stockFilters.trendDays, "15");
  assert.equal(state.stockFilters.logic, "and");
  assert.equal(state.saved, 1);
  assert.equal(state.rendered, 1);
  assert.equal(state.historyScheduled, 1);
});

test("strategy history loading updates only filter results while K data is loading", () => {
  const filterViewBlock = extractBlock(
    /function renderStockFilterView\(\) \{/,
    /\n    \}\n\n    function renderStockActiveView/
  );
  const loadBlock = extractBlock(
    /async function loadStockStrategyHistories\(/,
    /\n    \}\n\n    function loadStockWatchlist/
  );
  const updateBlock = extractFunction("updateStockFilterResults");

  assert.match(filterViewBlock, /scheduleStockStrategyHistoryLoad\(\)/);
  assert.match(loadBlock, /getStockStrategyHistoryCandidates\(strategy\)\.slice\(0, STOCK_STRATEGY_HISTORY_BATCH_SIZE\)/);
  assert.match(loadBlock, /loadRealStockHistory\(stock, \{ foreground: false \}\)/);
  assert.match(loadBlock, /activeStockView === "filter"/);
  assert.match(loadBlock, /updateStockFilterResults\(\{ results: false \}\)/);
  assert.doesNotMatch(loadBlock, /renderStockPage\(\)/);
  assert.match(updateBlock, /function updateStockFilterResults\(\{ results = true \} = \{\}\)/);
  assert.match(updateBlock, /getElementById\("stockFilterResults"\)/);
  assert.match(updateBlock, /if \(results && resultsPanel\)/);
  assert.match(updateBlock, /renderStockFilterResultsPanel\(filteredStocks\)/);
  assert.doesNotMatch(updateBlock, /scheduleStockStrategyHistoryLoad\(\)/);
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

test("stock daily chart hover draws crosshair lines with a price label", () => {
  const moveBlock = extractFunction("handleStockDailyCanvasMove");
  const crosshairBlock = extractFunction("drawStockDailyCrosshair");
  const hideBlock = extractFunction("hideStockDailyTooltip");
  const kBlock = extractFunction("drawStockKCanvas");
  const minuteBlock = extractFunction("drawStockMinuteCanvas");

  assert.match(moveBlock, /drawStockDailyCanvas\(\)/);
  assert.match(moveBlock, /drawStockDailyCrosshair\(canvas, meta, nearest, crosshairY\)/);
  assert.match(crosshairBlock, /ctx\.moveTo\(meta\.plot\.left, y\)/);
  assert.match(crosshairBlock, /ctx\.lineTo\(meta\.plot\.right, y\)/);
  assert.match(crosshairBlock, /ctx\.moveTo\(x, meta\.plot\.top\)/);
  assert.match(crosshairBlock, /ctx\.lineTo\(x, meta\.plot\.bottom\)/);
  assert.match(crosshairBlock, /const price = meta\.priceFromY\(y\)/);
  assert.match(crosshairBlock, /formatStockPrice\(price\)/);
  assert.match(crosshairBlock, /fillText\(priceLabel/);
  assert.match(kBlock, /priceFromY: y =>/);
  assert.match(minuteBlock, /priceFromY: y =>/);
  assert.match(hideBlock, /drawStockDailyCanvas\(\)/);
});

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

test("stock limit-board history loading updates only the limit-board panel", () => {
  const loadBlock = extractBlock(
    /async function loadStockLimitBoardHistories\(/,
    /\n    \}\n\n    function scheduleStockLimitBoardHistoryLoad/
  );
  const updateBlock = extractFunction("updateStockLimitBoardResults");

  assert.match(loadBlock, /loadRealStockHistory\(stock, \{ foreground: false \}\)/);
  assert.match(loadBlock, /activeStockView === "limit-board"/);
  assert.match(loadBlock, /updateStockLimitBoardResults\(\{ results: false \}\)/);
  assert.doesNotMatch(loadBlock, /renderStockPage\(\)/);
  assert.match(updateBlock, /document\.querySelector\('\[data-stock-limit-board-panel\]'\)/);
  assert.match(updateBlock, /renderStockLimitBoardPanel\(/);
  assert.doesNotMatch(updateBlock, /scheduleStockLimitBoardHistoryLoad\(\)/);
});

test("stock limit-board history loading only targets quote limit-up candidates", () => {
  const candidateBlock = extractBlock(
    /function getStockLimitBoardHistoryCandidates\(\) \{/,
    /\n    \}\n\n    async function loadStockLimitBoardHistories/
  );

  assert.match(html, /function stockLooksLimitUpFromQuote\(stock\)/);
  assert.match(html, /function getStockLimitBoardUniverse\(\)/);
  assert.match(candidateBlock, /getStockLimitBoardUniverse\(\)\.filter/);
  assert.doesNotMatch(candidateBlock, /stockUniverse\.filter\(stock => !hasStockLimitBoardHistoryReady\(stock\)\)/);
});

test("stock limit-board filters default to excluding ST and Growth Enterprise Market stocks", () => {
  const { stockPassesLimitBoardFilters } = loadStockLimitBoardEngine();

  assert.equal(stockPassesLimitBoardFilters({
    id: "SH:600001",
    market: "SH",
    code: "600001",
    name: "ST样本",
    status: "ST",
    boardType: "main",
  }), false);

  assert.equal(stockPassesLimitBoardFilters({
    id: "SZ:300001",
    market: "SZ",
    code: "300001",
    name: "创业样本",
    status: "normal",
    boardType: "gem",
  }), false);

  assert.equal(stockPassesLimitBoardFilters({
    id: "SH:600002",
    market: "SH",
    code: "600002",
    name: "主板样本",
    status: "normal",
    boardType: "main",
  }), true);
});

test("stock limit-board filter controls are rendered and applied before candidate loading", () => {
  const universeBlock = extractFunction("getStockLimitBoardUniverse");

  assert.match(html, /let excludeStockLimitBoardSt = true/);
  assert.match(html, /let excludeStockLimitBoardGem = true/);
  assert.match(html, /function stockPassesLimitBoardFilters\(stock\)/);
  assert.match(html, /function renderStockLimitBoardFilters\(\)/);
  assert.match(html, /data-stock-limit-board-filter="st"/);
  assert.match(html, /data-stock-limit-board-filter="gem"/);
  assert.match(universeBlock, /stockPassesLimitBoardFilters/);
  assert.match(universeBlock, /stockLooksLimitUpFromQuote/);
});

test("stock limit-board sidebar rows omit industry while the chart header keeps it", () => {
  const listBlock = extractFunction("renderStockLimitBoardList");
  const viewBlock = extractFunction("renderStockLimitBoardView");

  assert.match(listBlock, /\$\{escapeHTML\(stock\.market\)\} \$\{escapeHTML\(stock\.code\)\}/);
  assert.doesNotMatch(listBlock, /getStockIndustryLabel\(stock\)/);
  assert.match(viewBlock, /data-stock-daily-industry>行业：\$\{escapeHTML\(getStockIndustryLabel\(stock\)\)\}/);
});

test("stock limit-board interaction handlers switch board level and selected chart stock", () => {
  assert.match(html, /function setStockLimitBoardLevel\(level\)/);
  assert.match(html, /function setActiveLimitBoardStock\(id\)/);
  assert.match(html, /data-stock-limit-board-level/);
  assert.match(html, /setStockLimitBoardLevel\(limitBoardLevelButton\.dataset\.stockLimitBoardLevel\)/);
  assert.match(html, /data-stock-limit-board-row/);
  assert.match(html, /setActiveLimitBoardStock\(limitBoardRow\.dataset\.stockLimitBoardRow\)/);
});

test("stock limit-board filter interaction toggles the selected exclusion", () => {
  assert.match(html, /function toggleStockLimitBoardFilter\(filter\)/);
  assert.match(html, /data-stock-limit-board-filter/);
  assert.match(html, /toggleStockLimitBoardFilter\(limitBoardFilterButton\.dataset\.stockLimitBoardFilter\)/);
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

test("stock condition matcher supports hot-money short-term technical patterns", () => {
  const { stockMatchesConditions, getStockTechnicalSignals } = loadStockConditionMatcher();
  const firstBoardStock = {
    id: "SH600001",
    market: "SH",
    code: "600001",
    name: "短线首板",
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

  const firstBoardSignals = getStockTechnicalSignals(firstBoardStock);
  assert.equal(firstBoardSignals.limitUp, true);
  assert.equal(firstBoardSignals.firstBoard, true);
  assert.equal(firstBoardSignals.aboveMa5, true);
  assert.ok(firstBoardSignals.volumeRatio >= 3);
  assert.equal(
    stockMatchesConditions(firstBoardStock, {
      technicalPattern: "first-board",
      minVolumeRatio: "2",
      maPosition: "above-ma5",
      logic: "and",
    }),
    true,
  );
  assert.equal(stockMatchesConditions(firstBoardStock, { technicalPattern: "one-line-board", logic: "and" }), false);

  const reversalStock = {
    ...firstBoardStock,
    name: "反包测试",
    changePercent: 10,
    dailyK: [
      { open: 10, high: 10.2, low: 9.8, close: 10, volume: 100000 },
      { open: 10, high: 11, low: 9.9, close: 11, volume: 260000 },
      { open: 10.9, high: 11.05, low: 10.1, close: 10.3, volume: 150000 },
      { open: 10.35, high: 11.33, low: 10.3, close: 11.33, volume: 360000 },
    ],
  };
  assert.equal(stockMatchesConditions(reversalStock, { technicalPattern: "reversal-board", logic: "and" }), true);

  const thirdOneLineStock = {
    ...firstBoardStock,
    name: "三板一字",
    changePercent: 10,
    dailyK: [
      { open: 10, high: 10, low: 10, close: 10, volume: 90000 },
      { open: 11, high: 11, low: 11, close: 11, volume: 100000 },
      { open: 12.1, high: 12.1, low: 12.1, close: 12.1, volume: 105000 },
      { open: 13.31, high: 13.31, low: 13.31, close: 13.31, volume: 98000 },
    ],
  };
  assert.equal(stockMatchesConditions(thirdOneLineStock, { technicalPattern: "third-one-line-board", logic: "and" }), true);
  assert.equal(stockMatchesConditions(thirdOneLineStock, { technicalPattern: "first-board", logic: "and" }), false);
});

test("stock condition matcher supports trend direction filters", () => {
  const { stockMatchesConditions, getStockMatchReasons } = loadStockConditionMatcher();
  const upStock = {
    id: "SZ300001",
    market: "SZ",
    code: "300001",
    name: "趋势向上",
    boardType: "gem",
    status: "normal",
    dailyK: [
      { open: 10, high: 10.3, low: 9.9, close: 10, volume: 100000 },
      { open: 10, high: 10.45, low: 10.1, close: 10.4, volume: 110000 },
      { open: 10.4, high: 10.68, low: 10.2, close: 10.6, volume: 120000 },
      { open: 10.6, high: 11, low: 10.5, close: 10.9, volume: 130000 },
      { open: 10.9, high: 11.2, low: 10.85, close: 11.1, volume: 140000 },
    ],
  };
  const downStock = {
    ...upStock,
    id: "SZ300002",
    code: "300002",
    name: "趋势向下",
    dailyK: [
      { open: 12, high: 12.2, low: 11.8, close: 12, volume: 100000 },
      { open: 12, high: 12.05, low: 11.8, close: 11.95, volume: 98000 },
      { open: 11.95, high: 12, low: 11.6, close: 11.7, volume: 90000 },
      { open: 11.7, high: 11.75, low: 11.3, close: 11.35, volume: 92000 },
      { open: 11.35, high: 11.4, low: 11.1, close: 11.15, volume: 88000 },
    ],
  };

  assert.equal(stockMatchesConditions(upStock, { trend: "up", trendDays: "3", logic: "and" }), true);
  assert.equal(stockMatchesConditions(upStock, { trend: "down", trendDays: "3", logic: "and" }), false);
  assert.equal(stockMatchesConditions(downStock, { trend: "down", trendDays: "4", logic: "and" }), true);
  assert.equal(stockMatchesConditions(downStock, { trend: "up", trendDays: "4", logic: "and" }), false);

  const reasons = getStockMatchReasons(downStock, { trend: "down", trendDays: "3" });
  assert.ok(reasons.includes("近3日向下"));
});

test("stock condition matcher supports PDF-derived hot-money strategy patterns", () => {
  const { stockMatchesConditions, stockMatchesTechnicalPattern, getStockTechnicalSignals } = loadStockConditionMatcher();

  const dragonFirstNegative = {
    id: "SH600101",
    market: "SH",
    code: "600101",
    name: "龙头首阴样本",
    boardType: "main",
    status: "normal",
    price: 13.05,
    changePercent: -1.95,
    volume: 260000,
    pe: 24,
    pb: 2.8,
    roe: 11,
    dailyK: [
      { open: 9.9, high: 10.2, low: 9.8, close: 10, volume: 100000 },
      { open: 10.5, high: 11, low: 10.5, close: 11, volume: 160000 },
      { open: 11.2, high: 12.1, low: 11.2, close: 12.1, volume: 180000 },
      { open: 12.3, high: 13.31, low: 12.3, close: 13.31, volume: 210000 },
      { open: 13.3, high: 13.45, low: 12.92, close: 13.05, volume: 260000 },
    ],
  };
  const dragonFirstNegativeSignals = getStockTechnicalSignals(dragonFirstNegative);
  assert.equal(dragonFirstNegativeSignals.dragonFirstNegative, true);
  assert.equal(stockMatchesConditions(dragonFirstNegative, { technicalPattern: "dragon-first-negative", logic: "and" }), true);

  const dragonPullback = {
    ...dragonFirstNegative,
    code: "600102",
    name: "龙回头样本",
    price: 11.85,
    changePercent: 4.87,
    volume: 220000,
    dailyK: [
      { open: 9.9, high: 10.2, low: 9.8, close: 10, volume: 100000 },
      { open: 10.2, high: 11, low: 10.1, close: 11, volume: 160000 },
      { open: 11.1, high: 12.1, low: 11.05, close: 12.1, volume: 180000 },
      { open: 11.8, high: 12, low: 11.2, close: 11.3, volume: 110000 },
      { open: 11.4, high: 11.95, low: 11.35, close: 11.85, volume: 220000 },
    ],
  };
  const dragonPullbackSignals = getStockTechnicalSignals(dragonPullback);
  assert.equal(dragonPullbackSignals.dragonPullback, true);
  assert.equal(stockMatchesConditions(dragonPullback, { technicalPattern: "dragon-pullback", logic: "and" }), true);

  const multiBoardRelay = {
    ...dragonFirstNegative,
    code: "600103",
    name: "连板接力样本",
    price: 12.1,
    changePercent: 10,
    volume: 190000,
    dailyK: [
      { open: 9.9, high: 10.1, low: 9.8, close: 10, volume: 100000 },
      { open: 10.5, high: 11, low: 10.4, close: 11, volume: 160000 },
      { open: 11.5, high: 12.1, low: 11.4, close: 12.1, volume: 190000 },
    ],
  };
  const multiBoardSignals = getStockTechnicalSignals(multiBoardRelay);
  assert.equal(multiBoardSignals.consecutiveLimitCount, 2);
  assert.equal(multiBoardSignals.multiBoardRelay, true);
  assert.equal(stockMatchesConditions(multiBoardRelay, { technicalPattern: "multi-board-relay", logic: "and" }), true);

  const trendBreakout = {
    ...dragonFirstNegative,
    code: "600104",
    name: "趋势突破样本",
    price: 11.4,
    changePercent: 6.54,
    volume: 260000,
    dailyK: [
      { open: 9.95, high: 10.1, low: 9.9, close: 10, volume: 100000 },
      { open: 10, high: 10.15, low: 9.95, close: 10.1, volume: 101000 },
      { open: 10.1, high: 10.25, low: 10.05, close: 10.2, volume: 102000 },
      { open: 10.2, high: 10.3, low: 10.1, close: 10.25, volume: 103000 },
      { open: 10.25, high: 10.35, low: 10.2, close: 10.3, volume: 104000 },
      { open: 10.3, high: 10.4, low: 10.25, close: 10.35, volume: 105000 },
      { open: 10.35, high: 10.45, low: 10.3, close: 10.4, volume: 106000 },
      { open: 10.4, high: 10.55, low: 10.35, close: 10.5, volume: 107000 },
      { open: 10.5, high: 10.65, low: 10.45, close: 10.6, volume: 108000 },
      { open: 10.6, high: 10.75, low: 10.55, close: 10.7, volume: 109000 },
      { open: 10.8, high: 11.45, low: 10.75, close: 11.4, volume: 260000 },
    ],
  };
  const trendBreakoutSignals = getStockTechnicalSignals(trendBreakout);
  assert.equal(trendBreakoutSignals.strongTrendBreakout, true);
  assert.equal(stockMatchesConditions(trendBreakout, { technicalPattern: "strong-trend-breakout", logic: "and" }), true);
  assert.equal(stockMatchesTechnicalPattern(trendBreakout, "not-in-pdf"), false);
});

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
  assert.equal(groups[0].items[0].stock.name, "一板样本");
  assert.equal(groups[1].items[0].stock.name, "二板样本");
  assert.equal(groups[2].items[0].oneLineBoard, true);
  assert.equal(getHighestStockLimitBoardLevel(groups), 3);
});

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

test("stock select dropdown options have readable contrast", () => {
  const selectCss = extractBlock(
    /\.stock-select\s*\{/,
    /\n    \.stock-input:focus,/
  );
  assert.match(selectCss, /color-scheme:\s*dark/);

  const optionCss = extractBlock(
    /\.stock-select option\s*\{/,
    /\n    \.stock-input:focus,/
  );
  assert.match(optionCss, /background:\s*#1f1f35/);
  assert.match(optionCss, /color:\s*#fff/);
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
