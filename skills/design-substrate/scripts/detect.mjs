/**
 * The substrate detector: the defect lists of `design-substrate` STEP 1,
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
 * 6. library-default — a utility in a world-owned namespace that resolves to
 *                   a value only the library's own sheet declares
 * 7. translucent-focus — a focus indicator colour below alpha 1, whose
 *                   contrast changes with whatever ground it lands on
 * 8. out-of-gamut — a world colour declared outside sRGB, which a raster
 *                   clips before any contrast is measured
 * 9. translucent-text — a text colour below alpha 1 whose composite over the
 *                   worst declared ground falls under 4.5:1
 * 10. translucent-surface — a primitive's idle fill below alpha 1, which lands
 *                   on a different lightness over every ground it sits on
 *
 * Scope is every file that renders, dev-only preview code included: a comp
 * preview was once left out, and a token the substrate pass deleted went on
 * painting nothing there for a whole round. A file leaves the scope only
 * through `utilityExempt`, with its reason.
 *
 * What the library knows — which utility reads which token, how a radius step
 * resolves, whether a class compiles — is the adapter's (`adapters/<name>.mjs`),
 * answering the six questions of `ADAPTERS.md`.
 */
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.mjs";
import { gamutVerdict } from "./gamut.mjs";
import { compositeContrast, resolveColour } from "./contrast.mjs";

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
    utilityExempt = [],
    grounds = [],
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
        if (utilityExempt.some((e) => e.file === file && e.text === m[0])) continue;
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
  const libraryVars = new Set();
  const collectDeclarations = (text, into) => {
    for (const m of text.matchAll(/(?:^|[\s{;"'`,(])(--[a-zA-Z0-9_-]+)\s*["'`]?\s*:/g)) into.add(m[1]);
    for (const m of text.matchAll(/setProperty\(\s*["'`](--[\w-]+)/g)) into.add(m[1]);
  };
  for (const sheet of adapter.LIBRARY_SHEETS) {
    collectDeclarations(await readFile(path.join("node_modules", sheet), "utf8"), libraryVars);
  }
  for (const sheet of declarationSheets) {
    collectDeclarations(await readFile(path.join("node_modules", sheet), "utf8"), declaredVars);
  }
  for (const file of renderedFiles) collectDeclarations(renderedText[file], declaredVars);
  for (const file of renderedFiles) {
    const text = stripComments(renderedText[file]);
    for (const m of text.matchAll(/(?:var\(\s*|-\()(--[a-zA-Z0-9_-]+)/g)) {
      const name = m[1];
      if (declaredVars.has(name) || libraryVars.has(name) || RUNTIME_OWNED.has(name) || name.startsWith("--tw-")) continue;
      const line = text.slice(0, m.index).split("\n").length;
      findings.push({ kind: "dangling", where: `${file}:${line}`, what: `${name} — 선언하는 곳이 없다` });
    }
  }

  /* 6. library-default references. The utility compiles, so list 5 passes it,
   * but the value it reads is one only the library's sheet declares: the
   * element paints the library's default, not the world's. Asked of the CSS
   * the library generates, so a spelling the world re-declares passes. */
  utilities.forEach((utility, i) => {
    const cssText = generated[i];
    if (!cssText) return;
    const foreign = [...new Set([...cssText.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))].filter(
      (name) =>
        adapter.WORLD_OWNED_NAMESPACES.includes(adapter.namespaceOf(name)) &&
        libraryVars.has(name) &&
        !declaredVars.has(name),
    );
    if (!foreign.length) return;
    for (const where of utilityHits.get(utility) ?? []) {
      findings.push({
        kind: "library-default",
        where,
        what: `${utility} — ${foreign.join(", ")}를 라이브러리 시트만 선언한다 (world가 선언하지 않은 값)`,
      });
    }
  });

  /* 7. translucent focus indicators. Composited contrast depends on the
   * ground, so a render sample that passes on one rung proves nothing about
   * the next (dark --ring at alpha 0.5: 3.43 on the page, 2.96 on a popover).
   * The whole class is compiled, variants included, so the generated CSS says
   * whether it paints on focus whatever the variant's spelling: an indicator
   * colour under a `:focus*` selector, or an outline colour with no variant —
   * an outline paints only once focus gives it a style. */
  const indicatorHits = new Map();
  for (const file of renderedFiles) {
    const text = stripComments(renderedText[file]);
    for (const { body, at } of adapter.classStrings(file, text)) {
      for (const { cls, index } of adapter.indicatorClasses(body)) {
        if (utilityExempt.some((e) => e.file === file && e.text === cls)) continue;
        const line = text.slice(0, at + index).split("\n").length;
        const list = indicatorHits.get(cls) ?? [];
        list.push(`${file}:${line}`);
        indicatorHits.set(cls, list);
      }
    }
  }
  const translucent = (value) =>
    /\btransparent\b/.test(value) ||
    [...value.matchAll(/\/\s*([\d.]+)(%?)\s*\)/g)].some((m) => Number(m[1]) / (m[2] ? 100 : 1) < 1);
  const indicatorClasses = [...indicatorHits.keys()];
  compiles(indicatorClasses).forEach((cssText, i) => {
    if (!cssText) return;
    const focus = cssText.includes(":focus");
    const hit = [...cssText.matchAll(adapter.INDICATOR_COLOR)].find(
      ([, property, value]) => (focus || property === "outline-color") && translucent(value),
    );
    if (!hit) return;
    for (const where of indicatorHits.get(indicatorClasses[i])) {
      findings.push({
        kind: "translucent-focus",
        where,
        what: `${indicatorClasses[i]} — 포커스 표시 색(${hit[1]})이 반투명이다. 합성 대비가 바탕마다 달라 한 표본의 통과가 보증이 되지 않는다`,
      });
    }
  });

  /* 8. out-of-gamut world colours. An sRGB display clips the colour and every
   * measurement reads the clipped one, while a wide-gamut display paints the
   * declaration: the measured contrast describes neither for certain
   * (oklch(0.52 0.12 200) against an sRGB ceiling of C 0.0884). Asked of the
   * declaration, not of painted pixels, because the raster is what clips. A
   * colour function this check cannot evaluate is counted, never skipped. */
  const COLOUR_VALUE = /^(?:#|(?:oklch|oklab|lch|lab|color|rgba?|hsla?|hwb|color-mix)\()/i;
  stripComments(css)
    .split("\n")
    .forEach((line, i) => {
      const m = line.match(/^\s*(--[\w-]+):\s*([^;]+);/);
      if (!m || !COLOUR_VALUE.test(m[2].trim())) return;
      const written = `${m[1]}: ${m[2].trim()}`;
      if (utilityExempt.some((e) => e.file === tokensFile && e.text === written)) return;
      const verdict = gamutVerdict(m[2]);
      if (verdict?.inside) return;
      findings.push({
        kind: "out-of-gamut",
        where: `${tokensFile}:${i + 1}`,
        what: verdict
          ? `${written} — ${verdict.detail}`
          : `${written} — 이 검사가 계산하지 못하는 색 표기다(읽지 못한 값)`,
      });
    });

  /* 9. translucent text. A text colour below alpha 1 composites differently on
   * every ground, and a render sample holds only the grounds its screens used:
   * TuBrief's inactive tab `text-foreground/60` was 4.49 and read 4.17 after
   * the light ladder moved, found only once the full capture ran. So every
   * translucent text colour is composited over every declared ground in every
   * theme, and the worst must reach 4.5 — the size is unknown here, so the
   * body-text threshold holds for all. Disabled variants are exempt as WCAG
   * 1.4.3 exempts inactive components; alpha 0 paints nothing. */
  const TEXT_THRESHOLD = 4.5;
  const textHits = new Map();
  for (const file of renderedFiles) {
    const text = stripComments(renderedText[file]);
    for (const { body, at } of adapter.classStrings(file, text)) {
      for (const { cls, index } of adapter.textColourClasses(body)) {
        if (utilityExempt.some((e) => e.file === file && e.text === cls)) continue;
        const line = text.slice(0, at + index).split("\n").length;
        const list = textHits.get(cls) ?? [];
        list.push(`${file}:${line}`);
        textHits.set(cls, list);
      }
    }
  }
  const textClasses = [...textHits.keys()];
  /* The library's own sheet goes first so a palette utility (`text-white`)
   * resolves, and the world's declarations override it. */
  const librarySheets = await Promise.all(adapter.LIBRARY_SHEETS.map((s) => readFile(path.join("node_modules", s), "utf8")));
  const themes = adapter.themeTables([...librarySheets, css].join("\n"), grounds);
  const report = (cls, what) => {
    for (const where of textHits.get(cls)) findings.push({ kind: "translucent-text", where, what: `${cls} — ${what}` });
  };
  compiles(textClasses).forEach((cssText, i) => {
    const cls = textClasses[i];
    if (!cssText || /disabled/i.test(cssText)) return;
    for (const [, value] of cssText.matchAll(/(?<![\w-])color\s*:\s*([^;]+);/g)) {
      let worst = null;
      for (const [theme, table] of Object.entries(themes)) {
        const fg = resolveColour(value, table);
        if (!fg) return report(cls, `${theme}에서 글자색 ${value.trim()}을 계산하지 못한다(읽지 못한 값)`);
        if (fg === "inherited" || fg.alpha >= 1 || fg.alpha === 0) continue;
        if (!grounds.length) return report(cls, "반투명 글자색인데 설정 detect.grounds가 비어 있어 바탕을 알 수 없다");
        for (const name of grounds) {
          const ground = table[name] === undefined ? null : resolveColour(`var(${name})`, table);
          if (!ground || ground === "inherited" || ground.alpha < 1) {
            return report(cls, `${theme}의 바탕 ${name}을 불투명 색으로 계산하지 못한다(읽지 못한 값)`);
          }
          const ratio = compositeContrast(fg, ground);
          if (!worst || ratio < worst.ratio) worst = { ratio, theme, name, alpha: fg.alpha };
        }
      }
      if (worst && worst.ratio < TEXT_THRESHOLD) {
        report(
          cls,
          `α ${+worst.alpha.toFixed(3)} 글자가 ${worst.theme}의 ${worst.name} 위에서 ${worst.ratio.toFixed(2)} < ${TEXT_THRESHOLD} (선언된 바탕 중 가장 불리한 곳)`,
        );
      }
    }
  });

  /* 10. translucent surfaces. A fill below alpha 1 takes its lightness from
   * whatever ground it lands on, so it sits between the ladder's rungs: the
   * library's dark-only field fill `bg-input/30` painted L 0.232, a rung no
   * world declares, and no list saw it. Asked of the primitives, where
   * library defaults live, and of the idle fill only — a state fill is
   * criterion 4a's. Alpha 0 paints nothing. */
  primitiveFiles.forEach((file, index) => {
    const text = stripComments(primitiveTexts[index]);
    const hits = [];
    for (const { body, at } of adapter.classStrings(file, text)) {
      for (const { cls, index: offset } of adapter.surfaceClasses(body)) {
        if (utilityExempt.some((e) => e.file === file && e.text === cls)) continue;
        hits.push({ cls, line: text.slice(0, at + offset).split("\n").length });
      }
    }
    const generatedFills = compiles(hits.map((h) => h.cls));
    hits.forEach(({ cls, line }, i) => {
      const cssText = generatedFills[i];
      if (!cssText || adapter.STATE_SELECTOR.test(cssText)) return;
      for (const [, value] of cssText.matchAll(/(?<![\w-])background-color\s*:\s*([^;]+);/g)) {
        for (const [theme, table] of Object.entries(themes)) {
          const fill = resolveColour(value, table);
          if (!fill) {
            findings.push({
              kind: "translucent-surface",
              where: `${file}:${line}`,
              what: `${cls} — ${theme}에서 면 색 ${value.trim()}을 계산하지 못한다(읽지 못한 값)`,
            });
            return;
          }
          if (fill === "inherited") continue;
          if (fill.alpha > 0 && fill.alpha < 1) {
            findings.push({
              kind: "translucent-surface",
              where: `${file}:${line}`,
              what: `${cls} — ${theme}에서 면 색 α ${+fill.alpha.toFixed(3)}. 놓인 바탕마다 다른 L이 되어 사다리 밖 단을 칠한다`,
            });
            return;
          }
        }
      }
    });
  });

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
