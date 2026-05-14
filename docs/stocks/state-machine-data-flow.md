# Stocks State Machine And Data Flow

本文定义股市模块后续 TypeScript 化和 API 化时必须保持的状态机、数据流和渲染边界。

## 顶层状态机

```text
AppShell
  navigation | game | stocks | settings | placeholder

stocks feature
  idle
    -> bootstrapping on STOCKS_ENTERED
  bootstrapping
    -> ready after storage restored and initial data loaded
    -> degraded when API fails but mock/local data exists
    -> error when neither API nor local fallback is usable
  ready
    -> refreshing on QUOTE_REFRESH_TICK
    -> ready on VIEW_CHANGED / FILTERS_CHANGED / DAILY_* interaction
    -> idle on STOCKS_LEFT
  refreshing
    -> ready after QUOTES_RECEIVED and PATCHES_APPLIED
    -> degraded on API_FAILED with stale data
  degraded
    -> refreshing on retry tick
    -> ready when API recovers
    -> idle on STOCKS_LEFT
```

## 子视图状态

`activeStockView` 只允许以下值：

| 状态 | 入口 | 主要数据 | 渲染边界 |
| --- | --- | --- | --- |
| `daily` | 默认入口 | `activeDailyStockId`、period、range、viewport、order book | 可重绘 canvas 和报价面板，不刷新整个 app shell |
| `watchlist` | 自选股侧栏/tab | `stockWatchlist`、quick filters、expanded row | 添加/删除/排序可重渲染 stock page，报价 tick 只能局部 patch |
| `filter` | 条件选股侧栏/tab | filters、tags、strategy、sort、pagination、expanded row | 条件变化可重渲染 filter view，报价 tick 局部 patch |

无 `market` 子视图。已有测试要求移除/不恢复市场云图视图。

## 事件模型

| 事件 | 来源 | 状态影响 | DOM 策略 |
| --- | --- | --- | --- |
| `STOCKS_ENTERED` | `renderAppShell()` 进入 stocks | 读取 localStorage、恢复 filter state、启动 refresh timer | 首次渲染 stock shell |
| `STOCKS_LEFT` | 切到其他一级功能 | 停止 refresh timer、清理 transient interaction state | 不触碰 localStorage |
| `VIEW_CHANGED` | `[data-stock-view]` | 更新 `activeStockView` | 渲染 stock active view |
| `SEARCH_CHANGED` | `#stockSearchInput input` | 更新 `stockSearchTerm` | 只更新 `#stockSearchResults` |
| `SEARCH_SUBMITTED` | `#stockSearchForm submit` | 搜索第一条匹配 | 打开详情页，不自动加入自选 |
| `QUOTE_REFRESH_TICK` | 5-15 秒 timer | 请求/生成新报价 | 不允许整页重渲染 |
| `QUOTES_RECEIVED` | API 或 mock fallback | 合并 quote 到 store | 生成 DOM patches |
| `WATCHLIST_ADD_REQUESTED` | `[data-stock-add]` | 追加去重、保存 watchlist | 可重渲染 stock page |
| `WATCHLIST_REMOVE_REQUESTED` | `[data-stock-remove]` | 删除、保存 watchlist | 可重渲染 stock page |
| `WATCHLIST_REORDERED` | drag/drop | 重排、保存 watchlist | 可重渲染 watchlist body |
| `FILTERS_CHANGED` | `[data-stock-filter]` | 更新 filters | 重算结果，保持分页约束 |
| `STRATEGY_SELECTED` | `[data-stock-strategy]` | 应用 strategy conditions | 重算筛选结果并保存 filter state |
| `DAILY_CTRL_WHEEL_ZOOMED` | `wheel` with `ctrlKey` | 调整 range 或 viewport | 只更新 chart viewport + canvas |
| `DAILY_PINCH_ZOOMED` | 双指 pointer | 调整 range 或 viewport | 只更新 chart viewport + canvas |
| `DAILY_POINTER_PANNED` | pointer drag | 平移 viewport | 只更新 canvas |
| `DAILY_LIST_SCROLLED` | `[data-stock-daily-list] scroll` | 更新虚拟列表窗口 | 只替换 list rows |

## 数据流

```text
localStorage
  -> storage adapter
  -> StockFeatureState

OpenAPI / licensed provider / mock fallback
  -> api-client
  -> mappers
  -> StockFeatureState
  -> patch-dom
  -> existing DOM nodes

StockFeatureState
  -> daily-view / watchlist-view / filter-view
  -> stable selectors and data attributes
```

## 初始化流程

