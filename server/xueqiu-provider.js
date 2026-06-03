import { makeStockDataError } from "./stock-data-provider.js";

const SEARCH_ENDPOINT = "https://xueqiu.com/query/v1/suggest_stock.json";
const QUOTE_ENDPOINT = "https://stock.xueqiu.com/v5/stock/batch/quote.json";
const KLINE_ENDPOINT = "https://stock.xueqiu.com/v5/stock/chart/kline.json";

const rangeDays = {
  "1d": 1,
  "3d": 3,
  "5d": 5,
  "15d": 15,
  "30d": 30,
  "60d": 60,
  "120d": 120,
  "250d": 250,
  "500d": 500,
};

function round(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(digits));
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseXueqiuSymbol(value, fallback = {}) {
  const text = String(value || "").trim().toUpperCase();
  const match = text.match(/^(SH|SZ|BJ|HK|US)?\.?([A-Z0-9.]+)$/);
  const market = match?.[1] || fallback.market || fallback.exchange || "";
  const code = fallback.code || match?.[2] || text.replace(/^(SH|SZ|BJ)/, "");
  return {
    id: `${market}:${code}`,
    market,
    code,
    symbol: market ? `${market}${code}` : code,
  };
}

function identityToSymbol(identity) {
  const market = String(identity.market || "").toUpperCase();
  const code = String(identity.code || "").trim().toUpperCase();
  return `${market}${code}`;
}

function timestampToIso(value, fallback) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return new Date(number).toISOString();
  return fallback;
}

function periodToXueqiu(period) {
  if (period === "minute") return "1m";
  if (period === "day") return "day";
  if (period === "week") return "week";
  if (period === "month") return "month";
  return null;
}

function getDataItems(result) {
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.data?.items)) return result.data.items;
  if (Array.isArray(result?.data?.list)) return result.data.list;
  return [];
}

function makeCache(defaultTtlMs) {
  const entries = new Map();
  return async function withCache(key, ttlMs, compute) {
    const ttl = Number(ttlMs ?? defaultTtlMs);
    if (ttl > 0) {
      const entry = entries.get(key);
      if (entry && entry.expiresAt > Date.now()) return entry.value;
    }
    const value = await compute();
    if (ttl > 0) entries.set(key, { value, expiresAt: Date.now() + ttl });
    return value;
  };
}

function createRateLimiter(limit) {
  const windowMs = Number(limit?.windowMs || process.env.XUEQIU_RATE_LIMIT_WINDOW_MS || 60_000);
  const maxRequests = Number(limit?.maxRequests || process.env.XUEQIU_RATE_LIMIT_MAX_REQUESTS || 90);
  const hits = [];

  return function check() {
    const now = Date.now();
    while (hits.length && hits[0] <= now - windowMs) hits.shift();
    if (hits.length >= maxRequests) {
      throw makeStockDataError(429, "MARKET_DATA_RATE_LIMITED", "Xueqiu outbound rate limit exceeded", {
        retryAfterMs: Math.max(0, windowMs - (now - hits[0])),
      });
    }
    hits.push(now);
  };
}

function makeAuthHeader(cookie, token) {
  const configuredCookie = cookie ?? process.env.XUEQIU_COOKIE;
  const configuredToken = token ?? process.env.XUEQIU_TOKEN;
  if (configuredCookie) return String(configuredCookie);
  if (configuredToken) return `xq_a_token=${String(configuredToken)}`;
  return "";
}

function normalizeUpstreamError(result) {
  const code = result?.error_code ?? result?.code;
  if (
    code === undefined ||
    code === null ||
    code === 0 ||
    code === 200 ||
    result?.success === true ||
    String(result?.message || "").toLowerCase() === "success"
  ) {
    return null;
  }
  const message = result?.error_description || result?.error_message || result?.message || "Xueqiu request failed";
  if (code === 400016 || code === 400042 || code === 401 || code === 403) {
    return makeStockDataError(403, "MARKET_DATA_UNLICENSED", message, { upstreamCode: code });
  }
  return makeStockDataError(502, "MARKET_DATA_UNAVAILABLE", message, { upstreamCode: code });
}

