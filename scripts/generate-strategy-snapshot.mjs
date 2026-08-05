import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createEastmoneyProvider } from "../server/eastmoney-provider.js";
import { runStrategySnapshot } from "../src/stocks/strategy-snapshot-runner.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(await readFile(join(root, "src/stocks/strategy-selection-config.json"), "utf8"));
const result = await runStrategySnapshot({ provider: createEastmoneyProvider({}), config, outputDirectory: join(root, "data/strategy-selection") });
console.log(JSON.stringify(result));