1. `renderAppShell()` 发现 `activeFeature === "stocks"`。
2. 添加 `.stock-mode`，隐藏搜索 shell 和添加分类按钮。
3. 从 `glass_nav_stock_watchlist` 读取自选股。读取失败时删除坏数据并回退默认自选。
4. 从 `glass_nav_stock_strategies` 读取自定义策略。
5. 从 `glass_nav_stock_filter_state` 读取筛选标签、策略和搜索词。
6. 渲染 stock 侧栏和默认 `daily` 页面。
7. 启动 5-15 秒随机刷新 timer。

## 行情刷新流程

```text
timer tick
  -> fetch /v1/quotes
  -> server provider selects Tushare when STOCK_DATA_SOURCE=tushare and TUSHARE_TOKEN is present
  -> otherwise local mock data
  -> normalize quote fields
  -> compute QuoteDirection
  -> map colorRole
  -> update in-memory quotes
  -> save watchlist-compatible data
  -> build StockDomPatch[]
  -> patch existing text/classes/canvas
```

关键约束：

- `QuoteDirection.up` 表示涨，A股默认显示 `--stock-up` 红色。
- `QuoteDirection.down` 表示跌，A股默认显示 `--stock-down` 绿色。
- 报价 tick 不调用整页 `renderStockPage()`。
- patch 目标优先使用 `[data-stock-cell]`、`[data-stock-quick-label]`、`[data-stock-daily-quote]`、`[data-stock-daily-depth]` 和 canvas redraw。

## K线交互流程

### Ctrl+滚轮缩放

```text
wheel event on [data-stock-daily-chart]
  -> require event.ctrlKey
  -> preventDefault
  -> direction = delta > 0 ? zoom out : zoom in
  -> update range or viewport
  -> drawStockDailyCanvas()
```

### Pinch 缩放

```text
pointerdown
  -> collect active pointers
  -> when two pointers exist, store initial distance and viewport
pointermove
  -> compute distance delta
  -> convert delta to zoom direction
  -> update viewport
  -> drawStockDailyCanvas()
pointerup / pointercancel
  -> clear pointer and pinch state
```

### 拖拽平移

```text
pointerdown on chart
  -> capture pointer and starting viewport
pointermove
  -> convert x delta to candle index shift
  -> update viewport start
  -> drawStockDailyCanvas()
pointerup
  -> release pointer capture
```

## 虚拟滚动流程

```text
scrollTop
  -> floor(scrollTop / STOCK_DAILY_ROW_HEIGHT)
  -> subtract overscan buffer
  -> clamp start index
  -> render visible rows + spacer
  -> restore scrollTop
```

约束：

- 保留固定 `rowHeight` 和 overscan buffer。
- 滚动时只替换日线列表 rows，不重建整个 stock page。
- `activeDailyStockId` 不因虚拟窗口变化丢失。

## 状态持久化

| 状态 | key | 写入时机 | 兼容性 |
| --- | --- | --- | --- |
| 自选股 | `glass_nav_stock_watchlist` | add/remove/reorder/quote refresh | 继续读取当前数组结构，后续可迁移到 versioned schema |
| 自定义策略 | `glass_nav_stock_strategies` | create/edit/delete strategy | 保留 `{ id, name, desc, conditions, builtin:false }` |
| 筛选状态 | `glass_nav_stock_filter_state` | tag/strategy/search changes | 保留 `activeStockTags`、`activeStockStrategy`、`stockFilterSearchTerm` |

## 视觉与语义约束

- 保留原型 glass token：`--glass`、`--glass-hover`、`--glass-strong`、`--border`、`--border-bright`、`--shadow`。
- stock 色彩必须使用 token，不在 canvas 或 DOM 中散落硬编码涨跌色。
- A股颜色约定 ID 固定为 `CN_A_SHARE_RED_UP_GREEN_DOWN`。
- 新增或迁移后的 stock token：
  - `--stock-up`: A股上涨红色。
  - `--stock-down`: A股下跌绿色。
  - `--stock-flat`: 平盘中性色。
- DOM 语义不变：`[data-stock-view]` 切换模块，不能改回滚动 section。
- 可访问键盘行为不变：Enter/Space 可打开搜索结果、展开自选行、展开筛选结果行。

## 错误与降级

| 场景 | 状态 | UI 处理 |
| --- | --- | --- |
| API 超时但有本地数据 | `degraded` | 保留旧报价，显示非阻断刷新提示 |
| 行情源未授权 | `degraded` | 显示延迟数据或授权提示，不暴露供应商密钥 |
| localStorage 损坏 | `bootstrapping -> ready` | 删除坏 key，回退默认 watchlist |
| canvas 绘制失败 | `ready` | 不影响 watchlist/filter，可显示 chart fallback |
| token 过期 | `error` 或 `degraded` | 停止真实行情请求，允许 mock fallback |
