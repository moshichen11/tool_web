const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("game entry is presented as the fun feature", () => {
  assert.match(html, /\{ id: "game", label: "趣味", icon: "🎮" \}/);
  assert.match(html, /趣味中心/);
  assert.match(html, /fallback\.id === "game" \? fallback\.label/);
  assert.match(html, /sidePanelTitle\.textContent = "趣味列表"/);
});

test("fun feature includes a custom spin wheel without an option count cap", () => {
  assert.match(html, /id: "wheel",\s*name: "幸运轮盘"/);
  assert.match(html, /const WHEEL_OPTIONS_KEY = "glass_nav_wheel_options"/);
  assert.match(html, /function renderWheelGame\(\)/);
  assert.match(html, /data-wheel-options/);
  assert.match(html, /data-wheel-spin/);
  assert.match(html, /function saveWheelOptions\(options\)/);
  assert.doesNotMatch(html, /wheelOptions\.slice\(/, "wheel options must not be capped");
});

test("wheel spin selects from the current custom options", () => {
  const start = html.indexOf("function spinWheel() {");
  const end = html.indexOf("function renderWheelGame()", start);
  assert.notEqual(start, -1, "Missing spinWheel");
  assert.notEqual(end, -1, "Missing renderWheelGame after spinWheel");
  const block = html.slice(start, end);

  assert.match(block, /Math\.floor\(Math\.random\(\) \* options\.length\)/);
  assert.match(block, /wheelState\.result = options\[selectedIndex\]/);
});

test("wheel restores its spin animation with a random duration from 2 to 8 seconds", () => {
  assert.match(html, /const WHEEL_SPIN_MIN_MS = 2000/);
  assert.match(html, /const WHEEL_SPIN_MAX_MS = 8000/);
  assert.match(html, /function getRandomWheelSpinDuration\(\)/);
  assert.match(
    html,
    /Math\.floor\(Math\.random\(\) \* \(WHEEL_SPIN_MAX_MS - WHEEL_SPIN_MIN_MS \+ 1\)\) \+ WHEEL_SPIN_MIN_MS/,
  );
  assert.match(html, /transition:\s*transform var\(--wheel-spin-duration, 4s\)/);

  const start = html.indexOf("function spinWheel() {");
  const end = html.indexOf("function renderWheelGame()", start);
  const block = html.slice(start, end);
  assert.match(block, /const spinDuration = getRandomWheelSpinDuration\(\)/);
  assert.match(block, /disc\.style\.setProperty\("--wheel-spin-duration", `\$\{spinDuration\}ms`\)/);
  assert.match(block, /}, spinDuration \+ 50\)/);
  assert.doesNotMatch(block, /}, 4450\)/);
});

test("wheel has a fixed pointer extending upward from its center hub", () => {
  assert.match(html, /<div class="wheel-center-pointer" aria-hidden="true"><\/div>/);
  assert.match(
    html,
    /\.wheel-center-pointer\s*\{[^}]*position:\s*absolute[^}]*height:\s*18%[^}]*transform:\s*translate\(-50%,\s*-100%\)[^}]*pointer-events:\s*none/s,
  );
  assert.match(html, /\.wheel-center-pointer::before\s*\{[^}]*border-bottom:\s*16px solid/s);

  const start = html.indexOf("function renderWheelGame() {");
  const end = html.indexOf("function bindWheelEvents()", start);
  const block = html.slice(start, end);
  const discIndex = block.indexOf("data-wheel-disc");
  const pointerIndex = block.indexOf('class="wheel-center-pointer"');
  const hubIndex = block.indexOf('class="wheel-center"');

  assert.ok(discIndex >= 0 && discIndex < pointerIndex, "center pointer should stay outside the rotating disc");
  assert.ok(pointerIndex < hubIndex, "center hub should cover the base of the pointer");
});
