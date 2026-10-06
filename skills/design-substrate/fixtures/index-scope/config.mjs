/** The `detect.mjs` config of the index-scope fixture; `run.sh` passes it. */
export default {
  adapter: "tailwind",
  detect: {
    tokensFile: "app/app.css",
    sources: ["app/**/*.tsx", "app/**/*.css"],
    primitives: "app/ui/*.tsx",
    designDoc: "DESIGN.md",
  },
};
