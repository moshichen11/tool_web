const test = require("node:test");
const assert = require("node:assert/strict");

function createFakeTushareFetch() {
  const calls = [];

  async function fakeFetch(url, options) {
    const payload = JSON.parse(options.body);
    calls.push({ url, payload });

    if (payload.token !== "test-token") {
      return new Response(JSON.stringify({ code: 2002, msg: "permission denied", data: null }), { status: 200 });
    }

    if (payload.api_name === "stock_basic") {
      return new Response(JSON.stringify({
        code: 0,
        msg: null,
        data: {
          fields: ["ts_code", "symbol", "name", "area", "industry", "market", "exchange", "list_date"],
          items: [
            ["600519.SH", "600519", "贵州茅台", "贵州", "白酒", "主板", "SSE", "20010827"],
            ["300750.SZ", "300750", "宁德时代", "福建", "电池", "创业板", "SZSE", "20180611"],
          ],
        },
      }), { status: 200 });
    }

    if (payload.api_name === "daily") {
      const rows = [
        ["600519.SH", "20260512", 1710, 1728, 1702, 1715.2, 1683.87, 31.33, 1.86, 123456, 2123456.7],
        ["600519.SH", "20260511", 1681, 1690, 1666, 1683.87, 1678.5, 5.37, 0.32, 100000, 1683900],
        ["300750.SZ", "20260512", 206, 207.5, 202, 205.4, 206.89, -1.49, -0.72, 654321, 1344567.8],
      ];
      const requestedCodes = String(payload.params.ts_code || "").split(",").filter(Boolean);
      return new Response(JSON.stringify({
        code: 0,
        msg: null,
        data: {
          fields: ["ts_code", "trade_date", "open", "high", "low", "close", "pre_close", "change", "pct_chg", "vol", "amount"],
          items: rows.filter(row => requestedCodes.length === 0 || requestedCodes.includes(row[0])),
        },
      }), { status: 200 });
    }

    return new Response(JSON.stringify({ code: 0, msg: null, data: { fields: [], items: [] } }), { status: 200 });
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

test("tushare provider maps official stock_basic and daily responses into stock contracts", async () => {
  const { createTushareProvider } = await import("../server/tushare-provider.js");
  const fetchImpl = createFakeTushareFetch();
  const provider = createTushareProvider({
    endpoint: "http://api.tushare.pro",
    token: "test-token",
    fetchImpl,
  });

  const search = await provider.searchStocks({ q: "茅台", market: "SH", limit: 1 });
  assert.equal(search.items.length, 1);
  assert.equal(search.items[0].id, "SH:600519");
  assert.equal(search.items[0].source, "tushare");

  const quotes = await provider.getQuotes([{ market: "SH", code: "600519" }, { market: "SZ", code: "300750" }]);
  assert.equal(quotes.source, "tushare");
  assert.equal(quotes.items.length, 2);
  assert.equal(quotes.items[0].price, 1715.2);
  assert.equal(quotes.items[0].direction, "up");
  assert.equal(quotes.items[0].colorRole, "stock-up");
  assert.equal(quotes.items[1].colorRole, "stock-down");

  const history = await provider.getHistory({ market: "SH", code: "600519", period: "day", range: "30d" });
  assert.equal(history.source, "tushare");
  assert.equal(history.stock.id, "SH:600519");
  assert.equal(history.items[0].time, "2026-05-11");
  assert.equal(history.items[1].time, "2026-05-12");
  assert.equal(fetchImpl.calls.some(call => call.payload.api_name === "stock_basic"), true);
  assert.equal(fetchImpl.calls.some(call => call.payload.api_name === "daily"), true);
});

test("server routes use Tushare when configured and keep the existing /v1 contract", async () => {
  const mod = await import("../server/mock-server.js");
  const server = mod.createMockServer({
    port: 0,
    dataSource: "tushare",
    tushareToken: "test-token",
    fetchImpl: createFakeTushareFetch(),
    rateLimit: { windowMs: 1_000, maxRequests: 50 },
  });

  await server.start();
  try {
    const entitlements = await requestJson(server.url, "/v1/entitlements");
    assert.equal(entitlements.response.status, 200);
    assert.equal(entitlements.body.items[0].sourceId, "tushare");

    const search = await requestJson(server.url, "/v1/stocks/search?q=600519&market=SH&limit=1");
    assert.equal(search.response.status, 200);
    assert.equal(search.response.headers.get("x-data-source"), "tushare");
    assert.equal(search.body.items[0].source, "tushare");

    const batch = await requestJson(server.url, "/v1/quotes", {
      method: "POST",
      body: JSON.stringify({ symbols: [{ market: "SH", code: "600519" }, { market: "SZ", code: "300750" }] }),
    });
    assert.equal(batch.response.status, 200);
    assert.equal(batch.body.source, "tushare");
    assert.equal(batch.body.items[0].name, "贵州茅台");

    const history = await requestJson(server.url, "/v1/stocks/SH/600519/history?period=day&range=30d");
    assert.equal(history.response.status, 200);
    assert.equal(history.body.source, "tushare");
    assert.equal(history.body.items[0].close, 1683.87);
  } finally {
    await server.stop();
  }
});
