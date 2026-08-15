const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const modulePath = path.join(root, "src", "fun-games", "fun-games.js");
const cssPath = path.join(root, "src", "fun-games", "fun-games.css");

test("three new games integrate into the existing fun registry without replacing old games", () => {
  assert.match(html, /href="src\/fun-games\/fun-games\.css"/);
  assert.match(html, /src="src\/fun-games\/fun-games\.js"/);
  for (const id of ["sudoku", "minesweeper", "memory-sequence"]) {
    assert.match(html, new RegExp(`id:\\s*"${id}"`));
  }
  assert.doesNotMatch(html, /id:\s*"fun-home"/);
  assert.doesNotMatch(html, /趣味首页/);
  assert.match(html, /id:\s*"memory"[\s\S]*?name:\s*"记忆翻牌"/);
  assert.match(html, /FunGames\.handleClick\(event, activeGame\)/);
  assert.match(html, /FunGames\.leave\(activeGame\)/);
});

test("fun game module and responsive styles exist", () => {
  assert.ok(fs.existsSync(modulePath), "Missing fun-games.js");
  assert.ok(fs.existsSync(cssPath), "Missing fun-games.css");
  const css = fs.readFileSync(cssPath, "utf8");
  assert.match(css, /\.sudoku-board[\s\S]*?grid-template-columns:\s*repeat\(9,\s*1fr\)/);
  assert.match(css, /\.mine-board-scroll[\s\S]*?overflow:\s*auto/);
  assert.match(css, /\.memory-sequence-grid[\s\S]*?repeat\(var\(--memory-sequence-size\),\s*1fr\)/);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /@media\s*\(max-width:\s*560px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(css, /\.fun-home|\.fun-entry|\.fun-back-button/);

  const source = fs.readFileSync(modulePath, "utf8");
  assert.doesNotMatch(source, /function renderHome|返回趣味功能|renderHome,/);
});

test("generated sudoku puzzles are valid and uniquely solvable at every difficulty", () => {
  delete require.cache[require.resolve(modulePath)];
  const api = require(modulePath);
  const clueRanges = {
    easy: [38, 45],
    medium: [31, 37],
    hard: [25, 30],
  };
  const ratings = {};

  for (const [index, difficulty] of ["easy", "medium", "hard"].entries()) {
    const generated = api.__test.generateSudoku(difficulty, 1412 + index);
    assert.equal(generated.puzzle.length, 81);
    assert.equal(generated.solution.length, 81);
    assert.ok(api.__test.isValidSudokuSolution(generated.solution), `${difficulty} solution is invalid`);
    assert.equal(api.__test.countSudokuSolutions(generated.puzzle, 2), 1, `${difficulty} puzzle is not unique`);
    const clues = generated.puzzle.filter(Boolean).length;
    ratings[difficulty] = generated.rating.score;
    assert.ok(clues >= clueRanges[difficulty][0] && clues <= clueRanges[difficulty][1], `${difficulty} has ${clues} clues`);
  }
  assert.ok(ratings.medium > ratings.easy, "medium should rate above easy");
  assert.ok(ratings.hard > ratings.medium, "hard should rate above medium");
});

test("minesweeper creates the configured mine count and keeps the first neighborhood safe", () => {
  const api = require(modulePath);
  for (const difficulty of ["easy", "medium", "hard"]) {
    const config = api.__test.MINE_CONFIGS[difficulty];
    const safeIndex = Math.floor((config.rows * config.cols) / 2);
    const board = api.__test.createMineBoard(config, safeIndex, api.__test.createSeededRandom(2026));
    assert.equal(board.filter(cell => cell.mine).length, config.mines);
    const safeArea = [safeIndex, ...api.__test.getMineNeighbors(safeIndex, config.rows, config.cols)];
    assert.ok(safeArea.every(index => !board[index].mine), `${difficulty} first neighborhood contains a mine`);
    for (let index = 0; index < board.length; index += 1) {
      if (board[index].mine) continue;
      const expected = api.__test.getMineNeighbors(index, config.rows, config.cols)
        .filter(neighbor => board[neighbor].mine).length;
      assert.equal(board[index].adjacent, expected);
    }
  }
});

test("memory challenge modes use exact sizes, durations, and unique shuffled values", () => {
  const api = require(modulePath);
  const expected = { 3: 3000, 4: 5000, 5: 7000, 6: 10000 };
  for (const [sizeText, duration] of Object.entries(expected)) {
    const size = Number(sizeText);
    assert.equal(api.__test.MEMORY_CONFIGS[size].duration, duration);
    const cards = api.__test.createMemorySequence(size, api.__test.createSeededRandom(size));
    assert.equal(cards.length, size * size);
    assert.deepEqual([...cards].sort((a, b) => a - b), Array.from({ length: size * size }, (_, index) => index + 1));
  }
  assert.deepEqual(api.__test.MEMORY_STATES, ["idle", "memorizing", "hiding", "playing", "won", "lost"]);
});

test("versioned storage safely recovers from missing and corrupt data", () => {
  const api = require(modulePath);
  const brokenStorage = {
    getItem: () => "{broken-json",
    setItem: () => { throw new Error("blocked"); },
  };
  const data = api.__test.loadFunGameData(brokenStorage);
  assert.equal(data.version, 1);
  assert.equal(data.sudoku.records.easy.highestCompleted, 0);
  assert.equal(data.minesweeper.records.hard.wins, 0);
  assert.equal(data.memory.records[6].highestCompleted, 0);
  assert.doesNotThrow(() => api.__test.saveFunGameData(data, brokenStorage));
});

test("production build bundles and protects the new game logic", () => {
  const build = fs.readFileSync(path.join(root, "scripts", "build-production.mjs"), "utf8");
  assert.match(build, /fun-games[\\/]fun-games\.js/);
  assert.match(build, /funGamesScript/);
  assert.match(build, /protectedSource/);
  assert.match(build, /rm\(/);
});
