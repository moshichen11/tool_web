import http from "node:http";
import { fileURLToPath } from "node:url";
import { createAuditStore } from "./audit.js";
import { createInitialStocks } from "./mock-data.js";
import { createRateLimiter } from "./rate-limit.js";
import { route, sendRateLimited } from "./routes.js";
import { createSyncStore } from "./sync.js";
import { createTushareProvider } from "./tushare-provider.js";

function createState() {
  const stocks = new Map(createInitialStocks().map(stock => [stock.id, stock]));
  const watchlist = [
    { market: "SH", code: "600519" },
    { market: "SZ", code: "300750" },
  ];
  return {
    stocks,
    cache: new Map(),
    watchlist,
    watchlistAddedAt: new Map(watchlist.map(item => [`${item.market}:${item.code}`, new Date().toISOString()])),
    strategies: [
      { id: "builtin-high-roe", name: "高ROE", desc: "ROE >= 10", conditions: { minRoe: 10 }, builtin: true, updatedAt: new Date().toISOString() },
      { id: "builtin-low-pe", name: "低市盈率", desc: "PE <= 18", conditions: { maxPe: 18 }, builtin: true, updatedAt: new Date().toISOString() },
    ],
    nextStrategyId: 1,
  };
}

export function createMockServer(options = {}) {
  const state = createState();
  const audit = createAuditStore();
  const sync = createSyncStore(state.watchlist, state.strategies);
  const port = Number(options.port ?? process.env.MOCK_SERVER_PORT ?? 8787);
  const host = options.host ?? process.env.MOCK_SERVER_HOST ?? "127.0.0.1";
  const sseIntervalMs = Number(options.sseIntervalMs ?? process.env.MOCK_SSE_INTERVAL_MS ?? 1_000);
  const dataSource = options.dataSource ?? process.env.STOCK_DATA_SOURCE ?? "mock-a-share";
  const provider = dataSource === "tushare"
    ? createTushareProvider({
      token: options.tushareToken,
      endpoint: options.tushareApiUrl,
      fetchImpl: options.fetchImpl,
      now: options.now,
    })
    : null;
  const rateLimit = {
    windowMs: Number(options.rateLimit?.windowMs ?? process.env.MOCK_RATE_LIMIT_WINDOW_MS ?? 60_000),
    maxRequests: Number(options.rateLimit?.maxRequests ?? process.env.MOCK_RATE_LIMIT_MAX_REQUESTS ?? 120),
  };
  const limiter = createRateLimiter(rateLimit, audit);

  const server = http.createServer(async (req, res) => {
    const traceId = req.headers["x-trace-id"] || `trace-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type,authorization,x-trace-id,x-mock-bypass-rate-limit");
    res.setHeader("x-trace-id", traceId);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const rateLimitState = limiter.check(req, traceId);
    res.setHeader("x-ratelimit-limit", String(rateLimitState.limit));
    res.setHeader("x-ratelimit-remaining", String(rateLimitState.remaining));
    res.setHeader("x-ratelimit-reset", rateLimitState.resetAt);
    if (!rateLimitState.allowed) {
      sendRateLimited(res, rateLimitState, traceId);
      return;
    }

    await route(req, res, { state, audit, sync, rateLimitState, traceId, sseIntervalMs, provider });
  });

  return {
    get url() {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      return `http://${host}:${actualPort}`;
    },
    start() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      });
    },
    stop() {
      return new Promise((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      });
    },
    server,
    state,
    provider,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createMockServer();
  app.start().then(() => {
    console.log(`stocks mock server listening on ${app.url}`);
  });
}
