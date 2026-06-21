const test = require("node:test");
const assert = require("node:assert/strict");

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { "content-type": "application/json" },
  });
}

function createFakeXueqiuFetch() {
  const calls = [];

  async function fakeFetch(url, options = {}) {
    const parsed = new URL(url);
    calls.push({ url, parsed, options });

    if (parsed.pathname.includes("/suggest_stock.json")) {
      return jsonResponse({
        code: 200,
        message: "success",
        success: true,
        data: [
          { code: "SH600519", query: "贵州茅台", label: "11", stock_type: 11, type: 1 },
          { code: "SZ300750", query: "宁德时代", label: "11", stock_type: 11, type: 1 },
        ],
      });
    }

    if (parsed.pathname.includes("/batch/quote.json")) {
      return jsonResponse({
        data: {
          items: [
            {
              quote: {
                symbol: "SH600519",
                code: "600519",
                exchange: "SH",
                name: "贵州茅台",
                current: 1290.2,
                percent: -1.59,
                chg: -20.8,
                volume: 4915700,
                amount: 6372389482,
                open: 1310.95,
                high: 1311.91,
                low: 1290.12,
                last_close: 1311,
                market_capital: 1615679031393,
                pe_ttm: 23.4,
                pb: 8.9,
                timestamp: 1780294800000,
              },
            },
            {
              quote: {
                symbol: "SZ300750",
                code: "300750",
                exchange: "SZ",
                name: "宁德时代",
                current: 205.4,
                percent: 0.72,
                chg: 1.46,
                volume: 6543210,
                amount: 13445678000,
                open: 206,
                high: 207.5,
                low: 202,
                last_close: 203.94,
                market_capital: 899100000000,
                pe_ttm: 21.2,
                pb: 4.6,
                timestamp: 1780294801000,
              },
            },
          ],
        },
      });
    }

    if (parsed.pathname.includes("/chart/kline.json")) {
      return jsonResponse({
        data: {
          symbol: "SH600519",
          column: ["timestamp", "volume", "open", "high", "low", "close", "chg", "percent", "turnoverrate", "amount"],
          item: [
            [1780208400000, 4210000, 1280, 1302, 1278, 1295.5, 5.37, 0.42, 0.33, 5432100000],
            [1780294800000, 4915700, 1310.95, 1311.91, 1290.12, 1290.2, -20.8, -1.59, 0.39, 6372389482],
          ],
        },
      });
    }

    return jsonResponse({ error_code: 404, error_description: "not found" }, { status: 404 });
  }

  fakeFetch.calls = calls;
  return fakeFetch;
}

