/**
 * Face coverage: for a character and the font-family stack it is set in, which
 * declared web faces claim it (`@font-face` `unicode-range`) and which have it
 * (the file's cmap). Used by `font-attribution.mjs`.
 *
 * The two questions are separate because each hides a defect the other does
 * not show (2026-09 TuBrief #76):
 *   - a face that HAS the glyph but whose range EXCLUDES it: NanumSquareNeo
 *     carries → and ▲, the declaration leaves U+2190-21FF out, and the glyph
 *     falls to the operating system. Read as "no face has it", the report
 *     sent a reader looking for a symbol font.
 *   - a face that CLAIMS the glyph but does NOT have it: the Noto Sans Arabic
 *     math and symbols subsets declare U+2192 and U+25A0-27BF and hold
 *     neither, so a page with one → downloads two files (14,584 + 22,716 B)
 *     that draw nothing. A package's declaration is not evidence of coverage.
 *
 * The cmap is the browser's answer, as the drawing face is: the file is loaded
 * under a private family with no range, the character is set in that family
 * alone, and CDP `CSS.getPlatformFontsForNode` says whether the page's face
 * drew it. No font parser, and the same engine that draws the page decides.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/* `U+0-7F, U+2190-21FF, U+4??` → [[lo, hi], ...]. No declaration is the
 * whole code space (CSS Fonts 4 §4.5). */
export function parseUnicodeRange(text) {
  if (!text || !text.trim()) return [[0, 0x10ffff]];
  const ranges = [];
  for (const raw of text.split(",")) {
    const token = raw.trim().replace(/^u\+/i, "");
    if (!token) continue;
    if (token.includes("?")) {
      ranges.push([parseInt(token.replace(/\?/g, "0"), 16), parseInt(token.replace(/\?/g, "f"), 16)]);
    } else if (token.includes("-")) {
      const [lo, hi] = token.split("-");
      ranges.push([parseInt(lo, 16), parseInt(hi, 16)]);
    } else {
      const cp = parseInt(token, 16);
      ranges.push([cp, cp]);
    }
  }
  return ranges;
}

export const inRanges = (ranges, cp) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);

/* `"NanumSquareNeo Text", "Noto Sans", system-ui` → lower-cased family names
 * in order. */
