r"""
EPW Insights
Author: Ehsan Rostami - https://github.com/ehsan-rostami
Copyright (c) 2025-2026 Ehsan Rostami
Released under the GNU Affero General Public License v3.0 or later.

merge_deltas.py

Combines the 132 per-(variable, ssp, period) delta JSON files produced by
extract_climate_deltas.py into 3 compact files:

  1. climate-grid-index.json
       One shared list of {lat, lon} for all 24,257 land cells (built once
       from the first file, then verified identical across all 132 files).
       tas/tasmax/tasmin AND the 8 index variables all reference this same
       list by POSITION (integer index), instead of repeating lat/lon in
       every file.

  2. climate-deltas-temperature.json
       tas / tasmax / tasmin. For each (ssp, period): "mean" and "std" are
       each a (24257 x 12) nested array -- one row per grid cell (same
       order as climate-grid-index.json), 12 monthly values per row.

  3. climate-deltas-indices.json
       cdd / hdd / fd / tx35 / tx40 / tropical_nights / txx / tnn. For each
       (variable, ssp, period): "mean" and "std" are each a flat 24257-
       length array (one scalar per grid cell, same order as the grid
       index).

Usage:
  python merge_deltas.py --input-list "E:\CMIP6\json_files.txt" --out-dir "E:\CMIP6\merged"

  (--input-list points at a text file with one quoted path per line, same
  format as the "json files.txt" you already have.)

Safety checks built in (this is exactly the kind of step where a silent
mistake -- e.g. two files secretly having different grids after some
manual re-run -- would be very easy to miss until much later):
  - Every one of the 132 files must have EXACTLY the same set of (lat, lon)
    cells as the first file. If any file's grid differs even by one cell,
    the script stops and tells you which file and how it differs, rather
    than silently misaligning data.
  - Every "monthly"-type file must have exactly 12 values per cell; every
    "scalar"-type file must have exactly 1. Mismatches raise an error.
"""

import argparse
import json
from pathlib import Path
from collections import defaultdict

TEMPERATURE_VARS = {"tas", "tasmax", "tasmin"}
INDEX_VARS = {"cdd", "hdd", "fd", "tx35", "tx40", "tropical_nights", "txx", "tnn"}


def parse_filename(path):
    """deltas_<var>_<ssp>_<period>.json -> (var, ssp, period)
    var itself may contain underscores (tropical_nights), so we parse from
    the right: last token is period, second-to-last is ssp, everything
    else (after the "deltas_" prefix) is the variable name."""
    stem = Path(path).stem  # e.g. "deltas_tropical_nights_ssp126_2030"
    parts = stem.split("_")
    assert parts[0] == "deltas", f"Unexpected filename (must start with 'deltas_'): {path}"
    period = parts[-1]
    ssp = parts[-2]
    varname = "_".join(parts[1:-2])
    return varname, ssp, period


