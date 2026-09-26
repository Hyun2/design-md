/**
 * The one colour reader every design measurement uses.
 *
 * `COLOR_KERNEL` is page-realm source text. Install it before measuring —
 * `context.addInitScript({ content: COLOR_KERNEL })` or
 * `page.evaluate(COLOR_KERNEL)` — and read `globalThis.__colorKernel`.
 * It is text, not a function, so no bundler on the caller's side
 * (esbuild `keepNames`, a TS transpiler) can rewrite it on the way in.
 *
 * Why a raster and not arithmetic. `getComputedStyle` returns a colour in the
 * space it was authored in (`oklch(…)`, `oklab(…)` from `color-mix`,
 * `color(display-p3 …)`, `lab(…)`), and an arithmetic converter has to be
 * taught each space by hand. The one it has not been taught fails silently:
 * measured on Chromium 145, a hand converter returned `null` for `lab()` and
 * `lch()` and read `color(display-p3 0.5 0.3 0.2)` as sRGB (127/76/51 against
 * the painted 136/73/45). Painting the value onto a canvas and reading the
 * pixel back makes the browser — the thing the user actually looks at — do the
 * conversion, for every syntax it can render, including ones not yet written.
 * Reading `ctx.fillStyle` back is no help: it echoes `oklch(…)` unchanged. The
 * pixel is the answer.
 *
 * Why float16. An 8-bit canvas rounds each channel to 1/255, which cost up to
 * 0.006 OKLCH L on a 0.6-alpha overlay — a tenth of the 0.06 ΔL threshold. A
 * float16 canvas removes the rounding. If the browser cannot give one, the
 * kernel refuses to measure (`ready === false`) instead of quietly falling
 * back to the rounded path.
 *
 * Every value is counted. `parse` returns `null` only for a value it could not
 * read, and each such value lands in `stats().unread`. A measurement with
 * `unread > 0` is a measurement failure, not a pass: a reader that skips what
 * it cannot parse reports "0 pairs, 0 rungs", which has the same shape as
 * "0 defects".
 *
 * API on `globalThis.__colorKernel`:
 *   ready, error            — false + reason when no float16 canvas exists
 *   parse(value)            — [r, g, b, a], r/g/b 0-255 (float), a 0-1; null = unread
 *   over(fg, bg)            — fg [r,g,b,a] composited on bg [r,g,b] → [r,g,b]
 *   groundOf(el)            — the opaque colour el actually sits on; ends at the
 *                             root's Canvas system colour, never an assumed white
 *   okL(rgb)                — OKLCH lightness 0-1
 *   relLum(rgb), contrast(a, b) — WCAG 2 relative luminance and ratio
 *   shadowLayers(boxShadow) — [{ color, lengths, inset }] per top-level layer
 *   paintedLayers(el)       — [{ kind, side, color, thickness }] layers that leave pixels
 *   focusIndicator(el, idleLayers) — strongest layer focus adds or changes, with
 *                             thickness > 0 and contrast against its adjacent
 *                             ground; null when focus paints nothing new
 *   stats(), reset()        — { attempted, unread, unreadSamples }
 */
