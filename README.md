# Council Financial Risk Tracker (v1: Greater Manchester + Gloucestershire)

**Live:** https://benhughesssss.github.io/council-risk-tracker/

Ongoing, publicly-sourced tracker of English local authority financial
stress, starting with the 10 Greater Manchester boroughs and the 7
Gloucestershire authorities (county + 6 districts). Rebuilds and
redeploys automatically — see `.github/workflows/deploy.yml` — on every
push to `main` that touches the pipeline, reference data, or site, plus
a monthly schedule.

## Why this pair of areas

Two-tier Gloucestershire vs unitary Greater Manchester is a genuine
structural contrast, not just "somewhere I know" — GM boroughs run their
own social care and highways budgets, Gloucestershire districts don't
(the county does), so reserves pressure shows up differently. Worth
stating plainly in any write-up rather than comparing like-for-unlike.

**Headline finding, after actually running the numbers (8-year series,
2017-18 to 2024-25) AND a full cross-check of every EFS year 2022-23 to
2026-27:** Two of the 17 have needed Exceptional Financial Support —
Trafford in *two consecutive years* (2025-26 £9.6m, 2026-27 £12.65m) and
Gloucester in 2026-27 (£9.05m) — and none of the 17 has ever issued a
Section 114 notice. Neither bailed-out authority is the one with the
thinnest reserves, though: Manchester's unallocated reserves have
averaged 4.2% of net spend over 8 years (thinner than Trafford's 4.6%)
and its latest reading is 1.3% — still lower than Trafford's ever was —
yet Manchester has never needed EFS. **So "thin reserves" alone doesn't
predict a bailout; it's necessary context, not a sufficient signal.**
What does Manchester have that Trafford and Gloucester didn't
(commercial investment income, borrowing capacity, MRP policy) that
reserves data alone can't see? That's the natural next analytical step,
not yet started.

**This finding was revised once already, and the revision matters as a
methodology lesson as much as the result does.** The first pass only
checked the 2025-26 EFS list and concluded Gloucester was merely
"elevated risk," not an actual EFS recipient. A full cross-check against
every year's primary gov.uk guidance page (done 2026-08-07) found
Gloucester's 2026-27 award, which the first pass had missed entirely —
and found it because this project's own reserves-based screening had
already flagged Gloucester as thin before that award became public.
Single-source, single-year pulls are exactly the kind of thing that
looks done but isn't; re-verify before trusting a "none of the others"
claim in future work here.

## Data sources

| Source | What it gives us | Update cadence |
|---|---|---|
| [MHCLG Revenue Outturn multi-year time series](https://www.gov.uk/government/statistics/local-authority-revenue-expenditure-and-financing-england-revenue-outturn-multi-year-data-set) | Unallocated/earmarked/schools/public health reserves and net revenue expenditure, per authority, 2017-18 to 2024-25 | Annual (new year added each June-ish) |
| [Exceptional Financial Support / capitalisation directions](https://www.gov.uk/government/collections/exceptional-financial-support-for-local-authorities) | Which councils needed government permission to plug budget gaps by selling assets, and how much | Annual, in-year revisions published too |
| Section 114 notices | Historical formal insolvency declarations | Event-driven; hand-maintained list, see caveat below |

**Caveat on the reference JSON files** (`data/reference/*.json`), updated
2026-08-07: the EFS data for the 17 GM/Gloucestershire authorities is now
cross-checked directly against every year's own gov.uk guidance page
(2022-23 through 2026-27), not just an automated summary of the 2025-26
page — that first pass had missed Gloucester's 2026-27 award entirely.
Section 114 status for the 17 in-scope authorities is confirmed by
individual targeted searches (none of them have ever issued one). The
*out-of-scope* rows in `section_114_notices.json` (Birmingham, Croydon,
etc., kept for context) are still sourced from Wikipedia and not
hand-verified line-by-line — fine as background, not for citing.

## Methodology

`pipeline/parse_rs_data.py` reads the multi-year CSV and computes, per
authority, per year 2017-18 to 2024-25:

- **Unallocated reserves as % of net revenue expenditure.** Unallocated
  (general fund) reserves are what a council can actually draw on
  without breaching earmarking; total reserves overstate what's really
  available. Tracked as a full 8-year series, not a single snapshot —
  see `data/processed/gm_gloucestershire_risk_2017-2025.json`.
- **8-year average, min, max, and latest-year reading** per authority.
- **Risk band** — a transparent, rule-based label, not a fitted model:
  - `High` — ever issued a S114 notice, or received EFS in any year
    2022-23 to 2026-27 (now correctly catches both Trafford and
    Gloucester — see the methodology note on the missed first pass, above)
  - `Elevated` — latest year's ratio has collapsed below 3% regardless
    of history (this is what flagged Manchester and, before its EFS
    data was found, Gloucester too — a mean-only rule would have missed
    both), or the 8-year average itself is under 5%
  - `Watch` — 8-year average is 5-8%, or the latest year is under half
    the 8-year average (a sharp recent fall from a historically
    comfortable position)
  - `Lower risk` — none of the above; still just a reserves-based
    signal, not a clean bill of health

  **The thresholds are a first-pass judgement call**, not statistically
  validated — they were picked to be interpretable, then adjusted once
  when a first pass wrongly banded Gloucester as "lower risk" despite
  its latest-year collapse. Treat any new threshold change the same way:
  check what it does to the known cases (Trafford, Manchester,
  Gloucester) before trusting it elsewhere.

## Status

- [x] Data source located, both a single-year ODS and the full
      2017-25 multi-year CSV (`data/raw/`)
- [x] Reference data compiled AND cross-checked against every year's
      primary EFS source (2026-08-07) — the cross-check itself found
      and fixed a missed Gloucester award, see above
- [x] Parser + risk-scoring pipeline written and run for real
      (`pipeline/parse_rs_data.py` → `data/processed/gm_gloucestershire_risk_2017-2025.json`)
- [x] Frontend built, visually QA'd, and updated to match the corrected
      two-award finding (`site/`) — caught and fixed a factual error in
      the headline copy and a chart annotation that was promised in a
      caption but not actually drawn
- [x] Git repo, GitHub Pages, and the Actions refresh workflow are live
      at https://benhughesssss.github.io/council-risk-tracker/
- [x] Byline added to the site footer
- [ ] Investigate why Manchester's reserves are thinner than both
      bailed-out authorities without needing EFS itself — likely next
      analytical step, not yet started
- [ ] The *out-of-scope* rows in `section_114_notices.json` are still
      Wikipedia-sourced, not hand-verified — low priority since they
      don't affect any claim this project actually makes, but flagged
      honestly rather than silently left as before

## Running it

```
source .venv/bin/activate   # venv already created; if missing: python3 -m venv .venv && pip install -r requirements.txt
python3 pipeline/fetch_data.py
python3 pipeline/parse_rs_data.py data/raw/Revenue_Outturn_time_series_v3.1.csv
```

## Known limitations / next-refresh gotchas

- MHCLG's CSV download URL is content-hashed and versioned (`v3.1` in
  the filename) and changes with every new release —
  `pipeline/fetch_data.py`'s `DATA_URL` needs manual updating once a
  year, roughly each June when a new outturn year is added.
- Reserves-to-expenditure is a well-known but crude stress signal
  (CIPFA's own resilience index uses more inputs, e.g. borrowing/capital
  financing requirement, which isn't in this dataset — it's in the
  separate capital outturn release, not yet wired in here).
- Small district councils (Cotswold, Forest of Dean) have noisy ratios
  purely because their net revenue expenditure denominator is small —
  Cotswold's ratio swings from 5% to 88% across the 8 years. Don't read
  district-vs-borough differences as apples-to-apples without accounting
  for this.
- v1 scope is 17 authorities; expanding to all ~317 English LAs should
  be a config change (edit `data/reference/authorities.json`), not a
  rewrite — that was the point of matching by name/JSON rather than
  hardcoding GM/Gloucestershire logic into the parser.
