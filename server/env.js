import fs from "node:fs";
import path from "node:path";

const DEFAULT_ENV_FILES = [".env", ".env.local"];

function stripInlineComment(value) {
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === "'" || char === "\"") && value[index - 1] !== "\\") {
      quote = quote === char ? "" : quote || char;
      continue;
    }
    if (char === "#" && !quote) return value.slice(0, index).trimEnd();
  }
  return value.trimEnd();
}

function unquote(value) {
  const trimmed = stripInlineComment(value).trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function parseEnv(content) {
  const entries = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    entries.push([match[1], unquote(match[2])]);
  }
  return entries;
}

export function loadServerEnv(options = {}) {
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const files = options.files || DEFAULT_ENV_FILES;
  const loadedFiles = [];
  const loadedKeys = [];

  for (const filename of files) {
    const filepath = path.resolve(cwd, filename);
    if (!fs.existsSync(filepath)) continue;
    loadedFiles.push(filepath);
    const entries = parseEnv(fs.readFileSync(filepath, "utf8"));
    for (const [key, value] of entries) {
      if (Object.prototype.hasOwnProperty.call(env, key)) continue;
      env[key] = value;
      loadedKeys.push(key);
    }
  }

  return { loadedFiles, loadedKeys };
}