function createFakeXueqiuEmptyHistoryWithEastmoneyFetch() {
  const calls = [];

  async function fakeFetch(url, options = {}) {
    const parsed = new URL(url);
    calls.push({ url, parsed, options });

    if (parsed.pathname.includes("/chart/kline.json")) {
      return jsonResponse({
        data: {
          symbol: "SZ000535",
          column: ["timestamp", "volume", "open", "high", "low", "close", "chg", "percent", "turnoverrate", "amount"],
          item: [],
        },
      });
    }

    if (parsed.hostname === "push2his.eastmoney.com" && parsed.pathname.includes("/api/qt/stock/kline/get")) {
      return jsonResponse({
        rc: 0,
        data: {
          code: "000535",
          market: 0,
          name: "*ST猴王",
          klines: [
            "2005-09-20,0.50,0.50,0.51,0.49,1000,50000.00,4.00,0.00,0.00,0.01",
            "2005-09-21,0.50,0.50,0.50,0.50,0,0.00,0.00,0.00,0.00,0.00",
          ],
        },
      });
    }

    return jsonResponse({ error_code: 404, error_description: "not found" }, { status: 404 });
  }

  fakeFetch.calls = calls;
  return fakeFetch;
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

test("xueqiu provider maps search, quote, and kline responses into stock contracts", async () => {
  const { createXueqiuStockDataProvider } = await import("../server/xueqiu-provider.js");
  const fetchImpl = createFakeXueqiuFetch();
  const provider = createXueqiuStockDataProvider({
    cookie: "test-session-cookie",
    fetchImpl,
    now: () => new Date("2026-06-01T06:50:00.000Z"),
  });

  const search = await provider.searchStocks({ q: "茅台", market: "SH", limit: 1 });
  assert.equal(search.source, "xueqiu");
  assert.equal(search.delayed, false);
  assert.equal(search.updatedAt, "2026-06-01T06:50:00.000Z");
  assert.equal(search.items.length, 1);
  assert.equal(search.items[0].id, "SH:600519");
  assert.equal(search.items[0].source, "xueqiu");

  const quotes = await provider.getQuotes([{ market: "SH", code: "600519" }, { market: "SZ", code: "300750" }]);
  assert.equal(quotes.source, "xueqiu");
  assert.equal(quotes.items.length, 2);
  assert.equal(quotes.items[0].price, 1290.2);
  assert.equal(quotes.items[0].changePercent, -1.59);
  assert.equal(quotes.items[0].changeAmount, -20.8);
  assert.equal(quotes.items[0].previousClose, 1311);
  assert.equal(quotes.items[0].direction, "down");
  assert.equal(quotes.items[0].colorRole, "stock-down");
  assert.equal(quotes.items[0].marketCap, 16156.79);
  assert.equal(quotes.items[0].updatedAt, "2026-06-01T06:20:00.000Z");

  const history = await provider.getHistory({ market: "SH", code: "600519", period: "day", range: "30d" });
  assert.equal(history.source, "xueqiu");
  assert.equal(history.stock.id, "SH:600519");
  assert.equal(history.items.length, 2);
  assert.equal(history.items[1].close, 1290.2);
  assert.equal(history.items[1].time, "2026-06-01T06:20:00.000Z");

  assert.equal(fetchImpl.calls.some(call => call.options.headers.cookie === "test-session-cookie"), true);
  assert.equal(fetchImpl.calls.some(call => call.parsed.hostname === "stock.xueqiu.com"), true);
  assert.equal(fetchImpl.calls.some(call => call.parsed.hostname === "xueqiu.com"), true);
});

test("stock data provider falls back to eastmoney history when xueqiu returns no klines", async () => {
  const { createStockDataProvider } = await import("../server/stock-data-provider.js");
  const fetchImpl = createFakeXueqiuEmptyHistoryWithEastmoneyFetch();
  const provider = createStockDataProvider({
    dataSource: "xueqiu",
    xueqiuCookie: "test-session-cookie",
    fetchImpl,
  });

  const history = await provider.getHistory({ market: "SZ", code: "000535", period: "day", range: "60d" });

  assert.equal(history.source, "eastmoney");
  assert.equal(history.stock.id, "SZ:000535");
  assert.equal(history.items.length, 2);
  assert.equal(history.items[0].time, "2005-09-20");
  assert.equal(history.items[1].close, 0.5);
  assert.equal(fetchImpl.calls.some(call => call.parsed.hostname === "stock.xueqiu.com"), true);
  assert.equal(fetchImpl.calls.some(call => call.parsed.hostname === "push2his.eastmoney.com"), true);
});

test("xueqiu provider requires credentials and never calls upstream without them", async () => {
  const { createXueqiuStockDataProvider } = await import("../server/xueqiu-provider.js");
  let called = false;
  const provider = createXueqiuStockDataProvider({
    fetchImpl: async () => {
      called = true;
      return jsonResponse({});
    },
  });

  await assert.rejects(
    () => provider.getQuotes([{ market: "SH", code: "600519" }]),
    error => error.code === "AUTH_REQUIRED" && /XUEQIU_COOKIE/.test(error.message),
  );
  assert.equal(called, false);
});

test("xueqiu provider retries transient failures and caches successful quote batches", async () => {
  const { createXueqiuStockDataProvider } = await import("../server/xueqiu-provider.js");
  let attempts = 0;
  const provider = createXueqiuStockDataProvider({
    cookie: "test-session-cookie",
    retryAttempts: 2,
    retryDelayMs: 1,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("socket reset");
      return jsonResponse({
        data: {
          items: [
            {
              quote: {
                symbol: "SH600519",
                code: "600519",
                exchange: "SH",
                name: "贵州茅台",
                current: 1290.2,
                percent: 0,
                chg: 0,
                timestamp: 1780290000000,
              },
            },
          ],
        },
      });
    },
  });

  const first = await provider.getQuotes([{ market: "SH", code: "600519" }]);
  const second = await provider.getQuotes([{ market: "SH", code: "600519" }]);
  assert.equal(first.items[0].price, 1290.2);
  assert.equal(second.items[0].price, 1290.2);
  assert.equal(attempts, 2);
});

