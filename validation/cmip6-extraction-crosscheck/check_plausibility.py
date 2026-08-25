"""
EPW Insights
Author: Ehsan Rostami - https://github.com/ehsan-rostami
Copyright (c) 2025-2026 Ehsan Rostami
Released under the GNU Affero General Public License v3.0 or later.

check_plausibility.py

Automated physical-plausibility QA for the report produced by
independent_verify_all.py (or, with matching formatting, any similar
delta-extraction report). Checks, without needing any external reference
data:

    - Delta sign matches physical expectation per variable.
    - Delta magnitude is non-decreasing over time (2030 -> 2050 -> 2080)
      at fixed SSP/location.
    - Delta magnitude ordering across SSPs (126 -> 245 -> 370 -> 585) at
      fixed period/location, allowing a small tolerance for near-term
      internal variability (see the "SSP ordering" note below).
    - Ensemble member count is consistent across periods/locations for a
      given variable x SSP (a proxy for correct file/cell lookup).

Note on SSP ordering: near-term periods (especially 2030) are commonly
dominated by internal variability and by differences in which GCMs ran
which SSP, so a modest number of non-monotonic SSP orderings there is
expected, not necessarily a bug (Hawkins & Sutton, 2009). This script
flags them for review rather than treating them as failures; a real
extraction bug would show up as a much larger and more structural pattern
(e.g. wrong sign entirely, or violations persisting into 2080).

Usage
-----
    python check_plausibility.py --report independent_verify_all_results.txt
"""

import argparse
import json
import re
from pathlib import Path
from statistics import mean

EXPECTED_SIGN = {
    "tas": "positive", "tasmax": "positive", "tasmin": "positive",
    "cdd": "positive", "hdd": "negative",
    "tx35": "positive", "tx40": "positive", "fd": "negative",
    "tropical_nights": "positive", "txx": "positive", "tnn": "positive",
}

SSPS = ["ssp126", "ssp245", "ssp370", "ssp585"]
PERIODS = ["2030", "2050", "2080"]
MONOTONIC_TOLERANCE = 0.3

HEADER_RE = re.compile(r"variable=(\S+) ssp=(\S+) period=(\S+) location=(\S+)")


def parse_value(s):
    s = s.strip()
    if s.startswith("["):
        return [float(x) for x in s.strip("[]").split(",")]
    return float(s)


def parse_report(report_path):
    raw = report_path.read_text(encoding="utf-8")
    records = []
    for block in raw.strip().split("\n\n"):
        lines = block.splitlines()
        m = HEADER_RE.match(lines[0]) if lines else None
        if not m:
            continue
        variable, ssp, period, location = m.groups()
        fields = {}
        for line in lines[1:]:
            if "=" not in line:
                continue
            key, val = line.split("=", 1)
            fields[key.strip()] = val.strip()
        records.append({
            "variable": variable,
            "ssp": ssp,
            "period": period,
            "location": location,
            "mode": fields["mode"],
            "ensemble_n": int(fields["ensemble_n"]),
            "baseline": parse_value(fields["baseline"]),
            "future": parse_value(fields["future"]),
            "delta": parse_value(fields["delta"]),
            "future_std": parse_value(fields["future_std"]),
        })
    return records


def scalar_delta(record):
    d = record["delta"]
    return mean(d) if isinstance(d, list) else d


def is_monotonic_in_expected_direction(values, expected_sign):
    if expected_sign == "positive":
        return all(values[i] <= values[i + 1] + MONOTONIC_TOLERANCE for i in range(len(values) - 1))
    return all(values[i] >= values[i + 1] - MONOTONIC_TOLERANCE for i in range(len(values) - 1))


