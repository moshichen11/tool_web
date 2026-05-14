# 当前项目审计

审计日期：2026-05-12

审计范围：`index.html`、根目录资产、`tests/*.test.js`、部署配置 `CNAME`、`src/stocks/contracts.ts`、`docs/openapi/stocks.openapi.yaml`、`docs/stocks/*.md`。本次只做代码库审计和接口草案，不修改运行代码。

## 结论摘要

当前项目主体仍是一个无构建步骤的静态单页应用：核心 HTML、CSS、JavaScript 全部内嵌在 `index.html`，根目录通过 `CNAME` 配置自定义域名 `kid1412.dpdns.org`。应用已有 `stocks` 股市模块，且模块规模较完整，包含自选股、条件选股、分时/日K图、虚拟列表、拖拽排序、刷新动画和 Node 静态契约测试。仓库当前还新增了 stock 契约层草案：`src/stocks/contracts.ts`、`docs/openapi/stocks.openapi.yaml` 和 `tests/stocks-contracts.test.js`。

上线主要缺口不在页面交互，而在生产化边界：没有后端 API、没有授权行情源、没有真实认证/授权、没有运行时监控、没有安全响应头/CSP、没有浏览器端 E2E/视觉/可访问性测试，也没有包管理脚本或模块化结构。

## Confidence Checks

- No duplicate audit document found：`audit.md` 原先不存在。
- Architecture compliance verified：按现有静态单页架构审计，未引入运行时依赖。
- Official documentation verified：OpenAPI 官方 latest 文档显示 OAS 最新发布版为 3.2.0；本草案使用 3.1.0，原因是工具链兼容性更稳，后续可升级。
- Working implementation reference found：本仓库已有 `tests/stocks-module.test.js` 对 stock 行为做静态契约验证。
- Root cause identified：现有 stock 模块是 mock-first 前端实现，生产缺口集中在 API、授权行情源、认证、安全和观测。

Confidence：0.94。

## 技术栈与工程形态

| 项目项 | 审计结果 | 证据 |
| --- | --- | --- |
| 应用形态 | 静态 HTML 单页应用，无框架、无构建、无包管理配置 | `index.html`，未发现 `package.json` / Vite / TS 配置 |
| 样式 | 内嵌 CSS，CSS 变量 + class 体系 | `index.html:8`, `index.html:17`, `index.html:1291` |
| 脚本 | 内嵌原生 JavaScript，直接操作 DOM | `index.html:3456` |
| 契约层 | 已有 TypeScript 类型草案，但未接入构建 | `src/stocks/contracts.ts` |
| API 契约 | 已有 OpenAPI 3.1 YAML 草案 | `docs/openapi/stocks.openapi.yaml` |
| 入口文件 | `index.html` 是唯一应用入口 | `index.html` 共 8304 行 |
| 资产 | 记忆翻牌图片 `angle.png`，并在 head 预加载 | `index.html:6` |
| 部署 | 静态站点自定义域名 | `CNAME` |
| 测试 | Node 内置 `node:test` 的静态契约测试，无 npm script | `tests/*.test.js` |
| 外部服务 | 未发现 `fetch()`、XHR、WebSocket；只通过 `window.open` 打开外链 | `index.html:6715`, `index.html:8281` |

## 入口文件

| 文件 | 角色 | 备注 |
| --- | --- | --- |
| `index.html` | 应用入口、样式、状态、渲染、事件全部集中于此 | 8304 行，后续改动需避免大面积回归 |
| `angle.png` | 记忆翻牌背面图片 | 被 `<link rel="preload">` 和 `<img loading="eager">` 使用 |
| `CNAME` | 静态站点自定义域名配置 | `kid1412.dpdns.org` |
| `tests/mobile-layout.test.js` | 移动端布局静态契约 | 保护底部 tab、移动搜索区、单列 shell |
| `tests/memory-game.test.js` | 记忆翻牌契约 | 保护 4 行模式、图片加载、卡片尺寸 |
| `tests/schulte-game.test.js` | 苏尔特方格契约 | 保护完成时间结算顺序 |
| `tests/stocks-module.test.js` | 股市模块契约 | 保护 stock 注册、视图、筛选、刷新、K线、响应式样式 |
| `tests/stocks-contracts.test.js` | stock API/数据契约测试 | 保护 REST、SSE、同步、审计、缓存、限流、错误码、A股颜色约定 |
| `src/stocks/contracts.ts` | stock TypeScript 契约草案 | 当前未被运行时代码 import，仅作为后续模块化边界 |
| `docs/openapi/stocks.openapi.yaml` | OpenAPI 3.1 契约草案 | 覆盖 REST、SSE、同步、审计、错误码、限流和授权行情源约束 |

