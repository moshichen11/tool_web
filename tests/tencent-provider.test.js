const test = require("node:test");
const assert = require("node:assert/strict");

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("tencent maps forward-adjusted daily history", async () => {
  const { createTencentProvider } = await import("../tencent-provider.mjs");
  const calls = [];
  const provider = createTencentProvider({
    now: () => new Date("2026-07-13T07:00:00.000Z"),
    fetchImpl: async (url, options) => {
      calls.push({ url: new URL(url), options });
      return jsonResponse({
        code: 0,
        data: {
          sh600519: {
            qfqday: [
              ["2026-07-09", "1200", "1210", "1220", "1190", "10000"],
              ["2026-07-10", "1210", "1221", "1230", "1205", "12000"],
            ],
          },
        },
      });
    },
  });

  const history = await provider.getHistory({
    market: "SH",
    code: "600519",
    period: "day",
    range: "15d",
  });

  assert.equal(calls[0].url.searchParams.get("param"), "sh600519,day,,,15,qfq");
  assert.equal(history.source, "tencent");
  assert.equal(history.updatedAt, "2026-07-13T07:00:00.000Z");
  assert.equal(history.stock.id, "SH:600519");
  assert.deepEqual(history.items[1], {
    time: "2026-07-10",
    open: 1210,
    high: 1230,
    low: 1205,
    close: 1221,
    volume: 12000,
    amount: 0,
    changeAmount: 11,
    changePercent: 0.91,
  });
});

test("tencent supports week, month, ETF, and raw BSE keys", async () => {
  const { createTencentProvider } = await import("../tencent-provider.mjs");
  const calls = [];
  const provider = createTencentProvider({
    fetchImpl: async url => {
      const param = new URL(url).searchParams.get("param");
      calls.push(param);
      const [symbol, period] = param.split(",");
      const key = symbol.startsWith("bj") ? period : "qfq" + period;
      return jsonResponse({
        code: 0,
        data: { [symbol]: { [key]: [["2026-07-13", "10", "11", "12", "9", "1000"]] } },
      });
    },
  });

  const weekly = await provider.getHistory({ market: "SZ", code: "000001", period: "week", range: "30d" });
  const monthly = await provider.getHistory({ market: "SH", code: "600519", period: "month", range: "120d" });
  const bse = await provider.getHistory({ market: "BJ", code: "920992", period: "day", range: "60d" });
  const etf = await provider.getEtfHistory({ market: "SH", code: "510300", period: "day", range: "250d" });

  assert.deepEqual(calls, [
    "sz000001,week,,,30,qfq",
    "sh600519,month,,,120,qfq",
    "bj920992,day,,,60,qfq",
    "sh510300,day,,,250,qfq",
  ]);
  assert.equal(weekly.period, "week");
  assert.equal(monthly.period, "month");
  assert.equal(bse.items.length, 1);
  assert.equal(etf.etf.id, "ETF:SH:510300");
});

test("tencent validates requests and rejects empty history", async () => {
  const { createTencentProvider } = await import("../tencent-provider.mjs");
  let calls = 0;
  const provider = createTencentProvider({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ code: 0, data: { sh600519: { qfqday: [] } } });
    },
  });

  for (const input of [
    { market: "US", code: "AAPL", period: "day", range: "30d" },
    { market: "SH", code: "600519", period: "minute", range: "30d" },
    { market: "SH", code: "600519", period: "day", range: "999d" },
  ]) {
    await assert.rejects(
      () => provider.getHistory(input),
      error => error.status === 400 && error.code === "VALIDATION_FAILED",
    );
  }
  assert.equal(calls, 0);
  await assert.rejects(
    () => provider.getHistory({ market: "SH", code: "600519", period: "day", range: "30d" }),
    error => error.status === 502
      && error.code === "MARKET_DATA_UNAVAILABLE"
      && /no usable/i.test(error.message),
  );
});

test("tencent limits rows to the requested range", async () => {
  const { createTencentProvider } = await import("../tencent-provider.mjs");
  const rows = Array.from({ length: 20 }, (_, index) => [
    "2026-06-" + String(index + 1).padStart(2, "0"),
    "10",
    String(10 + index),
    "30",
    "9",
    "1000",
  ]);
  const provider = createTencentProvider({
    fetchImpl: async () => jsonResponse({ code: 0, data: { sh600519: { qfqday: rows } } }),
  });

  const history = await provider.getHistory({ market: "SH", code: "600519", period: "day", range: "15d" });

  assert.equal(history.items.length, 15);
  assert.equal(history.items[0].time, "2026-06-06");
});

test("tencent rejects HTTP, upstream-code, and malformed-JSON responses", async () => {
  const responses = [
    jsonResponse({}, 503),
    jsonResponse({ code: 123, msg: "upstream blocked" }),
    new Response("<html>bad gateway</html>", { status: 200 }),
  ];

  for (const response of responses) {
    const { createTencentProvider } = await import("../tencent-provider.mjs");
    const provider = createTencentProvider({ fetchImpl: async () => response });
    await assert.rejects(
      () => provider.getHistory({ market: "SH", code: "600519", period: "day", range: "30d" }),
      error => error.code === "MARKET_DATA_UNAVAILABLE",
    );
  }
});

test("tencent converts abort into a structured timeout", async () => {
  const { createTencentProvider } = await import("../tencent-provider.mjs");
  const provider = createTencentProvider({
    timeoutMs: 1,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }),
  });

  await assert.rejects(
    () => provider.getHistory({ market: "SH", code: "600519", period: "day", range: "30d" }),
    error => error.status === 504 && error.code === "MARKET_DATA_TIMEOUT",
  );
});

test("tencent provider constructs without the Node process global", async () => {
  const { createTencentProvider } = await import("../tencent-provider.mjs");
  const originalProcess = globalThis.process;
  let provider;
  try {
    globalThis.process = undefined;
    provider = createTencentProvider({
      fetchImpl: async () => jsonResponse({
        code: 0,
        data: {
          sh600519: {
            qfqday: [["2026-07-13", "10", "11", "12", "9", "1000"]],
          },
        },
      }),
    });
  } finally {
    globalThis.process = originalProcess;
  }

  const history = await provider.getHistory({
    market: "SH",
    code: "600519",
    period: "day",
    range: "15d",
  });

  assert.equal(history.source, "tencent");
});

test("tencent provider sends only browser-safe request headers", async () => {
  const { createTencentProvider } = await import("../tencent-provider.mjs");
  let requestOptions;
  const provider = createTencentProvider({
    fetchImpl: async (_url, options) => {
      requestOptions = options;
      return jsonResponse({
        code: 0,
        data: {
          sh600519: {
            qfqday: [["2026-07-13", "10", "11", "12", "9", "1000"]],
          },
        },
      });
    },
  });

  await provider.getHistory({
    market: "SH",
    code: "600519",
    period: "day",
    range: "15d",
  });

  assert.deepEqual(requestOptions.headers, {
    accept: "application/json,text/plain,*/*",
  });
});