export function parseFamilyStack(fontFamily) {
  return (fontFamily.match(/"[^"]*"|'[^']*'|[^,]+/g) ?? [])
    .map((f) => f.trim().replace(/^["']|["']$/g, "").trim().toLowerCase())
    .filter(Boolean);
}

/* Every `@font-face` rule the document declares, `@import`ed and nested ones
 * included. Serialised into the page, so it must be self-contained. A sheet
 * whose rules cannot be read (cross-origin) and a rule with no `url()` source
 * are returned as such: the caller counts them as unread, never as "no face". */
export function collectFontFaceRules() {
  const rules = [];
  const unreadable = [];
  const walk = (list, base) => {
    for (const r of list) {
      if (r instanceof CSSFontFaceRule) {
        const family = r.style.getPropertyValue("font-family").trim().replace(/^["']|["']$/g, "");
        const src = r.style.getPropertyValue("src");
        const url = /url\(\s*(['"]?)([^'")]+)\1\s*\)/.exec(src)?.[2];
        rules.push({
          family,
          url: url ? new URL(url, base).href : null,
          src: src.slice(0, 160),
          range: r.style.getPropertyValue("unicode-range"),
        });
      } else if (r instanceof CSSImportRule) {
        if (r.styleSheet) {
          try {
            walk(r.styleSheet.cssRules, r.styleSheet.href ?? base);
          } catch {
            unreadable.push(r.href);
          }
        }
      } else if (r.cssRules) {
        walk(r.cssRules, base);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules, sheet.href ?? document.baseURI);
    } catch {
      unreadable.push(sheet.href);
    }
  }
  return { rules, unreadable };
}

/* One probe page per run, answering "does this file's cmap have this
 * character". Answers are cached per file and character across every row and
 * locale: the file does not change between them. */
export class CmapProbe {
  constructor(browser) {
    this.browser = browser;
    this.page = null;
    this.cdp = null;
    this.families = new Map(); // url → probe family name, or null when the file did not load
    this.answers = new Map(); // `${url} ${cp}` → true | false | null (unread)
    this.failures = [];
  }

  async open() {
    const context = await this.browser.newContext();
    this.page = await context.newPage();
    await this.page.setContent("<!doctype html><body></body>");
    this.cdp = await context.newCDPSession(this.page);
    await this.cdp.send("DOM.enable");
    await this.cdp.send("CSS.enable");
  }

  async load(url) {
    if (this.families.has(url)) return this.families.get(url);
    let bytes;
    try {
      bytes = url.startsWith("file:")
        ? await readFile(fileURLToPath(url))
        : Buffer.from(await (await fetch(url)).arrayBuffer());
    } catch (error) {
      this.failures.push(`${url}: ${error.message}`);
      this.families.set(url, null);
      return null;
    }
    const family = `fa-probe-${this.families.size}`;
    const loaded = await this.page.evaluate(
      async ([family, b64]) => {
        try {
          const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const face = new FontFace(family, bin);
          await face.load();
          document.fonts.add(face);
          return true;
        } catch (error) {
          return String(error);
        }
      },
      [family, bytes.toString("base64")],
    );
    if (loaded !== true) {
      this.failures.push(`${url}: ${loaded}`);
      this.families.set(url, null);
      return null;
    }
    this.families.set(url, family);
    return family;
  }

  /* Answers for `pairs` ([url, cp] ...), filling the cache. A cluster that
   * lays out as nothing reports no face; it is read again once, then unread. */
  async has(pairs) {
    const todo = [];
    for (const [url, cp] of pairs) {
      const key = `${url} ${cp}`;
      if (this.answers.has(key) || todo.some((t) => t.key === key)) continue;
      const family = await this.load(url);
      if (family === null) {
        this.answers.set(key, null);
        continue;
      }
      todo.push({ key, family, ch: String.fromCodePoint(cp) });
    }
    for (let attempt = 0; attempt < 2 && todo.length; attempt++) {
      await this.page.evaluate((items) => {
        document.body.replaceChildren(
          ...items.map(({ family, ch }, i) => {
            const s = document.createElement("span");
            s.id = `p${i}`;
            s.style.fontFamily = `"${family}"`;
            s.textContent = ch;
            return s;
          }),
        );
      }, todo.map(({ family, ch }) => ({ family, ch })));
      await this.page.evaluate(() => document.fonts.ready);
      await this.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const { root } = await this.cdp.send("DOM.getDocument", { depth: -1 });
      const { nodeIds } = await this.cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "body > span" });
      const again = [];
      for (let i = 0; i < todo.length; i++) {
        const { fonts } = await this.cdp.send("CSS.getPlatformFontsForNode", { nodeId: nodeIds[i] });
        if (fonts.length === 0) again.push(todo[i]);
        else this.answers.set(todo[i].key, fonts.some((f) => f.isCustomFont));
      }
      todo.splice(0, todo.length, ...again);
    }
    for (const t of todo) this.answers.set(t.key, null);
  }

  answer(url, cp) {
    return this.answers.get(`${url} ${cp}`);
  }
}

/* The page's face rules keyed by lower-cased family, each with its parsed
 * range. */
export function indexRules(rules) {
  const byFamily = new Map();
  for (const r of rules) {
    const key = r.family.toLowerCase();
    if (!byFamily.has(key)) byFamily.set(key, []);
    byFamily.get(key).push({ ...r, ranges: parseUnicodeRange(r.range) });
  }
  return byFamily;
}

/* The rules of every stack family, in stack order. */
export function stackRules(byFamily, fontFamily) {
  return parseFamilyStack(fontFamily).flatMap((f) => byFamily.get(f) ?? []);
}

const fileName = (url) => (url ? decodeURIComponent(url.split("/").pop().split("?")[0]) : null);

/* What each stack face says about `cp` once the probe has answered. */
export function faceReport(rules, cp, probe) {
  return rules.map((r) => ({
    family: r.family,
    file: fileName(r.url) ?? r.src,
    inRange: inRanges(r.ranges, cp),
    inCmap: r.url ? probe.answer(r.url, cp) : null,
  }));
}

/* Why an installed face drew `cp`: a stack face had it and its range left it
 * out, or no stack face has it. `unread` when a face's cmap could not be read. */
export function fallReason(report) {
  if (report.some((f) => f.inCmap === null)) return "unread";
  const excluded = report.filter((f) => f.inCmap && !f.inRange);
  if (excluded.length) return `range excludes (in cmap of ${[...new Set(excluded.map((f) => f.family))].join(", ")})`;
  return "absent (no stack face has it)";
}

/* Face files a page downloads and draws nothing from. Walking the stack as the
 * browser does, every claiming face of a family is fetched before the next
 * family is tried, and the walk stops at the first family one of whose
 * claiming faces has the glyph. A file fetched for one character it lacks is
 * not waste when it draws another character of the same page — NanumSquareNeo
 * Text claims Latin-1 and lacks é on purpose, so `é` falls to Noto Sans from
 * a file that is drawing the page's Hangul (app.css). Waste is a file whose
 * every reached character is missing from it: the Noto Sans Arabic math and
 * symbols subsets on a page whose only claimed character is →.
 * `uses`: [{ fontFamily, cp }] of one page (or one corpus read). Returns
 * [{ family, url, cps }]. */
export function wastedFaces(byFamily, uses, probe) {
  const reached = new Map(); // url → { family, cps: Set, draws: bool }
  for (const { fontFamily, cp } of uses) {
    const rules = stackRules(byFamily, fontFamily);
    for (const family of [...new Set(rules.map((r) => r.family.toLowerCase()))]) {
      const claiming = rules.filter((r) => r.family.toLowerCase() === family && r.url && inRanges(r.ranges, cp));
      if (!claiming.length) continue;
      let drawn = false;
      for (const r of claiming) {
        const has = probe.answer(r.url, cp);
        if (!reached.has(r.url)) reached.set(r.url, { family: r.family, cps: new Set(), draws: false });
        const entry = reached.get(r.url);
        entry.cps.add(cp);
        if (has) entry.draws = drawn = true;
      }
      if (drawn) break;
    }
  }
  return [...reached.entries()]
    .filter(([, e]) => !e.draws)
    .map(([url, e]) => ({ family: e.family, url, cps: [...e.cps] }));
}

/* The [url, cp] pairs `faceReport` and `wastedFaces` need answered. */
export function probePairs(rules, cp, { everyFace }) {
  return rules.filter((r) => r.url && (everyFace || inRanges(r.ranges, cp))).map((r) => [r.url, cp]);
}

export const codePointLabel = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