## 路由与状态管理

项目没有 URL 路由、hash 路由或框架路由。页面路由由内存状态和事件委托驱动：

- 一级功能状态：`activeFeature`，默认 `navigation`，由桌面 `.feature-button` 和移动 `[data-mobile-feature]` 切换。
- 一级渲染入口：`renderAppShell()`，根据 `activeFeature` 分发到导航、游戏、股市、设置和占位页。
- stock 子路由：`activeStockView`，默认 `daily`，可选 `daily`、`watchlist`、`filter`，通过 `[data-stock-view]` 在侧栏和移动 tabs 内切换。
- 导航分类状态：`activeCategory` + `IntersectionObserver` 同步侧栏高亮。
- 游戏状态：`activeGame`、`schulteState`、`memoryState`。
- stock 状态：`stockWatchlist`、`stockFilters`、`activeStockTags`、`activeStockStrategy`、`stockResultSort`、`activeDailyStockId`、`activeStockDailyRange`、`activeStockDailyPeriod` 等模块级变量。

## 是否已有 stock/stocks 模块

结论：已有，且是当前项目中最大的业务模块之一。

| 检测点 | 结果 | 证据 |
| --- | --- | --- |
| 一级功能注册 | `defaultFeatures` 中已有 `{ id: "stocks", label: "股市" }` | `index.html:3466` |
| stock CSS | 有独立注释块 `/* Stock Module Styles */` | `index.html:1291` |
| stock 常量 | 自选、策略、筛选状态 localStorage key 均存在 | `index.html:3523` |
| stock 子视图 | `daily`、`watchlist`、`filter`，无 `market` 视图 | `index.html:3532` |
| stock 运行状态 | 多个 `let stock...` 模块状态变量 | `index.html:3804` |
| stock 逻辑 | 有独立注释块 `/* Stock Module Logic */` | `index.html:4329` |
| 自选持久化 | `loadStockWatchlist()` / `saveStockWatchlist()` | `index.html:4542`, `index.html:4567` |
| 动态刷新 | `scheduleStockRefresh()` 和 `refreshStockPrices()` | `index.html:4658`, `index.html:6090` |
| 详情跳转 | `openStockDetail()` 打开东方财富详情页 | `index.html:6715` |
| 页面装配 | `renderAppShell()` 内进入 stocks 后调用 stock 渲染与刷新 | `index.html:7076` |
| 测试覆盖 | 存在 `tests/stocks-module.test.js` | `tests/stocks-module.test.js` |

## 必须保留的设计令牌

以下 token 是当前视觉系统的根基，后续新增 API、模块拆分或重构 UI 时应保持语义和默认值兼容：

```css
--bg-start: #0f0c29;
--bg-mid: #302b63;
--bg-end: #24243e;
--glass: rgba(255,255,255,0.08);
--glass-hover: rgba(255,255,255,0.13);
--glass-strong: rgba(255,255,255,0.16);
--border: rgba(255,255,255,0.15);
--border-bright: rgba(255,255,255,0.32);
--text: rgba(255,255,255,0.94);
--muted: rgba(255,255,255,0.6);
--green: #83c341;
--green-active: rgba(99,153,34,0.35);
--danger: rgba(180,40,40,0.4);
--danger-bright: rgba(235,92,92,0.72);
--search-h: 56px;
--shadow: 0 18px 48px rgba(0,0,0,0.28);
--ease: 0.2s ease;
```

## glass-dark 交互模式

代码中没有名为 `.glass-dark` 的 selector。当前项目实际使用的是深色背景上的 `.glass` 玻璃拟态交互模式：

