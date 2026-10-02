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
 * Each installed-face glyph also names why it fell (`face-coverage.mjs`): a
 * stack face has it in its cmap and its `unicode-range` leaves it out, or no
 * stack face has it. The two call for opposite fixes, and a report that said
 * only which face drew the glyph was read as the second when it was the first
 * (2026-09 TuBrief #76).
 *
 * Two readings reach past the manifest rows:
 *   - Wasted downloads: a face file the page fetches because its range
 *     claims a character there, and that draws none of those characters
 *     (`wastedFaces`). The browser fetches it and still falls through.
 *   - The corpus (`fonts.corpus`): text the pages read from a database holds
 *     characters no chosen row shows. 16 rows showed symbols in three places;
 *     the tables held them in 1,000-odd rows across five sources. Each entry's
 *     distinct characters are set inside the element that shows that text,
 *     in every locale, and judged like a rendered glyph.
 *
 * Exit 1 when any installed-face glyph (rendered or corpus) falls outside the
 * policy, when a face is a wasted download, or when a row failed to measure:
 * it could not load, its page navigated under the walk on both of two fresh
 * reads (`notMeasured`; one recovered loss is `restarted`), it read no
 * text-bearing element, a node or character returned no face (an unread face
 * is not a web face), a face file or stylesheet could not be read, or a
 * corpus element was not found.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { flag, loadConfig } from "./config.mjs";
import {
  CmapProbe,
  codePointLabel,
  collectFontFaceRules,
  faceReport,
  fallReason,
  indexRules,
  probePairs,
  stackRules,
  wastedFaces,
} from "./face-coverage.mjs";

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
const allowList = fonts?.installedAllowed;
if (
  !fonts?.locales?.length ||
  !Array.isArray(allowList) ||
  allowList.some((e) => !e || (!e.selector && !e.scripts?.length))
) {
  console.error(
    "config.fonts needs `locales` and `installedAllowed`: a list of { selector?, scripts? } entries, each with at least one key.\n" +
      "An entry allows an installed-face character when every key it has matches — inside `selector` AND of a `scripts` class.\n" +
      "The single-object form { scripts, selector } is gone: it allowed either key alone, so a content selector passed every\n" +
      "character inside it and a symbol class passed every symbol in interface text (design-substrate SKILL.md STEP 7).",
  );
  process.exit(2);
}
const mode = flag("mode") ?? "before";
const base = flag("base") ?? capture.base;
const outRoot = flag("out") ?? capture.out;
const only = flag("only") ?? "";
/* One theme is read: faces follow the theme only where a theme scope declares
 * fonts, and such a project runs once per theme (SKILL.md 「실행 수단」). */
const theme = fonts.theme ?? capture.themes[0];
const selectors = allowList.map((e) => e.selector ?? null);
/* `inside[i]`: the element is within entry i's selector (true when the entry
 * has none). */
const allows = (inside, script) => allowList.some((e, i) => inside[i] && (!e.scripts || e.scripts.includes(script)));

/* A class per character for `installedAllowed.scripts`. `Symbol` is U+2190-2BFF
 * (arrows, maths, technical, enclosed alphanumerics, box drawing, geometric
 * shapes, dingbats) drawn as text: without it these read as "Common" beside
 * every punctuation mark, and no policy could name them. In that block
 * `Extended_Pictographic` does not make an emoji — ♪ ★ ▶ carry it and draw
 * as text unless the character presents as emoji by default or a VS16 asks
 * for it. */
function scriptOf(ch) {
  const cp = ch.codePointAt(0);
  const symbolBlock = cp >= 0x2190 && cp <= 0x2bff;
  if (/\p{Emoji_Presentation}|\uFE0F|\u200D/u.test(ch)) return "Emoji";
  if (symbolBlock) return "Symbol";
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
function collectTextNodes(selectors) {
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
      inside: selectors.map((s) => (s ? !!el.closest(s) : true)),
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
    const records = await page.evaluate(collectTextNodes, selectors);
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

/* A character that lays out as nothing on its own: a space, control, format
 * character or combining mark, and the two letters Unicode makes a
 * SpacingMark (Thai SARA AM U+0E33, Lao AM U+0EB3), which read with no face
 * when a one-per-line corpus splits them from their base. */
const ALONE_EMPTY = /^[\s\p{Z}\p{Cc}\p{Cf}\p{M}\u0E33\u0EB3]+$/u;

/* Opens `url` in a new page of `context`, waiting for the network to go quiet
 * and falling back to the DOM being ready. */
async function openPage(context, url) {
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
      await page.close();
      return { blocker: error.message.split("\n")[0] };
    }
  }
  await settle(page);
  return { page, cdp };
}

/* A Playwright call whose document went away under it. */
const LOST_CONTEXT = /Execution context was destroyed|detached/i;

/* Opens a row and walks its states. A page that navigates under the walk — a
 * dev server reloading — destroys the context being read (tubrief-v2 #116);
 * the row is read again on a fresh page once, and then reported as not
 * measured. `restarted` names the loss a successful second read recovered. */
async function readRow(context, url) {
  let lost = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let opened = null;
    try {
      opened = await openPage(context, url);
      if (opened.blocker) return { blocker: opened.blocker };
      const { page, cdp } = opened;
      const nodes = new Map();
      const tally = { textElements: 0, unread: [] };
      await walkStates(page, cdp, nodes, tally);
      const { byFamily, unreadable } = await readRules(page);
      return { page, nodes, tally, byFamily, unreadable, restarted: lost };
    } catch (error) {
      if (!LOST_CONTEXT.test(error.message)) throw error;
      lost = error.message.split("\n")[0];
      await opened?.page?.close();
    }
  }
  return { lost };
}

