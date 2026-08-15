const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const modulePath = path.join(root, "src", "fun-games", "gomoku.js");
const cssPath = path.join(root, "src", "fun-games", "gomoku.css");
const configPath = path.join(root, "src", "supabase-config.js");
const migrationPath = path.join(root, "supabase", "migrations", "202608150001_gomoku_multiplayer.sql");
const roundMigrationPath = path.join(root, "supabase", "migrations", "202608150002_gomoku_round_timer.sql");

test("gomoku is registered in the existing fun area and wired to lifecycle events", () => {
  assert.match(html, /id:\s*"gomoku"[\s\S]*?name:\s*"联机五子棋"/);
  assert.match(html, /render:\s*GomokuGame\.render/);
  assert.match(html, /GomokuGame\.handleClick\(event\)/);
  assert.match(html, /GomokuGame\.afterRender\(game\.id\)/);
  assert.match(html, /GomokuGame\.leave\(activeGame\)/);
  assert.match(html, /@supabase\/supabase-js@2\.106\.2/);
});

test("gomoku module detects horizontal vertical and diagonal victories", () => {
  delete require.cache[require.resolve(modulePath)];
  const api = require(modulePath);
  const { BOARD_SIZE, CELL_COUNT, hasFive } = api.__test;
  assert.equal(BOARD_SIZE, 15);
  assert.equal(CELL_COUNT, 225);

  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const board = Array(CELL_COUNT).fill(0);
    const startRow = dc < 0 ? 7 : 3;
    const startCol = dc < 0 ? 8 : 3;
    for (let step = 0; step < 5; step += 1) {
      board[(startRow + dr * step) * BOARD_SIZE + startCol + dc * step] = 1;
    }
    assert.equal(hasFive(board, startRow + dr * 2, startCol + dc * 2, 1), true);
  }

  const broken = Array(CELL_COUNT).fill(0);
  [3, 4, 5, 7, 8].forEach(col => { broken[7 * BOARD_SIZE + col] = 2; });
  assert.equal(hasFive(broken, 7, 5, 2), false);
});

test("gomoku normalizes realtime snake_case and RPC camelCase payloads", () => {
  const api = require(modulePath);
  const board = Array(225).fill(0);
  board[17] = 2;
  const normalized = api.__test.normalizeGame({
    room_code: "ABC234",
    board,
    status: "playing",
    current_turn: 2,
    black_name: "小黑",
    white_name: "小白",
    move_count: 7,
    last_move: { row: 1, col: 2, color: 2 },
    version: 9,
    turn_seconds: 45,
    turn_deadline: "2026-08-15T12:00:00Z",
    finish_reason: "timeout",
    round_number: 3,
    black_seat: 2,
    seat1_ready: true,
    seat2_ready: false,
  });
  assert.equal(normalized.roomCode, "ABC234");
  assert.equal(normalized.currentTurn, 2);
  assert.equal(normalized.board[17], 2);
  assert.deepEqual(normalized.lastMove, { row: 1, col: 2, color: 2 });
  assert.equal(normalized.turnSeconds, 45);
  assert.equal(normalized.finishReason, "timeout");
  assert.equal(normalized.roundNumber, 3);
  assert.equal(normalized.blackSeat, 2);
  assert.equal(normalized.seat1Ready, true);
});

test("gomoku turn duration and countdown helpers enforce safe limits", () => {
  const api = require(modulePath);
  assert.equal(api.__test.DEFAULT_TURN_SECONDS, 60);
  assert.equal(api.__test.clampTurnSeconds(2), 10);
  assert.equal(api.__test.clampTurnSeconds(999), 600);
  assert.equal(api.__test.formatCountdown(60001), "01:01");
  assert.equal(api.__test.formatCountdown(0), "00:00");
});

test("gomoku layout is responsive and preserves a square 15 by 15 board", () => {
  const css = fs.readFileSync(cssPath, "utf8");
  assert.match(css, /\.gomoku-board\s*\{[\s\S]*?aspect-ratio:\s*1/);
  assert.match(css, /grid-template-columns:\s*repeat\(15,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /\.gomoku-grid-lines/);
  assert.match(css, /contain:\s*layout paint style/);
  assert.match(css, /\.gomoku-result-modal\[hidden\]/);
  assert.match(css, /body\.gomoku-active::after\s*\{[^}]*animation:\s*none/i);
  assert.match(css, /@media\s*\(max-width:\s*680px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("round migration applies authoritative timers, rematches, color swaps and room exit", () => {
  const sql = fs.readFileSync(roundMigrationPath, "utf8");
  assert.match(sql, /add column if not exists turn_seconds/i);
  assert.match(sql, /add column if not exists turn_deadline/i);
  assert.match(sql, /create or replace function public\.gomoku_claim_timeout/i);
  assert.match(sql, /create or replace function public\.gomoku_request_rematch/i);
  assert.match(sql, /create or replace function public\.gomoku_exit_game/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /black_seat\s*=\s*3\s*-\s*black_seat/i);
  assert.match(sql, /seat1_ready[\s\S]*?seat2_ready/i);
  assert.match(sql, /status\s*=\s*'closed'/i);
  assert.match(sql, /notify pgrst,\s*'reload schema'/i);
});

test("moves patch the board locally and expose timer/rematch RPC actions", () => {
  const source = fs.readFileSync(modulePath, "utf8");
  const moveFunction = source.match(/async function makeMove\(index\)[\s\S]*?\n  }\n\n  async function claimTimeout/)[0];
  assert.match(moveFunction, /patchCell\(cell, color, \{ pending: true \}\)/);
  assert.doesNotMatch(moveFunction, /callbacks\.rerender/);
  assert.match(source, /p_turn_seconds:\s*turnSeconds/);
  assert.match(source, /gomoku_claim_timeout/);
  assert.match(source, /gomoku_request_rematch/);
  assert.match(source, /gomoku_exit_game/);
  assert.match(source, /next\.version === state\.game\.version/);
});

test("database migration keeps player tokens private and validates moves atomically", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.match(sql, /create schema if not exists private/i);
  assert.match(sql, /create table if not exists private\.gomoku_players/i);
  assert.match(sql, /alter table public\.gomoku_games enable row level security/i);
  assert.match(sql, /grant select on public\.gomoku_games to anon, authenticated/i);
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete).*gomoku_games.*anon/i);
  assert.match(sql, /create or replace function public\.gomoku_make_move/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /private\.gomoku_has_five/i);
  assert.match(sql, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(sql, /supabase_realtime add table public\.gomoku_games/i);
});

test("frontend config contains only the public project URL and a browser-safe publishable key", () => {
  const config = fs.readFileSync(configPath, "utf8");
  assert.match(config, /https:\/\/xdrkgauohmyxgrmvakgk\.supabase\.co/);
  assert.match(config, /publishableKey:\s*["'](?:sb_publishable_[^"']+|)["']/);
  assert.doesNotMatch(config, /sb_secret_|service_role|database password/i);

  const build = fs.readFileSync(path.join(root, "scripts", "build-production.mjs"), "utf8");
  assert.match(build, /src\/fun-games\/gomoku\.js/);
  assert.match(build, /src\/supabase-config\.js/);
});
