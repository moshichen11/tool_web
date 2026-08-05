const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const mean = values => values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
const round = value => Math.round(value * 100) / 100;

function seriesOf(stock) {
  return Array.isArray(stock?.dailyK) ? stock.dailyK.filter(bar => number(bar.close) > 0) : [];
}

function averageClose(series, days, offset = 0) {
  const end = series.length - offset;
  return mean(series.slice(Math.max(0, end - days), end).map(bar => number(bar.close)));
}

function averageAmount(series, days, offset = 0) {
  const end = series.length - offset;
  return mean(series.slice(Math.max(0, end - days), end).map(bar => number(bar.amount)));
}

function returnFor(series, days) {
  const end = number(series.at(-1)?.close);
  const start = number(series.at(-(days + 1))?.close);
  return start > 0 ? end / start - 1 : 0;
}

function upperShadow(bar) {
  return number(bar.high) - Math.max(number(bar.open), number(bar.close));
}

export function isStrategyEligible(stock) {
  const name = String(stock?.name || "");
  const status = String(stock?.status || "").toLowerCase();
  return (stock?.boardType === "main") && ["SH", "SZ"].includes(String(stock?.market || "").toUpperCase()) &&
    !/^\*?st/i.test(name) && !/退/.test(name) && !["st", "suspended", "delist-risk", "delisted"].includes(status) &&
    number(stock?.volume) > 0 && number(stock?.amount) > 0;
}

export function getIndicators(stock, config) {
  const series = seriesOf(stock);
  const latest = series.at(-1) || {};
  const previous = series.at(-2) || {};
  const windows = config.windows;
  const ma5 = averageClose(series, windows.ma5);
  const ma10 = averageClose(series, windows.ma10);
  const ma20 = averageClose(series, windows.ma20);
  const avgAmount = averageAmount(series, windows.volume, 1);
  const close = number(latest.close);
  const previousHigh20 = Math.max(...series.slice(Math.max(0, series.length - windows.high20 - 1), -1).map(bar => number(bar.high || bar.close)), 0);
  const volumeRatio = avgAmount > 0 ? number(latest.amount) / avgAmount : 0;
  return {
    series, latest, previous, close, ma5, ma10, ma20, volumeRatio,
    return5d: returnFor(series, 5), return10d: returnFor(series, 10),
    previousHigh20, closePosition: close > 0 ? (close - number(latest.low)) / Math.max(number(latest.high) - number(latest.low), 0.01) : 0,
  };
}

function makeMatch(stock, config, strategyId, score, reasonCodes, observationReference, invalidation) {
  const strategy = config.strategies.find(item => item.id === strategyId);
  return {
    id: `${stock.market}:${stock.code}:${strategyId}`,
    horizon: strategy.horizon,
    strategyId,
    strategyName: strategy.name,
    code: stock.code,
    market: stock.market,
    name: stock.name,
    industry: stock.industry || "未知行业",
    close: number(stock.dailyK.at(-1)?.close),
    amount: number(stock.amount),
    score: round(score),
    reasonCodes,
    observationReference,
    invalidation,
    riskLabel: strategy.riskLabel,
  };
}

