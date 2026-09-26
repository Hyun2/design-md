/**
 * The wiring between the product map and the process map, as a command rather
 * than a convention.
 *
 *   node <skill>/scripts/ledger.mjs close <gate-issue> --map <process-map> --comment <file>
 *   node <skill>/scripts/ledger.mjs check <gate-issue>
 *   node <skill>/scripts/ledger.mjs sync  <gate-issue> --map <process-map-issue>
 *   node <skill>/scripts/ledger.mjs audit --map <process-map-issue> --product <product-map-issue> [--since <date>] [--process-since <date>]
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
 *                                   as document-only, never as enforced
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
 * `asset` means executable by definition, so an asset row accepts `cmd` only.
 * `check` resolves `red` and `green` with `git` in the working directory — run
 * it from the repo where the defect lived — and requires both to be ancestors
 * of HEAD: the remote carries `main` only, so a red on a side branch
 * (`red/popup-scope`) is unverifiable from any other clone. A mutation that
 * revives a defect is committed on the working branch and reverted by the next
 * commit — red is the mutation, green the revert. A `doc` path resolves
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
 * `audit` catches four leaks, because a session that works only the product
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
 *   UNWIRED    an open carried ticket the product map is not `blocked_by` — the
 *              product map could close while that fix is still undone
 *   UNREACHABLE a `red`/`green` of a closed ticket's row that is on no local
 *              branch and not on origin/main — its branch was deleted unpushed,
 *              or this clone never had it. Only rows with `red-line` are held.
 *              A commit on a local branch but not yet on origin/main is listed
 *              as UNPUSHED without failing: close precedes push by design
 *              (26h for #44), and failing then would force a deploy
 *
 * A ticket whose resolution genuinely produced nothing for the process still
 * closes through `close`, with one `class: project` row saying why. Silence is
 * what the loop cannot tell apart from forgetting.
 *
 * Tracker: GitHub via `gh`, matching this repo family's issue-tracker doc. A
 * different tracker reimplements `readLedger`, `createTicket` and `listTickets`
 * and keeps everything else.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLASSES = new Set(["protocol", "asset", "project"]);
const SKILLS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

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
  for (const block of blocks) {
    for (const chunk of block.split(/\n---\n/)) {
      const row = {};
      for (const line of chunk.split("\n")) {
        const match = line.match(/^(finding|class|where|ticket|caught-by|red-line|red|green):\s*(.+)$/);
        if (match) row[match[1]] = match[2].trim();
      }
      if (row.finding) rows.push(row);
    }
  }
  return rows;
}

function isCarried(row) {
  return Boolean(row.ticket || row["caught-by"]);
}

function isCommit(ref) {
  if (!/^[0-9a-f]{7,40}$/.test(ref)) return false;
  return spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).status === 0;
}

function isAncestor(ref, of) {
  return spawnSync("git", ["merge-base", "--is-ancestor", ref, of]).status === 0;
}

// Where a recorded commit can still be found, for `audit`: on the remote
// `main` (anyone can check it), only on a local branch (not pushed yet —
// the normal gap between close and push, 26h for #44), or nowhere a branch
// keeps it (its branch was deleted unpushed, or this clone never had it).
function reach(ref) {
  if (!isCommit(ref)) return "unreachable";
  if (isAncestor(ref, "origin/main")) return "pushed";
  const branches = spawnSync("git", ["for-each-ref", "--contains", ref, "refs/heads"], { encoding: "utf8" });
  return branches.status === 0 && branches.stdout.trim() ? "unpushed" : "unreachable";
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
  if (kind === "cmd") {
    if (!row.red) return { kind, problem: "caught-by: cmd needs red: <commit where it failed on this defect>" };
    if (!row["red-line"]) return { kind, problem: "caught-by: cmd needs red-line: <the output line of the red run that names this defect, verbatim>" };
    if (!row.green) return { kind, problem: "caught-by: cmd needs green: <commit where it exits 0 with the defect fixed>" };
    if (row.red === row.green) return { kind, problem: `red and green are both ${row.red} — one commit cannot carry the defect and its fix` };
    for (const ref of [row.red, row.green]) {
      if (!isCommit(ref)) return { kind, problem: `${ref} is not a commit in ${process.cwd()}` };
      if (!isAncestor(ref, "HEAD")) {
        return { kind, problem: `${ref} is not an ancestor of HEAD — a side branch never reaches main; commit the mutation and its revert on this branch` };
      }
    }
    return { kind };
  }
  const path = rest.split(/\s+/)[0].replace(/^~\//, `${homedir()}/`);
  if (![resolve(path), resolve(SKILLS_ROOT, path)].some((p) => existsSync(p))) {
    return { kind, problem: `caught-by: doc ${path} — no such file here or under ${SKILLS_ROOT}` };
  }
  return { kind };
}

// Shared by check and close: every row classified, every carried row names
// its catcher. Prints the rows and returns the number of failures.
function validate(rows) {
  let failures = 0;
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

function readLedger(issue, extraText = "") {
  // `--file` reads a ledger draft off disk instead of the tracker, so a round
  // can validate its ledger before posting it.
  const file = flag("file");
  if (file) {
    return { title: `(file) ${file}`, rows: parseLedger(readFileSync(file, "utf8")) };
  }
  const payload = JSON.parse(
    gh(["issue", "view", String(issue), "--json", "body,comments,title"]),
  );
  const text = [payload.body, ...payload.comments.map((c) => c.body), extraText].join(
    "\n\n",
  );
  return { title: payload.title, rows: parseLedger(text) };
}

function listTickets(map) {
  const repo = gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).trim();
  const children = JSON.parse(
    gh(["api", `repos/${repo}/issues/${map}/sub_issues`, "--paginate"]),
  );
  return children.map((child) => ({
    number: child.number,
    title: child.title,
    state: child.state,
    stateReason: child.state_reason,
    closedAt: child.closed_at,
    body: child.body ?? "",
  }));
}

function createTicket({ map, row, gate, gateTitle }) {
  const repo = gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).trim();
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

if (command === "check") {
  const { rows } = readLedger(target);
  console.log(`${rows.length} ledger rows on #${target}`);
  if (rows.length === 0) {
    console.error("ledger: no ledger block found — a gate cannot close without one");
    process.exit(1);
  }
  const failures = validate(rows);
  if (failures > 0) {
    console.error(`ledger: ${failures} row(s) unclassified or carried without a catcher — gate stays open`);
    process.exit(1);
  }
  console.log("ledger: every row classified, every carried row names its catcher");
} else if (command === "close") {
  const map = flag("map");
  const commentFile = flag("comment");
  const dry = process.argv.includes("--dry-run");
  if (!map) throw new Error("close needs --map <process-map-issue>");
  if (!commentFile) throw new Error("close needs --comment <file>");

  const { rows, title } = readLedger(target, readFileSync(commentFile, "utf8"));
  if (rows.length === 0) {
    console.error("ledger: no ledger block found — gate stays open");
    process.exit(1);
  }
  console.log(`#${target} ${title}`);
  const failures = validate(rows);
  if (failures > 0) {
    console.error(`ledger: ${failures} row(s) unclassified or carried without a catcher — gate stays open`);
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
  const repo = gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).trim();
  // Reachability is judged against the remote as it is now, not as this clone
  // last saw it.
  const fetched = spawnSync("git", ["fetch", "--quiet", "origin", "main"], { encoding: "utf8" });
  if (fetched.status !== 0) throw new Error(`git fetch origin main failed: ${fetched.stderr.trim()}`);
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
  const blockers = new Set(
    JSON.parse(
      gh(["api", `repos/${repo}/issues/${product}/dependencies/blocked_by`, "--paginate"]),
    ).map((issue) => issue.number),
  );
  let unwired = 0;
  for (const ticket of tickets) {
    if (ticket.state !== "open" || !/ledger-source: \d+ ::/.test(ticket.body)) continue;
    if (!blockers.has(ticket.number)) {
      unwired += 1;
      console.log(`UNWIRED     #${ticket.number} is open but #${product} is not blocked_by it`);
    }
  }
  const total = missing + unrecorded + unwired + unreachable;
  console.log(
    total === 0
      ? "audit: no ledger row lost, every closed ticket recorded, every open fix wired, every recorded commit reachable"
      : `audit: ${missing} missing, ${unrecorded} unrecorded, ${unwired} unwired, ${unreachable} unreachable`,
  );
  if (total > 0) process.exit(1);
} else {
  console.error("usage: ledger.mjs <close|check|sync|audit> …");
  process.exit(1);
}
