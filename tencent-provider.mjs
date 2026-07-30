const DEFAULT_ENDPOINT = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get";
const RANGE_COUNTS = new Map([
  ["15d", 15], ["30d", 30], ["60d", 60],
  ["120d", 120], ["250d", 250], ["500d", 500],
]);
const MARKET_PREFIX = new Map([["SH", "sh"], ["SZ", "sz"], ["BJ", "bj"]]);
const PERIODS = new Set(["day", "week", "month"]);

function makeTencentError(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}

function round(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : 0;
}

function normalizeRows(rows) {
  const byTime = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const time = String(row[0] || "");
    const [open, close, high, low, volume] = row.slice(1, 6).map(Number);
    if (!time || ![open, close, high, low, volume].every(Number.isFinite) ||
      open <= 0 || close <= 0 || high <= 0 || low <= 0 || volume < 0 ||
      low > Math.min(open, close) || high < Math.max(open, close)) continue;
    byTime.set(time, {
      time,
      open: round(open, 4),
      high: round(high, 4),
      low: round(low, 4),
      close: round(close, 4),
      volume: Math.round(volume),
      amount: 0,
    });
  }
  return [...byTime.values()]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((item, index, normalized) => {
      const previousClose = normalized[index - 1]?.close ?? item.close;
      const changeAmount = item.close - previousClose;
      return {
        ...item,
        changeAmount: round(changeAmount),
        changePercent: round(previousClose ? changeAmount / previousClose * 100 : 0),
      };
    });
}

export function createTencentProvider(options = {}) {
  const environment = globalThis.process?.env || {};
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const endpoint = options.endpoint || environment.TENCENT_KLINE_URL || DEFAULT_ENDPOINT;
  const timeoutMs = Math.max(1, Number(
    options.timeoutMs ?? environment.TENCENT_TIMEOUT_MS ?? 2_000,
  ));
  const now = options.now || (() => new Date());

  async function loadHistory(params, kind) {
    const market = String(params?.market || "").toUpperCase();
    const code = String(params?.code || "").trim();
    const period = String(params?.period || "");
    const range = String(params?.range || "");
    const prefix = MARKET_PREFIX.get(market);
    const count = RANGE_COUNTS.get(range);

    if (!prefix || !/^\d{6}$/.test(code)) {
      throw makeTencentError(400, "VALIDATION_FAILED", `Unsupported Tencent identity ${market}:${code}`);
    }
    if (!PERIODS.has(period)) {
      throw makeTencentError(400, "VALIDATION_FAILED", `Unsupported Tencent period ${period}`);
    }
    if (!count) {
      throw makeTencentError(400, "VALIDATION_FAILED", `Unsupported Tencent range ${range}`);
    }
    if (!fetchImpl) throw makeTencentError(500, "INTERNAL_ERROR", "fetch is unavailable");

    const symbol = `${prefix}${code}`;
    const url = new URL(endpoint);
    url.searchParams.set("param", `${symbol},${period},,,${count},qfq`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: {
          accept: "application/json,text/plain,*/*",
        },
      });
      if (!response.ok) {
        throw makeTencentError(response.status, "MARKET_DATA_UNAVAILABLE", `Tencent HTTP ${response.status}`);
      }

      let result;
      try {
        result = await response.json();
      } catch (_error) {
        throw makeTencentError(502, "MARKET_DATA_UNAVAILABLE", "Tencent returned invalid JSON");
      }
      if (Number(result?.code || 0) !== 0) {
        throw makeTencentError(
          502,
          "MARKET_DATA_UNAVAILABLE",
          result?.msg || "Tencent request failed",
          { upstreamCode: result?.code },
        );
      }

      const node = result?.data?.[symbol];
      const rows = node?.[`qfq${period}`] || node?.[period];
      const items = normalizeRows(Array.isArray(rows) ? rows : []).slice(-count);
      if (!items.length) {
        throw makeTencentError(
          502,
          "MARKET_DATA_UNAVAILABLE",
          `Tencent returned no usable ${period} rows for ${symbol}`,
        );
      }

      const identity = kind === "etf"
        ? { etf: { id: `ETF:${market}:${code}`, type: "etf", market, code } }
        : { stock: { id: `${market}:${code}`, market, code } };
      return {
        ...identity,
        period,
        range,
        items,
        source: "tencent",
        delayed: false,
        updatedAt: now().toISOString(),
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        throw makeTencentError(
          504,
          "MARKET_DATA_TIMEOUT",
          `Tencent request timed out after ${timeoutMs}ms`,
        );
      }
      if (error?.code) throw error;
      throw makeTencentError(502, "MARKET_DATA_UNAVAILABLE", error?.message || "Tencent request failed");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    id: "tencent",
    sourceId: "tencent",
    getHistory: params => loadHistory(params, "stock"),
    getEtfHistory: params => loadHistory(params, "etf"),
  };
}
