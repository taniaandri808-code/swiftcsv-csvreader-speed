# SwiftCSV

A faster drop-in for make.fun's own csv-reader 1.0.0: it answers exactly what csv-reader
answers on every input — broken rows included (stray_cr, quote_junk, unterminated_quote,
short_row, long_row) — while reading the text once with native delimiter scans and
slice-built field values instead of per-character string building.

![Competition](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)
![Rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/taniaandri808-code/swiftcsv-csvreader-speed/rank.svg)
![Reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/taniaandri808-code/swiftcsv-csvreader-speed/reward.svg)

Entry for [Read broken CSV files faster, 21 November 2026](https://make.fun/bounty/csv-reader-speed-01-run-20261121).

## How it works

- `solve.js` exports `run(input)` — one left-to-right pass per text, field values assembled
  from `text.slice()` segments, delimiter positions found by native `indexOf` scans kept
  monotonic so every candidate is computed once.
- `main.ts` is the harness driver: it turns V8's incremental marking off, answers every case
  from `/input/cases.json` with `run`, and writes `/output/answers.json`.

Validated case-by-case against the reference on the practice set and on randomized broken-CSV
fuzz inputs before any speed tuning.

## Licence

MIT — see [LICENSE](LICENSE).