function quoteFromXueqiu(raw, fallback = {}, nowIso) {
  const identity = parseXueqiuSymbol(raw?.symbol || raw?.code, {
    market: raw?.exchange || fallback.market,
    code: fallback.code,
  });
  const changePercent = round(raw?.percent);
  const price = round(raw?.current ?? raw?.close ?? raw?.last_close);
  const previousClose = round(raw?.last_close ?? raw?.prev_close ?? price);
  const updatedAt = timestampToIso(raw?.timestamp ?? raw?.time, nowIso);

  return {
    id: identity.id,
    market: identity.market,
    code: identity.code,
    name: raw?.name || fallback.name || identity.code,
    industry: raw?.industry || fallback.industry || "unknown",
    boardType: raw?.type_name || fallback.boardType || "unknown",
    status: raw?.status_name || raw?.status || "normal",
    price,
    changePercent,
    changeAmount: round(raw?.chg),
    volume: Math.round(Number(raw?.volume || 0)),
    amount: round(raw?.amount),
    pe: round(raw?.pe_ttm ?? raw?.pe_lyr),
    pb: round(raw?.pb),
    roe: round(raw?.roe),
    marketCap: round(Number(raw?.market_capital || raw?.total_market_cap || 0) / 100_000_000),
    open: round(raw?.open ?? price),
    high: round(raw?.high ?? price),
    low: round(raw?.low ?? price),
    previousClose,
    direction: direction(changePercent),
    colorRole: colorRole(changePercent),
    delayed: false,
    source: "xueqiu",
    updatedAt,
    detailUrl: `https://xueqiu.com/S/${identity.symbol}`,
  };
}

function summaryFromSuggest(raw, nowIso) {
  const identity = parseXueqiuSymbol(raw?.code || raw?.symbol);
  return {
    ...identity,
    name: raw?.name || raw?.query || identity.code,
    industry: raw?.industry || raw?.type_name || "unknown",
    boardType: raw?.type_name || "unknown",
    status: "normal",
    price: 0,
    changePercent: 0,
    changeAmount: 0,
    volume: 0,
    amount: 0,
    pe: 0,
    pb: 0,
    roe: 0,
    marketCap: 0,
    direction: "flat",
    colorRole: "stock-flat",
    delayed: false,
    source: "xueqiu",
    updatedAt: nowIso,
    detailUrl: `https://xueqiu.com/S/${identity.symbol}`,
  };
}

function klineItemFromColumns(columns, row) {
  const lookup = name => row[columns.indexOf(name)];
  return {
    time: timestampToIso(lookup("timestamp"), String(lookup("timestamp") || "")),
    open: round(lookup("open")),
    high: round(lookup("high")),
    low: round(lookup("low")),
    close: round(lookup("close")),
    volume: Math.round(Number(lookup("volume") || 0)),
    amount: round(lookup("amount")),
    changeAmount: round(lookup("chg")),
    changePercent: round(lookup("percent")),
    turnover: round(lookup("turnoverrate")),
    dif: 0,
    dea: 0,
    macd: 0,
  };
}

