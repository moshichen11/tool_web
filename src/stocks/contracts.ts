export const STOCK_STORAGE_KEYS = {
  watchlist: "glass_nav_stock_watchlist",
  strategies: "glass_nav_stock_strategies",
  filterState: "glass_nav_stock_filter_state",
} as const;

export const STOCK_VIEWS = ["daily", "watchlist", "filter"] as const;
export type StockView = (typeof STOCK_VIEWS)[number];

export const A_SHARE_MARKETS = ["SH", "SZ", "BJ"] as const;
export type AShareMarket = (typeof A_SHARE_MARKETS)[number];

export type MarketCode = AShareMarket;
export type StockCode = string;
export type ISODate = string;
export type ISODateTime = string;
export type Yuan = number;
export type YuanHundredMillion = number;
export type Percent = number;

export type QuoteDirection = "up" | "down" | "flat";
export type StockColorRole = "stock-up" | "stock-down" | "stock-flat";

export const A_SHARE_COLOR_CONVENTION = {
  id: "CN_A_SHARE_RED_UP_GREEN_DOWN",
  upDirection: "up",
  downDirection: "down",
  upToken: "--stock-up",
  downToken: "--stock-down",
  flatToken: "--stock-flat",
} as const;

export const STOCK_VISUAL_TOKENS = {
  backgroundStart: "--bg-start",
  backgroundMid: "--bg-mid",
  backgroundEnd: "--bg-end",
  glass: "--glass",
  glassHover: "--glass-hover",
  glassStrong: "--glass-strong",
  border: "--border",
  borderBright: "--border-bright",
  text: "--text",
  muted: "--muted",
  stockUp: "--stock-up",
  stockDown: "--stock-down",
  stockFlat: "--stock-flat",
  stockUpSurface: "--stock-up-surface",
  stockDownSurface: "--stock-down-surface",
  stockFocusRing: "--stock-focus-ring",
  shadow: "--shadow",
  ease: "--ease",
} as const;

export const STOCK_VISUAL_TOKEN_DEFAULTS = {
  "--glass": "rgba(255,255,255,0.08)",
  "--glass-hover": "rgba(255,255,255,0.13)",
  "--glass-strong": "rgba(255,255,255,0.16)",
  "--stock-up": "#ff4d4f",
  "--stock-down": "#00b96b",
  "--stock-flat": "rgba(255,255,255,0.72)",
  "--stock-up-surface": "rgba(255,77,79,0.14)",
  "--stock-down-surface": "rgba(0,185,107,0.14)",
  "--stock-focus-ring": "rgba(104,147,255,0.14)",
} as const;

export const STOCK_INTERACTION_CONTRACT = {
  ctrlWheelZoom: true,
  pinchZoom: true,
  pointerDragPan: true,
  virtualScroll: true,
  localDomPatch: true,
  fullPageRerenderOnQuoteTick: false,
  refreshDelayMinMs: 5_000,
  refreshDelayMaxMs: 15_000,
} as const;

export const STOCK_DATA_SOURCE_POLICY = {
  productionRequiresLicensedProvider: true,
  webScrapingForbidden: true,
  mockServerAllowedFor: ["local-dev", "test", "demo"],
} as const;

export interface StockIdentity {
  market: MarketCode;
  code: StockCode;
}

export interface StockIdentityWithId extends StockIdentity {
  id: string;
}

export interface LicensedMarket {
  id: MarketCode;
  name: string;
  exchangeName: string;
  licensed: boolean;
  delaySeconds: number;
  tradingCalendar: string;
}

export interface DataSourceEntitlement {
  sourceId: string;
  sourceName: string;
  markets: MarketCode[];
  realtime: boolean;
  delaySeconds: number;
  redistributionAllowed: boolean;
  expiresAt?: ISODateTime;
}

export interface StockSummary extends StockIdentityWithId {
  name: string;
  industry: string;
  boardType: "main" | "star" | "gem" | "bse" | "unknown";
  status: "normal" | "st" | "delist-risk" | "suspended";
  price: Yuan;
  changePercent: Percent;
  changeAmount: Yuan;
  volume: number;
  amount?: Yuan;
  pe?: number;
  pb?: number;
  roe?: Percent;
  marketCap?: YuanHundredMillion;
  detailUrl?: string;
  delayed: boolean;
  source: string;
  updatedAt: ISODateTime;
}

export interface StockQuote extends StockSummary {
  open: Yuan;
  high: Yuan;
  low: Yuan;
  previousClose: Yuan;
  direction: QuoteDirection;
  colorRole: StockColorRole;
}

