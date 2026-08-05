const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("strategy snapshot workflow has weekday post-close schedule and guarded commit", () => {
  const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "generate-strategy-snapshot.yml"), "utf8");
  assert.match(workflow, /cron:\s*["']10 8 \* \* 1-5["']/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /node-version:\s*["']22["']/);
  assert.match(workflow, /node scripts\/generate-strategy-snapshot\.mjs/);
  assert.match(workflow, /git diff --quiet \|\|/);
});
