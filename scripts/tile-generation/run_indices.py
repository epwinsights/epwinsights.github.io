"""
EPW Insights
Author: Ehsan Rostami - https://github.com/ehsan-rostami
Copyright (c) 2025-2026 Ehsan Rostami
Released under the GNU Affero General Public License v3.0 or later.

run_indices.py
"""

import sys
import subprocess
from pathlib import Path
import json
from multiprocessing import Pool, set_start_method
import time

# ==================== Configuration ====================
script_path = r"E:\CMIP6\extract_climate_deltas.py"
land_mask_nc_path = r"E:\CMIP6\land_sea_mask_1degree.nc4"
base_output_dir = Path(r"E:\CMIP6\deltas")
base_output_dir.mkdir(exist_ok=True)

ssps = ["ssp126", "ssp245", "ssp370", "ssp585"]

periods = [
    {"label": "2030", "start": "2021", "end": "2040"},
    {"label": "2050", "start": "2041", "end": "2060"},
    {"label": "2080", "start": "2081", "end": "2100"},
]

ROOT = Path(r"E:\CMIP6\nc")

# ONLY the 6 variables that were computed with the wrong aggregation last
# time (plain monthly climatology instead of annual-sum / annual-max /
# annual-min). tas/tasmax/tasmin and CDD/HDD are NOT included here -- they
# were already correct (CDD/HDD is handled by run_cdd_hdd.py separately).
VARIABLES = {
    # key: (subfolder under ROOT, file-prefix, internal varname, mode)
    "tx35":            ("tx35", "tx35", "tx35", "annual-sum"),
    "tx40":            ("tx40", "tx40", "tx40", "annual-sum"),
    "fd":              ("fd",   "fd",   "fd",   "annual-sum"),
    "tropical_nights": ("tr",   "tr",   "tr",   "annual-sum"),
    "txx":             ("txx",  "txx",  "txx",  "annual-max"),
    "tnn":             ("tnn",  "tnn",  "tnn",  "annual-min"),
}


def find_file(varkey, subfolder, prefix, experiment_tag, is_hist, mode):
    """mon-frequency naming (all 6 of these variables are monthly-native):
        <prefix>_CMIP6_historical_mon_185001-201412_v025.nc
        <prefix>_CMIP6_<ssp>_mon_201501-210012_v025.nc
    """
    freq = "mon"
    date_hist = "185001-201412"
    date_fut = "201501-210012"
    folder = ROOT / subfolder
    if is_hist:
        pattern = f"{prefix}_CMIP6_historical_{freq}_{date_hist}_v025.nc"
    else:
        pattern = f"{prefix}_CMIP6_{experiment_tag}_{freq}_{date_fut}_v025.nc"
    matches = list(folder.rglob(pattern))
    if not matches:
        matches = list(folder.rglob(f"{prefix}_CMIP6_{'historical' if is_hist else experiment_tag}_{freq}_*_v025.nc"))
    if not matches:
        raise FileNotFoundError(f"No file found for {varkey} ({'historical' if is_hist else experiment_tag}) under {folder}")
    return str(matches[0])


def process_task(task):
    varkey, ssp, period = task
    subfolder, prefix, internal_varname, mode = VARIABLES[varkey]
    label = period["label"]

    try:
        historical_path = find_file(varkey, subfolder, prefix, ssp, True, mode)
        future_path = find_file(varkey, subfolder, prefix, ssp, False, mode)
    except FileNotFoundError as e:
        print(f"   ❌ Path error for {varkey}/{ssp}/{label}: {e}")
        return "Failed (path)"

    output_json = base_output_dir / f"deltas_{varkey}_{ssp}_{label}.json"
    validation_txt = base_output_dir / f"validation_{varkey}_{ssp}_{label}.txt"

    print(f"⚙️  Processing: {varkey.upper()} - {ssp.upper()} - {label} (mode={mode})")

    args = [
        "--historical", historical_path,
        "--future", future_path,
        "--varname", internal_varname,
        "--mode", mode,
        "--ssp", ssp,
        "--baseline-start", "1995",
        "--baseline-end", "2014",
        "--period-start", period["start"],
        "--period-end", period["end"],
        "--period-label", label,
        "--land-mask-nc", land_mask_nc_path,
        "--out", str(output_json),
        "--decimals", "2",
    ]

    t0 = time.time()
    try:
        # subprocess (not import+main()) so argparse errors (SystemExit)
        # are actually caught and reported, not silently swallowed.
        result = subprocess.run(
            [sys.executable, script_path] + args,
            capture_output=True, text=True,
        )
        elapsed = round(time.time() - t0, 1)

        if result.returncode != 0:
            err_tail = (result.stderr or "").strip().splitlines()
            err_msg = err_tail[-1] if err_tail else f"exit code {result.returncode}"
            print(f"   ❌ Error in {varkey} - {ssp} - {label}: {err_msg}")
            with open(validation_txt, "w", encoding="utf-8") as f:
                f.write(f"=== FAILED: {varkey.upper()} - {ssp.upper()} - {label} ===\n")
                f.write(f"Command args: {args}\n\n")
                f.write(f"--- stdout ---\n{result.stdout}\n\n--- stderr ---\n{result.stderr}\n")
            return "Failed"

        with open(validation_txt, "w", encoding="utf-8") as f:
            f.write(f"=== Validation Report: {varkey.upper()} - {ssp.upper()} - {label} ===\n\n")
            d = json.load(open(output_json, encoding="utf-8"))
            meta = d.get("_meta", {})
            f.write("--- JSON Metadata ---\n" + str(meta) + "\n\n")
            cells = d.get("cells", [])
            f.write(f"Total cells: {len(cells)}\n")
            f.write(f"Sample cell (Antarctic corner, cells[0]): {cells[0] if cells else 'N/A'}\n")
            # a mid-latitude sample too, so a genuinely non-zero value is
            # visible in the report without opening the JSON
            mid = next((c for c in cells if -35 < c["lat"] < 35), None)
            f.write(f"Sample cell (low-latitude, first match): {mid}\n\n")
            f.write(f"Wall time: {elapsed}s\n")
            f.write("--- Script stdout ---\n" + result.stdout + "\n")

        print(f"   ✅ Completed: {varkey} - {ssp} - {label} ({elapsed}s)")
        return "Success"

    except Exception as e:
        print(f"   ❌ Error in {varkey} - {ssp} - {label}: {e}")
        return "Failed"


if __name__ == "__main__":
    try:
        set_start_method('spawn', force=True)
    except RuntimeError:
        pass

    tasks = [(varkey, ssp, period) for varkey in VARIABLES for ssp in ssps for period in periods]
    print(f"🚀 Re-running {len(tasks)} runs ({len(VARIABLES)} index variables x {len(ssps)} SSPs x {len(periods)} periods)\n")

    start_time = time.time()
    num_workers = 4
    with Pool(processes=num_workers, maxtasksperchild=1) as pool:
        results = pool.map(process_task, tasks)

    duration = time.time() - start_time
    print("\n" + "=" * 70)
    print(f"🎉 DONE. {results.count('Success')}/{len(tasks)} succeeded in {duration/60:.1f} min")
    print(f"   Output folder: {base_output_dir}")
    print("=" * 70)
