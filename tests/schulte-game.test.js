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