- 页面背景：`body` 使用 `--bg-start`、`--bg-mid`、`--bg-end` 深色渐变。
- 玻璃容器：`.glass` 使用 `var(--glass)`、`backdrop-filter: blur(20px) saturate(160%)`、`var(--border)`、`var(--shadow)`。
- hover/focus：按钮、stock 操作、搜索框等使用 `var(--glass-hover)`、`var(--border-bright)`、紫蓝 focus ring 和轻微 `translateY`。
- active：主导航和 stock mobile tab 使用 `var(--green-active)` 与 `--green` 指示条。
- stock 浮层：`.stock-search-results` 使用深色半透明背景 `rgba(18,14,48,0.96)` 和 blur，属于同一 glass-dark 语义。

保留要求：后续如果引入 `.glass-dark`，应作为对现有 `.glass` 深色语义的别名或增强层，不应替换根 token、不应破坏 hover/focus/active 的颜色和动效语义。

## 必须保留的 localStorage key

| Key | 用途 | 证据 |
| --- | --- | --- |
| `glass_nav_user_config` | 用户导航配置、功能顺序、分类、站点 | `index.html:3615`, `index.html:3982` |
| `glass_nav_unlocked` | 隐藏功能解锁状态 | `index.html:3616`, `index.html:7950` |
| `glass_nav_stock_watchlist` | stock 自选股列表 | `index.html:3523`, `index.html:4542` |
| `glass_nav_stock_strategies` | stock 自定义选股策略 | `index.html:3524`, `index.html:4582` |
| `glass_nav_stock_filter_state` | stock 筛选标签、策略、搜索词 | `index.html:3525`, `index.html:4610` |
| `glass_nav_schulte_best_3` 到 `glass_nav_schulte_best_10` | 苏尔特方格不同尺寸最佳成绩 | `index.html:3498` |
| `glass_nav_memory_best_4x4` / `4x6` / `4x8` / `4x10` | 记忆翻牌不同模式最佳成绩 | `index.html:3509` |

保留要求：不能无迁移地改名或改结构。若后续接入账号系统，应提供本地到服务端的迁移路径，并保留回退读取。

## 必须保留的 DOM 语义

| DOM/属性 | 保留原因 |
| --- | --- |
| `.app` 三栏布局及 `game-mode` / `stock-mode` class | 当前 shell 布局、游戏宽屏和 stock 模式依赖这些 class |
| `.feature-sidebar glass`、`.category-sidebar glass`、`.main-panel glass` | 主视觉和布局骨架 |
| `#featureList`、`#categoryList`、`#content`、`#mainScroll`、`#mobileTabbar` | 核心渲染和事件委托挂载点 |
| `aria-label="功能导航栏"`、`aria-label="侧边列表"`、`aria-label="主内容区"`、`aria-label="移动端功能导航"` | 当前可访问语义 |
| `[data-feature]`、`[data-mobile-feature]`、`[data-target]` | 一级功能与导航分类切换 |
| `[data-drag-type="feature"]`、`[data-drag-type="category"]` | 功能和分类拖拽排序 |
| `[data-stock-view]` | stock 子视图切换，不能退回滚动 section 模式 |
| `#stockSearchForm`、`#stockSearchInput`、`#stockSearchResults` | stock 搜索输入和结果容器 |
| `[data-stock-row]`、`[data-stock-filter-row]`、`[data-stock-daily-row]` | 自选、筛选结果、日线列表交互 |
| `[data-stock-cell]`、`[data-stock-quick-label]` | stock 刷新时的局部 DOM 更新 |
| `[data-stock-daily-chart]`、`#stockDailyTooltip` | K线 canvas、tooltip、拖拽/滚轮/指针交互 |

## 必须保留的现有行为

- `stocks` tab 在桌面和移动功能列表中可见；隐藏功能只限制 `game`，不限制 `stocks`。
- `stocks` 默认进入 `daily` 子视图，且 stock 子侧栏切换模块，不滚动页面 section。
- stock 搜索提交会打开第一条匹配股票详情，不会自动加入自选。
- stock 详情打开东方财富页面，并使用 `noopener,noreferrer`。
- stock 刷新节奏为 5 到 15 秒随机延迟；刷新时调用局部更新，不整页重渲染。
- 自选股支持添加、删除、拖拽排序、行展开、键盘 Enter/Space 展开。
- 筛选模块支持条件、标签、策略、排序、分页、详情展开和筛选状态持久化。
- 分时/日K模块支持虚拟列表、范围/周期控制、canvas K线、MA/成交量/MACD、tooltip、滚轮缩放、指针拖拽。
- 移动端保留底部 tab bar、隐藏侧栏、stock 横向 overflow 和主内容底部安全区。
- 导航模块保留配置导入/导出/重置、分类/站点增删改、搜索引擎切换。

