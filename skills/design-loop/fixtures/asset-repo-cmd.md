An asset row whose catcher is a script in a project's own repository, outside
the skills: the next project inherits nothing (process ticket #56). Run from
the design-md checkout root, where `preview-check.sh` stands in for a project
script. Green: the row names the skill command instead.

```ledger
finding: fixture — asset caught by a project script
class: asset
caught-by: cmd node skills/design-substrate/scripts/detect.mjs --config <project config>
red: design-md@1024976
red-line: fixture line
green: design-md@62e50d6
```
