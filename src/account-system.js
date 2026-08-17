(function attachAccountSystem(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AccountSystem = api;
})(typeof window !== "undefined" ? window : globalThis, function createAccountSystem(root) {
  "use strict";

  const OWNER_KEY = "glass_nav_account_data_owner";
  const MANAGED_KEYS = new Set([
    "glass_nav_user_config",
    "glass_nav_stock_watchlist",
    "glass_nav_stock_watchlist_groups",
    "glass_nav_stock_strategies",
    "glass_nav_stock_filter_state",
    "glass_nav_fun_games_v1",
    "glass_nav_wheel_options",
    "glass_nav_memory_best_4x4",
    "glass_nav_memory_best_4x6",
    "glass_nav_memory_best_4x8",
    "glass_nav_memory_best_4x10",
  ]);
  const MANAGED_PREFIXES = ["glass_nav_schulte_best_"];
  const callbacks = { onChange: () => {}, onDataApplied: () => {}, toast: () => {} };
  const state = {
    ready: false,
    status: "loading",
    session: null,
    user: null,
    profile: null,
    avatarUrl: "",
    syncStatus: "idle",
    error: "",
  };
  let client = null;
  let authSubscription = null;
  let syncTimer = null;
  let applyingCloudState = false;
  let activeUserId = "";

  function getStorage() {
    try { return root.localStorage || null; } catch (error) { return null; }
  }

  function getConfig() {
    const value = root.SUPABASE_CONFIG || {};
    return { url: String(value.url || "").trim(), key: String(value.publishableKey || "").trim() };
  }

  function isConfigured() {
    const config = getConfig();
    return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.url)
      && (config.key.startsWith("sb_publishable_") || config.key.split(".").length === 3);
  }

  function ensureClient() {
    if (client) return client;
    if (!isConfigured()) throw new Error("账号服务尚未配置 Publishable key");
    if (typeof root.supabase?.createClient !== "function") throw new Error("Supabase 客户端加载失败，请检查网络后刷新");
    const config = getConfig();
    client = root.supabase.createClient(config.url, config.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    return client;
  }

  function configure(options = {}) {
    for (const key of Object.keys(callbacks)) {
      if (typeof options[key] === "function") callbacks[key] = options[key];
    }
  }

  function notify() {
    callbacks.onChange(getState());
  }

  function getState() {
    return {
      ...state,
      profile: state.profile ? { ...state.profile } : null,
      session: state.session,
      user: state.user,
    };
  }

  function isManagedKey(key) {
    return MANAGED_KEYS.has(key) || MANAGED_PREFIXES.some(prefix => key.startsWith(prefix));
  }

  function captureLocalState() {
    const storage = getStorage();
    const snapshot = {};
    if (!storage) return snapshot;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !isManagedKey(key)) continue;
      const value = storage.getItem(key);
      if (value !== null) snapshot[key] = value;
    }
    return snapshot;
  }

  function clearManagedLocalState() {
    const storage = getStorage();
    if (!storage) return;
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && isManagedKey(key)) keys.push(key);
    }
    keys.forEach(key => storage.removeItem(key));
  }

  function applyLocalState(snapshot) {
    const storage = getStorage();
    if (!storage) return false;
    const before = JSON.stringify(captureLocalState());
    applyingCloudState = true;
    try {
      clearManagedLocalState();
      if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
        Object.entries(snapshot).forEach(([key, value]) => {
          if (isManagedKey(key) && typeof value === "string") storage.setItem(key, value);
        });
      }
    } finally {
      applyingCloudState = false;
    }
    return before !== JSON.stringify(captureLocalState());
  }

  function fallbackNickname(user) {
    const metadataName = String(user?.user_metadata?.nickname || user?.user_metadata?.display_name || "").trim();
    if (metadataName) return metadataName.slice(0, 20);
    return String(user?.email || "用户").split("@")[0].slice(0, 20) || "用户";
  }

  async function loadProfile(user) {
    const supabaseClient = ensureClient();
    const { data, error } = await supabaseClient.from("profiles").select("id,nickname,avatar_path,updated_at").eq("id", user.id).maybeSingle();
    if (error) throw error;
    let profile = data;
    if (!profile) {
      const initial = { id: user.id, nickname: fallbackNickname(user) };
      const created = await supabaseClient.from("profiles").upsert(initial).select("id,nickname,avatar_path,updated_at").single();
      if (created.error) throw created.error;
      profile = created.data;
    }
    state.profile = profile;
    state.avatarUrl = "";
    if (profile.avatar_path) {
      const signed = await supabaseClient.storage.from("avatars").createSignedUrl(profile.avatar_path, 3600);
      if (!signed.error) state.avatarUrl = signed.data?.signedUrl || "";
    }
  }

  async function uploadLocalState(userId, snapshot = captureLocalState()) {
    const supabaseClient = ensureClient();
    const { error } = await supabaseClient.from("user_app_state").upsert({
      user_id: userId,
      state: snapshot,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw error;
  }

  async function reconcileUserState(userId) {
    const storage = getStorage();
    const owner = storage?.getItem(OWNER_KEY) || "";
    const supabaseClient = ensureClient();
    const result = await supabaseClient.from("user_app_state").select("state,updated_at").eq("user_id", userId).maybeSingle();
    if (result.error) throw result.error;
    const cloudState = result.data?.state;
    const hasCloudState = cloudState && typeof cloudState === "object" && Object.keys(cloudState).length > 0;
    let changed = false;

    if (hasCloudState) {
      changed = applyLocalState(cloudState);
    } else if (!owner) {
      await uploadLocalState(userId, captureLocalState());
    } else if (owner !== userId) {
      changed = applyLocalState({});
      await uploadLocalState(userId, {});
    } else if (!result.data) {
      await uploadLocalState(userId, captureLocalState());
    }
    storage?.setItem(OWNER_KEY, userId);
    return changed;
  }

  async function handleSession(session, options = {}) {
    state.session = session || null;
    state.user = session?.user || null;
    state.error = "";
    if (!session?.user) {
      activeUserId = "";
      state.profile = null;
      state.avatarUrl = "";
      state.status = "signedOut";
      state.syncStatus = "idle";
      state.ready = true;
      notify();
      return false;
    }

    const userId = session.user.id;
    state.status = "loading";
    state.syncStatus = "loading";
    notify();
    try {
      await loadProfile(session.user);
      const changed = await reconcileUserState(userId);
      activeUserId = userId;
      state.status = "signedIn";
      state.syncStatus = "synced";
      state.ready = true;
      notify();
      if (changed && options.notifyDataApplied !== false) callbacks.onDataApplied();
      return changed;
    } catch (error) {
      activeUserId = userId;
      state.status = "signedIn";
      state.syncStatus = "error";
      state.error = error?.message || "账号资料加载失败";
      state.ready = true;
      notify();
      return false;
    }
  }

  async function initialize() {
    if (state.ready) return getState();
    try {
      const supabaseClient = ensureClient();
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      await handleSession(data.session, { notifyDataApplied: false });
      const listener = supabaseClient.auth.onAuthStateChange((event, nextSession) => {
        if (event === "TOKEN_REFRESHED") {
          state.session = nextSession;
          state.user = nextSession?.user || state.user;
          return;
        }
        root.setTimeout(() => handleSession(nextSession), 0);
      });
      authSubscription = listener.data?.subscription || null;
    } catch (error) {
      state.ready = true;
      state.status = "unavailable";
      state.error = error?.message || "账号服务初始化失败";
      notify();
    }
    return getState();
  }

  async function signIn(email, password) {
    const cleanEmail = String(email || "").trim();
    if (!cleanEmail || !String(password || "")) throw new Error("请输入邮箱和密码");
    state.status = "loading";
    state.error = "";
    notify();
    const { data, error } = await ensureClient().auth.signInWithPassword({ email: cleanEmail, password: String(password) });
    if (error) {
      state.status = "signedOut";
      state.error = error.message;
      notify();
      throw error;
    }
    await handleSession(data.session);
    return data;
  }

  async function signOut() {
    if (activeUserId) {
      try { await syncNow(); } catch (error) { /* 退出仍应继续。 */ }
    }
    const { error } = await ensureClient().auth.signOut();
    if (error) throw error;
    clearManagedLocalState();
    getStorage()?.removeItem(OWNER_KEY);
    activeUserId = "";
    await handleSession(null, { notifyDataApplied: false });
    callbacks.onDataApplied();
  }

  async function updateProfile({ nickname, avatarFile } = {}) {
    if (!state.user) throw new Error("请先登录");
    const cleanName = String(nickname || "").trim();
    if (!cleanName || cleanName.length > 20) throw new Error("昵称需要填写 1～20 个字符");
    const supabaseClient = ensureClient();
    let avatarPath = state.profile?.avatar_path || null;
    if (avatarFile) {
      const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
      if (!allowedTypes.has(avatarFile.type)) throw new Error("头像仅支持 JPG、PNG 或 WebP");
      if (avatarFile.size > 2 * 1024 * 1024) throw new Error("头像不能超过 2 MB");
      const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[avatarFile.type];
      avatarPath = `${state.user.id}/avatar.${extension}`;
      const uploaded = await supabaseClient.storage.from("avatars").upload(avatarPath, avatarFile, {
        upsert: true,
        contentType: avatarFile.type,
        cacheControl: "3600",
      });
      if (uploaded.error) throw uploaded.error;
    }
    const result = await supabaseClient.from("profiles").upsert({
      id: state.user.id,
      nickname: cleanName,
      avatar_path: avatarPath,
      updated_at: new Date().toISOString(),
    }).select("id,nickname,avatar_path,updated_at").single();
    if (result.error) throw result.error;
    await ensureClient().auth.updateUser({ data: { nickname: cleanName } });
    await loadProfile(state.user);
    notify();
    return state.profile;
  }

  async function updatePassword(password) {
    if (!state.user) throw new Error("请先登录");
    const value = String(password || "");
    if (value.length < 8) throw new Error("新密码至少需要 8 位");
    const { error } = await ensureClient().auth.updateUser({ password: value });
    if (error) throw error;
  }

  function queueSync() {
    if (applyingCloudState || !activeUserId) return;
    if (syncTimer) root.clearTimeout(syncTimer);
    state.syncStatus = "pending";
    notify();
    syncTimer = root.setTimeout(() => {
      syncTimer = null;
      syncNow().catch(() => {});
    }, 800);
  }

  async function syncNow() {
    if (!activeUserId || applyingCloudState) return false;
    if (syncTimer) {
      root.clearTimeout(syncTimer);
      syncTimer = null;
    }
    state.syncStatus = "syncing";
    notify();
    try {
      await uploadLocalState(activeUserId);
      state.syncStatus = "synced";
      state.error = "";
      notify();
      return true;
    } catch (error) {
      state.syncStatus = "error";
      state.error = error?.message || "云端同步失败";
      notify();
      throw error;
    }
  }

  function getDisplayName() {
    if (!state.user) return "";
    return String(state.profile?.nickname || fallbackNickname(state.user)).trim().slice(0, 20);
  }

  function destroy() {
    if (syncTimer) root.clearTimeout(syncTimer);
    authSubscription?.unsubscribe?.();
    authSubscription = null;
  }

  return {
    configure,
    initialize,
    destroy,
    getClient: ensureClient,
    getState,
    getDisplayName,
    isConfigured,
    isSignedIn: () => Boolean(state.user),
    signIn,
    signOut,
    updateProfile,
    updatePassword,
    queueSync,
    syncNow,
    captureLocalState,
  };
});
