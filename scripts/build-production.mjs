import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JavaScriptObfuscator from "javascript-obfuscator";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(rootDirectory, "index.html");
const outputDirectory = path.join(rootDirectory, "dist");
const outputHtmlPath = path.join(outputDirectory, "index.html");
const outputScriptPath = path.join(outputDirectory, "app.min.js");
const protectedSourceRelativePath = "src/fun-games/fun-games.js";
const funGamesSourcePath = path.join(rootDirectory, protectedSourceRelativePath);
const runtimeAssets = ["angle-card.jpg", "src", "data", "CNAME", "tencent-provider.mjs"];

const [sourceHtml, funGamesScript] = await Promise.all([
  readFile(sourcePath, "utf8"),
  readFile(funGamesSourcePath, "utf8"),
]);
const inlineScript = sourceHtml.match(/<script>([\s\S]*?)<\/script>/);

if (!inlineScript) {
  throw new Error("未找到需要构建的内联 JavaScript 脚本。");
}

const protectedSource = `${funGamesScript}\n${inlineScript[1]}`;
const obfuscatedScript = JavaScriptObfuscator.obfuscate(protectedSource, {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  selfDefending: true,
  sourceMap: false,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.75,
}).getObfuscatedCode();

const productionHtml = sourceHtml
  .replace('<script src="src/fun-games/fun-games.js"></script>', "")
  .replace(inlineScript[0], '<script defer src="app.min.js"></script>');

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputHtmlPath, productionHtml, "utf8");
await writeFile(outputScriptPath, obfuscatedScript, "utf8");
await Promise.all(runtimeAssets.map(asset => cp(
  path.join(rootDirectory, asset),
  path.join(outputDirectory, asset),
  { force: true, recursive: true },
)));
await rm(path.join(outputDirectory, protectedSourceRelativePath), { force: true });

console.log(`已生成生产文件：${path.relative(rootDirectory, outputHtmlPath)} 和 ${path.relative(rootDirectory, outputScriptPath)}`);