/* Asks the probe everything a page's characters raise, then names why each
 * fallen glyph fell (`fallen[].fell`, `fallen[].faces`) and returns the
 * wasted downloads. `uses`: every { fontFamily, cp } set on the page;
 * `fallen`: installed-face glyphs outside the policy, each with `fontFamily`
 * and `codePoint`. Returns the number of questions left unanswered. */
async function judgeCoverage(byFamily, uses, fallen, probe) {
  const pairs = [];
  for (const u of uses) pairs.push(...probePairs(stackRules(byFamily, u.fontFamily), u.cp, { everyFace: false }));
  for (const f of fallen) pairs.push(...probePairs(stackRules(byFamily, f.fontFamily), f.codePoint, { everyFace: true }));
  await probe.has(pairs);
  for (const f of fallen) {
    f.faces = faceReport(stackRules(byFamily, f.fontFamily), f.codePoint, probe);
    f.fell = fallReason(f.faces);
  }
  const wasted = wastedFaces(byFamily, uses, probe);
  return { wasted, unanswered: pairs.filter(([url, cp]) => probe.answer(url, cp) == null).length };
}

/* Distinct { fontFamily, cp } over the text of every read element. */
function usesOf(nodes) {
  const seen = new Map();
  for (const n of nodes) {
    for (const ch of n.text) {
      if (ALONE_EMPTY.test(ch)) continue;
      const cp = ch.codePointAt(0);
      seen.set(`${n.fontFamily}\u0000${cp}`, { fontFamily: n.fontFamily, cp });
    }
  }
  return [...seen.values()];
}

/* Records wasted downloads under one key per face file, with every place it
 * happened and the characters that fetched it there. */
function recordWasted(wastedAll, wasted, where) {
  for (const w of wasted) {
    if (!wastedAll.has(w.url)) wastedAll.set(w.url, { family: w.family, url: w.url, where: [], characters: new Set() });
    const entry = wastedAll.get(w.url);
    entry.where.push(where);
    for (const cp of w.cps) entry.characters.add(`${codePointLabel(cp)} "${String.fromCodePoint(cp)}"`);
  }
}

const describeFall = (f) =>
  `${f.cp} "${f.ch}" ×${f.count} in ${f.face} [OS]${f.state ? ` (${f.state}, class "${f.cls}")` : ""} — ${f.fell}`;

/* The corpus entries (`fonts.corpus`): the text a page reads from a database,
 * one entry per source, each naming a manifest row and the element that shows
 * it. The config owns reading it (a snapshot file, a query); this script
 * reduces it to distinct grapheme clusters. */
async function loadCorpus() {
  if (!fonts.corpus) return [];
  const entries = await fonts.corpus();
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return entries.map((e) => {
    if (!e?.name || !e.row || !e.selector || typeof e.text !== "string") {
      console.error("config.fonts.corpus() must return [{ name, row, selector, text }] (design-substrate SKILL.md STEP 7)");
      process.exit(2);
    }
    const row = capture.rows.find((r) => r.id === e.row);
    if (!row) {
      console.error(`config.fonts.corpus: entry "${e.name}" names row "${e.row}", which is not in capture.rows`);
      process.exit(2);
    }
    /* Rendered rows judge a mark in place; split from its base by a
     * one-per-line corpus, it lays out as nothing. */
    const graphemes = new Set();
    for (const { segment } of segmenter.segment(e.text)) {
      if (!ALONE_EMPTY.test(segment)) graphemes.add(segment);
    }
    return { name: e.name, row, selector: e.selector, snapshot: e.snapshot ?? null, graphemes: [...graphemes] };
  });
}

