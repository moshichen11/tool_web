# Stock Real-Time ETF Design

## Goal

Add a real-time ETF feature to the existing stock module so users can browse ETF instruments by industry or theme, see live quote fields, and open the same minute/day K chart experience used for stocks.

The feature must use provider-supplied ETF data. It must not ship a hard-coded ETF symbol list as the primary data source.

## Decisions

- Add a dedicated stock subview named `etf`, labelled `行业ETF`.
- Treat ETF as a separate instrument type, not as normal stock rows inside `stockUniverse`.
- ETF quote and history data comes from the backend market-data provider layer.
- The first implementation adds ETF-specific REST endpoints and provider methods instead of overloading `/v1/stocks/*`.
- The ETF view reuses the current daily K chart, quote panel formatting, price color convention, and add/open actions where the fields are compatible.
- ETF instruments are excluded from `filter`, `limit-board`, and stock strategy calculations.
- ETF watchlist persistence is out of scope for the first pass unless the instrument can be represented by the existing watchlist identity without breaking stock behavior.

## Non-Goals

- No static curated ETF list as the main data source.
- No portfolio, position, or trading workflow.
- No ETF constituent holdings view.
- No historical replay of ETF categories.
- No change to existing stock default view, stock filters, limit-board logic, or stock refresh cadence.

## User Experience

The stock page gains a new `行业ETF` tab beside the existing `daily`, `watchlist`, `filter`, and `limit-board` tabs.

The ETF view has two main areas:

- Left side: ETF browser grouped by provider category, industry, or deterministic theme classification.
- Right side: selected ETF quote summary and K chart.

The ETF browser supports:

- Search by ETF code, name, market, category, or theme.
- Category chips for common groups such as `宽基`, `证券`, `银行`, `医药`, `半导体`, `新能源`, `消费`, `军工`, `红利`, and `其他`.
- Sorting by name, code, change percent, volume, and amount.
- Stable row height and keyboard selection like the existing daily stock list.

When the provider supplies a category or fund type, that value is used first. If it does not, the frontend may classify visible ETF names into broad themes with a deterministic keyword map. This classification is only for grouping returned provider data; it is not a substitute for the provider ETF universe.

Selecting an ETF:

- Sets `activeEtfId`.
- Loads quote and history through ETF endpoints.
- Renders the right-side K chart using the selected ETF history.
- Does not change `activeDailyStockId`.

## Data Model

Add a contract separate from `StockSummary`:

- `EtfIdentity`: `market`, `code`, `type: "etf"`.
- `EtfSummary`: identity plus `id`, `name`, `category`, `theme`, `fundType`, `price`, `changePercent`, `changeAmount`, `volume`, `amount`, `detailUrl`, `delayed`, `source`, and `updatedAt`.
- `EtfQuote`: `EtfSummary` plus `open`, `high`, `low`, `previousClose`, `direction`, and `colorRole`.
- `EtfHistoryResponse`: identity, period, range, K-line or minute items, source, delayed, and updatedAt.

ETF IDs should use a distinct namespace such as `ETF:SH:510300` or an explicit `instrumentType` field so stock IDs and ETF IDs cannot collide.

Add front-end state:

- `activeStockView = "etf"`.
- `etfUniverse = []`.
- `etfUniverseTotal = 0`.
- `activeEtfId = ""`.
- `activeEtfCategory = "all"`.
- `etfSearchTerm = ""`.
- `etfSort = "amount"`.
- `etfApiStatus`, `etfApiErrorMessage`, and `etfDataSource`.

No localStorage persistence is required in the first pass.

## API Contract

Add endpoints under `/v1/etfs`:

- `GET /v1/etfs/universe?market=&category=&limit=&offset=`
- `GET /v1/etfs/search?q=&market=&limit=`
- `GET /v1/etfs/{market}/{code}/quote`
- `GET /v1/etfs/{market}/{code}/history?period=&range=`

The response shape mirrors existing stock quote/history contracts where possible, but schema names remain ETF-specific.

Errors follow the existing stock API error contract:

- `VALIDATION_FAILED` for bad query params.
- `NOT_FOUND` for unknown ETF identities.
- `MARKET_DATA_UNAVAILABLE` when the configured provider cannot serve ETF data.
- `AUTH_REQUIRED` or `MARKET_DATA_UNLICENSED` when the provider requires credentials or lacks permission.
- `RATE_LIMITED` when provider or local rate limits are hit.

## Provider Design

Extend the provider interface with optional ETF methods:

- `getEtfUniverse(query)`
- `searchEtfs(query)`
- `getEtfQuote(identity)`
- `getEtfHistory(request)`