export function createXueqiuStockDataProvider(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || (() => new Date());
  const quoteEndpoint = options.quoteEndpoint || process.env.XUEQIU_QUOTE_URL || QUOTE_ENDPOINT;
  const searchEndpoint = options.searchEndpoint || process.env.XUEQIU_SEARCH_URL || SEARCH_ENDPOINT;
  const klineEndpoint = options.klineEndpoint || process.env.XUEQIU_KLINE_URL || KLINE_ENDPOINT;
  const timeoutMs = Number(options.timeoutMs || process.env.XUEQIU_TIMEOUT_MS || 6_000);
  const retryAttempts = Math.max(1, Number(options.retryAttempts || process.env.XUEQIU_RETRY_ATTEMPTS || 3));
  const retryDelayMs = Number(options.retryDelayMs || process.env.XUEQIU_RETRY_DELAY_MS || 250);
  const cacheTtlMs = Number(options.cacheTtlMs ?? process.env.XUEQIU_CACHE_TTL_MS ?? 5_000);
  const historyCacheTtlMs = Number(options.historyCacheTtlMs ?? process.env.XUEQIU_HISTORY_CACHE_TTL_MS ?? 60_000);
  const withCache = makeCache(cacheTtlMs);
  const checkRateLimit = createRateLimiter(options.outboundLimit);

  function nowIso() {
    return now().toISOString();
  }

  function authHeaders() {
    const cookie = makeAuthHeader(options.cookie, options.token);
    if (!cookie) {
      throw makeStockDataError(401, "AUTH_REQUIRED", "XUEQIU_COOKIE or XUEQIU_TOKEN is required for Xueqiu market data");
    }
    return {
      accept: "application/json,text/plain,*/*",
      cookie,
      referer: "https://xueqiu.com/",
      "user-agent": "Mozilla/5.0",
    };
  }

  async function fetchJson(url) {
    const headers = authHeaders();
    if (!fetchImpl) {
      throw makeStockDataError(500, "INTERNAL_ERROR", "fetch is not available in this Node runtime");
    }

    let lastError;
    for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
      checkRateLimit();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { headers, signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) {
          const statusCode = response.status === 401 || response.status === 403
            ? "MARKET_DATA_UNLICENSED"
            : "MARKET_DATA_UNAVAILABLE";
          const error = makeStockDataError(response.status, statusCode, `Xueqiu HTTP ${response.status}`);
          if (attempt < retryAttempts && (response.status === 429 || response.status >= 500)) {
            lastError = error;
            await delay(retryDelayMs * attempt);
            continue;
          }
          throw error;
        }
        const result = await response.json();
        const upstreamError = normalizeUpstreamError(result);
        if (upstreamError) throw upstreamError;
        return result;
      } catch (error) {
        clearTimeout(timer);
        if (error.name === "AbortError") {
          lastError = makeStockDataError(504, "MARKET_DATA_TIMEOUT", `Xueqiu request timed out after ${timeoutMs}ms`);
        } else {
          lastError = error;
        }
        const retryable = !lastError.status || lastError.status === 429 || lastError.status >= 500;
        if (attempt < retryAttempts && retryable) {
          await delay(retryDelayMs * attempt);
          continue;
        }
        throw lastError;
      }
    }
    throw lastError || makeStockDataError(502, "MARKET_DATA_UNAVAILABLE", "Xueqiu request failed");
  }

  async function getQuoteBatch(symbols) {
    const identities = symbols.map(item => ({
      market: String(item.market || "").toUpperCase(),
      code: String(item.code || "").trim().toUpperCase(),
    })).filter(item => item.market && item.code);
    const batchKey = identities.map(identityToSymbol).join(",");
    return withCache(`quotes:${batchKey}`, cacheTtlMs, async () => {
      const url = new URL(quoteEndpoint);
      url.searchParams.set("symbol", batchKey);
      url.searchParams.set("extend", "detail");
      const result = await fetchJson(url);
      const items = getDataItems(result).map(item => quoteFromXueqiu(item.quote || item, {}, nowIso()));
      return { items, source: "xueqiu", delayed: false, updatedAt: nowIso() };
    });
  }

  async function searchStocks({ q, market, limit = 20 }) {
    const queryText = String(q || "").trim();
    return withCache(`search:${market || ""}:${queryText}:${limit}`, cacheTtlMs, async () => {
      const url = new URL(searchEndpoint);
      url.searchParams.set("q", queryText);
      url.searchParams.set("count", String(Math.min(Number(limit) || 20, 100)));
      const result = await fetchJson(url);
      const summaries = getDataItems(result)
        .map(item => summaryFromSuggest(item, nowIso()))
        .filter(item => !market || item.market === market)
        .slice(0, Math.min(Number(limit) || 20, 100));
      const quoted = summaries.length ? await getQuoteBatch(summaries) : { items: [] };
      const byIdentity = new Map(quoted.items.map(item => [`${item.market}:${item.code}`, item]));
      const items = summaries.map(item => byIdentity.get(`${item.market}:${item.code}`) || item);
      return { items, source: "xueqiu", delayed: false, updatedAt: nowIso() };
    });
  }

  async function getQuotes(symbols) {
    return getQuoteBatch(symbols);
  }

  async function getQuote(identity) {
    const result = await getQuotes([identity]);
    return result.items[0] || null;
  }

  async function getHistory({ market, code, period = "day", range = "30d" }) {
    const xueqiuPeriod = periodToXueqiu(period);
    if (!xueqiuPeriod) {
      throw makeStockDataError(400, "MARKET_DATA_UNAVAILABLE", `Xueqiu provider does not support ${period} history`);
    }
    const symbol = identityToSymbol({ market, code });
    const days = rangeDays[range] || 30;
    return withCache(`history:${symbol}:${period}:${range}`, historyCacheTtlMs, async () => {
      const url = new URL(klineEndpoint);
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("begin", String(now().getTime()));
      url.searchParams.set("period", xueqiuPeriod);
      url.searchParams.set("type", "before");
      url.searchParams.set("count", String(-Math.max(1, days)));
      url.searchParams.set("indicator", "kline,pe,pb,ps,pcf,market_capital");
      const result = await fetchJson(url);
      const columns = result?.data?.column || [];
      const rows = result?.data?.item || [];
      const items = rows.map(row => klineItemFromColumns(columns, row));
      return {
        stock: { id: `${market}:${code}`, market, code },
        period,
        range,
        items,
        source: "xueqiu",
        delayed: false,
        updatedAt: nowIso(),
      };
    });
  }

  return {
    id: "xueqiu",
    sourceId: "xueqiu",
    quoteEndpoint,
    searchEndpoint,
    klineEndpoint,
    entitlements: [
      {
        sourceId: "xueqiu",
        sourceName: "Xueqiu",
        markets: ["SH", "SZ", "BJ"],
        realtime: true,
        delaySeconds: 0,
        redistributionAllowed: false,
      },
    ],
    searchStocks,
    getQuote,
    getQuotes,
    getHistory,
  };
}