def check_ssp_monotonicity(records, by_key, variables, locations):
    issues = []
    for var in variables:
        expected_sign = EXPECTED_SIGN[var]
        for loc in locations:
            for period in PERIODS:
                deltas_by_ssp = []
                for ssp in SSPS:
                    r = by_key.get((var, ssp, period, loc))
                    if r is None:
                        issues.append(f"MISSING: variable={var} ssp={ssp} period={period} location={loc}")
                        continue
                    deltas_by_ssp.append((ssp, scalar_delta(r)))
                if len(deltas_by_ssp) == 4:
                    values = [d for _, d in deltas_by_ssp]
                    if not is_monotonic_in_expected_direction(values, expected_sign):
                        issues.append(
                            f"NON-MONOTONIC across SSP: variable={var} period={period} location={loc} "
                            f"deltas={deltas_by_ssp}"
                        )
    return issues


def check_period_monotonicity(records, by_key, variables, locations):
    issues = []
    for var in variables:
        expected_sign = EXPECTED_SIGN[var]
        for loc in locations:
            for ssp in SSPS:
                deltas_by_period = []
                for period in PERIODS:
                    r = by_key.get((var, ssp, period, loc))
                    if r is None:
                        continue
                    deltas_by_period.append((period, scalar_delta(r)))
                if len(deltas_by_period) == 3:
                    values = [d for _, d in deltas_by_period]
                    if not is_monotonic_in_expected_direction(values, expected_sign):
                        issues.append(
                            f"NON-MONOTONIC across period: variable={var} ssp={ssp} location={loc} "
                            f"deltas={deltas_by_period}"
                        )
    return issues


def check_sign(records):
    issues = []
    for r in records:
        d = scalar_delta(r)
        expected = EXPECTED_SIGN.get(r["variable"])
        if expected == "positive" and d < -0.05:
            issues.append(f"SIGN: expected positive delta, got {d:.2f} for "
                           f"variable={r['variable']} ssp={r['ssp']} period={r['period']} location={r['location']}")
        if expected == "negative" and d > 0.05:
            issues.append(f"SIGN: expected negative delta, got {d:.2f} for "
                           f"variable={r['variable']} ssp={r['ssp']} period={r['period']} location={r['location']}")
    return issues


def check_ensemble_consistency(records):
    issues = []
    n_by_var_ssp = {}
    for r in records:
        key = (r["variable"], r["ssp"])
        n_by_var_ssp.setdefault(key, set()).add(r["ensemble_n"])
    for key, n_set in n_by_var_ssp.items():
        if len(n_set) > 1:
            issues.append(f"ENSEMBLE_N INCONSISTENT within variable/ssp: {key} -> {n_set}")
    return issues


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--report", type=Path, required=True,
                         help="Path to the independent_verify_all_results.txt-format report.")
    parser.add_argument("--output", type=Path, default=Path("plausibility_report.json"),
                         help="Where to write the JSON summary (default: plausibility_report.json).")
    args = parser.parse_args()

    records = parse_report(args.report)
    print(f"Parsed {len(records)} records")

    by_key = {(r["variable"], r["ssp"], r["period"], r["location"]): r for r in records}
    variables = sorted(set(r["variable"] for r in records))
    locations = sorted(set(r["location"] for r in records))

    issues = []
    issues += check_ssp_monotonicity(records, by_key, variables, locations)
    issues += check_period_monotonicity(records, by_key, variables, locations)
    issues += check_sign(records)
    issues += check_ensemble_consistency(records)

    n_by_var = {}
    for r in records:
        n_by_var.setdefault(r["variable"], {})[r["ssp"]] = r["ensemble_n"]

    print("\nEnsemble sizes (future) by variable x SSP:")
    for var in variables:
        print(f"  {var:18s} " + "  ".join(f"{ssp}={n_by_var[var].get(ssp)}" for ssp in SSPS))

    print(f"\nTotal issues flagged: {len(issues)}")
    for issue in issues:
        print(" -", issue)

    args.output.write_text(json.dumps({
        "n_records": len(records),
        "n_issues": len(issues),
        "issues": issues,
    }, indent=2))
    print(f"\nWrote {args.output.resolve()}")


if __name__ == "__main__":
    main()
