import { markets } from "./mock-data.js";
import { handleQuoteStream } from "./sse.js";

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
}

function noContent(res) {
  res.writeHead(204);
  res.end();
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

function page(items, searchParams) {
  const limit = Math.min(Number(searchParams.get("limit")) || 20, 100);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);
  return { items: items.slice(offset, offset + limit), total: items.length, limit, offset };
}

function error(status, code, message, traceId, details) {
  return { status, body: { code, message, traceId, ...(details ? { details } : {}) } };
}

function stockIdentity(stock) {
  return { market: stock.market, code: stock.code };
}

async function withCache(state, key, compute, ttlMs = 5_000) {
  const entry = state.cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return { hit: true, value: entry.value };
  const value = await compute();
  state.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return { hit: false, value };
}

function providerError(err, traceId) {
  const status = err.status && err.status >= 400 ? err.status : 502;
  const code = err.code || "MARKET_DATA_UNAVAILABLE";
  return {
    status,
    body: {
      code,
      message: err.message || "Market data provider failed",
      traceId,
      ...(err.details ? { details: err.details } : {}),
    },
  };
}

function screenItems(items, params) {
  return items.filter(item => {
    if (params.get("market") && item.market !== params.get("market")) return false;
    if (params.get("industry") && item.industry !== params.get("industry")) return false;
    if (params.get("minChange") && item.changePercent < Number(params.get("minChange"))) return false;
    if (params.get("maxChange") && item.changePercent > Number(params.get("maxChange"))) return false;
    if (params.get("minVolume") && item.volume < Number(params.get("minVolume"))) return false;
    if (params.get("maxVolume") && item.volume > Number(params.get("maxVolume"))) return false;
    if (params.get("minPe") && item.pe < Number(params.get("minPe"))) return false;
    if (params.get("maxPe") && item.pe > Number(params.get("maxPe"))) return false;
    if (params.get("minPb") && item.pb < Number(params.get("minPb"))) return false;
    if (params.get("maxPb") && item.pb > Number(params.get("maxPb"))) return false;
    if (params.get("minRoe") && item.roe < Number(params.get("minRoe"))) return false;
    if (params.get("maxRoe") && item.roe > Number(params.get("maxRoe"))) return false;
    if (params.get("trend") && item.direction !== params.get("trend")) return false;
    return true;
  });
}

