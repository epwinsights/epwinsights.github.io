"""
EPW Insights
Author: Ehsan Rostami - https://github.com/ehsan-rostami
Copyright (c) 2025-2026 Ehsan Rostami
Released under the GNU Affero General Public License v3.0 or later.

validate_precision_pipeline.py
===============================
Validates the precision-reduction and binarization stages of
build_climate_tiles.py (its "reduce" and "binarize" stages) by comparing
three snapshots of the same data:

  1. source (full-precision JSON) vs. 01_rounded (rounded to DECIMALS places)
     Checks that rounding error never exceeds 0.5 * 10^-DECIMALS.

  2. 01_rounded vs. 02_binary (Int8/Int16 quantized)
     Checks that binarization adds effectively no error beyond the rounded
     input's own precision -- expected, since the default scale (10.0)
     matches 01_rounded's precision exactly wherever no per-field scale
     reduction was needed.

  3. source vs. 02_binary (end to end)
     The total error the deployed web app actually sees.

For any field where the per-field scale had to be reduced below the
default 10.0 to avoid Int16 overflow (see build_climate_tiles.py), the
expected tolerance for stages 2 and 3 is derived from that field's actual
scale, not the default -- so a reduced-scale field is correctly validated
against its own (still small) worst-case error rather than flagged as a
false mismatch.

Requirements
------------
    pip install numpy

Usage
-----
    python validate_precision_pipeline.py \\
        --source-dir /path/to/full-precision-json \\
        --build-dir /path/to/build-output

--build-dir is the same --output-dir passed to build_climate_tiles.py; this
script reads its 01_rounded and 02_binary subfolders and writes its reports
into 02_binary.
"""

import argparse
import csv
import json
from pathlib import Path

import numpy as np

GRID_BASE = "climate-grid-index"
DEFAULT_DECIMALS = 1

VARIABLE_FILES = [
    f"climate-{kind}-{ssp}-{period}"
    for kind in ("indices", "temp")
    for ssp in ("ssp126", "ssp245", "ssp370", "ssp585")
    for period in ("2030", "2050", "2080")
]

# Small slack for float64 round-off (not for the quantization itself).
TOL_SLACK = 1.001
FLOAT_EPS = 1e-6


# ---------------------------------------------------------------------------
# Generic field comparison
# ---------------------------------------------------------------------------

def validate_field(name, original_flat, other_flat, expected_max_err):
    orig_nan = np.isnan(original_flat)
    other_nan = np.isnan(other_flat)
    nodata_mismatch = int(np.sum(orig_nan != other_nan))

    valid_mask = (~orig_nan) & (~other_nan)
    n_valid = int(valid_mask.sum())

    if n_valid == 0:
        max_err = 0.0
        mean_err = 0.0
    else:
        diffs = np.abs(original_flat[valid_mask] - other_flat[valid_mask])
        max_err = float(np.max(diffs))
        mean_err = float(np.mean(diffs))

    status = "OK" if (max_err <= expected_max_err * TOL_SLACK + FLOAT_EPS
                       and nodata_mismatch == 0) else "MISMATCH"

    return {
        "field": name,
        "n_values": n_valid,
        "nodata_mismatch": nodata_mismatch,
        "max_error": max_err,
        "mean_error": mean_err,
        "expected_max_error": expected_max_err,
        "status": status,
    }