/* Sets every distinct character of `entry` inside the first element matching
 * its selector and asks which face drew each. A character the policy allows
 * whatever face draws it (Han under a script-only entry) is not asked about.
 * Returns the per-locale record and the installed-face characters outside the
 * policy. */
async function readCorpusEntry(page, cdp, entry) {
  const placed = await page.evaluate(
    ({ selector, selectors }) => {
      const el = document.querySelector(selector);
      if (!el) return { missing: "no element matches" };
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return { missing: "element has no layout after load" };
      window.__faCorpusHost = el;
      return { fontFamily: getComputedStyle(el).fontFamily, inside: selectors.map((s) => (s ? !!el.closest(s) : true)) };
    },
    { selector: entry.selector, selectors },
  );
  if (placed.missing) return { missing: placed.missing };
  const asked = entry.graphemes.filter((g) => !allows(placed.inside, scriptOf(g)));
  await page.evaluate((graphemes) => {
    const box = document.createElement("span");
    box.setAttribute("data-fa-corpus", "");
    for (const g of graphemes) {
      const s = document.createElement("span");
      s.textContent = g;
      box.append(s);
    }
    window.__faCorpusHost.append(box);
    void box.getBoundingClientRect();
  }, asked);
  await page.evaluate(() => document.fonts.ready);
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-fa-corpus] > span" });
  const fallen = [];
  const unread = [];
  for (let i = 0; i < asked.length; i++) {
    const { fonts: faces } = nodeIds[i] ? await cdp.send("CSS.getPlatformFontsForNode", { nodeId: nodeIds[i] }) : { fonts: [] };
    const face = faces.find((f) => !f.isCustomFont) ?? faces[0];
    const cp = [...asked[i]].map((u) => codePointLabel(u.codePointAt(0))).join(" ");
    if (!face) unread.push(cp);
    else if (!face.isCustomFont) {
      fallen.push({ ch: asked[i], cp, count: 1, script: scriptOf(asked[i]), face: face.familyName, fontFamily: placed.fontFamily, codePoint: asked[i].codePointAt(0) });
    }
  }
  await page.evaluate(() => document.querySelector("[data-fa-corpus]")?.remove());
  const uses = entry.graphemes
    .map((g) => g.codePointAt(0))
    .filter((cp) => !ALONE_EMPTY.test(String.fromCodePoint(cp)))
    .map((cp) => ({ fontFamily: placed.fontFamily, cp }));
  return { fontFamily: placed.fontFamily, asked: asked.length, fallen, unread, uses };
}

