/**
 * Lists what a push would ship outside the paths a branch is meant to carry.
 *
 *   node <skill>/scripts/ship-scope.mjs --base <ref> --scope <path> [--scope <path> …] [--head <ref>]
 *
 * Why this exists: a design branch that carries comps and documents is pushed
 * by fast-forwarding the whole branch onto the deployed one. A commit named
 * `feat(comp)` that also touched a production component shipped that change
 * with the next push, and nobody decided to ship it — the push takes every
 * commit, and a commit subject says nothing about the files under it
 * (tubrief-v2 #73, `5aeee77`). The project's push procedure calls this command
 * and asks for a decision when the list is not empty.
 *
 * The judgement is the net change `base...head`: a file outside every scope
 * whose content differs is what the push would put into production. Each such
 * file is listed with the commits in `base..head` that touched it, so the
 * decision can be traced to a commit. A change reverted inside the range
 * ships nothing and is not listed. Renames count on both paths.
 *
 * A scope is a repository-relative path: a file, or a directory that covers
 * everything under it (`app/comp` covers `app/comp/x.tsx`, not `app/compose`).
 *
 * Exit 0: nothing outside the scopes. Exit 1: one `outside scope:` line per
 * file. Exit 2: the command could not judge (a ref does not resolve, no scope,
 * or `base` is not an ancestor of `head`, which a fast-forward push refuses).
 */
import { spawnSync } from "node:child_process";

function values(name) {
  const found = [];
  for (let i = 2; i < process.argv.length; i += 1) {
    if (process.argv[i] === `--${name}` && process.argv[i + 1] !== undefined) found.push(process.argv[i + 1]);
  }
  return found;
}

function stop(message) {
  console.error(`ship-scope: ${message}`);
  process.exit(2);
}

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) stop(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

const base = values("base")[0];
const head = values("head")[0] ?? "HEAD";
const scopes = values("scope").map((scope) => scope.replace(/^\.\//, "").replace(/\/+$/, ""));
if (!base) stop("--base <ref> is required");
if (scopes.length === 0) stop("at least one --scope <path> is required");

const baseSha = git(["rev-parse", "--verify", `${base}^{commit}`]).trim();
const headSha = git(["rev-parse", "--verify", `${head}^{commit}`]).trim();
const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", baseSha, headSha]);
if (ancestor.status !== 0) stop(`${base} is not an ancestor of ${head}; a fast-forward push would refuse this range`);

const inScope = (path) => scopes.some((scope) => path === scope || path.startsWith(`${scope}/`));
const changed = git(["diff", "--name-only", "--no-renames", "-z", baseSha, headSha]).split("\0").filter(Boolean);
const outside = changed.filter((path) => !inScope(path));

// One log pass maps each outside file to the commits that touched it.
const touchedBy = new Map(outside.map((path) => [path, []]));
if (outside.length > 0) {
  const log = git(["log", "--no-renames", "--name-only", "-z", "--format=%x01%h %s", `${baseSha}..${headSha}`]);
  for (const record of log.split("\x01").filter(Boolean)) {
    const [subject, ...paths] = record.split(/\n|\0/).filter(Boolean);
    for (const path of paths) touchedBy.get(path)?.push(subject);
  }
}

const range = `${base}..${head}`;
for (const path of outside) {
  const commits = touchedBy.get(path);
  console.log(`outside scope: ${path} — ${commits.length > 0 ? commits.join("; ") : "(no single commit; a merge resolution)"}`);
}
console.log(
  `ship-scope: ${outside.length} of ${changed.length} changed files in ${range} lie outside ${scopes.join(", ")}`,
);
process.exit(outside.length > 0 ? 1 : 0);
