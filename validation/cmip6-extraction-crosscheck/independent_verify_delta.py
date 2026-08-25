"""
EPW Insights
Author: Ehsan Rostami - https://github.com/ehsan-rostami
Copyright (c) 2025-2026 Ehsan Rostami
Released under the GNU Affero General Public License v3.0 or later.

independent_verify_delta.py

Independent, separately-implemented recomputation of the CMIP6 ensemble
delta at a single grid cell, for cross-checking extract_climate_deltas.py
without reusing any of its code.

Deliberate implementation differences from extract_climate_deltas.py:
  - Monthly climatology is computed with a manual per-month boolean mask
    loop instead of groupby("time.month").
  - Annual-sum/annual-max/annual-min aggregation is computed with a manual
    per-year loop instead of groupby("time.year").
  - Grid cell selection uses xarray's nearest-neighbor sel() directly on a
    single (lat, lon) pair, not a land-mask-filtered full-grid scan.

Requirements
------------
    pip install numpy xarray netCDF4

Usage
-----
    python independent_verify_delta.py \
        --historical "G:\\CMIP6\\nc\\t\\...\\t_CMIP6_historical_mon_185001-201412_v025.nc" \
        --future "G:\\CMIP6\\nc\\t\\...\\t_CMIP6_ssp245_mon_201501-210012_v025.nc" \
        --varname t \
        --mode monthly \
        --lat 35.5 --lon 51.5 \
        --period-start 2041 --period-end 2060 \
        --decimals 2

Modes match extract_climate_deltas.py's four aggregation patterns:
    monthly       tas / tasmax / tasmin
    annual        cdd / hdd (already yearly frequency in the source file)
    annual-sum    tx35 / tx40 / fd / tropical_nights (sum 12 months, then
                  average across years)
    annual-max    txx (max of 12 months, then average across years)
    annual-min    tnn (min of 12 months, then average across years)
"""

import argparse

import numpy as np
import xarray as xr


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
        selected = da_period.isel(time=mask)
        result[m - 1] = float(selected.mean(dim=("time", "member")).values)
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
    per_member_mean = da_period.mean(dim="time")
    return float(per_member_mean.std(dim="member").values)


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
        else:
            raise ValueError(how)
    return xr.concat(yearly, dim="year")


def annual_from_monthly(da, start_year, end_year, how):
    stacked = aggregate_by_year(da, start_year, end_year, how)
    return float(stacked.mean(dim=("year", "member")).values)


def annual_from_monthly_std(da, start_year, end_year, how):
    stacked = aggregate_by_year(da, start_year, end_year, how)
    per_member_mean = stacked.mean(dim="year")
    return float(per_member_mean.std(dim="member").values)


MODE_HOW = {"annual-sum": "sum", "annual-max": "max", "annual-min": "min"}


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--historical", required=True)
    p.add_argument("--future", required=True)
    p.add_argument("--varname", required=True)
    p.add_argument("--mode", required=True,
                    choices=["monthly", "annual", "annual-sum", "annual-max", "annual-min"])
    p.add_argument("--lat", type=float, required=True)
    p.add_argument("--lon", type=float, required=True)
    p.add_argument("--baseline-start", type=int, default=1995)
    p.add_argument("--baseline-end", type=int, default=2014)
    p.add_argument("--period-start", type=int, required=True)
    p.add_argument("--period-end", type=int, required=True)
    p.add_argument("--decimals", type=int, default=2)
    args = p.parse_args()

    ds_hist = xr.open_dataset(args.historical)
    ds_fut = xr.open_dataset(args.future)

    da_hist = select_nearest_cell(ds_hist, args.varname, args.lat, args.lon)
    da_fut = select_nearest_cell(ds_fut, args.varname, args.lat, args.lon)

    resolved_lat = float(da_fut["lat"].values)
    resolved_lon = float(da_fut["lon"].values)
    n_models = ds_fut.sizes.get("member")

    if args.mode == "monthly":
        baseline = monthly_climatology(da_hist, args.baseline_start, args.baseline_end)
        future = monthly_climatology(da_fut, args.period_start, args.period_end)
        future_std = monthly_climatology_std(da_fut, args.period_start, args.period_end)
        delta = future - baseline
    elif args.mode == "annual":
        baseline = annual_direct(da_hist, args.baseline_start, args.baseline_end)
        future = annual_direct(da_fut, args.period_start, args.period_end)
        future_std = annual_direct_std(da_fut, args.period_start, args.period_end)
        delta = future - baseline
    else:
        how = MODE_HOW[args.mode]
        baseline = annual_from_monthly(da_hist, args.baseline_start, args.baseline_end, how)
        future = annual_from_monthly(da_fut, args.period_start, args.period_end, how)
        future_std = annual_from_monthly_std(da_fut, args.period_start, args.period_end, how)
        delta = future - baseline

    print(f"Requested cell   : lat={args.lat}, lon={args.lon}")
    print(f"Resolved cell    : lat={resolved_lat:.2f}, lon={resolved_lon:.2f}")
    print(f"Ensemble members : {n_models}")
    print(f"Mode             : {args.mode}")
    print("")

    if args.mode == "monthly":
        print("Baseline (12 monthly means):", np.round(baseline, args.decimals).tolist())
        print("Future   (12 monthly means):", np.round(future, args.decimals).tolist())
        print("Delta    (12 monthly means):", np.round(delta, args.decimals).tolist())
        print("Future std (12 monthly)    :", np.round(future_std, args.decimals).tolist())
    else:
        print(f"Baseline   : {round(baseline, args.decimals)}")
        print(f"Future     : {round(future, args.decimals)}")
        print(f"Delta      : {round(delta, args.decimals)}")
        print(f"Future std : {round(future_std, args.decimals)}")


if __name__ == "__main__":
    main()
