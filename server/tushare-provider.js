const DEFAULT_ENDPOINT = "http://api.tushare.pro";
const STOCK_BASIC_FIELDS = "ts_code,symbol,name,area,industry,market,exchange,list_date";
const DAILY_FIELDS = "ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount";

const marketToSuffix = {
  SH: "SH",
  SZ: "SZ",
  BJ: "BJ",
};

const suffixToMarket = {
  SH: "SH",
  SZ: "SZ",
  BJ: "BJ",
};

const marketToExchange = {
  SH: "SSE",
  SZ: "SZSE",
  BJ: "BSE",
};

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
  if (!Number.isFinite(value)) return value;
  return Number(value.toFixed(digits));
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

function boardType(marketName, exchange) {
  if (exchange === "BSE" || marketName === "北交所") return "bse";
  if (marketName === "科创板") return "star";
  if (marketName === "创业板") return "gem";
  if (marketName === "主板") return "main";
  return "unknown";
}

function dateToYmd(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
}

function ymdToIsoDate(value) {
  const text = String(value || "");
  if (!/^\d{8}$/.test(text)) return text;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function toTsCode(identity) {
  const suffix = marketToSuffix[identity.market];
  return suffix ? `${identity.code}.${suffix}` : `${identity.code}.${identity.market}`;
}

function fromTsCode(tsCode) {
  const [code, suffix] = String(tsCode).split(".");
  const market = suffixToMarket[suffix] || suffix;
  return { id: `${market}:${code}`, market, code };
}

function rowsToObjects(data) {
  const fields = data?.fields || [];
  const items = data?.items || [];
  return items.map(item => Object.fromEntries(fields.map((field, index) => [field, item[index]])));
}

function makeTushareError(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}

function responseCodeToError(result) {
  if (result.code === 0) return null;
  if (result.code === 2002) {
    return makeTushareError(403, "MARKET_DATA_UNLICENSED", result.msg || "Tushare permission denied", { upstreamCode: result.code });
  }
  return makeTushareError(502, "MARKET_DATA_UNAVAILABLE", result.msg || "Tushare request failed", { upstreamCode: result.code });
}

function stockBasicSummary(row) {
  const identity = fromTsCode(row.ts_code);
  return {
    ...identity,
    name: row.name || row.symbol || identity.code,
    industry: row.industry || "unknown",
    boardType: boardType(row.market, row.exchange),
    status: "normal",
    price: 0,
    changePercent: 0,
    changeAmount: 0,
    volume: 0,
    amount: 0,
    delayed: true,
    source: "tushare",
    updatedAt: new Date().toISOString(),
  };
}

function quoteFromDaily(row, basic) {
  const identity = fromTsCode(row.ts_code);
  const changePercent = Number(row.pct_chg || 0);
  const summary = basic ? stockBasicSummary(basic) : stockBasicSummary({ ts_code: row.ts_code, symbol: identity.code });
  return {
    ...summary,
    price: Number(row.close || 0),
    changePercent,
    changeAmount: Number(row.change || 0),
    volume: Math.round(Number(row.vol || 0) * 100),
    amount: round(Number(row.amount || 0) * 1000),
    updatedAt: ymdToIsoDate(row.trade_date),
    open: Number(row.open || 0),
    high: Number(row.high || 0),
    low: Number(row.low || 0),
    previousClose: Number(row.pre_close || 0),
    direction: direction(changePercent),
    colorRole: colorRole(changePercent),
    delayed: true,
    source: "tushare",
  };
}

function kLineFromDaily(rows) {
  const sorted = rows
    .slice()
    .sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));

  return sorted.map((row, index) => {
    const close = Number(row.close || 0);
    const item = {
      time: ymdToIsoDate(row.trade_date),
      open: Number(row.open || 0),
      high: Number(row.high || 0),
      low: Number(row.low || 0),
      close,
      volume: Math.round(Number(row.vol || 0) * 100),
      amount: round(Number(row.amount || 0) * 1000),
      dif: 0,
      dea: 0,
      macd: 0,
    };

    for (const windowSize of [5, 10, 20]) {
      if (index + 1 >= windowSize) {
        const windowRows = sorted.slice(index + 1 - windowSize, index + 1);
        item[`ma${windowSize}`] = round(windowRows.reduce((sum, value) => sum + Number(value.close || 0), 0) / windowSize);
      }
    }
    return item;
  });
}

function periodToApi(period) {
  if (period === "day") return "daily";
  if (period === "week") return "weekly";
  if (period === "month") return "monthly";
  return null;
}

