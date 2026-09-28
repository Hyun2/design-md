Two project rows separated only by a blank line used to merge: the later finding overwrote the
baseline-content-language row while `check` returned success (process ticket #71).

```ledger
finding: baseline content language protocol row
class: project
where: baseline content language

finding: second finding must remain separate
class: project
where: second ledger row
```
