# Stock Chart Fast Path Design

## Goal

Make the first stock chart and repeated chart selections feel immediate without changing the configured market-data providers or adding paid infrastructure.

The active chart must no longer wait for the full stock universe. The current nearby-page preload of up to 199 symbols must become one bounded visible-window batch, and cached history must remain usable while it refreshes in the background.

## Selected Approach

Use the approved hybrid fast path (option B):

- Prioritize the active symbol independently from universe loading.
- Cache the universe and chart histories in IndexedDB, with an in-memory fallback.
- Add a backend batch-history endpoint with per-symbol cache reuse, request coalescing, and provider concurrency limited to four.
- Keep stale cached charts visible while revalidation is in progress or an upstream provider is unavailable.

This was selected over a frontend-only preload reduction, which would not improve repeat visits, and direct `free-stockdb` integration, which is deferred because the bundled binaries are Windows-specific, unsigned, and have no clear redistribution license.

## Scope

In scope:

- Daily, weekly, and monthly stock histories used by current charts and mini charts.
- The existing stock-universe response.
- A new batch-history REST endpoint for background preload.
- Frontend memory and IndexedDB caches.
- Backend in-flight request coalescing and market-aware history TTLs.
- Existing Xueqiu, Eastmoney, and optional Tushare provider behavior.

Out of scope:

- Direct `free-stockdb` executable or `.pyd` integration.
- Provider replacement, credential changes, or fabricated data.
- True intraday/minute data redesign, order-book changes, or quote-refresh changes.
- Paid infrastructure, new databases, Redis, or Render plan changes.
- Chart-library replacement, visual redesign, or full TypeScript migration.

## Performance Targets

- Paint a cached chart from memory or IndexedDB without awaiting the network.
- Start initial active history independently of the full-universe request.
- Preload at most the current 18 virtual rows plus the existing 6-row buffer: 24 unique symbols.
- Use one browser batch request instead of up to 199 single-history requests.
- Run no more than four provider history operations concurrently per batch.
- Share one provider promise among simultaneous requests for the same history key.

These are behavioral targets. Exact latency still depends on the provider and whether the Render service is awake.

## Frontend Cache

Add a small cache adapter within the existing stock module with these operations:

- `readStockUniverseCache()`
- `writeStockUniverseCache(response)`
- `readStockHistoryCache(loadKey)`
- `writeStockHistoryCache(loadKey, response)`
- `pruneStockCacheEntries()`

Use IndexedDB database `tool_web_stock_cache`, schema version `1`, with two stores:

- `universe`, keyed by universe request identity.
- `history`, keyed by the existing `MARKETCODE:period:range` load key.

Each record stores `value`, `cachedAt`, `freshUntil`, and `retainUntil`. An entry can remain available for stale-first rendering after `freshUntil`; pruning removes it only after `retainUntil`. Retain universe records for up to 7 days and history records for up to 30 days. History values retain `items`, `source`, `delayed`, and `updatedAt`. If IndexedDB is missing, blocked, or fails, use memory maps. Cache failure must never block network loading or rendering.

### Universe Loading

`loadRealStockUniverse()` uses stale-while-revalidate:

1. Read cached universe data.
2. Normalize and render cached data immediately, even when stale.
3. Start one backend revalidation unless the same request is already in flight.
4. Replace memory and IndexedDB data on success.
5. Keep cached data and show a warning on failure.

Universe data is fresh for 30 minutes but remains usable when stale.

### Active Chart Fast Path

The first active identity is the first restored watchlist identity, falling back to `SH:600519`.

Initialization starts active history and universe loading independently. A valid market/code history request must not require `stockApiReady`. When the universe replaces a placeholder, existing history arrays and load metadata are merged into the canonical stock object.

Selecting another stock continues to use the foreground single-history route. Foreground requests are never queued behind background batches.

### History Loading

`loadRealStockHistory()` reads in this order:

1. Fresh in-memory history attached to the stock.
2. An existing promise for the same load key.
3. IndexedDB history, painted immediately when present.
4. Single-history network revalidation when cache is stale or absent.

Stale IndexedDB history counts as a successful display result but still triggers background revalidation. A refresh error leaves the stale series attached.

## Visible-Window Preload

Replace nearby-page selection with the active symbol followed by the current virtual window only.

- Cap candidates at 24 unique symbols.
- Remove page-radius constants and the sequential single-history loop.
- Exclude histories already fresh or in flight.
- Start through `requestIdleCallback` when available, after the active history path starts.
- Use a generation token so results for an obsolete period, range, sort, filter, or scroll window cannot update the current view.

The frontend may abort an obsolete batch HTTP request. Provider work already started on the backend does not need cancellation, but obsolete results must be ignored.

## Cache Freshness

Use Asia/Shanghai market time:

- On weekdays from 09:15 through 15:10, daily/weekly/monthly history is fresh for 60 seconds.
- Outside that window, history remains fresh until the next weekday at 09:15.
- Cached data may always render stale-first; freshness only decides whether revalidation is needed.
- Weekend days are skipped for the next refresh boundary.
- Exchange holidays are not modeled in this phase. A holiday weekday can cause harmless revalidation, while stale charts remain visible.

The backend applies the same policy after successful history responses. Errors are never cached as successful history. Market-time calculations receive an injectable clock through route context so tests do not depend on host timezone or wall-clock time.