export const COLOR_KERNEL = String.raw`
(() => {
  if (globalThis.__colorKernel) return;
  const kernel = { ready: false, error: null };
  globalThis.__colorKernel = kernel;

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  let ctx = null;
  try {
    ctx = canvas.getContext("2d", { willReadFrequently: true, colorType: "float16" });
  } catch (e) {
    kernel.error = "float16 canvas unavailable: " + e;
  }
  if (ctx && ctx.getContextAttributes().colorType !== "float16") {
    kernel.error = "float16 canvas unavailable: context reports colorType " + ctx.getContextAttributes().colorType;
    ctx = null;
  }

  let attempted = 0;
  let unread = 0;
  const unreadSamples = [];
  const cache = new Map();
  const miss = (value) => {
    unread += 1;
    if (unreadSamples.length < 10 && !unreadSamples.includes(value)) unreadSamples.push(value);
    return null;
  };

  /* A value the canvas cannot parse leaves fillStyle at whatever it was, so a
   * lone sentinel would read an unparseable string as that sentinel's colour.
   * Two different sentinels cannot both survive a real colour. */
  const accepted = (value) => {
    ctx.fillStyle = "#010203";
    ctx.fillStyle = value;
    if (ctx.fillStyle !== "#010203") return true;
    ctx.fillStyle = "#030201";
    ctx.fillStyle = value;
    return ctx.fillStyle !== "#030201";
  };

  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  kernel.parse = (value) => {
    if (!ctx) return null;
    attempted += 1;
    const v = typeof value === "string" ? value.trim() : "";
    /* The canvas resolves currentcolor against the canvas element, not the
     * element being measured, so it would read as black. */
    if (!v || /currentcolor/i.test(v)) return miss(v || String(value));
    if (cache.has(v)) {
      const hit = cache.get(v);
      return hit ?? miss(v);
    }
    if (!accepted(v)) {
      cache.set(v, null);
      return miss(v);
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const image = ctx.getImageData(0, 0, 1, 1, { pixelFormat: "rgba-float16" });
    if (image.pixelFormat !== "rgba-float16") {
      kernel.ready = false;
      kernel.error = "getImageData returned " + image.pixelFormat + ", not rgba-float16";
      return miss(v);
    }
    const d = image.data;
    const a = clamp01(d[3]);
    const parsed = [clamp01(d[0]) * 255, clamp01(d[1]) * 255, clamp01(d[2]) * 255, a];
    cache.set(v, parsed);
    return parsed;
  };

  kernel.over = (fg, bg) => [
    fg[0] * fg[3] + bg[0] * (1 - fg[3]),
    fg[1] * fg[3] + bg[1] * (1 - fg[3]),
    fg[2] * fg[3] + bg[2] * (1 - fg[3]),
  ];

  /* What shows through when no element paints an opaque ground is the
   * viewport's Canvas colour, which follows the root's color-scheme — white
   * for a light page, near-black for a dark one. Read it, don't assume it. */
  const canvasGround = () => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;width:0;height:0;background-color:Canvas";
    document.documentElement.appendChild(probe);
    const c = kernel.parse(getComputedStyle(probe).backgroundColor);
    probe.remove();
    return c ? [c[0], c[1], c[2]] : [255, 255, 255];
  };

  kernel.groundOf = (el) => {
    const stack = [];
    let opaque = false;
    for (let node = el; node; node = node.parentElement) {
      const bg = kernel.parse(getComputedStyle(node).backgroundColor);
      if (bg && bg[3] > 0) {
        stack.push(bg);
        if (bg[3] >= 0.999) {
          opaque = true;
          break;
        }
      }
    }
    let out = opaque ? stack.pop().slice(0, 3) : canvasGround();
    for (let i = stack.length - 1; i >= 0; i -= 1) out = kernel.over(stack[i], out);
    return out;
  };

  const linear = (x) => {
    const c = x / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };

  kernel.okL = (rgb) => {
    const [r, g, b] = rgb.slice(0, 3).map(linear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  };

  kernel.relLum = (rgb) => {
    const [r, g, b] = rgb.slice(0, 3).map(linear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  kernel.contrast = (a, b) => {
    const la = kernel.relLum(a);
    const lb = kernel.relLum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  /* A computed box-shadow is a comma list whose colours contain commas of
   * their own (legacy rgba), and each layer trails its lengths after the
   * colour, so a regex fragment is never a parseable colour. Split on
   * top-level commas; Chromium serialises the colour first in each layer. */
  kernel.shadowLayers = (value) => {
    if (!value || value.trim() === "none") return [];
    const layers = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i <= value.length; i += 1) {
      const ch = value[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      else if ((ch === "," && depth === 0) || i === value.length) {
        layers.push(value.slice(start, i).trim());
        start = i + 1;
      }
    }
    return layers.filter(Boolean).map((layer) => {
      let rest = layer;
      const inset = /(^|\s)inset(\s|$)/.test(rest);
      rest = rest.replace(/(^|\s)inset(\s|$)/, " ").trim();
      let color = null;
      const fn = rest.match(/^[a-z-]+\(/i);
      if (fn) {
        let d = 0;
        for (let i = 0; i < rest.length; i += 1) {
          if (rest[i] === "(") d += 1;
          else if (rest[i] === ")" && --d === 0) {
            color = rest.slice(0, i + 1);
            rest = rest.slice(i + 1).trim();
            break;
          }
        }
      } else {
        const word = rest.match(/^(#[0-9a-f]+|[a-z]+)(?=\s|$)/i);
        if (word) {
          color = word[1];
          rest = rest.slice(word[0].length).trim();
        }
      }
      const lengths = rest.split(/\s+/).filter(Boolean).map((t) => parseFloat(t));
      return { color, lengths, inset };
    });
  };

  /* A focus indicator is a painted layer that the focus state adds or changes
   * relative to idle — not the strongest colour an element happens to carry.
   * Chromium keeps a colour on an outline whose style is none and on every
   * border, so "strongest visible colour" passes a control whose focus paints
   * nothing: substrate pass #23 measured idle and focus equal on 75/76 rows.
   *
   * paintedLayers(el) — the layers that leave pixels: outline with style not
   * none and width > 0, each box-shadow layer, each border side with style not
   * none and width > 0; colour α > 0. "thickness" is outline or border width,
   * or a shadow's spread (blur is a fading edge, not a line, so a blur-only
   * shadow — an elevation shadow — has thickness 0). "side" says which ground
   * the layer sits against: outer (outside the box), inner (inside), edge
   * (between the two, judged against the worse of them). */
  kernel.paintedLayers = (el) => {
    const style = getComputedStyle(el);
    const px = (v) => parseFloat(v) || 0;
    const layers = [];
    const push = (kind, side, color, thickness) => {
      const rgba = kernel.parse(color);
      if (!rgba || rgba[3] <= 0) return;
      layers.push({ kind, side, color, thickness });
    };
    if (style.outlineStyle !== "none" && px(style.outlineWidth) > 0) {
      const offset = px(style.outlineOffset);
      const width = px(style.outlineWidth);
      push("outline", offset >= 0 ? "outer" : offset <= -width ? "inner" : "edge", style.outlineColor, width);
    }
    for (const layer of kernel.shadowLayers(style.boxShadow)) {
      if (!layer.color) continue;
      const spread = layer.lengths[3] ?? 0;
      push("box-shadow", layer.inset ? "inner" : "outer", layer.color, Math.max(spread, 0));
    }
    for (const edge of ["Top", "Right", "Bottom", "Left"]) {
      if (style["border" + edge + "Style"] === "none") continue;
      const width = px(style["border" + edge + "Width"]);
      if (width > 0) push("border-" + edge.toLowerCase(), "edge", style["border" + edge + "Color"], width);
    }
    return layers;
  };

  /* focusIndicator(el, idleLayers) — call with the focus state applied, pass
   * paintedLayers(el) read in idle. Returns the strongest changed layer that
   * has thickness > 0, or null when focus paints nothing new: { kind, side,
   * color, thickness, contrast }. Contrast is against the adjacent ground
   * (WCAG 2.2 SC 1.4.11): outer layers against the parent's ground, inner
   * layers against the element's own, edge layers against the worse. */
  kernel.focusIndicator = (el, idleLayers) => {
    const key = (l) => [l.kind, l.side, l.color, l.thickness].join("|");
    const idle = new Set(idleLayers.map(key));
    const inner = kernel.groundOf(el);
    const outer = el.parentElement ? kernel.groundOf(el.parentElement) : inner;
    let best = null;
    for (const layer of kernel.paintedLayers(el)) {
      if (idle.has(key(layer)) || layer.thickness <= 0) continue;
      const rgba = kernel.parse(layer.color);
      const against = (g) => kernel.contrast(kernel.over(rgba, g), g);
      const contrast =
        layer.side === "outer" ? against(outer)
        : layer.side === "inner" ? against(inner)
        : Math.min(against(outer), against(inner));
      if (!best || contrast > best.contrast) best = { ...layer, contrast: Number(contrast.toFixed(2)) };
    }
    return best;
  };

  kernel.stats = () => ({ attempted, unread, unreadSamples: [...unreadSamples] });
  kernel.reset = () => {
    attempted = 0;
    unread = 0;
    unreadSamples.length = 0;
  };

  kernel.ready = Boolean(ctx);
})();
`;