## 技术债与上线缺口

| 领域 | 当前状态 | 上线缺口 | 风险 |
| --- | --- | --- | --- |
| API | 没有 `fetch()`，stock 数据全在前端 mock 生成 | 需要后端或边缘代理、REST/WS/SSE API、错误码、缓存策略 | 无法接入真实行情、无法控制密钥和授权 |
| 授权行情源 | 只打开东方财富详情页，未调用授权数据接口 | 需要采购/确认行情源授权、数据延迟级别、再分发许可 | 合规风险和数据准确性风险 |
| 认证 | `glass_nav_unlocked` + 硬编码密码 `1412` | 需要登录、会话、权限、设备管理 | 客户端密码无法保护功能或数据 |
| 授权 | 无角色、无资源级权限 | 需要用户/租户/订阅 entitlement | 自选股、策略、付费行情无法隔离 |
| 测试 | Node 静态契约测试，缺少 package script | 需要 `package.json`、浏览器 E2E、视觉回归、API contract、可访问性 | 当前测试只能证明字符串存在，不能证明真实交互可用 |
| 监控 | 无日志、错误追踪、性能指标、健康检查 | 需要前端错误上报、API tracing、Web Vitals、行情延迟监控 | 生产故障不可观测 |
| 安全 | 大量 `innerHTML`，靠 `escapeHTML` 约束；无 CSP；本地存储敏感状态 | 需要 CSP、Trusted Types 评估、输入输出审计、安全 headers、secret 不进前端 | XSS 和配置污染风险 |
| 构建维护 | 单文件 8304 行，无模块边界、无 lint/format/type check | 需要模块化、代码拥有边界、CI | 后续 stock 接口化时回归面很大 |
| 部署 | 静态 CNAME，未见 CI/CD | 需要构建/测试/部署流水线、回滚、preview 环境 | 手工上线风险 |
| 仓库卫生 | `.superpowers/brainstorm/...` 文件已被 git 跟踪 | 需要确认这些是否应保留，若是临时产物应移出版本库 | 噪声和无关产物进入发布 |

## 差异分析表

| 维度 | 当前实现 | 生产目标 | 差异 | 建议 |
| --- | --- | --- | --- | --- |
| 技术栈 | 原生 HTML/CSS/JS 单文件 | 可测试、可分包、可部署的前端工程 | 缺少模块系统和脚本入口 | 先补 `package.json` 测试脚本，再分离 stock 数据层 |
| 路由 | 内存状态驱动，无 URL | 可刷新、可分享、可追踪的 URL 状态 | 页面状态不可深链 | 可先加 hash/query 同步，不改 DOM 结构 |
| 状态 | 全局 `let` + localStorage | 明确 store、持久化 schema、迁移机制 | 状态散落，升级困难 | 定义 storage schema version 和 adapter |
| stock 数据 | mock 行情 + 本地突变刷新 | 授权行情源 + 后端缓存/聚合 | 无真实数据和授权 | 新增 API adapter，保留 mock fallback |
| stock UI | 已有较完整交互 | 保持 UI 行为并接真实数据 | API 引入可能破坏局部刷新 | 用同名 view model 映射 API 响应 |
| 认证 | 客户端密码 | 服务端认证 + token/session | 不具备安全性 | 后端提供 auth，前端只保存短期 token 或 httpOnly cookie |
| 授权 | 无 entitlement | 行情源权限、用户策略权限 | 无法限制数据访问 | 在 API 层返回 entitlement 和数据延迟信息 |
| 测试 | 静态字符串契约 | 单元、E2E、视觉、API contract | 不能覆盖真实 DOM 事件和 canvas | 引入 Playwright，再保留现有静态测试 |
| 安全 | escapeHTML + URL normalize | CSP、headers、输入审计、依赖审计 | 防线不足 | 优先补 CSP 和 innerHTML 审计清单 |
| 监控 | 无 | 前端错误、API 错误、行情延迟 | 无生产反馈 | 接入错误上报和 `/health` |

## 文件变更计划

### Phase 0：审计交付

