const test = require("node:test");
const assert = require("node:assert/strict");

function createEastmoneyUniverseRows(total = 3) {
  return Array.from({ length: total }, (_, index) => {
    const bucket = index % 3;
    const code = bucket === 0
      ? String(600000 + index).padStart(6, "0")
      : bucket === 1
        ? String(index + 1).padStart(6, "0")
        : String(830000 + index).padStart(6, "0");
    return {
      f2: 1000 + index,
      f3: 1.23,
      f4: 12,
      f5: 10000 + index,
      f6: 123456789 + index,
      f9: 15.2,
      f12: code,
      f13: bucket === 0 ? 1 : 0,
      f14: `测试股票${index + 1}`,
      f23: 2.1,
      f100: bucket === 2 ? "北交所" : "测试行业",
    };
  });
}

function createFakeEastmoneyFetch(options = {}) {
  const calls = [];
  const universeRows = options.universeRows || createEastmoneyUniverseRows(options.universeTotal || 3);

  async function fakeFetch(url) {
    const parsed = new URL(url);
    calls.push({ url, parsed });
    const secid = parsed.searchParams.get("secid");

    if (parsed.pathname.includes("/api/qt/clist/get")) {
      const page = Number(parsed.searchParams.get("pn") || 1);
      const pageSize = Math.min(Number(parsed.searchParams.get("pz") || 100), 100);
      const start = (page - 1) * pageSize;
      return new Response(JSON.stringify({
        rc: 0,
        data: {
          total: universeRows.length,
          diff: universeRows.slice(start, start + pageSize),
        },
      }), { status: 200 });
    }

    if (parsed.pathname.includes("/api/qt/stock/kline/get")) {
      return new Response(JSON.stringify({
        rc: 0,
        data: {
          code: "600519",
          market: 1,
          klines: [
            "2026-05-11,1280.00,1295.50,1302.00,1278.00,42100,5432100000.00,1.88,0.42,5.37,0.33",
            "2026-05-12,1310.95,1290.20,1311.91,1290.12,49157,6372389482.00,1.67,-1.59,-20.80,0.39",
          ],
        },
      }), { status: 200 });
    }

    const rows = {
      "1.600519": {
        f43: 129020,
        f44: 131191,
        f45: 129012,
        f46: 131095,
        f47: 49157,
        f48: 6372389482,
        f57: "600519",
        f58: "贵州茅台",
        f60: 131100,
        f116: 1615679031393,
        f169: -2080,
        f170: -159,
      },
      "0.300750": {
        f43: 20540,
        f44: 20750,
        f45: 20200,
        f46: 20600,
        f47: 654321,
        f48: 13445678000,
        f57: "300750",
        f58: "宁德时代",
        f60: 20689,
        f116: 899100000000,
        f169: -149,
        f170: -72,
      },
    };

    return new Response(JSON.stringify({ rc: 0, data: rows[secid] || null }), { status: 200 });
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

test("eastmoney provider maps public quote and kline responses into stock contracts", async () => {
  const { createEastmoneyProvider } = await import("../server/eastmoney-provider.js");
  const fetchImpl = createFakeEastmoneyFetch();
  const provider = createEastmoneyProvider({ fetchImpl });

  const search = await provider.searchStocks({ q: "茅台", market: "SH", limit: 1 });
  assert.equal(search.items.length, 1);
  assert.equal(search.items[0].id, "SH:600519");
  assert.equal(search.items[0].source, "eastmoney");

  const quotes = await provider.getQuotes([{ market: "SH", code: "600519" }, { market: "SZ", code: "300750" }]);
  assert.equal(quotes.source, "eastmoney");
  assert.equal(quotes.delayed, false);
  assert.equal(quotes.items.length, 2);
  assert.equal(quotes.items[0].price, 1290.2);
  assert.equal(quotes.items[0].changePercent, -1.59);
  assert.equal(quotes.items[0].changeAmount, -20.8);
  assert.equal(quotes.items[0].previousClose, 1311);
  assert.equal(quotes.items[0].direction, "down");
  assert.equal(quotes.items[0].colorRole, "stock-down");
  assert.equal(quotes.items[0].marketCap, 16156.79);

  const history = await provider.getHistory({ market: "SH", code: "600519", period: "day", range: "30d" });
  assert.equal(history.source, "eastmoney");
  assert.equal(history.stock.id, "SH:600519");
  assert.equal(history.items[0].time, "2026-05-11");
  assert.equal(history.items[1].close, 1290.2);
  assert.equal(fetchImpl.calls.some(call => call.parsed.hostname === "push2.eastmoney.com"), true);
  assert.equal(fetchImpl.calls.some(call => call.parsed.hostname === "push2his.eastmoney.com"), true);
});

test("eastmoney provider paginates the full A-share universe beyond 5000 stocks", async () => {
  const { createEastmoneyProvider } = await import("../server/eastmoney-provider.js");
  const fetchImpl = createFakeEastmoneyFetch({ universeTotal: 5_205 });
  const provider = createEastmoneyProvider({ fetchImpl });

  const universe = await provider.getStockUniverse({ limit: 6_000 });
  const listCalls = fetchImpl.calls.filter(call => call.parsed.pathname.includes("/api/qt/clist/get"));
  assert.equal(universe.source, "eastmoney");
  assert.equal(universe.total, 5_205);
  assert.equal(universe.items.length, 5_205);
  assert.equal(universe.items[0].id, "SH:600000");
  assert.equal(universe.items.some(item => item.market === "BJ"), true);
  assert.equal(listCalls.length > 1, true);
  assert.equal(listCalls[0].parsed.searchParams.get("fs").includes("m:0+t:81"), true);
});

test("eastmoney provider fetches the requested stock universe page directly", async () => {
  const { createEastmoneyProvider } = await import("../server/eastmoney-provider.js");
  const fetchImpl = createFakeEastmoneyFetch({ universeTotal: 5_205 });
  const provider = createEastmoneyProvider({ fetchImpl });

  const universe = await provider.getStockUniverse({ limit: 100, offset: 900 });
  const listCalls = fetchImpl.calls.filter(call => call.parsed.pathname.includes("/api/qt/clist/get"));

  assert.equal(universe.total, 5_205);
  assert.equal(universe.items.length, 100);
  assert.equal(universe.items[0].id, "SH:600900");
  assert.equal(listCalls.length, 1);
  assert.equal(listCalls[0].parsed.searchParams.get("pn"), "10");
  assert.equal(listCalls[0].parsed.searchParams.get("pz"), "100");
});

test("eastmoney provider searches the full stock universe for BJ codes outside the seed catalog", async () => {
  const { createEastmoneyProvider } = await import("../server/eastmoney-provider.js");
  const fetchImpl = createFakeEastmoneyFetch({
    universeRows: [
      {
        f2: 656,
        f3: 0.61,
        f4: 4,
        f5: 1000,
        f6: 10000,
        f9: 18,
        f12: "920639",
        f13: 0,
        f14: "晨光电缆",
        f23: 1.5,
        f100: "电力设备",
      },
      {
        f2: 129020,
        f3: -1.59,
        f4: -2080,
        f5: 49157,
        f6: 6372389482,
        f9: 24,
        f12: "600519",
        f13: 1,
        f14: "贵州茅台",
        f23: 8,
        f100: "白酒",
      },
    ],
  });
  const provider = createEastmoneyProvider({ fetchImpl });

  const search = await provider.searchStocks({ q: "920639", market: "BJ", limit: 5 });
  const spacedSearch = await provider.searchStocks({ q: "BJ 920639", limit: 5 });
  const listCalls = fetchImpl.calls.filter(call => call.parsed.pathname.includes("/api/qt/clist/get"));

  assert.equal(search.items.length, 1);
  assert.equal(search.items[0].id, "BJ:920639");
  assert.equal(search.items[0].name, "晨光电缆");
  assert.equal(search.items[0].source, "eastmoney");
  assert.equal(spacedSearch.items.length, 1);
  assert.equal(spacedSearch.items[0].id, "BJ:920639");
  assert.equal(listCalls.length, 2);
});

test("eastmoney provider marks ST names in stock universe summaries", async () => {
  const { createEastmoneyProvider } = await import("../server/eastmoney-provider.js");
  const fetchImpl = createFakeEastmoneyFetch({
    universeRows: [
      {
        f2: 1000,
        f3: 0,
        f4: 0,
        f5: 100,
        f6: 1000,
        f9: 10,
        f12: "603580",
        f13: 1,
        f14: "*ST艾艾",
        f23: 1,
        f100: "测试行业",
      },
      {
        f2: 1000,
        f3: 0,
        f4: 0,
        f5: 100,
        f6: 1000,
        f9: 10,
        f12: "002619",
        f13: 0,
        f14: "艾格",
        f23: 1,
        f100: "测试行业",
      },
    ],
  });
  const provider = createEastmoneyProvider({ fetchImpl });

  const universe = await provider.getStockUniverse({ limit: 10 });

  assert.equal(universe.items[0].status, "st");
  assert.equal(universe.items[1].status, "normal");
});

test("eastmoney provider retries transient stock universe fetch failures", async () => {
  const { createEastmoneyProvider } = await import("../server/eastmoney-provider.js");
  const stableFetch = createFakeEastmoneyFetch({ universeTotal: 3 });
  let failedOnce = false;
  async function flakyFetch(url) {
    const parsed = new URL(url);
    if (!failedOnce && parsed.pathname.includes("/api/qt/clist/get")) {
      failedOnce = true;
      throw new TypeError("fetch failed");
    }
    return stableFetch(url);
  }

  const provider = createEastmoneyProvider({ fetchImpl: flakyFetch, retryAttempts: 2, retryDelayMs: 0 });
  const universe = await provider.getStockUniverse({ limit: 6_000 });
  assert.equal(failedOnce, true);
  assert.equal(universe.total, 3);
  assert.equal(universe.items.length, 3);
});

test("eastmoney provider falls back to previous close when latest price is zero", async () => {
  const { createEastmoneyProvider } = await import("../server/eastmoney-provider.js");
  const provider = createEastmoneyProvider({
    fetchImpl: async () => new Response(JSON.stringify({
      rc: 0,
      data: {
        f43: 0,
        f44: 0,
        f45: 0,
        f46: 0,
        f47: 0,
        f48: 0,
        f57: "600519",
        f58: "贵州茅台",
        f60: 129020,
        f116: 1615679031393,
        f169: 0,
        f170: 0,
      },
    }), { status: 200 }),
  });

  const quote = await provider.getQuote({ market: "SH", code: "600519" });
  assert.equal(quote.price, 1290.2);
  assert.equal(quote.open, 1290.2);
  assert.equal(quote.high, 1290.2);
  assert.equal(quote.low, 1290.2);
});

test("server can use Eastmoney when explicitly configured", async () => {
  const mod = await import("../server/mock-server.js");
  const server = mod.createMockServer({
    port: 0,
    dataSource: "eastmoney",
    fetchImpl: createFakeEastmoneyFetch(),
    rateLimit: { windowMs: 1_000, maxRequests: 50 },
  });

  await server.start();
  try {
    const entitlements = await requestJson(server.url, "/v1/entitlements");
    assert.equal(entitlements.response.status, 200);
    assert.equal(entitlements.body.items[0].sourceId, "eastmoney");

    const search = await requestJson(server.url, "/v1/stocks/search?q=600519&market=SH&limit=1");
    assert.equal(search.response.status, 200);
    assert.equal(search.response.headers.get("x-data-source"), "eastmoney");
    assert.equal(search.body.items[0].source, "eastmoney");

    const universe = await requestJson(server.url, "/v1/stocks/universe?limit=6000");
    assert.equal(universe.response.status, 200);
    assert.equal(universe.response.headers.get("x-data-source"), "eastmoney");
    assert.equal(universe.body.total, 3);
    assert.equal(universe.body.items.length, 3);
    assert.equal(universe.body.items.some(item => item.market === "BJ"), true);

    const batch = await requestJson(server.url, "/v1/quotes", {
      method: "POST",
      body: JSON.stringify({ symbols: [{ market: "SH", code: "600519" }, { market: "SZ", code: "300750" }] }),
    });
    assert.equal(batch.response.status, 200);
    assert.equal(batch.body.source, "eastmoney");
    assert.equal(batch.body.items[0].name, "贵州茅台");

    const history = await requestJson(server.url, "/v1/stocks/SH/600519/history?period=day&range=30d");
    assert.equal(history.response.status, 200);
    assert.equal(history.body.source, "eastmoney");
    assert.equal(history.body.items[1].close, 1290.2);
  } finally {
    await server.stop();
  }
});
