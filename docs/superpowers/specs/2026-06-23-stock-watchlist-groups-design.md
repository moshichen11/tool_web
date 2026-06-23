# Stock Watchlist Groups Design

## Goal

Add grouped watchlists to the existing stock module while preserving the current global watchlist behavior used by quotes, filters, mini charts, and persistence.

## Data Model

- Keep `stockWatchlist` as the unique stock entity list.
- Add `stockWatchGroups` as lightweight membership records:
  - `id`
  - `name`
  - `stockIds`
- Always keep a default group with id `default`.
- Migrate old `glass_nav_stock_watchlist` data into the default group when no group storage exists.
- Store groups in `glass_nav_stock_watchlist_groups`.

## UI

- Daily K stock rows become row-like controls with a trailing `+` button.
- Clicking the row still selects the stock.
- Clicking `+` adds the stock without selecting the row.
- If only the default group exists, add directly to the default group.
- If multiple groups exist, open a modal with group names, counts, and multi-select checkboxes.
- The watchlist page shows group tabs and controls for add, rename, and delete.
- Deleting a non-default group keeps stocks safe by moving orphan memberships to the default group.

## Tests

- Verify legacy watchlist migration creates the default group.
- Verify adding a stock can target multiple groups without duplicates.
- Verify group add, rename, and delete behavior.
- Verify the daily K row renders a trailing add control and the click handler processes it before row selection.
- Verify modal markup supports multi-group selection and confirmation.
