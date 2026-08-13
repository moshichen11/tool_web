const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function extractFunction(name) {
  const pattern = new RegExp(`function ${name}\\(\\) \\{([\\s\\S]*?)\\n    \\}`);
  const match = html.match(pattern);
  assert.ok(match, `Missing ${name}`);
  return match[1];
}

test("schulte finish captures elapsed time before marking the game finished", () => {
  const body = extractFunction("finishSchulteGame");
  const elapsedIndex = body.indexOf("schulteState.elapsed = getSchulteElapsed();");
  const finishedIndex = body.indexOf("schulteState.finished = true;");

  assert.notEqual(elapsedIndex, -1, "finish should capture the latest elapsed time");
  assert.notEqual(finishedIndex, -1, "finish should mark the game as finished");
  assert.ok(
    elapsedIndex < finishedIndex,
    "getSchulteElapsed returns the stored elapsed value after finished=true, so capture elapsed first",
  );
});

test("苏尔特方格开始前隐藏数字并在中央显示开始按钮", () => {
  assert.match(html, /schulte-grid[^"\n]*\$\{!schulteState\.started \? "is-waiting" : ""\}/);
  assert.match(html, /data-schulte-start/);
  assert.match(html, /schulte-start-overlay/);
  assert.match(html, /disabled aria-disabled="true" aria-label="数字暂未显示"/);
  assert.match(html, /\.schulte-grid\.is-waiting \.schulte-cell\s*\{[\s\S]*?filter:\s*blur\(/);
  assert.match(html, /\.schulte-start-overlay\s*\{[\s\S]*?position:\s*absolute[\s\S]*?place-items:\s*center/);
});

test("点击开始按钮后才启动苏尔特计时和数字交互", () => {
  const startBody = extractFunction("startSchulteGame");
  const cellBody = html.slice(
    html.indexOf("function handleSchulteCellClick(event)"),
    html.indexOf("function renderSchulteGame()"),
  );

  assert.match(startBody, /schulteState\.started = true/);
  assert.match(startBody, /schulteState\.startTime = performance\.now\(\)/);
  assert.match(startBody, /startSchulteTimer\(\)/);
  assert.match(startBody, /classList\.remove\("is-waiting"\)/);
  assert.match(startBody, /cell\.disabled = false/);
  assert.match(cellBody, /if \(!cell \|\| !schulteState\.started \|\| schulteState\.finished\) return/);
  assert.doesNotMatch(cellBody, /if \(!schulteState\.started\)\s*\{/);
  assert.match(html, /event\.target\.closest\("\[data-schulte-start\]"\)[\s\S]*?startSchulteGame\(\)/);
});
