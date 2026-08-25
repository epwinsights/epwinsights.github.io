"""
EPW Insights
Author: Ehsan Rostami[](https://github.com/ehsan-rostami)
Copyright (c) 2025-2026 Ehsan Rostami
Released under the GNU Affero General Public License v3.0 or later.

build_climate_tiles.py
=======================
Builds the CMIP6 climate tile dataset served by EPW Insights, from the
full-precision source JSON down to the small per-region binary tiles the
web app actually downloads.

Pipeline stages
----------------
1. reduce_precision  Round every value in the source JSON to DECIMALS
                      decimal places. This is a lossless-enough rounding
                      step done once, up front, so the binarization step
                      below never has to encode more precision than the
                      site actually needs.
2. binarize           Quantize the rounded JSON into Int8/Int16 buffers.
                      Each (variable, statistic) field gets its own scale
                      factor: 10.0 (0.1 precision) by default, automatically
                      reduced only for the specific fields where a value
                      anywhere on Earth would otherwise overflow Int16.
                      This is why, for example, heatingDegreeDays under the
                      higher-emission scenarios at the 2080 horizon ends up
                      with a slightly coarser scale than 10.0 -- expected
                      and validated (see validate_precision_pipeline.py),
                      with a worst-case rounding error on the order of
                      +/-0.05 to +/-0.07 degree-days.
3. tile               Adaptively splits the binarized data into small
                      geographic tiles (k-d tree on cell coordinates, split
                      on the median of whichever axis -- lat or lon -- has
                      the larger span, so tile boundaries are inherited
                      from the parent bounding box rather than the data's
                      own min/max, meaning every point on Earth, not just
                      existing grid cells, maps unambiguously to exactly
                      one tile). All 24 SSP/period combinations are merged
                      into a single combined file per tile, so a client
                      only ever downloads one small file for its location
                      no matter which scenario/year it later selects.

Requirements
------------
    pip install numpy

Usage
-----
    python build_climate_tiles.py \\
        --source-dir /path/to/full-precision-json \\
        --output-dir /path/to/build-output

    # Re-run a single stage only (e.g. after tweaking tiling parameters),
    # reusing the previous stage's output already present in --output-dir:
    python build_climate_tiles.py --output-dir ./build --only tile
"""

import argparse
import json
import os
from collections import Counter
from pathlib import Path

import numpy as np

GRID_BASE = "climate-grid-index"

# The 24 SSP-scenario / target-period combinations produced upstream by the
# CMIP6 processing step (not covered by this script). Every stage below
# operates on this same list, so it is defined once here instead of being
# duplicated per stage as in the original scripts.
VARIABLE_FILES = [
    f"climate-{kind}-{ssp}-{period}"
    for kind in ("indices", "temp")
    for ssp in ("ssp126", "ssp245", "ssp370", "ssp585")
    for period in ("2030", "2050", "2080")
]

DEFAULT_DECIMALS = 1
DEFAULT_TARGET_SCALE = 10.0
DEFAULT_MAX_CELLS_PER_TILE = 1500

NODATA_I8, MAX_I8, MIN_I8 = -128, 127, -127
NODATA_I16, MAX_I16, MIN_I16 = -32768, 32767, -32767
SAFETY_MARGIN = 0.999  # guards against round-off landing exactly on the dtype boundary


