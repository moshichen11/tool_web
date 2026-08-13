const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("game entry is presented as the fun feature", () => {
  assert.match(html, /\{ id: "game", label: "趣味", icon: "🎮" \}/);
  assert.match(html, /趣味中心/);
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