## Batch History API

Add `POST /v1/stocks/history/batch`.

Request:

```json
{
  "symbols": [
    { "market": "SH", "code": "600519" },
    { "market": "SZ", "code": "000001" }
  ],
  "period": "day",
  "range": "60d"
}
```

Validation:

- Accept 1 through 24 symbols.
- Remove duplicates while preserving first-seen order.
- Require market `SH`, `SZ`, or `BJ` and a six-digit numeric code.
- Accept period `day`, `week`, or `month`.
- Accept range `15d`, `30d`, `60d`, `120d`, `250d`, or `500d`.
- Return `400 VALIDATION_FAILED` before provider work for an invalid request.

A valid request returns HTTP `200`, including partial failures:

```json
{
  "period": "day",
  "range": "60d",
  "results": [
    {
      "market": "SH",
      "code": "600519",
      "status": "fulfilled",
      "items": [],
      "source": "eastmoney",
      "cached": false,
      "updatedAt": "2026-07-13T00:00:00.000Z"
    },
    {
      "market": "SZ",
      "code": "000001",
      "status": "rejected",
      "error": {
        "code": "MARKET_DATA_UNAVAILABLE",
        "message": "Market data provider failed"
      }
    }
  ]
}
```

Per-symbol errors must not include credentials, stack traces, or internal URLs.

### Shared Backend Cache Path

Extract the single-history cache operation into a helper used by both routes. It:

- Uses the existing history cache key.
- Returns cache metadata with the value.
- Keeps one pending promise per key to coalesce concurrent callers.
- Removes failed pending promises immediately so later calls can retry.
- Applies market-aware TTL only after success.

The existing single-history body and `x-cache` header remain compatible.

The batch route uses a four-worker pool instead of `Promise.all()` across all 24 symbols. This leaves capacity for foreground requests and stays below provider limits.

## Data Flow

### Initial Load

1. Restore watchlist identities.
2. Select the first restored identity or `SH:600519`.
3. Start active history cache lookup and revalidation.
4. Start universe cache lookup and revalidation independently.
5. Paint whichever cached data is available first.
6. Merge network results without discarding loaded history.
7. Schedule visible-window preload after the active path starts.

### Selection

1. Update active identity and chart loading state.
2. Paint memory or IndexedDB history immediately.
3. Start foreground revalidation when required.
4. Redraw only if the returned key still matches the active symbol, period, and range.

### Background Preload

1. Collect active and visible symbols, capped at 24.
2. Remove fresh and already-loading histories.
3. Send one batch request for the remainder.
4. Store fulfilled results in memory and IndexedDB.
5. Record failures per symbol without making them permanent.
6. Redraw only canvases belonging to the current generation.

## Error Handling

- Cached data survives universe and history revalidation failures.
- A non-blocking delayed-data warning appears when stale history remains after refresh failure.
- One batch-symbol failure does not reject the batch.
- Invalid batch input fails before provider requests.
- IndexedDB failure falls back to memory and network behavior.
- Empty successful history is cached only for its freshness window, not permanently for the session.
- Foreground requests can retry a previous background failure.

## Observability

Preserve `x-data-source` and `x-cache` for single-history responses. Record batch counts for requested, fulfilled, rejected, cache-hit, and coalesced symbols plus total duration. Do not log credentials or history payloads.

## Testing

Use the existing Node `node:test` and static frontend contract patterns.

Backend coverage:

- Reject zero, over-24, and malformed symbol lists.
- Preserve first-seen order while deduplicating.
- Enforce no more than four concurrent provider calls.
- Return fulfilled and rejected results together with HTTP `200`.
- Reuse one cache entry across single and batch routes.
- Coalesce concurrent calls for the same key.
- Remove failed promises and allow retry.
- Verify 60-second market-hour TTL and after-hours next-weekday TTL.
- Preserve the existing single-history contract and headers.

Frontend coverage:

- Active history is not sequenced behind universe loading.
- Valid identities load before `stockApiReady`.
- Placeholder merging preserves history.
- IndexedDB history renders before revalidation completes.
- IndexedDB failure falls back safely.
- Visible candidates are capped at 24 and page-radius preload is removed.
- One batch request replaces the sequential loop.
- Obsolete batch results are ignored after state changes.
- Stale history stays visible after refresh failure.

Regression verification includes existing provider, route, contract, filter, limit-board, ETF, mobile, and watchlist tests. No mock data enters production paths.

## Rollout

Implement in three testable steps:

1. Backend shared cache helper and batch endpoint.
2. Frontend IndexedDB cache and active-history fast path.
3. Visible-window batch preload and stale-data UI state.

The endpoint is additive. The frontend falls back to bounded single-history requests only when an older deployed backend returns `404` or `501` for the batch route; provider-level partial failures do not trigger a second wave of fallback requests.

## Acceptance Criteria

- Active history no longer waits for universe completion.
- Cached universe and history render before network revalidation.
- Preload is limited to 24 visible-window symbols.
- Preload uses one batch HTTP request with backend concurrency four.
- Provider work is coalesced per history key.
- Daily/weekly/monthly history is fresh for 60 seconds in market hours and until the next weekday session outside them.
- Stale charts remain usable during provider failures.
- Existing single-history clients and stock-module behavior remain compatible.
- No new runtime dependency or paid infrastructure is introduced.
