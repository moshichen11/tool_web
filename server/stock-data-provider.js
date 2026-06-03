import { createEastmoneyProvider } from "./eastmoney-provider.js";
import { createInitialStocks, entitlements as mockEntitlements, makeDepth, makeHistory } from "./mock-data.js";
import { createTushareProvider } from "./tushare-provider.js";
import { createXueqiuStockDataProvider } from "./xueqiu-provider.js";

export const DEFAULT_STOCK_DATA_SOURCE = "xueqiu";

export function makeStockDataError(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}

function direction(changePercent) {
  if (changePercent > 0) return "up";
  if (changePercent < 0) return "down";
  return "flat";
}

function colorRole(changePercent) {
  const dir = direction(changePercent);
  if (dir === "up") return "stock-up";
  if (dir === "down") return "stock-down";
  return "stock-flat";
}

function normalizeMockQuote(stock) {
  return {
    ...stock,
    source: "mock-a-share",
    direction: stock.direction || direction(Number(stock.changePercent || 0)),
    colorRole: stock.colorRole || colorRole(Number(stock.changePercent || 0)),
  };
}

function paged(items, { limit = 6000, offset = 0 } = {}) {
  const requestedLimit = Math.max(1, Math.min(Number(limit) || 6000, 10000));
  const requestedOffset = Math.max(Number(offset) || 0, 0);
  return {
    items: items.slice(requestedOffset, requestedOffset + requestedLimit),
    total: items.length,
    limit: requestedLimit,
    offset: requestedOffset,
  };
}

export function createMockStockDataProvider(options = {}) {
  const state = options.state || { stocks: new Map(createInitialStocks().map(stock => [stock.id, stock])) };

  function getStock(identity) {
    return state.stocks.get(`${identity.market}:${identity.code}`) || null;
  }

  async function searchStocks({ q, market, limit = 20 }) {
    const queryText = String(q || "").trim().toLowerCase();
    const items = [...state.stocks.values()]
      .filter(item => !market || item.market === market)
      .filter(item => (
        item.code.includes(queryText) ||
        item.name.toLowerCase().includes(queryText) ||
        item.industry.toLowerCase().includes(queryText)
      ))
      .slice(0, Math.min(Number(limit) || 20, 100))
      .map(normalizeMockQuote);
    return { items, source: "mock-a-share", delayed: false, updatedAt: new Date().toISOString() };
  }

  async function getStockUniverse({ market, limit = 6000, offset = 0 } = {}) {
    const targetMarket = market ? String(market).toUpperCase() : "";
    const items = [...state.stocks.values()]
      .filter(item => !targetMarket || item.market === targetMarket)
      .map(normalizeMockQuote);
    return { ...paged(items, { limit, offset }), source: "mock-a-share", delayed: false, updatedAt: new Date().toISOString() };
  }

  async function getQuotes(symbols) {
    const items = symbols.map(getStock).filter(Boolean).map(normalizeMockQuote);
    return { items, source: "mock-a-share", delayed: false, updatedAt: new Date().toISOString() };
  }

  async function getQuote(identity) {
    const stock = getStock(identity);
    return stock ? normalizeMockQuote(stock) : null;
  }

  async function getHistory({ market, code, period, range }) {
    const stock = getStock({ market, code });
    if (!stock) return null;
    return {
      stock: { id: stock.id, market, code },
      period,
      range,
      items: makeHistory(stock, period, range),
      source: "mock-a-share",
      delayed: false,
      updatedAt: new Date().toISOString(),
    };
  }

  async function getDepth({ market, code }) {
    const stock = getStock({ market, code });
    return stock ? makeDepth(stock) : null;
  }

  return {
    id: "mock-a-share",
    sourceId: "mock-a-share",
    entitlements: mockEntitlements,
    getStockUniverse,
    searchStocks,
    getQuote,
    getQuotes,
    getHistory,
    getDepth,
  };
}

function createDisabledMockProvider() {
  function disabled() {
    throw makeStockDataError(
      403,
      "MARKET_DATA_UNLICENSED",
      "mock-a-share is disabled outside explicit test/demo configuration",
    );
  }

  return {
    id: "mock-a-share",
    sourceId: "mock-a-share",
    entitlements: [],
    getStockUniverse: disabled,
    searchStocks: disabled,
    getQuote: disabled,
    getQuotes: disabled,
    getHistory: disabled,
    getDepth: disabled,
  };
}

export function createStockDataProvider(options = {}) {
  const dataSource = String(options.dataSource || process.env.STOCK_DATA_SOURCE || DEFAULT_STOCK_DATA_SOURCE).toLowerCase();

  if (dataSource === "xueqiu") {
    const provider = createXueqiuStockDataProvider({
      cookie: options.xueqiuCookie,
      token: options.xueqiuToken,
      quoteEndpoint: options.xueqiuQuoteUrl,
      searchEndpoint: options.xueqiuSearchUrl,
      klineEndpoint: options.xueqiuKlineUrl,
      fetchImpl: options.fetchImpl,
      now: options.now,
      timeoutMs: options.providerTimeoutMs,
      retryAttempts: options.providerRetryAttempts,
      retryDelayMs: options.providerRetryDelayMs,
      cacheTtlMs: options.providerCacheTtlMs,
      outboundLimit: options.providerOutboundLimit,
    });
    const universeProvider = createEastmoneyProvider({
      fetchImpl: options.fetchImpl,
      listEndpoint: options.eastmoneyListUrl,
    });
    return { ...provider, getStockUniverse: universeProvider.getStockUniverse };
  }

  if (dataSource === "tushare") {
    return createTushareProvider({
      token: options.tushareToken,
      endpoint: options.tushareApiUrl,
      fetchImpl: options.fetchImpl,
      now: options.now,
    });
  }

  if (dataSource === "eastmoney") {
    return createEastmoneyProvider({
      fetchImpl: options.fetchImpl,
      quoteEndpoint: options.eastmoneyQuoteUrl,
      klineEndpoint: options.eastmoneyKlineUrl,
      listEndpoint: options.eastmoneyListUrl,
    });
  }

  if (dataSource === "mock-a-share") {
    const allowMock = Boolean(
      options.allowMockStockData ||
      options.dataSource === "mock-a-share" ||
      process.env.ALLOW_MOCK_STOCK_DATA === "true" ||
      process.env.NODE_ENV === "test"
    );
    return allowMock ? createMockStockDataProvider({ state: options.state }) : createDisabledMockProvider();
  }

  throw makeStockDataError(400, "VALIDATION_FAILED", `Unsupported STOCK_DATA_SOURCE ${dataSource}`);
}
