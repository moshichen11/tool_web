import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildStrategySnapshot, isStrategyEligible } from "./strategy-selection-engine.mjs";

const json = value => `${JSON.stringify(value, null, 2)}\n`;

function chinaDate(now) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now).replace(/\//g, "-");
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return fallback; }
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

export async function runStrategySnapshot({ provider, config, now = () => new Date(), outputDirectory }) {
  await mkdir(outputDirectory, { recursive: true });
  const attemptedAt = now().toISOString();
  const statusPath = join(outputDirectory, "status.json");
  const latestPath = join(outputDirectory, "latest.json");
  const previous = await readJson(latestPath, null);
  const stale = async (state, message) => {
    await writeFile(statusPath, json({ state, attemptedAt, message, lastSuccessfulDataDate: previous?.dataDate || null }));
    return { status: state, statusPath, snapshotPath: previous ? latestPath : null };
  };
  try {
    const universe = await provider.getStockUniverse({ limit: 10000 });
    const eligible = (universe?.items || []).filter(isStrategyEligible)
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0) || Math.abs(Number(b.changePercent || 0)) - Math.abs(Number(a.changePercent || 0)))
      .slice(0, config.prefilter.maxStocks);
    const loaded = (await mapConcurrent(eligible, 4, async stock => {
      try {
        const history = await provider.getHistory({ market: stock.market, code: stock.code, period: "day", range: "90d" });
        return Array.isArray(history?.items) && history.items.length ? { ...stock, dailyK: history.items } : null;
      } catch { return null; }
    })).filter(Boolean);
    const dataDate = loaded.map(stock => String(stock.dailyK.at(-1)?.time || "").slice(0, 10)).sort().at(-1);
    if (!dataDate || dataDate !== chinaDate(now())) return stale("stale", "行情日线尚未更新，保留最近有效快照。");
    const snapshot = buildStrategySnapshot({ stocks: loaded, config, dataDate, generatedAt: attemptedAt, source: universe?.source || "eastmoney", coverage: { eligible: (universe?.items || []).filter(isStrategyEligible).length, prefetched: eligible.length, evaluated: loaded.length } });
    const datedPath = join(outputDirectory, `${dataDate}.json`);
    const index = await readJson(join(outputDirectory, "index.json"), { dates: [] });
    const dates = [dataDate, ...(index.dates || []).filter(date => date !== dataDate)].slice(0, 60);
    await Promise.all([writeFile(latestPath, json(snapshot)), writeFile(datedPath, json(snapshot)), writeFile(join(outputDirectory, "index.json"), json({ dates }))]);
    await writeFile(statusPath, json({ state: "ready", attemptedAt, dataDate, source: snapshot.source }));
    return { status: "ready", dataDate, statusPath, snapshotPath: latestPath };
  } catch (error) {
    return stale("failed", error?.message || "策略快照生成失败。");
  }
}