export interface KLinePoint {
  time: ISODate | ISODateTime;
  open: Yuan;
  high: Yuan;
  low: Yuan;
  close: Yuan;
  volume: number;
  amount?: Yuan;
  ma5?: Yuan;
  ma10?: Yuan;
  ma20?: Yuan;
  dif?: number;
  dea?: number;
  macd?: number;
}

export interface MinutePoint {
  time: ISODateTime;
  price: Yuan;
  average?: Yuan;
  volume: number;
  amount?: Yuan;
}

export type StockPeriod = "minute" | "day" | "week" | "month";
export type StockRange = "1d" | "3d" | "5d" | "15d" | "30d" | "60d" | "120d" | "250d" | "500d";

export interface StockHistoryRequest extends StockIdentity {
  period: StockPeriod;
  range: StockRange;
}

export interface StockHistoryResponse {
  stock: StockIdentityWithId;
  period: StockPeriod;
  range: StockRange;
  items: KLinePoint[] | MinutePoint[];
  source: string;
  delayed: boolean;
}

export interface OrderBookLevel {
  price: Yuan;
  volume: number;
  amount?: Yuan;
  ratio?: number;
}

export interface StockOrderBook {
  stock: StockIdentityWithId;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  updatedAt: ISODateTime;
}

export interface PriceDistributionLevel {
  price: Yuan;
  volume: number;
  side: QuoteDirection;
  ratio: number;
}

export interface StockDepthSnapshot {
  stock: StockIdentityWithId;
  orderBook: StockOrderBook;
  priceDistribution: PriceDistributionLevel[];
}

export interface WatchlistItem extends StockSummary {
  position: number;
  addedAt: ISODateTime;
  note?: string;
}

export interface WatchlistStorageV1Item extends Partial<StockSummary> {
  market: MarketCode;
  code: StockCode;
  history?: KLinePoint[];
  dailyK?: KLinePoint[];
}

export interface WatchlistStorageV2 {
  version: 2;
  app: "glass-nav";
  items: StockIdentity[];
  updatedAt: ISODateTime;
}

export type ScreenerLogic = "and" | "or";
export type StockTrend = "up" | "down" | "flat";

export interface ScreenerFilters {
  minChange?: Percent;
  maxChange?: Percent;
  minVolume?: number;
  maxVolume?: number;
  minPe?: number;
  maxPe?: number;
  minPb?: number;
  maxPb?: number;
  minRoe?: Percent;
  maxRoe?: Percent;
  industry?: string;
  metric?: "all" | "high-roe" | "low-pe" | "high-pe";
  exchange?: "SH" | "SZ" | "BJ";
  boardType?: StockSummary["boardType"];
  status?: StockSummary["status"];
  trend?: StockTrend;
  trendDays?: 5 | 15 | 30;
  logic?: ScreenerLogic;
}

export interface StockFilterStateStorage {
  activeStockTags: string[];
  activeStockStrategy: string;
  stockFilterSearchTerm: string;
}

export interface StockFilterTag {
  id: string;
  name: string;
  desc: string;
  conditions: ScreenerFilters;
}

export interface StockStrategy {
  id: string;
  name: string;
  desc: string;
  conditions: ScreenerFilters;
  builtin: boolean;
  updatedAt?: ISODateTime;
}

