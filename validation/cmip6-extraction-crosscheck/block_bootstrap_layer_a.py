"""
EPW Insights
Author: Ehsan Rostami - https://github.com/ehsan-rostami
Copyright (c) 2025-2026 Ehsan Rostami
Released under the GNU Affero General Public License v3.0 or later.

block_bootstrap_layer_a.py

City-clustered block bootstrap for the Layer A external comparison
(compare_to_ipcc_atlas_multi.py's output, layer_a_comparison_tas.csv).

Why this is needed
-------------------
The 168 paired points in layer_a_comparison_tas.csv are 14 cities times
4 SSPs times 3 periods, not 168 independent observations. Within a city,
the 12 rows share the same historical baseline and the same regional
Atlas ensemble, so their errors are correlated. The Fisher z confidence
interval already reported for this comparison (and in Table 5) treats
n=168 as if every row were an independent draw, which understates the
true uncertainty in r.

This script re-estimates the 95% CI for the same Pearson r by resampling
whole cities with replacement (not individual rows), so that the within
city correlation structure is preserved in every bootstrap replicate.
The point estimate of r is not changed by this procedure, only its
confidence interval.

Method
------
For each of n_boot replicates:
    1. Draw 14 cities with replacement from the 14 distinct cities in
       the input file.
    2. Take all rows belonging to each drawn city (with repeats if a
       city is drawn more than once).
    3. Pool the resulting rows and compute Pearson r on
       (project_delta_tas, atlas_delta_tas) exactly as
       compare_to_ipcc_atlas_multi.py does.
Report the 2.5th and 97.5th percentiles of the resulting r distribution
as the block bootstrap 95% CI, alongside the naive row-level Fisher CI
for direct comparison.

Usage
-----
    python block_bootstrap_layer_a.py

Runs with no arguments from inside cmip6-extraction-crosscheck/, reading
results/layer_a_comparison_tas.csv relative to this script's own
location, so it works unmodified on any machine or OS the repository is
cloned onto. Pass --input-csv to point at a different file if needed.
"""

import argparse
import csv
import math
import random
from pathlib import Path
from statistics import mean

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_INPUT_CSV = SCRIPT_DIR / "results" / "layer_a_comparison_tas.csv"
DEFAULT_OUTPUT_SUMMARY = SCRIPT_DIR / "results" / "layer_a_block_bootstrap_summary.txt"


def load_rows(input_csv):
    by_city = {}
    with open(input_csv, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            city = row["location"]
            p_val = float(row["project_delta_tas"])
            a_val = float(row["atlas_delta_tas"])
            by_city.setdefault(city, []).append((p_val, a_val))
    return by_city


def pearson_r(pairs):
    p_vals = [p for p, a in pairs]
    a_vals = [a for p, a in pairs]
    p_mean, a_mean = mean(p_vals), mean(a_vals)
    cov = sum((p - p_mean) * (a - a_mean) for p, a in pairs)
    p_var = sum((p - p_mean) ** 2 for p in p_vals)
    a_var = sum((a - a_mean) ** 2 for a in a_vals)
    return cov / math.sqrt(p_var * a_var)


def fisher_ci(r, n, z=1.96):
    """Naive row-level 95% CI, treating all n rows as independent (matches
    Table 5 / compare_to_ipcc_atlas_multi.py's own reported CI)."""
    zr = math.atanh(r)
    se = 1 / math.sqrt(n - 3)
    return math.tanh(zr - z * se), math.tanh(zr + z * se)


def block_bootstrap_ci(by_city, n_boot, seed):
    rng = random.Random(seed)
    cities = list(by_city.keys())
    n_cities = len(cities)
    boot_rs = []
    for _ in range(n_boot):
        drawn_cities = rng.choices(cities, k=n_cities)
        pooled = []
        for city in drawn_cities:
            pooled.extend(by_city[city])
        boot_rs.append(pearson_r(pooled))
    boot_rs.sort()
    lo_idx = int(0.025 * n_boot)
    hi_idx = int(0.975 * n_boot) - 1
    return boot_rs[lo_idx], boot_rs[hi_idx], boot_rs


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input-csv", type=Path, default=DEFAULT_INPUT_CSV,
                         help=f"Path to layer_a_comparison_tas.csv (default: {DEFAULT_INPUT_CSV.relative_to(SCRIPT_DIR)}, "
                              "resolved relative to this script's own folder).")
    parser.add_argument("--output-summary", type=Path, default=DEFAULT_OUTPUT_SUMMARY,
                         help="Where to write the summary text file.")
    parser.add_argument("--n-boot", type=int, default=10000,
                         help="Number of bootstrap replicates (default: 10000).")
    parser.add_argument("--seed", type=int, default=42,
                         help="Random seed, for reproducibility (default: 42).")
    args = parser.parse_args()

    if not args.input_csv.is_file():
        parser.error(f"Input file not found: {args.input_csv}")

    by_city = load_rows(args.input_csv)
    n_cities = len(by_city)
    all_pairs = [pair for pairs in by_city.values() for pair in pairs]
    n_rows = len(all_pairs)

    r_point = pearson_r(all_pairs)
    fisher_lo, fisher_hi = fisher_ci(r_point, n_rows)
    boot_lo, boot_hi, boot_rs = block_bootstrap_ci(by_city, args.n_boot, args.seed)

    print(f"Input: {args.input_csv}")
    print(f"n = {n_rows} rows across {n_cities} cities")
    print(f"Pearson r (point estimate) = {r_point:.3f}")
    print(f"Row-level Fisher 95% CI    = {fisher_lo:.3f} to {fisher_hi:.3f}  (treats {n_rows} rows as independent)")
    print(f"City-block bootstrap 95% CI = {boot_lo:.3f} to {boot_hi:.3f}  ({args.n_boot} replicates, "
          f"resampling {n_cities} cities with replacement)")
    print(f"Bootstrap replicate range   = {min(boot_rs):.3f} to {max(boot_rs):.3f}")

    args.output_summary.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output_summary, "w", encoding="utf-8") as f:
        f.write("Layer A: city-clustered block bootstrap CI for Pearson r\n\n")
        f.write(f"Input: {args.input_csv.name}\n")
        f.write(f"n = {n_rows} rows across {n_cities} cities (14 cities x 4 SSPs x 3 periods)\n\n")
        f.write(f"Pearson r (point estimate)  = {r_point:.3f}\n")
        f.write(f"Row-level Fisher 95% CI     = {fisher_lo:.3f} to {fisher_hi:.3f}\n")
        f.write(f"  (naive; treats all {n_rows} rows as independent draws)\n\n")
        f.write(f"City-block bootstrap 95% CI = {boot_lo:.3f} to {boot_hi:.3f}\n")
        f.write(f"  ({args.n_boot} replicates, seed={args.seed}, resampling {n_cities} cities with replacement,\n")
        f.write(f"  pooling all rows of each drawn city so within-city correlation is preserved)\n")
        f.write(f"Bootstrap replicate range   = {min(boot_rs):.3f} to {max(boot_rs):.3f}\n")

    print(f"\nWrote {args.output_summary.resolve()}")


if __name__ == "__main__":
    main()