| 文件 | 操作 | 内容 |
| --- | --- | --- |
| `audit.md` | 新增 | 当前审计、差异分析、文件计划、OpenAPI 草案 |

### Phase 1：不改变行为的工程化基础

| 文件 | 操作 | 内容 |
| --- | --- | --- |
| `package.json` | 新增 | 增加 `test: "node --test tests/*.test.js"`，不引入运行时依赖 |
| `.gitignore` | 新增/更新 | 排除临时产物、日志、未来构建目录 |
| `docs/openapi/stocks.openapi.yaml` | 已新增 | 将本文 OpenAPI 草案拆成可校验文件 |
| `tests/stocks-contracts.test.js` | 已新增 | 静态校验 contracts 与 OpenAPI 覆盖 REST、SSE、同步、审计、错误码、限流 |

### Phase 2：API 边界，不改 UI 行为

| 文件 | 操作 | 内容 |
| --- | --- | --- |
| `index.html` | 最小修改 | 抽出 stock 数据获取入口，保留 mock fallback、DOM class、data 属性和 localStorage key |
| `src/stocks/stock-api.js` 或 `stocks-api.js` | 新增 | 如果仍无构建，使用独立浏览器脚本；如果引入构建，则放入 `src/stocks` |
| `src/stocks/stock-mapper.js` | 新增 | 将 API 响应映射为现有 `stockUniverse` / `stockWatchlist` 视图模型 |
| `tests/stocks-api-adapter.test.js` | 新增 | 验证 mock fallback、错误处理、字段映射 |

### Phase 3：后端/代理和认证

| 文件 | 操作 | 内容 |
| --- | --- | --- |
| `server/` 或 `api/` | 新增 | 行情源代理、缓存、鉴权、限流、健康检查 |
| `server/openapi.yaml` | 新增 | API 实现与 OpenAPI 同源维护 |
| `tests/api/*.test.*` | 新增 | API contract、auth、watchlist、screener 测试 |
| `docs/security.md` | 新增 | CSP、认证、授权行情源、数据合规说明 |

### Phase 4：浏览器回归

| 文件 | 操作 | 内容 |
| --- | --- | --- |
| `tests/e2e/*.spec.*` | 新增 | Playwright 验证导航、stocks 三视图、移动布局、键盘交互 |
| `tests/visual/*.spec.*` | 新增 | 保护 glass-dark、stock canvas、移动端布局 |
| `.github/workflows/ci.yml` | 新增 | 静态测试、E2E、OpenAPI 校验、部署前 gate |

## OpenAPI 草案

说明：官方 OpenAPI latest 为 3.2.0，但草案先使用 3.1.0，以兼容更多校验、代码生成和网关工具。真实行情源必须经后端代理，不应在浏览器暴露供应商密钥。

