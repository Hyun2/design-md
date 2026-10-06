// `--gap` is declared by Tailwind arbitrary properties alone: a default, and a
// container-query override that an inline style could not express.
export const Use = () => (
  <div className="@container">
    <div className="bg-base p-(--gap) [--gap:1rem] @min-[40rem]:[--gap:2rem]" />
  </div>
);
