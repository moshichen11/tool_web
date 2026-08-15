(function attachGomokuGame(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GomokuGame = api;
})(typeof window !== "undefined" ? window : globalThis, function createGomokuGame(root) {
  "use strict";

  const BOARD_SIZE = 15;
  const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
  const IDENTITY_KEY = "glass_nav_gomoku_identity_v1";
  const ROOM_CODE_PATTERN = /^[A-Z2-9]{6}$/;
  const callbacks = { rerender: () => {}, toast: () => {} };
  const runtime = { active: false, client: null, channel: null, channelRoom: "" };

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[character]);
  }

  function getStorage() {
    try { return root.localStorage || null; } catch (error) { return null; }
  }

  function makeToken() {
    if (root.crypto?.randomUUID) return root.crypto.randomUUID();
    if (root.crypto?.getRandomValues) {
      const bytes = new Uint8Array(24);
      root.crypto.getRandomValues(bytes);
      return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }

  function loadIdentity(storage = getStorage()) {
    const fallback = { token: makeToken(), name: "", roomCode: "", playerColor: 0 };
    if (!storage) return fallback;
    try {
      const parsed = JSON.parse(storage.getItem(IDENTITY_KEY) || "null");
      return {
        token: typeof parsed?.token === "string" && parsed.token.length >= 20 ? parsed.token : fallback.token,
        name: typeof parsed?.name === "string" ? parsed.name.slice(0, 20) : "",
        roomCode: ROOM_CODE_PATTERN.test(String(parsed?.roomCode || "")) ? parsed.roomCode : "",
        playerColor: [1, 2].includes(Number(parsed?.playerColor)) ? Number(parsed.playerColor) : 0,
      };
    } catch (error) {
      return fallback;
    }
  }

  const identity = loadIdentity();

  function getInviteCode() {
    try {
      const value = String(new URLSearchParams(root.location?.search || "").get("gomoku") || "").toUpperCase();
      return ROOM_CODE_PATTERN.test(value) ? value : "";
    } catch (error) {
      return "";
    }
  }

  const inviteCode = getInviteCode();
  const state = {
    view: identity.roomCode && (!inviteCode || inviteCode === identity.roomCode) ? "room" : "lobby",
    prefillCode: inviteCode || "",
    roomCode: identity.roomCode || "",
    playerColor: identity.playerColor || 0,
    game: null,
    busy: false,
    loading: false,
    pendingMove: -1,
    connection: "idle",
    error: "",
  };

  function persistIdentity() {
    const storage = getStorage();
    if (!storage) return;
    try { storage.setItem(IDENTITY_KEY, JSON.stringify(identity)); } catch (error) { /* 存储不可用时仅影响自动恢复。 */ }
  }

  function configure(options = {}) {
    if (typeof options.rerender === "function") callbacks.rerender = options.rerender;
    if (typeof options.toast === "function") callbacks.toast = options.toast;
  }

  function getConfig() {
    const value = root.SUPABASE_CONFIG || {};
    return {
      url: String(value.url || "").trim(),
      key: String(value.publishableKey || "").trim(),
    };
  }

  function isConfigured() {
    const config = getConfig();
    return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.url)
      && (config.key.startsWith("sb_publishable_") || config.key.split(".").length === 3);
  }

  function ensureClient() {
    if (runtime.client) return runtime.client;
    if (!isConfigured()) throw new Error("联机服务尚未配置 Publishable key");
    if (typeof root.supabase?.createClient !== "function") throw new Error("Supabase 客户端加载失败，请检查网络后刷新");
    const config = getConfig();
    runtime.client = root.supabase.createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return runtime.client;
  }

  function normalizeBoard(value) {
    if (!Array.isArray(value) || value.length !== CELL_COUNT) return Array(CELL_COUNT).fill(0);
    return value.map(cell => [1, 2].includes(Number(cell)) ? Number(cell) : 0);
  }

  function normalizeGame(payload) {
    const raw = payload?.game || payload || {};
    const lastMove = raw.lastMove || raw.last_move || null;
    return {
      id: String(raw.id || ""),
      roomCode: String(raw.roomCode || raw.room_code || "").toUpperCase(),
      board: normalizeBoard(raw.board),
      status: String(raw.status || "waiting"),
      currentTurn: Number(raw.currentTurn ?? raw.current_turn) === 2 ? 2 : 1,
      winner: [1, 2].includes(Number(raw.winner)) ? Number(raw.winner) : 0,
      blackName: String(raw.blackName || raw.black_name || "黑方"),
      whiteName: raw.whiteName || raw.white_name ? String(raw.whiteName || raw.white_name) : "",
      moveCount: Math.max(0, Number(raw.moveCount ?? raw.move_count) || 0),
      lastMove: lastMove && Number.isInteger(Number(lastMove.row)) && Number.isInteger(Number(lastMove.col))
        ? { row: Number(lastMove.row), col: Number(lastMove.col), color: Number(lastMove.color) }
        : null,
      version: Math.max(0, Number(raw.version) || 0),
      updatedAt: String(raw.updatedAt || raw.updated_at || ""),
      expiresAt: String(raw.expiresAt || raw.expires_at || ""),
    };
  }

  function hasFive(board, row, col, color) {
    if (!Array.isArray(board) || ![1, 2].includes(color)) return false;
    const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
    return directions.some(([dr, dc]) => {
      let count = 1;
      for (const sign of [-1, 1]) {
        for (let step = 1; step < 5; step += 1) {
          const nextRow = row + dr * step * sign;
          const nextCol = col + dc * step * sign;
          if (nextRow < 0 || nextRow >= BOARD_SIZE || nextCol < 0 || nextCol >= BOARD_SIZE) break;
          if (Number(board[nextRow * BOARD_SIZE + nextCol]) !== color) break;
          count += 1;
        }
      }
      return count >= 5;
    });
  }

  function updateFromResult(result) {
    state.game = normalizeGame(result);
    const color = Number(result?.playerColor);
    if ([1, 2].includes(color)) state.playerColor = color;
    state.roomCode = state.game.roomCode;
    state.view = "room";
    state.error = "";
    identity.roomCode = state.roomCode;
    identity.playerColor = state.playerColor;
    persistIdentity();
  }

  async function callRpc(name, args) {
    const client = ensureClient();
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || "联机请求失败");
    if (!data) throw new Error("服务器没有返回棋局数据");
    return data;
  }

  function setBusy(value) {
    state.busy = Boolean(value);
    if (runtime.active) callbacks.rerender();
  }

  function getInputValue(selector) {
    return String(root.document?.querySelector(selector)?.value || "").trim();
  }

  function validateName(value) {
    const name = String(value || "").trim();
    if (!name) throw new Error("请先填写玩家昵称");
    if (name.length > 20) throw new Error("昵称最多填写 20 个字符");
    return name;
  }

  async function createRoom() {
    if (state.busy) return;
    try {
      const name = validateName(getInputValue("[data-gomoku-name]"));
      identity.name = name;
      persistIdentity();
      setBusy(true);
      const result = await callRpc("gomoku_create_game", {
        p_player_name: name,
        p_player_token: identity.token,
      });
      updateFromResult(result);
      callbacks.toast(`房间 ${state.roomCode} 创建成功`, "success");
      await subscribeToRoom(state.roomCode);
    } catch (error) {
      state.error = error.message;
      callbacks.toast(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    if (state.busy) return;
    try {
      const name = validateName(getInputValue("[data-gomoku-name]"));
      const roomCode = getInputValue("[data-gomoku-code]").toUpperCase();
      if (!ROOM_CODE_PATTERN.test(roomCode)) throw new Error("请输入正确的 6 位房间码");
      identity.name = name;
      persistIdentity();
      setBusy(true);
      const result = await callRpc("gomoku_join_game", {
        p_room_code: roomCode,
        p_player_name: name,
        p_player_token: identity.token,
      });
      updateFromResult(result);
      callbacks.toast(`已加入房间 ${state.roomCode}`, "success");
      await subscribeToRoom(state.roomCode);
    } catch (error) {
      state.error = error.message;
      callbacks.toast(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function resumeRoom() {
    if (state.loading || !state.roomCode || !isConfigured()) return;
    state.loading = true;
    state.error = "";
    try {
      const result = await callRpc("gomoku_get_game", {
        p_room_code: state.roomCode,
        p_player_token: identity.token,
      });
      updateFromResult(result);
      await subscribeToRoom(state.roomCode);
    } catch (error) {
      state.error = error.message;
      state.view = "lobby";
      state.roomCode = "";
      state.playerColor = 0;
      identity.roomCode = "";
      identity.playerColor = 0;
      persistIdentity();
    } finally {
      state.loading = false;
      if (runtime.active) callbacks.rerender();
    }
  }

  async function refreshRoom() {
    if (!state.roomCode || state.busy) return;
    try {
      setBusy(true);
      const result = await callRpc("gomoku_get_game", {
        p_room_code: state.roomCode,
        p_player_token: identity.token,
      });
      updateFromResult(result);
    } catch (error) {
      callbacks.toast(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function subscribeToRoom(roomCode) {
    if (!roomCode || runtime.channelRoom === roomCode && runtime.channel) return;
    const client = ensureClient();
    await unsubscribe();
    state.connection = "connecting";
    runtime.channelRoom = roomCode;
    runtime.channel = client
      .channel(`gomoku-room-${roomCode}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "gomoku_games",
        filter: `room_code=eq.${roomCode}`,
      }, payload => {
        const incoming = normalizeGame(payload.new);
        if (!state.game || incoming.version >= state.game.version) {
          state.game = incoming;
          state.pendingMove = -1;
          if (runtime.active) callbacks.rerender();
        }
      })
      .subscribe(status => {
        const next = status === "SUBSCRIBED" ? "live"
          : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "error" : "connecting";
        if (state.connection !== next) {
          state.connection = next;
          if (runtime.active) callbacks.rerender();
        }
      });
  }

  async function unsubscribe() {
    if (!runtime.channel || !runtime.client) {
      runtime.channel = null;
      runtime.channelRoom = "";
      return;
    }
    const channel = runtime.channel;
    runtime.channel = null;
    runtime.channelRoom = "";
    try { await runtime.client.removeChannel(channel); } catch (error) { /* 页面切换时静默释放。 */ }
  }

  function canMove() {
    return Boolean(state.game
      && state.game.status === "playing"
      && state.game.currentTurn === state.playerColor
      && !state.busy
      && state.pendingMove < 0);
  }

  async function makeMove(index) {
    if (!canMove() || state.game.board[index]) return;
    const row = Math.floor(index / BOARD_SIZE);
    const col = index % BOARD_SIZE;
    state.pendingMove = index;
    callbacks.rerender();
    try {
      const result = await callRpc("gomoku_make_move", {
        p_room_code: state.roomCode,
        p_player_token: identity.token,
        p_row: row,
        p_col: col,
      });
      updateFromResult(result);
      if (["black_won", "white_won"].includes(state.game.status)) callbacks.toast("五子连珠，本局结束", "success");
    } catch (error) {
      callbacks.toast(error.message, "error");
      await refreshRoom();
    } finally {
      state.pendingMove = -1;
      if (runtime.active) callbacks.rerender();
    }
  }

  async function restartGame() {
    if (state.busy || state.playerColor !== 1) return;
    try {
      setBusy(true);
      const result = await callRpc("gomoku_restart_game", {
        p_room_code: state.roomCode,
        p_player_token: identity.token,
      });
      updateFromResult(result);
      callbacks.toast("新一局已经开始", "success");
    } catch (error) {
      callbacks.toast(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function exitRoom() {
    unsubscribe();
    state.view = "lobby";
    state.roomCode = "";
    state.playerColor = 0;
    state.game = null;
    state.pendingMove = -1;
    state.connection = "idle";
    identity.roomCode = "";
    identity.playerColor = 0;
    persistIdentity();
    callbacks.rerender();
  }

  async function copyInvite() {
    const url = new URL(root.location?.href || "https://example.com/");
    url.searchParams.set("gomoku", state.roomCode);
    try {
      await root.navigator?.clipboard?.writeText(url.toString());
      callbacks.toast("邀请链接已复制", "success");
    } catch (error) {
      callbacks.toast(`房间码：${state.roomCode}`, "success");
    }
  }

  function renderHeader() {
    return `
      <header class="fun-game-header gomoku-header">
        <div class="fun-game-title-row">
          <span class="fun-game-title-icon" aria-hidden="true">⚫</span>
          <div><h1>联机五子棋</h1><p>15 × 15 棋盘 · 房间码邀请 · Supabase 实时同步</p></div>
        </div>
      </header>`;
  }

  function renderSetup() {
    return `
      <div class="fun-game-shell gomoku-page">
        ${renderHeader()}
        <section class="gomoku-setup glass">
          <span class="gomoku-setup-icon" aria-hidden="true">🔑</span>
          <div>
            <h2>还差一步即可联机</h2>
            <p>请在 <code>src/supabase-config.js</code> 中填写 Publishable key，再到 Supabase SQL Editor 执行五子棋迁移脚本。</p>
            <p class="gomoku-safe-note">只能填写 <code>sb_publishable_...</code>，不要填写 Secret key。</p>
          </div>
        </section>
      </div>`;
  }

  function renderLobby() {
    const code = state.prefillCode || "";
    return `
      <div class="fun-game-shell gomoku-page">
        ${renderHeader()}
        <section class="gomoku-lobby glass">
          <div class="gomoku-lobby-copy">
            <span class="gomoku-kicker">双人实时对弈</span>
            <h2>创建房间，邀请朋友落子</h2>
            <p>房主执黑先行。另一位玩家输入 6 位房间码后，棋局会自动开始。</p>
          </div>
          <div class="gomoku-lobby-form">
            <label>玩家昵称<input type="text" maxlength="20" autocomplete="nickname" data-gomoku-name value="${escapeHTML(identity.name)}" placeholder="输入你的昵称" /></label>
            <button type="button" class="fun-action gomoku-primary" data-gomoku-create ${state.busy ? "disabled" : ""}>${state.busy ? "连接中…" : "创建新房间"}</button>
            <div class="gomoku-divider"><span>或者加入朋友的房间</span></div>
            <label>房间码<input type="text" maxlength="6" inputmode="text" autocapitalize="characters" data-gomoku-code value="${escapeHTML(code)}" placeholder="例如 A7KM2P" /></label>
            <button type="button" class="fun-action secondary" data-gomoku-join ${state.busy ? "disabled" : ""}>加入房间</button>
            ${state.error ? `<p class="gomoku-error" role="alert">${escapeHTML(state.error)}</p>` : ""}
          </div>
        </section>
        <p class="fun-help">棋局有效期为 24 小时。请使用无痕窗口或另一台设备模拟第二位玩家。</p>
      </div>`;
  }

  function getStatusText(game) {
    if (!game) return "正在恢复棋局…";
    if (game.status === "waiting") return "等待白方加入";
    if (game.status === "black_won") return `${game.blackName}（黑方）获胜`;
    if (game.status === "white_won") return `${game.whiteName || "白方"}（白方）获胜`;
    if (game.status === "draw") return "棋盘已满，本局和棋";
    if (game.currentTurn === state.playerColor) return "轮到你落子";
    return `等待${game.currentTurn === 1 ? "黑方" : "白方"}落子`;
  }

  function renderPlayer(color, name, active) {
    const isSelf = state.playerColor === color;
    return `
      <div class="gomoku-player ${active ? "is-active" : ""} ${!name ? "is-empty" : ""}">
        <i class="gomoku-player-piece color-${color}" aria-hidden="true"></i>
        <span><small>${color === 1 ? "黑方 · 先手" : "白方 · 后手"}</small><strong>${escapeHTML(name || "等待加入")}${isSelf ? "（你）" : ""}</strong></span>
      </div>`;
  }

  function renderBoard(game) {
    const board = [...game.board];
    if (state.pendingMove >= 0 && !board[state.pendingMove]) board[state.pendingMove] = state.playerColor;
    const enabled = canMove();
    return board.map((color, index) => {
      const row = Math.floor(index / BOARD_SIZE);
      const col = index % BOARD_SIZE;
      const last = game.lastMove?.row === row && game.lastMove?.col === col;
      const pending = state.pendingMove === index;
      const classes = ["gomoku-cell", color ? `has-color-${color}` : "", last ? "is-last" : "", pending ? "is-pending" : ""]
        .filter(Boolean).join(" ");
      const label = color ? `${String.fromCharCode(65 + col)}${row + 1}，${color === 1 ? "黑棋" : "白棋"}` : `${String.fromCharCode(65 + col)}${row + 1}，空位`;
      return `<button type="button" class="${classes}" data-gomoku-cell="${index}" aria-label="${label}" ${color || !enabled ? "disabled" : ""}>${color ? `<span class="gomoku-piece color-${color}"></span>` : ""}</button>`;
    }).join("");
  }

  function renderRoom() {
    const game = state.game;
    if (!game) {
      return `
        <div class="fun-game-shell gomoku-page">${renderHeader()}
          <section class="gomoku-loading glass"><span></span><strong>正在恢复房间 ${escapeHTML(state.roomCode)}</strong></section>
        </div>`;
    }
    const connectionLabel = state.connection === "live" ? "实时连接正常" : state.connection === "error" ? "实时连接异常" : "正在连接";
    const finished = ["black_won", "white_won", "draw"].includes(game.status);
    return `
      <div class="fun-game-shell gomoku-page">
        ${renderHeader()}
        <div class="gomoku-room-bar glass">
          <div><span>房间码</span><strong>${escapeHTML(game.roomCode)}</strong></div>
          <button type="button" class="fun-action secondary" data-gomoku-copy>复制邀请链接</button>
          <span class="gomoku-connection is-${state.connection}"><i></i>${connectionLabel}</span>
          <button type="button" class="fun-action secondary" data-gomoku-exit>退出房间</button>
        </div>
        <div class="gomoku-match-layout">
          <section class="gomoku-board-shell glass">
            <div class="gomoku-board" role="grid" aria-label="15乘15五子棋棋盘">${renderBoard(game)}</div>
          </section>
          <aside class="gomoku-match-panel">
            <div class="gomoku-turn-card glass" aria-live="polite">
              <span>${game.status === "playing" ? `第 ${game.moveCount + 1} 手` : "棋局状态"}</span>
              <strong>${escapeHTML(getStatusText(game))}</strong>
              <p>${state.playerColor ? `你执${state.playerColor === 1 ? "黑" : "白"}棋` : "当前为观战模式"}</p>
            </div>
            <div class="gomoku-players glass">
              ${renderPlayer(1, game.blackName, game.status === "playing" && game.currentTurn === 1)}
              ${renderPlayer(2, game.whiteName, game.status === "playing" && game.currentTurn === 2)}
            </div>
            <div class="gomoku-actions glass">
              <button type="button" class="fun-action secondary" data-gomoku-refresh ${state.busy ? "disabled" : ""}>同步棋局</button>
              ${state.playerColor === 1 ? `<button type="button" class="fun-action gomoku-primary" data-gomoku-restart ${state.busy ? "disabled" : ""}>${finished ? "再来一局" : "重新开始"}</button>` : ""}
            </div>
            <p class="fun-help">黑方先手，横、竖或斜线率先连成五子获胜。</p>
          </aside>
        </div>
      </div>`;
  }

  function render() {
    if (!isConfigured()) return renderSetup();
    return state.view === "room" ? renderRoom() : renderLobby();
  }

  function handleClick(event) {
    if (event.target.closest("[data-gomoku-create]")) { createRoom(); return true; }
    if (event.target.closest("[data-gomoku-join]")) { joinRoom(); return true; }
    if (event.target.closest("[data-gomoku-copy]")) { copyInvite(); return true; }
    if (event.target.closest("[data-gomoku-refresh]")) { refreshRoom(); return true; }
    if (event.target.closest("[data-gomoku-restart]")) { restartGame(); return true; }
    if (event.target.closest("[data-gomoku-exit]")) { exitRoom(); return true; }
    const cell = event.target.closest("[data-gomoku-cell]");
    if (cell) { makeMove(Number(cell.dataset.gomokuCell)); return true; }
    return false;
  }

  function afterRender(gameId) {
    runtime.active = gameId === "gomoku";
    if (!runtime.active || !isConfigured()) return;
    if (state.view === "room" && state.roomCode && !state.game) resumeRoom();
    else if (state.view === "room" && state.roomCode) subscribeToRoom(state.roomCode);
  }

  function leave(gameId) {
    if (gameId !== "gomoku") return;
    runtime.active = false;
    unsubscribe();
  }

  function getSummary() {
    if (state.game) return `${state.game.roomCode} · ${getStatusText(state.game)}`;
    if (state.roomCode) return `${state.roomCode} · 等待恢复`;
    return "房间码双人实时对弈";
  }

  return {
    configure,
    render,
    handleClick,
    afterRender,
    leave,
    getSummary,
    __test: {
      BOARD_SIZE,
      CELL_COUNT,
      ROOM_CODE_PATTERN,
      normalizeBoard,
      normalizeGame,
      hasFive,
      loadIdentity,
    },
  };
});
