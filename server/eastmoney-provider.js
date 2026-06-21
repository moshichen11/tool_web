const QUOTE_ENDPOINT = "https://push2.eastmoney.com/api/qt/stock/get";
const KLINE_ENDPOINT = "https://push2his.eastmoney.com/api/qt/stock/kline/get";
const LIST_ENDPOINT = "https://push2delay.eastmoney.com/api/qt/clist/get";
const QUOTE_FIELDS = "f43,f44,f45,f46,f47,f48,f57,f58,f60,f116,f169,f170";
const KLINE_FIELDS1 = "f1,f2,f3,f4,f5,f6";
const KLINE_FIELDS2 = "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61";
const LIST_FIELDS = "f2,f3,f4,f5,f6,f9,f12,f13,f14,f23,f100";
const A_SHARE_LIST_FS = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048";
const DEFAULT_LIST_PAGE_SIZE = 6000;

const stockCatalog = [
  ["SH", "600519", "贵州茅台", "白酒", "main"],
  ["SZ", "300750", "宁德时代", "电池", "gem"],
  ["SZ", "000001", "平安银行", "银行", "main"],
  ["SZ", "000858", "五粮液", "白酒", "main"],
  ["SH", "601318", "中国平安", "保险", "main"],
  ["SH", "600036", "招商银行", "银行", "main"],
  ["SH", "601899", "紫金矿业", "有色金属", "main"],
  ["SZ", "002594", "比亚迪", "汽车", "main"],
  ["SH", "600900", "长江电力", "公用事业", "main"],
  ["SZ", "300760", "迈瑞医疗", "医疗器械", "gem"],
  ["SH", "601012", "隆基绿能", "新能源", "main"],
  ["SH", "688981", "中芯国际", "半导体", "star"],
  ["SH", "600276", "恒瑞医药", "医药", "main"],
  ["SH", "601288", "农业银行", "银行", "main"],
  ["SZ", "002415", "海康威视", "电子", "main"],
  ["SZ", "300059", "东方财富", "证券", "gem"],
  ["SH", "601857", "中国石油", "能源", "main"],
  ["SZ", "000651", "格力电器", "家电", "main"],
  ["SH", "600030", "中信证券", "证券", "main"],
  ["SZ", "002230", "科大讯飞", "人工智能", "main"],
  ["BJ", "430047", "诺思兰德", "医药", "bse"],
].map(([market, code, name, industry, boardType]) => ({
  id: `${market}:${code}`,
  market,
  code,
  name,
  industry,
  boardType,
  status: "normal",
  source: "eastmoney",
  delayed: false,
  updatedAt: new Date().toISOString(),
}));

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
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function scaled(value, divisor = 100) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === -1) return 0;
  return round(number / divisor);
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

function marketPrefix(market) {
  if (market === "SH") return "1";
  return "0";
}

