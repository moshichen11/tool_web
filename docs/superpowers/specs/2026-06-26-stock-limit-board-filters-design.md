# Stock Limit Board Filters Design

## Goal

Add optional filters to the existing `连板` stock subview so users can hide ST stocks and Growth Enterprise Market stocks from the limit-board candidate set.

## Decisions

- Add two independent filters: `排除ST` and `排除创业板`.
- Both filters are enabled by default.
- The filters apply before quote limit-up candidates are used for history loading and board grouping.
- The UI uses compact buttons in the existing limit-board sidebar, matching the current board-level selector style.
- No localStorage persistence is required in this pass.

## Data Flow

The limit-board candidate flow becomes:

1. Start from `stockUniverse`.
2. Apply `stockPassesLimitBoardFilters(stock)`.
3. Apply `stockLooksLimitUpFromQuote(stock)`.
4. Load missing K-line history only for the remaining candidates.
5. Group matching candidates with `getStockLimitBoardGroups()`.

## Rendering And Interaction

The sidebar shows two filter buttons above board levels:

- `排除ST`
- `排除创业板`

Clicking either button toggles the corresponding state, resets the active board level when needed, refreshes the limit-board panel, and schedules candidate history loading for the newly visible candidate set.

## Testing

Add source and helper tests for:

- Default state excludes ST and Growth Enterprise Market stocks.
- The limit-board universe applies the filters before limit-up candidate loading.
- The limit-board panel renders both filter controls.
- Click handling toggles filters through `toggleStockLimitBoardFilter()`.
