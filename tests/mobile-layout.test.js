const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function extractBlock(startPattern, endPattern) {
  const start = html.search(startPattern);
  assert.notEqual(start, -1, `Missing start pattern: ${startPattern}`);
  const rest = html.slice(start);
  const end = rest.search(endPattern);
  assert.notEqual(end, -1, `Missing end pattern: ${endPattern}`);
  return rest.slice(0, end);
}

test("page includes a dedicated mobile bottom tab bar", () => {
  assert.match(html, /<nav class="mobile-tabbar glass" id="mobileTabbar" aria-label="移动端功能导航"><\/nav>/);
  assert.match(html, /const mobileTabbar = document\.getElementById\("mobileTabbar"\)/);
});

test("mobile navigation keeps add-category access in the top search area", () => {
  assert.match(html, /<button class="mobile-add-category" id="mobileAddCategoryBtn" type="button" aria-label="添加分类">＋<\/button>/);
  assert.match(html, /const mobileAddCategoryBtn = document\.getElementById\("mobileAddCategoryBtn"\)/);
  assert.match(html, /mobileAddCategoryBtn\.addEventListener\("click", event => \{/);
  assert.match(html, /openModal\(\{ type: "add-category", selectedEmoji: "⭐" \}\)/);
});

test("mobile tab bar is rendered from the same visible feature list as desktop navigation", () => {
  assert.match(html, /function getVisibleFeatures\(\)\s*\{/);
  assert.match(html, /function renderMobileTabbar\(\)\s*\{/);
  assert.match(html, /renderFeatureList\(\);\s*renderMobileTabbar\(\);/);
  assert.match(html, /mobileTabbar\.innerHTML = getVisibleFeatures\(\)\.map/);
  assert.match(html, /data-mobile-feature="\$\{item\.id\}"/);
  assert.match(html, /aria-current="\$\{item\.id === activeFeature \? "page" : "false"\}"/);
});

test("mobile tab clicks switch the active feature and rerender the app shell", () => {
  assert.match(html, /mobileTabbar\.addEventListener\("click", event => \{/);
  assert.match(html, /const button = event\.target\.closest\("\[data-mobile-feature\]"\)/);
  assert.match(html, /activeFeature = button\.dataset\.mobileFeature/);
  assert.match(html, /renderAppShell\(\)/);
});

test("small screens use a one-column app shell with hidden sidebars and fixed bottom navigation", () => {
  const mobileMedia = extractBlock(/@media \(max-width: 560px\) \{/, /\n    \}\n  <\/style>/);

  assert.match(mobileMedia, /\.app\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(mobileMedia, /\.app\s*\{[\s\S]*?height:\s*100dvh/);
  assert.match(mobileMedia, /\.feature-sidebar,\s*\.category-sidebar\s*\{[\s\S]*?display:\s*none/);
  assert.match(mobileMedia, /\.main-panel\s*\{[\s\S]*?border-radius:\s*0/);
  assert.match(mobileMedia, /\.search-shell\s*\{[\s\S]*?height:\s*auto/);
  assert.match(mobileMedia, /\.search-shell\s*\{[\s\S]*?min-height:\s*108px/);
  assert.match(mobileMedia, /\.search-shell\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*40px/);
  assert.match(mobileMedia, /\.search-shell\s*\{[\s\S]*?gap:\s*8px/);
  assert.match(mobileMedia, /\.search-box\s*\{[\s\S]*?grid-column:\s*1/);
  assert.match(mobileMedia, /\.main-scroll\s*\{[\s\S]*?padding-bottom:\s*calc\(78px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(mobileMedia, /\.mobile-add-category\s*\{[\s\S]*?display:\s*inline-flex/);
  assert.match(mobileMedia, /\.mobile-tabbar\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(mobileMedia, /\.mobile-tabbar\s*\{[\s\S]*?display:\s*grid/);
  assert.match(mobileMedia, /\.mobile-tabbar\s*\{[\s\S]*?bottom:\s*0/);
  assert.match(mobileMedia, /\.mobile-tab-button\.active\s*\{/);
});
