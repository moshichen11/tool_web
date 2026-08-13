const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const buildPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("production build creates an obfuscated static page without source maps", () => {
  const scriptPath = path.join(root, "scripts", "build-production.mjs");
  assert.ok(fs.existsSync(scriptPath), "Missing production build script");
  const source = fs.readFileSync(scriptPath, "utf8");

  assert.match(source, /JavaScriptObfuscator\.obfuscate/);
  assert.match(source, /sourceMap:\s*false/);
  assert.match(source, /index\.html/);
  assert.match(source, /app\.min\.js/);
  assert.match(source, /from "javascript-obfuscator"/);
  assert.match(source, /runtimeAssets/);
  assert.match(source, /"angle-card\.jpg"/);
  assert.match(source, /"src"/);
  assert.match(source, /"data"/);
  assert.match(source, /"tencent-provider\.mjs"/);
  assert.equal(buildPackage.devDependencies["javascript-obfuscator"], "^4.2.2");
});

test("production build is available from the tracked root package", () => {
  assert.equal(buildPackage.scripts["build:production"], "node scripts/build-production.mjs");
});
