/**
 * The substrate detector: the five defect lists of `design-substrate` STEP 1,
 * found by machine so STEP 7 can keep finding them.
 *
 *   node ~/.agents/skills/design-substrate/scripts/detect.mjs --config <file>            # summary + exit code
 *   node ~/.agents/skills/design-substrate/scripts/detect.mjs --config <file> --json     # machine-readable
 *   node ~/.agents/skills/design-substrate/scripts/detect.mjs --config <file> --census   # every declared token's fate
 *
 * Run it from the project root. `--config` names an ES module (`.mjs`, or `.ts`
 * on Node >= 22.18) whose default export carries `adapter` and `detect`; see
 * `SKILL.md` STEP 7 for its fields. The rules live here, in the skill, and the
 * project keeps only that config: a check that lives in one repository protects
 * one repository, and the next project meets the same defect from scratch.
 *
 * 1. dead token   — declared and never read, colour / radius / shadow / type alike
 * 2. hardcoded    — a colour, radius, border or shadow literal in a primitive
 * 3. split-brain  — two token vocabularies deciding the same attribute
 * 4. drift        — the authority document's policy against the primitives' values
 * 5. dangling     — a utility or `var()` that names a token nothing declares
 *
 * Scope is every file that renders, dev-only preview code included: a comp
 * preview was once left out, and a token the substrate pass deleted went on
 * painting nothing there for a whole round. A file leaves the scope only
 * through `danglingExempt`, with its reason.
 *
 * What the library knows — which utility reads which token, how a radius step
 * resolves, whether a class compiles — is the adapter's (`adapters/<name>.mjs`),
 * answering the six questions of `ADAPTERS.md`.
 */
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.mjs";

function listFiles(...globs) {
  const result = spawnSync("git", ["ls-files", ...globs], { encoding: "utf8" });
  return result.stdout.trim().split("\n").filter(Boolean);
}

const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|\s)\/\/.*$/gm, "$1");

