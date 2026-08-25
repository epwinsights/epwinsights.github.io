"""
EPW Insights
Author: Ehsan Rostami - https://github.com/ehsan-rostami
Copyright (c) 2025-2026 Ehsan Rostami
Released under the GNU Affero General Public License v3.0 or later.

compare_to_ipcc_atlas.py

Computes an independent ensemble-mean temperature delta for a chosen IPCC
AR6 reference region, using the official IPCC-WGI AR6 Atlas per-model
regional CSV archive (github.com/IPCC-WG1/Atlas,
datasets-aggregated-regionally/data/CMIP6/CMIP6_tas_landsea/). This
archive is independent of this project's own NetCDF download and
extraction code, so a match against it is a genuine external-source
validation, not a self-consistency check.

Each CSV in that archive is one CMIP6 model's monthly regional-mean
near-surface air temperature time series (already spatially averaged over
one of the 46 AR6 land regions with cosine-latitude weighting). This
script reads every available model file for the historical experiment and
for a chosen SSP, averages each model over the requested year ranges, and
takes the mean across models (ensemble mean) for the baseline and future
periods separately. The delta is future ensemble mean minus baseline
ensemble mean.

Caveat: this compares a REGION average (an area spanning several degrees
of latitude/longitude) against a single 1x1 degree grid cell value from
the project's own extraction. Some difference is expected from that
alone, on top of any difference in ensemble composition (this archive vs.
whichever CMIP6 subset the project's own NetCDF download contains). A
close match confirms the extraction is not grossly wrong; it is not a
precision check at the same level as comparing two independent
implementations against the same input files (see the Layer A0 checks).

Setup
-----
    git clone --depth 1 --filter=blob:none --sparse \
        https://github.com/IPCC-WG1/Atlas.git atlas_repo
    cd atlas_repo
    git sparse-checkout set datasets-aggregated-regionally reference-regions

Usage
-----
    python compare_to_ipcc_atlas.py \
        --atlas-repo /path/to/atlas_repo \
        --region WCA --ssp ssp245 \
        --baseline-start 1995 --baseline-end 2014 \
        --period-start 2041 --period-end 2060

Region acronyms are the standard IPCC AR6 land region codes (see
reference-regions/IPCC-WGI-reference-regions-v4_coordinates.csv in the
cloned repo for the full list and polygon vertices).
"""

import argparse
import csv
from pathlib import Path
from statistics import mean


def read_region_series(path, region):
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    header_idx = next(i for i, line in enumerate(lines) if line.startswith('"date"'))
    reader = csv.reader(lines[header_idx:])
    header = next(reader)
    col_idx = header.index(region)
    series = {}
    for row in reader:
        date = row[0].strip('"')
        year = int(date[:4])
        value = float(row[col_idx])
        series.setdefault(year, []).append(value)
    return series


def period_mean(series, start_year, end_year):
    values = []
    for year in range(start_year, end_year + 1):
        if year in series:
            values.extend(series[year])
    return mean(values) if values else None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--atlas-repo", type=Path, required=True,
                         help="Path to the sparse-checked-out IPCC-WG1/Atlas repo.")
    parser.add_argument("--region", required=True, help="AR6 region acronym, e.g. WCA.")
    parser.add_argument("--ssp", required=True, choices=["ssp126", "ssp245", "ssp370", "ssp585"])
    parser.add_argument("--baseline-start", type=int, default=1995)
    parser.add_argument("--baseline-end", type=int, default=2014)
    parser.add_argument("--period-start", type=int, required=True)
    parser.add_argument("--period-end", type=int, required=True)
    parser.add_argument("--compare-to", type=float,
                         help="Optional: the project's own delta for the same region/period, "
                              "to print a direct difference.")
    args = parser.parse_args()

    data_dir = args.atlas_repo / "datasets-aggregated-regionally" / "data" / "CMIP6" / "CMIP6_tas_landsea"
    if not data_dir.is_dir():
        parser.error(f"Expected data folder not found: {data_dir}")

    historical_files = sorted(data_dir.glob("CMIP6_*_historical_*.csv"))
    future_files = sorted(data_dir.glob(f"CMIP6_*_{args.ssp}_*.csv"))

    baseline_means = []
    for f in historical_files:
        series = read_region_series(f, args.region)
        m = period_mean(series, args.baseline_start, args.baseline_end)
        if m is not None:
            baseline_means.append(m)

    future_means = []
    for f in future_files:
        series = read_region_series(f, args.region)
        m = period_mean(series, args.period_start, args.period_end)
        if m is not None:
            future_means.append(m)

    baseline_ensemble_mean = mean(baseline_means)
    future_ensemble_mean = mean(future_means)
    delta = future_ensemble_mean - baseline_ensemble_mean

    print(f"Region: {args.region}")
    print(f"Baseline models: {len(baseline_means)}, "
          f"ensemble mean {args.baseline_start}-{args.baseline_end}: {baseline_ensemble_mean:.3f} degC")
    print(f"Future models:   {len(future_means)}, "
          f"ensemble mean {args.period_start}-{args.period_end}: {future_ensemble_mean:.3f} degC")
    print(f"Delta ({args.ssp}, {args.period_start}-{args.period_end} vs "
          f"{args.baseline_start}-{args.baseline_end}): {delta:.3f} degC")

    if args.compare_to is not None:
        diff = abs(delta - args.compare_to)
        print(f"\nProject's own delta: {args.compare_to:.3f} degC")
        print(f"Absolute difference: {diff:.3f} degC")


if __name__ == "__main__":
    main()
