(function attachFunGames(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FunGames = api;
})(typeof window !== "undefined" ? window : globalThis, function createFunGames(root) {
  "use strict";

  const STORAGE_KEY = "glass_nav_fun_games_v1";
  const STORAGE_VERSION = 1;
  const SUDOKU_DIFFICULTIES = {
    easy: { label: "简单", targetClues: 40, seedOffset: 11 },
    medium: { label: "中等", targetClues: 34, seedOffset: 29 },
    hard: { label: "困难", targetClues: 28, seedOffset: 47 },
  };
  const MINE_CONFIGS = {
    easy: { label: "简单", rows: 9, cols: 9, mines: 10 },
    medium: { label: "中等", rows: 16, cols: 16, mines: 40 },
    hard: { label: "困难", rows: 16, cols: 30, mines: 99 },
  };
  const MEMORY_CONFIGS = {
    3: { label: "3 × 3", duration: 3000 },
    4: { label: "4 × 4", duration: 5000 },
    5: { label: "5 × 5", duration: 7000 },
    6: { label: "6 × 6", duration: 10000 },
  };
  const MEMORY_STATES = ["idle", "memorizing", "hiding", "playing", "won", "lost"];

  function createDefaultData() {
    const sudokuRecords = {};
    const mineRecords = {};
    for (const key of Object.keys(SUDOKU_DIFFICULTIES)) {
      sudokuRecords[key] = { highestCompleted: 0, bestTime: null };
      mineRecords[key] = { bestTime: null, wins: 0 };
    }
    const memoryRecords = {};
    const currentLevels = {};
    for (const size of Object.keys(MEMORY_CONFIGS)) {
      memoryRecords[size] = { highestCompleted: 0 };
      currentLevels[size] = 1;
    }
    return {
      version: STORAGE_VERSION,
      sudoku: { activeDifficulty: "easy", records: sudokuRecords, games: {} },
      minesweeper: { activeDifficulty: "easy", records: mineRecords },
      memory: { activeSize: 3, records: memoryRecords, currentLevels },
    };
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function toNonNegativeInteger(value, fallback = 0) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : fallback;
  }

  function sanitizeStoredData(parsed) {
    const data = createDefaultData();
    if (!isObject(parsed) || parsed.version !== STORAGE_VERSION) return data;

    const sudokuDifficulty = parsed.sudoku?.activeDifficulty;
    if (SUDOKU_DIFFICULTIES[sudokuDifficulty]) data.sudoku.activeDifficulty = sudokuDifficulty;
    for (const key of Object.keys(SUDOKU_DIFFICULTIES)) {
      const record = parsed.sudoku?.records?.[key];
      data.sudoku.records[key] = {
        highestCompleted: toNonNegativeInteger(record?.highestCompleted),
        bestTime: Number.isFinite(record?.bestTime) && record.bestTime >= 0 ? record.bestTime : null,
      };
      const game = parsed.sudoku?.games?.[key];
      if (isValidStoredSudokuGame(game)) data.sudoku.games[key] = normalizeSudokuGame(game);
    }

    const mineDifficulty = parsed.minesweeper?.activeDifficulty;
    if (MINE_CONFIGS[mineDifficulty]) data.minesweeper.activeDifficulty = mineDifficulty;
    for (const key of Object.keys(MINE_CONFIGS)) {
      const record = parsed.minesweeper?.records?.[key];
      data.minesweeper.records[key] = {
        bestTime: Number.isFinite(record?.bestTime) && record.bestTime >= 0 ? record.bestTime : null,
        wins: toNonNegativeInteger(record?.wins),
      };
    }

    const size = Number(parsed.memory?.activeSize);
    if (MEMORY_CONFIGS[size]) data.memory.activeSize = size;
    for (const sizeKey of Object.keys(MEMORY_CONFIGS)) {
      data.memory.records[sizeKey].highestCompleted = toNonNegativeInteger(
        parsed.memory?.records?.[sizeKey]?.highestCompleted,
      );
      data.memory.currentLevels[sizeKey] = Math.max(1, toNonNegativeInteger(
        parsed.memory?.currentLevels?.[sizeKey],
        data.memory.records[sizeKey].highestCompleted + 1,
      ));
    }
    return data;
  }

  function getDefaultStorage() {
    try {
      return root.localStorage || null;
    } catch (error) {
      return null;
    }
  }

  function loadFunGameData(storage = getDefaultStorage()) {
    if (!storage || typeof storage.getItem !== "function") return createDefaultData();
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return raw ? sanitizeStoredData(JSON.parse(raw)) : createDefaultData();
    } catch (error) {
      return createDefaultData();
    }
  }

  function saveFunGameData(value, storage = getDefaultStorage()) {
    if (!storage || typeof storage.setItem !== "function") return false;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function createSeededRandom(seed) {
    let state = (Number(seed) || 1) >>> 0;
    return function seededRandom() {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function shuffle(values, random = Math.random) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  function sudokuPattern(row, col) {
    return (row * 3 + Math.floor(row / 3) + col) % 9;
  }

  function createSudokuSolution(random) {
    const groups = [0, 1, 2];
    const rows = shuffle(groups, random).flatMap(group => shuffle(groups, random).map(row => group * 3 + row));
    const cols = shuffle(groups, random).flatMap(group => shuffle(groups, random).map(col => group * 3 + col));
    const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], random);
    return rows.flatMap(row => cols.map(col => digits[sudokuPattern(row, col)]));
  }

  function getSudokuCandidateMask(board, index) {
    if (board[index]) return 0;
    const row = Math.floor(index / 9);
    const col = index % 9;
    let used = 0;
    for (let offset = 0; offset < 9; offset += 1) {
      const rowValue = board[row * 9 + offset];
      const colValue = board[offset * 9 + col];
      if (rowValue) used |= 1 << rowValue;
      if (colValue) used |= 1 << colValue;
    }
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    for (let boxY = 0; boxY < 3; boxY += 1) {
      for (let boxX = 0; boxX < 3; boxX += 1) {
        const value = board[(boxRow + boxY) * 9 + boxCol + boxX];
        if (value) used |= 1 << value;
      }
    }
    return 0x3fe & ~used;
  }

  function bitCount(mask) {
    let count = 0;
    let value = mask;
    while (value) {
      value &= value - 1;
      count += 1;
    }
    return count;
  }

  function countSudokuSolutions(input, limit = 2) {
    const board = [...input];
    let solutions = 0;

    function search() {
      if (solutions >= limit) return;
      let bestIndex = -1;
      let bestMask = 0;
      let bestCount = 10;
      for (let index = 0; index < 81; index += 1) {
        if (board[index]) continue;
        const mask = getSudokuCandidateMask(board, index);
        const count = bitCount(mask);
        if (!count) return;
        if (count < bestCount) {
          bestIndex = index;
          bestMask = mask;
          bestCount = count;
          if (count === 1) break;
        }
      }
      if (bestIndex < 0) {
        solutions += 1;
        return;
      }
      for (let digit = 1; digit <= 9; digit += 1) {
        if (!(bestMask & (1 << digit))) continue;
        board[bestIndex] = digit;
        search();
        board[bestIndex] = 0;
        if (solutions >= limit) return;
      }
    }

    search();
    return solutions;
  }

  function isValidSudokuSolution(board) {
    if (!Array.isArray(board) || board.length !== 81) return false;
    const validSet = values => values.slice().sort((a, b) => a - b).join("") === "123456789";
    for (let row = 0; row < 9; row += 1) {
      if (!validSet(board.slice(row * 9, row * 9 + 9))) return false;
    }
    for (let col = 0; col < 9; col += 1) {
      if (!validSet(Array.from({ length: 9 }, (_, row) => board[row * 9 + col]))) return false;
    }
    for (let boxRow = 0; boxRow < 3; boxRow += 1) {
      for (let boxCol = 0; boxCol < 3; boxCol += 1) {
        const values = [];
        for (let row = 0; row < 3; row += 1) {
          for (let col = 0; col < 3; col += 1) {
            values.push(board[(boxRow * 3 + row) * 9 + boxCol * 3 + col]);
          }
        }
        if (!validSet(values)) return false;
      }
    }
    return true;
  }

  function analyzeSudokuDifficulty(puzzle) {
    const board = [...puzzle];
    let logicalSteps = 0;
    let changed = true;
    while (changed) {
      changed = false;
      for (let index = 0; index < 81; index += 1) {
        if (board[index]) continue;
        const mask = getSudokuCandidateMask(board, index);
        if (bitCount(mask) === 1) {
          for (let digit = 1; digit <= 9; digit += 1) {
            if (mask & (1 << digit)) board[index] = digit;
          }
          logicalSteps += 1;
          changed = true;
        }
      }
    }
    const unresolved = board.filter(value => !value).length;
    const blanks = puzzle.filter(value => !value).length;
    return { logicalSteps, unresolved, score: blanks + unresolved * 3 };
  }

  function generateSudoku(difficulty = "easy", seed = Date.now()) {
    const config = SUDOKU_DIFFICULTIES[difficulty] || SUDOKU_DIFFICULTIES.easy;
    const candidates = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const random = createSeededRandom(Number(seed) + config.seedOffset + attempt * 9973);
      const solution = createSudokuSolution(random);
      const puzzle = [...solution];
      const order = shuffle(Array.from({ length: 81 }, (_, index) => index), random);
      for (const index of order) {
        if (puzzle.filter(Boolean).length <= config.targetClues) break;
        const value = puzzle[index];
        puzzle[index] = 0;
        if (countSudokuSolutions(puzzle, 2) !== 1) puzzle[index] = value;
      }
      const clues = puzzle.filter(Boolean).length;
      const rating = analyzeSudokuDifficulty(puzzle);
      const candidate = { puzzle, solution, rating };
      candidates.push(candidate);
      if (clues > config.targetClues) continue;
    }
    const exactCandidates = candidates.filter(candidate => candidate.puzzle.filter(Boolean).length <= config.targetClues);
    const pool = exactCandidates.length ? exactCandidates : candidates;
    pool.sort((left, right) => {
      if (difficulty === "easy") return left.rating.score - right.rating.score;
      if (difficulty === "hard") return right.rating.score - left.rating.score;
      const mediumTarget = 72;
      return Math.abs(left.rating.score - mediumTarget) - Math.abs(right.rating.score - mediumTarget);
    });
    return pool[0];
  }

  function isValidStoredSudokuGame(game) {
    return isObject(game)
      && Array.isArray(game.puzzle) && game.puzzle.length === 81
      && Array.isArray(game.solution) && game.solution.length === 81
      && Array.isArray(game.values) && game.values.length === 81;
  }

  function normalizeSudokuGame(game) {
    return {
      level: Math.max(1, toNonNegativeInteger(game.level, 1)),
      puzzle: game.puzzle.map(value => toNonNegativeInteger(value)),
      solution: game.solution.map(value => toNonNegativeInteger(value)),
      values: game.values.map(value => toNonNegativeInteger(value)),
      notes: Array.from({ length: 81 }, (_, index) => Array.isArray(game.notes?.[index])
        ? game.notes[index].map(Number).filter(value => value >= 1 && value <= 9)
        : []),
      hintCells: Array.isArray(game.hintCells) ? game.hintCells.map(Number).filter(Number.isInteger) : [],
      hintsUsed: Math.min(3, toNonNegativeInteger(game.hintsUsed)),
      elapsedMs: Math.max(0, Number(game.elapsedMs) || 0),
      startedAt: Number(game.startedAt) || Date.now(),
      status: ["playing", "paused", "completed"].includes(game.status) ? game.status : "playing",
      rating: isObject(game.rating) ? game.rating : { logicalSteps: 0, unresolved: 0, score: 0 },
    };
  }

  function createSudokuGame(difficulty, level, seed) {
    const generated = generateSudoku(difficulty, seed);
    return {
      level,
      puzzle: generated.puzzle,
      solution: generated.solution,
      values: [...generated.puzzle],
      notes: Array.from({ length: 81 }, () => []),
      hintCells: [],
      hintsUsed: 0,
      elapsedMs: 0,
      startedAt: Date.now(),
      status: "playing",
      rating: generated.rating,
    };
  }

  function getMineNeighbors(index, rows, cols) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const neighbors = [];
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
        if (!rowOffset && !colOffset) continue;
        const nextRow = row + rowOffset;
        const nextCol = col + colOffset;
        if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) {
          neighbors.push(nextRow * cols + nextCol);
        }
      }
    }
    return neighbors;
  }

  function createMineBoard(config, safeIndex, random = Math.random) {
    const total = config.rows * config.cols;
    const safe = new Set([safeIndex, ...getMineNeighbors(safeIndex, config.rows, config.cols)]);
    const candidates = shuffle(
      Array.from({ length: total }, (_, index) => index).filter(index => !safe.has(index)),
      random,
    );
    const mines = new Set(candidates.slice(0, config.mines));
    return Array.from({ length: total }, (_, index) => ({
      mine: mines.has(index),
      adjacent: mines.has(index) ? 0 : getMineNeighbors(index, config.rows, config.cols)
        .filter(neighbor => mines.has(neighbor)).length,
      revealed: false,
      flagged: false,
      exploded: false,
    }));
  }

  function createMemorySequence(size, random = Math.random) {
    return shuffle(Array.from({ length: size * size }, (_, index) => index + 1), random);
  }

  const callbacks = {
    rerender: () => {},
    toast: () => {},
    confirm: message => (typeof root.confirm === "function" ? root.confirm(message) : true),
  };
  const data = loadFunGameData();
  const sudokuUi = { selected: -1, noteMode: false, generating: new Set() };
  let mineState = createMineState(data.minesweeper.activeDifficulty);
  let memoryState = createMemoryState(data.memory.activeSize);
  const runtime = {
    activeGame: "",
    intervalId: null,
    timeoutIds: new Set(),
    longPressId: null,
    longPress: null,
    suppressMineClickUntil: 0,
    suppressMineIndex: -1,
  };

  function configure(options = {}) {
    if (typeof options.rerender === "function") callbacks.rerender = options.rerender;
    if (typeof options.toast === "function") callbacks.toast = options.toast;
    if (typeof options.confirm === "function") callbacks.confirm = options.confirm;
  }

  function persist() {
    saveFunGameData(data);
  }

  function formatClock(milliseconds, includeHours = false) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (includeHours || hours) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    }[character]));
  }

  function setTextIfChanged(node, value) {
    if (!node) return;
    const nextValue = String(value);
    if (node.textContent !== nextValue) node.textContent = nextValue;
  }

  function setHtmlIfChanged(node, value) {
    if (node && node.innerHTML !== value) node.innerHTML = value;
  }

  function setClassIfChanged(node, value) {
    if (node && node.className !== value) node.className = value;
  }

  function setAttributeIfChanged(node, name, value) {
    if (!node) return;
    const nextValue = String(value);
    if (node.getAttribute(name) !== nextValue) node.setAttribute(name, nextValue);
  }

  function renderGameHeader(icon, title, description) {
    return `
      <header class="fun-game-header">
        <div class="fun-game-title-row">
          <span class="fun-game-title-icon" aria-hidden="true">${icon}</span>
          <div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>
        </div>
      </header>`;
  }

  function getSummary(gameId) {
    if (gameId === "sudoku") {
      const record = data.sudoku.records[data.sudoku.activeDifficulty];
      return record.highestCompleted ? `最高完成第 ${record.highestCompleted} 关` : "暂无记录";
    }
    if (gameId === "minesweeper") {
      const record = data.minesweeper.records[data.minesweeper.activeDifficulty];
      return record.bestTime == null ? "暂无记录" : `最佳 ${record.bestTime} 秒`;
    }
    if (gameId === "memory-sequence") {
      const record = data.memory.records[data.memory.activeSize];
      return record.highestCompleted ? `最高通过第 ${record.highestCompleted} 关` : "暂无记录";
    }
    return "";
  }

  function getSudokuGame() {
    return data.sudoku.games[data.sudoku.activeDifficulty] || null;
  }

  function scheduleSudokuGeneration(difficulty, level) {
    if (sudokuUi.generating.has(difficulty)) return;
    sudokuUi.generating.add(difficulty);
    const timeoutId = root.setTimeout(() => {
      runtime.timeoutIds.delete(timeoutId);
      const seed = Date.now() ^ (level * 7919) ^ SUDOKU_DIFFICULTIES[difficulty].seedOffset;
      data.sudoku.games[difficulty] = createSudokuGame(difficulty, level, seed);
      sudokuUi.generating.delete(difficulty);
      sudokuUi.selected = -1;
      persist();
      if (runtime.activeGame === "sudoku") callbacks.rerender();
    }, 24);
    runtime.timeoutIds.add(timeoutId);
  }

  function getSudokuElapsed(game) {
    if (!game) return 0;
    if (game.status === "playing" && game.startedAt) return game.elapsedMs + Math.max(0, Date.now() - game.startedAt);
    return game.elapsedMs;
  }

  function getSudokuSelection(game) {
    const selected = sudokuUi.selected;
    const row = selected >= 0 ? Math.floor(selected / 9) : -1;
    const col = selected >= 0 ? selected % 9 : -1;
    return {
      selected,
      row,
      col,
      box: selected >= 0 ? Math.floor(row / 3) * 3 + Math.floor(col / 3) : -1,
      value: selected >= 0 ? game.values[selected] : 0,
    };
  }

  function getSudokuCellView(game, index, selection) {
    const value = game.values[index];
    const row = Math.floor(index / 9);
    const col = index % 9;
    const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);
    const given = Boolean(game.puzzle[index]);
    const wrong = Boolean(value && value !== game.solution[index]);
    const related = selection.selected >= 0 && (row === selection.row || col === selection.col || box === selection.box);
    const same = Boolean(selection.value && value === selection.value);
    const classes = [
      "sudoku-cell", given ? "is-given" : "", index === selection.selected ? "is-selected" : "",
      related ? "is-related" : "", same ? "is-same" : "", wrong ? "is-wrong" : "",
      game.hintCells.includes(index) ? "is-hint" : "",
    ].filter(Boolean).join(" ");
    const notes = game.notes[index] || [];
    const content = value
      ? `<span class="sudoku-value">${value}</span>${wrong ? '<span class="sr-only">填写错误</span>' : ""}`
      : `<span class="sudoku-notes">${Array.from({ length: 9 }, (_, noteIndex) => `<i>${notes.includes(noteIndex + 1) ? noteIndex + 1 : ""}</i>`).join("")}</span>`;
    return {
      classes,
      content,
      label: `第 ${row + 1} 行第 ${col + 1} 列${value ? `，数字 ${value}` : "，空格"}`,
    };
  }

  function renderSudoku() {
    const difficulty = data.sudoku.activeDifficulty;
    const game = getSudokuGame();
    if (!game) scheduleSudokuGeneration(difficulty, data.sudoku.records[difficulty].highestCompleted + 1);
    const difficultyButtons = Object.entries(SUDOKU_DIFFICULTIES).map(([key, config]) => `
      <button type="button" class="fun-segment ${key === difficulty ? "active" : ""}" data-sudoku-difficulty="${key}" aria-pressed="${key === difficulty}">${config.label}</button>`).join("");
    if (!game) {
      return `<div class="fun-game-shell">${renderGameHeader("🧩", "数独", "每道题均经过唯一解验证")}
        <div class="fun-toolbar"><div class="fun-segments">${difficultyButtons}</div></div>
        <div class="fun-loading glass"><span class="fun-loading-orbit"></span><strong>正在生成第 1 关</strong><p>校验唯一解，请稍候…</p></div></div>`;
    }

    const selection = getSudokuSelection(game);
    const paused = game.status === "paused";
    const record = data.sudoku.records[difficulty];
    const cells = game.values.map((value, index) => {
      const view = getSudokuCellView(game, index, selection);
      return `<button type="button" class="${view.classes}" data-sudoku-cell="${index}" aria-label="${view.label}">${view.content}</button>`;
    }).join("");

    return `
      <div class="fun-game-shell sudoku-page">
        ${renderGameHeader("🧩", "数独", "唯一解生成 · 每关 3 次提示 · 进度自动保存")}
        <div class="fun-toolbar">
          <div class="fun-segments" aria-label="数独难度">${difficultyButtons}</div>
          <button class="fun-action secondary" type="button" data-sudoku-pause ${game.status === "completed" ? "disabled" : ""}>${paused ? "继续" : "暂停"}</button>
          <button class="fun-action secondary" type="button" data-sudoku-restart>重新开始</button>
        </div>
        <div class="fun-stat-grid">
          <div><span>当前关卡</span><strong>第 ${game.level} 关</strong></div>
          <div><span>本关用时</span><strong data-sudoku-time>${formatClock(getSudokuElapsed(game), true)}</strong></div>
          <div><span>最高完成</span><strong>${record.highestCompleted ? `第 ${record.highestCompleted} 关` : "暂无记录"}</strong></div>
          <div><span>剩余提示</span><strong data-sudoku-hints-remaining>${Math.max(0, 3 - game.hintsUsed)} 次</strong></div>
        </div>
        <div class="sudoku-layout">
          <div class="sudoku-board-wrap glass">
            <div class="sudoku-board ${paused ? "is-paused" : ""}" role="grid" aria-label="9乘9数独棋盘">${cells}</div>
            ${paused ? '<div class="sudoku-pause-mask"><span>☾</span><strong>游戏已暂停</strong><p>点击“继续”恢复棋盘</p></div>' : ""}
          </div>
          <aside class="sudoku-controls glass">
            <div class="sudoku-status-copy">
              <span>${SUDOKU_DIFFICULTIES[difficulty].label} · 第 ${game.level} 关</span>
              <strong data-sudoku-status>${game.status === "completed" ? "恭喜完成" : sudokuUi.noteMode ? "候选数字模式" : "请选择一个空格"}</strong>
            </div>
            <div class="sudoku-keypad">${Array.from({ length: 9 }, (_, index) => `<button type="button" data-sudoku-number="${index + 1}" ${paused || game.status === "completed" ? "disabled" : ""}>${index + 1}</button>`).join("")}</div>
            <div class="sudoku-tool-grid">
              <button type="button" class="${sudokuUi.noteMode ? "active" : ""}" data-sudoku-note aria-pressed="${sudokuUi.noteMode}" ${paused || game.status === "completed" ? "disabled" : ""}>✎ 笔记</button>
              <button type="button" data-sudoku-delete ${paused || game.status === "completed" ? "disabled" : ""}>⌫ 删除</button>
              <button type="button" data-sudoku-hint ${paused || game.status === "completed" || game.hintsUsed >= 3 ? "disabled" : ""}>✦ 提示 ${3 - game.hintsUsed}</button>
            </div>
            <p class="fun-help">键盘支持 1～9、Backspace 与 Delete。错误数字会标记，但不会限制尝试次数。</p>
          </aside>
        </div>
        ${game.status === "completed" ? `<div class="fun-result success"><div><span>✓</span><strong>第 ${game.level} 关完成</strong><p>用时 ${formatClock(game.elapsedMs, true)}，已保存本关成绩。</p></div><button type="button" data-sudoku-next>进入下一关</button></div>` : ""}
      </div>`;
  }

  function patchSudokuDom() {
    const documentRef = root.document;
    const game = getSudokuGame();
    const board = documentRef?.querySelector(".sudoku-board");
    const nodes = board?.querySelectorAll("[data-sudoku-cell]");
    if (!game || !nodes || nodes.length !== 81) return false;

    const selection = getSudokuSelection(game);
    nodes.forEach((node, index) => {
      const view = getSudokuCellView(game, index, selection);
      setClassIfChanged(node, view.classes);
      setHtmlIfChanged(node, view.content);
      setAttributeIfChanged(node, "aria-label", view.label);
    });

    const noteButton = documentRef.querySelector("[data-sudoku-note]");
    if (noteButton) {
      noteButton.classList.toggle("active", sudokuUi.noteMode);
      setAttributeIfChanged(noteButton, "aria-pressed", sudokuUi.noteMode);
    }
    const hintButton = documentRef.querySelector("[data-sudoku-hint]");
    if (hintButton) {
      setTextIfChanged(hintButton, `✦ 提示 ${Math.max(0, 3 - game.hintsUsed)}`);
      hintButton.disabled = game.hintsUsed >= 3;
    }
    setTextIfChanged(documentRef.querySelector("[data-sudoku-hints-remaining]"), `${Math.max(0, 3 - game.hintsUsed)} 次`);
    setTextIfChanged(documentRef.querySelector("[data-sudoku-status]"), sudokuUi.noteMode ? "候选数字模式" : "请选择一个空格");
    return true;
  }

  function getSudokuPeers(index) {
    const row = Math.floor(index / 9);
    const col = index % 9;
    const peers = new Set();
    for (let offset = 0; offset < 9; offset += 1) {
      peers.add(row * 9 + offset);
      peers.add(offset * 9 + col);
    }
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) peers.add((boxRow + y) * 9 + boxCol + x);
    }
    peers.delete(index);
    return peers;
  }

  function inputSudokuNumber(number) {
    const game = getSudokuGame();
    const index = sudokuUi.selected;
    if (!game || game.status !== "playing" || index < 0 || game.puzzle[index]) return;
    if (sudokuUi.noteMode && !game.values[index]) {
      const notes = new Set(game.notes[index]);
      if (notes.has(number)) notes.delete(number); else notes.add(number);
      game.notes[index] = [...notes].sort((a, b) => a - b);
    } else {
      game.values[index] = number;
      game.notes[index] = [];
      if (number === game.solution[index]) {
        for (const peer of getSudokuPeers(index)) {
          game.notes[peer] = game.notes[peer].filter(value => value !== number);
        }
      }
      const completed = checkSudokuCompletion(game);
      persist();
      if (completed || !patchSudokuDom()) renderCurrentGame();
      return;
    }
    persist();
    if (!patchSudokuDom()) renderCurrentGame();
  }

  function deleteSudokuValue() {
    const game = getSudokuGame();
    const index = sudokuUi.selected;
    if (!game || game.status !== "playing" || index < 0 || game.puzzle[index]) return;
    game.values[index] = 0;
    game.notes[index] = [];
    persist();
    if (!patchSudokuDom()) renderCurrentGame();
  }

  function checkSudokuCompletion(game) {
    if (!game.values.every((value, index) => value === game.solution[index])) return false;
    game.elapsedMs = getSudokuElapsed(game);
    game.startedAt = 0;
    game.status = "completed";
    const difficulty = data.sudoku.activeDifficulty;
    const record = data.sudoku.records[difficulty];
    record.highestCompleted = Math.max(record.highestCompleted, game.level);
    if (record.bestTime == null || game.elapsedMs < record.bestTime) record.bestTime = game.elapsedMs;
    callbacks.toast(`数独第 ${game.level} 关完成`, "success");
    return true;
  }

  function useSudokuHint() {
    const game = getSudokuGame();
    if (!game || game.status !== "playing" || game.hintsUsed >= 3) return;
    const candidates = game.values.map((value, index) => value === game.solution[index] ? -1 : index).filter(index => index >= 0);
    if (!candidates.length) return;
    const index = candidates[Math.floor(Math.random() * candidates.length)];
    game.values[index] = game.solution[index];
    game.notes[index] = [];
    game.hintCells.push(index);
    game.hintsUsed += 1;
    sudokuUi.selected = index;
    const completed = checkSudokuCompletion(game);
    persist();
    if (completed || !patchSudokuDom()) renderCurrentGame();
  }

  function toggleSudokuPause() {
    const game = getSudokuGame();
    if (!game || game.status === "completed") return;
    if (game.status === "playing") {
      game.elapsedMs = getSudokuElapsed(game);
      game.startedAt = 0;
      game.status = "paused";
    } else {
      game.startedAt = Date.now();
      game.status = "playing";
    }
    persist();
    callbacks.rerender();
  }

  function restartSudoku() {
    const game = getSudokuGame();
    if (!game) return;
    const hasProgress = game.values.some((value, index) => !game.puzzle[index] && value);
    if (hasProgress && !callbacks.confirm("确定重新开始本关吗？当前填写内容将被清除。")) return;
    game.values = [...game.puzzle];
    game.notes = Array.from({ length: 81 }, () => []);
    game.hintCells = [];
    game.hintsUsed = 0;
    game.elapsedMs = 0;
    game.startedAt = Date.now();
    game.status = "playing";
    sudokuUi.selected = -1;
    sudokuUi.noteMode = false;
    persist();
    callbacks.rerender();
  }

  function nextSudokuLevel() {
    const game = getSudokuGame();
    if (!game || game.status !== "completed") return;
    const difficulty = data.sudoku.activeDifficulty;
    const nextLevel = game.level + 1;
    delete data.sudoku.games[difficulty];
    persist();
    scheduleSudokuGeneration(difficulty, nextLevel);
    callbacks.rerender();
  }

  function createMineState(difficulty) {
    const config = MINE_CONFIGS[difficulty] || MINE_CONFIGS.easy;
    return {
      difficulty: MINE_CONFIGS[difficulty] ? difficulty : "easy",
      status: "ready",
      board: Array.from({ length: config.rows * config.cols }, () => ({
        mine: false, adjacent: 0, revealed: false, flagged: false, exploded: false,
      })),
      startedAt: 0,
      elapsedMs: 0,
    };
  }

  function getMineElapsed() {
    return mineState.status === "playing"
      ? mineState.elapsedMs + Math.max(0, Date.now() - mineState.startedAt)
      : mineState.elapsedMs;
  }

  function getMineFace() {
    if (mineState.status === "lost") return "😵";
    if (mineState.status === "won") return "😎";
    return "🙂";
  }

  function getMineStatusText() {
    if (mineState.status === "ready") return "点击任意格开始，首次点击和周围区域安全";
    if (mineState.status === "playing") return "谨慎判断数字，右键或长按插旗";
    if (mineState.status === "won") return "本局胜利，所有安全区域均已打开";
    return "踩到地雷了，再试一次吧";
  }

  function getMineCellView(cell) {
    let content = "";
    let label = "未翻开的格子";
    const classes = ["mine-cell"];
    if (cell.revealed || mineState.status === "lost" && cell.mine) {
      classes.push("is-revealed");
      if (cell.mine) {
        content = "💣";
        label = "地雷";
        classes.push(cell.exploded ? "is-exploded" : "is-mine");
      } else if (cell.adjacent) {
        content = String(cell.adjacent);
        label = `周围 ${cell.adjacent} 个地雷`;
        classes.push(`mine-number-${cell.adjacent}`);
      } else label = "安全空格";
    } else if (cell.flagged) {
      content = "🚩";
      label = "已插旗";
      classes.push("is-flagged");
    }
    if (mineState.status === "lost" && cell.flagged && !cell.mine) {
      content = "✕";
      label = "错误旗帜";
      classes.push("is-wrong-flag");
    }
    return { content, label, classes: classes.join(" ") };
  }

  function renderMinesweeper() {
    const config = MINE_CONFIGS[mineState.difficulty];
    const record = data.minesweeper.records[mineState.difficulty];
    const flags = mineState.board.filter(cell => cell.flagged).length;
    const buttons = Object.entries(MINE_CONFIGS).map(([key, value]) => `
      <button class="fun-segment ${key === mineState.difficulty ? "active" : ""}" type="button" data-mine-difficulty="${key}">${value.label}</button>`).join("");
    const cells = mineState.board.map((cell, index) => {
      const view = getMineCellView(cell);
      return `<button class="${view.classes}" type="button" data-mine-cell="${index}" aria-label="${view.label}" ${["won", "lost"].includes(mineState.status) ? "disabled" : ""}>${view.content}</button>`;
    }).join("");
    const statusText = getMineStatusText();

    return `
      <div class="fun-game-shell mine-page">
        ${renderGameHeader("💣", "扫雷", "经典规则 · 首次点击安全 · 手机长按插旗")}
        <div class="fun-toolbar"><div class="fun-segments">${buttons}</div><button class="fun-action secondary" type="button" data-mine-restart>重新开始</button></div>
        <div class="mine-dashboard glass">
          <div><span>剩余雷数</span><strong data-mine-remaining>${config.mines - flags}</strong></div>
          <button class="mine-face" type="button" data-mine-restart aria-label="重新开始当前难度">${getMineFace()}</button>
          <div><span>游戏计时</span><strong data-mine-time>${String(Math.floor(getMineElapsed() / 1000)).padStart(3, "0")}</strong></div>
        </div>
        <div class="mine-board-scroll glass" aria-label="扫雷棋盘，可横向滚动">
          <div class="mine-board" style="--mine-cols:${config.cols}; --mine-rows:${config.rows}" role="grid">${cells}</div>
        </div>
        <div class="mine-footer">
          <p data-mine-status>${statusText}</p>
          <div><span>最佳时间 <strong data-mine-best>${record.bestTime == null ? "--" : `${record.bestTime} 秒`}</strong></span><span>胜利次数 <strong data-mine-wins>${record.wins}</strong></span></div>
        </div>
      </div>`;
  }

  function patchMineDom() {
    const documentRef = root.document;
    const board = documentRef?.querySelector(".mine-board");
    const nodes = board?.querySelectorAll("[data-mine-cell]");
    if (!nodes || nodes.length !== mineState.board.length) return false;

    const finished = mineState.status === "won" || mineState.status === "lost";
    nodes.forEach((node, index) => {
      const view = getMineCellView(mineState.board[index]);
      setClassIfChanged(node, view.classes);
      setTextIfChanged(node, view.content);
      setAttributeIfChanged(node, "aria-label", view.label);
      if (node.disabled !== finished) node.disabled = finished;
    });

    const config = MINE_CONFIGS[mineState.difficulty];
    const record = data.minesweeper.records[mineState.difficulty];
    const flags = mineState.board.filter(cell => cell.flagged).length;
    setTextIfChanged(documentRef.querySelector("[data-mine-remaining]"), config.mines - flags);
    setTextIfChanged(documentRef.querySelector("[data-mine-time]"), String(Math.floor(getMineElapsed() / 1000)).padStart(3, "0"));
    setTextIfChanged(documentRef.querySelector(".mine-face"), getMineFace());
    setTextIfChanged(documentRef.querySelector("[data-mine-status]"), getMineStatusText());
    setTextIfChanged(documentRef.querySelector("[data-mine-best]"), record.bestTime == null ? "--" : `${record.bestTime} 秒`);
    setTextIfChanged(documentRef.querySelector("[data-mine-wins]"), record.wins);
    return true;
  }

  function revealMineArea(startIndex) {
    const config = MINE_CONFIGS[mineState.difficulty];
    const queue = [startIndex];
    const visited = new Set();
    while (queue.length) {
      const index = queue.shift();
      if (visited.has(index)) continue;
      visited.add(index);
      const cell = mineState.board[index];
      if (!cell || cell.flagged || cell.mine) continue;
      cell.revealed = true;
      if (cell.adjacent === 0) {
        for (const neighbor of getMineNeighbors(index, config.rows, config.cols)) {
          const neighborCell = mineState.board[neighbor];
          if (!neighborCell.revealed && !neighborCell.flagged && !neighborCell.mine) queue.push(neighbor);
        }
      }
    }
  }

  function checkMineWin() {
    const won = mineState.board.every(cell => cell.mine || cell.revealed);
    if (!won) return false;
    mineState.elapsedMs = getMineElapsed();
    mineState.startedAt = 0;
    mineState.status = "won";
    const record = data.minesweeper.records[mineState.difficulty];
    const seconds = Math.floor(mineState.elapsedMs / 1000);
    record.wins += 1;
    if (record.bestTime == null || seconds < record.bestTime) record.bestTime = seconds;
    for (const cell of mineState.board) if (cell.mine) cell.flagged = true;
    persist();
    callbacks.toast("扫雷成功", "success");
    return true;
  }

  function revealMineCell(index) {
    const config = MINE_CONFIGS[mineState.difficulty];
    if (mineState.status === "won" || mineState.status === "lost") return;
    if (mineState.status === "ready") {
      mineState.board = createMineBoard(config, index);
      mineState.status = "playing";
      mineState.startedAt = Date.now();
    }
    const cell = mineState.board[index];
    if (!cell || cell.flagged || cell.revealed) return;
    if (cell.mine) {
      cell.exploded = true;
      cell.revealed = true;
      mineState.elapsedMs = getMineElapsed();
      mineState.startedAt = 0;
      mineState.status = "lost";
      callbacks.toast("踩到地雷，本局结束", "error");
    } else {
      revealMineArea(index);
      checkMineWin();
    }
    if (!patchMineDom()) renderCurrentGame();
  }

  function toggleMineFlag(index) {
    if (mineState.status === "won" || mineState.status === "lost") return;
    const cell = mineState.board[index];
    if (!cell || cell.revealed) return;
    cell.flagged = !cell.flagged;
    if (!patchMineDom()) renderCurrentGame();
  }

  function getMemorySequencePrompt() {
    const expected = memoryState.found.length + 1;
    if (memoryState.state === "idle") return "准备好后开始挑战";
    if (memoryState.state === "memorizing") return "请记住数字的位置";
    if (memoryState.state === "hiding") return "数字正在隐藏…";
    if (memoryState.state === "playing") return `请找到：${expected}`;
    if (memoryState.state === "won") return `第 ${memoryState.level} 关挑战成功`;
    return `第 ${memoryState.level} 关挑战失败`;
  }

  function getMemorySequenceCards() {
    const cardCount = memoryState.size * memoryState.size;
    return memoryState.cards.length
      ? memoryState.cards
      : Array.from({ length: cardCount }, (_, index) => index + 1);
  }

  function getMemorySequenceCardView(value, index) {
    const revealed = memoryState.state === "memorizing" || memoryState.state === "won" || memoryState.state === "lost" || memoryState.found.includes(value);
    const classes = [
      "memory-sequence-card", revealed ? "is-revealed" : "", memoryState.found.includes(value) ? "is-found" : "",
      memoryState.wrongIndex === index ? "is-wrong" : "", memoryState.state === "hiding" ? "is-hiding" : "",
    ].filter(Boolean).join(" ");
    return {
      classes,
      content: `<span class="memory-sequence-card-inner"><i class="memory-sequence-back">✦</i><b class="memory-sequence-front">${value}</b></span>`,
      label: revealed ? `数字 ${value}` : "隐藏的数字牌",
      disabled: memoryState.state !== "playing",
    };
  }

  function createMemoryState(size) {
    const safeSize = MEMORY_CONFIGS[size] ? Number(size) : 3;
    return {
      size: safeSize,
      level: Math.max(1, data.memory?.currentLevels?.[safeSize] || 1),
      state: "idle",
      cards: [],
      found: [],
      wrongIndex: -1,
      deadline: 0,
    };
  }

  function renderMemorySequence() {
    const config = MEMORY_CONFIGS[memoryState.size];
    const record = data.memory.records[memoryState.size];
    const buttons = Object.keys(MEMORY_CONFIGS).map(size => `
      <button class="fun-segment ${Number(size) === memoryState.size ? "active" : ""}" type="button" data-memory-sequence-size="${size}">${MEMORY_CONFIGS[size].label}</button>`).join("");
    const cards = getMemorySequenceCards()
      .map((value, index) => {
        const view = getMemorySequenceCardView(value, index);
        return `<button type="button" class="${view.classes}" data-memory-sequence-card="${index}" ${view.disabled ? "disabled" : ""} aria-label="${view.label}">${view.content}</button>`;
      }).join("");
    const expected = memoryState.found.length + 1;
    const prompt = getMemorySequencePrompt();
    const remaining = memoryState.state === "memorizing" ? Math.max(0, memoryState.deadline - Date.now()) : 0;

    return `
      <div class="fun-game-shell memory-sequence-page">
        ${renderGameHeader("🧠", "记忆力挑战", "记住数字位置，隐藏后按 1 到最大数字依次找出")}
        <div class="fun-toolbar"><div class="fun-segments">${buttons}</div><button class="fun-action secondary" type="button" data-memory-sequence-reset>返回难度选择</button></div>
        <div class="fun-stat-grid">
          <div><span>当前关卡</span><strong>第 ${memoryState.level} 关</strong></div>
          <div><span>记忆时间</span><strong>${config.duration / 1000} 秒</strong></div>
          <div><span>历史最高</span><strong>${record.highestCompleted ? `第 ${record.highestCompleted} 关` : "暂无记录"}</strong></div>
          <div><span>当前目标</span><strong data-memory-sequence-target>${memoryState.state === "playing" ? expected : "--"}</strong></div>
        </div>
        <section class="memory-sequence-stage glass">
          <div class="memory-sequence-prompt"><strong data-memory-sequence-prompt>${prompt}</strong><span data-memory-sequence-countdown>${memoryState.state === "memorizing" ? `${(remaining / 1000).toFixed(1)} 秒` : ""}</span></div>
          <div class="memory-sequence-progress"><i data-memory-sequence-progress style="--memory-progress:${memoryState.state === "memorizing" ? remaining / config.duration : 0}"></i></div>
          <div class="memory-sequence-grid" style="--memory-sequence-size:${memoryState.size}" aria-label="${memoryState.size}乘${memoryState.size}记忆力棋盘">${cards}</div>
          ${memoryState.state === "idle" ? '<div class="memory-sequence-overlay"><button type="button" data-memory-sequence-start>开始挑战</button><p>点击后才显示数字并开始倒计时</p></div>' : ""}
        </section>
        ${memoryState.state === "won" ? `<div class="fun-result success"><div><span>✓</span><strong>挑战成功</strong><p>最高成功通过第 ${record.highestCompleted} 关</p></div><button type="button" data-memory-sequence-next>进入第 ${memoryState.level + 1} 关</button></div>` : ""}
        ${memoryState.state === "lost" ? `<div class="fun-result error"><div><span>!</span><strong>挑战失败</strong><p>本次到达第 ${memoryState.level} 关，历史最高通过第 ${record.highestCompleted} 关</p></div><div><button type="button" data-memory-sequence-retry>重新挑战</button><button type="button" class="secondary" data-memory-sequence-reset>返回难度选择</button></div></div>` : ""}
      </div>`;
  }

  function patchMemorySequenceDom() {
    const documentRef = root.document;
    const board = documentRef?.querySelector(".memory-sequence-grid");
    const nodes = board?.querySelectorAll("[data-memory-sequence-card]");
    const cards = getMemorySequenceCards();
    if (!nodes || nodes.length !== cards.length) return false;

    nodes.forEach((node, index) => {
      const view = getMemorySequenceCardView(cards[index], index);
      setHtmlIfChanged(node, view.content);
      setClassIfChanged(node, view.classes);
      setAttributeIfChanged(node, "aria-label", view.label);
      if (node.disabled !== view.disabled) node.disabled = view.disabled;
    });

    const expected = memoryState.found.length + 1;
    const remaining = memoryState.state === "memorizing" ? Math.max(0, memoryState.deadline - Date.now()) : 0;
    setTextIfChanged(documentRef.querySelector("[data-memory-sequence-prompt]"), getMemorySequencePrompt());
    setTextIfChanged(documentRef.querySelector("[data-memory-sequence-target]"), memoryState.state === "playing" ? expected : "--");
    setTextIfChanged(documentRef.querySelector("[data-memory-sequence-countdown]"), memoryState.state === "memorizing" ? `${(remaining / 1000).toFixed(1)} 秒` : "");
    const progress = documentRef.querySelector("[data-memory-sequence-progress]");
    if (progress) progress.style.setProperty("--memory-progress", memoryState.state === "memorizing" ? remaining / MEMORY_CONFIGS[memoryState.size].duration : 0);
    if (memoryState.state !== "idle") documentRef.querySelector(".memory-sequence-overlay")?.remove();
    if (memoryState.state !== "won" && memoryState.state !== "lost") documentRef.querySelector(".memory-sequence-page > .fun-result")?.remove();
    return true;
  }

  function clearRuntimeTimers() {
    if (runtime.intervalId != null) {
      root.clearInterval(runtime.intervalId);
      runtime.intervalId = null;
    }
    for (const timeoutId of runtime.timeoutIds) root.clearTimeout(timeoutId);
    runtime.timeoutIds.clear();
    sudokuUi.generating.clear();
    if (runtime.longPressId != null) root.clearTimeout(runtime.longPressId);
    runtime.longPressId = null;
    runtime.longPress = null;
  }

  function renderCurrentGame() {
    callbacks.rerender();
  }

  function startMemoryChallenge() {
    clearRuntimeTimers();
    memoryState.cards = createMemorySequence(memoryState.size);
    memoryState.found = [];
    memoryState.wrongIndex = -1;
    memoryState.state = "memorizing";
    memoryState.deadline = Date.now() + MEMORY_CONFIGS[memoryState.size].duration;
    data.memory.activeSize = memoryState.size;
    data.memory.currentLevels[memoryState.size] = memoryState.level;
    persist();
    if (!patchMemorySequenceDom()) renderCurrentGame();
    else afterRender("memory-sequence");
  }

  function scheduleMemoryPhases() {
    if (memoryState.state !== "memorizing") return;
    const remaining = Math.max(0, memoryState.deadline - Date.now());
    const hideId = root.setTimeout(() => {
      runtime.timeoutIds.delete(hideId);
      if (memoryState.state !== "memorizing") return;
      memoryState.state = "hiding";
      if (!patchMemorySequenceDom()) renderCurrentGame();
      const playId = root.setTimeout(() => {
        runtime.timeoutIds.delete(playId);
        if (memoryState.state !== "hiding") return;
        memoryState.state = "playing";
        if (!patchMemorySequenceDom()) renderCurrentGame();
      }, 320);
      runtime.timeoutIds.add(playId);
    }, remaining);
    runtime.timeoutIds.add(hideId);
  }

  function chooseMemoryCard(index) {
    if (memoryState.state !== "playing") return;
    const value = memoryState.cards[index];
    const expected = memoryState.found.length + 1;
    if (memoryState.found.includes(value)) return;
    if (value !== expected) {
      memoryState.wrongIndex = index;
      memoryState.state = "lost";
      callbacks.toast("顺序错误，挑战失败", "error");
      renderCurrentGame();
      return;
    }
    memoryState.found.push(value);
    if (memoryState.found.length === memoryState.cards.length) {
      memoryState.state = "won";
      const record = data.memory.records[memoryState.size];
      record.highestCompleted = Math.max(record.highestCompleted, memoryState.level);
      data.memory.currentLevels[memoryState.size] = memoryState.level + 1;
      persist();
      callbacks.toast(`第 ${memoryState.level} 关挑战成功`, "success");
      renderCurrentGame();
      return;
    }
    if (!patchMemorySequenceDom()) renderCurrentGame();
  }

  function resetMemoryToIdle(size = memoryState.size, level) {
    clearRuntimeTimers();
    memoryState = createMemoryState(size);
    if (level) memoryState.level = level;
    data.memory.activeSize = memoryState.size;
    persist();
    renderCurrentGame();
  }

  function handleSudokuClick(event) {
    const difficulty = event.target.closest("[data-sudoku-difficulty]");
    if (difficulty) {
      data.sudoku.activeDifficulty = difficulty.dataset.sudokuDifficulty;
      sudokuUi.selected = -1;
      sudokuUi.noteMode = false;
      persist();
      renderCurrentGame();
      return true;
    }
    const cell = event.target.closest("[data-sudoku-cell]");
    if (cell) {
      const game = getSudokuGame();
      if (game?.status !== "paused") sudokuUi.selected = Number(cell.dataset.sudokuCell);
      if (!patchSudokuDom()) renderCurrentGame();
      return true;
    }
    const number = event.target.closest("[data-sudoku-number]");
    if (number) { inputSudokuNumber(Number(number.dataset.sudokuNumber)); return true; }
    if (event.target.closest("[data-sudoku-delete]")) { deleteSudokuValue(); return true; }
    if (event.target.closest("[data-sudoku-note]")) {
      sudokuUi.noteMode = !sudokuUi.noteMode;
      if (!patchSudokuDom()) renderCurrentGame();
      return true;
    }
    if (event.target.closest("[data-sudoku-hint]")) { useSudokuHint(); return true; }
    if (event.target.closest("[data-sudoku-pause]")) { toggleSudokuPause(); return true; }
    if (event.target.closest("[data-sudoku-restart]")) { restartSudoku(); return true; }
    if (event.target.closest("[data-sudoku-next]")) { nextSudokuLevel(); return true; }
    return false;
  }

  function handleMineClick(event) {
    const difficulty = event.target.closest("[data-mine-difficulty]");
    if (difficulty) {
      data.minesweeper.activeDifficulty = difficulty.dataset.mineDifficulty;
      mineState = createMineState(data.minesweeper.activeDifficulty);
      persist();
      renderCurrentGame();
      return true;
    }
    if (event.target.closest("[data-mine-restart]")) {
      mineState = createMineState(mineState.difficulty);
      renderCurrentGame();
      return true;
    }
    const cell = event.target.closest("[data-mine-cell]");
    if (cell) {
      const index = Number(cell.dataset.mineCell);
      if (runtime.suppressMineIndex === index && Date.now() < runtime.suppressMineClickUntil) return true;
      revealMineCell(index);
      return true;
    }
    return false;
  }

  function handleMemorySequenceClick(event) {
    const size = event.target.closest("[data-memory-sequence-size]");
    if (size) { resetMemoryToIdle(Number(size.dataset.memorySequenceSize)); return true; }
    if (event.target.closest("[data-memory-sequence-start]")) { startMemoryChallenge(); return true; }
    if (event.target.closest("[data-memory-sequence-retry]")) { startMemoryChallenge(); return true; }
    if (event.target.closest("[data-memory-sequence-next]")) {
      resetMemoryToIdle(memoryState.size, memoryState.level + 1);
      return true;
    }
    if (event.target.closest("[data-memory-sequence-reset]")) { resetMemoryToIdle(); return true; }
    const card = event.target.closest("[data-memory-sequence-card]");
    if (card) { chooseMemoryCard(Number(card.dataset.memorySequenceCard)); return true; }
    return false;
  }

  function handleClick(event, gameId) {
    if (gameId === "sudoku") return handleSudokuClick(event);
    if (gameId === "minesweeper") return handleMineClick(event);
    if (gameId === "memory-sequence") return handleMemorySequenceClick(event);
    return false;
  }

  function handleContextMenu(event, gameId) {
    if (gameId !== "minesweeper") return false;
    const cell = event.target.closest("[data-mine-cell]");
    if (!cell) return false;
    event.preventDefault();
    const index = Number(cell.dataset.mineCell);
    if (runtime.suppressMineIndex !== index || Date.now() >= runtime.suppressMineClickUntil) toggleMineFlag(index);
    return true;
  }

  function cancelLongPress() {
    if (runtime.longPressId != null) root.clearTimeout(runtime.longPressId);
    runtime.longPressId = null;
    runtime.longPress = null;
  }

  function handlePointerDown(event, gameId) {
    if (gameId !== "minesweeper" || event.pointerType === "mouse") return false;
    const cell = event.target.closest("[data-mine-cell]");
    if (!cell) return false;
    cancelLongPress();
    const index = Number(cell.dataset.mineCell);
    runtime.longPress = { index, x: event.clientX, y: event.clientY };
    runtime.longPressId = root.setTimeout(() => {
      runtime.longPressId = null;
      if (!runtime.longPress) return;
      toggleMineFlag(index);
      runtime.suppressMineIndex = index;
      runtime.suppressMineClickUntil = Date.now() + 800;
      runtime.longPress = null;
      if (root.navigator?.vibrate) root.navigator.vibrate(20);
    }, 520);
    return true;
  }

  function handlePointerMove(event, gameId) {
    if (gameId !== "minesweeper" || !runtime.longPress) return false;
    if (Math.hypot(event.clientX - runtime.longPress.x, event.clientY - runtime.longPress.y) > 10) cancelLongPress();
    return true;
  }

  function handlePointerEnd(event, gameId) {
    if (gameId !== "minesweeper") return false;
    cancelLongPress();
    return true;
  }

  function handleKeyDown(event, gameId) {
    if (gameId !== "sudoku" || event.target.matches("input, textarea, select")) return false;
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      inputSudokuNumber(Number(event.key));
      return true;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      deleteSudokuValue();
      return true;
    }
    return false;
  }

  function afterRender(gameId) {
    runtime.activeGame = gameId;
    if (runtime.intervalId != null) root.clearInterval(runtime.intervalId);
    runtime.intervalId = null;
    if (["sudoku", "minesweeper", "memory-sequence"].includes(gameId)) {
      runtime.intervalId = root.setInterval(() => {
        if (gameId === "sudoku") {
          const node = root.document?.querySelector("[data-sudoku-time]");
          const game = getSudokuGame();
          if (node && game?.status === "playing") node.textContent = formatClock(getSudokuElapsed(game), true);
        }
        if (gameId === "minesweeper") {
          const node = root.document?.querySelector("[data-mine-time]");
          if (node && mineState.status === "playing") node.textContent = String(Math.floor(getMineElapsed() / 1000)).padStart(3, "0");
        }
        if (gameId === "memory-sequence" && memoryState.state === "memorizing") {
          const remaining = Math.max(0, memoryState.deadline - Date.now());
          const countNode = root.document?.querySelector("[data-memory-sequence-countdown]");
          const progressNode = root.document?.querySelector("[data-memory-sequence-progress]");
          if (countNode) countNode.textContent = `${(remaining / 1000).toFixed(1)} 秒`;
          if (progressNode) progressNode.style.setProperty("--memory-progress", remaining / MEMORY_CONFIGS[memoryState.size].duration);
        }
      }, 100);
    }
    if (gameId === "memory-sequence") scheduleMemoryPhases();
  }

  function leave(gameId) {
    if (gameId === "sudoku") {
      const game = getSudokuGame();
      if (game?.status === "playing") persist();
    }
    clearRuntimeTimers();
    runtime.activeGame = "";
  }

  return {
    configure,
    renderSudoku,
    renderMinesweeper,
    renderMemorySequence,
    getSummary,
    handleClick,
    handleContextMenu,
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
    handleKeyDown,
    afterRender,
    leave,
    __test: {
      STORAGE_KEY,
      MINE_CONFIGS,
      MEMORY_CONFIGS,
      MEMORY_STATES,
      createSeededRandom,
      generateSudoku,
      countSudokuSolutions,
      isValidSudokuSolution,
      analyzeSudokuDifficulty,
      getMineNeighbors,
      createMineBoard,
      createMemorySequence,
      loadFunGameData,
      saveFunGameData,
      createDefaultData,
    },
  };
});
