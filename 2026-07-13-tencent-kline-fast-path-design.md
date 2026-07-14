# Tencent K-line Fast Path Design

## Problem

The stock page can reach the local API, but its configured market-data chain cannot currently return a first chart:

- `GET /v1/health` succeeds.
- A cold full-universe request succeeds through Eastmoney but took about 8.2 seconds during diagnosis.
- Stock history requests repeatedly return `502 MARKET_DATA_UNAVAILABLE` with `fetch failed`.
- Xueqiu returns `timeout_access_token` (`400013`) for both quote and history requests.
- The Eastmoney historical host closes the socket in the current network/tunnel (`UND_ERR_SOCKET`).
- The configured Tushare token connects successfully but lacks permission for the `daily` API.
- The bundled StockDB example has neither a local `data` directory nor a process listening on port `7899`.

The existing browser retry and IndexedDB cache can preserve a chart only after at least one successful history response. They cannot supply a first chart when every configured upstream fails.

Direct probes of Tencent's K-line response returned Shanghai and Shenzhen stocks and ETFs in roughly 50–250 ms on this machine. It also returned daily, weekly, and monthly periods without a token.

## Goals

- Return a usable first stock or ETF K-line without requiring Xueqiu or Tushare credentials.
- Start the active-symbol history request without waiting for the full stock universe.
- Preserve the existing `/v1/stocks/:market/:code/history` and `/v1/etfs/:market/:code/history` response contracts.
- Support `day`, `week`, and `month` periods and the existing `15d` through `500d` ranges.
- Limit background preload to the active symbol and the current visible window, at most 24 unique symbols.
- Keep existing backend and browser caches and all existing provider fallbacks.
- Add no runtime dependency and expose no credentials.

## Non-goals

- Replace the stock-universe or search source.
- Redesign realtime minute charts, quote streaming, depth, or order-book behavior.
- Execute, redistribute, or automatically download data for the bundled StockDB binaries.
- Add a batch-history endpoint in this change.
- Invent historical rows when Tencent and every fallback return no data.
- Reconstruct old Beijing Stock Exchange identities after a ticker migration. Tencent data for a newly assigned BSE code may begin at the new identity's first available row.

## Architecture

### Tencent provider

Create `server/tencent-provider.js` as a focused adapter with no knowledge of HTTP routes or frontend state. It exports `createTencentProvider(options)` and implements:

- `getHistory({ market, code, period, range })`
- `getEtfHistory({ market, code, period, range })`

The adapter accepts an injectable `fetchImpl`, endpoint, and timeout for deterministic tests. It maps markets to Tencent symbols (`SH` to `sh`, `SZ` to `sz`, and `BJ` to `bj`) and maps the existing periods directly to `day`, `week`, and `month`.

The default endpoint is `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get`. The adapter sends one `param` query value in Tencent's `<symbol>,<period>,,,<count>,qfq` form. The existing range identifiers map exactly to 15, 30, 60, 120, 250, or 500 requested rows. After parsing, the adapter keeps only the latest requested count so an upstream response that includes an extra boundary row cannot expand the API result.

The provider requests forward-adjusted data and reads `qfqday`, `qfqweek`, or `qfqmonth`. Some BSE responses expose only the unadjusted `day`, `week`, or `month` key, so the parser falls back to that key. Each row is normalized from Tencent's `[date, open, close, high, low, volume]` representation into the existing history-item contract. Change amount and percentage are derived from the preceding close when available; unsupported values such as amount remain `0` rather than being fabricated.

The provider returns `source: "tencent"`, `delayed: false`, and an ISO `updatedAt`. It slices the normalized rows to the requested range and rejects a successful HTTP response that contains an upstream error, malformed payload, or no usable rows.

### Provider composition

The existing `xueqiu` configuration remains the public provider identity so deployment configuration does not need to change. Its capabilities are composed as follows:

- Stock universe and stock search: existing Eastmoney implementation.
- Stock history: Tencent first, then Xueqiu, then Eastmoney, followed by Tushare only when the existing Tushare fallback flag is enabled.
- ETF universe, ETF search, and ETF quote: existing Eastmoney implementation.
- ETF history: Tencent first, then Eastmoney.

A valid Tencent result stops the chain immediately, so an expired Xueqiu credential adds no delay to the normal chart path. Provider errors eligible for fallback retain the existing rules: authentication, market-data errors, rate limits, and server failures continue to the next source; caller validation errors do not become successful empty results.

