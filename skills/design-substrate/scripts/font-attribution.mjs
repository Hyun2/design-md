/**
 * Rendered-font attribution: which face drew every glyph, on every manifest row,
 * in every shipped locale (`design-substrate` STEP 1 locale axis, replayed at
 * STEP 5).
 *
 *   PORT=4101 node ~/.agents/skills/design-substrate/scripts/font-attribution.mjs --config <file> --mode before|after
 *     [--base <url>] [--out <dir>] [--only <row-id,...>]
 *
 * Run it from the project root. Rows, viewports, sessions and URLs come from the
 * config's `capture` block, so this walks the same screens `capture.mjs` does;
 * `fonts` adds the locales and the installed-face policy (SKILL.md STEP 7).
 *
 * The face is the browser's answer, CDP `CSS.getPlatformFontsForNode`, per
 * text-bearing element. `isCustomFont: false` is a face the page did not ship —
 * the operating system's. An element that reports one is split into one span
 * per grapheme cluster so the report names the character that fell, and each
 * is judged against `fonts.installedAllowed`.
 *
 * Two ways this measurement has read zero where there were defects, each now
 * fixed here rather than remembered:
 *   - Only the default state was read. A transcript panel closed by
 *     `md:hidden` held 1,848 fallen glyphs (2026-09 TuBrief). So every visible
 *     `[role="tab"]` is selected and every visible collapsed disclosure
 *     (`[aria-expanded="false"][aria-controls]`) is opened, and each state is
 *     read.
 *   - Characters were classified by Unicode Script alone. `ー` U+30FC and `・`
 *     U+30FB are Script=Common but are kana marks, and were counted as 139
 *     undeclared glyphs on `/ja`. The Kana blocks classify by block.
 *
 * Exit 1 when any installed-face glyph falls outside the policy, or when a row
 * failed to measure: it could not load, it read no text-bearing element, or a
 * node or character returned no face (an unread face is not a web face).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { flag, loadConfig } from "./config.mjs";

const require = createRequire(path.join(process.cwd(), "package.json"));
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("@playwright/test"));
}

const { config } = await loadConfig();
const capture = config.capture;
const fonts = config.fonts;
if (!fonts?.locales?.length || !fonts.installedAllowed) {
  console.error("config.fonts needs `locales` and `installedAllowed` (design-substrate SKILL.md STEP 7)");
  process.exit(2);
}
const mode = flag("mode") ?? "before";
const base = flag("base") ?? capture.base;
const outRoot = flag("out") ?? capture.out;
const only = flag("only") ?? "";
/* A glyph's face does not depend on the theme; one theme is read. */
const theme = fonts.theme ?? capture.themes[0];
const allowedScripts = new Set(fonts.installedAllowed.scripts ?? []);
const allowedSelector = fonts.installedAllowed.selector ?? null;

function scriptOf(ch) {
  const cp = ch.codePointAt(0);
  if (/\p{Extended_Pictographic}/u.test(ch)) return "Emoji";
  if (cp >= 0x3040 && cp <= 0x309f) return "Hiragana";
  if (cp >= 0x30a0 && cp <= 0x30ff) return "Katakana";
  for (const s of ["Hangul", "Han", "Arabic", "Devanagari", "Cyrillic", "Greek", "Latin"]) {
    if (new RegExp(`\\p{Script=${s}}`, "u").test(ch)) return s;
  }
  if (/\p{Nd}/u.test(ch)) return "Digit";
  if ((cp >= 0x3000 && cp <= 0x303f) || (cp >= 0xff00 && cp <= 0xffef)) return "CJK-punct";
  return "Common";
}

/* Marks every visible text-bearing element with `data-fa` and returns its
 * record. Serialised into the page, so it must be self-contained. */
function markTextNodes(allowedSelector) {
  document.querySelectorAll("[data-fa]").forEach((e) => e.removeAttribute("data-fa"));
  const out = [];
  let i = 0;
  for (const el of document.body.querySelectorAll("*")) {
    if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(el.tagName)) continue;
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join("").trim();
    if (!text) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
    el.setAttribute("data-fa", String(i));
    const trail = [];
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      trail.unshift(e.tagName + (e.parentElement ? [...e.parentElement.children].indexOf(e) : ""));
    }
    out.push({
      i: i++,
      text,
      path: trail.join(">"),
      fontFamily: cs.fontFamily,
      allowed: allowedSelector ? !!el.closest(allowedSelector) : false,
      cls: (el.getAttribute("class") ?? "").slice(0, 120),
    });
  }
  return out;
}

/* Node ids stay valid only until the next `DOM.getDocument`, so the document
 * is fetched once per state and its root passed down. */
