/**
 * Measure the acceptance criteria of a rendered page, project-agnostic.
 *
 *   node <skill>/scripts/measure-surface.mjs \
 *     --urls "http://localhost:4100/a,http://localhost:4100/b" \
 *     --labels "candidate-a,candidate-b" \
 *     --out docs/design/measure.json
 *
 * This file is the portable half of the protocol. It knows nothing about any
 * project's routes, token names or candidate ids: it opens the URLs it is
 * given, reads the criteria out of `getComputedStyle`, and writes one JSON
 * object keyed by label. A project supplies a thin caller that builds the URLs
 * (TuBrief: `scripts/comp-measure.ts`).
 *
 * "Passed" is not a report: every criterion comes back as a number read from
 * the render, never from a token declaration. A declared value and a rendered
 * value diverge exactly where the interesting defects live — an alpha fill
 * composited over an unexpected ground, a face that silently fell back, a token
 * overridden downstream.
 *
 * Criteria 1-7 are the element criteria in REFERENCE.md; 8-12 and 14-16 are
 * the relational ones, and each fails the run: controls on one line of
 * different heights or kinds with identical looks (or no visible marked
 * control at all), a picture of which under 95% is on screen (or one that
 * cannot be read), a painted box set beside another with an empty band of
 * 4rem and 15% of its height, a display heading whose wrap mode left its lines
 * under 70% of its box, a sentence of 24+ characters printed twice, text
 * wrapped or cut in a column under 6em of its own size, a heading that breaks
 * a Korean word across lines.
 * `data-comp-exempt="<criterion>: <reason>"` takes an element out of that
 * judgement and into `relational.exempted`, which the submission shows the
 * owner. Only 8 needs a markup contract: `data-comp-control="<name>"` on each
 * control that shares a line. The accent region needs one too:
 * `data-comp-accent="1"` on every element that owns the accent fill. The
 * accent colour is read off those owners, never off a token name, and a
 * surface with no visible owner, an owner that paints nothing, or owners that
 * disagree about the colour is a failed measurement — in 2026-09 a deleted
 * token turned the owners transparent and the old token probe reported an
 * accent area of 0 that nobody questioned. `data-comp-active="1"` on a
 * selected row sharpens criterion 3.
 *
 * The same run is the operability check of REFERENCE.md 「Comp fidelity
 * conditions」 7: every visible control is operated, and a dead one, a page
 * error, a popup painted outside the surface's token scope, or an
 * uncommitted tree fails the run. Pass the URL the owner opens; a page
 * holding iframes (a preview shell) is measured and operated frame by frame,
 * each keyed `<label> / <iframe title>`. A dead or replaced-in-place verdict
 * is judged again on a fresh document, and disagreeing verdicts fail the run
 * as `unstable`. Every document opened must declare `data-comp-ready`
 * (Comp fidelity 11).
 *
 * With `--baseline`, the same run is also the correspondence check of
 * 「Comp fidelity conditions」 1 and 7: every control of the comp is paired
 * with a control of the operating screen by kind, container and label, and a
 * comp control with no pair, or an operating control the comp dropped, fails
 * the run unless it is declared — `data-comp-new="<reason>"` on the new
 * control, `<i hidden data-comp-dropped="<operating label>">reason</i>` for a
 * dropped one. Without `--baseline` the output says `baseline: null`, which is
 * "not checked", never "no mismatch".
 *
 * The same run is also the fit check of 「Comp fidelity conditions」 10, read
 * before any control is touched: the surface — each frame of a shell, or the
 * page itself without one — must be one of `--devices`, because its height is
 * what `100dvh` resolves to; and a frame must lie wholly inside the window,
 * because a frame that runs past it makes the shell scroll in place of the
 * frame, which the surface under test cannot see. In 2026-09 G2 a shell sized
 * every frame 1400px tall; the owner could not judge a layout fitted to the
 * device, and a check that opened the frame URL alone passed. The window is a
 * test condition, not a copy of the owner's screen: a shell that scales each
 * frame to the window it gets fits any window, so what the check catches is
 * a shell whose scaling or placement is wrong (2026-09: RTL frames drawn off
 * the left edge at 1280x720 and 1440x900 alike).
 *
 * Each frame is then opened on its own and resized through `--sweep`, where
 * criteria 8-12, 15 and 16 are judged at every width without operating anything:
 * in 2026-09 the narrowest list title (26px, 1.2em) sat at 640px, a width no
 * device has, and widening the window past 1535px shrank a 21em title cell
 * to 4.7em when the list went from two columns to four.
 *
 * Options:
 *   --urls    comma-separated URLs to measure (required); a comma inside a
 *             URL (a shell's world list) must travel as %2C
 *   --labels  comma-separated keys for the output, defaults to the URLs
 *   --viewport  window width in px, default 1440 (a frame keeps its own size)
 *   --height    window height in px, default 900; with --viewport, the window
 *             the shell is opened in
 *   --devices   comma-separated WxH device pairs a surface may be sized to,
 *             default 390x844,768x1024,1440x900,1920x1080 (REFERENCE.md
 *             「Comp fidelity conditions」 10)
 *   --root      selector the measurement is scoped to, default body
 *   --out       output file, default measure.json
 *   --baseline  comma-separated operating-screen URLs, one per --urls entry,
 *             each rendering the frame's state (locale, record, content
 *             language, theme); a frame is compared at its own size
 *   --shipped-world  the world already ships in the operating screen (after
 *             the substrate pass): every token the baseline defines must
 *             resolve to the same value at --root, or the run fails. Needs
 *             --baseline; without it the output says `tokens: null`
 *   --sweep     <from>-<to>:<step> window widths the layout criteria are
 *             judged at, default 390-1920:16, window height 900; `off` skips
 *             it and the output says `sweep: null`, which is "not checked"
 *
 * Colour is read by the shared kernel in `design-substrate/scripts/color-kernel.mjs`
 * (override the skill location with DESIGN_SUBSTRATE_HOME). Every row carries
 * `colorRead.unread`; a row with any unread value is a measurement failure and
 * the run exits non-zero.
 *
 * Playwright is resolved from the calling project, so no install lives here.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const KERNEL_FILE = path.join(
  process.env.DESIGN_SUBSTRATE_HOME ?? path.join(os.homedir(), ".agents/skills/design-substrate"),
  "scripts/color-kernel.mjs",
);
if (!existsSync(KERNEL_FILE)) {
  console.error(`colour kernel not found at ${KERNEL_FILE} — install design-substrate or set DESIGN_SUBSTRATE_HOME`);
  process.exit(1);
}
const { COLOR_KERNEL } = await import(pathToFileURL(KERNEL_FILE).href);

const require = createRequire(path.join(process.cwd(), "package.json"));
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("@playwright/test"));
}

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

const urls = arg("urls", "").split(",").filter(Boolean);
const labels = arg("labels", "").split(",").filter(Boolean);
const viewport = Number(arg("viewport", "1440"));
const height = Number(arg("height", "900"));
const devices = arg("devices", "390x844,768x1024,1440x900,1920x1080").split(",").filter(Boolean);
const rootSelector = arg("root", "");
const outFile = arg("out", "measure.json");
const baselines = arg("baseline", "").split(",").filter(Boolean);
const shippedWorld = process.argv.includes("--shipped-world");
// The width sweep of 「Comp fidelity conditions」 10: layout criteria at every
// step between the smallest and the largest device, because a column is
// narrowest where a layout switches, and those widths belong to the code, not
// to the device list.
const SWEEP_HEIGHT = 900;
const sweep = (() => {
  const value = arg("sweep", "390-1920:16");
  if (value === "off") return null;
  const m = value.match(/^(\d+)-(\d+):(\d+)$/);
  if (!m || Number(m[3]) <= 0 || Number(m[1]) > Number(m[2])) {
    console.error(`measure-surface: --sweep "${value}" is not <from>-<to>:<step> or off`);
    process.exit(1);
  }
  const [from, to, step] = m.slice(1).map(Number);
  // Steps sit on multiples of the step, not on `from` + n·step: breakpoints
  // are written in rem (Tailwind sm = 40rem = 640px), so 390 + 16n would pass
  // every one of them by 6px.
  const widths = [from];
  for (let w = Math.ceil((from + 1) / step) * step; w < to; w += step) widths.push(w);
  if (to > from) widths.push(to);
  return { from, to, step, widths };
})();

if (shippedWorld && baselines.length === 0) {
  console.error("measure-surface: --shipped-world requires --baseline");
  process.exit(1);
}
if (urls.length === 0) {
  console.error("measure-surface: --urls is required");
  process.exit(1);
}
if (baselines.length > 0 && baselines.length !== urls.length) {
  console.error("measure-surface: --baseline needs one URL per --urls entry");
  process.exit(1);
}

// What the eye can see. Criteria 8 (control height) and 12 (duplicate text)
// measure what is on screen, disabled controls included; the operability
// check needs the narrower `operable`. Two separate judgements of "shown"
// drifted apart once: criterion 8 counted a theme group hidden below md as a
// 0px control and reported a 36px spread where every visible control was 36px.
const VISIBLE = `(el) => {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  if (el.closest('[aria-hidden="true"],[inert]')) return false;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
  }
  return true;
}`;

const MEASURE = (rootSelector) => `async () => {
  const ROOT_SELECTOR = ${JSON.stringify(rootSelector)};
  const k = globalThis.__colorKernel;
  if (!k || !k.ready) return { measurementFailed: 'colour kernel: ' + (k ? k.error : 'not installed') };
  k.reset();
  const toL = k.okL;
  const parse = k.parse;
  // An alpha fill is judged where it lands.
  const composite = k.groundOf;
  const rgbKey = (c) => c.slice(0, 3).map(Math.round).join(',');
  const root = (ROOT_SELECTOR && document.querySelector(ROOT_SELECTOR)) || document.querySelector('[data-comp-world]') || document.body;
  const all = [...root.querySelectorAll('*')];

  // 1 — type ramp. Character-weighted so a lone big glyph cannot pose as body.
  const sizes = new Map();
  let maxSize = 0;
  let maxSample = '';
  for (const el of all) {
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join('');
    if (!own) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    sizes.set(size, (sizes.get(size) ?? 0) + own.length);
    if (size > maxSize) { maxSize = size; maxSample = own.slice(0, 40); }
  }
  const ramp = [...sizes.entries()].sort((a, b) => b[1] - a[1]);

  // Accent first: an accent fill is not a rung of the neutral ladder, and
  // counting it as one inflates the span of exactly the candidate that paints
  // the biggest accent region. The colour comes from the marked owners.
  const visible = ${VISIBLE};
  const owners = [...root.querySelectorAll('[data-comp-accent]')].filter(visible);
  const ownerFills = owners.map((el) => ({ el, fill: parse(getComputedStyle(el).backgroundColor) }));
  const near = (a, b) => a && b && a.every((c, i) => Math.abs(c - b[i]) <= 3);
  const accentColours = [];
  for (const { fill } of ownerFills) {
    if (!fill || fill[3] < 0.5) continue;
    if (!accentColours.some((c) => near(c, fill.slice(0, 3)))) accentColours.push(fill.slice(0, 3));
  }
  const describe = (el) => el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 24) || el.tagName.toLowerCase();
  const clear = ownerFills.filter(({ fill }) => !fill || fill[3] < 0.5).map(({ el }) => describe(el));
  const accentError = owners.length === 0
    ? 'no visible data-comp-accent owner'
    : clear.length > 0
      ? 'accent owner paints no fill: ' + clear.join(', ')
      : accentColours.length > 1
        ? 'accent owners disagree: ' + accentColours.map((c) => 'rgb(' + c.map(Math.round).join(',') + ')').join(' vs ')
        : null;
  const accentRgb = accentError ? null : accentColours[0];

  // 2 — surface ladder: neutral fills big enough to read as a layer.
  const fills = new Map();
  for (const el of [root, ...all]) {
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area < 4000) continue;
    const bg = parse(getComputedStyle(el).backgroundColor);
    if (!bg || bg[3] < 0.999 || near(bg.slice(0, 3), accentRgb)) continue;
    const key = rgbKey(bg);
    const prev = fills.get(key);
    if (!prev || area > prev.area) fills.set(key, { rgb: bg.slice(0, 3), area });
  }
  const ladder = [...fills.values()]
    .map((f) => ({ L: Number(toL(f.rgb).toFixed(4)), rgb: f.rgb.map(Math.round), area: Math.round(f.area) }))
    .sort((a, b) => a.L - b.L);
  const deltas = ladder.slice(1).map((s, i) => Number((s.L - ladder[i].L).toFixed(4)));

  // 3 — active vs idle sibling.
  const active = root.querySelector('[data-comp-active]');
  let activeState = null;
  if (active) {
    const siblings = [...(active.parentElement?.children ?? [])]
      .filter((el) => el !== active && !el.hasAttribute('data-comp-active'));
    const idle = siblings[0] ?? null;
    const a = composite(active);
    const b = idle ? composite(idle) : null;
    activeState = {
      activeL: a ? Number(toL(a).toFixed(4)) : null,
      idleL: b ? Number(toL(b).toFixed(4)) : null,
      delta: a && b ? Number(Math.abs(toL(a) - toL(b)).toFixed(4)) : null,
      idleFound: Boolean(idle),
    };
  }

  // 4 — accent region: fills of the owners' colour, by area and height.
  let accentArea = 0;
  let accentTallest = 0;
  let accentNodes = 0;
  for (const el of all) {
    const bg = parse(getComputedStyle(el).backgroundColor);
    if (!bg || bg[3] < 0.5 || !near(bg.slice(0, 3), accentRgb)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    accentNodes += 1;
    accentArea += rect.width * rect.height;
    accentTallest = Math.max(accentTallest, rect.height);
  }
  const main = root.getBoundingClientRect();

  // 5 — the faces actually in use per role.
  const faces = {};
  for (const role of ['sans', 'catalogue', 'notation']) {
    faces[role] = getComputedStyle(root).getPropertyValue('--font-' + role).trim().split(',')[0];
  }
  // Declared exceptions to the gated relational criteria (8-12, 14-16):
  // \`data-comp-exempt="<criterion>: <reason>"\` on the element or an ancestor,
  // several joined by \`;\`. An exempt element leaves the judgement and lands in
  // \`exempted\` with its reason, which the submission puts before the owner —
  // the run passes, the owner approves or rejects each line. Every declaration
  // in the document is parsed up front, so one that names no gated criterion
  // or gives no reason fails even where it covers nothing.
  const exempted = [];
  const badExempt = [];
  const declared = new Map();
  for (const a of document.querySelectorAll('[data-comp-exempt]')) {
    const reasons = new Map();
    for (const part of a.getAttribute('data-comp-exempt').split(';')) {
      const m = part.match(/^\\s*(\\d+)\\s*:\\s*(\\S.*)$/);
      if (m && [8, 9, 10, 11, 12, 14, 15, 16].includes(Number(m[1]))) reasons.set(Number(m[1]), m[2].trim());
      else badExempt.push(part.trim());
    }
    declared.set(a, reasons);
  }
  const exemptReason = (el, criterion) => {
    for (let a = el.closest('[data-comp-exempt]'); a; a = a.parentElement && a.parentElement.closest('[data-comp-exempt]')) {
      const reason = declared.get(a)?.get(criterion);
      if (reason) return reason;
    }
    return null;
  };
  const exempt = (el, criterion, what) => {
    const reason = exemptReason(el, criterion);
    if (reason) exempted.push({ criterion, what, reason });
    return Boolean(reason);
  };
  // Gated relational defects, one line each; the caller fails the run on any.
  const relationalDefects = [];

  // 8 — do the controls that share a line agree about how tall a control is?
  // A line is controls whose vertical extents overlap. No visible marked
  // control at all is a failed measurement, not a spread of 0: in 2026-09 the
  // G1 chrome carried a 30px theme group beside a 36px language chip with no
  // marks, and the report said 0.
  const controlEls = [...document.querySelectorAll('[data-comp-control]')];
  const controlNodes = controlEls.filter(visible).map((el) => {
    const rect = el.getBoundingClientRect();
    return { el, name: el.getAttribute('data-comp-control'), height: Math.round(rect.height), width: Math.round(rect.width), top: rect.top, bottom: rect.bottom };
  });
  const judged = controlNodes.filter((c) => !exempt(c.el, 8, 'control ' + c.name));
  const lines = [];
  for (const c of [...judged].sort((a, b) => a.top - b.top)) {
    const line = lines.find((l) => l.some((o) => c.top < o.bottom && o.top < c.bottom));
    if (line) line.push(c); else lines.push([c]);
  }
  const controlLines = lines.map((l) => {
    const heights = [...new Set(l.map((c) => c.height))].sort((a, b) => a - b);
    return { names: l.map((c) => c.name + ' ' + c.height + 'px'), spreadPx: heights[heights.length - 1] - heights[0] };
  });
  const controls = {
    nodes: controlNodes.map(({ name, height, width }) => ({ name, height, width })),
    lines: controlLines,
    spreadPx: Math.max(0, ...controlLines.map((l) => l.spreadPx)),
    // Marked controls left out because nothing of them is on screen.
    hiddenExcluded: controlEls.length - controlNodes.length,
  };
  if (controlNodes.length === 0 && !exempt(root, 8, 'surface without controls')) {
    relationalDefects.push('criterion 8: no visible data-comp-control — mark the controls, or declare data-comp-exempt="8: <reason>" on the root');
  }
  for (const l of controlLines) {
    if (l.spreadPx > 0) relationalDefects.push('criterion 8: controls on one line differ by ' + l.spreadPx + 'px (' + l.names.join(', ') + ')');
  }

  // 10 — column void: a painted box set beside another in one row, with a
  // band inside it that nothing occupies. In 2026-09 G1 a summary box was
  // stretched to the 662px stage beside it and a flex-1 list pinned its
  // footer to the bottom, leaving a 350px band in the middle — so the band is
  // the tallest empty slice anywhere in the box, not the space under its last
  // line (2.7% there). Height spread is not the defect: the fix ended the box
  // at its content, 266px short of the stage. Painted = a background that
  // changes the ground, a background image, a border or a shadow; an unpainted
  // column that ends early is page ground, not an empty box. Ink = lines of
  // text, pictures and painted descendants. 4rem keeps the gaps between
  // paragraphs of a short box out (21px), 15% the section gaps of a long one.
  const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const voidMinPx = 4 * remPx;
  const voidMinPct = 15;
  const groundDiffers = (a, b) => a.some((c, i) => Math.abs(c - b[i]) > 1);
  const paintsBox = (el) => {
    const s = getComputedStyle(el);
    if (s.backgroundImage && s.backgroundImage !== 'none') return true;
    const bg = parse(s.backgroundColor);
    if (bg && bg[3] > 0 && el.parentElement && groundDiffers(composite(el), composite(el.parentElement))) return true;
    return k.paintedLayers(el).some((l) => l.kind !== 'outline');
  };
  const boxLabel = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '');
  const inkBands = (box) => {
    const r = box.getBoundingClientRect();
    const s = getComputedStyle(box);
    const top = r.top + (parseFloat(s.borderTopWidth) || 0);
    const bottom = r.bottom - (parseFloat(s.borderBottomWidth) || 0);
    const ink = [];
    const add = (q) => {
      const y1 = Math.max(top, q.top);
      const y2 = Math.min(bottom, q.bottom);
      if (q.right > r.left && q.left < r.right && y2 > y1) ink.push([y1, y2]);
    };
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.nodeValue.trim() || !visible(t.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      for (const q of range.getClientRects()) if (q.width > 0 && q.height > 0) add(q);
    }
    for (const el of box.querySelectorAll('*')) {
      if (!visible(el)) continue;
      if (el.matches('img,video,svg,canvas,picture,iframe') || paintsBox(el)) add(el.getBoundingClientRect());
    }
    ink.sort((a, b) => a[0] - b[0]);
    let cursor = top;
    let band = { from: top, px: 0 };
    for (const [y1, y2] of ink) {
      if (y1 - cursor > band.px) band = { from: cursor, px: y1 - cursor };
      cursor = Math.max(cursor, y2);
    }
    if (bottom - cursor > band.px) band = { from: cursor, px: bottom - cursor };
    return { heightPx: r.height, bandPx: band.px, bandFromPx: band.from - r.top };
  };
  const columnVoids = [];
  for (const parent of [root, ...all]) {
    const s = getComputedStyle(parent);
    const grid = s.display === 'grid' || s.display === 'inline-grid';
    const rowFlex = (s.display === 'flex' || s.display === 'inline-flex') && s.flexDirection.startsWith('row');
    if ((!grid && !rowFlex) || !visible(parent)) continue;
    const kids = [...parent.children].filter(visible);
    if (kids.length < 2) continue;
    // A row is siblings whose vertical extents overlap and horizontal ones do
    // not: a stack at 390px and two rows of a gallery are not side by side.
    const rects = kids.map((el) => el.getBoundingClientRect());
    const beside = kids.map((_, i) => rects.some((o, j) => j !== i && rects[i].top < o.bottom && o.top < rects[i].bottom && (rects[i].right <= o.left || o.right <= rects[i].left)));
    kids.forEach((el, i) => {
      if (!beside[i] || rects[i].height < voidMinPx || !paintsBox(el)) return;
      const m = inkBands(el);
      const pct = Number(((m.bandPx / m.heightPx) * 100).toFixed(1));
      const label = boxLabel(el);
      const text = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 32);
      columnVoids.push({ box: label, text, heightPx: Math.round(m.heightPx), bandPx: Math.round(m.bandPx), bandFromPx: Math.round(m.bandFromPx), bandPct: pct });
      if (m.bandPx >= voidMinPx && pct >= voidMinPct && !exempt(el, 10, 'box ' + label)) {
        relationalDefects.push('criterion 10: ' + label + ' "' + text + '" has an empty band of ' + Math.round(m.bandPx) + 'px (' + pct + '% of ' + Math.round(m.heightPx) + 'px) starting ' + Math.round(m.bandFromPx) + 'px from its top');
      }
    });
  }

  // 11 — does a display-size heading use the column it was given?
  // \`text-balance\` on a 40px title wrapped it into short lines: 388px inside an
  // 828px column. Only a heading that wraps is judged: a title that ends on its
  // first line is as long as its words, not short by choice. The column is the
  // heading's own content box, the same box criterion 15 reads. A heading fails
  // only when its wrapping left room the words could have used: laid out again
  // with plain wrapping, its widest line grows. Plain wrapping already fills
  // each line as far as the next breakable unit allows, so the browser, not
  // this script, decides where a unit ends. Cases: REFERENCE.md criterion 11.
  const headings = [];
  const headingRows = (h, size) => {
    const range = document.createRange();
    range.selectNodeContents(h);
    const boxes = [...range.getClientRects()].filter((r) => r.width > 0);
    range.detach();
    // One rendered line per distinct top, fragments of a line joined.
    const rows = [];
    for (const r of boxes) {
      const row = rows.find((w) => Math.abs(w.top - r.top) < size / 2);
      if (row) { row.left = Math.min(row.left, r.left); row.right = Math.max(row.right, r.right); }
      else rows.push({ top: r.top, left: r.left, right: r.right });
    }
    return { lines: rows.length, inkWidth: Math.max(0, ...rows.map((w) => w.right - w.left)) };
  };
  for (const h of root.querySelectorAll('h1,h2')) {
    const style = getComputedStyle(h);
    const size = parseFloat(style.fontSize);
    if (size < 28 || !visible(h)) continue;
    const own = h.getBoundingClientRect();
    const columnPx = Math.max(1, own.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth) - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const pctOf = (px) => Number(((px / columnPx) * 100).toFixed(1));
    const { lines, inkWidth } = headingRows(h, size);
    const usedPct = pctOf(inkWidth);
    const textWrap = style.textWrapStyle && style.textWrapStyle !== 'auto' ? style.textWrapStyle : 'wrap';
    let plainWrap = null;
    let plainInk = inkWidth;
    if (textWrap === 'balance' || textWrap === 'pretty') {
      const before = h.style.getPropertyValue('text-wrap');
      const priority = h.style.getPropertyPriority('text-wrap');
      h.style.setProperty('text-wrap', 'wrap', 'important');
      const plain = headingRows(h, size);
      if (before) h.style.setProperty('text-wrap', before, priority);
      else h.style.removeProperty('text-wrap');
      plainInk = plain.inkWidth;
      plainWrap = { lines: plain.lines, widestLinePx: Math.round(plain.inkWidth), usedPct: pctOf(plain.inkWidth) };
    }
    const text = (h.textContent || '').trim().slice(0, 32);
    headings.push({ px: size, lines, columnPx: Math.round(columnPx), widestLinePx: Math.round(inkWidth), usedPct, textWrap, plainWrap, text });
    if (lines >= 2 && usedPct < 70 && plainInk > inkWidth + 0.5 && !exempt(h, 11, 'heading ' + text)) {
      relationalDefects.push('criterion 11: heading "' + text + '" wraps into ' + lines + ' lines using ' + usedPct + '% of its ' + Math.round(columnPx) + 'px column (text-wrap: ' + textWrap + '; with text-wrap: wrap ' + plainWrap.lines + ' lines using ' + plainWrap.usedPct + '%)');
    }
  }

  // 16 — word split: does a heading break a Korean word across lines? Under
  // \`word-break: normal\` the browser may break between any two syllables. A
  // line break is a split when the characters on its two sides are both
  // letters or digits, no space, <br> or block edge lies between them, and one
  // of them is Hangul — read off the glyphs, not \`lang\`, so a Korean title on
  // an English page counts. Cases: REFERENCE.md criterion 16.
  const hangulChar = /\\p{Script=Hangul}/u;
  const wordChar = /[\\p{L}\\p{N}]/u;
  const blockOf = (node) => {
    let el = node.nodeType === 1 ? node : node.parentElement;
    while (el && el.parentElement && ['inline', 'contents'].includes(getComputedStyle(el).display)) el = el.parentElement;
    return el;
  };
  const wordSplits = [];
  for (const h of root.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    if (!visible(h)) continue;
    const size = parseFloat(getComputedStyle(h).fontSize);
    const splits = [];
    let prev = null;
    let gap = false;
    // Hidden descendants neither draw a letter nor separate two: a hidden space
    // would mask a split, and a visibility-hidden letter still has a box.
    const walk = document.createTreeWalker(h, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (n.nodeType !== 1) return NodeFilter.FILTER_ACCEPT;
        const st = getComputedStyle(n);
        return st.display === 'none' || st.visibility !== 'visible' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n.nodeType === 1) {
        if (n.tagName === 'BR') gap = true;
        continue;
      }
      const block = blockOf(n);
      const s = n.nodeValue;
      for (let i = 0; i < s.length;) {
        const ch = String.fromCodePoint(s.codePointAt(i));
        const start = i;
        i += ch.length;
        if (/\\s/u.test(ch)) { gap = true; continue; }
        const range = document.createRange();
        range.setStart(n, start);
        range.setEnd(n, i);
        const rect = [...range.getClientRects()].find((r) => r.width > 0 && r.height > 0);
        range.detach();
        if (!rect) continue;
        if (prev && !gap && prev.block === block && rect.top - prev.top > size / 2
          && wordChar.test(prev.ch) && wordChar.test(ch) && (hangulChar.test(prev.ch) || hangulChar.test(ch))) {
          splits.push(prev.ch + '⏎' + ch);
        }
        prev = { ch, top: rect.top, block };
        gap = false;
      }
    }
    if (splits.length === 0) continue;
    const text = (h.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 32);
    wordSplits.push({ tag: h.tagName.toLowerCase(), px: size, text, splits });
    // The split letters stay in \`wordSplits\`: they move with the width, and
    // the sweep folds one heading's widths into one line by its digits alone.
    if (!exempt(h, 16, 'heading ' + text)) {
      relationalDefects.push('criterion 16: heading "' + text + '" breaks a Korean word across lines ' + splits.length + ' time(s) (relational.wordSplits)');
    }
  }

  // 15 — text measure: is text given a column it can be read in? In 2026-09 a
  // 200px thumbnail kept beside the title from 640px up left the list's 22px
  // titles 26px (1.2em) at 640, 90px at 768 and 104px (4.7em) at 1920 — four
  // or five Hangul a line — and criterion 10 passed once the cards stopped
  // stretching, because the void had moved out of the cards. The width is the
  // content box of the block the text is laid out in, in em of the text's own
  // size, so Hangul and Latin answer to one rule. Only text the column broke
  // is judged: wrapped into two lines or more, or cut to one line by an
  // ellipsis or a line clamp. A one-line label as wide as its words (a 2em
  // tab) has all the room it needs.
  const measureMinEm = 6;
  const clampOf = (st) => ['-webkit-line-clamp', 'line-clamp'].some((p) => {
    const v = st.getPropertyValue(p).trim();
    return v !== '' && v !== 'none' && v !== '0';
  });
  const textMeasures = [];
  for (const el of all) {
    const nodes = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (nodes.length === 0 || !visible(el)) continue;
    const s = getComputedStyle(el);
    const size = parseFloat(s.fontSize);
    if (!size) continue;
    let box = el;
    while (box !== root && box.parentElement && ['inline', 'contents'].includes(getComputedStyle(box).display)) box = box.parentElement;
    const tops = [];
    for (const n of nodes) {
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const q of range.getClientRects()) if (q.width > 0 && q.height > 0) tops.push(q.top);
      range.detach();
    }
    tops.sort((a, b) => a - b);
    let lines = 0;
    let lineTop = -Infinity;
    for (const t of tops) if (t - lineTop > size / 2) { lines += 1; lineTop = t; }
    const bs = getComputedStyle(box);
    const cut = lines === 1
      && (s.textOverflow === 'ellipsis' || bs.textOverflow === 'ellipsis' || clampOf(s) || clampOf(bs))
      && (el.scrollWidth > el.clientWidth || box.scrollWidth > box.clientWidth);
    if (lines < 2 && !cut) continue;
    const r = box.getBoundingClientRect();
    const contentPx = Math.max(0, r.width - parseFloat(bs.borderLeftWidth) - parseFloat(bs.borderRightWidth) - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight));
    const em = Number((contentPx / size).toFixed(2));
    const text = nodes.map((n) => n.textContent.trim()).join(' ').replace(/\\s+/g, ' ').slice(0, 32);
    const label = boxLabel(box);
    textMeasures.push({ box: label, text, em, contentPx: Math.round(contentPx), fontPx: size, lines, cut });
    if (em < measureMinEm && !exempt(el, 15, 'text ' + text)) {
      relationalDefects.push('criterion 15: ' + label + ' "' + text + '" is set ' + em + 'em wide (' + Math.round(contentPx) + 'px at ' + size + 'px) and ' + (cut ? 'is cut to one line' : 'breaks into ' + lines + ' lines'));
    }
  }
  textMeasures.sort((a, b) => a.em - b.em);

  // 12 — is any sentence printed twice on the surface?
  // The reader printed the brief's first sentence in a strip above the brief.
  // Only what is on screen counts, by the same judgement as criterion 8.
  const seen = new Map();
  for (const el of all) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (own.length < 24 || !visible(el)) continue;
    if (exempt(el, 12, 'text ' + own.slice(0, 32))) continue;
    seen.set(own, (seen.get(own) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([text, n]) => ({ text: text.slice(0, 48), count: n }));
  for (const d of duplicates) relationalDefects.push('criterion 12: "' + d.text + '" is printed ' + d.count + ' times');

  // 9 — how much of each picture is actually on screen? The author's
  // aspect-ratio (on the img or the box around it) says what shape the picture
  // is, and three things take part of it away: fit — object-fit cover/none on
  // a box whose rendered ratio left the declared one, as when a height cap
  // stretches a 16:9 box wide and trims top and bottom; clip — an ancestor
  // with overflow hidden or clip; cover — something painted on top. In
  // 2026-09 G1 a title band laid over the lead thumbnail hid 40% of it, and the
  // old measure (img box ÷ file ratio) read 75% before and after the fix: a
  // YouTube hqdefault file is 4:3 with black bands around 16:9 content, so the
  // file is the reference only when nothing is declared. Each picture is
  // scrolled into view first, so a lazy one loads; one with neither a declared
  // ratio nor a loaded file is a failed measurement, not a pass. Last in this
  // function because it scrolls. The page may scroll an inner container rather
  // than the window (TuBrief pins html and body at overflow hidden), so the
  // picture is brought in with scrollIntoView — which also moves every scroller
  // above it, a preview shell around the frame included, and the operability
  // check then clicked into a moved shell. Each of those is put back.
  const ratioOf = (value) => {
    const m = String(value).match(/([\\d.]+)\\s*(?:\\/\\s*([\\d.]+))?\\s*$/);
    if (!m) return null;
    const r = m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
    return r > 0 && Number.isFinite(r) ? r : null;
  };
  const paints = (el, x, y) => {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const bg = parse(s.backgroundColor);
    if ((bg && bg[3] > 0) || s.backgroundImage !== 'none') return true;
    if (el instanceof SVGElement || ['IMG', 'VIDEO', 'CANVAS'].includes(el.tagName)) return true;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const hit = [...range.getClientRects()].some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
      range.detach();
      if (hit) return true;
    }
    return false;
  };
  const tagOf = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '');
  const scrolled = new Map();
  const rememberScroll = (el) => {
    try {
      for (let n = el; n; n = n.parentElement || n.ownerDocument.defaultView.frameElement) {
        if (!scrolled.has(n)) scrolled.set(n, [n.scrollLeft, n.scrollTop]);
      }
    } catch { /* a cross-origin parent is not ours to move */ }
  };
  // Hit-testing skips pointer-events:none, and a band that ignores the pointer
  // still hides the picture.
  const hitAll = document.createElement('style');
  hitAll.textContent = '* { pointer-events: auto !important; }';
  document.head.appendChild(hitAll);
  const media = [];
  let mediaUnread = 0;
  const pictures = [...root.querySelectorAll('img')].filter((img) => visible(img) && img.getBoundingClientRect().width > 200);
  for (const img of pictures) {
    const src = img.currentSrc || img.src || '';
    const name = src.startsWith('data:') ? (img.alt || 'inline image') : src.split('/').slice(-2).join('/').slice(0, 48);
    rememberScroll(img);
    img.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    if (!img.complete) {
      await new Promise((done) => {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
        setTimeout(done, 3000);
      });
    }
    let declared = null;
    let declaredBy = 'file';
    for (let n = img; n && n.nodeType === 1; n = n === root ? null : n.parentElement) {
      const r = ratioOf(getComputedStyle(n).aspectRatio);
      if (r) { declared = r; declaredBy = n === img ? 'self' : 'ancestor'; break; }
    }
    const reference = declared ?? (img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : null);
    if (reference === null) {
      mediaUnread += 1;
      media.push({ name, unread: 'no declared aspect-ratio and the file did not load' });
      relationalDefects.push('criterion 9: picture ' + name + ' could not be read — no declared aspect-ratio and the file did not load');
      continue;
    }
    const rect = img.getBoundingClientRect();
    const boxRatio = rect.width / rect.height;
    const objectFit = getComputedStyle(img).objectFit;
    const fitShare = objectFit === 'cover' || objectFit === 'none' ? Math.min(boxRatio, reference) / Math.max(boxRatio, reference) : 1;
    let cl = rect.left;
    let ct = rect.top;
    let cr = rect.right;
    let cb = rect.bottom;
    for (let n = img.parentElement; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      const hx = s.overflowX === 'hidden' || s.overflowX === 'clip';
      const hy = s.overflowY === 'hidden' || s.overflowY === 'clip';
      if (!hx && !hy) continue;
      const b = n.getBoundingClientRect();
      if (hx) { cl = Math.max(cl, b.left + n.clientLeft); cr = Math.min(cr, b.left + n.clientLeft + n.clientWidth); }
      if (hy) { ct = Math.max(ct, b.top + n.clientTop); cb = Math.min(cb, b.top + n.clientTop + n.clientHeight); }
    }
    const clipShare = (Math.max(0, cr - cl) * Math.max(0, cb - ct)) / (rect.width * rect.height);
    // A 20×20 grid over the unclipped part, in document coordinates so a
    // picture taller than the window is sampled by scrolling the window.
    const docLeft = cl + scrollX;
    const docTop = ct + scrollY;
    const cellW = Math.max(0, cr - cl) / 20;
    const cellH = Math.max(0, cb - ct) / 20;
    let sampled = 0;
    let free = 0;
    const coveredBy = new Map();
    for (let row = 0; row < 20 && cellW > 0 && cellH > 0; row += 1) {
      for (let col = 0; col < 20; col += 1) {
        const docX = docLeft + (col + 0.5) * cellW;
        const docY = docTop + (row + 0.5) * cellH;
        let x = docX - scrollX;
        let y = docY - scrollY;
        if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) {
          window.scrollTo({ left: docX - innerWidth / 2, top: docY - innerHeight / 2, behavior: 'instant' });
          x = docX - scrollX;
          y = docY - scrollY;
          if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) continue;
        }
        sampled += 1;
        const stack = document.elementsFromPoint(x, y);
        let cover = null;
        let reached = false;
        for (const el of stack) {
          if (el === img) { reached = true; break; }
          if (paints(el, x, y)) { cover = el; break; }
        }
        if (!cover && !reached) cover = stack[0] ?? null;
        if (cover) coveredBy.set(tagOf(cover), (coveredBy.get(tagOf(cover)) ?? 0) + 1);
        else free += 1;
      }
    }
    const uncoveredShare = sampled > 0 ? free / sampled : 0;
    const visiblePct = Number((fitShare * clipShare * uncoveredShare * 100).toFixed(1));
    const covers = [...coveredBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([what, n]) => ({ what, pct: Number(((n / Math.max(1, sampled)) * 100).toFixed(1)) }));
    media.push({
      name,
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      declaredRatio: Number(reference.toFixed(3)),
      declaredBy,
      boxRatio: Number(boxRatio.toFixed(3)),
      objectFit,
      fitPct: Number((fitShare * 100).toFixed(1)),
      clipPct: Number((clipShare * 100).toFixed(1)),
      uncoveredPct: Number((uncoveredShare * 100).toFixed(1)),
      visiblePct,
      coveredBy: covers,
      sampledPoints: sampled,
    });
    if (visiblePct < 95 && !exempt(img, 9, 'picture ' + name)) {
      const by = covers.length ? ' — covered by ' + covers.map((c) => c.what + ' ' + c.pct + '%').join(', ') : '';
      relationalDefects.push('criterion 9: picture ' + name + ' shows ' + visiblePct + '% (fit ' + (fitShare * 100).toFixed(1) + '%, clip ' + (clipShare * 100).toFixed(1) + '%, uncovered ' + (uncoveredShare * 100).toFixed(1) + '%)' + by);
    }
  }
  hitAll.remove();
  for (const [n, [left, top]] of scrolled) { n.scrollLeft = left; n.scrollTop = top; }

  for (const part of badExempt) relationalDefects.push('data-comp-exempt "' + part + '" is not "<8|9|10|11|12|14|15|16>: <reason>"');

  return {
    dominant: {
      maxPx: maxSize,
      maxSample,
      bodyModePx: ramp[0]?.[0] ?? null,
      ratioTo16: Number((maxSize / 16).toFixed(2)),
      ratioToMode: ramp[0] ? Number((maxSize / ramp[0][0]).toFixed(2)) : null,
      ramp: ramp.slice(0, 6).map(([px, chars]) => ({ px, chars })),
    },
    ladder: { steps: ladder.length, span: ladder.length > 1 ? Number((ladder[ladder.length - 1].L - ladder[0].L).toFixed(4)) : 0, deltas, rungs: ladder },
    activeState,
    accent: {
      error: accentError,
      owners: owners.length,
      colour: accentRgb ? accentRgb.map(Math.round) : null,
      nodes: accentNodes,
      areaPx: Math.round(accentArea),
      sharePct: Number(((accentArea / (main.width * main.height)) * 100).toFixed(3)),
      tallestPx: Math.round(accentTallest),
    },
    faces,
    // 8 — controls that share a line are one height. A 30px theme group beside
    // a 36px language chip reads as carelessness instantly, and no other
    // criterion here can see it: type, surfaces, state and accent were all
    // within threshold while that pair sat misaligned.
    controls,
    media,
    columnVoids,
    headings,
    // 15 — judged text (wrapped or cut), narrowest first; the full list is
    // counted, not kept: a long page holds hundreds of wrapped paragraphs.
    textMeasure: { minEm: measureMinEm, judged: textMeasures.length, narrowest: textMeasures.slice(0, 5) },
    duplicates,
    // Gated relational criteria and what failed them; declared exceptions
    // with their reasons; pictures that could not be read.
    relational: {
      gated: [8, 9, 10, 11, 12, 14, 15, 16],
      defects: relationalDefects,
      exempted,
      mediaUnread,
      wordSplits,
      kindMix: null,
    },
    // Values the kernel could not read. Any at all makes this row a failed
    // measurement: the numbers above were taken with pieces missing.
    colorRead: k.stats(),
  };
}`;

// A selected control — the current tab, option, radio or `aria-current` item —
// answers a second click by staying selected, so an unchanged surface says
// nothing about it. In 2026-09 the Reader comp's 「요약」 tab, handler and all,
// failed every run as dead because the check pressed it while it was already
// the current tab. Only states a click does not flip count: `aria-pressed`, a
// checkbox and a switch must change when pressed, so silence there is a defect.
const SELECTED = `(el) => {
  const current = el.getAttribute('aria-current');
  if (current !== null && current !== 'false') return true;
  if (el.getAttribute('aria-selected') === 'true') return true;
  const role = el.getAttribute('role') || '';
  if ((role === 'radio' || role === 'menuitemradio') && el.getAttribute('aria-checked') === 'true') return true;
  return el.tagName === 'INPUT' && el.type === 'radio' && el.checked;
}`;


// The operability check (REFERENCE.md 「Comp fidelity conditions」 7). A comp
// whose controls are painted but dead cannot be judged: the owner clicks and
// nothing happens. Targets are every visible interactive element plus every
// `data-comp-control`, which is how a styled <span> posing as a button gets
// caught. A control that is deliberately inert carries
// `data-comp-inert="<reason>"`; the reasons come out in the report, so the
// submission list is generated rather than written by hand.
const TARGETS = `(elements) => {
  // \`aria-current\` marks the current item of a nav or a segmented choice, so
  // its siblings are the other choices even when they are painted spans.
  const SEL = 'button,a[href],input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=combobox],[role=menuitem],[role=menuitemradio],[role=option],[role=switch],[role=checkbox],[role=radio],[role=slider],[role=searchbox],[role=textbox],[data-comp-control],:has(> [aria-current]) > *';
  const visible = ${VISIBLE};
  const selected = ${SELECTED};
  const operable = (el) => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true' &&
    getComputedStyle(el).pointerEvents !== 'none';
  const found = [...document.querySelectorAll(SEL)].filter(operable);
  // A group that holds controls is judged through its controls.
  const list = found.filter((el) => !found.some((o) => o !== el && el.contains(o)));
  if (elements) return list;
  return list.map((el) => {
    const inertAt = el.closest('[data-comp-inert]');
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    const role = el.getAttribute('role') || '';
    const text = tag === 'textarea' || role === 'textbox' || role === 'searchbox' ||
      (tag === 'input' && ['', 'text', 'search', 'email', 'url', 'tel', 'number', 'password'].includes(type));
    const name = el.getAttribute('data-comp-control') || el.getAttribute('aria-label') ||
      (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 32) || el.getAttribute('placeholder') || tag;
    return { name, text, selected: selected(el), inert: inertAt ? (inertAt.getAttribute('data-comp-inert') || '').trim() : null };
  });
}`;

// The control to leave a selected target by: the first live, unselected
// target in the target's own group. The group is what the state belongs to —
// a tablist, listbox, radio group or menu, radios sharing a name, and for
// `aria-current` the nearest of three ancestors that holds another target.
const SIBLING_OF = (index) => `(() => {
  const list = (${TARGETS})(true);
  const el = list[${index}];
  if (!el) return null;
  const selected = ${SELECTED};
  const role = el.getAttribute('role') || '';
  const others = (group, same) => list.filter((m) => m !== el && group.contains(m) && !selected(m) && same(m));
  const current = el.getAttribute('aria-current');
  if (current !== null && current !== 'false') {
    let group = el.parentElement;
    for (let i = 0; group && i < 3; i += 1, group = group.parentElement) {
      const found = others(group, () => true);
      if (found.length) return found[0];
    }
    return null;
  }
  if (el.tagName === 'INPUT' && el.type === 'radio') {
    return others(el.form || document, (m) => m.tagName === 'INPUT' && m.type === 'radio' && m.name === el.name)[0] || null;
  }
  const container = { tab: '[role=tablist]', option: '[role=listbox]', radio: '[role=radiogroup]',
    menuitemradio: '[role=menu],[role=menubar],[role=group]' }[role];
  const group = container && el.closest(container);
  return group ? others(group, (m) => m.getAttribute('role') === role)[0] || null : null;
})()`;

const TARGET_AT = (index) => `(${TARGETS})(true)[${index}]`;

// The correspondence check (REFERENCE.md 「Comp fidelity conditions」 1).
// In 2026-09 G1 the comp's main search box carried the placeholder of the
// search box inside the channel dropdown: a label copied from the right file
// but from a control with a different target. The ARIA role cannot tell them
// apart — both are text boxes — so a control is keyed by what it is (kind),
// where it sits (on the surface or inside a popup) and what it says. Kind is
// coarse on purpose — text entry or anything else — because the same control
// is a `span` in a comp and an `a[role=button]` in production, and the
// channel picker a button in one and a combobox in the other.
const INVENTORY = `() => {
  const POPUP = '[role=dialog],[role=alertdialog],[role=listbox],[role=menu],[role=tooltip],[popover],[aria-modal=true]';
  const clean = (s) => (s || '').trim().replace(/\\s+/g, ' ');
  const pathOf = (el) => {
    const tags = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) tags.push(n.tagName.toLowerCase());
    return tags.reverse().join('>');
  };
  const controls = (${TARGETS})(true).map((el) => {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    const role = el.getAttribute('role') || '';
    const text = tag === 'textarea' || role === 'textbox' || role === 'searchbox' ||
      (tag === 'input' && ['', 'text', 'search', 'email', 'url', 'tel', 'number', 'password'].includes(type));
    // Each text fragment is a candidate too: production prints an avatar's
    // initials beside a channel name, so the whole text reads "AAAcademind".
    const fragments = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const piece = clean(n.nodeValue);
      if (piece.length >= 2) fragments.push(piece);
    }
    const labels = [...new Set(['aria-label', 'placeholder', 'title'].map((a) => clean(el.getAttribute(a))).concat(clean(el.textContent), fragments))].filter(Boolean);
    const fresh = el.closest('[data-comp-new]');
    return {
      kind: text ? 'text' : 'action',
      link: tag === 'a' || role === 'link',
      container: el.closest(POPUP) ? 'popup' : 'surface',
      labels,
      path: pathOf(el),
      fresh: fresh ? clean(fresh.getAttribute('data-comp-new')) : null,
    };
  });
  const dropped = [...document.querySelectorAll('[data-comp-dropped]')]
    .map((el) => ({ label: clean(el.getAttribute('data-comp-dropped')), reason: clean(el.textContent) }));
  return { controls, dropped };
}`;

const ARM = `() => {
  window.__opObserver?.disconnect();
  if (window.__opScrollListener) removeEventListener('scroll', window.__opScrollListener, true);
  window.__opChanges = 0;
  window.__opScrolled = false;
  window.__opUrl = location.href;
  const POPUP = '[role=dialog],[role=alertdialog],[role=listbox],[role=menu],[popover],[aria-modal=true]';
  const visible = ${VISIBLE};
  window.__opPopups = new WeakSet([...document.querySelectorAll(POPUP)].filter(visible));
  window.__opObserver = new MutationObserver((records) => { window.__opChanges += records.length; });
  window.__opObserver.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  window.__opScrollListener = () => { window.__opScrolled = true; window.__opChanges += 1; };
  addEventListener('scroll', window.__opScrollListener, true);
}`;

const OPERATION_STATE = `() => {
  const before = new URL(window.__opUrl);
  const POPUP = '[role=dialog],[role=alertdialog],[role=listbox],[role=menu],[popover],[aria-modal=true]';
  const visible = ${VISIBLE};
  const opened = [...document.querySelectorAll(POPUP)].some((el) => visible(el) && !window.__opPopups?.has(el));
  const pathChanged = location.pathname !== before.pathname;
  const queryChanged = location.search !== before.search;
  const hashOnly = !pathChanged && !queryChanged && location.hash !== before.hash;
  const changed = window.__opChanges === undefined || window.__opChanges > 0 || location.href !== before.href;
  const kind = pathChanged ? 'leave'
    : queryChanged ? 'setting'
    : window.__opScrolled || hashOnly ? 'in-page'
    : opened ? 'opens'
    : changed ? 'setting'
    : null;
  return { changed, kind };
}`;

// Does a popup wear the surface's world? A select, menu or popover portals to
// the end of <body>, outside the element that scopes the candidate's tokens,
// and then paints in the app's global ones: in 2026-09 the C column's sort
// menu opened in the shipped palette and font. The check reads the resolved
// values of every custom property the scope changes — where the root's value
// differs from <html>'s — at the popup's container, which is where
// inheritance is decided, so a popup that re-points a token on itself is not
// a mismatch. Token names are collected from the stylesheets, so no project's
// vocabulary is written here.
const POPUP_SCOPE = (rootSelector) => `() => {
  const ROOT_SELECTOR = ${JSON.stringify(rootSelector)};
  const POPUP = '[role=dialog],[role=alertdialog],[role=listbox],[role=menu],[role=tooltip],[popover],[aria-modal=true]';
  const visible = ${VISIBLE};
  const root = (ROOT_SELECTOR && document.querySelector(ROOT_SELECTOR)) || document.querySelector('[data-comp-world]') || document.body;
  const names = new Set();
  const walk = (rules) => {
    for (const rule of rules) {
      if (rule.style) for (const prop of rule.style) if (prop.startsWith('--')) names.add(prop);
      if (rule.cssRules) walk(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules); } catch { /* a cross-origin sheet declares no tokens of ours */ }
  }
  const at = getComputedStyle(root);
  const top = getComputedStyle(document.documentElement);
  const scoped = [...names].filter((n) => at.getPropertyValue(n).trim() !== top.getPropertyValue(n).trim());
  const out = [];
  for (const popup of document.querySelectorAll(POPUP)) {
    if (root.contains(popup) || !visible(popup)) continue;
    const home = getComputedStyle(popup.parentElement || document.body);
    const differs = scoped
      .filter((n) => home.getPropertyValue(n).trim() !== at.getPropertyValue(n).trim())
      .map((n) => ({ name: n, surface: at.getPropertyValue(n).trim(), popup: home.getPropertyValue(n).trim() }));
    if (differs.length) out.push({ popup: popup.getAttribute('aria-label') || popup.getAttribute('role') || popup.tagName.toLowerCase(), differs: differs.length, sample: differs.slice(0, 3) });
  }
  return out;
}`;
const TOKEN_VALUES = (rootSelector, body = false) => `() => {
  const ROOT_SELECTOR = ${JSON.stringify(rootSelector)};
  const root = ${body ? "document.body" : "(ROOT_SELECTOR && document.querySelector(ROOT_SELECTOR)) || document.querySelector('[data-comp-world]') || document.body"};
  const names = new Set();
  const walk = (rules) => {
    for (const rule of rules) {
      if (rule.style) for (const prop of rule.style) if (prop.startsWith('--')) names.add(prop);
      if (rule.cssRules) walk(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules); } catch { /* a cross-origin sheet declares no tokens of ours */ }
  }
  const style = getComputedStyle(root);
  return [...names].map((name) => ({ name, value: style.getPropertyValue(name).trim() }));
}`;
const KIND_LAYOUT = (rootSelector) => `(elements) => {
  const ROOT_SELECTOR = ${JSON.stringify(rootSelector)};
  const k = globalThis.__colorKernel;
  if (!k || !k.ready) {
    return {
      controls: elements.map(() => null),
      colorRead: k?.stats?.() ?? { attempted: 0, unread: 0, unreadSamples: [] },
      measurementFailed: 'colour kernel: ' + (k ? k.error : 'not installed'),
    };
  }
  k.reset();
  const root = (ROOT_SELECTOR && document.querySelector(ROOT_SELECTOR)) || document.querySelector('[data-comp-world]') || document.body;
  const reasonFor = (el) => {
    for (let node = el; node; node = node.parentElement) {
      for (const part of (node.getAttribute('data-comp-exempt') || '').split(';')) {
        const match = part.match(/^\\s*14\\s*:\\s*(\\S.*)$/);
        if (match) return match[1].trim();
      }
      if (node === root) break;
    }
    return null;
  };
  const colour = (value) => {
    const parsed = k.parse(value);
    return parsed ? [...parsed.slice(0, 3).map(Math.round), Number(parsed[3].toFixed(3))] : null;
  };
  const signatureOf = (el) => {
    const style = getComputedStyle(el);
    const border = ['Top', 'Right', 'Bottom', 'Left'].map((side) => {
      const width = parseFloat(style['border' + side + 'Width']) || 0;
      return width > 0 ? { width, colour: colour(style['border' + side + 'Color']) } : null;
    });
    return {
      height: Math.round(el.getBoundingClientRect().height),
      border,
      background: k.groundOf(el).map(Math.round),
      radius: style.borderRadius,
      weight: style.fontWeight,
      size: style.fontSize,
    };
  };
  const pathOf = (el) => {
    const parts = [];
    for (let node = el; node; node = node.parentElement) {
      let part = node.tagName.toLowerCase();
      if (node.id) part += '#' + node.id;
      else {
        let position = 1;
        for (let prev = node.previousElementSibling; prev; prev = prev.previousElementSibling) {
          if (prev.tagName === node.tagName) position += 1;
        }
        part += ':nth-of-type(' + position + ')';
      }
      parts.unshift(part);
      if (node === root) break;
    }
    return parts.join(' > ');
  };
  const displayGroup = (el) => {
    for (let node = el.parentElement; node; node = node.parentElement) {
      const display = getComputedStyle(node).display;
      if (['flex', 'inline-flex', 'grid', 'inline-grid'].includes(display)) return node;
      if (node === root) break;
    }
    return null;
  };
  const controls = elements.map((el) => {
    if (!el || !root.contains(el)) return null;
    const ancestor = displayGroup(el);
    if (!ancestor) return { group: null };
    const rect = el.getBoundingClientRect();
    return {
      group: pathOf(ancestor),
      top: rect.top,
      bottom: rect.bottom,
      signature: signatureOf(el),
      reason: reasonFor(el),
    };
  });
  return { controls, colorRead: k.stats() };
}`;

function kindMix(operated, layout) {
  const exempted = [];
  const groupsByAncestor = new Map();
  for (const item of operated) {
    const descriptor = layout.controls[item.index];
    if (!descriptor?.group) continue;
    if (descriptor.reason) {
      exempted.push({ criterion: 14, what: 'control ' + item.name, reason: descriptor.reason });
      continue;
    }
    const controls = groupsByAncestor.get(descriptor.group) ?? [];
    controls.push({ ...descriptor, name: item.name, kind: item.kind });
    groupsByAncestor.set(descriptor.group, controls);
  }
  const groups = [];
  const defects = [];
  const summaryOf = (signature) => {
    const border = signature.border.map((edge) => edge
      ? edge.width + 'px ' + (edge.colour ? 'rgba(' + edge.colour.join(', ') + ')' : 'unread')
      : 'none').join('/');
    return 'height ' + signature.height + 'px, border ' + border +
      ', background rgb(' + signature.background.join(', ') + ')' +
      ', radius ' + signature.radius + ', weight ' + signature.weight + ', size ' + signature.size;
  };
  for (const [ancestor, controls] of groupsByAncestor) {
    const rows = [];
    for (const control of controls.sort((a, b) => a.top - b.top)) {
      const row = rows.find((members) => members.some((other) => control.top < other.bottom && other.top < control.bottom));
      if (row) row.push(control);
      else rows.push([control]);
    }
    for (const row of rows) {
      if (new Set(row.map(({ kind }) => kind)).size < 2) continue;
      groups.push({
        ancestor,
        controls: row.map(({ name, kind, signature }) => ({ name, kind, signature })),
      });
      for (let i = 0; i < row.length; i += 1) {
        for (let j = i + 1; j < row.length; j += 1) {
          const a = row[i];
          const b = row[j];
          if (a.kind === b.kind || JSON.stringify(a.signature) !== JSON.stringify(b.signature)) continue;
          defects.push({
            kindA: a.kind,
            labelA: a.name,
            kindB: b.kind,
            labelB: b.name,
            signature: a.signature,
            summary: summaryOf(a.signature),
          });
        }
      }
    }
  }
  return { groups, defects, exempted, colorRead: layout.colorRead, measurementFailed: layout.measurementFailed };
}

// `collect` gathers the control inventory: what is on the surface at rest,
// plus what each live control opens in a popup, read before the reload that
// would close it. `skip` spares controls that cannot open a popup.
async function checkOperability(page, iframe, { collect = false, skip = () => false, scope = null, kindRoot = null } = {}) {
  let frame = iframe ? await iframe.contentFrame() : page.mainFrame();
  const home = frame.url();
  // A link can leave for a page that refuses to be framed; Chromium then swaps
  // the frame's process and Playwright's Frame object detaches. The <iframe>
  // element survives, so a frame is reloaded through it.
  const reload = async () => {
    if (!iframe) {
      await page.goto(home, { waitUntil: "networkidle" });
      frame = page.mainFrame();
      await waitReady(frame);
      return;
    }
    const [next] = await Promise.all([
      page.waitForEvent("framenavigated", (f) => f.url() === home),
      iframe.evaluate((el, src) => { el.src = src; }, home),
    ]);
    frame = next;
    await frame.waitForLoadState("networkidle");
    await waitReady(frame);
  };
  let targets;
  let kindLayout = null;
  if (kindRoot !== null) {
    const captured = await frame.evaluate(`(() => {
      const targets = (${TARGETS})();
      const elements = (${TARGETS})(true);
      const layout = (${KIND_LAYOUT(kindRoot)})(elements);
      return { targets, layout };
    })()`);
    targets = captured.targets;
    kindLayout = captured.layout;
  } else {
    targets = await frame.evaluate(`(${TARGETS})()`);
  }
  const report = { checked: 0, live: [], kinds: [], dead: [], unstable: [], inert: [], errors: [], reselected: [], unscopedPopups: [] };
  // A selected target that did not answer is pressed again from outside its
  // state: reload, press its sibling, then press it. true when it answered,
  // "exempt" when the sibling left the page, otherwise the reason it is dead.
  const reselect = async (index, target) => {
    await reload();
    const handle = (await frame.evaluateHandle(TARGET_AT(index))).asElement();
    if (!handle) return { verdict: "target list shifted" };
    const sibling = (await frame.evaluateHandle(SIBLING_OF(index))).asElement();
    if (!sibling) return { verdict: "selected, no sibling to leave by" };
    const via = await sibling.evaluate((el) => el.getAttribute("aria-label") ||
      (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 32) || el.tagName.toLowerCase());
    const left = await operate(frame, sibling, { text: false });
    let still;
    try {
      if (frame.isDetached() || frame.url() !== home) throw new Error("left");
      still = await handle.evaluate((el, source) => (0, eval)(source)(el), SELECTED);
    } catch {
      // The sibling is a way off this page, so the target's state cannot be
      // left without leaving the target: the current item of a nav.
      return { via, verdict: "exempt", reason: "sibling navigates away" };
    }
    if (still) return { via, verdict: `selected, and pressing ${via} did not take the selection (${left.verdict === true ? "it responded" : left.verdict})` };
    const operated = await operate(frame, handle, target);
    return {
      via,
      verdict: operated.verdict === NO_CHANGE ? `${NO_CHANGE}, even after leaving by ${via}` : operated.verdict,
      kind: operated.kind,
      replaced: operated.replaced ?? false,
    };
  };
  // One judgement of one target. A selected target that did not answer is
  // pressed again from outside its state.
  const judge = async (index, target) => {
    const handle = (await frame.evaluateHandle(TARGET_AT(index))).asElement();
    const operated = handle ? await operate(frame, handle, target) : { verdict: "target list shifted", kind: null };
    if (operated.verdict !== NO_CHANGE || !target.selected) {
      return { ...operated, outcome: operated.verdict === true ? "live" : "dead", reselected: null };
    }
    const again = await reselect(index, target);
    const outcome = again.verdict === true ? "live" : again.verdict === "exempt" ? "exempt" : "dead";
    const reselected = { name: target.name, via: again.via ?? null, verdict: outcome,
      ...(again.reason ? { reason: again.reason } : {}) };
    // A dead or exempt verdict leaves the sibling's state behind.
    if (again.verdict !== true) await reload();
    return { verdict: again.verdict, kind: again.kind ?? null, replaced: again.replaced ?? false, outcome, reselected };
  };
  const describe = (judged) => judged.outcome === "dead" ? `dead (${judged.verdict})`
    : judged.replaced ? "live (document replaced in place)" : judged.outcome;
  const inventory = collect ? await frame.evaluate(`(${INVENTORY})()`) : null;
  for (const [index, target] of targets.entries()) {
    if (skip(inventory?.controls[index])) continue;
    if (target.inert !== null) {
      if (target.inert) report.inert.push({ name: target.name, reason: target.inert });
      else report.dead.push({ name: target.name, reason: "data-comp-inert without a reason" });
      continue;
    }
    report.checked += 1;
    try {
      let judged = await judge(index, target);
      // A dead verdict, or a live one whose document was replaced where it
      // stood, can be the environment's rather than the control's: judge it
      // once more on a fresh document. Two verdicts that disagree are an
      // unstable measurement — neither a defect nor a pass (tubrief-v2 #79).
      if (judged.outcome === "dead" || judged.replaced) {
        await reload();
        const second = await judge(index, target);
        if (second.outcome !== judged.outcome) {
          report.unstable.push({ name: target.name, first: describe(judged), second: describe(second) });
          await reload();
          continue;
        }
        judged = second;
      }
      if (judged.reselected) report.reselected.push(judged.reselected);
      if (judged.outcome === "exempt") continue;
      if (judged.outcome === "live") {
        report.live.push(target.name);
        if (judged.kind) report.kinds.push({ index, name: target.name, kind: judged.kind });
        if (collect || scope !== null) {
          try {
            if (collect) {
              const after = await frame.evaluate(`(${INVENTORY})()`);
              inventory.controls.push(...after.controls.filter((c) => c.container === "popup"));
            }
            if (scope !== null) {
              for (const miss of await frame.evaluate(`(${POPUP_SCOPE(scope)})()`)) {
                report.unscopedPopups.push({ control: target.name, ...miss });
              }
            }
          } catch {
            // The control navigated away; it opened no popup here.
          }
        }
        // A popup or filter left open would decide the next target's verdict.
        await reload();
      } else {
        report.dead.push({ name: target.name, reason: judged.verdict });
      }
    } catch (error) {
      if (error instanceof NotReady) throw error;
      // The check itself broke, which says nothing about the control.
      report.errors.push({ name: target.name, error: String(error.message).split("\n")[0] });
      await reload();
    }
  }
  if (collect) report.inventory = inventory;
  if (kindLayout) report.kindMix = kindMix(report.kinds, kindLayout);
  return report;
}

const NO_CHANGE = "no DOM, URL or scroll change";

// REFERENCE.md Comp fidelity 11: `networkidle` is not "handlers attached".
const READY_MS = 30000;
class NotReady extends Error {}
async function waitReady(frame) {
  try {
    await frame.waitForFunction(() => document.documentElement.hasAttribute("data-comp-ready"), null, { timeout: READY_MS });
  } catch {
    throw new NotReady(`${frame.url()} did not declare data-comp-ready within ${READY_MS / 1000}s`);
  }
}

// true when the surface responded, otherwise the reason it is dead.
async function operate(frame, handle, target) {
  // Playwright scrolls a target just into view, which parks it under a
  // sticky header. Centre it first, before arming, so this scroll is not
  // mistaken for the control's response.
  await handle.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }));
  await frame.waitForTimeout(100);
  const startUrl = frame.url();
  await frame.evaluate(`(${ARM})()`);
  try {
    if (target.text) await handle.type("a", { timeout: 2000 });
    else await handle.click({ timeout: 2000 });
  } catch (error) {
    // Playwright puts the cause (covered, off-screen, unstable) in its call log.
    const lines = String(error.message).split("\n");
    const cause = lines.findLast((line) => /intercepts pointer|outside of the viewport|not visible|not stable|detached/.test(line));
    return { verdict: `cannot act: ${lines[0]}${cause ? ` — ${cause.trim()}` : ""}`, kind: null };
  }
  // A typed character changes `value` with or without a handler, so text
  // inputs are judged only by what the surface does in response.
  try {
    await frame.waitForTimeout(target.text ? 1500 : 600);
    const state = await frame.evaluate(`(${OPERATION_STATE})()`);
    return { verdict: state.changed ? true : NO_CHANGE, kind: state.kind };
  } catch {
    // The execution context or the frame went away; its URL tells which page it left for.
    // A document swapped in before the read lands here too: OPERATION_STATE
    // reads `__opUrl`, which only ARM's document holds. Swapped at the same
    // URL, or a frame detached, it was the control (a link to the page itself,
    // a page that refuses framing) or something else (a dev server reloading
    // the frame or its shell); one verdict cannot tell, so it is `replaced`.
    let kind = "setting";
    let replaced = false;
    try {
      const before = new URL(startUrl);
      const after = new URL(frame.url());
      if (after.pathname !== before.pathname) kind = "leave";
      else if (after.search !== before.search) kind = "setting";
      else if (after.hash !== before.hash) kind = "in-page";
      else if (frame.isDetached()) {
        kind = "leave";
        replaced = true;
      } else replaced = true;
    } catch {
      kind = "leave";
    }
    return { verdict: true, kind, replaced };
  }
}

function pairs(a, b) {
  if (a.kind !== b.kind || a.container !== b.container) return false;
  if (a.labels.length === 0 || b.labels.length === 0) return a.labels.length === b.labels.length;
  return a.labels.some((label) => b.labels.includes(label));
}

// One side's controls as units to report. A control pairs when the other side
// has one of the same kind and place saying the same thing. Five or more
// links at one place with differing labels are data — cards leading to the
// items the comp sampled and production fetched — so they become one list
// unit that pairs with any list of the same kind and place. Only links: in the
// G1 comp the subject chips, the three filters and the search box were sibling
// spans with hand-written labels, and any rule that let a varied group of
// controls count as data hid the search box inside "a list of 12".
function unitsOf(side, other) {
  const seen = new Set();
  const controls = side.controls.filter((c) => {
    // A popup is collected once per control that opens it.
    const id = `${c.kind}|${c.container}|${c.path}|${c.labels.join("\u0000")}`;
    return !seen.has(id) && seen.add(id);
  });
  const byPlace = new Map();
  for (const c of controls) {
    const key = `${c.kind}|${c.container}|${c.path}`;
    byPlace.set(key, [...(byPlace.get(key) ?? []), c]);
  }
  const units = [];
  for (const members of byPlace.values()) {
    const hits = members.filter((m) => other.controls.some((o) => pairs(m, o)));
    const varied = new Set(members.map((m) => m.labels.join("\u0000"))).size > 1;
    if (members.length >= 5 && varied && members.every((m) => m.link)) {
      const fresh = members.find((m) => m.fresh !== null)?.fresh ?? null;
      units.push({ kind: members[0].kind, container: members[0].container, list: members.length, labels: members[0].labels, fresh });
    } else {
      for (const m of members) units.push({ ...m, paired: hits.includes(m) });
    }
  }
  return units;
}

function correspond(comp, base) {
  const ours = unitsOf(comp, base);
  const theirs = unitsOf(base, comp);
  const matched = (unit, others) => unit.list
    ? others.some((o) => o.list && o.kind === unit.kind && o.container === unit.container)
    : unit.paired;
  const show = (c) => `${c.kind}/${c.container} ${c.list ? `list of ${c.list}` : JSON.stringify(c.labels[0] ?? "")}`;
  const result = { paired: 0, new: [], dropped: [], unpaired: [], missing: [] };
  // A card is often two links (thumbnail and title) to one item.
  const once = new Set();
  const first = (side, c) => !once.has(`${side}${show(c)}`) && once.add(`${side}${show(c)}`);
  for (const c of ours) {
    if (!first("comp", c)) continue;
    if (matched(c, theirs)) result.paired += 1;
    else if (c.fresh) result.new.push({ control: show(c), reason: c.fresh });
    else result.unpaired.push({ control: show(c), labels: c.labels, reason: c.fresh === "" ? "data-comp-new without a reason" : "no operating control of this kind, place and label" });
  }
  for (const b of theirs) {
    if (matched(b, ours) || !first("base", b)) continue;
    const declared = comp.dropped.find((d) => b.labels.includes(d.label));
    if (declared?.reason) result.dropped.push({ control: show(b), reason: declared.reason });
    else result.missing.push({ control: show(b), labels: b.labels, reason: declared ? "data-comp-dropped without a reason" : "operating control absent from the comp" });
  }
  return result;
}

// The operating screen is read the way the comp is, at the frame's size. Only
// its inventory is wanted: links leave the page and list members repeat one
// another, so neither is operated.
const baselineCache = new Map();
async function baselinePage(browser, url, width, heightPx) {
  const key = `${url}@${width}x${heightPx}`;
  if (!baselineCache.has(key)) {
    const page = await browser.newPage({ viewport: { width, height: heightPx } });
    await page.goto(url, { waitUntil: "networkidle" });
    await waitReady(page.mainFrame());
    baselineCache.set(key, { page, inventory: null, tokens: null });
  }
  return baselineCache.get(key);
}

async function baselineInventory(browser, url, width, heightPx) {
  const entry = await baselinePage(browser, url, width, heightPx);
  if (!entry.inventory) {
    const rest = await entry.page.evaluate(`(${INVENTORY})()`);
    const counts = new Map();
    for (const c of rest.controls) counts.set(c.path, (counts.get(c.path) ?? 0) + 1);
    const report = await checkOperability(entry.page, null, {
      collect: true,
      skip: (c) => !c || counts.get(c.path) >= 5 || /(^|>)a$/.test(c.path),
    });
    entry.inventory = report.inventory;
  }
  return entry.inventory;
}

async function baselineTokens(browser, url, width, heightPx) {
  const entry = await baselinePage(browser, url, width, heightPx);
  if (!entry.tokens) entry.tokens = await entry.page.evaluate(`(${TOKEN_VALUES("", true)})()`);
  return entry.tokens;
}

// The measured surface is named by its commit. JSON outputs already carrying
// that commit are measurements of the same tree, not source changes.
function provenance() {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  try {
    const commit = git("rev-parse", "HEAD");
    const root = git("rev-parse", "--show-toplevel");
    const status = execFileSync(
      "git",
      ["-C", root, "status", "--porcelain=v1", "--untracked-files=all", "-z"],
      { encoding: "utf8" },
    );
    const records = status.split("\0");
    const paths = [];
    for (let i = 0; i < records.length; i += 1) {
      const record = records[i];
      if (!record) continue;
      const state = record.slice(0, 2);
      paths.push(record.slice(3));
      if (state.includes("R") || state.includes("C")) paths.push(records[++i]);
    }
    const ignored = [];
    const dirtyPaths = [];
    for (const file of paths) {
      let output;
      if (path.extname(file) === ".json") {
        try {
          output = JSON.parse(readFileSync(path.resolve(root, file), "utf8"));
        } catch {
          output = null;
        }
      }
      if (output?._provenance?.commit === commit) ignored.push(file);
      else dirtyPaths.push(file);
    }
    return { commit, dirty: dirtyPaths.length > 0, ignored };
  } catch {
    return { commit: null, dirty: null, ignored: [] };
  }
}

// One document, resized through the sweep's widths. A frame URL is opened on
// its own: the sweep asks how the layout behaves at a width, which the shell
// cannot show, and controls are not operated here — the device run operates
// them. A defect is reported once with every width it appeared at, the
// digits of its message set aside so 26px and 90px of one title are one line.
async function sweepWidths(browser, url) {
  const page = await browser.newPage({ viewport: { width: sweep.widths[0], height: SWEEP_HEIGHT } });
  const pageErrors = new Set();
  page.on("pageerror", (error) => pageErrors.add(String(error.message).split("\n")[0]));
  await page.goto(url, { waitUntil: "networkidle" });
  await waitReady(page.mainFrame());
  await page.evaluate(COLOR_KERNEL);
  const found = new Map();
  const unread = [];
  const exempted = new Map();
  let narrowest = null;
  for (const width of sweep.widths) {
    await page.setViewportSize({ width, height: SWEEP_HEIGHT });
    await page.evaluate(() => document.fonts.ready.then(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))));
    const r = await page.evaluate(`(${MEASURE(rootSelector)})()`);
    if (r.measurementFailed || r.colorRead.unread > 0) { unread.push(width); continue; }
    for (const defect of r.relational.defects) {
      const signature = defect.replace(/\d+(\.\d+)?/g, "#");
      if (!found.has(signature)) found.set(signature, { defect, widths: [] });
      found.get(signature).widths.push(width);
    }
    for (const e of r.relational.exempted) exempted.set(`${e.criterion} ${e.what}`, e);
    const [first] = r.textMeasure.narrowest;
    if (first && (!narrowest || first.em < narrowest.em)) narrowest = { width, ...first };
  }
  await page.close();
  const spans = (widths) => {
    const out = [];
    for (const w of widths) {
      const last = out[out.length - 1];
      if (last && w - last[1] <= sweep.step) last[1] = w;
      else out.push([w, w]);
    }
    return out.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(",");
  };
  return {
    url,
    widths: `${sweep.from}-${sweep.to}:${sweep.step}`,
    height: SWEEP_HEIGHT,
    defects: [...found.values()].map(({ defect, widths }) => ({ defect, widths: spans(widths) })),
    exempted: [...exempted.values()],
    narrowest,
    unread: unread.length ? spans(unread) : null,
    pageErrors: [...pageErrors],
  };
}

async function main() {
  const origin = provenance();
  const browser = await chromium.launch();
  const out = { _provenance: origin };
  const failed = [];
  // Errors are collected across the whole page and its frames, and a module
  // that failed to load leaves every handler dead. Also closed out when a
  // document that never declared ready stops the run midway.
  let open = null;
  const closePage = () => {
    for (const key of open.pageKeys) out[key].operability.pageErrors = [...open.pageErrors];
    for (const error of open.pageErrors) failed.push(`${open.label}: page error ${error}`);
    open = null;
  };
  try {
    for (const [index, url] of urls.entries()) {
      const label = labels[index] ?? url;
      const page = await browser.newPage({ viewport: { width: viewport, height } });
      // A Set: the frame reloads after every live control and repeats its errors.
      const pageErrors = new Set();
      page.on("pageerror", (error) => pageErrors.add(String(error.message).split("\n")[0]));
      const pageKeys = [];
      open = { label, pageErrors, pageKeys };
      await page.goto(url, { waitUntil: "networkidle" });
      await waitReady(page.mainFrame());
      // The URL the owner opens. A preview shell holds the surface in frames,
      // and a frame is measured as the device it is sized to be.
      const children = page.mainFrame().childFrames();
      for (const child of children) await waitReady(child);
      const iframes = children.length > 0 ? await Promise.all(children.map((f) => f.frameElement())) : [null];
      // Fit check, before any control moves the shell's scroll or reloads a frame.
      const win = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      const fits = [];
      for (const iframe of iframes) {
        const frame = iframe ? await iframe.contentFrame() : page.mainFrame();
        const [w, h] = await frame.evaluate(() => [innerWidth, innerHeight]);
        const device = `${w}x${h}`;
        // Half a pixel of slack for the rounding a scale transform leaves.
        const box = iframe ? await iframe.boundingBox() : null;
        const inWindow = !box || (box.x >= -0.5 && box.y >= -0.5 && box.x + box.width <= win.width + 0.5 && box.y + box.height <= win.height + 0.5);
        fits.push({
          device,
          isDevice: devices.includes(device),
          window: `${win.width}x${win.height}`,
          box: box && { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
          inWindow,
        });
      }
      for (const [frameIndex, iframe] of iframes.entries()) {
        let frame = iframe ? await iframe.contentFrame() : page.mainFrame();
        const title = iframe ? await iframe.getAttribute("title") : null;
        const key = title ? `${label} / ${title}` : iframe ? `${label} / ${frame.url()}` : label;
        const frameUrl = frame.url();
        await frame.evaluate(() => document.fonts.ready);
        await frame.evaluate(COLOR_KERNEL);
        const result = await frame.evaluate(`(${MEASURE(rootSelector)})()`);
        const compTokens = shippedWorld
          ? await frame.evaluate(`(${TOKEN_VALUES(rootSelector)})()`)
          : null;
        result.fit = fits[frameIndex];
        if (!result.fit.isDevice) failed.push(`${key}: surface is ${result.fit.device}, not a device pair (${devices.join(", ")})`);
        if (!result.fit.inWindow) failed.push(`${key}: frame ${result.fit.box.width}x${result.fit.box.height} at (${result.fit.box.x},${result.fit.box.y}) runs past the ${result.fit.window} window`);
        result.operability = await checkOperability(page, iframe, { collect: true, scope: rootSelector, kindRoot: rootSelector });
        frame = iframe ? await iframe.contentFrame() : page.mainFrame();
        const kindMix = result.operability.kindMix;
        delete result.operability.kindMix;
        result.relational ??= { gated: [14], defects: [], exempted: [], mediaUnread: 0 };
        result.relational.kindMix = { groups: kindMix.groups, defects: kindMix.defects };
        result.relational.exempted.push(...kindMix.exempted);
        for (const defect of kindMix.defects) {
          result.relational.defects.push(`criterion 14: ${defect.kindA} "${defect.labelA}" and ${defect.kindB} "${defect.labelB}" look the same in one group (${defect.summary})`);
        }
        if (kindMix.measurementFailed) result.measurementFailed ??= kindMix.measurementFailed;
        if (result.colorRead) {
          result.colorRead.attempted += kindMix.colorRead.attempted;
          result.colorRead.unread += kindMix.colorRead.unread;
          result.colorRead.unreadSamples.push(...kindMix.colorRead.unreadSamples);
        } else {
          result.colorRead = kindMix.colorRead;
        }
        const { inventory } = result.operability;
        delete result.operability.inventory;
        result.tokens = null;
        if (baselines[index]) {
          const [w, h] = await frame.evaluate(() => [innerWidth, innerHeight]);
          const base = await baselineInventory(browser, baselines[index], w, h);
          result.correspondence = { baseline: baselines[index], ...correspond(inventory, base) };
          for (const u of result.correspondence.unpaired) failed.push(`${key}: unpaired control ${u.control} (${u.reason})`);
          for (const m of result.correspondence.missing) failed.push(`${key}: missing control ${m.control} (${m.reason})`);
          if (shippedWorld) {
            const operatingTokens = await baselineTokens(browser, baselines[index], w, h);
            const comp = new Map(compTokens.map(({ name, value }) => [name, value]));
            const operating = new Map(operatingTokens.map(({ name, value }) => [name, value]));
            const names = new Set([...comp.keys(), ...operating.keys()]);
            const drift = [];
            let compared = 0;
            for (const name of names) {
              const baseline = operating.get(name) ?? "";
              if (!baseline) continue;
              compared += 1;
              const value = comp.get(name) ?? "";
              if (value !== baseline) drift.push({ name, comp: value, baseline });
            }
            result.tokens = { baseline: baselines[index], compared, drift };
            if (drift.length) {
              const cut = (value) => value.replace(/\s+/g, " ").slice(0, 80);
              const samples = drift.slice(0, 3).map(({ name, comp: value, baseline }) =>
                `token ${name} differs from the operating screen (comp ${cut(value)} → operating ${cut(baseline)})`);
              const more = drift.length > samples.length ? `; and ${drift.length - samples.length} more` : "";
              failed.push(`${key}: ${drift.length} operating-screen token${drift.length === 1 ? "" : "s"} differ${drift.length === 1 ? "s" : ""}: ${samples.join("; ")}${more}`);
            }
          }
        } else {
          result.correspondence = { baseline: null, note: "not checked: pass --baseline to pair the comp's controls and labels with the operating screen" };
        }
        result.sweep = sweep ? await sweepWidths(browser, frameUrl) : null;
        out[key] = result;
        pageKeys.push(key);
        console.log(key, JSON.stringify(result));
        if (result.measurementFailed || result.colorRead.unread > 0) failed.push(`${key}: unread colour values or no kernel`);
        for (const dead of result.operability.dead) failed.push(`${key}: dead control ${dead.name} (${dead.reason})`);
        for (const u of result.operability.unstable) failed.push(`${key}: unstable control ${u.name} (${u.first}, then ${u.second}) — the environment changed under the check; measure again`);
        for (const broke of result.operability.errors) failed.push(`${key}: check error on ${broke.name} (${broke.error})`);
        if (result.accent?.error) failed.push(`${key}: ${result.accent.error}`);
        for (const defect of result.relational?.defects ?? []) failed.push(`${key}: ${defect}`);
        for (const p of result.operability.unscopedPopups) {
          const cut = (v) => v.replace(/\s+/g, " ").slice(0, 40);
          const [first] = p.sample;
          failed.push(`${key}: popup "${p.popup}" opened by ${p.control} is outside the surface's token scope (${p.differs} tokens differ, e.g. ${first.name} ${cut(first.surface)} → ${cut(first.popup)})`);
        }
        if (result.sweep) {
          for (const d of result.sweep.defects) failed.push(`${key}: at ${d.widths}px (sweep): ${d.defect}`);
          if (result.sweep.unread) failed.push(`${key}: sweep read no colour or no kernel at ${result.sweep.unread}px`);
          for (const error of result.sweep.pageErrors) failed.push(`${key}: sweep page error ${error}`);
        }
      }
      closePage();
      await page.close();
    }
  } catch (error) {
    if (!(error instanceof NotReady)) throw error;
    if (open) closePage();
    failed.push(`not measured from here on: ${error.message}`);
  } finally {
    await browser.close();
  }
  if (!origin.commit) failed.push("provenance: not a git work tree");
  else if (origin.dirty) failed.push(`provenance: uncommitted changes at ${origin.commit.slice(0, 7)}; commit, then measure`);
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(out, null, 2));
  console.log(`wrote ${outFile} at ${origin.commit}${origin.dirty ? " (dirty)" : ""}`);
  if (failed.length) {
    console.error(`measurement failed:\n  ${failed.join("\n  ")}`);
    process.exitCode = 1;
  }
}

main();
