/**
 * The `capture.mjs` criterion 4 fixture: one static page, one theme, one
 * viewport, the adapter's state targets. Run from any project root that
 * resolves Playwright:
 *
 *   node ~/.agents/skills/design-substrate/scripts/capture.mjs \
 *     --config ~/.agents/skills/design-substrate/fixtures/state-targets/config.mjs --mode after
 *
 * Exit 0 on `page.html` as committed. Each mutation listed in `page.html`
 * must exit 1 and name its defect.
 */
const page = new URL("./page.html", import.meta.url).href;

export default {
  adapter: "tailwind",
  capture: {
    rows: [{ id: "fixture", container: "main", smoke: { action: { kind: "none" }, expect: "main" } }],
    themes: ["light"],
    viewports: [{ name: "desktop", width: 1280, height: 800 }],
    statesAt: "desktop",
    lang: "en",
    base: "",
    out: "/tmp/state-targets-fixture",
    setup: async () => ({}),
    session: () => "anon",
    storageState: () => null,
    url: () => page,
  },
};