export interface StrategyInput {
  name: string;
  desc?: string;
  conditions: ScreenerFilters;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export const STOCK_API_ERROR_CODES = [
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "SYNC_CONFLICT",
  "RATE_LIMITED",
  "MARKET_DATA_UNAVAILABLE",
  "MARKET_DATA_UNLICENSED",
  "UPSTREAM_TIMEOUT",
  "INTERNAL_ERROR",
] as const;

export type StockApiErrorCode = (typeof STOCK_API_ERROR_CODES)[number];

export interface ApiError {
  code: StockApiErrorCode;
  message: string;
  traceId?: string;
  retryAfterMs?: number;
  details?: Record<string, unknown>;
}

export type ApiResult<T> =
  | { ok: true; data: T; traceId?: string }
  | { ok: false; error: ApiError };

export interface StockSearchQuery {
  q: string;
  market?: MarketCode;
  limit?: number;
}

export interface QuoteBatchRequest {
  symbols: StockIdentity[];
}

export interface QuoteBatchResponse {
  items: StockQuote[];
  source: string;
  delayed: boolean;
  updatedAt: ISODateTime;
}

export type CacheScope = "search" | "quote" | "history" | "depth" | "screener" | "strategies" | "watchlist";

export interface CachePolicy {
  scope: CacheScope;
  ttlMs: number;
  staleWhileRevalidateMs: number;
  storage: "memory" | "edge" | "server";
  variesBy: string[];
}

export interface RateLimitPolicy {
  scope: "anonymous" | "user" | "token" | "ip";
  windowMs: number;
  maxRequests: number;
  burst?: number;
}

export interface RateLimitState {
  limit: number;
  remaining: number;
  resetAt: ISODateTime;
  retryAfterMs?: number;
}

export type QuoteStreamEvent =
  | { type: "connected"; connectionId: string; serverTime: ISODateTime }
  | { type: "heartbeat"; serverTime: ISODateTime }
  | { type: "quotes"; quotes: StockQuote[]; patchOnly: true }
  | { type: "error"; error: ApiError };

export interface PollingFallbackPolicy {
  enabled: true;
  intervalMs: number;
  maxIntervalMs: number;
  jitterRatio: number;
  triggers: Array<"sse-disconnect" | "sse-timeout" | "visibilitychange" | "network-error">;
}

export interface DailyChartViewport {
  start: number;
  count: number;
  minVisibleCount: number;
  maxVisibleCount: number;
}

export interface DailyChartInteractionState {
  period: StockPeriod;
  range: StockRange;
  viewport: DailyChartViewport;
  tooltipIndex: number | null;
  dragState:
    | { type: "none" }
    | { type: "pan"; pointerId: number; startX: number; startIndex: number }
    | { type: "pinch"; pointerIds: [number, number]; startDistance: number; startViewport: DailyChartViewport };
}

export interface VirtualListState {
  rowHeight: number;
  overscan: number;
  scrollTop: number;
  startIndex: number;
  visibleCount: number;
  total: number;
}

export type StockDomPatchKind =
  | "quote-cell"
  | "watchlist-count"
  | "filter-count"
  | "quick-label"
  | "daily-quote"
  | "daily-depth"
  | "daily-canvas"
  | "class-toggle";

export interface StockDomPatch {
  kind: StockDomPatchKind;
  targetSelector: string;
  stock?: StockIdentity;
  textContent?: string;
  html?: string;
  className?: string;
  redrawCanvas?: boolean;
}

export interface StockFeatureState {
  status: "idle" | "bootstrapping" | "ready" | "refreshing" | "degraded" | "error";
  activeView: StockView;
  activeDailyStockId: string;
  searchTerm: string;
  watchlist: WatchlistItem[];
  filters: ScreenerFilters;
  filterState: StockFilterStateStorage;
  strategies: StockStrategy[];
  dailyChart: DailyChartInteractionState;
  dailyList: VirtualListState;
  entitlements: DataSourceEntitlement[];
  lastRefreshAt?: ISODateTime;
  error?: ApiError;
}

export interface LocalSyncSnapshot {
  app: "glass-nav";
  schemaVersion: 1;
  deviceId: string;
  userId?: string;
  baseVersion: string;
  updatedAt: ISODateTime;
  watchlist: WatchlistStorageV2;
  strategies: StockStrategy[];
  filterState: StockFilterStateStorage;
}

export interface CloudSyncSnapshot {
  app: "glass-nav";
  schemaVersion: 1;
  userId: string;
  serverVersion: string;
  updatedAt: ISODateTime;
  watchlist: WatchlistStorageV2;
  strategies: StockStrategy[];
  filterState: StockFilterStateStorage;
}

export type SyncConflictResolution = "local-wins" | "cloud-wins" | "merge" | "manual";

export interface SyncConflict {
  id: string;
  kind: "watchlist" | "strategies" | "filterState";
  local: unknown;
  cloud: unknown;
  baseVersion: string;
  localUpdatedAt: ISODateTime;
  cloudUpdatedAt: ISODateTime;
  suggestedResolution: SyncConflictResolution;
}

export interface SyncPushRequest {
  local: LocalSyncSnapshot;
  resolution?: SyncConflictResolution;
  resolvedConflicts?: SyncConflict[];
}

export interface SyncPullResponse {
  cloud: CloudSyncSnapshot;
  conflicts: SyncConflict[];
  rateLimit?: RateLimitState;
}

export interface SyncResult {
  status: "synced" | "conflict" | "accepted" | "rejected";
  cloud?: CloudSyncSnapshot;
  conflicts: SyncConflict[];
  version?: string;
}

export type AuditEventType =
  | "quote.search"
  | "quote.batch"
  | "history.read"
  | "watchlist.create"
  | "watchlist.update"
  | "watchlist.delete"
  | "strategy.create"
  | "strategy.update"
  | "strategy.delete"
  | "sync.pull"
  | "sync.push"
  | "stream.connect"
  | "stream.disconnect"
  | "rate_limit.hit";

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  actorId?: string;
  deviceId?: string;
  traceId: string;
  target?: string;
  outcome: "success" | "failure";
  createdAt: ISODateTime;
  metadata?: Record<string, unknown>;
}

