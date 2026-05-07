const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

const requiredModes = [
  { rows: 4, cols: 4 },
  { rows: 4, cols: 6 },
  { rows: 4, cols: 8 },
  { rows: 4, cols: 10 },
];

function extractBlock(startPattern, endPattern) {
  const start = html.search(startPattern);
  assert.notEqual(start, -1, `Missing start pattern: ${startPattern}`);
  const rest = html.slice(start);
  const end = rest.search(endPattern);
  assert.notEqual(end, -1, `Missing end pattern: ${endPattern}`);
  return rest.slice(0, end);
}

test("memory modes expose the requested 4-row board sizes", () => {
  const modeBlock = extractBlock(/const memoryModes = \[/, /\];/);

  for (const { rows, cols } of requiredModes) {
    assert.match(
      modeBlock,
      new RegExp(`rows:\\s*${rows},\\s*cols:\\s*${cols}`),
      `Missing ${rows}x${cols} memory mode`,
    );
  }

  assert.doesNotMatch(modeBlock, /cols:\s*12/, "4x12 should not remain as a mode");
});

test("memory best records have storage keys for every exposed mode", () => {
  for (const { rows, cols } of requiredModes) {
    const key = `${rows}x${cols}`;
    assert.match(
      html,
      new RegExp(`"${key}":\\s*"glass_nav_memory_best_${key}"`),
      `Missing best-record key for ${key}`,
    );
  }
});

test("memory grid uses fluid columns instead of fixed viewport card sizes", () => {
  const cssBlock = extractBlock(/\/\* Memory Game Styles \*\//, /\.schulte-complete/);
  const gridRule = cssBlock.match(/\.memory-grid\s*\{([\s\S]*?)\}/);
  const cardRule = cssBlock.match(/\.memory-card\s*\{([\s\S]*?)\}/);

  assert.ok(gridRule, "Missing .memory-grid CSS rule");
  assert.ok(cardRule, "Missing .memory-card CSS rule");
  assert.match(
    gridRule[1],
    /grid-template-columns:\s*repeat\(var\(--memory-cols,\s*8\),\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.doesNotMatch(gridRule[1], /width:\s*max-content/);
  assert.doesNotMatch(gridRule[1], /overflow-x:\s*auto/);
  assert.doesNotMatch(gridRule[1], /12\.8vh/);
  assert.match(cardRule[1], /aspect-ratio:\s*var\(--memory-card-aspect\)/);
  assert.doesNotMatch(cardRule[1], /(width|height):\s*\d+(?:\.\d+)?vh/);
});

test("memory grid targets 80vh card-area height for four-row desktop layouts", () => {
  const cssBlock = extractBlock(/\/\* Memory Game Styles \*\//, /\.schulte-complete/);

  assert.match(cssBlock, /--memory-card-area-target-height:\s*80vh/);
  assert.match(cssBlock, /--memory-card-aspect:\s*1055\s*\/\s*1491/);

  for (const cols of [4, 6, 8, 10]) {
    assert.match(
      cssBlock,
      new RegExp(`\\.memory-grid\\.cols-${cols}\\s*\\{[\\s\\S]*?width:\\s*min\\(100%,\\s*calc\\(`),
      `Missing viewport-height width target for ${cols} columns`,
    );
  }

  assert.match(
    html,
    /class="memory-grid cols-\$\{memoryState\.cols\}"/,
    "Rendered grid should include the column-count class that selects the height target",
  );
  assert.doesNotMatch(html, /getMemoryGridMaxWidth/);
});

test("memory card back uses the source image ratio with overlapping container and image corners", () => {
  const cssBlock = extractBlock(/\/\* Memory Game Styles \*\//, /\.schulte-complete/);
  const cardRule = cssBlock.match(/\.memory-card\s*\{([\s\S]*?)\}/);
  const faceRule = cssBlock.match(/\.card-face\s*\{([\s\S]*?)\}/);
  const holderRule = cssBlock.match(/\.angel-icon\s*\{([\s\S]*?)\}/);
  const imageRule = cssBlock.match(/\.angel-icon img\s*\{([\s\S]*?)\}/);

  assert.ok(cardRule, "Missing .memory-card CSS rule");
  assert.ok(faceRule, "Missing .card-face CSS rule");
  assert.ok(holderRule, "Missing .angel-icon CSS rule");
  assert.ok(imageRule, "Missing .angel-icon img CSS rule");
  assert.match(cardRule[1], /--memory-card-radius:\s*12px/);
  assert.match(cardRule[1], /aspect-ratio:\s*var\(--memory-card-aspect\)/);
  assert.match(faceRule[1], /border-radius:\s*var\(--memory-card-radius\)/);
  assert.match(holderRule[1], /inset:\s*0/);
  assert.match(holderRule[1], /width:\s*100%/);
  assert.match(holderRule[1], /height:\s*100%/);
  assert.doesNotMatch(holderRule[1], /transform:/);
  assert.match(holderRule[1], /border-radius:\s*var\(--memory-card-radius\)/);
  assert.match(imageRule[1], /width:\s*100%/);
  assert.match(imageRule[1], /height:\s*100%/);
  assert.match(imageRule[1], /object-fit:\s*cover/);
  assert.match(imageRule[1], /border-radius:\s*inherit/);
  assert.match(imageRule[1], /max-width:\s*none/);
  assert.match(imageRule[1], /max-height:\s*none/);
});

test("memory controls above the card grid use compact spacing", () => {
  const cssBlock = extractBlock(/\/\* Memory Game Styles \*\//, /\.schulte-complete/);
  const panelRule = cssBlock.match(/\.memory-panel\s*\{([\s\S]*?)\}/);
  const difficultyRule = cssBlock.match(/\.memory-difficulty\s*\{([\s\S]*?)\}/);
  const statsRule = cssBlock.match(/\.memory-stats\s*\{([\s\S]*?)\}/);

  assert.ok(panelRule, "Missing .memory-panel CSS rule");
  assert.ok(difficultyRule, "Missing .memory-difficulty CSS rule");
  assert.ok(statsRule, "Missing .memory-stats CSS rule");
  assert.match(panelRule[1], /gap:\s*10px/);
  assert.match(difficultyRule[1], /margin-bottom:\s*0/);
  assert.match(statsRule[1], /margin-bottom:\s*0/);
});
