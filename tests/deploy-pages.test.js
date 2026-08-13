const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workflowPath = path.join(__dirname, "..", ".github", "workflows", "deploy-pages.yml");

test("GitHub Pages deploys the built production artifact", () => {
  assert.ok(fs.existsSync(workflowPath), "Missing GitHub Pages deployment workflow");
  const workflow = fs.readFileSync(workflowPath, "utf8");

  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run build:production/);
  assert.match(workflow, /path:\s*dist/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