def human_size(n_bytes: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n_bytes < 1024:
            return f"{n_bytes:.1f} {unit}"
        n_bytes /= 1024
    return f"{n_bytes:.1f} TB"


# ---------------------------------------------------------------------------
# Stage 1: round every value to DECIMALS decimal places
# ---------------------------------------------------------------------------

def _round_value(v, decimals):
    if v is None:
        return None
    return round(v, decimals)


def _round_nested(obj, decimals):
    """Recurses into nested lists (flat, or nCells x 12 for monthly fields)."""
    if isinstance(obj, list):
        return [_round_nested(x, decimals) for x in obj]
    return _round_value(obj, decimals)


def _round_grid_file(in_path: Path, out_path: Path, decimals: int):
    with open(in_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    for cell in data["grid"]:
        cell["lat"] = _round_value(cell["lat"], decimals)
        cell["lon"] = _round_value(cell["lon"], decimals)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)


def _round_variable_file(in_path: Path, out_path: Path, decimals: int):
    with open(in_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    for var, stats in data["data"].items():
        for stat, arr in stats.items():
            data["data"][var][stat] = _round_nested(arr, decimals)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)


def stage_reduce_precision(source_dir: Path, out_dir: Path, decimals: int):
    print(f"\n=== Stage 1: reduce precision to {decimals} decimal place(s) ===")
    out_dir.mkdir(parents=True, exist_ok=True)

    report_rows = []
    for filename in [GRID_BASE + ".json"] + [f + ".json" for f in VARIABLE_FILES]:
        in_path = source_dir / filename
        out_path = out_dir / filename
        if not in_path.is_file():
            print(f"  [skip] not found: {in_path}")
            continue

        print(f"  {filename} ...", end=" ", flush=True)
        if filename == GRID_BASE + ".json":
            _round_grid_file(in_path, out_path, decimals)
        else:
            _round_variable_file(in_path, out_path, decimals)

        orig_size = in_path.stat().st_size
        new_size = out_path.stat().st_size
        reduction = 100 * (1 - new_size / orig_size) if orig_size else 0
        report_rows.append((filename, orig_size, new_size, reduction))
        print(f"OK  ({human_size(orig_size)} -> {human_size(new_size)}, -{reduction:.1f}%)")

    report_path = out_dir / "precision_reduction_report.csv"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("file,original_bytes,new_bytes,reduction_percent\n")
        for filename, orig, new, red in report_rows:
            f.write(f"{filename},{orig},{new},{red:.2f}\n")

    total_orig = sum(r[1] for r in report_rows)
    total_new = sum(r[2] for r in report_rows)
    if total_orig:
        print(f"  Total: {human_size(total_orig)} -> {human_size(total_new)} "
              f"(-{100 * (1 - total_new / total_orig):.1f}%)")
    print(f"  Report: {report_path}")


# ---------------------------------------------------------------------------
# Stage 2: quantize rounded JSON into Int8/Int16 binary buffers
# ---------------------------------------------------------------------------

def _compute_field_scale(flat: np.ndarray, target_scale: float) -> float:
    """scale = target_scale, unless that would overflow Int16 anywhere in
    this field, in which case the scale is reduced just enough to fit."""
    valid = flat[~np.isnan(flat)]
    if valid.size == 0:
        return target_scale
    max_abs = np.max(np.abs(valid))
    if max_abs == 0:
        return target_scale
    max_safe_scale = (MAX_I16 * SAFETY_MARGIN) / max_abs
    return min(target_scale, max_safe_scale)


def _choose_dtype(flat: np.ndarray, scale: float) -> str:
    valid = flat[~np.isnan(flat)]
    if valid.size == 0:
        return "int8"
    max_abs = np.max(np.abs(valid))
    return "int8" if max_abs * scale <= MAX_I8 * SAFETY_MARGIN else "int16"


def _quantize(flat: np.ndarray, dtype: str, scale: float) -> np.ndarray:
    q = np.round(flat * scale)
    if dtype == "int8":
        q = np.clip(q, MIN_I8, MAX_I8)
        q = np.where(np.isnan(flat), NODATA_I8, q)
        return q.astype(np.int8)
    q = np.clip(q, MIN_I16, MAX_I16)
    q = np.where(np.isnan(flat), NODATA_I16, q)
    return q.astype(np.int16)


def _binarize_grid_file(in_path: Path, out_dir: Path, target_scale: float):
    with open(in_path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    grid = raw["grid"]
    n = len(grid)
    lat = np.array([c["lat"] for c in grid], dtype=np.float64)
    lon = np.array([c["lon"] for c in grid], dtype=np.float64)

    scale_lat = _compute_field_scale(lat, target_scale)
    scale_lon = _compute_field_scale(lon, target_scale)
    q_lat = _quantize(lat, "int16", scale_lat)
    q_lon = _quantize(lon, "int16", scale_lon)

    bin_path = out_dir / f"{GRID_BASE}.i16.bin"
    manifest_path = out_dir / f"{GRID_BASE}.manifest.json"
    np.concatenate([q_lat, q_lon]).tofile(bin_path)

    manifest = {
        "type": "grid-index",
        "nCells": int(n),
        "nodata": {"int16": NODATA_I16},
        "buffers": {"int16": f"{GRID_BASE}.i16.bin"},
        "fields": {
            "lat": {"dtype": "int16", "offset": 0, "scale": scale_lat},
            "lon": {"dtype": "int16", "offset": n, "scale": scale_lon},
        },
    }
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, separators=(",", ":"), ensure_ascii=False)

    return bin_path.stat().st_size + manifest_path.stat().st_size


def _binarize_variable_file(in_path: Path, out_dir: Path, target_scale: float):
    with open(in_path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    meta = raw.get("_meta", {})
    variables = meta.get("variables", list(raw.get("data", {}).keys()))

    buffers = {"int8": [], "int16": []}
    offsets = {"int8": 0, "int16": 0}
    var_manifest = {}
    n_cells = None
    months = None
    coarse_fields = []

    for var in variables:
        var_manifest[var] = {}
        for stat in ("mean", "std"):
            if var not in raw["data"] or stat not in raw["data"][var]:
                continue
            arr = np.array(raw["data"][var][stat], dtype=np.float64)
            if n_cells is None:
                n_cells = arr.shape[0]
                if arr.ndim == 2:
                    months = arr.shape[1]

            flat = arr.flatten()
            scale = _compute_field_scale(flat, target_scale)
            dtype = _choose_dtype(flat, scale)
            q = _quantize(flat, dtype, scale)

            buffers[dtype].append(q)
            var_manifest[var][stat] = {"dtype": dtype, "offset": offsets[dtype], "scale": scale}
            offsets[dtype] += q.size

            if scale < target_scale - 1e-9:
                coarse_fields.append({
                    "field": f"{in_path.stem}.{var}.{stat}",
                    "scale": scale,
                    "effective_precision": round(0.5 / scale, 4),
                })

    base = in_path.stem
    buffer_files = {}
    total_bin_bytes = 0
    for dtype in ("int8", "int16"):
        if buffers[dtype]:
            full = np.concatenate(buffers[dtype])
            fname = f"{base}.{'i8' if dtype == 'int8' else 'i16'}.bin"
            path = out_dir / fname
            full.tofile(path)
            buffer_files[dtype] = fname
            total_bin_bytes += path.stat().st_size

    manifest_path = out_dir / f"{base}.manifest.json"
    manifest = {
        "type": "temp" if base.startswith("climate-temp") else "indices",
        "ssp": meta.get("ssp"),
        "period": meta.get("period"),
        "gridFile": f"{GRID_BASE}.i16.bin",
        "gridManifest": f"{GRID_BASE}.manifest.json",
        "nCells": int(n_cells) if n_cells is not None else None,
        "nodata": {"int8": NODATA_I8, "int16": NODATA_I16},
        "buffers": buffer_files,
        "variables": var_manifest,
    }
    if months is not None:
        manifest["monthsPerCell"] = int(months)
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, separators=(",", ":"), ensure_ascii=False)

    return total_bin_bytes + manifest_path.stat().st_size, coarse_fields


def stage_binarize(rounded_dir: Path, out_dir: Path, target_scale: float):
    print(f"\n=== Stage 2: binarize (target scale {target_scale}, i.e. {1/target_scale:g} precision) ===")
    out_dir.mkdir(parents=True, exist_ok=True)

    report_rows = []
    all_coarse_fields = []

    grid_in = rounded_dir / f"{GRID_BASE}.json"
    if grid_in.is_file():
        print(f"  {grid_in.name} ...", end=" ", flush=True)
        new_bytes = _binarize_grid_file(grid_in, out_dir, target_scale)
        report_rows.append((grid_in.name, new_bytes))
        print(f"OK  (-> {human_size(new_bytes)})")
    else:
        print(f"  [skip] not found: {grid_in}")

    for base in VARIABLE_FILES:
        in_path = rounded_dir / f"{base}.json"
        if not in_path.is_file():
            print(f"  [skip] not found: {in_path}")
            continue
        print(f"  {in_path.name} ...", end=" ", flush=True)
        new_bytes, coarse = _binarize_variable_file(in_path, out_dir, target_scale)
        report_rows.append((in_path.name, new_bytes))
        all_coarse_fields.extend(coarse)
        print(f"OK  (-> {human_size(new_bytes)})")

    report_path = out_dir / "binarize_report.csv"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("file,new_bytes\n")
        for filename, new_bytes in report_rows:
            f.write(f"{filename},{new_bytes}\n")

    total_new = sum(r[1] for r in report_rows)
    print(f"  Total binary size: {human_size(total_new)}")
    print(f"  Report: {report_path}")

    if all_coarse_fields:
        print(f"\n  [info] {len(all_coarse_fields)} field(s) needed a reduced scale to avoid "
              f"Int16 overflow (large values, e.g. heatingDegreeDays in cold regions "
              f"under high-emission far-future scenarios):")
        for cf in all_coarse_fields:
            print(f"    {cf['field']}: scale={cf['scale']:.4f}  "
                  f"effective precision +/-{cf['effective_precision']}")


# ---------------------------------------------------------------------------
# Stage 3: adaptive geographic tiling (k-d tree) of the binarized data
# ---------------------------------------------------------------------------

def _kdtree_tiles(lat: np.ndarray, lon: np.ndarray, max_cells: int):
    """Returns a list of (cell_index_array, bbox). bbox = (latMin, latMax,
    lonMin, lonMax), always inherited from the parent split rather than the
    data's own min/max, so every coordinate on Earth -- not just existing
    grid cells -- maps to exactly one tile with no gaps or overlaps."""
    n = len(lat)
    tiles = []

    def recurse(idx, bbox):
        lat_min, lat_max, lon_min, lon_max = bbox
        if len(idx) <= max_cells:
            tiles.append((idx, bbox))
            return
        lats, lons = lat[idx], lon[idx]
        lat_span, lon_span = lat_max - lat_min, lon_max - lon_min
        axis = "lat" if lat_span >= lon_span else "lon"
        vals = lats if axis == "lat" else lons
        median = np.median(vals)
        left_mask = vals <= median
        left_idx, right_idx = idx[left_mask], idx[~left_mask]
        if len(left_idx) == 0 or len(right_idx) == 0:
            # All points share the same value on this axis; cannot split further.
            tiles.append((idx, bbox))
            return
        if axis == "lat":
            recurse(left_idx, (lat_min, median, lon_min, lon_max))
            recurse(right_idx, (median, lat_max, lon_min, lon_max))
        else:
            recurse(left_idx, (lat_min, lat_max, lon_min, median))
            recurse(right_idx, (lat_min, lat_max, median, lon_max))

    recurse(np.arange(n), (-90.0, 90.0, -180.0, 180.0))
    return tiles


def _load_buffers(manifest: dict, base_dir: Path):
    loaded = {}
    for dtype, fname in manifest.get("buffers", {}).items():
        np_dtype = np.int8 if dtype == "int8" else np.int16
        loaded[dtype] = np.fromfile(base_dir / fname, dtype=np_dtype)
    return loaded


def _gather_field(buffer: np.ndarray, offset: int, count_per_cell: int, indices) -> np.ndarray:
    idx_arr = np.asarray(indices, dtype=np.int64)
    base = offset + idx_arr * count_per_cell
    if count_per_cell == 1:
        return buffer[base]
    all_idx = (base[:, None] + np.arange(count_per_cell)[None, :]).flatten()
    return buffer[all_idx]


def stage_tile(binary_dir: Path, out_dir: Path, max_cells_per_tile: int):
    print(f"\n=== Stage 3: adaptive geographic tiling (max {max_cells_per_tile} cells/tile) ===")
    out_dir.mkdir(parents=True, exist_ok=True)

    grid_manifest_path = binary_dir / f"{GRID_BASE}.manifest.json"
    with open(grid_manifest_path, "r", encoding="utf-8") as f:
        grid_manifest = json.load(f)
    grid_buffers = _load_buffers(grid_manifest, binary_dir)
    n_cells = grid_manifest["nCells"]

    def decode(info, count):
        nodata = grid_manifest["nodata"][info["dtype"]]
        raw = grid_buffers[info["dtype"]][info["offset"]: info["offset"] + count].astype(np.float64)
        return np.where(raw == nodata, np.nan, raw / info["scale"])

    lat = decode(grid_manifest["fields"]["lat"], n_cells)
    lon = decode(grid_manifest["fields"]["lon"], n_cells)

    tiles = _kdtree_tiles(lat, lon, max_cells_per_tile)
    sizes = [len(idx) for idx, _ in tiles]
    print(f"  Tiles: {len(tiles)}  (min {min(sizes)} / avg {n_cells / len(tiles):.0f} / "
          f"max {max(sizes)} cells, cap {max_cells_per_tile})")

    tiles_meta = []
    for tid, (idx, bbox) in enumerate(tiles):
        lat_min, lat_max, lon_min, lon_max = bbox
        tiles_meta.append({
            "id": tid, "latMin": lat_min, "latMax": lat_max,
            "lonMin": lon_min, "lonMax": lon_max, "nCells": len(idx),
        })

    # --- split the grid index (raw bytes only, no decode/re-encode) ---
    info_lat = grid_manifest["fields"]["lat"]
    info_lon = grid_manifest["fields"]["lon"]
    for tid, (idx, bbox) in enumerate(tiles):
        q_lat = grid_buffers[info_lat["dtype"]][info_lat["offset"] + idx]
        q_lon = grid_buffers[info_lon["dtype"]][info_lon["offset"] + idx]

        base_tile = f"{GRID_BASE}.tile{tid:02d}"
        np.concatenate([q_lat, q_lon]).astype(np.int16).tofile(out_dir / f"{base_tile}.i16.bin")

        tile_manifest = {
            "type": "grid-index", "nCells": len(idx),
            "bbox": {"latMin": bbox[0], "latMax": bbox[1], "lonMin": bbox[2], "lonMax": bbox[3]},
            "nodata": {"int16": grid_manifest["nodata"]["int16"]},
            "buffers": {"int16": f"{base_tile}.i16.bin"},
            "fields": {
                "lat": {"dtype": "int16", "offset": 0, "scale": info_lat["scale"]},
                "lon": {"dtype": "int16", "offset": len(idx), "scale": info_lon["scale"]},
            },
        }
        with open(out_dir / f"{base_tile}.manifest.json", "w", encoding="utf-8") as f:
            json.dump(tile_manifest, f, separators=(",", ":"), ensure_ascii=False)

    tile_index = {
        "nCellsTotal": n_cells,
        "gridFilePattern": GRID_BASE + ".tile{id:02d}",
        "dataFilePattern": "data.tile{id:02d}",
        "tiles": tiles_meta,
    }
    with open(out_dir / "tile-index.json", "w", encoding="utf-8") as f:
        json.dump(tile_index, f, indent=2, ensure_ascii=False)

    # --- load every base file once, then reuse across all tiles ---
    base_manifests, base_buffers = {}, {}
    for base in VARIABLE_FILES:
        manifest_path = binary_dir / f"{base}.manifest.json"
        if not manifest_path.is_file():
            print(f"  [skip] not found: {manifest_path}")
            continue
        with open(manifest_path, "r", encoding="utf-8") as f:
            base_manifests[base] = json.load(f)
        base_buffers[base] = _load_buffers(base_manifests[base], binary_dir)

    print(f"  Writing one combined file per tile ({len(base_manifests)} scenario/period "
          f"combinations merged into each)...")

    for tid, (idx, _bbox) in enumerate(tiles):
        combined_buffers = {"int8": [], "int16": []}
        combined_offsets = {"int8": 0, "int16": 0}
        combined_bases_manifest = {}

        for base, manifest in base_manifests.items():
            buffers = base_buffers[base]
            months = manifest.get("monthsPerCell")
            count_per_cell = months if months else 1

            base_entry = {"ssp": manifest.get("ssp"), "period": manifest.get("period"), "variables": {}}
            if months:
                base_entry["monthsPerCell"] = months

            for var, stats in manifest["variables"].items():
                base_entry["variables"][var] = {}
                for stat, info in stats.items():
                    seg = _gather_field(buffers[info["dtype"]], info["offset"], count_per_cell, idx)
                    combined_buffers[info["dtype"]].append(seg)
                    base_entry["variables"][var][stat] = {
                        "dtype": info["dtype"],
                        "offset": combined_offsets[info["dtype"]],
                        "scale": info["scale"],
                    }
                    combined_offsets[info["dtype"]] += seg.size

            combined_bases_manifest[base] = base_entry

        buffer_files = {}
        for dtype in ("int8", "int16"):
            if combined_buffers[dtype]:
                full = np.concatenate(combined_buffers[dtype])
                fname = f"data.tile{tid:02d}.{'i8' if dtype == 'int8' else 'i16'}.bin"
                full.tofile(out_dir / fname)
                buffer_files[dtype] = fname

        combined_manifest = {
            "tileId": tid, "nCells": len(idx),
            "gridFile": f"{GRID_BASE}.tile{tid:02d}.i16.bin",
            "gridManifest": f"{GRID_BASE}.tile{tid:02d}.manifest.json",
            "nodata": {"int8": NODATA_I8, "int16": NODATA_I16},
            "buffers": buffer_files,
            "bases": combined_bases_manifest,
        }
        with open(out_dir / f"data.tile{tid:02d}.manifest.json", "w", encoding="utf-8") as f:
            json.dump(combined_manifest, f, separators=(",", ":"), ensure_ascii=False)

        if (tid + 1) % 10 == 0 or (tid + 1) == len(tiles):
            print(f"    tile {tid + 1}/{len(tiles)} written")

    approx_total = len(tiles) * 5 + 1  # grid bin + grid manifest + up to 2 data bins + data manifest, per tile
    print(f"  Done. Output: {out_dir}  (~{approx_total} files)")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Build the EPW Insights climate tile dataset from full-precision source JSON.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--source-dir", type=Path,
                         help="Directory with the full-precision source JSON "
                              "(climate-grid-index.json + the 24 climate-indices-*/climate-temp-* files). "
                              "Required unless --only tile is used.")
    parser.add_argument("--output-dir", type=Path, required=True,
                         help="Top-level output directory. Subfolders 01_rounded, 02_binary, "
                              "03_tiles are created inside it.")
    parser.add_argument("--decimals", type=int, default=DEFAULT_DECIMALS,
                         help=f"Stage 1 rounding precision, in decimal places (default: {DEFAULT_DECIMALS}).")
    parser.add_argument("--target-scale", type=float, default=DEFAULT_TARGET_SCALE,
                         help=f"Stage 2 default Int16 quantization scale (default: {DEFAULT_TARGET_SCALE}, "
                              f"i.e. {1/DEFAULT_TARGET_SCALE:g} precision). Automatically reduced per-field "
                              f"only where needed to avoid overflow.")
    parser.add_argument("--max-cells-per-tile", type=int, default=DEFAULT_MAX_CELLS_PER_TILE,
                         help=f"Stage 3 target maximum cells per tile (default: {DEFAULT_MAX_CELLS_PER_TILE}).")
    parser.add_argument("--only", choices=["reduce", "binarize", "tile"],
                         help="Run a single stage only, reusing previous stages' output already "
                              "present in --output-dir (e.g. after changing --max-cells-per-tile, "
                              "rerun with --only tile).")
    args = parser.parse_args()

    rounded_dir = args.output_dir / "01_rounded"
    binary_dir = args.output_dir / "02_binary"
    tiles_dir = args.output_dir / "03_tiles"

    run_reduce = args.only in (None, "reduce")
    run_binarize = args.only in (None, "binarize")
    run_tile = args.only in (None, "tile")

    if run_reduce:
        if not args.source_dir:
            parser.error("--source-dir is required unless --only tile is used")
        if not args.source_dir.is_dir():
            parser.error(f"--source-dir not found: {args.source_dir}")
        stage_reduce_precision(args.source_dir, rounded_dir, args.decimals)

    if run_binarize:
        if not rounded_dir.is_dir():
            parser.error(f"Stage 1 output not found at {rounded_dir}. Run stage 'reduce' first.")
        stage_binarize(rounded_dir, binary_dir, args.target_scale)

    if run_tile:
        if not binary_dir.is_dir():
            parser.error(f"Stage 2 output not found at {binary_dir}. Run stage 'binarize' first.")
        stage_tile(binary_dir, tiles_dir, args.max_cells_per_tile)

    print("\nAll requested stages complete.")


if __name__ == "__main__":
    main()
