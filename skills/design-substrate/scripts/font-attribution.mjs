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

/* Collects every visible text-bearing element into `window.__faEls` and
 * returns its record. Nothing is written into the DOM: an editor that owns its
 * subtree (ProseMirror on a post form) re-renders a node whose attributes
 * change, and the node read next is gone. Serialised into the page, so it must
 * be self-contained. */
function collectTextNodes(allowedSelector) {
  /* Text a sighted reader never sees: a screen-reader copy clipped to a
   * pixel (KaTeX's MathML twin, `sr-only`). */
  const clippedAway = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const clipped = cs.clip.startsWith("rect(") || cs.clipPath === "inset(50%)";
      const r = e.getBoundingClientRect();
      if (clipped && r.width <= 1 && r.height <= 1) return true;
    }
    return false;
  };
  const els = [];
  const out = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(el.tagName)) continue;
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join("").trim();
    if (!text) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
    if (clippedAway(el)) continue;
    const trail = [];
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      trail.unshift(e.tagName + (e.parentElement ? [...e.parentElement.children].indexOf(e) : ""));
    }
    out.push({
      i: els.length,
      text,
      path: trail.join(">"),
      fontFamily: cs.fontFamily,
      allowed: allowedSelector ? !!el.closest(allowedSelector) : false,
      cls: (el.getAttribute("class") ?? "").slice(0, 120),
    });
    els.push(el);
  }
  window.__faEls = els;
  return out;
}

/* The CDP node id of a page object reached by `expression`, or null when the
 * object is gone. Needs `DOM.getDocument` first in this state. */
async function nodeIdOf(cdp, expression) {
  const { result } = await cdp.send("Runtime.evaluate", { expression });
  if (!result.objectId) return null;
  const { nodeId } = await cdp.send("DOM.requestNode", { objectId: result.objectId });
  return nodeId || null;
}

/* Split the element's direct text into one span per grapheme cluster, ask
 * each distinct cluster's face, restore the text. A cluster, not a code point:
 * a combining vowel sign (Devanagari U+093F) or a variation selector (U+FE0F)
 * split from its base lays out as nothing and reports no face. */
async function perChar(page, cdp, idx) {
  const chars = await page.evaluate((idx) => {
    const el = window.__faEls[idx];
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const seen = new Map();
    window.__faRestore = [];
    window.__faChars = [];
    for (const tn of [...el.childNodes].filter((n) => n.nodeType === 3)) {
      const frag = document.createDocumentFragment();
      const spans = [];
      for (const { segment: ch } of segmenter.segment(tn.data)) {
        const s = document.createElement("span");
        s.textContent = ch;
        if (!/^\s+$/.test(ch)) {
          if (!seen.has(ch)) {
            seen.set(ch, { ch, count: 0, j: window.__faChars.length });
            window.__faChars.push(s);
          }
          seen.get(ch).count++;
        }
        frag.appendChild(s);
        spans.push(s);
      }
      window.__faRestore.push([tn, spans]);
      tn.replaceWith(frag);
    }
    /* The spans have no layout until something asks for it, and a node with
     * no layout reports no face. */
    void el.getBoundingClientRect();
    return [...seen.values()];
  }, idx);
  const result = [];
  for (const c of chars) {
    const nodeId = await nodeIdOf(cdp, `window.__faChars[${c.j}]`);
    const { fonts: faces } = nodeId ? await cdp.send("CSS.getPlatformFontsForNode", { nodeId }) : { fonts: [] };
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
    const el = window.__faEls[idx];
    for (const [tn, spans] of window.__faRestore) {
      if (!spans.length) continue;
      spans[0].replaceWith(tn);
      spans.slice(1).forEach((s) => s.remove());
    }
  }, idx);
  return result;
}

/* Read every text-bearing element not yet read in an earlier state. The key
 * carries the computed family, so a state that re-renders the same text in
 * another face is read again. A page still rendering (a player mounting, a
 * list streaming in) can drop an element between collecting and reading it;
 * the state is read again after it settles, and a third miss is unread. */
async function measureState(page, cdp, nodes, state, tally, attempt = 0) {
  try {
    const records = await page.evaluate(collectTextNodes, allowedSelector);
    if (attempt === 0) tally.textElements += records.length;
    await cdp.send("DOM.getDocument", { depth: -1 });
    for (const r of records) {
      const key = `${r.path}::${r.text}::${r.fontFamily}`;
      if (nodes.has(key)) continue;
      const nodeId = await nodeIdOf(cdp, `(e => e?.isConnected ? e : null)(window.__faEls[${r.i}])`);
      if (nodeId === null) throw new Error(`node left the document: ${r.path}`);
      const { fonts: faces } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      const record = { ...r, state, faces };
      if (faces.length === 0) tally.unread.push(`${state} ${r.path} "${r.text.slice(0, 40)}"`);
      if (faces.some((f) => !f.isCustomFont)) record.chars = await perChar(page, cdp, r.i);
      nodes.set(key, record);
    }
  } catch (error) {
    if (attempt >= 2) {
      tally.unread.push(`${state} ${error.message.split("\n")[0]}`);
      return;
    }
    await settle(page);
    await measureState(page, cdp, nodes, state, tally, attempt + 1);
  }
}

