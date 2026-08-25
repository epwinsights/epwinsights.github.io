"""
EPW Insights
Author: Ehsan Rostami - https://github.com/ehsan-rostami
Copyright (c) 2025-2026 Ehsan Rostami
Released under the GNU Affero General Public License v3.0 or later.

decode_and_compare.py

Decodes a merged_v5-style binary tile set (grid index + one indices file +
one temp file, all Int8/Int16 quantized with a manifest.json per file) at a
chosen set of coordinates, and optionally cross-checks the decoded values
against a report produced by independent_verify_all.py.

Decoding follows the same raw/scale, nodata-aware logic as
decodeCellField() in climate-tile-loader.js and decode_field() in
validate_precision_pipeline.py, reimplemented independently here.

Usage
-----
    # Decode only, print to console:
    python decode_and_compare.py \
        --data-dir /path/to/merged_v5 \
        --ssp ssp245 --period 2050 \
        --lat 35.5 --lon 51.5 --location-name Tehran_IR

    # Decode and cross-check against an independent_verify_all.py report:
    python decode_and_compare.py \
        --data-dir /path/to/merged_v5 \
        --ssp ssp245 --period 2050 \
        --lat 35.5 --lon 51.5 --location-name Tehran_IR \
        --compare-report independent_verify_all_results.txt

Multiple --lat/--lon/--location-name triples can be given (repeat all
three flags in matching order) to decode several locations in one run.

Expected file naming in --data-dir (matching merge_deltas.py / the
binarize stage of build_climate_tiles.py):
    climate-grid-index.i16.bin
    climate-grid-index.manifest.json
    climate-indices-<ssp>-<period>.i8.bin
    climate-indices-<ssp>-<period>.i16.bin
    climate-indices-<ssp>-<period>.manifest.json
    climate-temp-<ssp>-<period>.i8.bin
    climate-temp-<ssp>-<period>.manifest.json
"""

import argparse
import json
import math
import re
from pathlib import Path
from statistics import mean

import numpy as np

INDEX_VARS = ["cdd", "hdd", "fd", "tx35", "tx40", "tropical_nights", "txx", "tnn"]
TEMP_VARS = ["tas", "tasmax", "tasmin"]

