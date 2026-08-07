#!/usr/bin/env python3
"""
Build the GM + Gloucestershire financial risk dataset from MHCLG's
Revenue Outturn multi-year time series CSV (2017-18 to 2024-25),
rather than a single year's snapshot — see README for why: a single
year's start/end reserves figure is too thin to support any "did we see
this coming" claim, and several authorities (including Trafford) report
identical opening/closing unallocated reserves within a single year,
which only makes sense read against several years of history.

Source (confirmed working 2026-08-07):
https://assets.publishing.service.gov.uk/media/6937fe05e447374889cd8f4b/Revenue_Outturn_time_series_data_v3.1.csv

Key columns used (verified against the file's own header — MHCLG's
column codes, not English labels, so cross-check
data/raw/Revenue_Outturn_metadata.ods if anything looks wrong after a
refresh):
    year_ending              YYYYMM, e.g. 202503 = FY2024-25 (year end March 2025)
    LA_name                  matches data/reference/authorities.json exactly
    status                   'submitted' | 'not submitted' | 'total' (England
                              aggregate row — must be excluded)
    RS_resunall_start_cy     unallocated reserves at start of year, £000s
    RS_resunall_end_cy       unallocated reserves at end of year, £000s
    RS_netrevexp_net_exp     net revenue expenditure for the year, £000s

Run:
    python3 pipeline/parse_rs_data.py data/raw/Revenue_Outturn_time_series_v3.1.csv
"""
from __future__ import annotations

import argparse
import datetime
import json
import pathlib
import sys

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent.parent
REF_DIR = ROOT / "data" / "reference"
OUT_DIR = ROOT / "data" / "processed"

COLS = [
    "year_ending", "LA_name", "status",
    "RS_resunall_start_cy", "RS_resunall_end_cy", "RS_netrevexp_net_exp",
]


def load_authorities() -> list[tuple[str, str, str]]:
    """Returns (name, region, tier) so the site doesn't need to duplicate
    this grouping — tier flags the two-tier Gloucestershire county/district
    split, which matters for reading the numbers (see README)."""
    ref = json.loads((REF_DIR / "authorities.json").read_text())
    out = [(name, "Greater Manchester", "unitary") for name in ref["greater_manchester"]]
    out += [(name, "Gloucestershire", "county") for name in ref["gloucestershire"]["county"]]
    out += [(name, "Gloucestershire", "district") for name in ref["gloucestershire"]["districts"]]
    return out


def load_efs() -> dict[str, dict]:
    ref = json.loads((REF_DIR / "exceptional_financial_support.json").read_text())
    return {row["authority"]: row for row in ref["awards"]}


def load_s114() -> dict[str, list[dict]]:
    ref = json.loads((REF_DIR / "section_114_notices.json").read_text())
    by_authority: dict[str, list[dict]] = {}
    for notice in ref["notices"]:
        by_authority.setdefault(notice["authority"], []).append(notice)
    return by_authority


def year_label(year_ending: int) -> str:
    """202503 -> '2024-25'"""
    end_year = year_ending // 100
    return f"{end_year - 1}-{str(end_year)[-2:]}"


def band_risk(latest_pct: float | None, mean_pct: float | None,
              on_efs: bool, ever_s114: bool) -> str:
    """Transparent rule-based banding on the *multi-year average* reserves
    ratio rather than a single year, since Manchester vs Trafford shows a
    single latest-year reading can be misleadingly thin or fat for
    reasons unrelated to distress (in-year timing of drawdowns, etc.).
    Thresholds are a first-pass judgement call — see README before
    treating this as validated."""
    if ever_s114:
        return "High (S114 notice issued)"
    if on_efs:
        return "High (exceptional financial support 2025-26)"
    if mean_pct is None:
        return "Unknown (data missing)"
    # Sudden latest-year collapse overrides a comfortable historical
    # average — a mean-only band would call Gloucester (8yr avg 8.0%,
    # latest 0.7%) "lower risk", which misses the more urgent signal.
    if latest_pct is not None and latest_pct < 3:
        return "Elevated (latest year near-depleted, despite longer-run average)"
    if mean_pct < 5:
        return "Elevated (reserves persistently thin, 8yr avg <5% of spend)"
    if mean_pct < 8 or (latest_pct is not None and latest_pct < mean_pct * 0.5):
        return "Watch (8yr avg 5-8% of spend, or latest year well below average)"
    return "Lower risk (reserves-based signal only)"