test("xueqiu provider enforces outbound rate limits", async () => {
  const { createXueqiuStockDataProvider } = await import("../server/xueqiu-provider.js");
  const provider = createXueqiuStockDataProvider({
    cookie: "test-session-cookie",
    cacheTtlMs: 0,
    outboundLimit: { windowMs: 60_000, maxRequests: 1 },
    fetchImpl: async () => jsonResponse({ data: { items: [] } }),
  });

  await provider.getQuotes([{ market: "SH", code: "600519" }]);
  await assert.rejects(
    () => provider.getQuotes([{ market: "SZ", code: "300750" }]),
    error => error.status === 429 && error.code === "MARKET_DATA_RATE_LIMITED",
  );
});

test("server defaults to xueqiu and returns AUTH_REQUIRED instead of mock stocks when credentials are missing", async () => {
  const previousSource = process.env.STOCK_DATA_SOURCE;
  const previousCookie = process.env.XUEQIU_COOKIE;
  const previousToken = process.env.XUEQIU_TOKEN;
  delete process.env.STOCK_DATA_SOURCE;
  delete process.env.XUEQIU_COOKIE;
  delete process.env.XUEQIU_TOKEN;

  const mod = await import("../server/mock-server.js");
  const server = mod.createMockServer({
    port: 0,
    rateLimit: { windowMs: 1_000, maxRequests: 50 },
  });

  await server.start();
  try {
    const search = await requestJson(server.url, "/v1/stocks/search?q=600519&market=SH&limit=1");
    assert.equal(search.response.status, 401);
    assert.equal(search.body.code, "AUTH_REQUIRED");
    assert.notEqual(search.body.message, "Stock API returned no stocks");

    const entitlements = await requestJson(server.url, "/v1/entitlements");
    assert.equal(entitlements.response.status, 200);
    assert.equal(entitlements.body.items[0].sourceId, "xueqiu");
  } finally {
    await server.stop();
    if (previousSource === undefined) delete process.env.STOCK_DATA_SOURCE;
    else process.env.STOCK_DATA_SOURCE = previousSource;
    if (previousCookie === undefined) delete process.env.XUEQIU_COOKIE;
    else process.env.XUEQIU_COOKIE = previousCookie;
    if (previousToken === undefined) delete process.env.XUEQIU_TOKEN;
    else process.env.XUEQIU_TOKEN = previousToken;
  }
});

test("server routes use xueqiu provider through the stock data provider layer", async () => {
  const mod = await import("../server/mock-server.js");
  const server = mod.createMockServer({
    port: 0,
    dataSource: "xueqiu",
    xueqiuCookie: "test-session-cookie",
    fetchImpl: createFakeXueqiuFetch(),
    rateLimit: { windowMs: 1_000, maxRequests: 50 },
  });

  await server.start();
  try {
    const search = await requestJson(server.url, "/v1/stocks/search?q=600519&market=SH&limit=1");
    assert.equal(search.response.status, 200);
    assert.equal(search.response.headers.get("x-data-source"), "xueqiu");
    assert.equal(search.body.items[0].source, "xueqiu");

    const batch = await requestJson(server.url, "/v1/quotes", {
      method: "POST",
      body: JSON.stringify({ symbols: [{ market: "SH", code: "600519" }, { market: "SZ", code: "300750" }] }),
    });
    assert.equal(batch.response.status, 200);
    assert.equal(batch.body.source, "xueqiu");
    assert.equal(batch.body.items[0].source, "xueqiu");
    assert.equal(batch.body.items[0].delayed, false);

    const history = await requestJson(server.url, "/v1/stocks/SH/600519/history?period=day&range=30d");
    assert.equal(history.response.status, 200);
    assert.equal(history.body.source, "xueqiu");
    assert.equal(history.body.items[1].close, 1290.2);
  } finally {
    await server.stop();
  }
});