HEADER_RE = re.compile(r"variable=(\S+) ssp=(\S+) period=(\S+) location=(\S+)")


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    to_rad = math.pi / 180.0
    dlat = (lat2 - lat1) * to_rad
    dlon = (lon2 - lon1) * to_rad
    a = (math.sin(dlat / 2) ** 2
         + math.cos(lat1 * to_rad) * math.cos(lat2 * to_rad) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def load_buffer(path, dtype):
    np_dtype = np.int8 if dtype == "int8" else np.int16
    return np.fromfile(path, dtype=np_dtype)


def load_grid(data_dir):
    manifest = json.load(open(data_dir / "climate-grid-index.manifest.json"))
    buf = load_buffer(data_dir / manifest["buffers"]["int16"], "int16")
    n_cells = manifest["nCells"]
    nodata = manifest["nodata"]["int16"]

    def decode_field(field_info):
        raw = buf[field_info["offset"]: field_info["offset"] + n_cells]
        return np.where(raw == nodata, np.nan, raw / field_info["scale"])

    lat = decode_field(manifest["fields"]["lat"])
    lon = decode_field(manifest["fields"]["lon"])
    return lat, lon, n_cells


def find_nearest_cell(lat_arr, lon_arr, n_cells, target_lat, target_lon):
    best_idx, best_dist = None, None
    for i in range(n_cells):
        la, lo = lat_arr[i], lon_arr[i]
        if np.isnan(la) or np.isnan(lo):
            continue
        d = haversine_km(target_lat, target_lon, la, lo)
        if best_dist is None or d < best_dist:
            best_dist, best_idx = d, i
    return best_idx, best_dist, lat_arr[best_idx], lon_arr[best_idx]


def decode_scalar_field(buffers, manifest, varname, stat, cell_index):
    info = manifest["variables"][varname][stat]
    nodata = manifest["nodata"][info["dtype"]]
    raw = buffers[info["dtype"]][info["offset"] + cell_index]
    return None if raw == nodata else float(raw) / info["scale"]


def decode_monthly_field(buffers, manifest, varname, stat, cell_index):
    info = manifest["variables"][varname][stat]
    nodata = manifest["nodata"][info["dtype"]]
    months_per_cell = manifest.get("monthsPerCell", 1)
    start = info["offset"] + cell_index * months_per_cell
    raw = buffers[info["dtype"]][start:start + months_per_cell]
    return [None if r == nodata else float(r) / info["scale"] for r in raw]


def decode_locations(data_dir, ssp, period, locations):
    lat_arr, lon_arr, n_cells = load_grid(data_dir)

    indices_manifest = json.load(open(data_dir / f"climate-indices-{ssp}-{period}.manifest.json"))
    indices_buffers = {}
    for dtype, fname in indices_manifest["buffers"].items():
        indices_buffers[dtype] = load_buffer(data_dir / fname, dtype)

    temp_manifest = json.load(open(data_dir / f"climate-temp-{ssp}-{period}.manifest.json"))
    temp_buffers = {}
    for dtype, fname in temp_manifest["buffers"].items():
        temp_buffers[dtype] = load_buffer(data_dir / fname, dtype)

    results = {}
    for loc_name, target_lat, target_lon in locations:
        cell_idx, dist_km, resolved_lat, resolved_lon = find_nearest_cell(
            lat_arr, lon_arr, n_cells, target_lat, target_lon
        )
        loc_result = {
            "cell_index": int(cell_idx),
            "resolved_lat": float(resolved_lat),
            "resolved_lon": float(resolved_lon),
            "distance_km": round(dist_km, 3),
        }
        for var in INDEX_VARS:
            loc_result[var] = {
                "mean": decode_scalar_field(indices_buffers, indices_manifest, var, "mean", cell_idx),
                "std": decode_scalar_field(indices_buffers, indices_manifest, var, "std", cell_idx),
            }
        for var in TEMP_VARS:
            loc_result[var] = {
                "mean": decode_monthly_field(temp_buffers, temp_manifest, var, "mean", cell_idx),
                "std": decode_monthly_field(temp_buffers, temp_manifest, var, "std", cell_idx),
            }
        results[loc_name] = loc_result

    return results


def load_independent_report(report_path, ssp, period):
    raw = report_path.read_text(encoding="utf-8")
    independent = {}
    for block in raw.strip().split("\n\n"):
        lines = block.splitlines()
        m = HEADER_RE.match(lines[0]) if lines else None
        if not m:
            continue
        variable, block_ssp, block_period, location = m.groups()
        if block_ssp != ssp or block_period != period:
            continue
        fields = {}
        for line in lines[1:]:
            if "=" not in line:
                continue
            key, val = line.split("=", 1)
            fields[key.strip()] = val.strip()

        val_str = fields["delta"].strip()
        if val_str.startswith("["):
            value = [float(x) for x in val_str.strip("[]").split(",")]
        else:
            value = float(val_str)
        independent[(variable, location)] = value
    return independent


def compare(decoded, independent, locations):
    print(f"\n{'variable':18s} {'location':14s} {'independent':>14s} {'decoded':>12s} {'abs_error':>10s}")
    print("-" * 74)
    max_error = 0.0
    for loc_name, _, _ in locations:
        for var in INDEX_VARS:
            ind_val = independent.get((var, loc_name))
            dec_val = decoded[loc_name][var]["mean"]
            if ind_val is None or dec_val is None:
                print(f"{var:18s} {loc_name:14s} {'MISSING':>14s}")
                continue
            err = abs(ind_val - dec_val)
            max_error = max(max_error, err)
            print(f"{var:18s} {loc_name:14s} {ind_val:14.2f} {dec_val:12.2f} {err:10.2f}")

        for var in TEMP_VARS:
            ind_val = independent.get((var, loc_name))
            dec_val = decoded[loc_name][var]["mean"]
            if ind_val is None or dec_val is None:
                print(f"{var:18s} {loc_name:14s} {'MISSING':>14s}")
                continue
            errors = [abs(a - b) for a, b in zip(ind_val, dec_val)]
            err = max(errors)
            max_error = max(max_error, err)
            print(f"{var:18s} {loc_name:14s} {'(monthly)':>14s} {'max_err=':>0s}{err:.2f}")

    print(f"\nMax absolute error across all compared values: {max_error:.3f}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-dir", type=Path, required=True,
                         help="Directory containing the binary tiles and manifest.json files.")
    parser.add_argument("--ssp", required=True, choices=["ssp126", "ssp245", "ssp370", "ssp585"])
    parser.add_argument("--period", required=True, choices=["2030", "2050", "2080"])
    parser.add_argument("--lat", type=float, action="append", required=True)
    parser.add_argument("--lon", type=float, action="append", required=True)
    parser.add_argument("--location-name", action="append", required=True)
    parser.add_argument("--compare-report", type=Path,
                         help="Optional independent_verify_all.py-format report to cross-check against.")
    parser.add_argument("--output", type=Path,
                         help="Optional path to write the decoded values as JSON.")
    args = parser.parse_args()

    if not (len(args.lat) == len(args.lon) == len(args.location_name)):
        parser.error("--lat, --lon, and --location-name must be given the same number of times")

    locations = list(zip(args.location_name, args.lat, args.lon))

    decoded = decode_locations(args.data_dir, args.ssp, args.period, locations)

    for loc_name, target_lat, target_lon in locations:
        r = decoded[loc_name]
        print(f"{loc_name}: requested=({target_lat},{target_lon}) "
              f"resolved cell #{r['cell_index']} at ({r['resolved_lat']},{r['resolved_lon']}), "
              f"{r['distance_km']} km away")

    if args.output:
        args.output.write_text(json.dumps(decoded, indent=2))
        print(f"\nWrote {args.output.resolve()}")

    if args.compare_report:
        independent = load_independent_report(args.compare_report, args.ssp, args.period)
        compare(decoded, independent, locations)


if __name__ == "__main__":
    main()