This composition also fixes the current `501` ETF responses in `xueqiu` mode by exposing the ETF methods already implemented by the Eastmoney adapter.

### Frontend active-history path

The stock page determines an active identity from the restored watchlist and otherwise uses `SH:600519`. Entering the page starts these operations independently:

1. Load or revalidate the active symbol's history.
2. Load or revalidate the full stock universe.

`loadRealStockHistory()` no longer refuses a valid market/code merely because `stockApiReady` is false. If a placeholder watchlist object is later replaced by the canonical universe object, its loaded history and history metadata are retained.

The existing browser memory and IndexedDB caches continue to paint retained history immediately and revalidate in the background. A network failure never clears a chart that is already displayed.

### Bounded preload

Background preload collects the active symbol followed by the currently rendered virtual-list window. It removes duplicates and stops at 24 symbols. The existing page-radius expansion, which can select up to 199 symbols, is removed. Preload remains background work and cannot queue ahead of a foreground selection.

## Request flow

1. The browser selects or restores a stock identity.
2. Browser cache is checked and may paint immediately.
3. The history request reaches the existing backend route and backend cache.
4. On a backend miss, Tencent is queried with a short timeout.
5. A valid response is normalized, cached by the existing route cache, and returned without contacting Xueqiu.
6. The browser stores the response in IndexedDB and paints the chart.
7. The full universe may complete before or after the chart and merges without discarding history.
8. Visible-window preload begins only after the foreground path has started.

## Error handling

- Tencent uses a two-second request timeout and one attempt. Existing provider fallback is more useful than retrying the same endpoint inside the adapter.
- Abort and transport failures become structured `MARKET_DATA_TIMEOUT` or `MARKET_DATA_UNAVAILABLE` errors.
- Non-2xx responses, nonzero Tencent response codes, malformed payloads, and empty rows become `MARKET_DATA_UNAVAILABLE` and continue through the provider chain.
- An empty Tencent response is never cached as a successful history.
- If all providers fail, the backend keeps the existing structured error contract. The frontend keeps any retained chart and shows the existing upstream-unavailable warning.
- The adapter never logs request headers, cookies, tokens, or complete internal stack traces in API responses.

## Testing

### Provider tests

- Normalize daily, weekly, and monthly forward-adjusted rows.
- Fall back from `qfq<period>` to the unadjusted period key.
- Map SH, SZ, and BJ symbols correctly.
- Slice results to each requested range.
- Derive change fields from the previous close.
- Reject unsupported markets and periods before network work.
- Reject HTTP failures, timeouts, upstream error codes, malformed payloads, and empty rows with structured errors.

### Composition and route tests

- Use Tencent before Xueqiu for stock history.
- Stop after Tencent succeeds.
- Continue to Xueqiu/Eastmoney when Tencent fails or is empty.
- Expose Eastmoney ETF universe/search/quote methods in `xueqiu` mode.
- Use Tencent first for ETF history and retain the existing route response shape and source headers.

### Frontend tests

- Start active history while the universe is still loading.
- Preserve loaded history when the universe replaces a placeholder.
- Limit background candidates to 24 active/visible symbols.
- Keep stale browser history visible when revalidation fails.

### Verification

- Run the targeted provider, route, and stock-module tests through a red-green cycle.
- Run the complete `node --test tests/*.test.js` suite.
- Restart the local Node API so it loads the new provider module.
- Verify real local requests for `SH:600519`, `SZ:300750`, and `SH:510300` return HTTP `200` with `source: "tencent"` on a cold backend cache.
- Verify the ETF universe no longer returns `501` in the configured `xueqiu` mode.
- Load the page from `http://127.0.0.1:8000`, confirm the active chart request begins before the universe response completes, and confirm a forced refresh does not show the local-API connection error.

## Acceptance criteria

- A cold Tencent history probe completes within two seconds under the current network; the measured target is below 500 ms but is not treated as a hard internet SLA.
- The first active chart does not wait for the full-universe request.
- Stock and ETF history routes return their existing JSON contracts and identify Tencent as the successful source.
- An expired Xueqiu credential does not delay a successful Tencent chart.
- No background preload contains more than 24 unique symbols.
- Existing cached charts survive an upstream failure.
- All automated tests pass and the live local route checks succeed after the API restart.

## Rollout and rollback

The change requires restarting only the Node API on port `8787`; the static web server does not require a restart. The browser should then be force-refreshed once.

Rollback consists of removing Tencent from the composed history order and restoring the previous frontend readiness/preload behavior. The existing API contracts, cache schema, and stored browser data do not need migration.
