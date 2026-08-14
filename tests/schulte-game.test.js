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
  const activationBody = html.slice(
    html.indexOf("function handleSchulteCellActivation(cell)"),
    html.indexOf("function handleSchulteCellPointerDown(event)"),
  );

  assert.match(startBody, /schulteState\.started = true/);
  assert.match(startBody, /schulteState\.startTime = performance\.now\(\)/);
  assert.match(startBody, /startSchulteTimer\(\)/);
  assert.match(startBody, /classList\.remove\("is-waiting"\)/);
  assert.match(startBody, /cell\.disabled = false/);
  assert.match(activationBody, /if \(!cell \|\| !schulteState\.started \|\| schulteState\.finished\) return/);
  assert.doesNotMatch(activationBody, /if \(!schulteState\.started\)\s*\{/);
  assert.match(html, /event\.target\.closest\("\[data-schulte-start\]"\)[\s\S]*?startSchulteGame\(\)/);
});

test("苏尔特方格使用按下即响应并保留键盘点击", () => {
  assert.match(html, /function handleSchulteCellActivation\(cell\)/);
  assert.match(html, /function handleSchulteCellPointerDown\(event\)/);
  assert.match(html, /activeGame === "schulte"[\s\S]*?handleSchulteCellPointerDown\(event\)/);
  assert.match(html, /function handleSchulteCellClick\(event\)[\s\S]*?event\.detail !== 0/);
  assert.match(html, /handleSchulteCellActivation\(cell\)/);
});

test("苏尔特反馈不再强制重排并减少绘制开销", () => {
  const styleBlock = html.slice(
    html.indexOf(".schulte-cell {"),
    html.indexOf(".schulte-grid.size-6"),
  );
  const activationBlock = html.slice(
    html.indexOf("function playSchulteCellFeedback(cell, type)"),
    html.indexOf("function renderSchulteGame()"),
  );
  const timerBlock = html.slice(
    html.indexOf("function updateSchulteTimer("),
    html.indexOf("function stopSchulteTimer()"),
  );

  assert.doesNotMatch(styleBlock, /will-change:\s*transform/);
  assert.match(styleBlock, /transition:\s*transform 80ms ease-out/);
  assert.match(styleBlock, /\.schulte-cell:active:not\(\.done\)/);
  assert.match(activationBlock, /cell\.animate\(/);
  assert.doesNotMatch(activationBlock, /offsetWidth/);
  assert.match(html, /const SCHULTE_TIMER_PAINT_INTERVAL_MS = 50/);
  assert.match(timerBlock, /timestamp - schulteState\.lastTimerPaint >= SCHULTE_TIMER_PAINT_INTERVAL_MS/);
  assert.match(timerBlock, /requestAnimationFrame\(updateSchulteTimer\)/);
});
