"""
EPW Insights
Author: Ehsan Rostami - https://github.com/ehsan-rostami
Copyright (c) 2025-2026 Ehsan Rostami
Released under the GNU Affero General Public License v3.0 or later.

build_climate_database.py

Single entry point for rebuilding the CMIP6 climate delta database used by
EPW Insights, end to end: raw NetCDF -> browser-ready tiles.

Stages (each writes to its own subfolder under --output-root):

    extract   NetCDF -> 00_extracted/deltas_<var>_<ssp>_<period>.json
              (132 files: 11 variables x 4 SSPs x 3 periods)
    merge     00_extracted/ -> 01_merged/
              (climate-grid-index.json + climate-temp-*.json +
               climate-indices-*.json)
    tiles     01_merged/ -> 02_tiles/{01_rounded,02_binary,03_tiles}/
              (delegates to build_climate_tiles.py's own three internal
               stages, unchanged)

Each stage runs the corresponding existing, independently validated
script (extract_climate_deltas.py, merge_deltas.py, build_climate_tiles.py)
as a subprocess. This script does not duplicate or re-implement any of
their internal logic -- it only handles orchestration: locating input
NetCDF files by the project's known folder/naming convention, building
argument lists, and wiring one stage's output directory to the next
stage's input.

Requirements
------------
    pip install numpy xarray netcdf4

    extract_climate_deltas.py, merge_deltas.py, and build_climate_tiles.py
    must be present in the same directory as this script, or pass
    --scripts-dir to point elsewhere.

Usage
-----
    python build_climate_database.py \\
        --netcdf-root /path/to/CMIP6/nc \\
        --land-mask /path/to/land_sea_mask_1degree.nc4 \\
        --output-root /path/to/build_output

    # Re-run a single stage only, reusing previous stages' output already
    # present in --output-root:
    python build_climate_database.py --output-root ./build --only merge

Expected --netcdf-root layout (one subfolder per variable prefix, matching
extract_climate_deltas.py's own file-finding convention):

    <netcdf-root>/t/.../t_CMIP6_historical_mon_185001-201412_v025.nc
    <netcdf-root>/t/.../t_CMIP6_ssp245_mon_201501-210012_v025.nc
    <netcdf-root>/tx/...
    <netcdf-root>/tn/...
    <netcdf-root>/cd/...   (annual-frequency files, "yr" not "mon")
    <netcdf-root>/hd/...
    <netcdf-root>/tx35/...
    <netcdf-root>/tx40/...
    <netcdf-root>/fd/...
    <netcdf-root>/tr/...
    <netcdf-root>/txx/...
    <netcdf-root>/tnn/...

Final deployment step (not automated here, since it is project-specific):
copy --output-root/02_tiles/03_tiles/* into the app's
public/data/climate/tiles/ folder.
"""

import argparse
import sys
from pathlib import Path
from subprocess import run

VARIABLES = {
    # key: (subfolder/prefix under --netcdf-root, extract_climate_deltas.py --varname, aggregation mode)
    "tas":              ("t",     "t",     "monthly"),
    "tasmax":           ("tx",    "tx",    "monthly"),
    "tasmin":           ("tn",    "tn",    "monthly"),
    "cdd":              ("cd",    "cd",    "annual"),
    "hdd":              ("hd",    "hd",    "annual"),
    "tx35":             ("tx35",  "tx35",  "annual-sum"),
    "tx40":             ("tx40",  "tx40",  "annual-sum"),
    "fd":               ("fd",    "fd",    "annual-sum"),
    "tropical_nights":  ("tr",    "tr",    "annual-sum"),
    "txx":              ("txx",   "txx",   "annual-max"),
    "tnn":              ("tnn",   "tnn",   "annual-min"),
}

SSPS = ["ssp126", "ssp245", "ssp370", "ssp585"]

PERIODS = [
    {"label": "2030", "start": 2021, "end": 2040},
    {"label": "2050", "start": 2041, "end": 2060},
    {"label": "2080", "start": 2081, "end": 2100},
]

BASELINE_START = 1995
BASELINE_END = 2014


def find_file(root, subfolder, prefix, experiment_tag, is_hist, freq):
    folder = root / subfolder
    if freq == "yr":
        date_hist, date_fut = "1850-2014", "2015-2100"
    else:
        date_hist, date_fut = "185001-201412", "201501-210012"
    if is_hist:
        pattern = f"{prefix}_CMIP6_historical_{freq}_{date_hist}_v025.nc"
    else:
        pattern = f"{prefix}_CMIP6_{experiment_tag}_{freq}_{date_fut}_v025.nc"
    matches = list(folder.rglob(pattern))
    if not matches:
        fallback_tag = "historical" if is_hist else experiment_tag
        matches = list(folder.rglob(f"{prefix}_CMIP6_{fallback_tag}_{freq}_*_v025.nc"))
    if not matches:
        raise FileNotFoundError(f"No file found under {folder} matching {pattern}")
    return matches[0]


