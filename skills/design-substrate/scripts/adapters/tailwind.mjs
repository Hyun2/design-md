/**
 * Tailwind CSS v4 (shadcn/ui · Base UI / Radix vendored primitives): the
 * answers to the six adapter questions of `ADAPTERS.md`, as code.
 *
 * Everything here is knowledge about the library, none about a project. What a
 * project decides — which files, which vocabularies, which exemptions — comes
 * in through the config the caller names with `--config`.
 *
 * Packages are resolved from the calling project (`process.cwd()`), so no
 * install lives in the skill.
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

export const name = "tailwind";

/**
 * Question 1 (token contract). Tailwind v4 `@theme` namespaces: a declaration
 * named `--<ns>-<key>` generates utilities named `<prefix>-<key>`, so "is this
 * token read" has to be asked of the utility, not of the declaration name.
 */
export const NAMESPACE_PREFIXES = {
  color:
    "bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|caret|accent|divide|placeholder|shadow",
  radius: "rounded",
  font: "font",
  animate: "animate",
  shadow: "shadow",
  tracking: "tracking",
};

/**
 * Declarations whose consumer is the engine rather than a utility class. They
 * are never "dead"; reporting them trains the reader to ignore the output.
 */
export const ENGINE_OWNED = new Set(["--spacing", "--radius", "--font-sans"]);

/** The sheet that declares Tailwind's own defaults (question 6, var level). */
export const LIBRARY_SHEETS = ["tailwindcss/theme.css"];

/**
 * Question 2 (value path). `@theme inline` re-declares raw variables as
 * `--color-*` / `--radius-*` aliases; that block is the alias layer, and the
 * dead-token check is two-pass because of it.
 */
export function aliasLayer(css) {
  const at = css.indexOf("@theme inline");
  return at < 0 ? "" : css.slice(at);
}

/**
 * Question 5 (where hardcoding hides): palette utilities and arbitrary colour
 * values in the primitives' class strings. `transparent` / `current` are
 * keywords, not palette entries, and `rounded-full` is a circle, so none of the
 * three is a defect.
 */
export const HARDCODED_LITERAL =
  /\b(?:bg|text|border|ring|fill|stroke|divide|outline|shadow|from|to|via)-(?:white|black|red|blue|green|gray|grey|slate|zinc|neutral|stone|amber|yellow|orange|violet|purple|emerald|teal|cyan|sky|indigo|rose|pink|lime|fuchsia)(?:-\d{2,3})?(?:\/\d+)?\b|\b[a-z-]+-\[(?:#|rgb|hsl|oklch|oklab)[^\]]*\]/g;

const RADIUS_UTILITY =
  /\brounded(?:-(?:s|e|t|r|b|l|tl|tr|bl|br))?(?:-(?:none|xs|sm|md|lg|xl|2xl|3xl|4xl|full))?\b/g;
const RADIUS_STEPS = new Set(["none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "full"]);

/**
 * The corner family, by resolved value (STEP 1 list 3). `rounded-b-2xl` and
 * `rounded-2xl` are one radius applied to different sides; the step is the
 * scale step, not the utility spelling. A bare `rounded` is Tailwind's own
 * DEFAULT, which `--radius` does not feed. Each live step is then looked up in
 * the theme, because six steps that all resolve to one value paint one radius.
 * `full` and `none` are the circle and the square corner, outside the family.
 *
 * Returns `{ used: { step: count }, resolved: [value, ...] }`.
 */
export function cornerFamily(css, primitiveTexts) {
  const used = {};
  for (const text of primitiveTexts) {
    for (const hit of text.match(RADIUS_UTILITY) ?? []) {
      const last = hit.split("-").pop() ?? "";
      const step = hit === "rounded" ? "DEFAULT" : RADIUS_STEPS.has(last) ? last : "DEFAULT";
      used[step] = (used[step] ?? 0) + 1;
    }
  }
  const stepValue = (step) => {
    const declared = css.match(new RegExp(`--radius-${step}:\\s*([^;]+);`))?.[1]?.trim();
    if (!declared) return `unmapped:${step}`;
    return declared.replace(/\s+/g, "");
  };
  const resolved = [
    ...new Set(
      Object.keys(used)
        .filter((s) => s !== "full" && s !== "none")
        .map(stepValue),
    ),
  ];
  return { used, resolved };
}

/**
 * Faces the stylesheet bundles through `@fontsource`. `@fontsource-variable/noto-sans`
 * and `@fontsource/courier-prime/400.css` both name the family in the package
 * segment; the weight file after it is not a face name.
 */
export function bundledFaces(css) {
  return [...new Set([...css.matchAll(/@import "@fontsource(?:-variable)?\/([a-z0-9-]+)/g)].map((m) => m[1]))];
}

/** Class-bearing utilities that name a token, read out of one string. */
export const TOKEN_UTILITY =
  /(?<![\w\-/:.$])(?:[\w-]+:)*!?-?((?:bg|text|border|ring|fill|stroke|outline|decoration|caret|accent|divide|placeholder|shadow|from|to|via|font|rounded|animate|tracking)-[a-z0-9-]+(?:\/[\w.]+)?)(?![\w\-/:.(\[;])/g;

/**
 * Where class lists live in a file: `@apply` bodies in a stylesheet, string
 * literals elsewhere. Comments are already stripped by the caller.
 */
export function classStrings(file, text) {
  return file.endsWith(".css")
    ? [...text.matchAll(/@apply\s+([^;]+);/g)].map((m) => ({ body: m[1], at: m.index }))
    : [...text.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map((m) => ({
        body: m[1] ?? m[2] ?? m[3],
        at: m.index,
      }));
}

/**
 * Question 6: does this utility generate anything? The answer comes from
 * Tailwind itself — a missing `--color-*` registration is not an error there,
 * the class just compiles to nothing. The design system is loaded from the
 * same stylesheet the build reads, so plugins and imported sheets count.
 *
 * Returns a function `(utilities) => boolean[]`, true where CSS is generated.
 */
export async function compiler(css, { stylesheetBase }) {
  const root = process.cwd();
  const req = createRequire(path.join(root, "package.json"));
  const { __unstable__loadDesignSystem } = req("tailwindcss");
  const resolveSheet = (id, base) => {
    if (id.startsWith(".")) return path.resolve(base, id);
    const parts = id.split("/");
    const pkg = id.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
    const sub = parts.slice(id.startsWith("@") ? 2 : 1).join("/");
    const dir = path.join(root, "node_modules", pkg);
    const meta = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
    const entry = meta.exports?.[sub ? `./${sub}` : "."];
    const file = typeof entry === "string" ? entry : (entry?.style ?? (sub || meta.style || "index.css"));
    return path.join(dir, file);
  };
  const designSystem = await __unstable__loadDesignSystem(css, {
    base: path.join(root, stylesheetBase),
    async loadStylesheet(id, base) {
      const file = resolveSheet(id, base);
      return { path: file, base: path.dirname(file), content: await readFile(file, "utf8") };
    },
    async loadModule(id, base) {
      const file = req.resolve(id);
      return { path: file, base, module: req(file) };
    },
  });
  return (utilities) => designSystem.candidatesToCss(utilities).map(Boolean);
}

/**
 * Capture side: the primitives whose states criterion 4 reads, by name. shadcn
 * marks each primitive's root with `data-slot`; the name keys the output.
 */
export const STATE_TARGETS = Object.fromEntries(
  ["button", "tabs-trigger", "input", "textarea", "select-trigger", "toggle", "badge", "card"].map((slot) => [
    slot,
    `[data-slot='${slot}']`,
  ]),
);
