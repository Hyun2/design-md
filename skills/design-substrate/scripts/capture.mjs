/**
 * Capture and measure one side of the substrate non-regression gate
 * (`design-substrate` STEP 1 = `before`, STEP 5 = `after`).
 *
 *   PORT=4101 node ~/.agents/skills/design-substrate/scripts/capture.mjs --config <file> --mode before
 *   PORT=4101 node ~/.agents/skills/design-substrate/scripts/capture.mjs --config <file> --mode after
 *     [--lang <l>] [--base <url>] [--out <dir>] [--only <row-id,...>]
 *
 * Run it from the project root. The project's config (`capture` in its default
 * export; fields in SKILL.md STEP 7) supplies the manifest — rows, themes,
 * viewports, containers, smoke flows — and how to reach each row. Both modes
 * read that one manifest, so the two runs are the same rows by construction
 * and the only variable left is the code under them.
 *
 * Every number comes off the render, never off a token declaration: the
 * declared value and the composited value diverge exactly where the defects
 * live (an alpha fill over an unexpected ground, a face that fell back, a token
 * re-pointed downstream). Lightness is OKLCH L on the 0-1 axis.
 *
 * States are forced through CDP `CSS.forcePseudoState` rather than by adding a
 * class, because a hand-added class measures what the script wrote, not what
 * the primitive does.
 *
 * Exit 1 when any row failed to measure (unread colour values, no kernel), when
 * gate 4b fails (a state target whose focus paints no new layer ≥ 3:1 thicker
 * than 0), or when a hover gate fails outside the config's deferred list
 * (4a-hover: hover changes no layer; 2-hover: hover lowers text under its
 * requirement and under idle). Playwright is resolved from the calling
 * project, so no install lives here.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

/* Colour is read by the protocol's kernel, not here: one reader for every
 * design measurement, so the substrate gate and the comp gate cannot disagree
 * about what a pixel is. See `color-kernel.mjs` for why it rasterises on a
 * float16 canvas instead of converting colour spaces by hand. */
import { COLOR_KERNEL } from "./color-kernel.mjs";
import { flag, loadConfig } from "./config.mjs";

const require = createRequire(path.join(process.cwd(), "package.json"));
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("@playwright/test"));
}

const { config, adapter } = await loadConfig();
const capture = config.capture;
const mode = flag("mode") ?? "before";
const lang = flag("lang") ?? capture.lang;
const base = flag("base") ?? capture.base;
const outRoot = flag("out") ?? capture.out;
const only = flag("only") ?? "";
const shotDir = path.join(outRoot, mode === "before" ? "baseline" : "after");
/* Criterion 4 targets: the adapter's primitives unless the project names its own. */
const STATE_TARGETS = capture.stateTargets ?? adapter.STATE_TARGETS;

/* ------------------------------------------------------------------ *
 * In-page measurement. Serialised as one function, so it must be self
 * contained; Playwright evaluates it in the page realm.
 * ------------------------------------------------------------------ */
