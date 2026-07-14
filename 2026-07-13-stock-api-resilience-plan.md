# Stock API Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep previously loaded stock charts usable during transient upstream failures and distinguish browser-to-API connection failures from API-to-provider failures.

**Architecture:** Reuse the existing Eastmoney retry loop, but bound each attempt and normalize exhausted network failures. Extract the route cache into a focused helper that can return a bounded stale value after provider failure. Preserve HTTP status, error code, trace ID, and stale response metadata in the browser client so the UI can show the correct warning.

**Tech Stack:** Node.js 22 built-in `fetch`, ECMAScript modules, browser Fetch API, plain HTML/JavaScript, and `node:test`.

## Global Constraints

- Preserve all existing user changes in `index.html`, ETF routes/providers, and tests.
- Add no runtime dependency, database, paid service, or fabricated market data.
- Raw browser fetch rejection means the API connection failed; HTTP `5xx` with `MARKET_DATA_*` means the upstream market-data provider failed.
- Mark stale fallbacks with `x-cache: STALE` and `x-data-stale: true`.
- Bound stale fallback to 7 days for universes and 30 days for history.
- Never cache failed provider responses as successful fresh values.
- Use test-first red/green cycles and run the complete test suite before completion.
- Execute inline in the current checkout because the sandbox blocks `.git` writes and worktree creation.

---

## File Structure

- Create `server/cache.js`: cache lookup, refresh, bounded stale-if-error fallback, and response cache headers.
- Create `tests/cache.test.js`: deterministic unit coverage using an injected clock.
- Modify `server/eastmoney-provider.js`: request timeout, three-attempt default, and provider-specific terminal errors.
- Modify `tests/eastmoney-provider.test.js`: timeout, retry, and exhausted-error coverage.
- Modify `server/mock-server.js`: stale retention configuration passed to routes.
- Modify `server/routes.js`: use the shared cache helper for stock and ETF universe/history routes.
- Modify `tests/mock-server.test.js`: integration contract for `STALE` headers and old values.
- Modify `index.html`: structured `StockApiError`, stale response metadata, and distinct Chinese messages.
- Modify `tests/stocks-module.test.js`: browser network/API-provider distinction and stale-result behavior.
- Modify `.env.example` and `render.yaml`: explicit resilience defaults.

### Task 1: Bound and Normalize Eastmoney Requests

**Files:**
- Modify: `tests/eastmoney-provider.test.js`
- Modify: `server/eastmoney-provider.js`
- Modify: `.env.example`
- Modify: `render.yaml`

**Interfaces:**
- Consumes: `createEastmoneyProvider({ fetchImpl, timeoutMs, retryAttempts, retryDelayMs })`.
- Produces: `MARKET_DATA_TIMEOUT` for an exhausted timeout and `MARKET_DATA_UNAVAILABLE` with message `Eastmoney request failed` for an exhausted native network error.

- [ ] **Step 1: Write failing provider tests**

```js
test("eastmoney provider normalizes exhausted native fetch failures", async () => {
  const { createEastmoneyProvider } = await import("../server/eastmoney-provider.js");
  let attempts = 0;
  const provider = createEastmoneyProvider({
    fetchImpl: async () => {
      attempts += 1;
      throw new TypeError("fetch failed");
    },
    retryAttempts: 3,
    retryDelayMs: 0,
  });
  await assert.rejects(
    () => provider.getHistory({ market: "SH", code: "600519", period: "day", range: "30d" }),
    error => error.status === 502 && error.code === "MARKET_DATA_UNAVAILABLE" && error.message === "Eastmoney request failed"
  );
  assert.equal(attempts, 3);
});

test("eastmoney provider aborts and normalizes a timed out attempt", async () => {
  const { createEastmoneyProvider } = await import("../server/eastmoney-provider.js");
  const provider = createEastmoneyProvider({
    fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }),
    timeoutMs: 5,
    retryAttempts: 1,
    retryDelayMs: 0,
  });
  await assert.rejects(
    () => provider.getHistory({ market: "SH", code: "600519", period: "day", range: "30d" }),
    error => error.status === 504 && error.code === "MARKET_DATA_TIMEOUT"
  );
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/eastmoney-provider.test.js`

Expected: the native failure still exposes `fetch failed`, and timeout fetch options do not yet receive an abort signal.