def parse(csv_path: pathlib.Path) -> list[dict]:
    df = pd.read_csv(csv_path, usecols=COLS)
    df = df[df["status"] == "submitted"].copy()
    df["pct"] = df["RS_resunall_end_cy"] / df["RS_netrevexp_net_exp"] * 100
    df["year"] = df["year_ending"].apply(year_label)

    authorities = load_authorities()
    efs = load_efs()
    s114 = load_s114()

    results = []
    for name, region, tier in authorities:
        rows = df[df["LA_name"] == name].sort_values("year_ending")
        if rows.empty:
            results.append({"authority": name, "region": region, "tier": tier, "error": "not found in CSV — check exact name string"})
            continue

        series = [
            {
                "year": r["year"],
                "unallocated_reserves_start_gbp_000": round(float(r["RS_resunall_start_cy"]), 1) if pd.notna(r["RS_resunall_start_cy"]) else None,
                "unallocated_reserves_end_gbp_000": round(float(r["RS_resunall_end_cy"]), 1) if pd.notna(r["RS_resunall_end_cy"]) else None,
                "net_revenue_expenditure_gbp_000": round(float(r["RS_netrevexp_net_exp"]), 1) if pd.notna(r["RS_netrevexp_net_exp"]) else None,
                "unallocated_reserves_pct_of_net_expenditure": round(float(r["pct"]), 1) if pd.notna(r["pct"]) else None,
            }
            for _, r in rows.iterrows()
        ]

        pct_values = [p["unallocated_reserves_pct_of_net_expenditure"] for p in series if p["unallocated_reserves_pct_of_net_expenditure"] is not None]
        mean_pct = round(sum(pct_values) / len(pct_values), 1) if pct_values else None
        latest_pct = series[-1]["unallocated_reserves_pct_of_net_expenditure"] if series else None
        min_pct = round(min(pct_values), 1) if pct_values else None
        max_pct = round(max(pct_values), 1) if pct_values else None

        short_name = name.replace(" MBC", "").replace(" CC", "").replace(" UA", "")
        efs_row = efs.get(name) or efs.get(short_name)
        s114_rows = s114.get(name) or s114.get(short_name) or []

        results.append({
            "authority": name,
            "region": region,
            "tier": tier,
            "years_available": len(series),
            "series": series,
            "reserves_pct_8yr_mean": mean_pct,
            "reserves_pct_8yr_min": min_pct,
            "reserves_pct_8yr_max": max_pct,
            "reserves_pct_latest": latest_pct,
            "exceptional_financial_support_2025_26": efs_row,
            "section_114_notices": s114_rows,
            "risk_band": band_risk(latest_pct, mean_pct, on_efs=efs_row is not None, ever_s114=len(s114_rows) > 0),
        })
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", type=pathlib.Path, help="Path to Revenue_Outturn_time_series CSV")
    args = parser.parse_args()

    results = parse(args.csv_path)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / "gm_gloucestershire_risk_2017-2025.json"
    payload = {
        "generated_at": datetime.date.today().isoformat(),
        "generated_from": args.csv_path.name,
        "years_covered": "2017-18 to 2024-25",
        "units": "£ thousand unless stated otherwise",
        "methodology_note": (
            "Unallocated (general fund) reserves as % of net revenue expenditure, "
            "tracked over 8 years per authority. Risk band uses the 8-year AVERAGE "
            "ratio, not just the latest year, because a single year's reading can "
            "mislead (Manchester's reserves ratio is thinner than Trafford's in "
            "most years, yet only Trafford needed exceptional financial support in "
            "2025-26 — so 'thin reserves' alone doesn't predict a bailout, it's "
            "necessary context, not sufficient). Overridden to 'High' by an actual "
            "S114 notice or 2025-26 EFS award. NOT a validated predictive model — "
            "a screening tool, see README for caveats including small-district "
            "denominator volatility (Cotswold's ratio swings 5%-88% across the "
            "period purely because its net revenue expenditure base is small)."
        ),
        "authorities": results,
    }
    out_path.write_text(json.dumps(payload, indent=2))
    print(f"Wrote {out_path}")

    # Stable-filename copy for the static site to fetch() at runtime —
    # data/processed/ keeps the source-of-truth (dated by year range);
    # site/data/risk.json is what index.html actually reads.
    site_data_dir = ROOT / "site" / "data"
    site_data_dir.mkdir(parents=True, exist_ok=True)
    (site_data_dir / "risk.json").write_text(json.dumps(payload, indent=2))
    print(f"Wrote {site_data_dir / 'risk.json'}")

    errors = [r for r in results if "error" in r]
    if errors:
        print(f"WARNING: {len(errors)} authorities not matched: {[e['authority'] for e in errors]}", file=sys.stderr)
    ok = [r for r in results if "error" not in r]
    for r in sorted(ok, key=lambda r: r["reserves_pct_8yr_mean"] or 0):
        print(f"  {r['authority']:<22} 8yr_avg={r['reserves_pct_8yr_mean']}%  "
              f"latest={r['reserves_pct_latest']}%  risk={r['risk_band']}")


if __name__ == "__main__":
    main()