async function main() {
  const { config, adapter } = await loadConfig();
  const {
    tokensFile,
    sources: sourceGlobs,
    primitives,
    designDoc,
    stylesheetBase = ".",
    declarationSheets = [],
    runtimeOwned = [],
    danglingExempt = [],
    vocabularies = {},
    deferred = [],
  } = config.detect;
  const RUNTIME_OWNED = new Set(runtimeOwned);
  const json = process.argv.includes("--json");
  const census = process.argv.includes("--census");

  const css = await readFile(tokensFile, "utf8");
  const sourceFiles = listFiles(...sourceGlobs).filter((f) => f !== tokensFile);
  const sources = {};
  for (const f of sourceFiles) sources[f] = await readFile(f, "utf8");
  const primitiveFiles = listFiles(primitives);
  const primitiveTexts = await Promise.all(primitiveFiles.map((f) => readFile(f, "utf8")));

  /* Utility usage is asked of everything that can carry a class, including the
   * stylesheet's own `@apply`, with the declaration lines stripped so a token
   * does not count as reading itself. */
  const haystack = Object.values(sources).join("\n") + "\n" + css.replace(/^\s*--[a-z0-9-]+:.*$/gm, "");

  const declared = [...new Set(css.match(/^\s*(--[a-z0-9-]+):/gm)?.map((l) => l.trim().slice(0, -1)) ?? [])];

  const findings = [];
  /** @type {Record<string, "var" | "utility" | "alias" | "engine" | "none">} */
  const fate = {};
  const aliases = adapter.aliasLayer(css);

  /* 1. dead tokens. */
  const directRead = (token) => {
    if (adapter.ENGINE_OWNED.has(token)) return "engine";
    /* A token is read either as `var(--x)` or through a utility shorthand
       `utility-(--x)`; only counting the first calls the second dead. */
    if (new RegExp(`(?:var\\(|\\()${token}(?![\\w-])`).test(haystack)) return "var";
    const namespace = Object.keys(adapter.NAMESPACE_PREFIXES).find((ns) => token.startsWith(`--${ns}-`));
    if (namespace) {
      const key = token.slice(namespace.length + 3);
      if (new RegExp(`(?<![\\w-])(?:${adapter.NAMESPACE_PREFIXES[namespace]})-${key}(?![\\w-])`).test(haystack)) {
        return "utility";
      }
    }
    return "none";
  };

  /* Two passes, because a raw token is read only through its alias and the
   * alias is declared after it. One pass in declaration order would call every
   * live colour dead (ADAPTERS.md, "별칭 층"). */
  for (const token of declared) fate[token] = directRead(token);
  for (const token of declared) {
    if (fate[token] !== "none") continue;
    const aliasLine = aliases.split("\n").find((l) => new RegExp(`var\\(${token}\\)`).test(l));
    const alias = aliasLine?.trim().split(":")[0];
    if (alias && fate[alias] && fate[alias] !== "none") fate[token] = "alias";
  }
  for (const token of declared) {
    if (fate[token] === "none") findings.push({ kind: "dead-token", where: tokensFile, what: token });
  }

  /* 2. hardcoded literals in primitives. */
  primitiveFiles.forEach((file, index) => {
    primitiveTexts[index].split("\n").forEach((line, i) => {
      for (const hit of line.match(adapter.HARDCODED_LITERAL) ?? []) {
        findings.push({ kind: "hardcoded", where: `${file}:${i + 1}`, what: hit });
      }
    });
  });

  /* 3. split-brain: two vocabularies deciding surface, ink, edge and accent. */
  const liveVocabularies = Object.entries(vocabularies).filter(([, names]) =>
    names.some((n) => new RegExp(`^\\s*--${n}:`, "m").test(css)),
  );
  if (liveVocabularies.length > 1) {
    findings.push({
      kind: "split-brain",
      where: tokensFile,
      what: `면·글자색·테두리·강조색을 결정하는 어휘가 ${liveVocabularies.length}개다: ${liveVocabularies
        .map(([n]) => n)
        .join(" + ")}`,
    });
  }

  /* 4. drift: the authority document's shapes against the primitives'. */
  const design = await readFile(designDoc, "utf8");
  const declaredRadius = design.match(/^\s*(?:frame|control):\s*"(\d+)px"/m)?.[1];
  const rootRadius = css.match(/^\s*--radius:\s*([^;]+);/m)?.[1]?.trim();
  if (declaredRadius && rootRadius) {
    const rootPx = rootRadius.endsWith("rem") ? parseFloat(rootRadius) * 16 : parseFloat(rootRadius);
    if (Math.abs(rootPx - Number(declaredRadius)) > 0.5) {
      findings.push({
        kind: "drift",
        where: `${designDoc} ↔ ${tokensFile}`,
        what: `문서의 반경 ${declaredRadius}px 대 --radius ${rootRadius} (${rootPx}px)`,
      });
    }
  }

  /* The world fixes one corner family plus the circle, so a primitive layer
   * that spends six radii is drift even when every one of them resolves
   * through one token. A token reference is not conformance — and six
   * spellings that resolve to one value are one radius, not six. */
  const corners = adapter.cornerFamily(css, primitiveTexts);
  if (corners.resolved.length > 1) {
    findings.push({
      kind: "drift",
      where: primitives,
      what: `corner family ${corners.resolved.length}단 (원형·직각 제외): ${corners.resolved.join(" / ")} — 쓰인 단 ${Object.entries(
        corners.used,
      )
        .sort((a, b) => b[1] - a[1])
        .map(([s, n]) => `${s}×${n}`)
        .join(" ")}`,
    });
  }

  /* A role names a *stack*, one face per script, so every family in it has a
     role. Reading only the first family calls the other scripts' faces unused. */
  const declaredFaces = [...design.matchAll(/fontFamily:\s*"([^"]+)"/g)].flatMap((m) =>
    m[1].split(",").map((f) => f.replace(/"/g, "").trim()),
  );
  for (const bundled of adapter.bundledFaces(css)) {
    const normalised = bundled.replace(/-/g, " ");
    if (!declaredFaces.some((f) => f.toLowerCase().includes(normalised))) {
      findings.push({
        kind: "drift",
        where: tokensFile,
        what: `번들되지만 ${designDoc}이 역할을 주지 않은 face: ${bundled}`,
      });
    }
  }

  /* 5. dangling references. A utility whose token was deleted compiles to
   * nothing and the element paints transparent with no error anywhere, so the
   * only witness is the library's own answer (ADAPTERS.md question 6). */
  const compiles = await adapter.compiler(css, { stylesheetBase });
  const renderedFiles = [tokensFile, ...sourceFiles];
  const renderedText = { ...sources, [tokensFile]: css };
  const utilityHits = new Map();
  for (const file of renderedFiles) {
    const text = stripComments(renderedText[file]);
    for (const { body, at } of adapter.classStrings(file, text)) {
      for (const m of body.matchAll(adapter.TOKEN_UTILITY)) {
        const utility = m[1];
        if (danglingExempt.some((e) => e.file === file && e.text === utility)) continue;
        const line = text.slice(0, at + (m.index ?? 0)).split("\n").length;
        const list = utilityHits.get(utility) ?? [];
        list.push(`${file}:${line}`);
        utilityHits.set(utility, list);
      }
    }
  }
  const utilities = [...utilityHits.keys()];
  const generated = compiles(utilities);
  utilities.forEach((utility, i) => {
    if (generated[i]) return;
    for (const where of utilityHits.get(utility) ?? []) {
      findings.push({ kind: "dangling", where, what: `${utility} — 생성되는 CSS가 없다` });
    }
  });

  /* The same defect one level down: `bg-(--x)`, `[var(--x)]` and `var(--x)`
   * compile whatever `--x` is, so the question moves to whether anything
   * declares it — the project, the library's sheets, or a runtime writer. */
  const declaredVars = new Set();
  const collectDeclarations = (text) => {
    for (const m of text.matchAll(/(?:^|[\s{;"'`,(])(--[a-zA-Z0-9_-]+)\s*["'`]?\s*:/g)) declaredVars.add(m[1]);
    for (const m of text.matchAll(/setProperty\(\s*["'`](--[\w-]+)/g)) declaredVars.add(m[1]);
  };
  for (const sheet of [...adapter.LIBRARY_SHEETS, ...declarationSheets]) {
    collectDeclarations(await readFile(path.join("node_modules", sheet), "utf8"));
  }
  for (const file of renderedFiles) collectDeclarations(renderedText[file]);
  for (const file of renderedFiles) {
    const text = stripComments(renderedText[file]);
    for (const m of text.matchAll(/(?:var\(\s*|-\()(--[a-zA-Z0-9_-]+)/g)) {
      const name = m[1];
      if (declaredVars.has(name) || RUNTIME_OWNED.has(name) || name.startsWith("--tw-")) continue;
      const line = text.slice(0, m.index).split("\n").length;
      findings.push({ kind: "dangling", where: `${file}:${line}`, what: `${name} — 선언하는 곳이 없다` });
    }
  }

  if (census) {
    for (const [token, read] of Object.entries(fate)) console.log(`${read.padEnd(8)} ${token}`);
  }
  /* The carried list (STEP 7): out-of-authority items shipped as ⓑ carried or
   * ⓒ known violations. Printed on every run and never part of the exit code —
   * a deferral that only a document remembers stops being remembered. */
  if (json) {
    console.log(JSON.stringify({ findings, fate, deferred }, null, 2));
  } else {
    const byKind = {};
    for (const f of findings) (byKind[f.kind] ??= []).push(f);
    for (const [kind, list] of Object.entries(byKind)) {
      console.log(`\n## ${kind} — ${list.length}`);
      for (const f of list.slice(0, 60)) console.log(`  ${f.where}  ${f.what}`);
      if (list.length > 60) console.log(`  … ${list.length - 60} more`);
    }
    console.log(`\n## deferred (권한 밖, 출하됨) — ${deferred.length}`);
    for (const d of deferred) {
      console.log(`  ${d.what}`);
      console.log(`      측정 ${d.measured}`);
      console.log(`      임계 ${d.threshold}`);
      console.log(`      권위 ${d.authority}  →  이월처 ${d.carriedTo}`);
    }
    console.log(`\nsubstrate-detect: ${findings.length} findings, ${deferred.length} deferred`);
  }
  process.exit(findings.length === 0 ? 0 : 1);
}

await main();