function toSecid(identity) {
  return `${marketPrefix(identity.market)}.${identity.code}`;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function marketFromListRow(row) {
  const code = String(row?.f12 || "");
  if (Number(row?.f13) === 1) return "SH";
  if (/^(4|8|920)/.test(code)) return "BJ";
  return "SZ";
}

function boardTypeFromCode(market, code) {
  if (market === "BJ") return "bse";
  if (code.startsWith("688")) return "star";
  if (code.startsWith("3")) return "gem";
  return "main";
}

function statusFromName(name) {
  const text = String(name || "");
  if (/退/.test(text)) return "delist-risk";
  if (/^\*?ST/i.test(text)) return "st";
  return "normal";
}

function makeEastmoneyError(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}

function catalogSummary(raw) {
  return {
    ...raw,
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
  };
}

function listSummary(row) {
  const code = String(row?.f12 || "").trim();
  if (!code) return null;
  const market = marketFromListRow(row);
  const name = String(row?.f14 || code);
  const changePercent = numberOrZero(row.f3);
  return {
    id: `${market}:${code}`,
    market,
    code,
    name,
    industry: String(row.f100 || "unknown"),
    boardType: boardTypeFromCode(market, code),
    status: statusFromName(name),
    price: numberOrZero(row.f2),
    changePercent,
    changeAmount: numberOrZero(row.f4),
    volume: numberOrZero(row.f5),
    amount: round(numberOrZero(row.f6)),
    pe: numberOrZero(row.f9),
    pb: numberOrZero(row.f23),
    roe: 0,
    marketCap: 0,
    direction: direction(changePercent),
    colorRole: colorRole(changePercent),
    source: "eastmoney",
    delayed: false,
    updatedAt: new Date().toISOString(),
  };
}

function stockMatchesSearchQuery(item, queryText) {
  if (!queryText) return true;
  const compactQuery = queryText.replace(/[\s:：.-]+/g, "");
  const fields = [
    item.code,
    item.name,
    item.market,
    item.id,
    `${item.market}${item.code}`,
    `${item.market} ${item.code}`,
    `${item.market}:${item.code}`,
    item.industry,
  ].map(value => String(value || "").toLowerCase());
  return fields.some(field => (
    field.includes(queryText)
    || field.replace(/[\s:：.-]+/g, "").includes(compactQuery)
  ));
}

function normalizeDiff(diff) {
  if (Array.isArray(diff)) return diff;
  if (diff && typeof diff === "object") return Object.values(diff);
  return [];
}

function getCatalogStock(identity) {
  return stockCatalog.find(item => item.market === identity.market && item.code === identity.code);
}

function quoteFromEastmoney(data, requested) {
  const market = requested.market;
  const code = String(data?.f57 || requested.code);
  const changePercent = scaled(data?.f170);
  const previousClose = scaled(data?.f60);
  const latestPrice = scaled(data?.f43) || previousClose;
  const open = scaled(data?.f46) || latestPrice;
  const high = scaled(data?.f44) || latestPrice;
  const low = scaled(data?.f45) || latestPrice;
  const fallback = getCatalogStock({ market, code }) || {
    id: `${market}:${code}`,
    market,
    code,
    name: data?.f58 || code,
    industry: "unknown",
    boardType: "unknown",
    status: "normal",
    source: "eastmoney",
    delayed: false,
    updatedAt: new Date().toISOString(),
  };

  return {
    ...catalogSummary(fallback),
    name: data?.f58 || fallback.name,
    price: latestPrice,
    changePercent,
    changeAmount: scaled(data?.f169),
    volume: Math.round(Number(data?.f47 || 0) / 100),
    amount: round(Number(data?.f48 || 0)),
    marketCap: round(Number(data?.f116 || 0) / 100_000_000),
    open,
    high,
    low,
    previousClose,
    direction: direction(changePercent),
    colorRole: colorRole(changePercent),
    source: "eastmoney",
    delayed: false,
    updatedAt: new Date().toISOString(),
  };
}

function periodToKlt(period) {
  if (period === "day") return "101";
  if (period === "week") return "102";
  if (period === "month") return "103";
  return null;
}

function kLineFromText(row) {
  const [time, open, close, high, low, volume, amount, amplitude, changePercent, changeAmount, turnover] = String(row).split(",");
  return {
    time,
    open: Number(open || 0),
    high: Number(high || 0),
    low: Number(low || 0),
    close: Number(close || 0),
    volume: Math.round(Number(volume || 0) / 100),
    amount: round(Number(amount || 0)),
    amplitude: Number(amplitude || 0),
    changePercent: Number(changePercent || 0),
    changeAmount: Number(changeAmount || 0),
    turnover: Number(turnover || 0),
    dif: 0,
    dea: 0,
    macd: 0,
  };
}

export function createEastmoneyProvider(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const quoteEndpoint = options.quoteEndpoint || QUOTE_ENDPOINT;
  const klineEndpoint = options.klineEndpoint || KLINE_ENDPOINT;
  const listEndpoint = options.listEndpoint || process.env.EASTMONEY_LIST_URL || LIST_ENDPOINT;
  const listPageSize = Math.max(1, Math.min(Number(options.listPageSize) || DEFAULT_LIST_PAGE_SIZE, 10000));
  const listPageDelayMs = Math.max(0, Number(options.listPageDelayMs ?? (options.fetchImpl ? 0 : 80)));
  const retryAttempts = Math.max(1, Number(options.retryAttempts) || 2);
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs) || 150);

  function wait(ms) {
    return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
  }

  async function getJson(url) {
    if (!fetchImpl) {
      throw makeEastmoneyError(500, "INTERNAL_ERROR", "fetch is not available in this Node runtime");
    }

    let lastError;
    for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
      try {
        const response = await fetchImpl(url, {
          headers: {
            "accept": "application/json,text/plain,*/*",
            "referer": "https://quote.eastmoney.com/center/gridlist.html",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
          },
        });
        if (!response.ok) {
          throw makeEastmoneyError(response.status, "MARKET_DATA_UNAVAILABLE", `Eastmoney HTTP ${response.status}`);
        }
        const result = await response.json();
        if (result.rc !== 0) {
          throw makeEastmoneyError(502, "MARKET_DATA_UNAVAILABLE", result.message || "Eastmoney request failed", { upstreamCode: result.rc });
        }
        return result;
      } catch (error) {
        lastError = error;
        if (error.status && error.status < 500) throw error;
        if (attempt < retryAttempts) await wait(retryDelayMs * attempt);
      }
    }

    if (lastError?.code) throw lastError;
    throw makeEastmoneyError(502, "MARKET_DATA_UNAVAILABLE", lastError?.message || "Eastmoney request failed");
  }

  async function searchStocks({ q, market, limit = 20 }) {
    const queryText = String(q || "").trim().toLowerCase();
    const targetMarket = market ? String(market).toUpperCase() : "";
    const requestedLimit = Math.min(Number(limit) || 20, 100);
    const byId = new Map();

    for (const item of stockCatalog) {
      if (targetMarket && item.market !== targetMarket) continue;
      if (!stockMatchesSearchQuery(item, queryText)) continue;
      byId.set(item.id, catalogSummary(item));
      if (byId.size >= requestedLimit) break;
    }

    if (byId.size < requestedLimit) {
      const universe = await getStockUniverse({ market: targetMarket, limit: 10000 });
      for (const item of universe.items) {
        if (!stockMatchesSearchQuery(item, queryText)) continue;
        if (!byId.has(item.id)) byId.set(item.id, item);
        if (byId.size >= requestedLimit) break;
      }
    }

    const items = [...byId.values()].slice(0, requestedLimit);
    return { items, source: "eastmoney", delayed: false, updatedAt: new Date().toISOString() };
  }

  async function getListPage(page, pageSize = listPageSize) {
    const url = new URL(listEndpoint);
    url.searchParams.set("pn", String(page));
    url.searchParams.set("pz", String(Math.max(1, Math.min(Number(pageSize) || listPageSize, 10000))));
    url.searchParams.set("po", "1");
    url.searchParams.set("np", "1");
    url.searchParams.set("fltt", "2");
    url.searchParams.set("invt", "2");
    url.searchParams.set("fid", "f12");
    url.searchParams.set("fs", A_SHARE_LIST_FS);
    url.searchParams.set("fields", LIST_FIELDS);
    const result = await getJson(url);
    return {
      total: Number(result.data?.total || 0),
      rows: normalizeDiff(result.data?.diff),
    };
  }

  async function getStockUniverse({ market, limit = 6000, offset = 0 } = {}) {
    const requestedLimit = Math.max(1, Math.min(Number(limit) || 6000, 10000));
    const requestedOffset = Math.max(Number(offset) || 0, 0);
    const targetMarket = market ? String(market).toUpperCase() : "";

    if (!targetMarket && requestedLimit < listPageSize && requestedOffset % requestedLimit === 0) {
      const page = Math.floor(requestedOffset / requestedLimit) + 1;
      const result = await getListPage(page, requestedLimit);
      const items = result.rows.map(listSummary).filter(Boolean);
      return {
        items,
        total: Number(result.total || items.length),
        limit: requestedLimit,
        offset: requestedOffset,
        source: "eastmoney",
        delayed: false,
        updatedAt: new Date().toISOString(),
      };
    }

    const first = await getListPage(1);
    const firstRows = first.rows;
    const total = Number(first.total || firstRows.length);
    if (!firstRows.length || !total) {
      return { items: [], total: 0, limit: requestedLimit, offset: requestedOffset, source: "eastmoney", delayed: false, updatedAt: new Date().toISOString() };
    }

    const pageSize = firstRows.length;
    const rowsNeeded = targetMarket ? total : Math.min(total, requestedOffset + requestedLimit);
    const pageCount = Math.ceil(rowsNeeded / pageSize);
    const rows = [...firstRows];
    for (let page = 2; page <= pageCount; page += 1) {
      await wait(listPageDelayMs);
      rows.push(...(await getListPage(page)).rows);
    }

    const items = rows
      .map(listSummary)
      .filter(Boolean)
      .filter(item => !targetMarket || item.market === targetMarket);
    return {
      items: items.slice(requestedOffset, requestedOffset + requestedLimit),
      total: targetMarket ? items.length : total,
      limit: requestedLimit,
      offset: requestedOffset,
      source: "eastmoney",
      delayed: false,
      updatedAt: new Date().toISOString(),
    };
  }

  async function getQuote(identity) {
    const url = new URL(quoteEndpoint);
    url.searchParams.set("secid", toSecid(identity));
    url.searchParams.set("fields", QUOTE_FIELDS);
    const result = await getJson(url);
    if (!result.data) return null;
    return quoteFromEastmoney(result.data, identity);
  }

  async function getQuotes(symbols) {
    const items = (await Promise.all(symbols.map(getQuote))).filter(Boolean);
    return { items, source: "eastmoney", delayed: false, updatedAt: new Date().toISOString() };
  }

  async function getHistory({ market, code, period, range }) {
    const klt = periodToKlt(period);
    if (!klt) {
      throw makeEastmoneyError(400, "MARKET_DATA_UNAVAILABLE", `Eastmoney provider does not support ${period} history`);
    }
    const url = new URL(klineEndpoint);
    url.searchParams.set("secid", toSecid({ market, code }));
    url.searchParams.set("fields1", KLINE_FIELDS1);
    url.searchParams.set("fields2", KLINE_FIELDS2);
    url.searchParams.set("klt", klt);
    url.searchParams.set("fqt", "1");
    url.searchParams.set("beg", "0");
    url.searchParams.set("end", "20500101");
    const result = await getJson(url);
    const days = rangeDays[range] || 30;
    const items = (result.data?.klines || []).slice(-days).map(kLineFromText);
    return {
      stock: { id: `${market}:${code}`, market, code },
      period,
      range,
      items,
      source: "eastmoney",
      delayed: false,
    };
  }

  return {
    id: "eastmoney",
    sourceId: "eastmoney",
    entitlements: [
      {
        sourceId: "eastmoney",
        sourceName: "Eastmoney public quote",
        markets: ["SH", "SZ", "BJ"],
        realtime: true,
        delaySeconds: 0,
        redistributionAllowed: false,
      },
    ],
    searchStocks,
    getStockUniverse,
    getQuote,
    getQuotes,
    getHistory,
  };
}
