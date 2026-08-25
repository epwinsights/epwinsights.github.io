"""
EPW Insights
Author: Ehsan Rostami - https://github.com/ehsan-rostami
Copyright (c) 2025-2026 Ehsan Rostami
Released under the GNU Affero General Public License v3.0 or later.

compare_to_ipcc_atlas_multi.py

Multi-point statistical comparison (MAE, RMSE, bias, Pearson r) between
the project's own tas deltas (from an independent_verify_all.py report)
and independently computed IPCC-WG1 Atlas regional ensemble-mean deltas,
across every combination of location, SSP, and period present in the
report.

A single-point comparison (see compare_to_ipcc_atlas.py) can only report
an absolute or relative difference. A correlation coefficient requires
multiple paired observations, so this script pairs the project's own tas
delta against the corresponding Atlas regional delta for every
(location, SSP, period) combination and computes the same MAE / RMSE /
Bias / Pearson r statistics already used for the self-consistency
benchmark (validate_morphing.mjs).

Each location must be mapped to its containing IPCC AR6 land region
acronym. This mapping is not computed automatically here (it only needs
to be done once per location, via a point-in-polygon test against
reference-regions/IPCC-WGI-reference-regions-v4_coordinates.csv in the
Atlas repo) and is passed in explicitly with --location-region.

Setup
-----
    git clone --depth 1 --filter=blob:none --sparse \\
        https://github.com/IPCC-WG1/Atlas.git atlas_repo
    cd atlas_repo
    git sparse-checkout set datasets-aggregated-regionally reference-regions

Usage
-----
    python compare_to_ipcc_atlas_multi.py \\
        --atlas-repo /path/to/atlas_repo \\
        --report independent_verify_all_results.txt \\
        --location-region Tehran_IR:WCA \\
        --location-region Sydney_AU:EAU \\
        --location-region Helsinki_FI:NEU
"""

import argparse
import csv
import math
import re
from pathlib import Path
from statistics import mean

SSPS = ["ssp126", "ssp245", "ssp370", "ssp585"]

PERIODS = [
    {"label": "2030", "start": 2021, "end": 2040},
    {"label": "2050", "start": 2041, "end": 2060},
    {"label": "2080", "start": 2081, "end": 2100},
]

BASELINE_START = 1995
BASELINE_END = 2014

HEADER_RE = re.compile(r"variable=(\S+) ssp=(\S+) period=(\S+) location=(\S+)")


def read_region_series(path, region):
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    header_idx = next(i for i, line in enumerate(lines) if line.startswith('"date"'))
    reader = csv.reader(lines[header_idx:])
    header = next(reader)
    col_idx = header.index(region)
    series = {}
    for row in reader:
        year = int(row[0].strip('"')[:4])
        series.setdefault(year, []).append(float(row[col_idx]))
    return series


def period_mean(series, start_year, end_year):
    values = []
    for year in range(start_year, end_year + 1):
        if year in series:
            values.extend(series[year])
    return mean(values) if values else None


def atlas_delta(atlas_dir, region, ssp, period_start, period_end):
    historical_files = sorted(atlas_dir.glob("CMIP6_*_historical_*.csv"))
    future_files = sorted(atlas_dir.glob(f"CMIP6_*_{ssp}_*.csv"))

    baseline_means = []
    for f in historical_files:
        m = period_mean(read_region_series(f, region), BASELINE_START, BASELINE_END)
        if m is not None:
            baseline_means.append(m)

    future_means = []
    for f in future_files:
        m = period_mean(read_region_series(f, region), period_start, period_end)
        if m is not None:
            future_means.append(m)

    return mean(future_means) - mean(baseline_means)


def load_project_tas(report_path):
    header_re = HEADER_RE
    raw = report_path.read_text(encoding="utf-8")
    project_tas = {}
    for block in raw.strip().split("\n\n"):
        lines = block.splitlines()
        m = header_re.match(lines[0]) if lines else None
        if not m:
            continue
        variable, ssp, period, location = m.groups()
        if variable != "tas":
            continue
        fields = {}
        for line in lines[1:]:
            if "=" in line:
                key, val = line.split("=", 1)
                fields[key.strip()] = val.strip()
        delta_str = fields["delta"].strip("[]")
        monthly = [float(x) for x in delta_str.split(",")]
        project_tas[(location, ssp, period)] = mean(monthly)
    return project_tas


def pearson_r(pairs):
    p_vals = [p for p, a in pairs]
    a_vals = [a for p, a in pairs]
    p_mean, a_mean = mean(p_vals), mean(a_vals)
    cov = sum((p - p_mean) * (a - a_mean) for p, a in pairs)
    p_var = sum((p - p_mean) ** 2 for p in p_vals)
    a_var = sum((a - a_mean) ** 2 for a in a_vals)
    return cov / math.sqrt(p_var * a_var)