def write_report(results, out_path_json: Path, out_path_csv: Path):
    with open(out_path_json, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    with open(out_path_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["field", "n_values", "nodata_mismatch", "max_error",
                          "mean_error", "expected_max_error", "status"])
        for r in results:
            writer.writerow([r["field"], r["n_values"], r["nodata_mismatch"],
                              r["max_error"], r["mean_error"], r["expected_max_error"], r["status"]])


def print_summary(title, results):
    n_ok = sum(1 for r in results if r["status"] == "OK")
    n_bad = sum(1 for r in results if r["status"] != "OK")
    global_max = max((r["max_error"] for r in results), default=0.0)
    total_mismatch = sum(r["nodata_mismatch"] for r in results)
    print("\n" + "-" * 70)
    print(title)
    print(f"  Fields checked   : {len(results)}")
    print(f"  OK               : {n_ok}")
    print(f"  MISMATCH         : {n_bad}")
    print(f"  Max absolute err : {global_max}")
    print(f"  nodata mismatches: {total_mismatch}")
    if n_bad == 0 and total_mismatch == 0:
        print("  >>> Result: this stage is fully within tolerance.")
    else:
        print("  >>> Result: mismatch found -- see the CSV report for details.")
    print("-" * 70)
    return n_ok, n_bad, total_mismatch


# ---------------------------------------------------------------------------
# Reading source / rounded JSON (same structure for both)
# ---------------------------------------------------------------------------

def load_grid_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    grid = raw["grid"]
    lat = np.array([c["lat"] for c in grid], dtype=np.float64)
    lon = np.array([c["lon"] for c in grid], dtype=np.float64)
    return {"lat": lat, "lon": lon}


def load_variable_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    meta = raw.get("_meta", {})
    variables = meta.get("variables", list(raw.get("data", {}).keys()))
    out = {}
    for var in variables:
        out[var] = {}
        for stat in ("mean", "std"):
            if var not in raw["data"] or stat not in raw["data"][var]:
                continue
            arr = np.array(raw["data"][var][stat], dtype=np.float64).flatten()
            out[var][stat] = arr
    return out


# ---------------------------------------------------------------------------
# Reading the binarized data (Int8/Int16, decoded back to float)
# ---------------------------------------------------------------------------

def load_binary_buffers(manifest: dict, base_dir: Path):
    loaded = {}
    for dtype, fname in manifest.get("buffers", {}).items():
        np_dtype = np.int8 if dtype == "int8" else np.int16
        loaded[dtype] = np.fromfile(base_dir / fname, dtype=np_dtype)
    return loaded


def decode_field(buffers, dtype, offset, count, scale, nodata_dict):
    """scale here is specific to this one field, not a global constant."""
    nodata = nodata_dict[dtype]
    raw = buffers[dtype][offset: offset + count].astype(np.float64)
    return np.where(raw == nodata, np.nan, raw / scale)


def load_grid_binary(base_dir: Path):
    manifest_path = base_dir / f"{GRID_BASE}.manifest.json"
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    buffers = load_binary_buffers(manifest, base_dir)
    n = manifest["nCells"]
    nodata_dict = manifest["nodata"]

    out = {}
    for name in ("lat", "lon"):
        info = manifest["fields"][name]
        arr = decode_field(buffers, info["dtype"], info["offset"], n, info["scale"], nodata_dict)
        out[name] = (arr, info["scale"])
    return out


def load_variable_binary(base: str, base_dir: Path):
    manifest_path = base_dir / f"{base}.manifest.json"
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    buffers = load_binary_buffers(manifest, base_dir)
    n_cells = manifest["nCells"]
    months = manifest.get("monthsPerCell")
    nodata_dict = manifest["nodata"]
    count = n_cells * months if months else n_cells

    out = {}
    for var, stats in manifest["variables"].items():
        out[var] = {}
        for stat, info in stats.items():
            arr = decode_field(buffers, info["dtype"], info["offset"], count, info["scale"], nodata_dict)
            out[var][stat] = (arr, info["scale"])
    return out


# ---------------------------------------------------------------------------
# Running all three comparisons for one file
# ---------------------------------------------------------------------------

def validate_grid_all(source_dir, rounded_dir, binary_dir, decimals):
    source = load_grid_json(source_dir / f"{GRID_BASE}.json")
    rounded = load_grid_json(rounded_dir / f"{GRID_BASE}.json")
    binary = load_grid_binary(binary_dir)  # {"lat": (arr, scale), "lon": (arr, scale)}

    tol_round = 0.5 * (10 ** -decimals)  # source -> rounded

    r_source_vs_rounded, r_rounded_vs_binary, r_source_vs_binary = [], [], []
    for name in ("lat", "lon"):
        fname = f"{GRID_BASE}.{name}"
        arr_binary, field_scale = binary[name]
        tol_binary = 0.5 / field_scale  # based on this field's actual scale
        r_source_vs_rounded.append(validate_field(fname, source[name], rounded[name], tol_round))
        r_rounded_vs_binary.append(validate_field(fname, rounded[name], arr_binary, tol_binary))
        # end-to-end tolerance = rounding error + quantization error (sum of both bounds)
        r_source_vs_binary.append(validate_field(fname, source[name], arr_binary, tol_round + tol_binary))
    return r_source_vs_rounded, r_rounded_vs_binary, r_source_vs_binary


def validate_variable_file_all(base, source_dir, rounded_dir, binary_dir, decimals):
    source = load_variable_json(source_dir / f"{base}.json")
    rounded = load_variable_json(rounded_dir / f"{base}.json")
    binary = load_variable_binary(base, binary_dir)  # var -> stat -> (arr, scale)

    tol_round = 0.5 * (10 ** -decimals)

    r_source_vs_rounded, r_rounded_vs_binary, r_source_vs_binary = [], [], []
    for var, stats in source.items():
        for stat, arr_source in stats.items():
            fname = f"{base}.{var}.{stat}"
            arr_rounded = rounded[var][stat]
            arr_binary, field_scale = binary[var][stat]
            tol_binary = 0.5 / field_scale  # this field's own scale, possibly below the 10.0 default
            r_source_vs_rounded.append(validate_field(fname, arr_source, arr_rounded, tol_round))
            r_rounded_vs_binary.append(validate_field(fname, arr_rounded, arr_binary, tol_binary))
            r_source_vs_binary.append(validate_field(fname, arr_source, arr_binary, tol_round + tol_binary))
    return r_source_vs_rounded, r_rounded_vs_binary, r_source_vs_binary


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source-dir", type=Path, required=True,
                         help="Full-precision source JSON directory (same one passed to "
                              "build_climate_tiles.py as --source-dir).")
    parser.add_argument("--build-dir", type=Path, required=True,
                         help="build_climate_tiles.py's --output-dir. Its 01_rounded and "
                              "02_binary subfolders are read; reports are written into 02_binary.")
    parser.add_argument("--decimals", type=int, default=DEFAULT_DECIMALS,
                         help=f"Must match the --decimals value used for the build (default: {DEFAULT_DECIMALS}).")
    args = parser.parse_args()

    rounded_dir = args.build_dir / "01_rounded"
    binary_dir = args.build_dir / "02_binary"

    for d, label in ((args.source_dir, "source"), (rounded_dir, "01_rounded"), (binary_dir, "02_binary")):
        if not d.is_dir():
            parser.error(f"{label} directory not found: {d}")

    all_source_vs_rounded, all_rounded_vs_binary, all_source_vs_binary = [], [], []

    print(f"Validating {GRID_BASE} ...")
    try:
        r1, r2, r3 = validate_grid_all(args.source_dir, rounded_dir, binary_dir, args.decimals)
        all_source_vs_rounded += r1
        all_rounded_vs_binary += r2
        all_source_vs_binary += r3
    except Exception as e:
        print(f"  [error] {e}")

    for base in VARIABLE_FILES:
        print(f"Validating {base} ...")
        try:
            r1, r2, r3 = validate_variable_file_all(base, args.source_dir, rounded_dir, binary_dir, args.decimals)
            all_source_vs_rounded += r1
            all_rounded_vs_binary += r2
            all_source_vs_binary += r3
        except Exception as e:
            print(f"  [error] {e}")

    print_summary("Comparison 1: source (full precision) vs. 01_rounded", all_source_vs_rounded)
    print_summary("Comparison 2: 01_rounded vs. 02_binary (quantized)", all_rounded_vs_binary)
    print_summary("Comparison 3: source vs. 02_binary -- end to end", all_source_vs_binary)

    write_report(all_source_vs_rounded,
                 binary_dir / "validation_source_vs_rounded.json",
                 binary_dir / "validation_source_vs_rounded.csv")
    write_report(all_rounded_vs_binary,
                 binary_dir / "validation_rounded_vs_binary.json",
                 binary_dir / "validation_rounded_vs_binary.csv")
    write_report(all_source_vs_binary,
                 binary_dir / "validation_source_vs_binary.json",
                 binary_dir / "validation_source_vs_binary.csv")

    print(f"\nThree detailed reports saved under {binary_dir}:")
    print("  validation_source_vs_rounded.csv/json  (rounding error)")
    print("  validation_rounded_vs_binary.csv/json  (quantization error)")
    print("  validation_source_vs_binary.csv/json   (end-to-end error)")


if __name__ == "__main__":
    main()
