function now() {
  return new Date().toISOString();
}

export function createSyncStore(initialWatchlist, initialStrategies) {
  let versionNumber = 1;
  let cloud = {
    app: "glass-nav",
    schemaVersion: 1,
    userId: "mock-user",
    serverVersion: "server-v1",
    updatedAt: now(),
    watchlist: { version: 2, app: "glass-nav", items: initialWatchlist, updatedAt: now() },
    strategies: initialStrategies,
    filterState: { activeStockTags: [], activeStockStrategy: "", stockFilterSearchTerm: "" },
  };

  function pull() {
    return { cloud, conflicts: [] };
  }

  function makeConflict(local) {
    return {
      id: `conflict-${Date.now()}`,
      kind: "watchlist",
      local: local.watchlist,
      cloud: cloud.watchlist,
      baseVersion: local.baseVersion,
      localUpdatedAt: local.updatedAt,
      cloudUpdatedAt: cloud.updatedAt,
      suggestedResolution: "manual",
    };
  }

  function push({ local, resolution }) {
    if (!local) return { httpStatus: 400, body: { code: "VALIDATION_FAILED", message: "local snapshot is required" } };
    const hasConflict = local.baseVersion !== cloud.serverVersion && !resolution;
    if (hasConflict) {
      return { httpStatus: 409, body: { status: "conflict", conflicts: [makeConflict(local)], cloud, version: cloud.serverVersion } };
    }

    versionNumber += 1;
    const watchlist = resolution === "cloud-wins" ? cloud.watchlist : local.watchlist;
    const strategies = resolution === "cloud-wins" ? cloud.strategies : local.strategies;
    const filterState = resolution === "cloud-wins" ? cloud.filterState : local.filterState;
    cloud = {
      ...cloud,
      serverVersion: `server-v${versionNumber}`,
      updatedAt: now(),
      watchlist: { ...watchlist, updatedAt: now() },
      strategies,
      filterState,
    };
    return { httpStatus: 200, body: { status: "synced", cloud, conflicts: [], version: cloud.serverVersion } };
  }

  return { pull, push };
}
