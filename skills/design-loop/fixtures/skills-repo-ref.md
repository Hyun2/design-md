A carried asset row whose catcher lives in the skills repository, so its red
and green are commits there, not in the repository `check` runs from.

```ledger
finding: fixture — catcher code lives in the skills repository
class: asset
caught-by: cmd node design-loop/scripts/ledger.mjs check 0 --file design-loop/fixtures/skills-repo-ref.md
red: design-md@1024976
red-line: fixture line
green: design-md@62e50d6
```
