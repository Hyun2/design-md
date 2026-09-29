/**
 * Whether a declared colour lies inside the sRGB gamut (`design-substrate`
 * STEP 1 list 8).
 *
 * This is arithmetic on the declaration, not a reading of painted pixels, and
 * that is deliberate: the colour kernel rasterises, and a raster clips an
 * out-of-gamut colour to the sRGB edge before anyone can read it — which is
 * exactly the defect. The kernel stays the authority on what was painted;
 * this module answers only what was asked for.
 *
 * Conversions follow CSS Color 4 §17 (OKLab → linear sRGB; Lab/LCH through
 * XYZ-D50 with Bradford to D65; display-p3 through XYZ-D65). A function this
 * file cannot evaluate returns `null`, and the caller counts it.
 */

const D50_TO_D65 = [
  [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
  [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
  [0.012314014864481998, -0.020507649298898964, 1.330365926242124],
];
const XYZ_D65_TO_LINEAR_SRGB = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];
const LINEAR_P3_TO_XYZ_D65 = [
  [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
  [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
  [0, 0.04511338185890264, 1.043944368900976],
];

const mul = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

function oklabToLinearSrgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function labToLinearSrgb(L, a, b) {
  const e = 216 / 24389;
  const k = 24389 / 27;
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const inv = (f) => (f ** 3 > e ? f ** 3 : (116 * f - 16) / k);
  const xyzD50 = [inv(fx) * 0.3457 / 0.3585, L > k * e ? fy ** 3 : L / k, inv(fz) * (1 - 0.3457 - 0.3585) / 0.3585];
  return mul(XYZ_D65_TO_LINEAR_SRGB, mul(D50_TO_D65, xyzD50));
}

const polar = (C, h) => [C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];
const decode = (c) => Math.sign(c) * (Math.abs(c) <= 0.04045 ? Math.abs(c) / 12.92 : ((Math.abs(c) + 0.055) / 1.055) ** 2.4);
const encode = (c) => Math.sign(c) * (Math.abs(c) <= 0.0031308 ? 12.92 * Math.abs(c) : 1.055 * Math.abs(c) ** (1 / 2.4) - 0.055);

/** A number, a percentage (scaled to `percentOf`), or `none` (0). */
function number(token, percentOf) {
  if (token === "none") return 0;
  if (token.endsWith("%")) return (parseFloat(token) / 100) * percentOf;
  if (token.endsWith("deg")) return parseFloat(token);
  const n = Number(token);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Gamma-encoded sRGB channels of a CSS colour value, unclamped, or `null`
 * when this file cannot evaluate it. `"srgb"` means the value is sRGB by
 * construction (hex, rgb(), hsl(), hwb(), named, color(srgb …)) and cannot leave it.
 */
function srgbChannels(value) {
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3,8}$/.test(v) || /^(rgba?|hsla?|hwb)\(/.test(v) || /^color\(\s*srgb\s/.test(v) || /^[a-z]+$/.test(v)) {
    return "srgb";
  }
  const m = v.match(/^(oklch|oklab|lch|lab|color)\(\s*([^)]*)\)$/);
  if (!m) return null;
  const [fn, body] = [m[1], m[2].split("/")[0].trim()];
  const parts = body.split(/\s+/);
  if (fn === "color") {
    if (parts[0] !== "display-p3" || parts.length !== 4) return null;
    const rgb = parts.slice(1).map((p) => number(p, 1));
    if (rgb.some(Number.isNaN)) return null;
    return mul(XYZ_D65_TO_LINEAR_SRGB, mul(LINEAR_P3_TO_XYZ_D65, rgb.map(decode))).map(encode);
  }
  if (parts.length !== 3) return null;
  const scale = { oklch: [1, 0.4, 1], oklab: [1, 0.4, 0.4], lch: [100, 150, 1], lab: [100, 125, 125] }[fn];
  const [x, y, z] = parts.map((p, i) => number(p, scale[i]));
  if ([x, y, z].some(Number.isNaN)) return null;
  const linear =
    fn === "oklch"
      ? oklabToLinearSrgb(x, ...polar(y, z))
      : fn === "oklab"
        ? oklabToLinearSrgb(x, y, z)
        : fn === "lch"
          ? labToLinearSrgb(x, ...polar(y, z))
          : labToLinearSrgb(x, y, z);
  return linear.map(encode);
}

/** How far the furthest channel lies outside [0, 1]; 0 inside the gamut. */
const overshoot = (channels) => Math.max(0, ...channels.map((c) => Math.max(-c, c - 1)));

/** The largest chroma at this lightness and hue that sRGB can show. */
function maxSrgbChroma(toLinear, L, h, ceiling) {
  let [lo, hi] = [0, ceiling];
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (overshoot(toLinear(L, ...polar(mid, h)).map(encode)) > 0) hi = mid;
    else lo = mid;
  }
  return lo;
}

/**
 * The verdict on one declared value: `null` when this file cannot evaluate
 * it, `{ inside: true }`, or `{ inside: false, detail }`.
 *
 * A polar declaration (`oklch`, `lch`) is judged on its chroma against the
 * sRGB ceiling at its lightness and hue, forgiving the rounding of a ceiling
 * written to three places: OKLCH C 0.0005, and for LCH C 0.05 (assumed; no LCH
 * world observed). `oklch(0.34 0.058 200)` is the ceiling 0.0578 rounded, not
 * a colour outside the gamut. The allowance is fixed, not taken
 * from the digits written, or `oklch(0.8 0.14 200)` — 0.004 over its ceiling
 * of 0.1360 — would pass for having been written with two. Every other form
 * is judged on its channels with no allowance.
 */
export function gamutVerdict(value) {
  const channels = srgbChannels(value);
  if (channels === null) return null;
  if (channels === "srgb") return { inside: true };
  const polarForm = value.trim().toLowerCase().match(/^(oklch|lch)\(\s*(\S+)\s+([\d.]+)\s+(\S+?)[\s/)]/);
  if (polarForm) {
    const [, fn, l, c, h] = polarForm;
    const L = number(l, fn === "oklch" ? 1 : 100);
    const hue = number(h, 1);
    const C = Number(c);
    const [toLinear, search, allowance] =
      fn === "oklch" ? [oklabToLinearSrgb, 0.5, 0.0005] : [labToLinearSrgb, 200, 0.05];
    const ceiling = maxSrgbChroma(toLinear, L, hue, search);
    if (C <= ceiling + allowance) return { inside: true };
    return { inside: false, detail: `C ${C} > sRGB 최대 ${ceiling.toFixed(4)} (L ${L}, h ${hue})` };
  }
  const excess = overshoot(channels);
  if (excess <= 1e-9) return { inside: true };
  return { inside: false, detail: `sRGB 채널이 [0, 1] 밖으로 ${excess.toFixed(4)}` };
}