```yaml
openapi: 3.1.0
info:
  title: Glass Nav Stocks API
  version: 0.1.0
  description: >
    Draft API for replacing the current mock-first stocks module with
    authenticated, licensed market data and user watchlist/strategy storage.
servers:
  - url: https://api.example.com
    description: Production placeholder
  - url: http://localhost:8787
    description: Local development placeholder
security:
  - bearerAuth: []
tags:
  - name: Health
  - name: MarketData
  - name: Watchlist
  - name: Screener
  - name: Strategies
paths:
  /health:
    get:
      tags: [Health]
      summary: Health check
      security: []
      responses:
        "200":
          description: Service is healthy
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/HealthStatus"

  /v1/markets:
    get:
      tags: [MarketData]
      summary: List supported markets and entitlement status
      responses:
        "200":
          description: Supported markets
          content:
            application/json:
              schema:
                type: object
                required: [markets]
                properties:
                  markets:
                    type: array
                    items:
                      $ref: "#/components/schemas/Market"

  /v1/stocks/search:
    get:
      tags: [MarketData]
      summary: Search stocks by code or name
      parameters:
        - $ref: "#/components/parameters/Query"
        - $ref: "#/components/parameters/MarketOptional"
        - $ref: "#/components/parameters/Limit"
      responses:
        "200":
          description: Search results
          content:
            application/json:
              schema:
                type: object
                required: [items]
                properties:
                  items:
                    type: array
                    items:
                      $ref: "#/components/schemas/StockSummary"

  /v1/stocks/{market}/{code}/quote:
    get:
      tags: [MarketData]
      summary: Get latest quote for one stock
      parameters:
        - $ref: "#/components/parameters/Market"
        - $ref: "#/components/parameters/Code"
      responses:
        "200":
          description: Latest quote
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Quote"
        "404":
          $ref: "#/components/responses/NotFound"

  /v1/stocks/{market}/{code}/history:
    get:
      tags: [MarketData]
      summary: Get minute or K-line history
      parameters:
        - $ref: "#/components/parameters/Market"
        - $ref: "#/components/parameters/Code"
        - name: period
          in: query
          required: true
          schema:
            type: string
            enum: [minute, day, week, month]
        - name: range
          in: query
          required: false
          schema:
            type: string
            enum: [1d, 3d, 5d, 15d, 30d, 60d, 120d, 250d, 500d]
      responses:
        "200":
          description: Historical bars
          content:
            application/json:
              schema:
                type: object
                required: [stock, period, items]
                properties:
                  stock:
                    $ref: "#/components/schemas/StockIdentity"
                  period:
                    type: string
                  items:
                    type: array
                    items:
                      $ref: "#/components/schemas/HistoryPoint"

  /v1/stocks/{market}/{code}/order-book:
    get:
      tags: [MarketData]
      summary: Get depth levels
      parameters:
        - $ref: "#/components/parameters/Market"
        - $ref: "#/components/parameters/Code"
      responses:
        "200":
          description: Bid and ask levels
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/OrderBook"

  /v1/watchlist:
    get:
      tags: [Watchlist]
      summary: Get current user's watchlist
      responses:
        "200":
          description: Watchlist items
          content:
            application/json:
              schema:
                type: object
                required: [items]
                properties:
                  items:
                    type: array
                    items:
                      $ref: "#/components/schemas/WatchlistItem"
    post:
      tags: [Watchlist]
      summary: Add a stock to watchlist
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/StockIdentity"
      responses:
        "201":
          description: Added
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/WatchlistItem"

  /v1/watchlist/reorder:
    put:
      tags: [Watchlist]
      summary: Reorder watchlist
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [items]
              properties:
                items:
                  type: array
                  items:
                    $ref: "#/components/schemas/StockIdentity"
      responses:
        "204":
          description: Reordered

  /v1/watchlist/{market}/{code}:
    delete:
      tags: [Watchlist]
      summary: Remove a stock from watchlist
      parameters:
        - $ref: "#/components/parameters/Market"
        - $ref: "#/components/parameters/Code"
      responses:
        "204":
          description: Removed

  /v1/screener:
    get:
      tags: [Screener]
      summary: Screen stocks by metrics and tags
      parameters:
        - $ref: "#/components/parameters/MarketOptional"
        - name: minChange
          in: query
          schema: { type: number }
        - name: maxChange
          in: query
          schema: { type: number }
        - name: minVolume
          in: query
          schema: { type: integer }
        - name: maxVolume
          in: query
          schema: { type: integer }
        - name: minPe
          in: query
          schema: { type: number }
        - name: maxPe
          in: query
          schema: { type: number }
        - name: minPb
          in: query
          schema: { type: number }
        - name: maxPb
          in: query
          schema: { type: number }
        - name: minRoe
          in: query
          schema: { type: number }
        - name: maxRoe
          in: query
          schema: { type: number }
        - name: industry
          in: query
          schema: { type: string }
        - name: logic
          in: query
          schema:
            type: string
            enum: [and, or]
            default: and
        - $ref: "#/components/parameters/Limit"
        - name: offset
          in: query
          schema:
            type: integer
            minimum: 0
            default: 0
      responses:
        "200":
          description: Screener results
          content:
            application/json:
              schema:
                type: object
                required: [items, total]
                properties:
                  items:
                    type: array
                    items:
                      $ref: "#/components/schemas/StockSummary"
                  total:
                    type: integer

  /v1/strategies:
    get:
      tags: [Strategies]
      summary: List user and built-in strategies
      responses:
        "200":
          description: Strategies
          content:
            application/json:
              schema:
                type: object
                required: [items]
                properties:
                  items:
                    type: array
                    items:
                      $ref: "#/components/schemas/Strategy"
    post:
      tags: [Strategies]
      summary: Create a custom strategy
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/StrategyInput"
      responses:
        "201":
          description: Created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Strategy"

  /v1/strategies/{strategyId}:
    put:
      tags: [Strategies]
      summary: Update a custom strategy
      parameters:
        - name: strategyId
          in: path
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/StrategyInput"
      responses:
        "200":
          description: Updated
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Strategy"
    delete:
      tags: [Strategies]
      summary: Delete a custom strategy
      parameters:
        - name: strategyId
          in: path
          required: true
          schema: { type: string }
      responses:
        "204":
          description: Deleted

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  parameters:
    Query:
      name: q
      in: query
      required: true
      schema:
        type: string
        minLength: 1
    Market:
      name: market
      in: path
      required: true
      schema:
        type: string
        enum: [SH, SZ, BJ]
    MarketOptional:
      name: market
      in: query
      required: false
      schema:
        type: string
        enum: [SH, SZ, BJ]
    Code:
      name: code
      in: path
      required: true
      schema:
        type: string
        pattern: "^[0-9]{6}$"
    Limit:
      name: limit
      in: query
      required: false
      schema:
        type: integer
        minimum: 1
        maximum: 100
        default: 20
  responses:
    NotFound:
      description: Resource not found
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/Error"
  schemas:
    HealthStatus:
      type: object
      required: [status, timestamp]
      properties:
        status:
          type: string
          enum: [ok]
        timestamp:
          type: string
          format: date-time
    Error:
      type: object
      required: [code, message]
      properties:
        code: { type: string }
        message: { type: string }
        traceId: { type: string }
    Market:
      type: object
      required: [id, name, licensed, delaySeconds]
      properties:
        id:
          type: string
          enum: [SH, SZ, BJ]
        name:
          type: string
        licensed:
          type: boolean
        delaySeconds:
          type: integer
    StockIdentity:
      type: object
      required: [market, code]
      properties:
        market:
          type: string
          enum: [SH, SZ, BJ]
        code:
          type: string
          pattern: "^[0-9]{6}$"
    StockSummary:
      allOf:
        - $ref: "#/components/schemas/StockIdentity"
        - type: object
          required: [id, name, industry, price, changePercent, volume]
          properties:
            id: { type: string }
            name: { type: string }
            industry: { type: string }
            price: { type: number }
            changePercent: { type: number }
            volume: { type: integer }
            pe: { type: number }
            pb: { type: number }
            roe: { type: number }
            marketCap: { type: number, description: Unit is CNY 100M }
            detailUrl: { type: string, format: uri }
            delayed: { type: boolean }
            source: { type: string }
    Quote:
      allOf:
        - $ref: "#/components/schemas/StockSummary"
        - type: object
          required: [open, high, low, previousClose, updatedAt]
          properties:
            open: { type: number }
            high: { type: number }
            low: { type: number }
            previousClose: { type: number }
            amount: { type: number }
            updatedAt: { type: string, format: date-time }
    HistoryPoint:
      type: object
      required: [time, open, high, low, close, volume]
      properties:
        time: { type: string }
        open: { type: number }
        high: { type: number }
        low: { type: number }
        close: { type: number }
        volume: { type: integer }
        amount: { type: number }
        ma5: { type: number }
        ma10: { type: number }
        ma20: { type: number }
        dif: { type: number }
        dea: { type: number }
        macd: { type: number }
    OrderBook:
      type: object
      required: [bids, asks, updatedAt]
      properties:
        bids:
          type: array
          items:
            $ref: "#/components/schemas/OrderBookLevel"
        asks:
          type: array
          items:
            $ref: "#/components/schemas/OrderBookLevel"
        updatedAt:
          type: string
          format: date-time
    OrderBookLevel:
      type: object
      required: [price, volume]
      properties:
        price: { type: number }
        volume: { type: integer }
    WatchlistItem:
      allOf:
        - $ref: "#/components/schemas/StockSummary"
        - type: object
          required: [position, addedAt]
          properties:
            position: { type: integer }
            addedAt: { type: string, format: date-time }
    StrategyInput:
      type: object
      required: [name, conditions]
      properties:
        name:
          type: string
          maxLength: 16
        desc:
          type: string
        conditions:
          type: object
          additionalProperties: true
    Strategy:
      allOf:
        - $ref: "#/components/schemas/StrategyInput"
        - type: object
          required: [id, builtin]
          properties:
            id: { type: string }
            builtin: { type: boolean }
```
