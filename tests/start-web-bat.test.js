const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(path.join(__dirname, "..", "start-web.bat"), "utf8");

test("start-web batch starts both the static page and local stock API", () => {
  assert.match(script, /TOOL_WEB_PORT=8000/);
  assert.match(script, /TOOL_API_PORT=8787/);
  assert.match(script, /server\\mock-server\.js/);
  assert.match(script, /http\.server/);
  assert.match(script, /--bind','127\.0\.0\.1'/);
  assert.match(script, /TOOL_API_RATE_LIMIT_MAX=1000/);
  assert.match(script, /TOOL_API_RATE_LIMIT_WINDOW_MS=60000/);
  assert.match(script, /\$env:MOCK_RATE_LIMIT_MAX_REQUESTS=\$env:TOOL_API_RATE_LIMIT_MAX/);
  assert.match(script, /\$env:MOCK_RATE_LIMIT_WINDOW_MS=\$env:TOOL_API_RATE_LIMIT_WINDOW_MS/);
  assert.match(script, /Start-Process -FilePath 'node'/);
  assert.match(script, /Start-Process -FilePath 'python'/);
});
