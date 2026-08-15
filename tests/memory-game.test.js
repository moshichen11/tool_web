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
  const panelRule = cssBlock.match(/\.memory-panel\s*\{([\s\S]*?)\}/);
  const scrollRule = cssBlock.match(/\.memory-grid-scroll\s*\{([\s\S]*?)\}/);
  const gridRule = cssBlock.match(/\.memory-grid\s*\{([\s\S]*?)\}/);
  const cardRule = cssBlock.match(/\.memory-card\s*\{([\s\S]*?)\}/);

  assert.ok(panelRule, "Missing .memory-panel CSS rule");
  assert.ok(scrollRule, "Missing .memory-grid-scroll CSS rule");
  assert.ok(gridRule, "Missing .memory-grid CSS rule");
  assert.ok(cardRule, "Missing .memory-card CSS rule");
  assert.match(panelRule[1], /container-type:\s*inline-size/);
  assert.match(scrollRule[1], /width:\s*100%/);
  assert.match(scrollRule[1], /display:\s*flex/);
  assert.match(scrollRule[1], /justify-content:\s*center/);
  assert.match(scrollRule[1], /overflow:\s*visible/);
  assert.match(scrollRule[1], /scrollbar-width:\s*none/);
  assert.doesNotMatch(scrollRule[1], /overflow-x:\s*auto/);
  assert.doesNotMatch(scrollRule[1], /padding-inline/);
  assert.match(
    gridRule[1],
    /grid-template-columns:\s*repeat\(var\(--memory-cols,\s*8\),\s*var\(--memory-card-width\)\)/,
  );
  assert.doesNotMatch(gridRule[1], /overflow-x:\s*auto/);
  assert.doesNotMatch(gridRule[1], /12\.8vh/);
  assert.match(cardRule[1], /aspect-ratio:\s*var\(--memory-card-aspect\)/);
  assert.doesNotMatch(cardRule[1], /(width|height):\s*\d+(?:\.\d+)?vh/);
});