async function settle(page) {
  await page.waitForTimeout(500);
  await page.evaluate(() => document.fonts.ready);
}

/* Marks the visible controls matching `selector` with `attribute` = 0..n-1 and
 * returns n. Marking once, before any click, keeps the targets fixed: a live
 * `[aria-expanded="false"]` query shrinks as each one opens, and stepping an
 * index through it skips every other control. */
function markControls([selector, attribute]) {
  document.querySelectorAll(`[${attribute}]`).forEach((e) => e.removeAttribute(attribute));
  let n = 0;
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || cs.visibility === "hidden") continue;
    el.setAttribute(attribute, String(n++));
  }
  return n;
}

const TAB = ['[role="tab"]', "data-fa-tab"];
const DISCLOSURE = ['[aria-expanded="false"][aria-controls]', "data-fa-disclosure"];

/* Clicks a marked control. Returns its label, or null when the click failed
 * or left the page — a control that navigates is not a state of this row, and
 * the page is reloaded so the caller can restore its ground. */
async function press(page, [, attribute], index, url) {
  const control = page.locator(`[${attribute}="${index}"]`);
  if ((await control.count()) === 0 || !(await control.isVisible().catch(() => false))) return null;
  const label = (await control.innerText().catch(() => "")).trim().slice(0, 40) || `#${index}`;
  try {
    await control.click({ timeout: 3000 });
  } catch {
    return null;
  }
  await settle(page);
  if (page.url() === url) return label;
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await settle(page);
  return null;
}

/* In the current ground, opens each closed disclosure, reads, and closes it
 * again — by its own toggle when it reports itself open, otherwise Escape — so
 * the next one is reached from the same ground. `restore` re-creates the
 * ground after a control left the page. */
async function openDisclosures(page, cdp, nodes, tally, ground, url, restore) {
  const count = await page.evaluate(markControls, DISCLOSURE);
  for (let index = 0; index < count; index++) {
    const control = page.locator(`[${DISCLOSURE[1]}="${index}"]`);
    if ((await control.getAttribute("aria-expanded").catch(() => null)) !== "false") continue;
    const label = await press(page, DISCLOSURE, index, url);
    if (label === null) {
      if (page.url() === url && (await page.locator(`[${DISCLOSURE[1]}]`).count()) === 0) {
        await restore();
        await page.evaluate(markControls, DISCLOSURE);
      }
      continue;
    }
    await measureState(page, cdp, nodes, `${ground} > disclosure:${label}`, tally);
    if ((await control.getAttribute("aria-expanded").catch(() => null)) === "true") {
      await control.click({ timeout: 3000 }).catch(() => page.keyboard.press("Escape"));
    } else {
      await page.keyboard.press("Escape");
    }
    await settle(page);
  }
}

/* The states a row is read in: the default ground and each tab selected as a
 * ground, and in every ground each closed disclosure opened. A panel closed
 * inside the second tab exists only while that tab is selected. */
async function walkStates(page, cdp, nodes, tally) {
  const url = page.url();
  const reload = async () => {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
    await settle(page);
  };
  await measureState(page, cdp, nodes, "default", tally);
  await openDisclosures(page, cdp, nodes, tally, "default", url, reload);
  const tabs = await page.evaluate(markControls, TAB);
  for (let index = 0; index < tabs; index++) {
    await page.evaluate(markControls, TAB);
    const label = await press(page, TAB, index, url);
    if (label === null) continue;
    await measureState(page, cdp, nodes, `tab:${label}`, tally);
    await openDisclosures(page, cdp, nodes, tally, `tab:${label}`, url, async () => {
      await reload();
      await page.evaluate(markControls, TAB);
      await press(page, TAB, index, url);
    });
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
      /* Two properties that change what is read but never which face draws
       * it, overridden page-wide by an adopted sheet — out of the DOM the
       * framework hydrates and an editor watches:
       *   - `content-visibility: auto` skips layout for off-screen subtrees,
       *     and a node with no layout reports no face (a card list read as
       *     139 unread elements, 2026-09 TuBrief `.video-card-item`).
       *   - Ligatures: split into spans, `f` + `i` still shape as one glyph
       *     credited to `f`, and `i` reports no face. */
      await context.addInitScript(() => {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync("* { content-visibility: visible !important; font-variant-ligatures: none !important; }");
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
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
