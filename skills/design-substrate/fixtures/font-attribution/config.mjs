/**
 * The `font-attribution.mjs` fixture: one static page, one locale, one
 * viewport, one corpus entry. Run from any project root that resolves
 * Playwright:
 *
 *   node ~/.agents/skills/design-substrate/scripts/font-attribution.mjs \
 *     --config ~/.agents/skills/design-substrate/fixtures/font-attribution/config.mjs
 *
 * Exit 0 on `page.html` and `corpus.json` as committed. Each mutation listed
 * in `page.html` must exit 1 and name its defect.
 */
import { readFile } from "node:fs/promises";

const page = new URL("./page.html", import.meta.url).href;

export default {
  adapter: "tailwind",
  capture: {
    rows: [{ id: "fixture" }],
    themes: ["light"],
    viewports: [{ name: "desktop", width: 1280, height: 800 }],
    base: "",
    out: "/tmp/font-attribution-fixture",
    setup: async () => ({}),
    session: () => "anon",
    storageState: () => null,
    url: () => page,
  },
  fonts: {
    locales: ["en"],
    installedAllowed: [
      { scripts: ["Latin", "Digit", "Hiragana", "Katakana", "Han"] },
      { selector: "[data-content-text]", scripts: ["Symbol"] },
    ],
    corpus: async () =>
      JSON.parse(await readFile(new URL("./corpus.json", import.meta.url), "utf8")).map((e) => ({
        ...e,
        row: "fixture",
        selector: "[data-content-text]",
      })),
  },
};
