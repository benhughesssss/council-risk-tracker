#!/usr/bin/env python3
"""
Fetch MHCLG's Revenue Outturn multi-year time series CSV (2017-18 to
2024-25 currently) and save it under data/raw with a dated filename, so
every pipeline run keeps a snapshot of what it actually parsed.

Source page:
https://www.gov.uk/government/statistics/local-authority-revenue-expenditure-and-financing-england-revenue-outturn-multi-year-data-set

Confirmed working source URL as of 2026-08-07:
https://assets.publishing.service.gov.uk/media/6937fe05e447374889cd8f4b/Revenue_Outturn_time_series_data_v3.1.csv

NOTE: MHCLG's asset URLs are content-hashed and change with every new
release (the version number in the filename, v3.1 here, bumps too) —
this script's DATA_URL will need updating by hand each time MHCLG
publishes a new outturn covering a further year. There is no stable
"latest" URL to point at, so the annual refresh is not fully hands-off;
check the source page above once a year (outturn for year N is usually
published around June of year N+1).
"""
import datetime
import pathlib
import urllib.request

DATA_URL = "https://assets.publishing.service.gov.uk/media/6937fe05e447374889cd8f4b/Revenue_Outturn_time_series_data_v3.1.csv"
FILE_LABEL = "Revenue_Outturn_time_series_v3.1"

RAW_DIR = pathlib.Path(__file__).resolve().parent.parent / "data" / "raw"


def fetch() -> pathlib.Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.date.today().isoformat()
    dest = RAW_DIR / f"{FILE_LABEL}_{stamp}.csv"
    print(f"Downloading {DATA_URL}")
    urllib.request.urlretrieve(DATA_URL, dest)
    size_kb = dest.stat().st_size / 1024
    print(f"Saved {dest} ({size_kb:.0f} KB)")
    return dest


if __name__ == "__main__":
    fetch()
