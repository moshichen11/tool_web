const NOW = "2026-05-12T01:30:00.000Z";

export const markets = [
  { id: "SH", name: "沪市A股", exchangeName: "Shanghai Stock Exchange", licensed: true, delaySeconds: 0, tradingCalendar: "SSE-A" },
  { id: "SZ", name: "深市A股", exchangeName: "Shenzhen Stock Exchange", licensed: true, delaySeconds: 0, tradingCalendar: "SZSE-A" },
  { id: "BJ", name: "北交所", exchangeName: "Beijing Stock Exchange", licensed: true, delaySeconds: 0, tradingCalendar: "BSE-A" },
];

export const entitlements = [
  {
    sourceId: "mock-a-share",
    sourceName: "Local Mock A-share Feed",
    markets: ["SH", "SZ", "BJ"],
    realtime: true,
    delaySeconds: 0,
    redistributionAllowed: false,
    expiresAt: "2027-05-12T00:00:00.000Z",
  },
];

const seeds = [
  ["SH", "600519", "贵州茅台", "白酒", "main", 1715.2, 1.86, 11.8, 32.4, 5.9],
  ["SZ", "300750", "宁德时代", "电池", "gem", 205.4, -0.72, 18.5, 21.2, 4.6],
  ["SH", "601318", "中国平安", "保险", "main", 48.1, 0.18, 10.2, 8.7, 0.9],
  ["SZ", "000333", "美的集团", "家电", "main", 69.3, 0.94, 16.4, 13.1, 2.8],
  ["SH", "688981", "中芯国际", "半导体", "star", 52.7, 2.41, 6.7, 78.4, 3.2],
  ["BJ", "430047", "诺思兰德", "医药", "bse", 14.6, -1.33, 9.9, 38.1, 2.4],
  ["SZ", "002415", "海康威视", "电子", "main", 34.8, 0.52, 15.3, 18.5, 3.3],
  ["SH", "600036", "招商银行", "银行", "main", 38.6, -0.21, 13.6, 6.1, 0.8],
];

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function direction(changePercent) {
  if (changePercent > 0) return "up";
  if (changePercent < 0) return "down";
  return "flat";
}

export function makeQuote(seed, index = 0) {
  const [market, code, name, industry, boardType, price, changePercent, roe, pe, pb] = seed;
  const previousClose = round(price / (1 + changePercent / 100));
  const dir = direction(changePercent);
  return {
    id: `${market}:${code}`,
    market,
    code,
    name,
    industry,
    boardType,
    status: "normal",
    price,
    changePercent,
    changeAmount: round(price - previousClose),
    volume: 1_000_000 + index * 137_000,
    amount: round((price * (1_000_000 + index * 137_000)) / 100_000_000),
    pe,
    pb,
    roe,
    marketCap: round(price * (80 + index * 13)),
    detailUrl: `https://example.test/stocks/${market}/${code}`,
    delayed: false,
    source: "mock-a-share",
    updatedAt: NOW,
    open: round(previousClose * 1.002),
    high: round(price * 1.018),
    low: round(price * 0.982),
    previousClose,
    direction: dir,
    colorRole: dir === "up" ? "stock-up" : dir === "down" ? "stock-down" : "stock-flat",
  };
}

export function createInitialStocks() {
  return seeds.map(makeQuote);
}

export function mutateQuote(quote, tick = 1) {
  const delta = ((quote.code.charCodeAt(5) % 5) - 2 + tick) * 0.01;
  const price = round(Math.max(0.01, quote.price + delta));
  const changePercent = round(((price - quote.previousClose) / quote.previousClose) * 100);
  const dir = direction(changePercent);
  return {
    ...quote,
    price,
    changePercent,
    changeAmount: round(price - quote.previousClose),
    direction: dir,
    colorRole: dir === "up" ? "stock-up" : dir === "down" ? "stock-down" : "stock-flat",
    updatedAt: new Date().toISOString(),
  };
}

export function makeHistory(stock, period, range) {
  const countByRange = { "1d": 1, "3d": 3, "5d": 5, "15d": 15, "30d": 30, "60d": 60, "120d": 120, "250d": 250, "500d": 500 };
  const count = period === "minute" ? Math.min((countByRange[range] || 1) * 16, 80) : countByRange[range] || 30;
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const base = stock.previousClose + i * 0.03;
    if (period === "minute") {
      items.push({ time: new Date(Date.UTC(2026, 4, 12, 1, i)).toISOString(), price: round(base), average: round(base - 0.05), volume: 10_000 + i * 500, amount: round(base * 1000) });
    } else {
      items.push({ time: `2026-04-${String((i % 30) + 1).padStart(2, "0")}`, open: round(base - 0.2), high: round(base + 0.5), low: round(base - 0.6), close: round(base), volume: 100_000 + i * 1_000, amount: round(base * 20_000), ma5: round(base - 0.1), ma10: round(base - 0.2), ma20: round(base - 0.3), dif: 0.12, dea: 0.1, macd: 0.04 });
    }
  }
  return items;
}

export function makeDepth(stock) {
  const levels = [1, 2, 3, 4, 5];
  const bids = levels.map(level => ({ price: round(stock.price - level * 0.03), volume: 10_000 * level, amount: round(stock.price * level), ratio: round(level / 15, 3) }));
  const asks = levels.map(level => ({ price: round(stock.price + level * 0.03), volume: 9_000 * level, amount: round(stock.price * level), ratio: round(level / 15, 3) }));
  const priceDistribution = Array.from({ length: 8 }, (_, index) => ({
    price: round(stock.price + (index - 4) * 0.05),
    volume: 8_000 + index * 700,
    side: index < 4 ? "down" : "up",
    ratio: round((index + 1) / 36, 3),
  }));
  return {
    stock: { id: stock.id, market: stock.market, code: stock.code },
    orderBook: { stock: { id: stock.id, market: stock.market, code: stock.code }, bids, asks, updatedAt: new Date().toISOString() },
    priceDistribution,
  };
}