- [ ] **Step 3: Implement bounded retries and normalized errors**

```js
const timeoutMs = Math.max(1, Number(options.timeoutMs ?? process.env.EASTMONEY_TIMEOUT_MS) || 8_000);
const retryAttempts = Math.max(1, Number(options.retryAttempts ?? process.env.EASTMONEY_RETRY_ATTEMPTS) || 3);
const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? process.env.EASTMONEY_RETRY_DELAY_MS) || 250);

function normalizeFetchError(error) {
  if (error?.code) return error;
  if (error?.name === "AbortError") {
    return makeEastmoneyError(504, "MARKET_DATA_TIMEOUT", `Eastmoney request timed out after ${timeoutMs}ms`);
  }
  return makeEastmoneyError(502, "MARKET_DATA_UNAVAILABLE", "Eastmoney request failed");
}
```

For each attempt, create an `AbortController`, pass its signal to `fetchImpl`, clear the timer in `finally`, retry only normalized `429`/`5xx` failures, and throw the normalized final error.

Add exact environment defaults:

```dotenv
EASTMONEY_TIMEOUT_MS=8000
EASTMONEY_RETRY_ATTEMPTS=3
EASTMONEY_RETRY_DELAY_MS=250
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/eastmoney-provider.test.js`

Expected: all Eastmoney tests pass, including exactly three native-failure attempts and one bounded timeout.

### Task 2: Add Bounded Stale-if-Error Cache

**Files:**
- Create: `tests/cache.test.js`
- Create: `server/cache.js`
- Modify: `server/mock-server.js`
- Modify: `server/routes.js`
- Modify: `tests/mock-server.test.js`

**Interfaces:**
- Produces: `withCache(state, key, compute, options)` returning `{ value, hit, stale }`.
- Produces: `cacheHeaders(result)` returning `x-cache` and optional `x-data-stale`.
- Consumes: route context values `universeStaleIfErrorMs` and `historyStaleIfErrorMs`.

- [ ] **Step 1: Write failing cache tests**

```js
test("cache returns a bounded stale value when refresh fails", async () => {
  let currentTime = 0;
  const state = { cache: new Map() };
  await withCache(state, "history", async () => ({ items: [1] }), {
    ttlMs: 10, staleIfErrorMs: 100, now: () => currentTime,
  });
  currentTime = 20;
  const result = await withCache(state, "history", async () => {
    throw new Error("provider down");
  }, { ttlMs: 10, staleIfErrorMs: 100, now: () => currentTime });
  assert.deepEqual(result.value, { items: [1] });
  assert.equal(result.stale, true);
  assert.deepEqual(cacheHeaders(result), { "x-cache": "STALE", "x-data-stale": "true" });
});

test("cache rethrows after stale retention expires", async () => {
  let currentTime = 0;
  const state = { cache: new Map() };
  await withCache(state, "history", async () => ({ items: [1] }), {
    ttlMs: 10, staleIfErrorMs: 100, now: () => currentTime,
  });
  currentTime = 111;
  await assert.rejects(
    () => withCache(state, "history", async () => { throw new Error("provider down"); }, {
      ttlMs: 10, staleIfErrorMs: 100, now: () => currentTime,
    }),
    /provider down/
  );
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/cache.test.js`

Expected: module `server/cache.js` does not exist.

- [ ] **Step 3: Implement the cache helper**

```js
export async function withCache(state, key, compute, options = {}) {
  const ttlMs = Number(options.ttlMs ?? 5_000);
  const staleIfErrorMs = Math.max(0, Number(options.staleIfErrorMs ?? 0));
  const now = options.now || Date.now;
  const currentTime = now();
  const entry = state.cache.get(key);
  if (entry && entry.expiresAt > currentTime) return { hit: true, stale: false, value: entry.value };
  try {
    const value = await compute();
    const refreshedAt = now();
    const expiresAt = refreshedAt + ttlMs;
    state.cache.set(key, { value, expiresAt, staleUntil: expiresAt + staleIfErrorMs });
    return { hit: false, stale: false, value };
  } catch (error) {
    if (entry && entry.staleUntil > currentTime) return { hit: true, stale: true, value: entry.value };
    throw error;
  }
}

export function cacheHeaders(result) {
  return {
    "x-cache": result.stale ? "STALE" : result.hit ? "HIT" : "MISS",
    ...(result.stale ? { "x-data-stale": "true" } : {}),
  };
}
```