def fisher_ci(r, n, z=1.96):
    """95% CI for a Pearson r via Fisher z transform (matches Table 5's method)."""
    if r is None or n < 4:
        return None, None
    zr = math.atanh(r)
    se = 1 / math.sqrt(n - 3)
    return math.tanh(zr - z * se), math.tanh(zr + z * se)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--atlas-repo", type=Path, required=True,
                         help="Path to the sparse-checked-out IPCC-WG1/Atlas repo.")
    parser.add_argument("--report", type=Path, required=True,
                         help="independent_verify_all.py-format report.")
    parser.add_argument("--location-region", action="append", required=True,
                         help="LOCATION:REGION pair, e.g. Tehran_IR:WCA. Repeatable.")
    parser.add_argument("--output-csv", type=Path,
                         help="Optional path to write one row per (location, ssp, period) pair.")
    parser.add_argument("--output-summary", type=Path,
                         help="Optional path to write the aggregate MAE/RMSE/Bias/r summary.")
    args = parser.parse_args()

    atlas_dir = args.atlas_repo / "datasets-aggregated-regionally" / "data" / "CMIP6" / "CMIP6_tas_landsea"
    if not atlas_dir.is_dir():
        parser.error(f"Expected data folder not found: {atlas_dir}")

    location_to_region = {}
    for pair in args.location_region:
        location, region = pair.split(":")
        location_to_region[location] = region

    project_tas = load_project_tas(args.report)

    atlas_cache = {}
    pairs = []
    rows = []

    print(f"{'location':14s} {'region':6s} {'ssp':8s} {'period':6s} {'project':>10s} {'atlas':>10s} {'diff':>8s}")
    print("-" * 70)

    for location, region in location_to_region.items():
        for ssp in SSPS:
            for period in PERIODS:
                key = (region, ssp, period["label"])
                if key not in atlas_cache:
                    atlas_cache[key] = atlas_delta(atlas_dir, region, ssp, period["start"], period["end"])
                a_val = atlas_cache[key]

                proj_key = (location, ssp, period["label"])
                if proj_key not in project_tas:
                    print(f"{location:14s} {region:6s} {ssp:8s} {period['label']:6s} {'MISSING':>10s}")
                    continue
                p_val = project_tas[proj_key]
                diff = p_val - a_val
                pairs.append((p_val, a_val))
                rows.append((location, region, ssp, period["label"], p_val, a_val, diff))
                print(f"{location:14s} {region:6s} {ssp:8s} {period['label']:6s} "
                      f"{p_val:10.3f} {a_val:10.3f} {diff:8.3f}")

    n = len(pairs)
    errors = [p - a for p, a in pairs]
    mae = mean(abs(e) for e in errors)
    rmse = math.sqrt(mean(e ** 2 for e in errors))
    bias = mean(errors)
    r = pearson_r(pairs)

    print("")
    print(f"n = {n} paired points ({len(location_to_region)} locations x "
          f"{len(SSPS)} SSPs x {len(PERIODS)} periods)")
    ci_lo, ci_hi = fisher_ci(r, n)
    print(f"MAE  = {mae:.3f} degC")
    print(f"RMSE = {rmse:.3f} degC")
    print(f"Bias = {bias:.3f} degC (positive means the project runs warmer than Atlas)")
    print(f"Pearson r = {r:.3f} (95% CI: {ci_lo:.3f} to {ci_hi:.3f})")
    print(f"R2 = {r ** 2:.3f}")

    if args.output_csv:
        with open(args.output_csv, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["location", "region", "ssp", "period",
                              "project_delta_tas", "atlas_delta_tas", "diff"])
            for location, region, ssp, period, p_val, a_val, diff in rows:
                writer.writerow([location, region, ssp, period,
                                  round(p_val, 3), round(a_val, 3), round(diff, 3)])
        print(f"\nWrote {args.output_csv.resolve()}")

    if args.output_summary:
        by_location = {}
        for location, region, ssp, period, p_val, a_val, diff in rows:
            by_location.setdefault(location, []).append(diff)

        with open(args.output_summary, "w", encoding="utf-8") as f:
            f.write("Layer A: external source comparison against IPCC-WG1 Atlas (tas)\n\n")
            f.write(f"n = {n} paired points ({len(location_to_region)} locations x "
                    f"{len(SSPS)} SSPs x {len(PERIODS)} periods)\n")
            f.write(f"MAE  = {mae:.3f} degC\n")
            f.write(f"RMSE = {rmse:.3f} degC\n")
            f.write(f"Bias = {bias:.3f} degC (positive means the project runs warmer than Atlas)\n")
            f.write(f"Pearson r = {r:.3f} (95% CI: {ci_lo:.3f} to {ci_hi:.3f})\n")
            f.write(f"R2 = {r ** 2:.3f}\n\n")
            f.write("Mean difference by location (project minus Atlas, averaged over all SSPs and periods):\n")
            for location, diffs in by_location.items():
                f.write(f"  {location:16s} mean_diff={mean(diffs):+.3f}  "
                        f"min={min(diffs):+.3f}  max={max(diffs):+.3f}\n")
        print(f"Wrote {args.output_summary.resolve()}")


if __name__ == "__main__":
    main()

