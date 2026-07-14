# Browser Tencent K-line Fast Path Design

## Context and decision

The approved backend composition cannot be applied in the current managed workspace because every create or update under `server/` is denied, while root files, `index.html`, and tests remain writable. Tencent's HTTPS response was rechecked and includes `access-control-allow-origin: *`, so the browser can use the same token-free endpoint directly.

The user selected the browser-direct option. This revision supersedes only the provider-composition and route-verification sections of `2026-07-13-tencent-kline-fast-path-design.md`. The Tencent normalization contract, early active-chart work, and 24-symbol preload bound remain unchanged.

## Goals

- Render the first stock K-line without depending on the local or hosted `/v1` API.
- Load ETF history directly once the existing ETF universe supplies an ETF identity.
- Use the existing backend history route as a fallback when direct Tencent loading fails.
- Start active history independently of the full stock-universe request.
- Retain loaded history when the universe replaces a placeholder object.
- Keep background history loading to at most 24 unique active or visible symbols.
- Avoid showing the local-API connection error as a fatal chart error after direct history succeeds.
- Add no runtime dependency and expose no credential.

## Non-goals

- Replace the backend source for stock universe, search, quotes, depth, or synchronization.
- Modify files under the currently read-only `server/` directory.
- Remove existing backend or IndexedDB fallbacks.
- Add minute-level Tencent data or redesign the chart UI.
- Fabricate missing history.

## Architecture

### Shared Tencent adapter

Keep the focused adapter at `tencent-provider.mjs`, an explicit ESM location that is writable and can be imported by both Node tests and the browser. Make environment lookup browser-safe by using optional `globalThis.process` access. Do not send forbidden browser request headers such as `user-agent` or `referer`; the endpoint works without them.

The adapter continues to expose `createTencentProvider(options)` with `getHistory()` and `getEtfHistory()`, a two-second timeout, range validation, `qfq<period>` with raw-period fallback, and the existing normalized history response.

### Browser loader

`index.html` lazily imports `./tencent-provider.mjs` once and caches the resulting provider promise. A single helper accepts the existing backend path plus `{ market, code, period, range, type }`:

1. Load history directly from Tencent.
2. On success, return the normalized response and asynchronously write it through the existing IndexedDB history-cache functions under the same request cache key.
3. On import, timeout, CORS, payload, or transport failure, call the existing `fetchStockApi(path)` unchanged.
4. If both direct and backend paths fail, preserve the current structured UI error mapping.

Both `loadRealStockHistory()` and `loadRealEtfHistory()` use this helper. Their existing in-flight maps and per-object history load keys continue to deduplicate requests. ETF-universe loading remains a backend responsibility; this revision does not invent a static ETF catalog.

### Startup and state merge

The stock startup path selects the restored active watchlist identity, falling back to the first default code. It starts active history and full-universe loading independently. The active history completion renders the chart immediately rather than waiting for the universe.

The universe load during startup does not emit an eager fatal toast. After both operations settle:

- Universe success keeps the existing live status.
- Direct history success plus universe failure keeps the chart visible and presents a nonfatal chart-available state.
- Failure of both paths keeps the existing connection/upstream error.

When canonical universe objects arrive, a focused merge copies `dailyK`, compact history, and history-load metadata from the placeholder without overwriting canonical quote, name, or industry fields.

### Bounded preload

Replace the page-radius expansion with the active stock plus the current virtual-list window. Deduplicate by market and code and stop at `STOCK_DAILY_VIRTUAL_COUNT + STOCK_DAILY_VIRTUAL_BUFFER`, currently 24.

## Error and cache behavior

- Direct Tencent uses one attempt and a two-second timeout before backend fallback.
- Direct failures remain internal when the backend fallback succeeds.
- A successful direct response is stored in the existing browser history cache, so later backend failure can still reuse retained rows.
- A failed refresh never clears already loaded `dailyK` data.
- The full-universe error cannot replace a successful chart with the local-API connection error.
- Empty or malformed Tencent history is not treated as success.

## Testing

- Provider tests prove browser-safe construction, allowed headers, normalization, timeout, malformed response, and range limits.
- Frontend helper tests prove direct success avoids the backend, stores cache, and direct failure invokes the backend exactly once.
- Stock and ETF loader tests prove they use the fast helper and retain existing load metadata behavior.
- Startup tests prove active history begins before universe completion and placeholder history survives canonical replacement.
- Preload tests prove no more than 24 unique active or visible symbols are returned.
- The abandoned backend-composition tests are removed because this approved revision does not modify backend routes.
- Full regression remains `node --test tests/*.test.js`.

## Live verification

- Serve the project from `http://127.0.0.1:8000` so dynamic ESM import is same-origin.
- With the API on port `8787` stopped or unreachable, force-refresh the stock page.
- Confirm `tencent-provider.mjs` loads, the Tencent `fqkline` request returns rows, and the first chart renders.
- Confirm the universe may show a nonfatal unavailable state but does not erase or replace the chart.
- With an ETF identity supplied by the existing ETF universe, confirm its direct history request reports normalized `source: "tencent"` in diagnostic tests.

## Acceptance criteria

- The first stock chart renders through Tencent while `/v1` is unavailable.
- Direct Tencent failure still falls back to the unchanged backend request.
- A cold direct request completes within two seconds under the current network; the measured target remains below 500 ms.
- Stock history works without an API connection; stock and ETF history share the same normalized adapter when their identities are available.
- The first chart does not wait for the full universe.
- Preload contains at most 24 unique symbols.
- All automated tests pass with no production dependency added.

## Rollback

Rollback removes the lazy Tencent import and restores both history loaders to `fetchStockApi`/`fetchEtfApi`. No API contract, IndexedDB schema, or stored data migration is required.