test("memory grid uses one unified card width for all four modes", () => {
  const cssBlock = extractBlock(/\/\* Memory Game Styles \*\//, /\.schulte-complete/);
  const gridRule = cssBlock.match(/\.memory-grid\s*\{([\s\S]*?)\}/);

  assert.ok(gridRule, "Missing .memory-grid CSS rule");
  assert.match(cssBlock, /--memory-card-area-target-height:\s*80vh/);
  assert.match(cssBlock, /--memory-card-aspect:\s*1055\s*\/\s*1491/);
  assert.match(gridRule[1], /--memory-grid-padding:\s*0px/);
  assert.match(gridRule[1], /--memory-fit-reserve:\s*8px/);
  assert.match(gridRule[1], /--memory-card-width-by-height:\s*calc\(14\.15vh - 4px\)/);
  assert.match(
    gridRule[1],
    /--memory-card-width-by-10col-space:\s*calc\(\(100cqw - var\(--memory-fit-reserve\) - 9 \* var\(--memory-gap\)\) \/ 10\)/,
  );
  assert.match(
    gridRule[1],
    /--memory-card-width:\s*clamp\(24px,\s*min\(var\(--memory-card-width-by-height\),\s*var\(--memory-card-width-by-10col-space\)\),\s*150px\)/,
  );
  assert.match(gridRule[1], /width:\s*max-content/);
  assert.match(gridRule[1], /padding:\s*0/);
  assert.match(gridRule[1], /margin:\s*0/);
  assert.doesNotMatch(html, /--memory-grid-padding:\s*4px/);
  assert.doesNotMatch(cssBlock, /\.memory-grid\.cols-(4|6|8|10)\s*\{/);

  assert.match(
    html,
    /<div class="memory-grid-scroll">\s*<div class="memory-grid"/,
    "Rendered grid should not need mode-specific classes for card sizing",
  );
  assert.doesNotMatch(html, /getMemoryGridMaxWidth/);
});

test("fun pages keep the desktop fun list visible", () => {
  assert.match(html, /const appShell = document\.querySelector\("\.app"\)/);
  assert.match(html, /appShell\.classList\.toggle\("game-mode", activeFeature === "game"\)/);
  assert.match(html, /const isNewFunGame = \["sudoku", "minesweeper", "memory-sequence", "gomoku"\]\.includes\(game\.id\)/);
  assert.match(html, /game\.id === "memory"[\s\S]*?\? "content memory-content"[\s\S]*?: isNewFunGame \? "content fun-games-content" : "content"/);

  assert.doesNotMatch(html, /\.app\.game-mode\s*\{[\s\S]*?grid-template-columns:\s*72px minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(html, /\.app\.game-mode \.category-sidebar\s*\{[\s\S]*?display:\s*none/);
  assert.match(html, /\.app\s*\{[\s\S]*?grid-template-columns:\s*72px 220px minmax\(0,\s*1fr\)/);
  assert.match(
    html,
    /\.memory-content\s*\{[\s\S]*?padding-inline:\s*8px/,
  );
  assert.match(
    html,
    /\.memory-content \.game-page\s*\{[\s\S]*?width:\s*100%[\s\S]*?max-width:\s*none[\s\S]*?padding-inline:\s*0/,
  );
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
  assert.match(holderRule[1], /background:\s*#0f0c29 url\("angle-card\.jpg"\) center \/ cover no-repeat/);
  assert.match(imageRule[1], /width:\s*100%/);
  assert.match(imageRule[1], /height:\s*100%/);
  assert.match(imageRule[1], /object-fit:\s*cover/);
  assert.match(imageRule[1], /border-radius:\s*inherit/);
  assert.match(imageRule[1], /max-width:\s*none/);
  assert.match(imageRule[1], /max-height:\s*none/);
});

test("memory card back image is eagerly available on mobile browsers", () => {
  assert.match(
    html,
    /<link rel="preload" as="image" href="angle-card\.jpg" \/>/,
    "The card back image should be preloaded before the memory board is rendered",
  );
  assert.match(
    html,
    /<img src="angle-card\.jpg" alt="Angel" loading="eager" decoding="async" fetchpriority="high" \/>/,
    "The card back image should not rely on lazy loading inside the 3D flip layer",
  );
  assert.doesNotMatch(
    html,
    /<img src="angle-card\.jpg" alt="Angel" loading="lazy"/,
    "Lazy loading can leave the card back image blank on mobile browsers",
  );
});

test("memory card back uses an optimized image asset", () => {
  const optimizedAsset = path.join(__dirname, "..", "angle-card.jpg");
  const sourceAsset = path.join(__dirname, "..", "angle.png");

  assert.ok(fs.existsSync(optimizedAsset), "Missing optimized memory card back asset");
  assert.match(
    html,
    /<link rel="preload" as="image" href="angle-card\.jpg" \/>/,
    "The card back should preload the optimized asset",
  );
  assert.match(
    html,
    /background:\s*#0f0c29 url\("angle-card\.jpg"\) center \/ cover no-repeat/,
    "The CSS fallback should use the optimized asset",
  );
  assert.match(
    html,
    /<img src="angle-card\.jpg" alt="Angel" loading="eager" decoding="async" fetchpriority="high" \/>/,
    "The eager card image should use the optimized asset",
  );

  const optimizedSize = fs.statSync(optimizedAsset).size;
  const sourceSize = fs.statSync(sourceAsset).size;
  assert.ok(
    optimizedSize < sourceSize * 0.25,
    `Expected optimized card asset to be under 25% of source size, got ${optimizedSize} of ${sourceSize} bytes`,
  );
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

test("memory cards use a dedicated 3D inner layer for the flip animation", () => {
  const cssBlock = extractBlock(/\/\* Memory Game Styles \*\//, /\.schulte-complete/);
  const cardRule = cssBlock.match(/\.memory-card\s*\{([\s\S]*?)\}/);
  const innerRule = cssBlock.match(/\.memory-card-inner\s*\{([\s\S]*?)\}/);

  assert.ok(cardRule, "Missing .memory-card CSS rule");
  assert.ok(innerRule, "Missing .memory-card-inner CSS rule");
  assert.match(cardRule[1], /perspective:\s*1000px/);
  assert.match(innerRule[1], /transform-style:\s*preserve-3d/);
  assert.match(innerRule[1], /transition:\s*transform 0\.62s cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.match(cssBlock, /\.memory-card\.is-flipped \.memory-card-inner\s*\{[^}]*transform:\s*rotateY\(180deg\)/s);
  assert.match(cssBlock, /\.memory-card\.is-matched \.memory-card-inner\s*\{[^}]*transform:\s*rotateY\(180deg\) scale\(0\.95\)/s);
  assert.match(cssBlock, /\.card-face\s*\{[^}]*-webkit-backface-visibility:\s*hidden/s);
  assert.match(
    html,
    /<button type="button" class="memory-card[^>]*data-index="\$\{index\}"[^>]*>\s*<span class="memory-card-inner">\s*<span class="card-face card-back">/,
  );
});

test("memory flip cards use immediate touch-safe activation on mobile", () => {
  const cssBlock = extractBlock(/\/\* Memory Game Styles \*\//, /\.schulte-complete/);
  assert.match(cssBlock, /\.memory-card\s*\{[\s\S]*?touch-action:\s*manipulation/);
  assert.match(cssBlock, /-webkit-tap-highlight-color:\s*transparent/);
  assert.match(html, /function activateMemoryCard\(cardEl\)/);
  assert.match(html, /function handleMemoryCardPointerUp\(event\)/);
  assert.match(html, /event\.pointerType === "mouse"/);
  assert.match(html, /activeGame === "memory" && handleMemoryCardPointerUp\(event\)/);
  assert.match(html, /aria-label="翻开第 \$\{index \+ 1\} 张卡牌"/);
});