def load_input_list(list_path):
    paths = []
    with open(list_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip().strip('"')
            if line:
                paths.append(line)
    return paths


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input-list", required=True, help="text file with one quoted json path per line")
    p.add_argument("--out-dir", required=True)
    p.add_argument("--decimals", type=int, default=2)
    args = p.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    paths = load_input_list(args.input_list)
    print(f"Found {len(paths)} input files listed.")

    canonical_key = None       # sorted list of (lat, lon) tuples, the reference grid
    canonical_lookup = None    # (lat, lon) -> position in canonical_key

    temperature_data = defaultdict(lambda: defaultdict(dict))  # var -> ssp -> period -> {"mean":..., "std":...}
    indices_data = defaultdict(lambda: defaultdict(dict))

    for i, path in enumerate(paths):
        varname, ssp, period = parse_filename(path)
        with open(path, "r", encoding="utf-8") as f:
            d = json.load(f)

        cells = d["cells"]
        this_key = sorted((c["lat"], c["lon"]) for c in cells)

        if canonical_key is None:
            canonical_key = this_key
            canonical_lookup = {k: idx for idx, k in enumerate(canonical_key)}
            print(f"Reference grid established from {Path(path).name}: {len(canonical_key)} cells.")
        else:
            if this_key != canonical_key:
                # Pinpoint the difference instead of just failing generically.
                set_a, set_b = set(canonical_key), set(this_key)
                only_here = set_b - set_a
                only_ref = set_a - set_b
                raise ValueError(
                    f"Grid mismatch in {path}!\n"
                    f"  Cells only in this file (not in reference): {len(only_here)} "
                    f"(e.g. {list(only_here)[:3]})\n"
                    f"  Cells only in reference (missing from this file): {len(only_ref)} "
                    f"(e.g. {list(only_ref)[:3]})"
                )

        # reorder this file's cells into canonical position order
        ordered = [None] * len(canonical_key)
        for c in cells:
            pos = canonical_lookup[(c["lat"], c["lon"])]
            ordered[pos] = c

        is_monthly = varname in TEMPERATURE_VARS
        if is_monthly:
            for c in ordered:
                assert isinstance(c["mean"], list) and len(c["mean"]) == 12, \
                    f"{path}: expected 12 monthly values, got {c['mean']}"
            mean_arr = [[round(v, args.decimals) for v in c["mean"]] for c in ordered]
            std_arr = [[round(v, args.decimals) for v in c["std"]] for c in ordered]
            temperature_data[varname][ssp][period] = {"mean": mean_arr, "std": std_arr}
        else:
            for c in ordered:
                assert isinstance(c["mean"], (int, float)), \
                    f"{path}: expected a scalar value, got {c['mean']}"
            mean_arr = [round(c["mean"], args.decimals) for c in ordered]
            std_arr = [round(c["std"], args.decimals) for c in ordered]
            indices_data[varname][ssp][period] = {"mean": mean_arr, "std": std_arr}

        if (i + 1) % 20 == 0 or (i + 1) == len(paths):
            print(f"  ...processed {i + 1}/{len(paths)}")

    # ---- write grid index ----
    grid_index = [{"lat": lat, "lon": lon} for lat, lon in canonical_key]
    grid_path = out_dir / "climate-grid-index.json"
    with open(grid_path, "w") as f:
        json.dump({"_meta": {"nCells": len(grid_index)}, "grid": grid_index}, f, separators=(",", ":"))
    print(f"Wrote {grid_path} ({len(grid_index)} cells)")

    # ---- write ONE small file per (ssp, period) combo, not one giant file ----
    # This lets the app lazy-load only the scenario/period the user actually
    # has selected (state.climateMorphing.ssp / .targetYear), instead of
    # shipping all 4 SSPs x 3 periods at once.
    all_ssps = sorted({ssp for var in temperature_data for ssp in temperature_data[var]}
                       | {ssp for var in indices_data for ssp in indices_data[var]})
    all_periods = sorted({period for var in temperature_data for ssp in temperature_data[var]
                           for period in temperature_data[var][ssp]}
                          | {period for var in indices_data for ssp in indices_data[var]
                             for period in indices_data[var][ssp]})

    written = []
    for ssp in all_ssps:
        for period in all_periods:
            temp_slice = {
                var: temperature_data[var][ssp][period]
                for var in temperature_data if period in temperature_data[var].get(ssp, {})
            }
            if temp_slice:
                fp = out_dir / f"climate-temp-{ssp}-{period}.json"
                with open(fp, "w") as f:
                    json.dump({
                        "_meta": {"ssp": ssp, "period": period, "gridFile": "climate-grid-index.json",
                                  "variables": sorted(temp_slice.keys()),
                                  "shape": "mean/std are (nCells x 12) arrays"},
                        "data": temp_slice,
                    }, f, separators=(",", ":"))
                written.append(fp)

            idx_slice = {
                var: indices_data[var][ssp][period]
                for var in indices_data if period in indices_data[var].get(ssp, {})
            }
            if idx_slice:
                fp = out_dir / f"climate-indices-{ssp}-{period}.json"
                with open(fp, "w") as f:
                    json.dump({
                        "_meta": {"ssp": ssp, "period": period, "gridFile": "climate-grid-index.json",
                                  "variables": sorted(idx_slice.keys()),
                                  "shape": "mean/std are flat nCells-length arrays"},
                        "data": idx_slice,
                    }, f, separators=(",", ":"))
                written.append(fp)

    print(f"\nWrote {len(written)} per-scenario files (lazy-loadable one at a time).")
    print("\nDone. File sizes:")
    print(f"  {grid_path.name}: {grid_path.stat().st_size / 1024 / 1024:.2f} MB")
    sizes = [fp.stat().st_size / 1024 / 1024 for fp in written]
    print(f"  climate-temp-*.json:    {sum(s for fp,s in zip(written,sizes) if 'temp' in fp.name)/max(1,sum('temp' in fp.name for fp in written)):.2f} MB avg x {sum('temp' in fp.name for fp in written)} files")
    print(f"  climate-indices-*.json: {sum(s for fp,s in zip(written,sizes) if 'indices' in fp.name)/max(1,sum('indices' in fp.name for fp in written)):.2f} MB avg x {sum('indices' in fp.name for fp in written)} files")
    print(f"  TOTAL on disk: {sum(sizes) + grid_path.stat().st_size/1024/1024:.2f} MB (but the app only fetches ~1 temp + 1 indices file per scenario selection)")


if __name__ == "__main__":
    main()