Use 7-day universe and 30-day history stale windows in `mock-server.js`, pass them through route context, and apply them only to stock/ETF universe and history requests. Replace local `withCache` and ternary `x-cache` construction with the shared helpers.

- [ ] **Step 4: Add route-level stale response coverage**

Use a test server with a provider fetch that succeeds once, let a 1 ms cache TTL expire, then fail the provider. Assert the second response remains HTTP `200`, keeps the first body, and has `x-cache: STALE` plus `x-data-stale: true`.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node --test tests/cache.test.js tests/mock-server.test.js`

Expected: fresh responses remain `MISS`/`HIT`; only refresh failures inside retention become `STALE`.

### Task 3: Preserve Structured API Errors in the Browser

**Files:**
- Modify: `tests/stocks-module.test.js`
- Modify: `index.html`

**Interfaces:**
- Produces: `fetchStockApi()` errors with `name`, `status`, `code`, and `traceId`.
- Produces: successful results with boolean `stale` derived from response headers.
- Consumes: backend `MARKET_DATA_*`, `x-cache`, and `x-data-stale` metadata.

- [ ] **Step 1: Write failing browser tests**

```js
await assert.rejects(
  () => client("/v1/stocks/SH/600519/history"),
  error => error.name === "StockApiError" && error.status === 502 &&
    error.code === "MARKET_DATA_UNAVAILABLE" && error.traceId === "trace-provider"
);

assert.equal(
  formatError(Object.assign(new Error("fetch failed"), {
    name: "StockApiError", status: 502, code: "MARKET_DATA_UNAVAILABLE",
  })),
  "上游行情源暂时不可用，请稍后重试；已加载的数据会继续保留。"
);

assert.equal(
  formatError(new TypeError("fetch failed")),
  "行情接口连接失败，请确认本地股票 API 已启动，或检查当前网络/隧道是否可访问。"
);
```

Also assert a successful response with `x-cache: STALE` returns `stale === true`.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/stocks-module.test.js`

Expected: `fetchStockApi` throws a plain `Error`, structured provider failure still uses the local-connection message, and stale metadata is absent.

- [ ] **Step 3: Implement structured errors and stale metadata**

```js
if (!response.ok) {
  const error = new Error(body.message || `Stock API ${response.status}`);
  error.name = "StockApiError";
  error.status = response.status;
  error.code = body.code || "";
  error.traceId = body.traceId || response.headers.get("x-trace-id") || "";
  throw error;
}
return {
  ...body,
  stale: response.headers.get("x-data-stale") === "true" || response.headers.get("x-cache") === "STALE",
  headers: response.headers,
};
```

In `getStockApiErrorMessage`, check structured `MARKET_DATA_TIMEOUT` and `MARKET_DATA_*` before matching message text. Leave raw `TypeError("fetch failed")` mapped to the local/network message.

When universe or history succeeds with `stale === true`, keep the data, set the visible warning to `上游行情源暂时不可用，当前显示缓存行情。`, and do not clear chart arrays. Apply the same behavior to ETF history because it shares the backend cache contract.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/stocks-module.test.js`

Expected: structured 502 errors and raw fetch rejection display different messages; stale chart results render successfully with a warning.

### Task 4: Full Regression and Runtime Verification

**Files:**
- Verify all files listed above.

**Interfaces:**
- Consumes: local API at `http://127.0.0.1:8787` after restart.
- Produces: evidence that cached data survives a provider failure and uncached failure reports the upstream layer.

- [ ] **Step 1: Run the complete automated suite**

Run: `node --test tests/*.test.js`

Expected: zero failures, zero cancelled tests, and no unhandled warnings.

- [ ] **Step 2: Run static validation**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 3: Restart and probe the API**

Request `GET /v1/stocks/universe?limit=6000` and `GET /v1/stocks/SH/600519/history?period=day&range=60d` after restarting `server/mock-server.js`. Successful requests expose `MISS` then `HIT`; deterministic provider failure after cached success exposes `STALE`, not `502`.

- [ ] **Step 4: Review the final diff**

Confirm only resilience-related hunks were added and all pre-existing ETF, limit-board, image, and contract edits remain intact. The sandbox prevents commits, so report the changed files and verification evidence without claiming a commit.