export function matchStrategies(stock, context, config) {
  if (!isStrategyEligible(stock)) return [];
  const i = getIndicators(stock, config);
  if (i.series.length < 21 || number(stock.amount) < number(config.prefilter.minAmount)) return [];
  const matches = [];
  const bullish = i.close > i.ma5 && i.ma5 > i.ma10 && i.ma10 > i.ma20;
  const volume = i.volumeRatio >= number(config.thresholds.volumeExpansion);
  const industryReturn = context.industryReturn5d.get(stock.industry) || 0;
  if (bullish && volume && i.return5d >= number(config.thresholds.leaderReturn5d) && i.return5d >= industryReturn) {
    matches.push(makeMatch(stock, config, "leader_reacceleration", 70 + i.return5d * 200 + i.volumeRatio * 5, ["INDUSTRY_STRENGTH", "RELATIVE_STRENGTH", "VOLUME_CONFIRMATION", "BULLISH_MA"], `收盘 ${i.close.toFixed(2)}`, `收盘跌破 MA5（${i.ma5.toFixed(2)}）`));
  }
  const previousBody = Math.abs(number(i.previous.close) - number(i.previous.open));
  const bearishOrUpperShadow = number(i.previous.close) < number(i.previous.open) || upperShadow(i.previous) > previousBody;
  if (bearishOrUpperShadow && i.close > Math.max(number(i.previous.open), number(i.previous.close)) && volume && i.closePosition >= 0.65) {
    matches.push(makeMatch(stock, config, "upper_shadow_reversal", 65 + i.volumeRatio * 8, ["REVERSAL_CANDLE", "ENGULFING_CLOSE", "VOLUME_CONFIRMATION"], `收盘 ${i.close.toFixed(2)}`, `收盘跌破反包日低点（${number(i.latest.low).toFixed(2)}）`));
  }
  const high10 = Math.max(...i.series.slice(-11, -1).map(bar => number(bar.high)), 0);
  const pullback = high10 > 0 ? 1 - i.close / high10 : 0;
  if (i.return10d >= 0.1 && pullback > 0 && pullback <= number(config.thresholds.pullbackMax) && i.close >= i.ma5 && i.volumeRatio <= 1.1) {
    matches.push(makeMatch(stock, config, "strong_pullback_reclaim", 60 + i.return10d * 150, ["PRIOR_STRENGTH", "CONTROLLED_PULLBACK", "MA5_RECLAIM"], `MA5 ${i.ma5.toFixed(2)}`, `收盘跌破 MA10（${i.ma10.toFixed(2)}）`));
  }
  if (bullish && volume && i.close > i.previousHigh20) {
    matches.push(makeMatch(stock, config, "trend_breakout", 70 + (i.close / i.previousHigh20 - 1) * 300 + i.volumeRatio * 5, ["MA_ALIGNMENT", "BREAKOUT_20D", "VOLUME_CONFIRMATION"], `突破位 ${i.previousHigh20.toFixed(2)}`, `收盘跌破突破位（${i.previousHigh20.toFixed(2)}）`));
  }
  const priorMa20 = averageClose(i.series, config.windows.ma20, 3);
  const nearSupport = [i.ma10, i.ma20].some(level => level > 0 && Math.abs(number(i.latest.low) / level - 1) <= 0.03);
  if (i.ma20 > priorMa20 && nearSupport && i.close >= i.ma20 && i.volumeRatio <= 1.1) {
    matches.push(makeMatch(stock, config, "trend_pullback", 60 + i.return5d * 100, ["RISING_MA20", "SUPPORT_TEST", "LOW_VOLUME_PULLBACK"], `MA20 ${i.ma20.toFixed(2)}`, `收盘跌破 MA20（${i.ma20.toFixed(2)}）`));
  }
  return matches;
}

function capByIndustry(items, maxPerIndustry, maxItems) {
  const counts = new Map();
  return items.filter(item => {
    const count = counts.get(item.industry) || 0;
    if (count >= maxPerIndustry) return false;
    counts.set(item.industry, count + 1);
    return true;
  }).slice(0, maxItems);
}

export function buildStrategySnapshot({ stocks, config, dataDate, generatedAt, source, coverage }) {
  const eligible = stocks.filter(isStrategyEligible);
  const industryReturn5d = new Map();
  for (const stock of eligible) {
    const values = eligible.filter(item => item.industry === stock.industry).map(item => getIndicators(item, config).return5d);
    industryReturn5d.set(stock.industry, mean(values));
  }
  const matches = eligible.flatMap(stock => matchStrategies(stock, { industryReturn5d }, config));
  const output = config.output;
  const byHorizon = horizon => capByIndustry(matches.filter(item => item.horizon === horizon).sort((a, b) => b.score - a.score || b.amount - a.amount), output.maxPerIndustry, output.maxPerHorizon);
  return { schemaVersion: config.version, dataDate, generatedAt, source, coverage, shortTerm: byHorizon("shortTerm"), swing: byHorizon("swing") };
}
