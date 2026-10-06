/**
 * The wiring between the product map and the process map, as a command rather
 * than a convention.
 *
 *   node <skill>/scripts/ledger.mjs close <gate-issue> --map <process-map> --comment <file>
 *   node <skill>/scripts/ledger.mjs check <gate-issue> [--file <draft>]
 *   node <skill>/scripts/ledger.mjs sync  <gate-issue> --map <process-map-issue>
 *   node <skill>/scripts/ledger.mjs audit --map <process-map-issue> --product <product-map-issue> [--since <date>] [--process-since <date>] [--tracker <snapshot.json>]
 *   node <skill>/scripts/ledger.mjs frontier --map <process-map-issue> --product <product-map-issue> [--tracker <snapshot.json>]
 *
 * Why this exists: the feedback loop failed once already, and it failed in the
 * only way a convention can — someone has to remember. Every owner finding at a
 * gate is supposed to end up classified and, when it generalises, carried into
 * the process map. Writing that down as a rule produced one carried finding out
 * of twelve. So the ledger is a machine-readable block, `check` refuses to pass
 * a gate with an unclassified row, `sync` creates the process tickets from the
 * rows itself, and `audit` reports rows that never became tickets.
 *
 * The ledger block lives in a comment on the gate's own issue:
 *
 *   ```ledger
 *   finding: 30px theme group beside a 36px language chip
 *   class: asset
 *   where: design-loop/scripts/measure-surface.mjs (criterion 8)
 *   ---
 *   finding: thumbnail cropped to its top
 *   class: protocol
 *   where: REFERENCE.md criterion 9
 *   ---
 *   finding: list RPC caps the brief at three entries
 *   class: project
 *   where: sql/functions/load_videos_with_translations.sql
 *   ```
 *
 * `close` is the one a gate actually uses: it runs `check`, posts the resolution
 * comment, closes the issue and runs `sync`, stopping at the first failure. The
 * separation between "close the gate" and "carry the findings" is where the
 * loop leaked before — two acts meant the second could be skipped — so there is
 * no supported way to do the first without the second. `--dry-run` prints the
 * plan and writes nothing. `close` reads the ledger from the issue and from the
 * `--comment` file, so a resolution can carry its own block.
 *
 * A process ticket closes through `close` too, with `--map` naming its own map.
 * Its resolution is the claim "this is fixed", so it states what catches the
 * defect next round exactly as a carried gate row does; a row it cannot catch
 * yet becomes a new process ticket through the same `sync`. Closing it with the
 * tracker's own close skipped that question: of 21 process tickets closed by
 * 2026-09-26, 13 named no catcher and the other 8 did so only because the author
 * remembered.
 *
 * A row is *carried* when the finding was already folded into the protocol
 * during the gate itself; `sync` and `audit` create nothing for it, because a
 * ticket asking for work that is already done is noise that trains people to
 * ignore the queue. Carrying is a claim about the next round, so it has to say
 * what will catch the defect there:
 *
 *   caught-by: cmd <command>        a check that exits non-zero on this defect
 *   red: <commit>                   the commit on which that command failed on
 *                                   this very defect — required with `cmd`
 *   red-line: <output line>         the line of that failing run's output that
 *                                   names this defect, verbatim — required
 *                                   with `cmd`
 *   green: <commit>                 the commit on which the same command exits 0
 *                                   with the defect fixed — required with `cmd`
 *   caught-by: doc <path> — <sect>  a sentence a reader has to apply; reported
 *                                   as document-only, never as enforced. On a
 *                                   protocol row the file must lie under the
 *                                   skills or outside this repository — a
 *                                   project doc is not read by the next project
 *   ticket: #<n>                    carried into a process ticket instead, whose
 *                                   resolution owns the catcher
 * `ticket:` with a commit or prose records only where a change landed. Both
 * G1 leaks had exactly that shape: a row pointed at a commit that rendered the
 * chrome, yet the language control was still a static label; a closed ticket
 * put "count what you could not read" into SKILL.md while neither measurer
 * counted anything. So `check` refuses such a row without `caught-by:`. `red`
 * is a failing run, not a passing one: a command that reads nothing passes
 * every fixed artifact too, and only a failure on the defect shows it detects
 * it. `green` is the mirror: a command that fails on everything — no server, a
 * typo — also fails on the defect, and only a pass on the fix shows it tells
 * the two apart. The two must differ. Both are records of runs the author made,
 * never rerun here: a rerun took 14–41 minutes per commit (process ticket #54,
 * n=4) and 9 of the first 14 `cmd` rows could not even run as written. What the
 * record does need is `red-line`. Exit 1 alone is not red — every red rerun for
 * #49 also failed on unrelated things (a 1440×1400 fit, other dead controls),
 * and only the named line tied the failure to the defect; and a red written
 * without being run (#55's `e841abb`, already fixed) has no line to paste.
 * `asset` means executable by definition, so an asset row accepts `cmd` only,
 * and its command must run a script inside the skills (`SKILLS_ROOT`, after
 * following links): a check that lives in one project's repository protects
 * that repository, and the next project meets the defect from scratch — the
 * G1 finding behind process ticket #56, which the substrate detector repeated.
 * A project caller that only builds URLs cannot be told apart from a check by
 * reading it, so a row run through a caller names the skill command it runs.
 * `check` resolves a bare `red`/`green` with `git` in the working directory —
 * run it from the repo where the defect lived — and requires both to be
 * ancestors of HEAD: the remote carries `main` only, so a red on a side branch
 * (`red/popup-scope`) is unverifiable from any other clone. A mutation that
 * revives a defect is committed on the working branch and reverted by the next
 * commit — red is the mutation, green the revert.
 *
 * The skills themselves are versioned too (`design-md/skills/`, symlinked into
 * `~/.agents/skills`), so a defect in this script or a measurer is recorded as
 * `red: design-md@<sha>`: the prefix is the directory name of the checkout that
 * holds this file, and the same ancestor and reachability rules run there.
 * Before that, every catcher living in the skills could only be written down as
 * `doc` (process tickets #50, #54, #63). Red and green sit in one repository —
 * the side that changed between the two runs; the side held still is not
 * recorded, which the record-not-rerun rule above accepts. When the defect is
 * in the command's input rather than its code — a ledger draft for `check`, a
 * tracker state for `audit` — the input is a fixture under
 * `design-loop/fixtures/`, and the mutation and revert are commits to it.
 *
 * A `doc` path resolves
 * against the working directory and then the skills root. Rows written before
 * this rule carry a bare `ticket:`, a `red:` without `green:`, or no
 * `red-line:`; `sync` and `audit` still read them as carried, and only
 * `check`/`close` hold a row to the current rule.
 *
 * `class` is one of protocol | asset | project. A row missing `class`, or
 * carrying any other value, fails `check`. A `protocol` or `asset` row without
 * a corresponding process-map ticket fails `audit`; `project` rows are expected
 * to stay in the product repo and are never carried.
 *
 * `audit` catches these leaks, because a session that works only the product
 * map never looks at the process map and so cannot notice what it failed to
 * send there:
 *
 *   MISSING    a ledger row that never became a process ticket
 *   UNRECORDED a ticket closed with no ledger block at all — closed with the
 *              tracker's own close instead of `close`, so its findings were
 *              never asked for. Product tickets are held from `--since`,
 *              process tickets from `--process-since` (a date or an ISO
 *              timestamp, compared against `closed_at`); a missing flag holds
 *              every closed ticket. A process ticket closed as not planned is
 *              out of scope, not resolved, and is never held
 *   UNWIRED    an open ticket carried from this product map — its ledger-source
 *              gate, or the gate at the root of a chain of process tickets, is
 *              a child of --product — that the product map is not `blocked_by`;
 *              the product map could close while that fix is still undone
 *   UNREACHABLE a `red`/`green` of a closed ticket's row that is on no local
 *              branch and not on origin/main — its branch was deleted unpushed,
 *              or this clone never had it. Only rows with `red-line` are held.
 *              A commit on a local branch but not yet on origin/main is listed
 *              as UNPUSHED without failing: close precedes push by design
 *              (26h for #44), and failing then would force a deploy
 *   UNSOURCED  an open product ticket with neither or both of the `source:`
 *              labels, so `frontier` cannot tell whose it is
 *
 * `frontier` names the next ticket. First the open process tickets the
 * product map is `blocked_by` (process-map order): this product map's own
 * fixes land before its next ticket. Then the product map's open, unassigned,
 * unblocked children by source: `source:owner` (an owner finding, or a ticket
 * of a plan the owner approved), then `source:agent` with `owner-approved`,
 * each in map order. A `source:agent` ticket without approval is listed for
 * the owner and never picked. Map order alone is creation order: tubrief-v2
 * #119's session got #100, which the agent had found in its own measurement,
 * ahead of the owner decision blocking G3, while the owner's rule to look at
 * the source first was a sentence in the map's Notes. Process tickets carry no
 * source; their order was never the defect.
 *
 * A ticket whose resolution genuinely produced nothing for the process still
 * closes through `close`, with one `class: project` row saying why. Silence is
 * what the loop cannot tell apart from forgetting.
 *
 * Tracker: GitHub via `gh`, matching this repo family's issue-tracker doc. A
 * different tracker reimplements `readLedger`, `listTickets`, `blockedBy` and
 * `createTicket` and keeps everything else. `--tracker <snapshot.json>` swaps
 * the three reads for a file (shape at `snapshot()`); `close` and `sync` write,
 * so they refuse it.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLASSES = new Set(["protocol", "asset", "project"]);
// Node resolves the symlink `~/.agents/skills/design-loop` for the main
// module, so this is the checkout that versions the skills, not the link.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILLS_ROOT = resolve(SCRIPT_DIR, "../..");

function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

function gh(args) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function parseLedger(text) {
  const blocks = [...text.matchAll(/```ledger\n([\s\S]*?)```/g)].map(
    (match) => match[1],
  );
  const rows = [];
  const problems = [];
  for (const block of blocks) {
    for (const chunk of block.split(/\n---\n/)) {
      const values = new Map();
      for (const line of chunk.split("\n")) {
        const match = line.match(/^(finding|class|where|ticket|caught-by|red-line|red|green):\s*(.*)$/);
        if (match) values.set(match[1], [...(values.get(match[1]) ?? []), match[2].trim()]);
      }
      const findings = values.get("finding") ?? [];
      const findingPair = [
        findings[0] ?? "(missing)",
        findings[1] ?? findings[0] ?? "(missing)",
      ];
      const duplicates = [...values.entries()]
        .filter(([, entries]) => entries.length > 1)
        .map(([key]) => key);
      for (const key of duplicates) problems.push({ key, findings: findingPair });
      if (duplicates.length) continue;
      const row = Object.fromEntries([...values].map(([key, entries]) => [key, entries[0]]));
      if (row.finding) rows.push(row);
    }
  }
  return { rows, problems };
}

function isCarried(row) {
  return Boolean(row.ticket || row["caught-by"]);
}

function git(dir, args) {
  return spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
}

// The repository that versions this script, if any — the only one a
// `<name>@<sha>` reference may name. Its name is the checkout's directory name.
let skillsRepoCache;
function skillsRepo() {
  if (skillsRepoCache === undefined) {
    const top = git(SCRIPT_DIR, ["rev-parse", "--show-toplevel"]);
    skillsRepoCache = top.status === 0 ? { name: basename(top.stdout.trim()), dir: top.stdout.trim() } : null;
  }
  return skillsRepoCache;
}

// A recorded red/green: `<sha>` is a commit in the working directory's
// repository, `<name>@<sha>` one in the skills repository. Returns
// { sha, dir, where } or { error }.
function parseRef(ref) {
  const match = ref.match(/^(?:([\w.-]+)@)?([0-9a-f]{7,40})$/);
  if (!match) return { error: `${ref} is not a commit reference — <sha>, or <repo>@<sha> for the skills repository` };
  const [, name, sha] = match;
  if (!name) return { sha, dir: process.cwd(), where: process.cwd() };
  const repo = skillsRepo();
  if (!repo) return { error: `${ref} names a repository, but ${SCRIPT_DIR} is in none` };
  if (repo.name !== name) return { error: `${name}@ is not the skills repository — the only prefix here is ${repo.name}@ (${repo.dir})` };
  return { sha, dir: repo.dir, where: `${name} (${repo.dir})` };
}

function isCommit({ sha, dir }) {
  return git(dir, ["rev-parse", "--verify", "--quiet", `${sha}^{commit}`]).status === 0;
}

function isAncestor({ sha, dir }, of) {
  return git(dir, ["merge-base", "--is-ancestor", sha, of]).status === 0;
}

// Reachability is judged against each remote as it is now, not as this clone
// last saw it; a repository is fetched once, on its first reference.
const fetched = new Set();
function fetchMain(dir) {
  if (fetched.has(dir)) return;
  const result = git(dir, ["fetch", "--quiet", "origin", "main"]);
  if (result.status !== 0) throw new Error(`git fetch origin main in ${dir} failed: ${result.stderr.trim()}`);
  fetched.add(dir);
}

// Where a recorded commit can still be found, for `audit`: on the remote
// `main` (anyone can check it), only on a local branch (not pushed yet —
// the normal gap between close and push, 26h for #44), or nowhere a branch
// keeps it (its branch was deleted unpushed, or this clone never had it).
function reach(ref) {
  const parsed = parseRef(ref);
  if (parsed.error || !isCommit(parsed)) return "unreachable";
  fetchMain(parsed.dir);
  if (isAncestor(parsed, "origin/main")) return "pushed";
  const branches = git(parsed.dir, ["for-each-ref", "--contains", parsed.sha, "refs/heads"]);
  return branches.status === 0 && branches.stdout.trim() ? "unpushed" : "unreachable";
}

// The script an asset row's command runs, if it lies inside the skills. The
// first token that names a file is the script: `node <script>`, `npx tsx
// <script>`, `sh <script>`; env assignments and flags before it are skipped.
// Relative paths resolve against the working directory and then SKILLS_ROOT,
// so `design-loop/scripts/…` and `~/.agents/skills/…` both land in the checkout.
function skillScript(command) {
  for (const token of command.split(/\s+/)) {
    if (!token || /^[A-Z_][A-Z0-9_]*=/.test(token) || token.startsWith("-")) continue;
    if (!/[/.]/.test(token)) continue;
    const path = token.replace(/^~\//, `${homedir()}/`);
    for (const candidate of [resolve(path), resolve(SKILLS_ROOT, path)]) {
      if (!existsSync(candidate)) continue;
      const real = realpathSync(candidate);
      if (real.startsWith(`${SKILLS_ROOT}/`)) return { script: real };
      return { outside: real };
    }
  }
  return {};
}

// What would catch this finding next round, or why the row cannot claim to be
// carried. Returns { kind, problem } — kind is cmd | doc | ticket | null.
function catcher(row) {
  if (row.class === "project" || !isCarried(row)) return { kind: null };
  if (!row["caught-by"]) {
    if (/^#\d+$/.test(row.ticket)) return { kind: "ticket" };
    return {
      kind: null,
      problem: `ticket: ${row.ticket} says where a change landed, not what catches the defect next round — add caught-by: cmd|doc, or carry it as ticket: #<n>`,
    };
  }
  const match = row["caught-by"].match(/^(cmd|doc)\s+(.+)$/);
  if (!match) return { kind: null, problem: "caught-by must start with cmd or doc" };
  const [, kind, rest] = match;
  if (row.class === "asset" && kind !== "cmd") {
    return { kind, problem: "an asset row is executable by definition — caught-by: cmd only" };
  }
  if (row.class === "asset") {
    const found = skillScript(rest);
    if (!found.script) {
      return {
        kind,
        problem: `an asset row's command must run a script inside ${SKILLS_ROOT} — ${found.outside ? `${found.outside} is a project file` : "no script path found"}; a check in one repository is not inherited by the next project (write the skill command a caller runs)`,
      };
    }
  }
  if (kind === "cmd") {
    if (!row.red) return { kind, problem: "caught-by: cmd needs red: <commit where it failed on this defect>" };
    if (!row["red-line"]) return { kind, problem: "caught-by: cmd needs red-line: <the output line of the red run that names this defect, verbatim>" };
    if (!row.green) return { kind, problem: "caught-by: cmd needs green: <commit where it exits 0 with the defect fixed>" };
    if (row.red === row.green) return { kind, problem: `red and green are both ${row.red} — one commit cannot carry the defect and its fix` };
    const refs = [row.red, row.green].map(parseRef);
    for (const ref of refs) if (ref.error) return { kind, problem: ref.error };
    if (refs[0].dir !== refs[1].dir) {
      return { kind, problem: `red ${row.red} and green ${row.green} are in different repositories — record the side that changed between the two runs` };
    }
    for (const [index, ref] of refs.entries()) {
      const written = index === 0 ? row.red : row.green;
      if (!isCommit(ref)) return { kind, problem: `${written} is not a commit in ${ref.where}` };
      if (!isAncestor(ref, "HEAD")) {
        return { kind, problem: `${written} is not an ancestor of HEAD in ${ref.where} — a side branch never reaches main; commit the mutation and its revert on this branch` };
      }
    }
    return { kind };
  }
  const path = rest.split(/\s+/)[0].replace(/^~\//, `${homedir()}/`);
  const found = [resolve(path), resolve(SKILLS_ROOT, path)].filter((p) => existsSync(p)).map((p) => realpathSync(p));
  if (found.length === 0) {
    return { kind, problem: `caught-by: doc ${path} — no such file here or under ${SKILLS_ROOT}` };
  }
  // A protocol rule is for the next project, which reads the skills and the
  // global agent file but not this repository. In 2026-09 five G1 rows named
  // `direction-round-learnings.md` of the project as their catcher.
  if (row.class === "protocol") {
    const top = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
    const repo = top.status === 0 ? realpathSync(top.stdout.trim()) : null;
    const inherited = found.filter((p) => p.startsWith(`${SKILLS_ROOT}/`) || !repo || !p.startsWith(`${repo}/`));
    if (inherited.length === 0) {
      return {
        kind,
        problem: `a protocol row's doc must be one the next project reads — ${found[0]} is inside this repository (${repo}); put the rule under ${SKILLS_ROOT} or a global agent file, or carry it as ticket: #<n>`,
      };
    }
  }
  return { kind };
}

// Shared by check and close: every row classified, every carried row names
// its catcher, and malformed items are refused. Prints the rows and returns
// the number of failures.
function validate(rows, problems = []) {
  let failures = 0;
  for (const { key, findings } of problems) {
    failures += 1;
    console.error(
      ` - DUPLICATE KEY "${key}" between findings ${JSON.stringify(findings[0])} and ${JSON.stringify(findings[1])} — separate rows with ---`,
    );
  }
  for (const row of rows) {
    if (!CLASSES.has(row.class ?? "")) {
      failures += 1;
      console.error(` - UNCLASSIFIED ${row.finding}`);
      continue;
    }
    const { kind, problem } = catcher(row);
    if (problem) {
      failures += 1;
      console.error(` - [${row.class}] UNCAUGHT ${row.finding}\n     ${problem}`);
      continue;
    }
    const how = { cmd: `caught by command, red ${row.red}, green ${row.green}`, doc: "document only — a reader must apply it", ticket: `carried as ${row.ticket}` }[kind];
    console.log(` - [${row.class}] ${row.finding}${how ? `  (${how})` : ""}`);
  }
  const caught = rows.map(catcher).filter(({ kind, problem }) => kind && !problem);
  const byKind = (k) => caught.filter(({ kind }) => kind === k).length;
  console.log(
    `carried ${caught.length}: ${byKind("cmd")} by command, ${byKind("doc")} by document only, ${byKind("ticket")} as tickets`,
  );
  return failures;
}

// `--tracker <file>` replaces the three tracker reads — an issue's text, a
// map's children, a product map's blockers — with a snapshot, so a defect that
// lives in tracker state can be committed as a fixture and give `audit` a
// red/green pair. `frontier` reads the same three. Shape:
//   { "issues": { "<n>": { "title", "body", "comments": ["…"], "state",
//                          "stateReason", "closedAt", "labels": ["…"],
//                          "assignees": ["…"], "openBlockers": <n> } },
//     "subIssues": { "<map>": [<n>, …] }, "blockedBy": { "<product>": [<n>, …] } }
let snapshotCache;
function snapshot() {
  const file = flag("tracker");
  if (!file) return null;
  snapshotCache ??= JSON.parse(readFileSync(file, "utf8"));
  return snapshotCache;
}

function snapshotIssue(n) {
  const issue = snapshot().issues?.[String(n)];
  if (!issue) throw new Error(`--tracker ${flag("tracker")} has no issue ${n}`);
  return issue;
}

function repoName() {
  return gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).trim();
}

function readLedger(issue, extraText = "") {
  // `--file` reads a ledger draft off disk instead of the tracker, so a round
  // can validate its ledger before posting it.
  const file = flag("file");
  if (file) {
    return { title: `(file) ${file}`, ...parseLedger(readFileSync(file, "utf8")) };
  }
  const payload = snapshot()
    ? { ...snapshotIssue(issue), comments: (snapshotIssue(issue).comments ?? []).map((body) => ({ body })) }
    : JSON.parse(gh(["issue", "view", String(issue), "--json", "body,comments,title"]));
  const text = [payload.body ?? "", ...payload.comments.map((c) => c.body), extraText].join(
    "\n\n",
  );
  return { title: payload.title, ...parseLedger(text) };
}

function listTickets(map) {
  if (snapshot()) {
    return (snapshot().subIssues?.[String(map)] ?? []).map((n) => {
      const issue = snapshotIssue(n);
      return { number: n, title: issue.title, state: issue.state, stateReason: issue.stateReason ?? null, closedAt: issue.closedAt ?? null, body: issue.body ?? "", labels: issue.labels ?? [], assignees: issue.assignees ?? [], openBlockers: issue.openBlockers ?? 0 };
    });
  }
  const children = JSON.parse(
    gh(["api", `repos/${repoName()}/issues/${map}/sub_issues`, "--paginate"]),
  );
  return children.map((child) => ({
    number: child.number,
    title: child.title,
    state: child.state,
    stateReason: child.state_reason,
    closedAt: child.closed_at,
    body: child.body ?? "",
    labels: child.labels.map((label) => label.name),
    assignees: child.assignees.map((user) => user.login),
    openBlockers: child.issue_dependencies_summary?.blocked_by ?? 0,
  }));
}

function blockedBy(product) {
  if (snapshot()) return new Set(snapshot().blockedBy?.[String(product)] ?? []);
  return new Set(
    JSON.parse(gh(["api", `repos/${repoName()}/issues/${product}/dependencies/blocked_by`, "--paginate"])).map(
      (issue) => issue.number,
    ),
  );
}

const SOURCE = { owner: "source:owner", agent: "source:agent" };
const APPROVED = "owner-approved";

function sourceOf(ticket) {
  const owner = ticket.labels.includes(SOURCE.owner);
  const agent = ticket.labels.includes(SOURCE.agent);
  return owner === agent ? null : owner ? "owner" : "agent";
}

function unsourced(gates) {
  const found = gates.filter((ticket) => ticket.state === "open" && !sourceOf(ticket));
  for (const ticket of found) {
    console.log(`UNSOURCED   #${ticket.number} is open with ${ticket.labels.includes(SOURCE.owner) ? "both" : "neither"} of ${SOURCE.owner} / ${SOURCE.agent}: ${ticket.title}`);
  }
  return found.length;
}

function createTicket({ map, row, gate, gateTitle }) {
  const repo = repoName();
  const label = row.class === "asset" ? "wayfinder:task" : "wayfinder:grilling";
  const body = [
    "## Question",
    "",
    `Gate 피드백에서 온 항목이다. 이것을 공정의 어디에, 어떤 형태로 고정할 것인가?`,
    "",
    `- **finding**: ${row.finding}`,
    `- **class**: ${row.class}`,
    `- **제안된 위치**: ${row.where ?? "(미정)"}`,
    `- **출처**: #${gate} — ${gateTitle}`,
    "",
    "`ledger.mjs`가 만든 티켓이다. 이 줄을 지우지 말 것 — `audit`이 이 출처 줄로 누락을 찾는다.",
    "",
    `<!-- ledger-source: ${gate} :: ${row.finding} -->`,
  ].join("\n");

  const url = gh([
    "issue",
    "create",
    "--title",
    `공정 반영: ${row.finding}`.slice(0, 120),
    "--body",
    body,
    "--label",
    label,
  ]).trim();
  const number = Number(url.split("/").pop());
  const childId = JSON.parse(gh(["api", `repos/${repo}/issues/${number}`, "--jq", "{id: .id}"])).id;
  gh([
    "api",
    "--method",
    "POST",
    `repos/${repo}/issues/${map}/sub_issues`,
    "-F",
    `sub_issue_id=${childId}`,
  ]);
  return { number, url };
}

const [command, target] = process.argv.slice(2);

if ((command === "close" || command === "sync") && flag("tracker")) {
  throw new Error("--tracker is a read-only snapshot; close and sync write to the tracker");
}

if (command === "check") {
  const { rows, problems } = readLedger(target);
  console.log(`${rows.length} ledger rows on #${target}`);
  if (rows.length === 0 && problems.length === 0) {
    console.error("ledger: no ledger block found — a gate cannot close without one");
    process.exit(1);
  }
  const failures = validate(rows, problems);
  if (failures > 0) {
    console.error(`ledger: ${failures} problem(s) — gate stays open`);
    process.exit(1);
  }
  console.log("ledger: every row classified, every carried row names its catcher");
} else if (command === "close") {
  const map = flag("map");
  const commentFile = flag("comment");
  const dry = process.argv.includes("--dry-run");
  if (!map) throw new Error("close needs --map <process-map-issue>");
  if (!commentFile) throw new Error("close needs --comment <file>");

  const { rows, problems, title } = readLedger(target, readFileSync(commentFile, "utf8"));
  if (rows.length === 0 && problems.length === 0) {
    console.error("ledger: no ledger block found — gate stays open");
    process.exit(1);
  }
  console.log(`#${target} ${title}`);
  const failures = validate(rows, problems);
  if (failures > 0) {
    console.error(`ledger: ${failures} problem(s) — gate stays open`);
    process.exit(1);
  }
  const toCarry = rows.filter((row) => row.class !== "project" && !isCarried(row));
  console.log(`ledger: ${rows.length} rows, ${toCarry.length} to carry into #${map}`);
  if (dry) {
    for (const row of toCarry) console.log(` would create: [${row.class}] ${row.finding}`);
    console.log("dry run: nothing written");
    process.exit(0);
  }
  gh(["issue", "comment", String(target), "--body-file", commentFile]);
  gh(["issue", "close", String(target)]);
  console.log(`closed #${target}`);
  const existing = listTickets(map);
  for (const row of toCarry) {
    const marker = `ledger-source: ${target} :: ${row.finding}`;
    if (existing.some((ticket) => ticket.body.includes(marker))) {
      console.log(`exists: ${row.finding}`);
      continue;
    }
    const created = createTicket({ map, row, gate: target, gateTitle: title });
    console.log(`created #${created.number}: ${row.finding}`);
  }
} else if (command === "sync") {
  const map = flag("map");
  if (!map) throw new Error("sync needs --map <process-map-issue>");
  const { rows, title } = readLedger(target);
  const existing = listTickets(map);
  for (const row of rows) {
    if (!CLASSES.has(row.class ?? "")) {
      console.error(`skip (unclassified): ${row.finding}`);
      continue;
    }
    if (row.class === "project") continue;
    if (isCarried(row)) {
      console.log(`already carried (${row["caught-by"] ?? row.ticket}): ${row.finding}`);
      continue;
    }
    const marker = `ledger-source: ${target} :: ${row.finding}`;
    if (existing.some((ticket) => ticket.body.includes(marker))) {
      console.log(`exists: ${row.finding}`);
      continue;
    }
    const created = createTicket({ map, row, gate: target, gateTitle: title });
    console.log(`created #${created.number}: ${row.finding}`);
  }
} else if (command === "audit") {
  const map = flag("map");
  const product = flag("product");
  if (!map || !product) throw new Error("audit needs --map and --product");
  const tickets = listTickets(map);
  const gates = listTickets(product);
  // Each recorded commit's remote is fetched on its first reference (`reach`).
  // `closed_at` is an ISO timestamp, so a plain string comparison works for a
  // date (`2026-09-21` holds everything closed on that day) and for a timestamp.
  const held = (ticket, since) => ticket.state === "closed" && !(since && ticket.closedAt && ticket.closedAt < since);
  const resolved = [
    ...gates.map((gate) => ({ ticket: gate, since: flag("since") })),
    ...tickets
      .filter((ticket) => ticket.stateReason !== "not_planned")
      .map((ticket) => ({ ticket, since: flag("process-since"), process: true })),
  ];
  let missing = 0;
  let unrecorded = 0;
  let unreachable = 0;
  for (const { ticket, since, process: isProcess } of resolved) {
    // A process ticket before its adoption date predates the rule entirely.
    if (isProcess && !held(ticket, since)) continue;
    const { rows } = readLedger(ticket.number);
    for (const row of rows) {
      // `red-line` exists only under the rule that makes red/green reachable
      // from HEAD, so it marks the rows that rule holds; older rows are records
      // written before it and are not reopened.
      if (ticket.state === "closed" && row["red-line"]) {
        for (const ref of [row.red, row.green].filter(Boolean)) {
          const where = reach(ref);
          if (where === "unpushed") console.log(`UNPUSHED    #${ticket.number} ${ref} is on a local branch, not yet on origin/main: ${row.finding}`);
          if (where === "unreachable") {
            unreachable += 1;
            console.log(`UNREACHABLE #${ticket.number} ${ref} is on no branch here and not on origin/main: ${row.finding}`);
          }
        }
      }
      if (row.class === "project" || isCarried(row) || !CLASSES.has(row.class ?? "")) continue;
      const marker = `ledger-source: ${ticket.number} :: ${row.finding}`;
      if (!tickets.some((t) => t.body.includes(marker))) {
        missing += 1;
        console.log(`MISSING     #${ticket.number} [${row.class}] ${row.finding}`);
      }
    }
    if (rows.length === 0 && held(ticket, since)) {
      unrecorded += 1;
      console.log(`UNRECORDED  #${ticket.number} closed ${ticket.closedAt?.slice(0, 10) ?? "?"} without a ledger block${isProcess ? " (process ticket)" : ""}`);
    }
  }
  // A fix answers to the product map its finding came from: the gate its
  // ledger-source names or, when that source is a process ticket whose own
  // ledger carried a row (#63 from #50), the gate at the root of that chain.
  // Another product map paired with this process map holds its own fixes, and a
  // chain rooted on the process map itself is no product map's (tubrief-v2 #135).
  const carriedFrom = (ticket) => Number(ticket.body.match(/ledger-source: (\d+) ::/)?.[1]) || null;
  const processTickets = new Map(tickets.map((ticket) => [ticket.number, ticket]));
  const gateNumbers = new Set(gates.map((gate) => gate.number));
  const fromProduct = (ticket) => {
    const seen = new Set();
    for (let n = carriedFrom(ticket); n && !seen.has(n); n = processTickets.has(n) ? carriedFrom(processTickets.get(n)) : null) {
      if (gateNumbers.has(n)) return true;
      seen.add(n);
    }
    return false;
  };
  const blockers = blockedBy(product);
  let unwired = 0;
  for (const ticket of tickets) {
    if (ticket.state !== "open" || !fromProduct(ticket)) continue;
    if (!blockers.has(ticket.number)) {
      unwired += 1;
      console.log(`UNWIRED     #${ticket.number} is open, carried from #${product}, but #${product} is not blocked_by it`);
    }
  }
  const unlabelled = unsourced(gates);
  const total = missing + unrecorded + unwired + unreachable + unlabelled;
  console.log(
    total === 0
      ? "audit: no ledger row lost, every closed ticket recorded, every open fix wired, every recorded commit reachable, every open product ticket sourced"
      : `audit: ${missing} missing, ${unrecorded} unrecorded, ${unwired} unwired, ${unreachable} unreachable, ${unlabelled} unsourced`,
  );
  if (total > 0) process.exit(1);
  /* The step a session skipped (tubrief-v2 #98): it claimed a ticket and ran
   * a grilling round without the skills the map names. This output is what
   * every session reads right before it picks a ticket. */
  console.log(`next: load every skill the Notes of #${product} and #${map} name, then pick with ledger.mjs frontier --map ${map} --product ${product}`);
} else if (command === "frontier") {
  const map = flag("map");
  const product = flag("product");
  if (!map || !product) throw new Error("frontier needs --map and --product");
  const takeable = (ticket) => ticket.state === "open" && ticket.assignees.length === 0 && ticket.openBlockers === 0;
  const show = (ticket) => `#${ticket.number} ${ticket.title}`;
  const blockers = blockedBy(product);
  const fixes = listTickets(map).filter((ticket) => blockers.has(ticket.number) && takeable(ticket));
  const gates = listTickets(product);
  if (unsourced(gates) > 0) {
    console.log(`frontier: label every open child of #${product} ${SOURCE.owner} or ${SOURCE.agent} first`);
    process.exit(1);
  }
  const open = gates.filter(takeable);
  const owner = open.filter((ticket) => sourceOf(ticket) === "owner");
  const approved = open.filter((ticket) => sourceOf(ticket) === "agent" && ticket.labels.includes(APPROVED));
  const asking = open.filter((ticket) => sourceOf(ticket) === "agent" && !ticket.labels.includes(APPROVED));
  // The gate a fix came from: fixes of one gate are claimed together.
  for (const ticket of fixes) {
    const gate = ticket.body.match(/ledger-source: (\d+) ::/)?.[1];
    console.log(`process     ${show(ticket)}${gate ? ` (from #${gate})` : ""}`);
  }
  for (const ticket of owner) console.log(`owner       ${show(ticket)}`);
  for (const ticket of approved) console.log(`approved    ${show(ticket)}`);
  for (const ticket of asking) console.log(`ask owner   ${show(ticket)} (${SOURCE.agent}; ${APPROVED} once the owner says go)`);
  const [pick] = [...fixes, ...owner, ...approved];
  console.log(pick ? `pick: #${pick.number}` : `pick: none${asking.length ? " — ask the owner about the tickets above" : ""}`);
} else {
  console.error("usage: ledger.mjs <close|check|sync|audit|frontier> …");
  process.exit(1);
}