const PAGE_MEASURE = ({ container: containerSelector, scroller: scrollerSelector }) => {
  /* Page-realm global installed by the init script before any document script ran. */
  const k = globalThis.__colorKernel;
  if (!k || !k.ready) {
    return {
      measurementFailed: `colour kernel: ${k ? k.error : "not installed"}`,
    };
  }
  k.reset();
  const parse = k.parse;
  const okL = k.okL;
  const over = k.over;
  const groundOf = k.groundOf;
  const contrast = k.contrast;
  const rgbKey = (c) => c.slice(0, 3).map(Math.round).join(",");

  const describe = (el) => {
    const slot = el.getAttribute("data-slot");
    const cls = (
      el.className && typeof el.className === "string" ? el.className : ""
    )
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .join(".");
    return `${el.tagName.toLowerCase()}${slot ? `[${slot}]` : ""}${cls ? `.${cls}` : ""}`;
  };

  /* --- criterion 2: text contrast ------------------------------------ */
  const container = document.querySelector(containerSelector) ?? document.body;
  const textPairs = [];
  const seen = new Set();
  for (const el of Array.from(container.querySelectorAll("*"))) {
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? "")
      .join("")
      .trim();
    if (own.length === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.opacity === "0") continue;
    const fg = parse(style.color);
    if (!fg) continue;
    const ground = groundOf(el);
    const composited = over(fg, ground);
    const size = parseFloat(style.fontSize);
    const weight = Number(style.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const ratio = contrast(composited, ground);
    const key = `${describe(el)}|${style.color}|${rgbKey(ground)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    textPairs.push({
      node: describe(el),
      ratio: Number(ratio.toFixed(2)),
      required: large ? 3 : 4.5,
      size,
      weight,
      text: own.slice(0, 40),
    });
  }

  /* --- criterion 3: layout preservation ------------------------------ */
  const box = (
    document.querySelector(containerSelector) ?? document.body
  ).getBoundingClientRect();
  const docWidth = document.documentElement.clientWidth;
  const scroller =
    (scrollerSelector && document.querySelector(scrollerSelector)) ?? document.documentElement;
  const overflowing = [];
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= docWidth + 1 && r.left >= -1) continue;
    const style = getComputedStyle(el);
    if (style.position === "fixed" || style.visibility === "hidden") continue;
    /* A child of a deliberate horizontal scroller (the subject tab strip, a
     * carousel) is not a layout break: the reader can reach it. Only content
     * that escapes the document counts. */
    let clipped = false;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const ax = getComputedStyle(a).overflowX;
      if (ax === "auto" || ax === "scroll" || ax === "hidden") {
        clipped = true;
        break;
      }
    }
    if (clipped) continue;
    overflowing.push(describe(el));
    if (overflowing.length >= 20) break;
  }

  /* --- surface ladder: the rungs actually painted --------------------- */
  const areaByGround = new Map();
  for (const el of [
    container,
    ...Array.from(container.querySelectorAll("*")),
  ]) {
    const style = getComputedStyle(el);
    const bg = parse(style.backgroundColor);
    if (!bg || bg[3] < 0.999) continue;
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    if (area < 4000) continue;
    const key = rgbKey(bg);
    const prev = areaByGround.get(key);
    const L = Number(okL(bg).toFixed(4));
    if (prev) prev.area += area;
    else areaByGround.set(key, { area, L });
  }

  /* --- type ramp ------------------------------------------------------ */
  const sizeChars = new Map();
  let maxSize = 0;
  for (const el of Array.from(container.querySelectorAll("*"))) {
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? "")
      .join("")
      .trim();
    if (own.length === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const size = Math.round(parseFloat(getComputedStyle(el).fontSize));
    sizeChars.set(size, (sizeChars.get(size) ?? 0) + own.length);
    if (size > maxSize) maxSize = size;
  }

  /* --- rendered corner family and accent area ------------------------ *
   * Criterion 4 of the composite measurement, but taken here because the
   * baseline has to hold the before value: the world declares one radius plus
   * the play control's circle, and only the render says how many the product
   * actually paints. */
  const radii = {};
  let accentArea = 0;
  let accentMaxHeight = 0;
  const signalHues = {};
  for (const el of Array.from(container.querySelectorAll("*"))) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const style = getComputedStyle(el);
    /* Tailwind's `rounded-full` computes to `calc(infinity * 1px)`, which
     * Chrome reports as 33554432px. Reporting that as a distinct radius buries
     * the one number the corner-family criterion is about. */
    const rawRadius = parseFloat(style.borderTopLeftRadius);
    const radius = Number.isNaN(rawRadius)
      ? null
      : rawRadius > 1000
        ? "full"
        : `${Math.round(rawRadius)}px`;
    if (radius && radius !== "0px") radii[radius] = (radii[radius] ?? 0) + 1;
    /* An accent region is a filled surface whose chroma separates it from the
     * neutral ladder; the ladder itself holds chroma <= 0.008. */
    const bg = parse(style.backgroundColor);
    if (!bg || bg[3] < 0.2) continue;
    const ground = groundOf(el.parentElement ?? el);
    const painted = over(bg, ground);
    const [pr, pg, pb] = painted;
    const chromaProxy = (Math.max(pr, pg, pb) - Math.min(pr, pg, pb)) / 255;
    if (chromaProxy < 0.06) continue;
    accentArea += r.width * r.height;
    if (r.height > accentMaxHeight) accentMaxHeight = r.height;
    const key = rgbKey(painted);
    signalHues[key] = (signalHues[key] ?? 0) + Math.round(r.width * r.height);
  }

  return {
    contrast: {
      pairs: textPairs.length,
      failures: textPairs
        .filter((p) => p.ratio < p.required)
        .sort((a, b) => a.ratio - b.ratio)
        .slice(0, 25),
      min: textPairs.length ? Math.min(...textPairs.map((p) => p.ratio)) : null,
    },
    layout: {
      container: containerSelector,
      width: Number(box.width.toFixed(1)),
      height: Number(box.height.toFixed(1)),
      documentHeight: Math.round(
        Math.max(scroller.scrollHeight, document.body.scrollHeight),
      ),
      horizontalOverflow: overflowing.length,
      overflowNodes: overflowing.slice(0, 8),
    },
    ladder: [...areaByGround.values()]
      .sort((a, b) => a.L - b.L)
      .map((r) => ({ L: r.L, area: Math.round(r.area) })),
    corners: {
      distinct: Object.keys(radii).length,
      values: Object.fromEntries(
        Object.entries(radii).sort((a, b) => b[1] - a[1]),
      ),
    },
    accent: {
      area: Math.round(accentArea),
      ratioOfContainer: Number(
        (accentArea / Math.max(1, box.width * box.height)).toFixed(5),
      ),
      maxHeight: Math.round(accentMaxHeight),
      fills: Object.entries(signalHues)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    },
    type: {
      max: maxSize,
      dominantBody:
        [...sizeChars.entries()].sort((a, b) => b[1] - a[1])[0] ?? null,
      ratioToModal: (() => {
        const modal = [...sizeChars.entries()].sort((a, b) => b[1] - a[1])[0];
        return modal ? Number((maxSize / modal[0]).toFixed(2)) : null;
      })(),
    },
    /* Values the kernel could not read. Any at all makes the row a failed
     * measurement rather than a pass with pieces missing. */
    colorRead: k.stats(),
  };
};

/* ------------------------------------------------------------------ *
 * criterion 4: state separation, forced through CDP.
 * ------------------------------------------------------------------ */

/* A hover sample is a control a reader can act on. Interactivity is asked of
 * the element itself, through HTML and ARIA: a static card or a span badge
 * has no reason to answer hover (2026-09 TuBrief: 8 of 49 misses). */
const INTERACTIVE = [
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "summary",
  ...["button", "link", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "checkbox", "radio", "switch", "combobox", "textbox", "slider"].map(
    (role) => `[role='${role}']`,
  ),
  "[tabindex]:not([tabindex^='-'])",
  "[contenteditable='']",
  "[contenteditable='true']",
].join(", ");
const DISABLED = ":disabled, [aria-disabled='true'], [data-disabled]";
/* Current: a second press changes nothing, so hover has nothing to offer
 * (the selected tab measured ΔL 0 while its siblings moved text ΔL 0.21).
 * The same definition as the operability check's selected control. A pressed
 * toggle turns off on the next press, so it stays a hover sample. */
const CURRENT = [
  "[aria-selected='true']",
  "[aria-current]:not([aria-current='false'])",
  "input[type='radio']:checked",
  "[role='radio'][aria-checked='true']",
  adapter.CURRENT_STATE,
]
  .filter(Boolean)
  .join(", ");
const SELECTED = [CURRENT, "[aria-pressed='true']", "[aria-checked='true']", "input:checked", adapter.PRESSED_STATE]
  .filter(Boolean)
  .join(", ");

/* Gate 4a hover: hover changes at least one layer — the surface, the text, or
 * an underline appears. A link variant (`hover:underline`) or a tab that moves
 * only its text colour changes no surface and is not a miss. */
const HOVER_DELTA = 0.06;

async function measureStates(page) {
  const client = await page.context().newCDPSession(page);
  await client.send("DOM.enable");
  await client.send("CSS.enable");
  const { root } = await client.send("DOM.getDocument", {
    depth: -1,
    pierce: true,
  });

  /* Reads one instance in whatever state is forced on it. `idleLayers`, when
   * given, turns the read into a focus read: a shadcn focus state is a ring,
   * not a fill, so it is measured as the layer focus adds or changes against
   * idle (`focusIndicator` in the kernel) — never as the strongest colour the
   * element carries, which an unpainted outline or a border supplies in idle
   * too. */
  const readGround = async (selector, index, idleLayers = null) =>
    page.evaluate(
      ([sel, i, idleLayers]) => {
        const el = document.querySelectorAll(sel)[i];
        if (!el) return null;
        /* A forced state starts a CSS transition (shadcn primitives carry
         * `transition-[color,box-shadow]`); read the end state, not frame 0. */
        for (const animation of el.getAnimations()) {
          try {
            animation.finish();
          } catch {
            /* an infinite animation has no end state to jump to */
          }
        }
        /* Page-realm global installed by the init script. */
        const k = globalThis.__colorKernel;
        const style = getComputedStyle(el);
        const fg = k.parse(style.color);
        const ground = k.groundOf(el);
        const painted = fg ? k.over(fg, ground) : null;
        const size = parseFloat(style.fontSize);
        const weight = Number(style.fontWeight) || 400;
        const hasText = (el.textContent ?? "").trim().length > 0;
        return {
          L: Number(k.okL(ground).toFixed(4)),
          textL: painted ? Number(k.okL(painted).toFixed(4)) : null,
          /* Criterion 2 in this state: the element's own text colour over the
           * ground this state paints. */
          textContrast: painted && hasText ? Number(k.contrast(painted, ground).toFixed(2)) : null,
          textRequired: size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5,
          underline: style.textDecorationLine.includes("underline"),
          fill: style.backgroundColor,
          layers: k.paintedLayers(el),
          indicator: idleLayers ? k.focusIndicator(el, idleLayers) : null,
        };
      },
      [selector, index, idleLayers],
    );

  const forceRead = async (nodeId, selector, index, classes, idleLayers = null) => {
    await client.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: classes });
    const read = await readGround(selector, index, idleLayers);
    await client.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
    return read;
  };

  /* A "type" smoke flow leaves real focus in the input it filled, so its idle
   * read would already carry the focus ring and focus would add nothing. */
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    globalThis.__colorKernel.reset();
  });
  const out = {};
  for (const [slot, selector] of Object.entries(STATE_TARGETS)) {
    const count = await page.locator(selector).count();
    if (count === 0) continue;

    /* The first match is whatever the DOM happened to put first — often an
     * offscreen trigger. The largest visible instance is the control a reader
     * actually sees, so criterion 4 is measured there: focus on the largest
     * visible instance, hover on the largest one a reader can act on and that
     * hover can still change (interactive, not current, not disabled). */
    const target = await page.evaluate(
      ([sel, interactive, disabled, current]) => {
        const largest = (accept) => {
          let best = -1;
          let bestArea = 0;
          let eligible = 0;
          document.querySelectorAll(sel).forEach((el, i) => {
            const r = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            if (style.visibility === "hidden" || style.display === "none") return;
            if (!accept(el)) return;
            const area = r.width * r.height;
            if (area < 100) return;
            eligible += 1;
            if (area > bestArea) {
              bestArea = area;
              best = i;
            }
          });
          return { index: best, area: Math.round(bestArea), eligible };
        };
        return {
          focus: largest(() => true),
          hover: largest((el) => !el.matches(disabled) && !el.matches(current)),
        };
      },
      [selector, INTERACTIVE, DISABLED, CURRENT],
    );
    if (target.focus.index < 0) continue;

    const { nodeIds } = await client.send("DOM.querySelectorAll", {
      nodeId: root.nodeId,
      selector,
    });
    const nodeId = nodeIds[target.focus.index];
    if (!nodeId) continue;

    const idle = await readGround(selector, target.focus.index);
    if (!idle) continue;

    /* `:focus-visible` rules in this library are written beside `:focus`
     * selectors, so forcing the visible half alone leaves half the declaration
     * block unmatched. Both are forced together, the way a keyboard user
     * produces them. */
    const focused = await forceRead(nodeId, selector, target.focus.index, ["focus", "focus-visible"], idle.layers);
    const focusIndicator = focused?.indicator ?? null;

    let hover = { sampledIndex: null, eligible: 0 };
    const hoverNode = target.hover.index >= 0 ? nodeIds[target.hover.index] : null;
    if (hoverNode) {
      const before = await readGround(selector, target.hover.index);
      const after = await forceRead(hoverNode, selector, target.hover.index, ["hover"]);
      if (before && after) {
        const surfaceDelta = Number(Math.abs(after.L - before.L).toFixed(4));
        const textDelta =
          before.textL != null && after.textL != null ? Number(Math.abs(after.textL - before.textL).toFixed(4)) : null;
        const underline = !before.underline && after.underline;
        /* Hover may not take the text below the line idle held: fail when
         * hover is under the requirement and under idle, so a pair idle
         * already fails stays criterion 2's, counted once. */
        const text =
          before.textContrast != null && after.textContrast != null
            ? {
                idle: before.textContrast,
                hover: after.textContrast,
                required: after.textRequired,
                pass: !(after.textContrast < after.textRequired && after.textContrast < before.textContrast),
              }
            : null;
        hover = {
          sampledIndex: target.hover.index,
          sampledArea: target.hover.area,
          eligible: target.hover.eligible,
          idleFill: before.fill,
          hoverFill: after.fill,
          surfaceDelta,
          textDelta,
          underline,
          pass: surfaceDelta >= HOVER_DELTA || (textDelta ?? 0) >= HOVER_DELTA || underline,
          text,
        };
      }
    }

    const indexOf = (predicate) =>
      page.evaluate(
        ([sel, predicate]) => Array.from(document.querySelectorAll(sel)).findIndex((el) => el.matches(predicate)),
        [selector, predicate],
      );
    const disabledIdx = await indexOf(DISABLED);
    const selectedIdx = await indexOf(SELECTED);
    const disabled = disabledIdx >= 0 ? await readGround(selector, disabledIdx) : null;
    const selected = selectedIdx >= 0 ? await readGround(selector, selectedIdx) : null;

    out[slot] = {
      count,
      sampledIndex: target.focus.index,
      sampledArea: target.focus.area,
      idleL: idle.L,
      idleTextL: idle.textL,
      idleFill: idle.fill,
      hover,
      focusL: focused?.L ?? null,
      focusDelta: focused?.L != null ? Number(Math.abs(focused.L - idle.L).toFixed(4)) : null,
      /* Gate 4b: focus paints a layer idle does not, ≥ 3:1 against its
       * adjacent ground, thicker than 0. null indicator = focus paints
       * nothing new. */
      focusIndicator,
      focusPass: focusIndicator != null && focusIndicator.thickness > 0 && focusIndicator.contrast >= 3,
      disabledL: disabled?.L ?? null,
      disabledTextDelta:
        disabled?.textL != null && idle.textL != null ? Number(Math.abs(disabled.textL - idle.textL).toFixed(4)) : null,
      selectedL: selected?.L ?? null,
      selectedDelta: selected?.L != null ? Number(Math.abs(selected.L - idle.L).toFixed(4)) : null,
    };
  }
  out.colorRead = await page.evaluate(() => {
    return globalThis.__colorKernel.stats();
  });
  await client.detach();
  return out;
}

/* ------------------------------------------------------------------ */

async function runSmoke(page, row) {
  const { action, expect } = row.smoke;
  try {
    if (action.kind === "click") {
      const target = page.locator(action.selector).first();
      if ((await target.count()) === 0)
        return { ok: false, reason: "action target missing" };
      await target.click({ timeout: 5000 });
    } else if (action.kind === "type") {
      const target = page.locator(action.selector).first();
      if ((await target.count()) === 0)
        return { ok: false, reason: "action target missing" };
      await target.fill(action.text, { timeout: 5000 });
      const value = await target.inputValue();
      if (value !== action.text)
        return { ok: false, reason: `value was ${value}` };
    }
    await page
      .locator(expect)
      .first()
      .waitFor({ state: "attached", timeout: 5000 });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message.split("\n")[0] };
  }
}

async function main() {
  const setup = await capture.setup();

  await mkdir(shotDir, { recursive: true });
  const browser = await chromium.launch();
  const rows = only ? capture.rows.filter((r) => only.split(",").includes(r.id)) : capture.rows;
  const results = {};
  const consoleErrors = {};
  const failedRows = [];
  /* Gate 4b rows: a target whose focus paints no new layer ≥ 3:1 and > 0 thick. */
  const focusFailures = [];
  /* Hover gates: 4a (hover changes no layer) and 2 under hover (hover takes
   * the text under its requirement and under idle). A miss an owner carried
   * forward is matched by a `capture` entry of the config's deferred list,
   * printed every run and left out of the exit code. */
  const hoverFailures = [];
  const carried = (config.detect?.deferred ?? []).map((entry) => ({ entry, hits: [] }));
  const hoverMiss = (row, theme, slot, check, line) => {
    const match = carried.find(({ entry }) =>
      (entry.capture ?? []).some(
        (m) => m.row === row.id && m.target === slot && m.check === check && (m.theme == null || m.theme === theme),
      ),
    );
    if (match) match.hits.push(line);
    else hoverFailures.push(line);
  };
  /* Rows share a browser context per session (anonymous, signed in, …), so a
   * session's storage state is loaded once per viewport × theme. */
  const sessions = [...new Set(rows.map((r) => capture.session(r)))];

  for (const viewport of capture.viewports) {
    for (const theme of capture.themes) {
      for (const session of sessions) {
        const scoped = rows.filter((r) => capture.session(r) === session);
        const storageState = capture.storageState(session, setup);
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          ...(storageState ? { storageState } : {}),
        });
        await context.addInitScript({ content: COLOR_KERNEL });
        const page = await context.newPage();
        for (const row of scoped) {
          const key = `${row.id}__${theme}__${viewport.name}`;
          const errors = [];
          page.on("console", (m) => {
            if (m.type() === "error") errors.push(m.text().slice(0, 200));
          });
          const url = capture.url(row, { base, lang, theme }, setup);
          try {
            await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
          } catch {
            try {
              await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
            } catch (error) {
              results[key] = { blocker: error.message.split("\n")[0], url };
              continue;
            }
          }
          await page.waitForTimeout(700);
          const finalUrl = page.url();
          const measured = await page.evaluate(PAGE_MEASURE, {
            container: row.container,
            scroller: capture.scroller ?? null,
          });
          const smoke = await runSmoke(page, row);
          const states =
            viewport.name === capture.statesAt
              ? await measureStates(page)
              : `measured at ${capture.statesAt} only`;
          await page.screenshot({ path: path.join(shotDir, `${key}.png`), fullPage: false });
          const stateRead = typeof states === "string" ? null : states.colorRead;
          if ("measurementFailed" in measured || measured.colorRead.unread > 0 || (stateRead?.unread ?? 0) > 0) {
            failedRows.push(key);
          }
          if (typeof states !== "string") {
            for (const [slot, value] of Object.entries(states)) {
              if (!value || typeof value !== "object" || !("focusPass" in value)) continue;
              if (value.focusPass === false) focusFailures.push(`${key} ${slot}`);
              const { hover } = value;
              if (hover.pass === false) {
                hoverMiss(
                  row,
                  theme,
                  slot,
                  "4a-hover",
                  `${key} ${slot}  4a-hover  surface ΔL ${hover.surfaceDelta} · text ΔL ${hover.textDelta} · underline ${hover.underline}`,
                );
              }
              if (hover.text?.pass === false) {
                hoverMiss(
                  row,
                  theme,
                  slot,
                  "2-hover",
                  `${key} ${slot}  2-hover  text ${hover.text.idle} idle → ${hover.text.hover} hover < ${hover.text.required}`,
                );
              }
            }
          }
          /* The row's own descriptive fields (auth, designed, note, …) ride
           * along; its path function, container and smoke flow do not. */
          const described = Object.fromEntries(
            Object.entries(row).filter(
              ([k, v]) => typeof v !== "function" && !["id", "container", "smoke"].includes(k),
            ),
          );
          results[key] = {
            url,
            finalUrl,
            redirected: !finalUrl.includes(new URL(url).pathname),
            theme,
            viewport: viewport.name,
            session,
            ...described,
            ...measured,
            states,
            smoke,
            consoleErrors: errors.length,
          };
          if (errors.length) consoleErrors[key] = errors.slice(0, 5);
          page.removeAllListeners("console");
        }
        await context.close();
      }
    }
  }
  await browser.close();

  const outFile = path.join(outRoot, `${mode}.json`);
  /* `setup.fixture` is recorded so a replay can load the same rows; the rest
   * of the setup (a storage state holds session cookies) never is. */
  await writeFile(
    outFile,
    JSON.stringify(
      {
        mode,
        lang,
        base,
        capturedAt: new Date().toISOString(),
        fixture: setup.fixture ?? null,
        results,
        consoleErrors,
      },
      null,
      2,
    ),
  );
  console.log(`substrate-capture: ${Object.keys(results).length} rows -> ${outFile}`);
  if (failedRows.length) {
    console.error(`measurement failed (unread colour values or no kernel): ${failedRows.join(", ")}`);
    process.exitCode = 1;
  }
  if (focusFailures.length) {
    console.error(
      `gate 4b: ${focusFailures.length} target(s) where focus paints no new layer ≥ 3:1 thicker than 0:\n  ${focusFailures.join("\n  ")}`,
    );
    process.exitCode = 1;
  }
  for (const { entry, hits } of carried.filter(({ entry }) => entry.capture?.length)) {
    console.log(`deferred (권한 밖, 출하됨): ${entry.what} → ${entry.carriedTo}`);
    console.log(hits.length ? `  ${hits.join("\n  ")}` : "  (no match this run)");
  }
  if (hoverFailures.length) {
    console.error(
      `hover gates: ${hoverFailures.length} target(s) — 4a-hover: hover changes no layer (surface or text ΔL ≥ ${HOVER_DELTA}, or an underline); 2-hover: hover text under its requirement and under idle:\n  ${hoverFailures.join("\n  ")}`,
    );
    process.exitCode = 1;
  }
}

await main();