def run_extract_stage(netcdf_root, land_mask, script_path, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    errors = []
    total = len(VARIABLES) * len(SSPS) * len(PERIODS)
    done = 0

    for varkey, (subfolder, prefix, mode) in VARIABLES.items():
        freq = "yr" if mode == "annual" else "mon"
        try:
            hist_path = find_file(netcdf_root, subfolder, prefix, None, True, freq)
        except FileNotFoundError as e:
            errors.append(str(e))
            continue

        for ssp in SSPS:
            try:
                fut_path = find_file(netcdf_root, subfolder, prefix, ssp, False, freq)
            except FileNotFoundError as e:
                errors.append(str(e))
                continue

            for period in PERIODS:
                out_path = out_dir / f"deltas_{varkey}_{ssp}_{period['label']}.json"
                args = [
                    sys.executable, str(script_path),
                    "--historical", str(hist_path),
                    "--future", str(fut_path),
                    "--varname", prefix,
                    "--mode", mode,
                    "--ssp", ssp,
                    "--baseline-start", str(BASELINE_START),
                    "--baseline-end", str(BASELINE_END),
                    "--period-start", str(period["start"]),
                    "--period-end", str(period["end"]),
                    "--period-label", period["label"],
                    "--land-mask-nc", str(land_mask),
                    "--out", str(out_path),
                    "--decimals", "2",
                ]
                result = run(args, capture_output=True, text=True)
                done += 1
                if result.returncode != 0:
                    err_tail = (result.stderr or "").strip().splitlines()
                    err_msg = err_tail[-1] if err_tail else f"exit code {result.returncode}"
                    errors.append(f"{varkey}/{ssp}/{period['label']}: {err_msg}")
                    print(f"  [{done}/{total}] FAILED  {varkey} {ssp} {period['label']}: {err_msg}")
                else:
                    print(f"  [{done}/{total}] OK      {varkey} {ssp} {period['label']} -> {out_path.name}")

    if errors:
        print(f"\n{len(errors)} extraction errors:")
        for e in errors:
            print(f"  - {e}")
    return len(errors) == 0


def run_merge_stage(script_path, extracted_dir, out_dir):
    json_files = sorted(extracted_dir.glob("deltas_*.json"))
    if not json_files:
        print(f"No deltas_*.json files found in {extracted_dir}")
        return False

    input_list_path = extracted_dir / "input_list.txt"
    with open(input_list_path, "w", encoding="utf-8") as f:
        for p in json_files:
            f.write(f'"{p}"\n')

    args = [
        sys.executable, str(script_path),
        "--input-list", str(input_list_path),
        "--out-dir", str(out_dir),
        "--decimals", "2",
    ]
    result = run(args)
    return result.returncode == 0


def run_tiles_stage(script_path, merged_dir, out_dir):
    args = [
        sys.executable, str(script_path),
        "--source-dir", str(merged_dir),
        "--output-dir", str(out_dir),
    ]
    result = run(args)
    return result.returncode == 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--netcdf-root", type=Path,
                         help="Root folder containing one subfolder per variable prefix. "
                              "Required unless --only merge or --only tiles is used.")
    parser.add_argument("--land-mask", type=Path,
                         help="Path to land_sea_mask_1degree.nc4. Required for the extract stage.")
    parser.add_argument("--scripts-dir", type=Path, default=Path(__file__).resolve().parent,
                         help="Directory containing extract_climate_deltas.py, merge_deltas.py, "
                              "and build_climate_tiles.py (default: this script's own directory).")
    parser.add_argument("--output-root", type=Path, required=True,
                         help="Top-level output directory. Subfolders 00_extracted, 01_merged, "
                              "02_tiles are created inside it.")
    parser.add_argument("--only", choices=["extract", "merge", "tiles"],
                         help="Run a single stage only, reusing previous stages' output already "
                              "present in --output-root.")
    args = parser.parse_args()

    extracted_dir = args.output_root / "00_extracted"
    merged_dir = args.output_root / "01_merged"
    tiles_dir = args.output_root / "02_tiles"

    run_extract = args.only in (None, "extract")
    run_merge = args.only in (None, "merge")
    run_tiles = args.only in (None, "tiles")

    if run_extract:
        if not args.netcdf_root or not args.land_mask:
            parser.error("--netcdf-root and --land-mask are required unless --only merge/tiles is used")
        script_path = args.scripts_dir / "extract_climate_deltas.py"
        if not script_path.is_file():
            parser.error(f"extract_climate_deltas.py not found at {script_path}")
        print("=== Stage: extract ===")
        ok = run_extract_stage(args.netcdf_root, args.land_mask, script_path, extracted_dir)
        if not ok:
            print("Extract stage had errors; see above. Continuing to the next stage will use incomplete data.")

    if run_merge:
        if not extracted_dir.is_dir():
            parser.error(f"Stage 'extract' output not found at {extracted_dir}. Run --only extract first.")
        script_path = args.scripts_dir / "merge_deltas.py"
        if not script_path.is_file():
            parser.error(f"merge_deltas.py not found at {script_path}")
        print("\n=== Stage: merge ===")
        ok = run_merge_stage(script_path, extracted_dir, merged_dir)
        if not ok:
            parser.error("Merge stage failed; see output above.")

    if run_tiles:
        if not merged_dir.is_dir():
            parser.error(f"Stage 'merge' output not found at {merged_dir}. Run --only merge first.")
        script_path = args.scripts_dir / "build_climate_tiles.py"
        if not script_path.is_file():
            parser.error(f"build_climate_tiles.py not found at {script_path}")
        print("\n=== Stage: tiles ===")
        ok = run_tiles_stage(script_path, merged_dir, tiles_dir)
        if not ok:
            parser.error("Tiles stage failed; see output above.")

    print("\nAll requested stages complete.")
    print(f"Output root: {args.output_root.resolve()}")
    print(f"Final tiles for deployment: {tiles_dir / '03_tiles'}")


if __name__ == "__main__":
    main()