async function nodeIdsBy(cdp, rootId, selector, attribute) {
  const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: rootId, selector });
  const byKey = {};
  for (const id of nodeIds) {
    const { attributes } = await cdp.send("DOM.getAttributes", { nodeId: id });
    byKey[attributes[attributes.indexOf(attribute) + 1]] = id;
  }
  return byKey;
}

/* Split the element's direct text into one span per grapheme cluster, ask
 * each distinct cluster's face, restore the text. A cluster, not a code point:
 * a combining vowel sign (Devanagari U+093F) or a variation selector (U+FE0F)
 * split from its base lays out as nothing and reports no face. */
async function perChar(page, cdp, rootId, idx) {
  const chars = await page.evaluate((idx) => {
    const el = document.querySelector(`[data-fa="${idx}"]`);
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const seen = new Map();
    window.__faRestore = [];
    let j = 0;
    for (const tn of [...el.childNodes].filter((n) => n.nodeType === 3)) {
      const frag = document.createDocumentFragment();
      const spans = [];
      for (const { segment: ch } of segmenter.segment(tn.data)) {
        const s = document.createElement("span");
        s.textContent = ch;
        if (!/^\s+$/.test(ch)) {
          if (!seen.has(ch)) {
            seen.set(ch, { ch, count: 0, j });
            s.setAttribute("data-fac", String(j++));
          }
          seen.get(ch).count++;
        }
        frag.appendChild(s);
        spans.push(s);
      }
      window.__faRestore.push([tn, spans]);
      tn.replaceWith(frag);
    }
    /* Spans do not break shaping: `f` + `i` in two spans still shape as one
     * ligature glyph, credited to `f`, and `i` reports no face. Ligatures
     * choose glyphs within the face, never the face, so turning them off for
     * the read changes nothing being measured. The spans also have no layout
     * until something asks for it — a node with no layout reports no face. */
    window.__faLigatures = el.style.fontVariantLigatures;
    el.style.fontVariantLigatures = "none";
    void el.getBoundingClientRect();
    return [...seen.values()];
  }, idx);
  const byJ = await nodeIdsBy(cdp, rootId, "[data-fac]", "data-fac");
  const result = [];
  for (const c of chars) {
    const { fonts: faces } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId: byJ[c.j] });
    /* A cluster can be drawn by two faces (an emoji and its selector); the
     * installed one is the one that matters. */
    const face = faces.find((f) => !f.isCustomFont) ?? faces[0];
    result.push({
      ch: c.ch,
      cp: [...c.ch].map((u) => `U+${u.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`).join(" "),
      count: c.count,
      script: scriptOf(c.ch),
      face: face?.familyName ?? null,
      custom: face ? face.isCustomFont : null,
    });
  }
  await page.evaluate((idx) => {
    const el = document.querySelector(`[data-fa="${idx}"]`);
    el.style.fontVariantLigatures = window.__faLigatures;
    for (const [tn, spans] of window.__faRestore) {
      if (!spans.length) continue;
      spans[0].replaceWith(tn);
      spans.slice(1).forEach((s) => s.remove());
    }
  }, idx);
  return result;
}

/* Read every text-bearing element not yet read in an earlier state. */
async function measureState(page, cdp, nodes, state, tally) {
  const records = await page.evaluate(markTextNodes, allowedSelector);
  tally.textElements += records.length;
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const byIdx = await nodeIdsBy(cdp, root.nodeId, "[data-fa]", "data-fa");
  for (const r of records) {
    const key = `${r.path}::${r.text}`;
    if (nodes.has(key)) continue;
    const { fonts: faces } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId: byIdx[r.i] });
    const record = { ...r, state, faces };
    if (faces.length === 0) tally.unread.push(`${state} ${r.path} "${r.text.slice(0, 40)}"`);
    if (faces.some((f) => !f.isCustomFont)) record.chars = await perChar(page, cdp, root.nodeId, r.i);
    nodes.set(key, record);
  }
}

async function settle(page) {
  await page.waitForTimeout(500);
  await page.evaluate(() => document.fonts.ready);
}

/* The states a row is read in: default, each tab selected, each collapsed
 * disclosure opened (and closed again with Escape so the next one is reached
 * from the same ground). A control that leaves the page is not a state. */
