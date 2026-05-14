const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const contracts = fs.readFileSync(path.join(root, "src", "stocks", "contracts.ts"), "utf8");
const openapi = fs.readFileSync(path.join(root, "docs", "openapi", "stocks.openapi.yaml"), "utf8");

function assertIncludes(source, value, label = value) {
  assert.ok(source.includes(value), `Missing ${label}`);
}

test("contracts expose REST, SSE, polling fallback, sync, audit, cache, and rate limit boundaries", () => {
  [
    "export interface StockApiContract",
    "searchStocks(",
    "getQuotes(",
    "getHistory(",
    "screenStocks(",
    "listStrategies(",
    "getWatchlist(",
    "syncLocalState(",
    "listAuditEvents(",
    "export type QuoteStreamEvent",
    "export interface PollingFallbackPolicy",
    "export interface CachePolicy",
    "export interface RateLimitPolicy",
    "export const STOCK_API_ERROR_CODES",
  ].forEach(item => assertIncludes(contracts, item));
});

test("contracts define localStorage to cloud sync conflict resolution", () => {
  [
    "export interface CloudSyncSnapshot",
    "export interface LocalSyncSnapshot",
    "export interface SyncConflict",
    "export type SyncConflictResolution",
    '"local-wins"',
    '"cloud-wins"',
    '"merge"',
    '"manual"',
    "baseVersion",
    "deviceId",
  ].forEach(item => assertIncludes(contracts, item));
});

test("OpenAPI covers required stocks contracts and operational controls", () => {
  [
    "openapi: 3.1.0",
    "/v1/stocks/search:",
    "/v1/quotes:",
    "/v1/stocks/{market}/{code}/history:",
    "/v1/screener:",
    "/v1/strategies:",
    "/v1/watchlist:",
    "/v1/sync/pull:",
    "/v1/sync/push:",
    "/v1/audit/events:",
    "/v1/streams/quotes:",
    "text/event-stream:",
    "RateLimitPolicy:",
    "CachePolicy:",
    "SyncConflict:",
    "AuditEvent:",
    "ErrorCode:",
    '"409":',
    '"429":',
  ].forEach(item => assertIncludes(openapi, item));
});

test("A-share visual and interaction contract remains explicit", () => {
  [
    "CN_A_SHARE_RED_UP_GREEN_DOWN",
    "--glass",
    "--stock-up",
    "--stock-down",
    "ctrlWheelZoom",
    "pinchZoom",
    "virtualScroll",
    "localDomPatch",
    "fullPageRerenderOnQuoteTick: false",
    "STOCK_DATA_SOURCE_POLICY",
    "webScrapingForbidden: true",
  ].forEach(item => assertIncludes(contracts, item));

  assert.match(openapi, /up maps to --stock-up red, down maps to --stock-down green/);
  assertIncludes(openapi, "x-data-source-policy:");
  assertIncludes(openapi, "productionRequiresLicensedProvider: true");
  assertIncludes(openapi, "webScrapingForbidden: true");
});
