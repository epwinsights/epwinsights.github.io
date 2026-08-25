"""
EPW Insights
Author: Ehsan Rostami - https://github.com/ehsan-rostami
Copyright (c) 2025-2026 Ehsan Rostami
Released under the GNU Affero General Public License v3.0 or later.

independent_verify_all.py

Batch runner that applies the independently re-implemented aggregation
logic from independent_verify_delta.py (manual per-month / per-year loops,
not groupby) across every variable, SSP, and target period, at a fixed set
of sample locations, and writes a single text report.

Requirements
------------
    pip install numpy xarray netcdf4

Usage
-----
    python independent_verify_all.py --netcdf-root /path/to/CMIP6/nc

--netcdf-root must contain one subfolder per variable prefix (t, tx, tn,
cd, hd, tx35, tx40, fd, tr, txx, tnn), each holding the historical and
per-SSP NetCDF files, matching extract_climate_deltas.py's expected
layout.

Writes independent_verify_all_results.txt in the current directory.
"""

import argparse
import time
from pathlib import Path

import numpy as np
import xarray as xr

VARIABLES = {
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

# Sample points chosen for climate diversity, not tied to any specific
# project's station list. Edit freely for a different sample.
LOCATIONS = [
    ("Tehran_IR", 35.5, 51.5),
    ("Sydney_AU", -33.5, 151.5),
    ("Helsinki_FI", 60.5, 25.5),
]

BASELINE_START = 1995
BASELINE_END = 2014
DECIMALS = 2

OUT_PATH = Path("independent_verify_all_results.txt")

MODE_HOW = {"annual-sum": "sum", "annual-max": "max", "annual-min": "min"}


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


def select_nearest_cell(ds, varname, lat, lon):
    return ds[varname].sel(lat=lat, lon=lon, method="nearest")


def monthly_climatology(da, start_year, end_year):
    da_period = da.sel(time=slice(f"{start_year}-01-01", f"{end_year}-12-31"))
    months = da_period["time"].dt.month.values
    result = np.full(12, np.nan)
    for m in range(1, 13):
        mask = months == m
        if not mask.any():
            continue
        result[m - 1] = float(da_period.isel(time=mask).mean(dim=("time", "member")).values)
    return result


def monthly_climatology_std(da, start_year, end_year):
    da_period = da.sel(time=slice(f"{start_year}-01-01", f"{end_year}-12-31"))
    months = da_period["time"].dt.month.values
    result = np.full(12, np.nan)
    for m in range(1, 13):
        mask = months == m
        if not mask.any():
            continue
        per_member_mean = da_period.isel(time=mask).mean(dim="time")
        result[m - 1] = float(per_member_mean.std(dim="member").values)
    return result


def annual_direct(da, start_year, end_year):
    da_period = da.sel(time=slice(f"{start_year}-01-01", f"{end_year}-12-31"))
    return float(da_period.mean(dim=("time", "member")).values)


def annual_direct_std(da, start_year, end_year):
    da_period = da.sel(time=slice(f"{start_year}-01-01", f"{end_year}-12-31"))
    return float(da_period.mean(dim="time").std(dim="member").values)


def aggregate_by_year(da, start_year, end_year, how):
    da_period = da.sel(time=slice(f"{start_year}-01-01", f"{end_year}-12-31"))
    years = da_period["time"].dt.year.values
    unique_years = sorted(set(years.tolist()))
    yearly = []
    for y in unique_years:
        mask = years == y
        year_slice = da_period.isel(time=mask)
        if how == "sum":
            yearly.append(year_slice.sum(dim="time"))
        elif how == "max":
            yearly.append(year_slice.max(dim="time"))
        elif how == "min":
            yearly.append(year_slice.min(dim="time"))
    return xr.concat(yearly, dim="year")


def annual_from_monthly(da, start_year, end_year, how):
    stacked = aggregate_by_year(da, start_year, end_year, how)
    return float(stacked.mean(dim=("year", "member")).values)


def annual_from_monthly_std(da, start_year, end_year, how):
    stacked = aggregate_by_year(da, start_year, end_year, how)
    per_member_mean = stacked.mean(dim="year")
    return float(per_member_mean.std(dim="member").values)


def compute_baseline(da_hist, mode):
    if mode == "monthly":
        return monthly_climatology(da_hist, BASELINE_START, BASELINE_END)
    if mode == "annual":
        return annual_direct(da_hist, BASELINE_START, BASELINE_END)
    how = MODE_HOW[mode]
    return annual_from_monthly(da_hist, BASELINE_START, BASELINE_END, how)


def compute_future(da_fut, mode, period_start, period_end):
    if mode == "monthly":
        future = monthly_climatology(da_fut, period_start, period_end)
        future_std = monthly_climatology_std(da_fut, period_start, period_end)
    elif mode == "annual":
        future = annual_direct(da_fut, period_start, period_end)
        future_std = annual_direct_std(da_fut, period_start, period_end)
    else:
        how = MODE_HOW[mode]
        future = annual_from_monthly(da_fut, period_start, period_end, how)
        future_std = annual_from_monthly_std(da_fut, period_start, period_end, how)
    return future, future_std


def format_value(v):
    if isinstance(v, np.ndarray):
        return "[" + ", ".join(f"{x:.{DECIMALS}f}" for x in v) + "]"
    return f"{v:.{DECIMALS}f}"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--netcdf-root", type=Path, required=True,
                         help="Root folder containing one subfolder per variable prefix "
                              "(t, tx, tn, cd, hd, tx35, tx40, fd, tr, txx, tnn).")
    parser.add_argument("--out", type=Path, default=OUT_PATH,
                         help=f"Output report path (default: {OUT_PATH}).")
    args = parser.parse_args()

    lines = []
    errors = []
    t0 = time.time()
    total = len(VARIABLES) * len(SSPS) * len(PERIODS) * len(LOCATIONS)
    done = 0

    for varkey, (prefix, internal_varname, mode) in VARIABLES.items():
        freq = "yr" if mode == "annual" else "mon"

        try:
            hist_path = find_file(args.netcdf_root, prefix, prefix, None, True, freq)
        except FileNotFoundError as e:
            errors.append(f"variable={varkey}: {e}")
            continue

        print(f"[{varkey}] historical: {hist_path}")
        ds_hist = xr.open_dataset(hist_path)

        baseline_by_location = {}
        for loc_name, lat, lon in LOCATIONS:
            da_hist = select_nearest_cell(ds_hist, internal_varname, lat, lon)
            baseline_by_location[loc_name] = compute_baseline(da_hist, mode)

        for ssp in SSPS:
            try:
                fut_path = find_file(args.netcdf_root, prefix, prefix, ssp, False, freq)
            except FileNotFoundError as e:
                errors.append(f"variable={varkey} ssp={ssp}: {e}")
                continue

            print(f"[{varkey}][{ssp}] future: {fut_path}")
            ds_fut = xr.open_dataset(fut_path)

            for period in PERIODS:
                for loc_name, lat, lon in LOCATIONS:
                    da_fut = select_nearest_cell(ds_fut, internal_varname, lat, lon)
                    resolved_lat = float(da_fut["lat"].values)
                    resolved_lon = float(da_fut["lon"].values)
                    n_models = ds_fut.sizes.get("member")

                    future, future_std = compute_future(da_fut, mode, period["start"], period["end"])
                    baseline = baseline_by_location[loc_name]
                    delta = future - baseline

                    lines.append(f"variable={varkey} ssp={ssp} period={period['label']} location={loc_name}")
                    lines.append(f"  requested_cell = lat={lat}, lon={lon}")
                    lines.append(f"  resolved_cell  = lat={resolved_lat:.2f}, lon={resolved_lon:.2f}")
                    lines.append(f"  mode           = {mode}")
                    lines.append(f"  ensemble_n     = {n_models}")
                    lines.append(f"  baseline       = {format_value(baseline)}")
                    lines.append(f"  future         = {format_value(future)}")
                    lines.append(f"  delta          = {format_value(delta)}")
                    lines.append(f"  future_std     = {format_value(future_std)}")
                    lines.append("")

                    done += 1
                    elapsed = time.time() - t0
                    print(f"  [{done}/{total}] {varkey} {ssp} {period['label']} {loc_name} done ({elapsed:.1f}s elapsed)")

            ds_fut.close()

        ds_hist.close()

    if errors:
        lines.append("ERRORS")
        lines.extend(f"  {e}" for e in errors)
        lines.append("")

    args.out.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWrote {done}/{total} results to {args.out.resolve()}")
    if errors:
        print(f"{len(errors)} errors encountered, see the end of the report.")


if __name__ == "__main__":
    main()
