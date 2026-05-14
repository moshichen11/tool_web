# Stocks Feature File Tree

目标：把当前 `index.html` 内的股市模块拆成可维护的 feature 边界，同时保留原型 DOM 语义、视觉令牌、交互行为和 localStorage 兼容性。

## 当前文件树

```text
tool_web/
  index.html
    CSS
      :root design tokens
      .glass dark glass shell
      /* Stock Module Styles */
    JavaScript
      defaultFeatures includes { id: "stocks" }
      stock constants and mock data
      stock storage/load/save logic
      stock render functions
      stock event delegation
      stock canvas rendering and interactions
  tests/
    stocks-module.test.js
    mobile-layout.test.js
    memory-game.test.js
    schulte-game.test.js
```

## 目标 feature 文件树

```text
tool_web/
  src/
    stocks/
      contracts.ts
      tokens.ts
      storage.ts
      state-machine.ts
      selectors.ts
      mock-data.ts
      api-client.ts
      mappers.ts
      patch-dom.ts
      feature.ts
      views/
        daily-view.ts
        watchlist-view.ts
        filter-view.ts
        search-view.ts
      chart/
        daily-chart.ts
        mini-chart.ts
        chart-interactions.ts
        viewport.ts
      tests/
        contracts.test.ts
        state-machine.test.ts
        mappers.test.ts
        patch-dom.test.ts
  docs/
    stocks/
      feature-file-tree.md
      state-machine-data-flow.md
    openapi/
      stocks.openapi.yaml
  server/
    package.json
    mock-server.js
    routes.js
    tushare-provider.js
    mock-data.js
    sse.js
    sync.js
    audit.js
    rate-limit.js
  tests/
    mock-server.test.js
    stocks-module.test.js
```

## 文件职责

| 文件 | 职责 | 保留约束 |
| --- | --- | --- |
| `src/stocks/contracts.ts` | TypeScript 数据模型、事件、API、DOM patch、存储 schema | 保留 `glass_nav_stock_*` key、A股红涨绿跌、局部 patch 语义 |
| `src/stocks/tokens.ts` | stock 视觉令牌声明和默认值 | 保留 `--glass` 等原型 token，新增/固定 `--stock-up` 红、`--stock-down` 绿 |
| `src/stocks/storage.ts` | localStorage 读写和旧数据迁移 | 兼容当前 `glass_nav_stock_watchlist` 的数组结构 |
| `src/stocks/state-machine.ts` | 纯状态转移，不直接操作 DOM | 保留 `daily` 默认视图和 `daily/watchlist/filter` 子视图 |
| `src/stocks/selectors.ts` | 统一维护现有 DOM selector 和 data 属性 | 不改 `[data-stock-*]`、`#stockSearchInput`、`#stockDailyTooltip` |
| `src/stocks/mock-data.ts` | 当前 mock 行情、技术指标、盘口数据生成 | API 不可用时继续 fallback |
| `src/stocks/api-client.ts` | OpenAPI 对应的 HTTP client | 行情源密钥只在后端，不进浏览器 |
| `src/stocks/mappers.ts` | API 响应到现有 view model 的映射 | 保证 `stockUniverse` / `stockWatchlist` 视图字段稳定 |
| `src/stocks/patch-dom.ts` | 局部 DOM patch，更新价格、涨跌、计数和 quick cards | 刷新 tick 不允许整页 `renderStockPage()` |
| `src/stocks/feature.ts` | feature 入口，连接 shell、状态机、API、渲染和事件 | 保留 `renderStockSideList()` / `renderStockPage()` 等行为边界 |
| `views/daily-view.ts` | 分时/日K视图 HTML | 保留 Ctrl+滚轮缩放、pinch、拖拽平移、tooltip |
| `views/watchlist-view.ts` | 自选股视图 HTML | 保留添加、删除、拖拽排序、键盘展开 |
| `views/filter-view.ts` | 条件选股视图 HTML | 保留标签、策略、排序、分页、行展开 |
| `views/search-view.ts` | 搜索表单和浮层结果 | 保留提交打开详情，不自动加入自选 |
| `chart/daily-chart.ts` | K线、MA、成交量、MACD canvas 绘制 | 使用 `--stock-up`/`--stock-down`，A股红涨绿跌 |
| `chart/mini-chart.ts` | 表格内迷你图 | 同主图颜色语义 |
| `chart/chart-interactions.ts` | wheel、pointer、pinch 事件处理 | 保留 Ctrl+滚轮 zoom 和双指 pinch |
| `chart/viewport.ts` | K线 viewport 和虚拟列表窗口计算 | 保留虚拟滚动和 overscan |
| `docs/openapi/stocks.openapi.yaml` | OpenAPI 3.1 契约 | 与 `contracts.ts` 字段同名同义 |
| `server/mock-server.js` | 本地联调 mock server 入口，暴露 REST + SSE | 仅 local-dev/test/demo；生产必须换授权行情源 |
| `server/routes.js` | OpenAPI 对应路由、错误码、分页、缓存响应头 | 不绕过契约字段，不做网页抓取 |
| `server/tushare-provider.js` | Tushare Pro HTTP provider，调用 `stock_basic`、`daily/weekly/monthly` 并映射到 `/v1/*` 契约 | token 只读服务端 env；未授权返回 `MARKET_DATA_UNLICENSED` |
| `server/mock-data.js` | A股 mock 行情、K线、盘口、行情变动生成 | A股红涨绿跌，`source=mock-a-share` |
| `server/sse.js` | `text/event-stream` 报价流和局部 patch 事件 | `patchOnly: true`，断线由前端 polling fallback |
| `server/sync.js` | localStorage 到云同步冲突模拟 | 支持 `local-wins`、`cloud-wins`、`merge/manual` 决策边界 |
| `server/audit.js` | 内存审计事件存储和分页查询 | 覆盖搜索、行情、同步、限流、流连接 |
| `server/rate-limit.js` | 内存速率限制 | 返回 `RATE_LIMITED` 与标准 rate-limit headers |

## 渐进迁移顺序

1. 保留 `index.html` 运行代码，先落地 `contracts.ts`、OpenAPI 和文档。
2. 抽出纯数据模型和 mapper，不碰 DOM。
3. 抽出 API client，并让当前 mock 数据作为 fallback。
4. 抽出 patch-dom，保护报价刷新只局部更新。
5. 抽出 chart interactions，专门回归 Ctrl+滚轮、pinch、pointer pan。
6. 最后拆 views，并保留所有现有 selector 和 data 属性。

## 不可破坏项

- 视觉令牌：`--glass`、`--glass-hover`、`--glass-strong`、`--stock-up`、`--stock-down`、`--stock-flat`。
- A股颜色：`QuoteDirection.up` 必须映射到 `--stock-up` 红色；`QuoteDirection.down` 必须映射到 `--stock-down` 绿色。
- 交互行为：Ctrl+滚轮缩放、pinch 缩放、pointer 拖拽平移、虚拟滚动、局部 patch。
- DOM 语义：`[data-stock-view]`、`[data-stock-row]`、`[data-stock-filter-row]`、`[data-stock-daily-row]`、`[data-stock-cell]`、`[data-stock-daily-chart]`。
- 本地存储：`glass_nav_stock_watchlist`、`glass_nav_stock_strategies`、`glass_nav_stock_filter_state`。
