# Stock Data Source Audit

Current production path:

- Frontend `index.html` calls only the local backend API base URL (`/v1/stocks/search`, `/v1/quotes`, `/v1/stocks/{market}/{code}/history`).
- Backend `server/mock-server.js` creates a `StockDataProvider` through `server/stock-data-provider.js`.
- Default provider is `xueqiu`; credentials are read only from `XUEQIU_COOKIE` or `XUEQIU_TOKEN`.
- Xueqiu HTTP calls live in `server/xueqiu-provider.js`; credentials are sent only in request headers and are not logged.

Isolated non-production paths:

- `server/mock-data.js` and the `mock-a-share` provider remain for explicit test/demo use only.
- `tests/mock-server.test.js` opts into `dataSource: "mock-a-share"`.
- `server/eastmoney-provider.js` and `server/tushare-provider.js` remain explicit opt-in providers for tests or manual configuration.

Removed production fake-data paths:

- `index.html` no longer contains hardcoded stock quote arrays or generated mock stock universe expansion.
- Frontend refresh no longer mutates prices locally.
- API errors or missing Xueqiu credentials set an error state; the app does not fall back to fake quotes.
