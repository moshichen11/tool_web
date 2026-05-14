const test = require("node:test");
const assert = require("node:assert/strict");

async function startTestServer(options = {}) {
  const mod = await import("../server/mock-server.js");
  const server = mod.createMockServer({
    port: 0,
    rateLimit: { windowMs: 1_000, maxRequests: 50 },
    ...options,
  });
  await server.start();
  return server;
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

test("mock server exposes health, auth, market data, cacheable quote routes, and errors", async () => {
  const server = await startTestServer();
  try {
    const health = await requestJson(server.url, "/v1/health");
    assert.equal(health.response.status, 200);
    assert.equal(health.body.status, "ok");

    const session = await requestJson(server.url, "/v1/auth/session");
    assert.equal(session.body.authenticated, true);
    assert.ok(session.body.entitlements.length > 0);

    const markets = await requestJson(server.url, "/v1/markets");
    assert.deepEqual(markets.body.items.map(item => item.id), ["SH", "SZ", "BJ"]);

    const entitlements = await requestJson(server.url, "/v1/entitlements");
    assert.equal(entitlements.body.items[0].sourceId, "mock-a-share");

    const search = await requestJson(server.url, "/v1/stocks/search?q=600519&market=SH&limit=1");
    assert.equal(search.response.headers.get("x-mock-cache"), "MISS");
    assert.equal(search.body.items.length, 1);
    assert.equal(search.body.items[0].code, "600519");

    const cachedSearch = await requestJson(server.url, "/v1/stocks/search?q=600519&market=SH&limit=1");
    assert.equal(cachedSearch.response.headers.get("x-mock-cache"), "HIT");

    const batch = await requestJson(server.url, "/v1/quotes", {
      method: "POST",
      body: JSON.stringify({ symbols: [{ market: "SH", code: "600519" }, { market: "SZ", code: "300750" }] }),
    });
    assert.equal(batch.response.status, 200);
    assert.equal(batch.body.items.length, 2);
    assert.equal(batch.body.items[0].colorRole, "stock-up");

    const quote = await requestJson(server.url, "/v1/stocks/SH/600519/quote");
    assert.equal(quote.body.id, "SH:600519");

    const history = await requestJson(server.url, "/v1/stocks/SH/600519/history?period=day&range=30d");
    assert.equal(history.body.period, "day");
    assert.equal(history.body.items.length, 30);

    const depth = await requestJson(server.url, "/v1/stocks/SH/600519/depth");
    assert.equal(depth.body.orderBook.bids.length, 5);
    assert.equal(depth.body.priceDistribution.length, 8);

    const missing = await requestJson(server.url, "/v1/stocks/SH/000000/quote");
    assert.equal(missing.response.status, 404);
    assert.equal(missing.body.code, "NOT_FOUND");
  } finally {
    await server.stop();
  }
});

test("screener and audit events support pagination and filtering", async () => {
  const server = await startTestServer();
  try {
    const page = await requestJson(server.url, "/v1/screener?limit=3&offset=2&minRoe=10&logic=and");
    assert.equal(page.response.status, 200);
    assert.equal(page.body.limit, 3);
    assert.equal(page.body.offset, 2);
    assert.ok(page.body.total >= page.body.items.length);
    assert.ok(page.body.items.every(item => item.roe >= 10));

    await requestJson(server.url, "/v1/stocks/search?q=茅台");
    const audit = await requestJson(server.url, "/v1/audit/events?type=quote.search&limit=2&offset=0");
    assert.equal(audit.response.status, 200);
    assert.equal(audit.body.limit, 2);
    assert.ok(audit.body.total >= 1);
    assert.ok(audit.body.items.every(item => item.type === "quote.search"));
  } finally {
    await server.stop();
  }
});

test("strategies and watchlist mutate in memory and record audit events", async () => {
  const server = await startTestServer();
  try {
    const created = await requestJson(server.url, "/v1/strategies", {
      method: "POST",
      body: JSON.stringify({ name: "高ROE", desc: "custom", conditions: { minRoe: 12 } }),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.builtin, false);

    const updated = await requestJson(server.url, `/v1/strategies/${created.body.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: "低PE", conditions: { maxPe: 18 } }),
    });
    assert.equal(updated.body.conditions.maxPe, 18);

    const strategies = await requestJson(server.url, "/v1/strategies");
    assert.ok(strategies.body.items.some(item => item.id === created.body.id));

    const added = await requestJson(server.url, "/v1/watchlist", {
      method: "POST",
      body: JSON.stringify({ market: "BJ", code: "430047" }),
    });
    assert.equal(added.response.status, 201);
    assert.equal(added.body.position >= 0, true);

    const reordered = await fetch(`${server.url}/v1/watchlist/reorder`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [{ market: "BJ", code: "430047" }, { market: "SH", code: "600519" }] }),
    });
    assert.equal(reordered.status, 204);

    const watchlist = await requestJson(server.url, "/v1/watchlist");
    assert.equal(watchlist.body.items[0].id, "BJ:430047");

    const removed = await fetch(`${server.url}/v1/watchlist/BJ/430047`, { method: "DELETE" });
    assert.equal(removed.status, 204);

    const deleted = await fetch(`${server.url}/v1/strategies/${created.body.id}`, { method: "DELETE" });
    assert.equal(deleted.status, 204);
  } finally {
    await server.stop();
  }
});

test("sync pull and push simulate localStorage cloud conflict resolution", async () => {
  const server = await startTestServer();
  try {
    const pull = await requestJson(server.url, "/v1/sync/pull");
    assert.equal(pull.response.status, 200);
    assert.equal(pull.body.cloud.app, "glass-nav");
    assert.equal(pull.body.rateLimit.limit, 50);

    const staleLocal = {
      app: "glass-nav",
      schemaVersion: 1,
      deviceId: "device-a",
      baseVersion: "stale-version",
      updatedAt: new Date().toISOString(),
      watchlist: { version: 2, app: "glass-nav", items: [{ market: "SZ", code: "300750" }], updatedAt: new Date().toISOString() },
      strategies: [],
      filterState: { activeStockTags: [], activeStockStrategy: "", stockFilterSearchTerm: "" },
    };

    const conflict = await requestJson(server.url, "/v1/sync/push", {
      method: "POST",
      body: JSON.stringify({ local: staleLocal }),
    });
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.body.status, "conflict");
    assert.equal(conflict.body.conflicts[0].suggestedResolution, "manual");

    const resolved = await requestJson(server.url, "/v1/sync/push", {
      method: "POST",
      body: JSON.stringify({ local: staleLocal, resolution: "local-wins", resolvedConflicts: conflict.body.conflicts }),
    });
    assert.equal(resolved.response.status, 200);
    assert.equal(resolved.body.status, "synced");
    assert.equal(resolved.body.cloud.watchlist.items[0].code, "300750");
  } finally {
    await server.stop();
  }
});

test("rate limit returns 429 with headers and audit event", async () => {
  const server = await startTestServer({ rateLimit: { windowMs: 60_000, maxRequests: 2 } });
  try {
    assert.equal((await requestJson(server.url, "/v1/health")).response.status, 200);
    assert.equal((await requestJson(server.url, "/v1/markets")).response.status, 200);

    const limited = await requestJson(server.url, "/v1/entitlements");
    assert.equal(limited.response.status, 429);
    assert.equal(limited.response.headers.get("x-ratelimit-limit"), "2");
    assert.equal(limited.body.code, "RATE_LIMITED");

    const audit = await requestJson(server.url, "/v1/audit/events?type=rate_limit.hit", {
      headers: { "x-mock-bypass-rate-limit": "1" },
    });
    assert.equal(audit.response.status, 200);
    assert.equal(audit.body.items[0].type, "rate_limit.hit");
  } finally {
    await server.stop();
  }
});

test("mock server reads rate limit env defaults for CLI startup", async () => {
  const previousWindowMs = process.env.MOCK_RATE_LIMIT_WINDOW_MS;
  const previousMaxRequests = process.env.MOCK_RATE_LIMIT_MAX_REQUESTS;
  process.env.MOCK_RATE_LIMIT_WINDOW_MS = "60000";
  process.env.MOCK_RATE_LIMIT_MAX_REQUESTS = "1";

  const mod = await import("../server/mock-server.js");
  const server = mod.createMockServer({ port: 0 });
  try {
    await server.start();
    assert.equal((await requestJson(server.url, "/v1/health")).response.status, 200);

    const limited = await requestJson(server.url, "/v1/markets");
    assert.equal(limited.response.status, 429);
    assert.equal(limited.response.headers.get("x-ratelimit-limit"), "1");
  } finally {
    await server.stop();
    if (previousWindowMs === undefined) delete process.env.MOCK_RATE_LIMIT_WINDOW_MS;
    else process.env.MOCK_RATE_LIMIT_WINDOW_MS = previousWindowMs;
    if (previousMaxRequests === undefined) delete process.env.MOCK_RATE_LIMIT_MAX_REQUESTS;
    else process.env.MOCK_RATE_LIMIT_MAX_REQUESTS = previousMaxRequests;
  }
});

test("quote stream emits SSE connected and quote patch events", async () => {
  const server = await startTestServer({ sseIntervalMs: 20 });
  try {
    const response = await fetch(`${server.url}/v1/streams/quotes?symbols=SH:600519,SZ:300750`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (let i = 0; i < 20 && !buffer.includes("\"type\":\"quotes\""); i += 1) {
      const { value } = await reader.read();
      buffer += decoder.decode(value);
    }
    await reader.cancel();

    assert.match(buffer, /event: connected/);
    assert.match(buffer, /event: quotes/);
    assert.match(buffer, /"patchOnly":true/);
  } finally {
    await server.stop();
  }
});
