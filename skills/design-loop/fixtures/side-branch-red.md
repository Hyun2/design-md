A `cmd` row whose red sits on a side branch. Run from the tubrief-v2 clone that
has `red/popup-scope`: `0553672` is there but not an ancestor of HEAD, the case
#45 recorded (process ticket #54). Any other clone reports it as no commit.
That is the red commit of this file; the committed state here is the green one.

```ledger
finding: fixture — red on a side branch
class: protocol
caught-by: cmd node design-loop/scripts/ledger.mjs check 0 --file design-loop/fixtures/side-branch-red.md
red: d497eff
red-line: fixture line
green: 30dd39c
```
