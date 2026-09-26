/**
 * The project half of a `design-substrate` run: the ES module the caller names
 * with `--config`, and the adapter it selects. Shared by `detect.mjs` and
 * `capture.mjs`, so both read the same file and the same library answers.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function loadConfig() {
  const file = flag("config");
  if (!file) {
    console.error("--config <file> is required: the project's substrate config (see design-substrate SKILL.md STEP 7)");
    process.exit(2);
  }
  const resolved = path.resolve(file);
  if (!existsSync(resolved)) {
    console.error(`config not found: ${resolved}`);
    process.exit(2);
  }
  const config = (await import(pathToFileURL(resolved).href)).default;
  const adapterFile = path.join(SCRIPT_DIR, "adapters", `${config.adapter}.mjs`);
  if (!existsSync(adapterFile)) {
    console.error(`no adapter "${config.adapter}" in ${path.dirname(adapterFile)} — answer ADAPTERS.md's six questions and add one`);
    process.exit(2);
  }
  const adapter = await import(pathToFileURL(adapterFile).href);
  return { config, adapter };
}