export function createTushareProvider(options = {}) {
  const endpoint = options.endpoint || process.env.TUSHARE_API_URL || DEFAULT_ENDPOINT;
  const token = options.token || process.env.TUSHARE_TOKEN;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || (() => new Date());
  const stockBasicCache = { expiresAt: 0, items: [] };

  async function query(apiName, params = {}, fields = "") {
    if (!token) {
      throw makeTushareError(401, "AUTH_REQUIRED", "TUSHARE_TOKEN is required");
    }
    if (!fetchImpl) {
      throw makeTushareError(500, "INTERNAL_ERROR", "fetch is not available in this Node runtime");
    }

    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_name: apiName, token, params, fields }),
    });

    if (!response.ok) {
      throw makeTushareError(response.status, "MARKET_DATA_UNAVAILABLE", `Tushare HTTP ${response.status}`);
    }

    const result = await response.json();
    const apiError = responseCodeToError(result);
    if (apiError) throw apiError;
    return rowsToObjects(result.data);
  }

  async function getStockBasics() {
    if (stockBasicCache.expiresAt > Date.now()) return stockBasicCache.items;
    const items = await query("stock_basic", { exchange: "", list_status: "L" }, STOCK_BASIC_FIELDS);
    stockBasicCache.items = items;
    stockBasicCache.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    return items;
  }

  async function getBasicsByTsCode() {
    const basics = await getStockBasics();
    return new Map(basics.map(item => [item.ts_code, item]));
  }

  async function searchStocks({ q, market, limit = 20 }) {
    const queryText = String(q || "").trim().toLowerCase();
    const basics = await getStockBasics();
    const exchange = market ? marketToExchange[market] : null;
    const items = basics
      .filter(item => !exchange || item.exchange === exchange)
      .filter(item => {
        return (
          item.symbol?.includes(queryText) ||
          item.ts_code?.toLowerCase().includes(queryText) ||
          item.name?.toLowerCase().includes(queryText) ||
          item.industry?.toLowerCase().includes(queryText)
        );
      })
      .slice(0, Math.min(Number(limit) || 20, 100))
      .map(stockBasicSummary);
    return { items, source: "tushare", delayed: true, updatedAt: new Date().toISOString() };
  }

  async function getQuotes(symbols) {
    const tsCodes = symbols.map(toTsCode);
    const rows = await query("daily", {
      ts_code: tsCodes.join(","),
      start_date: dateToYmd(new Date(now().getTime() - 14 * 24 * 60 * 60 * 1000)),
      end_date: dateToYmd(now()),
    }, DAILY_FIELDS);
    const basics = await getBasicsByTsCode();
    const latestByTsCode = new Map();
    for (const row of rows) {
      const current = latestByTsCode.get(row.ts_code);
      if (!current || String(row.trade_date) > String(current.trade_date)) latestByTsCode.set(row.ts_code, row);
    }
    const items = tsCodes
      .map(tsCode => latestByTsCode.get(tsCode))
      .filter(Boolean)
      .map(row => quoteFromDaily(row, basics.get(row.ts_code)));
    return { items, source: "tushare", delayed: true, updatedAt: new Date().toISOString() };
  }

  async function getQuote(identity) {
    const response = await getQuotes([identity]);
    return response.items[0] || null;
  }

  async function getHistory({ market, code, period, range }) {
    const apiName = periodToApi(period);
    if (!apiName) {
      throw makeTushareError(400, "MARKET_DATA_UNAVAILABLE", `Tushare provider does not support ${period} history`);
    }

    const days = rangeDays[range] || 30;
    const rows = await query(apiName, {
      ts_code: toTsCode({ market, code }),
      start_date: dateToYmd(new Date(now().getTime() - days * 2 * 24 * 60 * 60 * 1000)),
      end_date: dateToYmd(now()),
    }, DAILY_FIELDS);

    return {
      stock: { id: `${market}:${code}`, market, code },
      period,
      range,
      items: kLineFromDaily(rows),
      source: "tushare",
      delayed: true,
    };
  }

  return {
    id: "tushare",
    sourceId: "tushare",
    endpoint,
    entitlements: [
      {
        sourceId: "tushare",
        sourceName: "Tushare Pro",
        markets: ["SH", "SZ", "BJ"],
        realtime: false,
        delaySeconds: 0,
        redistributionAllowed: false,
      },
    ],
    query,
    searchStocks,
    getQuote,
    getQuotes,
    getHistory,
  };
}
