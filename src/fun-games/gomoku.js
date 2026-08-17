(function attachGomokuGame(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GomokuGame = api;
})(typeof window !== "undefined" ? window : globalThis, function createGomokuGame(root) {
  "use strict";

  const BOARD_SIZE = 15;
  const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
  const DEFAULT_TURN_SECONDS = 60;
  const MIN_TURN_SECONDS = 10;
  const MAX_TURN_SECONDS = 600;
  const IDENTITY_KEY = "glass_nav_gomoku_identity_v2";
  const LEGACY_IDENTITY_KEY = "glass_nav_gomoku_identity_v1";
  const ROOM_CODE_PATTERN = /^[A-Z2-9]{6}$/;
  const FINISHED_STATES = new Set(["black_won", "white_won", "draw"]);
  const callbacks = { rerender: () => {}, toast: () => {}, getPlayerName: () => "", getClient: () => null };
  const runtime = {
    active: false,
    client: null,
    channel: null,
    channelRoom: "",
    timerId: null,
    timeoutClaiming: false,
    timeoutRetryAt: 0,
  };

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

  function clampTurnSeconds(value) {
    const number = Math.round(Number(value));
    if (!Number.isFinite(number)) return DEFAULT_TURN_SECONDS;
    return Math.max(MIN_TURN_SECONDS, Math.min(MAX_TURN_SECONDS, number));
  }

  function loadIdentity(storage = getStorage()) {
    const fallback = { token: makeToken(), name: "", roomCode: "", playerSeat: 0, turnSeconds: DEFAULT_TURN_SECONDS };
    if (!storage) return fallback;
    try {
      const current = JSON.parse(storage.getItem(IDENTITY_KEY) || "null");
      const legacy = current || JSON.parse(storage.getItem(LEGACY_IDENTITY_KEY) || "null");
      return {
        token: typeof legacy?.token === "string" && legacy.token.length >= 20 ? legacy.token : fallback.token,
        name: typeof legacy?.name === "string" ? legacy.name.slice(0, 20) : "",
        roomCode: ROOM_CODE_PATTERN.test(String(legacy?.roomCode || "")) ? legacy.roomCode : "",
        playerSeat: [1, 2].includes(Number(legacy?.playerSeat ?? legacy?.playerColor)) ? Number(legacy.playerSeat ?? legacy.playerColor) : 0,
        turnSeconds: clampTurnSeconds(legacy?.turnSeconds),
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
    playerSeat: identity.playerSeat || 0,
    game: null,
    busy: false,
    busyMove: false,
    loading: false,
    pendingMove: -1,
    connection: "idle",
    error: "",
    serverOffsetMs: 0,
  };

  function persistIdentity() {
    const storage = getStorage();
    if (!storage) return;
    try { storage.setItem(IDENTITY_KEY, JSON.stringify(identity)); } catch (error) { /* 仅影响自动恢复。 */ }
  }

  function configure(options = {}) {
    if (typeof options.rerender === "function") callbacks.rerender = options.rerender;
    if (typeof options.toast === "function") callbacks.toast = options.toast;
    if (typeof options.getPlayerName === "function") callbacks.getPlayerName = options.getPlayerName;
    if (typeof options.getClient === "function") callbacks.getClient = options.getClient;
  }

  function getAccountName() {
    try { return String(callbacks.getPlayerName() || "").trim().slice(0, 20); } catch (error) { return ""; }
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
    if (runtime.client) return runtime.client;
    const sharedClient = callbacks.getClient();
    if (sharedClient) {
      runtime.client = sharedClient;
      return runtime.client;
    }
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
        ? { row: Number(lastMove.row), col: Number(lastMove.col), color: Number(lastMove.color) } : null,
      version: Math.max(0, Number(raw.version) || 0),
      turnSeconds: clampTurnSeconds(raw.turnSeconds ?? raw.turn_seconds),
      turnDeadline: String(raw.turnDeadline || raw.turn_deadline || ""),
      startedAt: String(raw.startedAt || raw.started_at || ""),
      finishReason: String(raw.finishReason || raw.finish_reason || ""),
      roundNumber: Math.max(1, Number(raw.roundNumber ?? raw.round_number) || 1),
      blackSeat: Number(raw.blackSeat ?? raw.black_seat) === 2 ? 2 : 1,
      seat1Ready: Boolean(raw.seat1Ready ?? raw.seat1_ready),
      seat2Ready: Boolean(raw.seat2Ready ?? raw.seat2_ready),
      closedBySeat: [1, 2].includes(Number(raw.closedBySeat ?? raw.closed_by_seat)) ? Number(raw.closedBySeat ?? raw.closed_by_seat) : 0,
      updatedAt: String(raw.updatedAt || raw.updated_at || ""),
      expiresAt: String(raw.expiresAt || raw.expires_at || ""),
      serverNow: String(raw.serverNow || ""),
    };
  }

  function hasFive(board, row, col, color) {
    if (!Array.isArray(board) || ![1, 2].includes(color)) return false;
    return [[1, 0], [0, 1], [1, 1], [1, -1]].some(([dr, dc]) => {
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

  function getPlayerColor(game = state.game) {
    if (!game || ![1, 2].includes(state.playerSeat)) return 0;
    return game.blackSeat === state.playerSeat ? 1 : 2;
  }

  function getMyReady(game = state.game) {
    return state.playerSeat === 1 ? game?.seat1Ready : state.playerSeat === 2 ? game?.seat2Ready : false;
  }

  function getOpponentReady(game = state.game) {
    return state.playerSeat === 1 ? game?.seat2Ready : state.playerSeat === 2 ? game?.seat1Ready : false;
  }

  function isFinished(game = state.game) { return Boolean(game && FINISHED_STATES.has(game.status)); }
  function isMyTurn(game = state.game) { return Boolean(game && game.status === "playing" && game.currentTurn === getPlayerColor(game)); }
  function canMove(game = state.game) { return Boolean(isMyTurn(game) && !state.busyMove && state.pendingMove < 0); }

  function updateServerOffset(game) {
    const serverTime = Date.parse(game?.serverNow || game?.updatedAt || "");
    if (Number.isFinite(serverTime)) state.serverOffsetMs = serverTime - Date.now();
  }

  function serverNow() { return Date.now() + state.serverOffsetMs; }

  function getRemainingMs(game = state.game) {
    if (!game?.turnDeadline || game.status !== "playing") return null;
    const deadline = Date.parse(game.turnDeadline);
    return Number.isFinite(deadline) ? Math.max(0, deadline - serverNow()) : null;
  }

  function formatCountdown(milliseconds) {
    if (milliseconds == null) return "--:--";
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
  }

  async function callRpc(name, args) {
    const client = ensureClient();
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || "联机请求失败");
    if (!data) throw new Error("服务器没有返回棋局数据");
    return data;
  }

  function requestStructuralRender() { if (runtime.active) callbacks.rerender(); }

  function persistRoomIdentity() {
    identity.roomCode = state.roomCode;
    identity.playerSeat = state.playerSeat;
    persistIdentity();
  }

  function clearRoomIdentity() {
    identity.roomCode = "";
    identity.playerSeat = 0;
    persistIdentity();
  }

  function enterRoom(result) {
    const playerSeat = Number(result?.playerSeat ?? result?.playerColor);
    if ([1, 2].includes(playerSeat)) state.playerSeat = playerSeat;
    state.game = normalizeGame(result);
    updateServerOffset(state.game);
    state.roomCode = state.game.roomCode;
    state.view = "room";
    state.error = "";
    state.pendingMove = -1;
    state.busyMove = false;
    persistRoomIdentity();
    requestStructuralRender();
  }

  function setText(selector, value) {
    const node = root.document?.querySelector(selector);
    const next = String(value ?? "");
    if (node && node.textContent !== next) node.textContent = next;
  }

  function setHidden(node, hidden) { if (node && node.hidden !== Boolean(hidden)) node.hidden = Boolean(hidden); }

  function patchLobbyBusy() {
    const createButton = root.document?.querySelector("[data-gomoku-create]");
    const joinButton = root.document?.querySelector("[data-gomoku-join]");
    if (createButton) {
      createButton.disabled = state.busy;
      createButton.textContent = state.busy ? "连接中…" : "创建新房间";
    }
    if (joinButton) joinButton.disabled = state.busy;
  }

  function setBusy(value) {
    state.busy = Boolean(value);
    patchLobbyBusy();
    patchRoomActions();
  }

  function getInputValue(selector) { return String(root.document?.querySelector(selector)?.value || "").trim(); }

  function validateName(value) {
    const name = String(value || "").trim();
    if (!name) throw new Error("请先填写玩家昵称");
    if (name.length > 20) throw new Error("昵称最多填写 20 个字符");
    return name;
  }

  function validateTurnSeconds(value) {
    const seconds = Number(value);
    if (!Number.isInteger(seconds) || seconds < MIN_TURN_SECONDS || seconds > MAX_TURN_SECONDS) {
      throw new Error(`每步时间需要设置为 ${MIN_TURN_SECONDS} 到 ${MAX_TURN_SECONDS} 秒`);
    }
    return seconds;
  }

  async function createRoom() {
    if (state.busy) return;
    try {
      const name = validateName(getAccountName() || getInputValue("[data-gomoku-name]"));
      const turnSeconds = validateTurnSeconds(getInputValue("[data-gomoku-turn-seconds]"));
      identity.name = name;
      identity.turnSeconds = turnSeconds;
      persistIdentity();
      setBusy(true);
      const result = await callRpc("gomoku_create_game", {
        p_player_name: name, p_player_token: identity.token, p_turn_seconds: turnSeconds,
      });
      enterRoom(result);
      callbacks.toast(`房间 ${state.roomCode} 创建成功`, "success");
    } catch (error) {
      state.error = error.message;
      setText("[data-gomoku-error]", error.message);
      callbacks.toast(error.message, "error");
    } finally { setBusy(false); }
  }

  async function joinRoom() {
    if (state.busy) return;
    try {
      const name = validateName(getAccountName() || getInputValue("[data-gomoku-name]"));
      const roomCode = getInputValue("[data-gomoku-code]").toUpperCase();
      if (!ROOM_CODE_PATTERN.test(roomCode)) throw new Error("请输入正确的 6 位房间码");
      identity.name = name;
      persistIdentity();
      setBusy(true);
      const result = await callRpc("gomoku_join_game", {
        p_room_code: roomCode, p_player_name: name, p_player_token: identity.token,
      });
      enterRoom(result);
      callbacks.toast(`已加入房间 ${state.roomCode}`, "success");
    } catch (error) {
      state.error = error.message;
      setText("[data-gomoku-error]", error.message);
      callbacks.toast(error.message, "error");
    } finally { setBusy(false); }
  }

  async function resumeRoom() {
    if (state.loading || !state.roomCode || !isConfigured()) return;
    state.loading = true;
    state.error = "";
    try {
      const result = await callRpc("gomoku_get_game", { p_room_code: state.roomCode, p_player_token: identity.token });
      const playerSeat = Number(result?.playerSeat ?? result?.playerColor);
      if ([1, 2].includes(playerSeat)) state.playerSeat = playerSeat;
      state.game = normalizeGame(result);
      updateServerOffset(state.game);
      if (state.game.status === "closed") { handleClosedRoom(state.game); return; }
      persistRoomIdentity();
      requestStructuralRender();
    } catch (error) {
      state.error = error.message;
      state.view = "lobby";
      state.roomCode = "";
      state.playerSeat = 0;
      state.game = null;
      clearRoomIdentity();
      requestStructuralRender();
    } finally { state.loading = false; }
  }

  async function refreshRoom(options = {}) {
    if (!state.roomCode || state.busy) return;
    try {
      if (!options.silent) setBusy(true);
      const result = await callRpc("gomoku_get_game", { p_room_code: state.roomCode, p_player_token: identity.token });
      applyRpcResult(result);
    } catch (error) {
      if (!options.silent) callbacks.toast(error.message, "error");
    } finally { if (!options.silent) setBusy(false); }
  }

  function patchCell(node, color, options = {}) {
    if (!node) return;
    const safeColor = [1, 2].includes(Number(color)) ? Number(color) : 0;
    if (Number(node.dataset.color || 0) !== safeColor) {
      node.dataset.color = String(safeColor);
      node.innerHTML = safeColor ? `<span class="gomoku-piece color-${safeColor}"></span>` : "";
    }
    node.classList.toggle("has-color-1", safeColor === 1);
    node.classList.toggle("has-color-2", safeColor === 2);
    node.classList.toggle("is-last", Boolean(options.last));
    node.classList.toggle("is-pending", Boolean(options.pending));
    node.disabled = safeColor !== 0;
    node.setAttribute("aria-disabled", safeColor || !canMove() ? "true" : "false");
  }

  function patchBoard(previous, next) {
    const boardNode = root.document?.querySelector(".gomoku-board");
    const cells = boardNode?.querySelectorAll("[data-gomoku-cell]");
    if (!boardNode || !cells || cells.length !== CELL_COUNT) return false;
    const previousLast = previous?.lastMove ? previous.lastMove.row * BOARD_SIZE + previous.lastMove.col : -1;
    const nextLast = next?.lastMove ? next.lastMove.row * BOARD_SIZE + next.lastMove.col : -1;
    for (let index = 0; index < CELL_COUNT; index += 1) {
      if (!previous || previous.board[index] !== next.board[index] || index === previousLast || index === nextLast || index === state.pendingMove) {
        patchCell(cells[index], next.board[index], { last: index === nextLast });
      } else {
        cells[index].setAttribute("aria-disabled", next.board[index] || !canMove(next) ? "true" : "false");
      }
    }
    boardNode.classList.toggle("is-my-turn", canMove(next));
    boardNode.classList.toggle("is-locked", !canMove(next));
    return true;
  }

  function getStatusText(game) {
    if (!game) return "正在恢复棋局…";
    if (game.status === "waiting") return "等待白方加入";
    if (game.status === "black_won") return `${game.blackName}（黑方）获胜`;
    if (game.status === "white_won") return `${game.whiteName || "白方"}（白方）获胜`;
    if (game.status === "draw") return "棋盘已满，本局和棋";
    if (game.moveCount === 0) return "等待黑方落下第一颗棋子";
    if (game.currentTurn === getPlayerColor(game)) return "轮到你落子";
    return `等待${game.currentTurn === 1 ? "黑方" : "白方"}落子`;
  }

  function patchPlayer(color, name, game) {
    const node = root.document?.querySelector(`[data-gomoku-player="${color}"]`);
    if (!node) return;
    const isSelf = getPlayerColor(game) === color;
    node.classList.toggle("is-active", game.status === "playing" && game.currentTurn === color);
    node.classList.toggle("is-empty", !name);
    setText(`[data-gomoku-player-name="${color}"]`, `${name || "等待加入"}${isSelf ? "（你）" : ""}`);
  }

  function getResultCopy(game) {
    if (game.status === "draw") return { title: "本局和棋", detail: "棋盘已经落满，双方平分秋色。" };
    const won = game.winner === getPlayerColor(game);
    if (game.finishReason === "timeout") {
      return won ? { title: "你赢了", detail: "对方落子超时，本局判负。" } : { title: "本局惜败", detail: "你的落子时间已用完，本局判负。" };
    }
    return won ? { title: "五子连珠，你赢了", detail: "漂亮的一局！双方确认后将交换黑白方。" }
      : { title: "对方获胜", detail: "本局已经结束，双方确认后可以换边再战。" };
  }

  function patchResultModal(game) {
    const modal = root.document?.querySelector("[data-gomoku-result-modal]");
    const visible = isFinished(game);
    setHidden(modal, !visible);
    if (!modal || !visible) return;
    const copy = getResultCopy(game);
    const myReady = getMyReady(game);
    const opponentReady = getOpponentReady(game);
    setText("[data-gomoku-result-title]", copy.title);
    setText("[data-gomoku-result-detail]", copy.detail);
    setText("[data-gomoku-result-round]", `第 ${game.roundNumber} 局`);
    const rematchButton = modal.querySelector("[data-gomoku-rematch]");
    if (rematchButton) {
      rematchButton.disabled = state.busy || myReady;
      rematchButton.textContent = myReady ? "已准备，等待对方" : "再来一局";
    }
    const exitButton = modal.querySelector("[data-gomoku-exit]");
    if (exitButton) exitButton.disabled = state.busy;
    setText("[data-gomoku-rematch-status]", myReady
      ? opponentReady ? "双方已确认，正在开始下一局…" : "已发送再来一局请求，等待对方确认"
      : opponentReady ? "对方想再来一局，等待你的选择" : "双方都选择再来一局后才会开启下一局");
  }

  function patchRoomActions() {
    const refreshButton = root.document?.querySelector("[data-gomoku-refresh]");
    if (refreshButton) refreshButton.disabled = state.busy;
    const topExit = root.document?.querySelector(".gomoku-room-bar [data-gomoku-exit]");
    if (topExit) topExit.disabled = state.busy;
    if (state.game) patchResultModal(state.game);
  }

  function patchConnection() {
    const node = root.document?.querySelector("[data-gomoku-connection]");
    if (!node) return;
    const label = state.connection === "live" ? "实时连接正常" : state.connection === "error" ? "实时连接异常" : "正在连接";
    node.className = `gomoku-connection is-${state.connection}`;
    node.innerHTML = `<i></i>${label}`;
  }

  function patchTimerDom() {
    const game = state.game;
    const remaining = getRemainingMs(game);
    const timer = root.document?.querySelector("[data-gomoku-timer]");
    const bar = root.document?.querySelector("[data-gomoku-timer-bar]");
    if (!timer || !game) return;
    const countdownText = formatCountdown(remaining);
    if (timer.textContent !== countdownText) timer.textContent = countdownText;
    timer.classList.toggle("is-warning", remaining != null && remaining <= 10000);
    timer.classList.toggle("is-idle", remaining == null);
    if (bar) {
      const progress = remaining == null ? 1 : Math.max(0, Math.min(1, remaining / (game.turnSeconds * 1000)));
      bar.style.transform = `scaleX(${progress})`;
      bar.classList.toggle("is-warning", remaining != null && remaining <= 10000);
    }
    setText("[data-gomoku-timer-label]", remaining == null
      ? game.status === "playing" && game.moveCount === 0 ? "首子落下后开始计时" : "本局计时已停止"
      : `${game.currentTurn === 1 ? "黑方" : "白方"}本步剩余`);
    if (remaining === 0 && game.status === "playing" && !runtime.timeoutClaiming && Date.now() >= runtime.timeoutRetryAt) claimTimeout();
  }

  function startClock() {
    if (runtime.timerId != null) return;
    runtime.timerId = root.setInterval(patchTimerDom, root.document?.hidden ? 1000 : 200);
    patchTimerDom();
  }

  function stopClock() {
    if (runtime.timerId != null) root.clearInterval(runtime.timerId);
    runtime.timerId = null;
    runtime.timeoutClaiming = false;
  }

  function patchRoomDom(previous, next) {
    if (!root.document?.querySelector(".gomoku-board")) return false;
    patchBoard(previous, next);
    setText("[data-gomoku-status]", getStatusText(next));
    setText("[data-gomoku-role]", `你执${getPlayerColor(next) === 1 ? "黑" : "白"}棋`);
    setText("[data-gomoku-round]", `第 ${next.roundNumber} 局`);
    setText("[data-gomoku-move-count]", next.status === "playing" ? `第 ${next.moveCount + 1} 手` : "棋局状态");
    setText("[data-gomoku-turn-seconds-copy]", `每步 ${next.turnSeconds} 秒`);
    patchPlayer(1, next.blackName, next);
    patchPlayer(2, next.whiteName, next);
    patchResultModal(next);
    patchConnection();
    patchRoomActions();
    patchTimerDom();
    return true;
  }

  function handleClosedRoom(game) {
    const otherExited = game.closedBySeat && game.closedBySeat !== state.playerSeat;
    unsubscribe();
    stopClock();
    state.view = "lobby";
    state.roomCode = "";
    state.playerSeat = 0;
    state.game = null;
    state.pendingMove = -1;
    state.busyMove = false;
    state.connection = "idle";
    clearRoomIdentity();
    requestStructuralRender();
    callbacks.toast(otherExited ? "对方已退出，房间已经关闭" : "已退出房间", otherExited ? "error" : "success");
  }

  function applyGame(nextGame, options = {}) {
    const next = normalizeGame(nextGame);
    if (state.game && next.version < state.game.version) return false;
    if (state.game && next.version === state.game.version && !options.force) return false;
    updateServerOffset(next);
    if (next.status === "closed") { handleClosedRoom(next); return true; }
    const previous = state.game;
    const previousRound = previous?.roundNumber || next.roundNumber;
    state.game = next;
    state.roomCode = next.roomCode;
    state.pendingMove = -1;
    state.busyMove = false;
    persistRoomIdentity();
    if (!patchRoomDom(previous, next)) requestStructuralRender();
    if (next.roundNumber > previousRound) callbacks.toast(`第 ${next.roundNumber} 局开始，双方已互换黑白方`, "success");
    if (isFinished(next) && (!previous || !isFinished(previous))) {
      callbacks.toast(next.finishReason === "timeout" ? "本步超时，棋局结束" : "本局已经结束", next.winner === getPlayerColor(next) ? "success" : "error");
    }
    return true;
  }

  function applyRpcResult(result, options = {}) {
    const playerSeat = Number(result?.playerSeat ?? result?.playerColor);
    if ([1, 2].includes(playerSeat)) state.playerSeat = playerSeat;
    return applyGame(result, { force: true, ...options });
  }

  async function subscribeToRoom(roomCode) {
    if (!roomCode || runtime.channelRoom === roomCode && runtime.channel) return;
    const client = ensureClient();
    await unsubscribe();
    state.connection = "connecting";
    patchConnection();
    runtime.channelRoom = roomCode;
    runtime.channel = client.channel(`gomoku-room-${roomCode}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "gomoku_games", filter: `room_code=eq.${roomCode}` }, payload => applyGame(payload.new))
      .subscribe(status => {
        const next = status === "SUBSCRIBED" ? "live" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "error" : "connecting";
        if (state.connection !== next) { state.connection = next; patchConnection(); }
      });
  }

  async function unsubscribe() {
    if (!runtime.channel || !runtime.client) { runtime.channel = null; runtime.channelRoom = ""; return; }
    const channel = runtime.channel;
    runtime.channel = null;
    runtime.channelRoom = "";
    try { await runtime.client.removeChannel(channel); } catch (error) { /* 页面切换时静默释放。 */ }
  }

  async function makeMove(index) {
    const game = state.game;
    if (!canMove(game) || game.board[index]) return;
    const row = Math.floor(index / BOARD_SIZE);
    const col = index % BOARD_SIZE;
    const color = getPlayerColor(game);
    state.pendingMove = index;
    state.busyMove = true;
    const cell = root.document?.querySelector(`[data-gomoku-cell="${index}"]`);
    patchCell(cell, color, { pending: true });
    const boardNode = root.document?.querySelector(".gomoku-board");
    boardNode?.classList.add("is-locked");
    boardNode?.classList.remove("is-my-turn");
    try {
      const result = await callRpc("gomoku_make_move", {
        p_room_code: state.roomCode, p_player_token: identity.token, p_row: row, p_col: col,
      });
      applyRpcResult(result);
    } catch (error) {
      state.pendingMove = -1;
      state.busyMove = false;
      patchCell(cell, game.board[index], { last: game.lastMove?.row === row && game.lastMove?.col === col });
      patchRoomDom(game, game);
      callbacks.toast(error.message, "error");
      refreshRoom({ silent: true });
    }
  }

  async function claimTimeout() {
    if (runtime.timeoutClaiming || !state.roomCode) return;
    runtime.timeoutClaiming = true;
    try {
      const result = await callRpc("gomoku_claim_timeout", { p_room_code: state.roomCode, p_player_token: identity.token });
      applyRpcResult(result);
    } catch (error) {
      runtime.timeoutRetryAt = Date.now() + 1000;
      if (!String(error.message).includes("尚未超时")) callbacks.toast(error.message, "error");
    } finally { runtime.timeoutClaiming = false; }
  }

  async function requestRematch() {
    if (state.busy || !isFinished()) return;
    try {
      setBusy(true);
      const result = await callRpc("gomoku_request_rematch", { p_room_code: state.roomCode, p_player_token: identity.token });
      applyRpcResult(result);
    } catch (error) { callbacks.toast(error.message, "error"); }
    finally { setBusy(false); }
  }

  async function exitRoom() {
    if (state.busy || !state.roomCode) return;
    if (!isFinished() && typeof root.confirm === "function" && !root.confirm("退出后整个房间会关闭，确定退出吗？")) return;
    try {
      setBusy(true);
      const result = await callRpc("gomoku_exit_game", { p_room_code: state.roomCode, p_player_token: identity.token });
      applyRpcResult(result);
    } catch (error) { callbacks.toast(error.message, "error"); }
    finally { setBusy(false); }
  }

  async function copyInvite() {
    const url = new URL(root.location?.href || "https://example.com/");
    url.searchParams.set("gomoku", state.roomCode);
    try { await root.navigator?.clipboard?.writeText(url.toString()); callbacks.toast("邀请链接已复制", "success"); }
    catch (error) { callbacks.toast(`房间码：${state.roomCode}`, "success"); }
  }

  const GRID_PATH = Array.from({ length: BOARD_SIZE }, (_, index) => {
    const position = index * 10;
    return `M 0 ${position} H 140 M ${position} 0 V 140`;
  }).join(" ");

  function renderHeader() {
    return `<header class="fun-game-header gomoku-header"><div class="fun-game-title-row"><span class="fun-game-title-icon" aria-hidden="true">⚫</span><div><h1>联机五子棋</h1><p>15 × 15 棋盘 · 每步计时 · Supabase 实时同步</p></div></div></header>`;
  }

  function renderSetup() {
    return `<div class="fun-game-shell gomoku-page">${renderHeader()}<section class="gomoku-setup glass"><span class="gomoku-setup-icon" aria-hidden="true">🔑</span><div><h2>还差一步即可联机</h2><p>请在 <code>src/supabase-config.js</code> 中填写 Publishable key，并依次执行两份五子棋数据库迁移脚本。</p><p class="gomoku-safe-note">只能填写 <code>sb_publishable_...</code>，不要填写 Secret key。</p></div></section></div>`;
  }

  function renderLobby() {
    const accountName = getAccountName();
    const playerName = accountName || identity.name;
    return `<div class="fun-game-shell gomoku-page">${renderHeader()}<section class="gomoku-lobby glass"><div class="gomoku-lobby-copy"><span class="gomoku-kicker">双人实时对弈</span><h2>创建房间，邀请朋友落子</h2><p>房主首局执黑。第一颗棋子落下后开始逐步计时，每局结束双方确认再战并自动换边。</p></div><div class="gomoku-lobby-form"><label>玩家昵称<input type="text" maxlength="20" autocomplete="nickname" data-gomoku-name value="${escapeHTML(playerName)}" placeholder="输入你的昵称" ${accountName ? "readonly aria-readonly=\"true\"" : ""} /></label>${accountName ? '<p class="gomoku-form-hint">已使用账号昵称，需要修改时请前往“设置 → 账号设置”。</p>' : ""}<label>每步时间（秒）<input type="number" min="${MIN_TURN_SECONDS}" max="${MAX_TURN_SECONDS}" step="1" inputmode="numeric" data-gomoku-turn-seconds value="${identity.turnSeconds}" /></label><p class="gomoku-form-hint">默认 60 秒，可设置 10～600 秒；创建后由房间统一使用。</p><button type="button" class="fun-action gomoku-primary" data-gomoku-create>创建新房间</button><div class="gomoku-divider"><span>或者加入朋友的房间</span></div><label>房间码<input type="text" maxlength="6" autocapitalize="characters" data-gomoku-code value="${escapeHTML(state.prefillCode)}" placeholder="例如 A7KM2P" /></label><button type="button" class="fun-action secondary" data-gomoku-join>加入房间</button><p class="gomoku-error" data-gomoku-error role="alert">${escapeHTML(state.error)}</p></div></section><p class="fun-help">棋局有效期为 24 小时。请使用无痕窗口或另一台设备模拟第二位玩家。</p></div>`;
  }

  function renderPlayer(color, name, game) {
    const isSelf = getPlayerColor(game) === color;
    const active = game.status === "playing" && game.currentTurn === color;
    return `<div class="gomoku-player ${active ? "is-active" : ""} ${!name ? "is-empty" : ""}" data-gomoku-player="${color}"><i class="gomoku-player-piece color-${color}" aria-hidden="true"></i><span><small>${color === 1 ? "黑方 · 先手" : "白方 · 后手"}</small><strong data-gomoku-player-name="${color}">${escapeHTML(name || "等待加入")}${isSelf ? "（你）" : ""}</strong></span></div>`;
  }

  function renderBoard(game) {
    const cells = game.board.map((color, index) => {
      const row = Math.floor(index / BOARD_SIZE);
      const col = index % BOARD_SIZE;
      const last = game.lastMove?.row === row && game.lastMove?.col === col;
      const classes = ["gomoku-cell", color ? `has-color-${color}` : "", last ? "is-last" : ""].filter(Boolean).join(" ");
      const label = color ? `${String.fromCharCode(65 + col)}${row + 1}，${color === 1 ? "黑棋" : "白棋"}` : `${String.fromCharCode(65 + col)}${row + 1}，空位`;
      return `<button type="button" class="${classes}" data-gomoku-cell="${index}" data-color="${color}" aria-label="${label}" aria-disabled="${color || !canMove(game) ? "true" : "false"}" ${color ? "disabled" : ""}>${color ? `<span class="gomoku-piece color-${color}"></span>` : ""}</button>`;
    }).join("");
    return `<svg class="gomoku-grid-lines" viewBox="0 0 140 140" preserveAspectRatio="none" aria-hidden="true"><path d="${GRID_PATH}"></path></svg>${cells}`;
  }

  function renderResultModal(game) {
    const visible = isFinished(game);
    const copy = visible ? getResultCopy(game) : { title: "本局结束", detail: "" };
    const myReady = getMyReady(game);
    const opponentReady = getOpponentReady(game);
    const readyText = myReady ? opponentReady ? "双方已确认，正在开始下一局…" : "已发送再来一局请求，等待对方确认" : opponentReady ? "对方想再来一局，等待你的选择" : "双方都选择再来一局后才会开启下一局";
    return `<div class="gomoku-result-modal" data-gomoku-result-modal ${visible ? "" : "hidden"}><section class="gomoku-result-dialog glass" role="dialog" aria-modal="true" aria-labelledby="gomokuResultTitle"><span class="gomoku-result-round" data-gomoku-result-round>第 ${game.roundNumber} 局</span><h2 id="gomokuResultTitle" data-gomoku-result-title>${escapeHTML(copy.title)}</h2><p data-gomoku-result-detail>${escapeHTML(copy.detail)}</p><div class="gomoku-result-actions"><button type="button" class="fun-action gomoku-primary" data-gomoku-rematch ${myReady ? "disabled" : ""}>${myReady ? "已准备，等待对方" : "再来一局"}</button><button type="button" class="fun-action secondary" data-gomoku-exit>退出房间</button></div><small data-gomoku-rematch-status>${escapeHTML(readyText)}</small></section></div>`;
  }

  function renderRoom() {
    const game = state.game;
    if (!game) return `<div class="fun-game-shell gomoku-page">${renderHeader()}<section class="gomoku-loading glass"><span></span><strong>正在恢复房间 ${escapeHTML(state.roomCode)}</strong></section></div>`;
    return `<div class="fun-game-shell gomoku-page">${renderHeader()}<div class="gomoku-room-bar glass"><div><span>房间码</span><strong>${escapeHTML(game.roomCode)}</strong></div><button type="button" class="fun-action secondary" data-gomoku-copy>复制邀请链接</button><span class="gomoku-connection is-${state.connection}" data-gomoku-connection><i></i>正在连接</span><button type="button" class="fun-action secondary" data-gomoku-exit>退出房间</button></div><div class="gomoku-match-layout"><section class="gomoku-board-shell glass"><div class="gomoku-board ${canMove(game) ? "is-my-turn" : "is-locked"}" role="grid" aria-label="15乘15五子棋棋盘">${renderBoard(game)}</div></section><aside class="gomoku-match-panel"><div class="gomoku-turn-card glass" aria-live="polite"><div class="gomoku-turn-meta"><span data-gomoku-round>第 ${game.roundNumber} 局</span><span data-gomoku-turn-seconds-copy>每步 ${game.turnSeconds} 秒</span></div><span data-gomoku-move-count>${game.status === "playing" ? `第 ${game.moveCount + 1} 手` : "棋局状态"}</span><strong data-gomoku-status>${escapeHTML(getStatusText(game))}</strong><p data-gomoku-role>你执${getPlayerColor(game) === 1 ? "黑" : "白"}棋</p></div><div class="gomoku-timer-card glass"><span data-gomoku-timer-label>${game.moveCount === 0 ? "首子落下后开始计时" : "本步剩余"}</span><strong class="is-idle" data-gomoku-timer>${formatCountdown(getRemainingMs(game))}</strong><div class="gomoku-timer-track"><i data-gomoku-timer-bar></i></div></div><div class="gomoku-players glass">${renderPlayer(1, game.blackName, game)}${renderPlayer(2, game.whiteName, game)}</div><div class="gomoku-actions glass"><button type="button" class="fun-action secondary" data-gomoku-refresh>同步棋局</button></div><p class="fun-help">黑方先手，横、竖或斜线率先连成五子获胜；每步超时自动判负。</p></aside></div>${renderResultModal(game)}</div>`;
  }

  function render() { if (!isConfigured()) return renderSetup(); return state.view === "room" ? renderRoom() : renderLobby(); }

  function handleClick(event) {
    if (event.target.closest("[data-gomoku-create]")) { createRoom(); return true; }
    if (event.target.closest("[data-gomoku-join]")) { joinRoom(); return true; }
    if (event.target.closest("[data-gomoku-copy]")) { copyInvite(); return true; }
    if (event.target.closest("[data-gomoku-refresh]")) { refreshRoom(); return true; }
    if (event.target.closest("[data-gomoku-rematch]")) { requestRematch(); return true; }
    if (event.target.closest("[data-gomoku-exit]")) { exitRoom(); return true; }
    const cell = event.target.closest("[data-gomoku-cell]");
    if (cell) { makeMove(Number(cell.dataset.gomokuCell)); return true; }
    return false;
  }

  function afterRender(gameId) {
    runtime.active = gameId === "gomoku";
    root.document?.body?.classList.toggle("gomoku-active", runtime.active);
    if (!runtime.active || !isConfigured()) return;
    if (state.view === "room" && state.roomCode && !state.game) { resumeRoom(); return; }
    if (state.view === "room" && state.roomCode) {
      patchRoomDom(null, state.game);
      subscribeToRoom(state.roomCode);
      startClock();
    }
  }

  function leave(gameId) {
    if (gameId !== "gomoku") return;
    runtime.active = false;
    root.document?.body?.classList.remove("gomoku-active");
    stopClock();
    unsubscribe();
  }

  function getSummary() {
    if (state.game) return `${state.game.roomCode} · 第 ${state.game.roundNumber} 局`;
    if (state.roomCode) return `${state.roomCode} · 等待恢复`;
    return "房间码双人实时对弈";
  }

  return {
    configure, render, handleClick, afterRender, leave, getSummary,
    __test: {
      BOARD_SIZE, CELL_COUNT, DEFAULT_TURN_SECONDS, MIN_TURN_SECONDS, MAX_TURN_SECONDS,
      ROOM_CODE_PATTERN, normalizeBoard, normalizeGame, hasFive, loadIdentity,
      clampTurnSeconds, formatCountdown,
    },
  };
});
