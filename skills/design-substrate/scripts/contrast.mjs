/**
 * Composited text contrast from declarations (`design-substrate` STEP 1
 * list 9).
 *
 * A translucent text colour paints differently on every ground it lands on,
 * and the render sample only holds the grounds the sampled screens happened to
 * use. This module answers the question for every ground the world declares,
 * from the declarations alone, so a commit that moves a ground value fails
 * before any screen is rendered. Compositing is source-over in gamma-encoded
 * sRGB, as the browser paints it; the numbers match the capture's rendered
 * readings (TuBrief light `text-foreground/60` on `--card`: 4.17 both ways).
 */

import { srgbChannels } from "./gamut.mjs";

const clamp = (c) => Math.min(1, Math.max(0, c));

/** `0.5`, `50%`, or `none`; NaN when unreadable. */
function alphaToken(token) {
  if (token === undefined) return 1;
  if (token === "none") return 0;
  const n = token.endsWith("%") ? parseFloat(token) / 100 : Number(token);
  return Number.isFinite(n) ? n : NaN;
}

function hex(v) {
  const digits = v.slice(1);
  const full = digits.length <= 4 ? [...digits].map((d) => d + d).join("") : digits;
  const bytes = full.match(/../g).map((b) => parseInt(b, 16) / 255);
  return { rgb: bytes.slice(0, 3), alpha: bytes[3] ?? 1 };
}

function rgbFunction(v) {
  const m = v.match(/^rgba?\(\s*([^)]*)\)$/);
  if (!m) return null;
  const [body, slash] = m[1].split("/");
  const parts = body.split(/[\s,]+/).filter(Boolean);
  const alpha = alphaToken(slash?.trim() ?? parts[3]);
  const rgb = parts.slice(0, 3).map((p) => (p.endsWith("%") ? parseFloat(p) / 100 : Number(p) / 255));
  if (rgb.length !== 3 || rgb.some((c) => !Number.isFinite(c)) || Number.isNaN(alpha)) return null;
  return { rgb, alpha };
}

/**
 * A literal CSS colour as gamma-encoded sRGB channels (clamped: list 8 owns the
 * gamut question) and its alpha, or `null` when this file cannot evaluate it.
 */
export function parseColour(value) {
  const v = value.trim().toLowerCase();
  if (v === "transparent") return { rgb: [0, 0, 0], alpha: 0 };
  if (v === "white") return { rgb: [1, 1, 1], alpha: 1 };
  if (v === "black") return { rgb: [0, 0, 0], alpha: 1 };
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v)) return hex(v);
  if (/^rgba?\(/.test(v)) return rgbFunction(v);
  const channels = srgbChannels(v);
  if (!Array.isArray(channels)) return null;
  const alpha = alphaToken(v.match(/\/\s*([^\s)]+)\s*\)$/)?.[1]);
  if (Number.isNaN(alpha)) return null;
  return { rgb: channels.map(clamp), alpha };
}

/**
 * A colour value with its custom properties looked up in `table` (name →
 * declared value). Resolves `var(--x[, fallback])` and the translucency form
 * the libraries generate, `color-mix(in <space>, <colour> P%, transparent)`,
 * which with premultiplied interpolation is that colour at alpha P. An
 * inherited colour (`currentcolor`, `inherit`) is the parent's and comes back
 * as `"inherited"`: it adds no translucency of its own. Returns `null` for
 * anything else, so the caller counts it instead of guessing.
 */
export function resolveColour(value, table, depth = 0) {
  const v = value.trim();
  if (depth > 16) return null;
  const variable = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);
  if (variable) {
    const declared = table[variable[1]] ?? variable[2];
    return declared === undefined ? null : resolveColour(declared, table, depth + 1);
  }
  const mix = v.match(/^color-mix\(\s*in\s+[\w-]+\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)$/i);
  if (mix) {
    const base = resolveColour(mix[1], table, depth + 1);
    return base && base !== "inherited" ? { rgb: base.rgb, alpha: base.alpha * (Number(mix[2]) / 100) } : null;
  }
  if (/^(?:currentcolor|inherit)$/i.test(v)) return "inherited";
  if (/^(?:color-mix|calc|light-dark|var)\(/i.test(v)) return null;
  return parseColour(v);
}

const luminance = (rgb) =>
  rgb
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);

/** WCAG contrast of `fg` painted over the opaque `ground`. */
export function compositeContrast(fg, ground) {
  const painted = fg.rgb.map((c, i) => fg.alpha * c + (1 - fg.alpha) * ground.rgb[i]);
  const [a, b] = [luminance(painted), luminance(ground.rgb)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
