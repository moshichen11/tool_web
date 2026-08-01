const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const desktopDir = path.join(__dirname, "..", "list");
const packagePath = path.join(desktopDir, "package.json");

test("desktop package config builds a Windows NSIS installer with the bundled local API", () => {
  assert.equal(fs.existsSync(packagePath), true, "desktop package config is missing");
  const config = JSON.parse(fs.readFileSync(packagePath, "utf8"));

  assert.equal(config.main, "main.mjs");
  assert.equal(config.scripts["build:win"], "electron-builder --win nsis --x64 --publish never");
  assert.equal(config.build.win.target, "nsis");
  assert.equal(config.build.directories.output, "../release");
  assert.deepEqual(config.build.extraResources.map(item => item.to).sort(), ["angle-card.jpg", "index.html", "server", "src", "tencent-provider.mjs"]);
});

test("desktop entry starts a local API, exposes its address through preload, and shuts it down on exit", () => {
  const mainPath = path.join(desktopDir, "main.mjs");
  const preloadPath = path.join(desktopDir, "preload.cjs");
  assert.equal(fs.existsSync(mainPath), true, "desktop main entry is missing");
  assert.equal(fs.existsSync(preloadPath), true, "desktop preload bridge is missing");

  const main = fs.readFileSync(mainPath, "utf8");
  const preload = fs.readFileSync(preloadPath, "utf8");
  assert.match(main, /createMockServer\(\{ port: 0, host: "127\.0\.0\.1" \}\)/);
  assert.match(main, /additionalArguments: \[`--tool-web-api-base-url=\$\{apiBaseUrl\}`\]/);
  assert.match(main, /await localApi\.stop\(\)/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\("desktopConfig"/);
  assert.match(preload, /stockApiBaseUrl/);
});
