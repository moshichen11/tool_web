# Stock Limit Board Design

## Goal

Add a full-market latest-trading-day limit-board view to the stock module. The view should show which stocks are on the first board, second board, third board, and every higher consecutive limit-up level through the current highest board. Selecting a stock must show its daily K chart.

## Decisions

- Scope is the full A-share stock universe, not only the current visible page or watchlist.
- The view only calculates the latest trading day. Historical date replay is out of scope.
- The recommended UI is a dedicated `limit-board` stock subview, exposed beside the existing `daily`, `watchlist`, and `filter` subviews.
- The right-side chart should reuse the existing daily K chart, quote panel, range controls, and history loader instead of creating a second chart implementation.

## User Experience

The stock page gains a `连板` tab.

The left side of the view is a compact limit-board browser:

- A status row shows the latest evaluated trading day and history loading progress, for example `最新交易日 · K线补齐中 320/5200`.
- A board-level selector shows only levels with matches: `1板 28只`, `2板 7只`, `3板 2只`, up to the current highest level.
- The default selected level is the highest board when available. If there are no limit-up stocks, the view shows an empty state.
- The stock list for the selected level shows name, code, change percent, industry, consecutive board count, one-line-board marker, and volume ratio.
- Clicking a stock selects it and updates the right-side daily K chart.
- Each row keeps the existing add-to-watchlist action.

The right side is the existing daily K experience:

- Quote summary.
- Day/week/month chart controls.
- Daily K canvas and scrollbar.
- Existing depth panel if available.

## Data Model

Add lightweight front-end state:

- `activeStockView = "limit-board"` as a new stock subview.
- `activeStockLimitBoardLevel`, defaulting to the highest available level.
- Reuse `activeDailyStockId` for the selected stock so the limit-board view and daily K view share one chart selection state.
- `stockLimitBoardHistoryLoading`, `stockLimitBoardHistoryLoaded`, and `stockLimitBoardHistoryTarget` for full-market K-line progress.

No localStorage persistence is required for the selected board level in the first pass. It can reset to the highest current board on entry.

## Calculation Rule

For each stock in `stockUniverse`:

1. Load or reuse daily K data through the existing `loadRealStockHistory()` path.
2. Use `getStockKLineSeries(stock)` as the canonical daily series source.
3. Use the existing board-aware limit-up threshold logic:
   - ST threshold from `limit_up_threshold_st`.
   - Beijing Stock Exchange threshold from `limit_up_threshold_bj`.
   - Growth-board threshold from `limit_up_threshold_growth`.
   - Main-board threshold from `limit_up_threshold_main`.
4. A stock is included only when the latest daily bar is limit-up.
5. The board level is `getStockConsecutiveLimitCount(stock)`.
6. `1板` means latest bar is limit-up and the previous daily bar is not limit-up.
7. `2板+` means the latest bar and immediately preceding bars are consecutively limit-up.
8. One-line board status comes from `isStockOneLineLimitUpBar(stock, latest, previous)`.

The grouping output is a sorted list of groups:

- `level`
- `label`
- `items`
- `count`

Group sort is ascending by level for the selector, and the selected level defaults to the highest available board. Items inside one level sort by change percent, volume ratio, and market cap when available.

## Data Loading Flow

The full-market view must not block the whole stock page.

1. When entering the `limit-board` view, calculate groups from stocks that already have usable daily K data.
2. Start a background history-fill job for all `stockUniverse` items that do not have current-range daily K data.
3. Load in small batches using the existing `loadRealStockHistory(stock, { foreground: false })` behavior.
4. Update only the limit-board panel while progress changes; avoid rerendering the whole app shell.
5. If the selected stock's history finishes loading, redraw the chart.
6. Reuse existing in-flight request de-duplication from `stockHistoryLoads`.

The implementation should cap each batch so regular chart clicks and quote refreshes remain responsive.

## Rendering Boundaries

Add new render helpers inside `index.html` following existing patterns:

- `getStockLimitBoardGroups()`
- `getActiveStockLimitBoardGroup()`
- `scheduleStockLimitBoardHistoryLoad()`
- `loadStockLimitBoardHistories()`
- `renderStockLimitBoardView()`
- `renderStockLimitBoardLevels()`
- `renderStockLimitBoardList()`

`renderStockActiveView()` will route `activeStockView === "limit-board"` to the new view.

The new view should reuse:

- `renderStockDailyQuote(stock)`
- `renderStockDailyPeriods()`
- `renderStockDailyRanges()`
- `renderStockDailyScrollbar()`
- `renderStockDailyDepth(stock)`
- `drawStockDailyCanvas()`
- `loadRealStockHistory(stock)`
- `getStockTechnicalSignals(stock)`

## Error Handling

- If the backend or provider cannot return history, show the existing data-source status plus a limit-board message that some stocks could not be evaluated.
- Stocks without sufficient daily K data are excluded until their data is available.
- If no full-market stocks are loaded yet, show the stock API loading state and do not fabricate local results.
- Unknown board types should continue through the existing threshold fallback rather than being hard-coded in the new feature.

## Accessibility And Interaction

- Board-level selectors are buttons with `aria-pressed`.
- Stock rows are keyboard-selectable with Enter and Space, matching existing daily-list behavior.
- Add-to-watchlist buttons must process before row selection, as in the existing daily view.
- The list should keep stable row height so progress updates and active-row changes do not shift the layout.

## Testing

Use the existing `node --test tests/stocks-module.test.js` extraction style.

Required tests:

- `getStockLimitBoardGroups()` places a first-board stock in level 1.
- A two-board stock is placed in level 2.
- Highest-board selection defaults to the highest available group.
- Non-limit-up stocks are excluded.
- One-line board marker is exposed for list rendering.
- Entering the `limit-board` view schedules background history loading for missing daily K data.
- Rendering includes the `连板` tab and reuses the daily K chart selectors.
- Clicking a limit-board row selects the stock and triggers history load/chart update.

## Acceptance Criteria

- The stock module has a visible `连板` subview.
- The view shows latest-trading-day groups from `1板` through the current highest board.
- The calculation uses existing daily K data and board-aware limit-up thresholds.
- The view works against the full loaded stock universe and progressively improves while K-line history fills in.
- Selecting any listed stock shows its daily K chart.
- Existing daily, watchlist, filter, quote refresh, and add-to-watchlist behavior continue to work.