export interface AuditQuery {
  type?: AuditEventType;
  actorId?: string;
  traceId?: string;
  from?: ISODateTime;
  to?: ISODateTime;
  limit?: number;
  offset?: number;
}

export type StockFeatureEvent =
  | { type: "STOCKS_ENTERED" }
  | { type: "STOCKS_LEFT" }
  | { type: "VIEW_CHANGED"; view: StockView }
  | { type: "SEARCH_CHANGED"; value: string }
  | { type: "SEARCH_SUBMITTED"; value: string }
  | { type: "QUOTE_REFRESH_TICK" }
  | { type: "QUOTES_RECEIVED"; quotes: StockQuote[] }
  | { type: "WATCHLIST_ADD_REQUESTED"; stock: StockIdentity }
  | { type: "WATCHLIST_REMOVE_REQUESTED"; stock: StockIdentity }
  | { type: "WATCHLIST_REORDERED"; items: StockIdentity[] }
  | { type: "FILTERS_CHANGED"; filters: ScreenerFilters }
  | { type: "STRATEGY_SELECTED"; strategyId: string }
  | { type: "DAILY_STOCK_SELECTED"; stockId: string }
  | { type: "DAILY_PERIOD_CHANGED"; period: StockPeriod }
  | { type: "DAILY_RANGE_CHANGED"; range: StockRange }
  | { type: "DAILY_CTRL_WHEEL_ZOOMED"; direction: 1 | -1 }
  | { type: "DAILY_PINCH_ZOOMED"; scale: number }
  | { type: "DAILY_POINTER_PANNED"; deltaX: number }
  | { type: "DAILY_LIST_SCROLLED"; scrollTop: number }
  | { type: "PATCHES_APPLIED"; patches: StockDomPatch[] }
  | { type: "API_FAILED"; error: ApiError };

export interface StockApiContract {
  listMarkets(): Promise<ApiResult<LicensedMarket[]>>;
  listEntitlements(): Promise<ApiResult<DataSourceEntitlement[]>>;
  getCachePolicies(): Promise<ApiResult<CachePolicy[]>>;
  getRateLimitPolicy(): Promise<ApiResult<RateLimitPolicy[]>>;
  searchStocks(query: StockSearchQuery): Promise<ApiResult<StockSummary[]>>;
  getQuote(stock: StockIdentity): Promise<ApiResult<StockQuote>>;
  getQuotes(request: QuoteBatchRequest): Promise<ApiResult<QuoteBatchResponse>>;
  streamQuotes(symbols: StockIdentity[], fallback: PollingFallbackPolicy): AsyncIterable<QuoteStreamEvent>;
  getHistory(request: StockHistoryRequest): Promise<ApiResult<StockHistoryResponse>>;
  getDepth(stock: StockIdentity): Promise<ApiResult<StockDepthSnapshot>>;
  getWatchlist(): Promise<ApiResult<WatchlistItem[]>>;
  addWatchlistItem(stock: StockIdentity): Promise<ApiResult<WatchlistItem>>;
  removeWatchlistItem(stock: StockIdentity): Promise<ApiResult<void>>;
  reorderWatchlist(items: StockIdentity[]): Promise<ApiResult<void>>;
  screenStocks(filters: ScreenerFilters, limit?: number, offset?: number): Promise<ApiResult<PagedResult<StockSummary>>>;
  listStrategies(): Promise<ApiResult<StockStrategy[]>>;
  createStrategy(input: StrategyInput): Promise<ApiResult<StockStrategy>>;
  updateStrategy(strategyId: string, input: StrategyInput): Promise<ApiResult<StockStrategy>>;
  deleteStrategy(strategyId: string): Promise<ApiResult<void>>;
  pullCloudState(): Promise<ApiResult<SyncPullResponse>>;
  syncLocalState(request: SyncPushRequest): Promise<ApiResult<SyncResult>>;
  listAuditEvents(query: AuditQuery): Promise<ApiResult<PagedResult<AuditEvent>>>;
}