export async function route(req, res, context) {
  const { state, audit, sync, rateLimitState, traceId, provider } = context;
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const method = req.method || "GET";
  const parts = url.pathname.split("/").filter(Boolean);
  const entitlements = provider?.entitlements || [];

  if (method === "GET" && url.pathname === "/v1/streams/quotes") {
    return handleQuoteStream(req, res, { ...context, url });
  }

  try {
    if (method === "GET" && url.pathname === "/v1/health") {
      return json(res, 200, { status: "ok", timestamp: new Date().toISOString() });
    }

    if (method === "GET" && url.pathname === "/v1/auth/session") {
      return json(res, 200, { userId: "mock-user", authenticated: true, entitlements });
    }

    if (method === "GET" && url.pathname === "/v1/markets") return json(res, 200, { items: markets });
    if (method === "GET" && url.pathname === "/v1/entitlements") return json(res, 200, { items: entitlements });

    if (method === "GET" && url.pathname === "/v1/stocks/universe") {
      if (!provider.getStockUniverse) {
        const result = error(501, "MARKET_DATA_UNAVAILABLE", "Stock universe is not available for the configured provider", traceId);
        return json(res, result.status, result.body, { "x-data-source": provider.id });
      }
      const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 6000, 10000));
      const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
      const market = url.searchParams.get("market");
      const key = `universe:${market || ""}:${limit}:${offset}`;
      const cached = await withCache(state, key, async () => provider.getStockUniverse({ market, limit, offset }), context.universeCacheTtlMs);
      audit.record("stock.universe", { traceId, target: `${cached.value.items.length}/${cached.value.total}` });
      const dataSource = cached.value.source || provider.id;
      const headers = {
        "x-cache": cached.hit ? "HIT" : "MISS",
        "x-data-source": dataSource,
      };
      if (provider.id === "mock-a-share") headers["x-mock-cache"] = headers["x-cache"];
      return json(res, 200, cached.value, headers);
    }

    if (method === "GET" && url.pathname === "/v1/stocks/search") {
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      if (!q) {
        const result = error(400, "VALIDATION_FAILED", "q query is required", traceId);
        return json(res, result.status, result.body);
      }
      const key = `search:${url.search}`;
      const cached = await withCache(state, key, async () => {
        const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 100);
        const market = url.searchParams.get("market");
        return provider.searchStocks({ q, market, limit });
      });
      audit.record("quote.search", { traceId, target: q });
      const headers = {
        "x-cache": cached.hit ? "HIT" : "MISS",
        "x-data-source": provider.id,
      };
      if (provider.id === "mock-a-share") headers["x-mock-cache"] = headers["x-cache"];
      return json(res, 200, cached.value, headers);
    }

    if (method === "POST" && url.pathname === "/v1/quotes") {
      const body = await readJson(req);
      if (!Array.isArray(body.symbols) || body.symbols.length < 1 || body.symbols.length > 100) {
        const result = error(400, "VALIDATION_FAILED", "symbols must contain 1-100 stocks", traceId);
        return json(res, result.status, result.body);
      }
      const result = await provider.getQuotes(body.symbols);
      audit.record("quote.batch", { traceId, target: `${result.items.length}` });
      return json(res, 200, result, { "x-data-source": provider.id });
    }

    if (parts[0] === "v1" && parts[1] === "stocks" && parts.length >= 5) {
      const [, , market, code, action] = parts;
      if (method === "GET" && action === "quote") {
        const stock = await provider.getQuote({ market, code });
        if (!stock) {
          const result = error(404, "NOT_FOUND", `Stock ${market}:${code} not found`, traceId);
          return json(res, result.status, result.body);
        }
        return json(res, 200, stock, { "x-data-source": provider.id });
      }
      if (method === "GET" && action === "history") {
        const period = url.searchParams.get("period");
        const range = url.searchParams.get("range");
        const history = await provider.getHistory({ market, code, period, range });
        if (!history) {
          const result = error(404, "NOT_FOUND", `Stock ${market}:${code} not found`, traceId);
          return json(res, result.status, result.body);
        }
        audit.record("history.read", { traceId, target: `${market}:${code}` });
        return json(res, 200, history, { "x-data-source": provider.id });
      }
      if (method === "GET" && action === "depth" && provider.getDepth) {
        const depth = await provider.getDepth({ market, code });
        if (!depth) {
          const result = error(404, "NOT_FOUND", `Stock ${market}:${code} not found`, traceId);
          return json(res, result.status, result.body);
        }
        return json(res, 200, depth, { "x-data-source": provider.id });
      }
    }

    if (method === "GET" && url.pathname === "/v1/screener") {
      if (provider.id !== "mock-a-share") {
        const result = error(501, "MARKET_DATA_UNAVAILABLE", "Screener is not available for the configured real-time provider", traceId);
        return json(res, result.status, result.body, { "x-data-source": provider.id });
      }
      const items = screenItems([...state.stocks.values()], url.searchParams);
      return json(res, 200, page(items, url.searchParams));
    }

    if (method === "GET" && url.pathname === "/v1/strategies") return json(res, 200, { items: state.strategies });
    if (method === "POST" && url.pathname === "/v1/strategies") {
      const body = await readJson(req);
      const strategy = { id: `custom-${state.nextStrategyId++}`, name: body.name, desc: body.desc || "", conditions: body.conditions || {}, builtin: false, updatedAt: new Date().toISOString() };
      state.strategies.push(strategy);
      audit.record("strategy.create", { traceId, target: strategy.id });
      return json(res, 201, strategy);
    }

    if (parts[0] === "v1" && parts[1] === "strategies" && parts[2]) {
      const id = parts[2];
      const index = state.strategies.findIndex(item => item.id === id);
      if (index < 0 || state.strategies[index].builtin) {
        const result = error(404, "NOT_FOUND", `Strategy ${id} not found`, traceId);
        return json(res, result.status, result.body);
      }
      if (method === "PUT") {
        const body = await readJson(req);
        state.strategies[index] = { ...state.strategies[index], name: body.name, desc: body.desc || "", conditions: body.conditions || {}, updatedAt: new Date().toISOString() };
        audit.record("strategy.update", { traceId, target: id });
        return json(res, 200, state.strategies[index]);
      }
      if (method === "DELETE") {
        state.strategies.splice(index, 1);
        audit.record("strategy.delete", { traceId, target: id });
        return noContent(res);
      }
    }

    if (method === "GET" && url.pathname === "/v1/watchlist") {
      const quotes = await provider.getQuotes(state.watchlist);
      return json(res, 200, {
        source: quotes.source,
        delayed: quotes.delayed,
        updatedAt: quotes.updatedAt,
        items: quotes.items.map((item, position) => ({ ...item, position, addedAt: state.watchlistAddedAt.get(`${item.market}:${item.code}`) })),
      }, { "x-data-source": provider.id });
    }
    if (method === "POST" && url.pathname === "/v1/watchlist") {
      const body = await readJson(req);
      const stock = await provider.getQuote({ market: body.market, code: body.code });
      if (!stock) {
        const result = error(404, "NOT_FOUND", `Stock ${body.market}:${body.code} not found`, traceId);
        return json(res, result.status, result.body);
      }
      if (!state.watchlist.some(item => item.market === body.market && item.code === body.code)) state.watchlist.push(stockIdentity(stock));
      state.watchlistAddedAt.set(stock.id, new Date().toISOString());
      audit.record("watchlist.create", { traceId, target: stock.id });
      return json(res, 201, { ...stock, position: state.watchlist.findIndex(item => item.market === body.market && item.code === body.code), addedAt: state.watchlistAddedAt.get(stock.id) });
    }
    if (method === "PUT" && url.pathname === "/v1/watchlist/reorder") {
      const body = await readJson(req);
      state.watchlist = (body.items || []).filter(item => item?.market && item?.code);
      audit.record("watchlist.update", { traceId });
      return noContent(res);
    }
    if (method === "DELETE" && parts[0] === "v1" && parts[1] === "watchlist" && parts[2] && parts[3]) {
      const target = `${parts[2]}:${parts[3]}`;
      state.watchlist = state.watchlist.filter(item => `${item.market}:${item.code}` !== target);
      audit.record("watchlist.delete", { traceId, target });
      return noContent(res);
    }

    if (method === "GET" && url.pathname === "/v1/sync/pull") {
      audit.record("sync.pull", { traceId });
      return json(res, 200, { ...sync.pull(), rateLimit: rateLimitState });
    }
    if (method === "POST" && url.pathname === "/v1/sync/push") {
      const result = sync.push(await readJson(req));
      audit.record("sync.push", { traceId, outcome: result.httpStatus >= 400 ? "failure" : "success" });
      return json(res, result.httpStatus, result.body);
    }

    if (method === "GET" && url.pathname === "/v1/audit/events") return json(res, 200, audit.list(Object.fromEntries(url.searchParams)));

    const result = error(404, "NOT_FOUND", `Route ${method} ${url.pathname} not found`, traceId);
    return json(res, result.status, result.body);
  } catch (err) {
    const result = err.code?.startsWith?.("MARKET_DATA") || err.code === "AUTH_REQUIRED"
      ? providerError(err, traceId)
      : { status: 500, body: { code: "INTERNAL_ERROR", message: err.message || "Internal error", traceId } };
    return json(res, result.status, result.body);
  }
}

export function sendRateLimited(res, state, traceId) {
  const retryAfter = Math.ceil((state.retryAfterMs || 0) / 1000);
  json(res, 429, { code: "RATE_LIMITED", message: "Rate limit exceeded", traceId, retryAfterMs: state.retryAfterMs }, {
    "retry-after": String(retryAfter),
    "x-ratelimit-limit": String(state.limit),
    "x-ratelimit-remaining": String(state.remaining),
    "x-ratelimit-reset": state.resetAt,
  });
}