async function walkStates(page, cdp, nodes, tally) {
  await measureState(page, cdp, nodes, "default", tally);
  const url = page.url();
  for (const [kind, selector] of [
    ["tab", '[role="tab"]'],
    ["disclosure", '[aria-expanded="false"][aria-controls]'],
  ]) {
    const count = await page.locator(selector).count();
    for (let index = 0; index < count; index++) {
      const control = page.locator(selector).nth(index);
      if (!(await control.isVisible().catch(() => false))) continue;
      const label = (await control.innerText().catch(() => "")).trim().slice(0, 40) || `#${index}`;
      try {
        await control.click({ timeout: 3000 });
      } catch {
        continue;
      }
      await settle(page);
      if (page.url() !== url) {
        await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
        await settle(page);
        continue;
      }
      await measureState(page, cdp, nodes, `${kind}:${label}`, tally);
      if (kind === "disclosure") {
        await page.keyboard.press("Escape");
        await settle(page);
      }
    }
  }
}

async function main() {
  const setup = await capture.setup();
  const browser = await chromium.launch();
  const rows = only ? capture.rows.filter((r) => only.split(",").includes(r.id)) : capture.rows;
  const sessions = [...new Set(rows.map((r) => capture.session(r)))];
  const results = {};
  const failed = [];
  let undeclaredTotal = 0;

  for (const viewport of capture.viewports) {
    for (const session of sessions) {
      const storageState = capture.storageState(session, setup);
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        ...(storageState ? { storageState } : {}),
      });
      for (const row of rows.filter((r) => capture.session(r) === session)) {
        for (const lang of fonts.locales) {
          const key = `${row.id}__${lang}__${viewport.name}`;
          const url = capture.url(row, { base, lang, theme }, setup);
          const page = await context.newPage();
          const cdp = await context.newCDPSession(page);
          await cdp.send("DOM.enable");
          await cdp.send("CSS.enable");
          try {
            await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
          } catch {
            try {
              await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
            } catch (error) {
              results[key] = { blocker: error.message.split("\n")[0], url };
              failed.push(`${key} (not loaded)`);
              await page.close();
              continue;
            }
          }
          await settle(page);
          const nodes = new Map();
          const tally = { textElements: 0, unread: [] };
          await walkStates(page, cdp, nodes, tally);

          let glyphs = 0;
          let installedAllowed = 0;
          let installedUndeclared = 0;
          const byFace = {};
          const undeclared = [];
          for (const n of nodes.values()) {
            for (const f of n.faces) {
              glyphs += f.glyphCount;
              const face = `${f.familyName}${f.isCustomFont ? "" : " [OS]"}`;
              byFace[face] = (byFace[face] ?? 0) + f.glyphCount;
            }
            for (const c of n.chars ?? []) {
              if (c.custom === null) {
                tally.unread.push(`${n.state} ${n.path} ${c.cp}`);
                continue;
              }
              if (c.custom) continue;
              if (n.allowed || allowedScripts.has(c.script)) installedAllowed += c.count;
              else {
                installedUndeclared += c.count;
                undeclared.push({ ch: c.ch, cp: c.cp, count: c.count, script: c.script, face: c.face, state: n.state, text: n.text.slice(0, 60), cls: n.cls });
              }
            }
          }
          if (tally.textElements === 0) failed.push(`${key} (no text-bearing element read)`);
          if (tally.unread.length) failed.push(`${key} (${tally.unread.length} unread faces)`);
          undeclaredTotal += installedUndeclared;
          results[key] = {
            url,
            row: row.id,
            lang,
            viewport: viewport.name,
            glyphs,
            installedAllowed,
            installedUndeclared,
            byFace,
            undeclared,
            unread: tally.unread,
            states: [...new Set([...nodes.values()].map((n) => n.state))],
          };
          const worst = undeclared.sort((a, b) => b.count - a.count)[0];
          console.log(
            `${key.padEnd(44)} glyphs=${glyphs} installed-allowed=${installedAllowed} installed-undeclared=${installedUndeclared}` +
              (worst ? ` — e.g. ${worst.cp} "${worst.ch}" ×${worst.count} in ${worst.face} [OS] (${worst.state}, class "${worst.cls}")` : ""),
          );
          await page.close();
        }
      }
      await context.close();
    }
  }
  await browser.close();

  await mkdir(outRoot, { recursive: true });
  const outFile = path.join(outRoot, `fonts-${mode}.json`);
  await writeFile(
    outFile,
    JSON.stringify({ mode, base, theme, locales: fonts.locales, capturedAt: new Date().toISOString(), results }, null, 2),
  );
  console.log(`font-attribution: ${Object.keys(results).length} rows -> ${outFile}`);
  console.log(`installed-face glyphs outside the policy: ${undeclaredTotal}`);
  if (failed.length) {
    console.error(`measurement failed:\n  ${failed.join("\n  ")}`);
    process.exitCode = 1;
  }
  if (undeclaredTotal > 0) process.exitCode = 1;
}

await main();
