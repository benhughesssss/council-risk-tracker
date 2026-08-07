# Council Financial Risk Tracker (v1: Greater Manchester + Gloucestershire)

Ongoing, publicly-sourced tracker of English local authority financial
stress, starting with the 10 Greater Manchester boroughs and the 7
Gloucestershire authorities (county + 6 districts).

## Why this pair of areas

Two-tier Gloucestershire vs unitary Greater Manchester is a genuine
structural contrast, not just "somewhere I know" — GM boroughs run their
own social care and highways budgets, Gloucestershire districts don't
(the county does), so reserves pressure shows up differently. Worth
stating plainly in any write-up rather than comparing like-for-unlike.

**Headline finding, after actually running the numbers (8-year series,
2017-18 to 2024-25):** Trafford is the only one of the 17 on the 2025-26
Exceptional Financial Support list, and none of the 17 has ever issued a
Section 114 notice — but Trafford is *not* the authority with the
thinnest reserves. Manchester's unallocated reserves have averaged 4.2%
of net spend over 8 years (thinner than Trafford's 4.6%) and its latest
reading is 1.3% — the lowest in the whole scope — yet Manchester hasn't
needed a capitalisation direction. **So "thin reserves" alone doesn't
predict a bailout; it's necessary context, not a sufficient signal.**
That's a more interesting question than the "did we see it coming"
framing this project started with — what does Manchester have instead
(commercial investment income, borrowing capacity, MRP policy) that
reserves data alone can't see? That's the natural next analytical step.
Gloucester City shows the same shape as Manchester: a comfortable 8-year
average (8.0%) masking a collapse to 0.7% in the latest year — caught by
the risk banding logic, not by eyeballing the average.

## Data sources

| Source | What it gives us | Update cadence |
|---|---|---|
| [MHCLG Revenue Outturn multi-year time series](https://www.gov.uk/government/statistics/local-authority-revenue-expenditure-and-financing-england-revenue-outturn-multi-year-data-set) | Unallocated/earmarked/schools/public health reserves and net revenue expenditure, per authority, 2017-18 to 2024-25 | Annual (new year added each June-ish) |
| [Exceptional Financial Support / capitalisation directions](https://www.gov.uk/guidance/exceptional-financial-support-for-local-authorities-for-2025-26) | Which councils needed government permission to plug budget gaps by selling assets, and how much | Annual, in-year revisions published too |
| Section 114 notices | Historical formal insolvency declarations | Event-driven; hand-maintained list, see caveat below |

**Caveat on the reference JSON files** (`data/reference/*.json`): the
Section 114 and EFS lists were compiled via automated web fetches on
2026-08-07, not hand-verified line-by-line against primary documents.
Before anything in this repo is published or cited, cross-check both
files against gov.uk's own EFS guidance page and a primary source for
S114 dates (Institute for Government / Commons Library) — flagged in
each file's `_comment`.

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
  - `High` — ever issued a S114 notice, or on the 2025-26 EFS list
  - `Elevated` — latest year's ratio has collapsed below 3% regardless
    of history (catches Manchester and Gloucester, which a mean-only
    rule would miss), or the 8-year average itself is under 5%
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
- [x] Reference data compiled (authorities, EFS awards, S114 notices —
      **unverified against primary sources**, see caveat above)
- [x] Parser + risk-scoring pipeline written and run for real
      (`pipeline/parse_rs_data.py` → `data/processed/gm_gloucestershire_risk_2017-2025.json`)
- [ ] Frontend (static site reading `data/processed/*.json`)
- [ ] Git repo + GitHub Pages + Actions refresh workflow
- [ ] Investigate why Manchester's reserves are thinner than Trafford's
      without needing EFS — likely next analytical step, not yet started

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