async function main() {
  const setup = await capture.setup();
  const corpus = await loadCorpus();
  const browser = await chromium.launch();
  const probe = new CmapProbe(browser);
  await probe.open();
  const rows = only ? capture.rows.filter((r) => only.split(",").includes(r.id)) : capture.rows;
  const sessions = [...new Set([...rows, ...corpus.map((e) => e.row)].map((r) => capture.session(r)))];
  const results = {};
  const corpusResults = {};
  const failed = [];
  const wastedAll = new Map();
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
          const read = await readRow(context, url);
          if (read.blocker || read.lost) {
            results[key] = read.blocker ? { blocker: read.blocker, url } : { notMeasured: read.lost, url };
            failed.push(`${key} (${read.blocker ? "not loaded" : `not measured: ${read.lost}`})`);
            continue;
          }
          const { page, nodes, tally, byFamily, unreadable } = read;

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
              if (allows(n.inside, c.script)) installedAllowed += c.count;
              else {
                installedUndeclared += c.count;
                undeclared.push({ ch: c.ch, cp: c.cp, count: c.count, script: c.script, face: c.face, state: n.state, text: n.text.slice(0, 60), cls: n.cls, fontFamily: n.fontFamily, codePoint: c.ch.codePointAt(0) });
              }
            }
          }
          const { wasted, unanswered } = await judgeCoverage(byFamily, usesOf(nodes.values()), undeclared, probe);
          recordWasted(wastedAll, wasted, key);
          if (tally.textElements === 0) failed.push(`${key} (no text-bearing element read)`);
          if (tally.unread.length) failed.push(`${key} (${tally.unread.length} unread faces)`);
          if (unreadable.length) failed.push(`${key} (${unreadable.length} stylesheets unreadable: ${unreadable.join(", ")})`);
          if (unanswered) failed.push(`${key} (${unanswered} face cmap questions unanswered)`);
          undeclaredTotal += installedUndeclared;
          for (const u of undeclared) {
            delete u.fontFamily;
            delete u.codePoint;
          }
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
            ...(read.restarted ? { restarted: read.restarted } : {}),
          };
          const worst = undeclared.sort((a, b) => b.count - a.count)[0];
          console.log(
            `${key.padEnd(44)} glyphs=${glyphs} installed-allowed=${installedAllowed} installed-undeclared=${installedUndeclared}` +
              (worst ? ` — e.g. ${describeFall(worst)}` : ""),
          );
          await page.close();
        }
      }
      /* The corpus is read once per locale, at the first viewport: which face
       * draws a character does not change with the width. */
      if (viewport === capture.viewports[0]) {
        for (const entry of corpus.filter((e) => capture.session(e.row) === session)) {
          for (const lang of fonts.locales) {
            const key = `corpus:${entry.name}__${lang}`;
            const url = capture.url(entry.row, { base, lang, theme }, setup);
            const { page, cdp, blocker } = await openPage(context, url);
            if (blocker) {
              corpusResults[key] = { blocker, url };
              failed.push(`${key} (not loaded)`);
              continue;
            }
            const read = await readCorpusEntry(page, cdp, entry);
            if (read.missing) {
              corpusResults[key] = { url, selector: entry.selector, missing: read.missing };
              failed.push(`${key} (${entry.selector}: ${read.missing})`);
              await page.close();
              continue;
            }
            const { byFamily, unreadable } = await readRules(page);
            const { wasted, unanswered } = await judgeCoverage(byFamily, read.uses, read.fallen, probe);
            recordWasted(wastedAll, wasted, key);
            if (read.unread.length) failed.push(`${key} (${read.unread.length} unread faces)`);
            if (unreadable.length) failed.push(`${key} (${unreadable.length} stylesheets unreadable)`);
            if (unanswered) failed.push(`${key} (${unanswered} face cmap questions unanswered)`);
            undeclaredTotal += read.fallen.length;
            for (const f of read.fallen) {
              delete f.fontFamily;
              delete f.codePoint;
            }
            corpusResults[key] = {
              url,
              row: entry.row.id,
              selector: entry.selector,
              snapshot: entry.snapshot,
              characters: entry.graphemes.length,
              asked: read.asked,
              installedUndeclared: read.fallen.length,
              undeclared: read.fallen,
              unread: read.unread,
            };
            console.log(
              `${key.padEnd(44)} characters=${entry.graphemes.length} asked=${read.asked} installed-undeclared=${read.fallen.length}` +
                (read.fallen[0] ? ` — e.g. ${describeFall(read.fallen[0])}` : ""),
            );
            await page.close();
          }
        }
      }
      await context.close();
    }
  }
  await browser.close();
  if (probe.failures.length) failed.push(`face files unreadable:\n    ${probe.failures.join("\n    ")}`);

  const wastedList = [...wastedAll.values()].map((w) => ({ ...w, characters: [...w.characters] }));
  for (const w of wastedList) {
    console.log(
      `wasted download: ${w.family} ${w.url} draws none of the characters that fetched it — ${w.characters.slice(0, 8).join(" ")}` +
        `${w.characters.length > 8 ? ` (+${w.characters.length - 8})` : ""} (${w.where.length} places, e.g. ${w.where[0]})`,
    );
  }
  await mkdir(outRoot, { recursive: true });
  const outFile = path.join(outRoot, `fonts-${mode}.json`);
  await writeFile(
    outFile,
    JSON.stringify(
      { mode, base, theme, locales: fonts.locales, capturedAt: new Date().toISOString(), results, corpus: corpusResults, wasted: wastedList },
      null,
      2,
    ),
  );
  console.log(`font-attribution: ${Object.keys(results).length} rows, ${Object.keys(corpusResults).length} corpus reads -> ${outFile}`);
  console.log(`installed-face glyphs outside the policy: ${undeclaredTotal}`);
  console.log(`wasted downloads: ${wastedList.length}`);
  if (failed.length) {
    console.error(`measurement failed:\n  ${failed.join("\n  ")}`);
    process.exitCode = 1;
  }
  if (undeclaredTotal > 0 || wastedList.length > 0) process.exitCode = 1;
}

async function readRules(page) {
  const { rules, unreadable } = await page.evaluate(collectFontFaceRules);
  return { byFamily: indexRules(rules), unreadable };
}

await main();