Routing checks method presence. Missing methods return `501 MARKET_DATA_UNAVAILABLE` with `x-data-source` set to the configured provider id.

Provider implementations:

- `xueqiu`: use the same authenticated fetch, symbol normalization, quote batch, and K-line request style as stocks when ETF symbols are supported by the upstream responses.
- `eastmoney`: add ETF universe, quote, and K-line mapping through the existing Eastmoney fetch helper and secid conversion where supported.
- `tushare`: add ETF universe and daily history only when the configured token supports the required fund endpoints.
- `mock-a-share`: may include a tiny ETF fixture only for tests and local demo when mock data is explicitly enabled.

Provider mapping must normalize ETF symbols into the same market labels used by stocks: `SH`, `SZ`, and `BJ` when applicable.

## Frontend Rendering

Add helpers inside `index.html` following current stock-module style:

- `loadRealEtfUniverse()`
- `searchEtfs()`
- `loadRealEtfQuote()`
- `loadRealEtfHistory()`
- `getEtfCategories()`
- `getFilteredEtfs()`
- `getActiveEtf()`
- `renderStockEtfView()`
- `renderStockEtfFilters()`
- `renderStockEtfList()`
- `renderStockEtfQuote()`

`stockViews` gains `{ id: "etf", name: "行业ETF", ... }`.

`renderStockActiveView()` routes `activeStockView === "etf"` to `renderStockEtfView()`.

The right-side chart can reuse the drawing pipeline if ETF K-line items are shaped like current stock K-line items. If the shared chart functions require stock-specific fields, the implementation should add a minimal adapter instead of copying chart code.

## Data Flow

Entering the ETF view:

1. Render ETF shell with loading state.
2. Call `loadRealEtfUniverse()` if ETF data is not loaded.
3. Store normalized ETF summaries in `etfUniverse`.
4. Pick the first visible ETF as `activeEtfId` when no selected ETF exists.
5. Load the selected ETF quote/history.
6. Draw the ETF K chart.

Refreshing data:

1. Refresh selected ETF quote and visible ETF list quotes when the view is active.
2. Patch list quote cells where possible.
3. Redraw the ETF chart only when selected ETF history or range changes.

ETF refresh must not trigger stock strategy history loading or limit-board history loading.

## Error Handling

- If ETF universe loading fails and no ETF data exists, show an ETF-specific empty/error card.
- If ETF quote loading fails but universe data exists, keep the list visible and show a warning on the selected ETF panel.
- If ETF history loading fails, keep quote data visible and show a chart empty state.
- If the provider has no ETF support, show a clear provider capability message instead of showing fake ETF rows.
- Existing stock data status remains independent from ETF data status.

## Accessibility And Layout

- ETF category controls use buttons with `aria-pressed`.
- ETF rows are keyboard-selectable with Enter and Space.
- ETF list uses fixed row height and responsive overflow rules compatible with the current `.stock-daily-layout`.
- Mobile tabs expose `行业ETF` through the same `[data-stock-view]` mechanism.
- On small screens, the ETF list appears above the chart, matching the daily and limit-board responsive pattern.

## Testing

Use the existing Node test style.

Backend tests:

- ETF routes return `501 MARKET_DATA_UNAVAILABLE` when provider ETF methods are absent.
- ETF universe route maps provider results into ETF contract fields.
- ETF quote route returns `NOT_FOUND` for missing ETF.
- ETF history route reuses the stock history error and cache behavior where applicable.
- Mock provider ETF fixtures are only enabled in explicit mock/test mode.

Frontend tests:

- `stockViews` registers `id: "etf"` and label `行业ETF`.
- `renderStockActiveView()` routes ETF view to `renderStockEtfView()`.
- ETF view renders category filters, search, list rows, selected quote, and `data-stock-daily-chart`.
- ETF list rows use ETF-specific data attributes and do not use `[data-stock-filter-row]` or `[data-stock-limit-board-row]`.
- ETF selection updates `activeEtfId` without changing `activeDailyStockId`.
- ETF data is excluded from condition screener and limit-board helper inputs.

## Acceptance Criteria

- The stock module has a visible `行业ETF` subview.
- ETF data is loaded from the backend provider layer, not from a hard-coded ETF list.
- Users can browse ETFs by industry/theme, search them, sort them, and select one.
- Selecting an ETF displays live quote fields and K-line history when the provider supports them.
- Provider capability errors are visible and do not fabricate ETF data.
- Existing stock daily, watchlist, filter, limit-board, and quote behavior continue to work.
