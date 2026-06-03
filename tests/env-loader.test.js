const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "stock-env-"));
}

test("server env loader reads local env files without overriding existing process values", async () => {
  const { loadServerEnv } = await import("../server/env.js");
  const cwd = makeTempDir();
  fs.writeFileSync(path.join(cwd, ".env"), "STOCK_DATA_SOURCE=eastmoney\nXUEQIU_TIMEOUT_MS=1000\n", "utf8");
  fs.writeFileSync(path.join(cwd, ".env.local"), "STOCK_DATA_SOURCE=xueqiu\nTEST_SESSION=\"local-cookie\"\n", "utf8");

  const env = { STOCK_DATA_SOURCE: "preconfigured" };
  const result = loadServerEnv({ cwd, env });

  assert.equal(env.STOCK_DATA_SOURCE, "preconfigured");
  assert.equal(env.XUEQIU_TIMEOUT_MS, "1000");
  assert.equal(env.TEST_SESSION, "local-cookie");
  assert.deepEqual(result.loadedFiles.map(file => path.basename(file)), [".env", ".env.local"]);
  assert.deepEqual(result.loadedKeys.sort(), ["TEST_SESSION", "XUEQIU_TIMEOUT_MS"]);
});

test("server env loader supports comments, empty values, and quoted hashes", async () => {
  const { loadServerEnv } = await import("../server/env.js");
  const cwd = makeTempDir();
  fs.writeFileSync(path.join(cwd, ".env.local"), [
    "# local secret file",
    "XUEQIU_TOKEN=",
    "TEST_QUOTED='cookie-with-#-hash'",
    "XUEQIU_RETRY_ATTEMPTS=2 # inline comment",
  ].join("\n"), "utf8");

  const env = {};
  const result = loadServerEnv({ cwd, env });

  assert.equal(env.XUEQIU_TOKEN, "");
  assert.equal(env.TEST_QUOTED, "cookie-with-#-hash");
  assert.equal(env.XUEQIU_RETRY_ATTEMPTS, "2");
  assert.deepEqual(result.loadedKeys.sort(), ["TEST_QUOTED", "XUEQIU_RETRY_ATTEMPTS", "XUEQIU_TOKEN"]);
});
