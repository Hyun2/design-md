/**
 * The `font-attribution.mjs` fixture: one static page, one locale, one
 * viewport. Run from any project root that resolves Playwright:
 *
 *   node ~/.agents/skills/design-substrate/scripts/font-attribution.mjs \
 *     --config ~/.agents/skills/design-substrate/fixtures/font-attribution/config.mjs
 *
 * Exit 0 on `page.html` as committed. A mutation that puts an undeclared
 * script into the closed disclosure inside the second tab must exit 1 and name
 * that state.
 */
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
    installedAllowed: { scripts: ["Latin", "Digit", "Hiragana", "Katakana", "Han"] },
  },
};
