/**
 * Serve this directory over http and run one command against it, for a
 * fixture whose defect needs a network: a file:// page cannot fetch.
 *
 *   node <skill>/fixtures/serve.mjs <port> -- <command…>
 *
 * Any request with `?delay=<ms>` is answered after that many milliseconds,
 * which stands in for a slow loader. `/hits?key=<k>` answers `{"n": …}`, how
 * many times `<k>` has been asked for, so a page can behave differently on a
 * later load. The command inherits stdio and its exit code is this script's;
 * the server stops when it ends.
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2]);
const split = process.argv.indexOf("--");
if (!Number.isInteger(port) || split === -1 || split === process.argv.length - 1) {
  console.error("usage: serve.mjs <port> -- <command…>");
  process.exit(2);
}
const [command, ...args] = process.argv.slice(split + 1);

const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json" };
const hits = new Map();
const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  const delay = Number(url.searchParams.get("delay") ?? 0);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  if (url.pathname === "/hits") {
    const key = url.searchParams.get("key") ?? "";
    hits.set(key, (hits.get(key) ?? 0) + 1);
    response.writeHead(200, { "content-type": TYPES[".json"] }).end(JSON.stringify({ n: hits.get(key) }));
    return;
  }
  const file = path.join(root, path.normalize(url.pathname));
  if (!file.startsWith(`${root}/`)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    response.writeHead(404).end();
  }
});
server.on("error", (error) => {
  console.error(`serve.mjs: ${error.message}`);
  process.exit(2);
});
server.listen(port, "127.0.0.1", () => {
  const child = spawn(command, args, { stdio: "inherit" });
  child.on("exit", (code) => {
    server.close();
    process.exit(code ?? 1);
  });
});
