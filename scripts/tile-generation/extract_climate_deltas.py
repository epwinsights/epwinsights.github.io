r"""
EPW Insights
Author: Ehsan Rostami - https://github.com/ehsan-rostami
Copyright (c) 2025-2026 Ehsan Rostami
Released under the GNU Affero General Public License v3.0 or later.

extract_climate_deltas.py

Generalized extraction script covering all FOUR aggregation patterns needed
across the Copernicus Interactive Climate Atlas CMIP6 variables, selected
via --mode:

  monthly      : ensemble-mean monthly climatology, output = 12 deltas.
                 Use for: tas ("t"), tasmax ("tx"), tasmin ("tn").

  annual       : variable is ALREADY yearly frequency in the source file
                 (time dim = years, not months). Output = 1 scalar delta.
                 Use for: CDD ("cd"), HDD ("hd").

  annual-sum   : variable is monthly COUNTS (units "1", e.g. "Monthly count
                 of days with Tmax > 35 degC"). Sum the 12 monthly counts
                 within each calendar year to get an annual count, then
                 average that annual count across years in the period.
                 Output = 1 scalar delta (days/year).
                 Use for: TX35 ("tx35"), TX40 ("tx40"), FD ("fd"),
                 Tropical Nights ("tr").

  annual-max   : variable is a monthly EXTREME (e.g. "Monthly maximum of
                 daily maximum temperature"). Take the max of the 12 monthly
                 values within each calendar year, then average across
                 years. Output = 1 scalar delta.
                 Use for: TXx ("txx").

  annual-min   : same as annual-max but with min. Output = 1 scalar delta.
                 Use for: TNn ("tnn").

IMPORTANT (verified numerically, not just reasoned): "monthly" output CANNOT
be safely post-processed into annual-max/annual-min by taking the max/min of
the 12 monthly climatology deltas -- that operation does not commute with
averaging across years, and produces a meaningfully wrong number. It CAN be
safely recombined into annual-sum by summing the 12 monthly deltas (sum and
mean-across-years do commute) -- but only for the MEAN; the ensemble STD
does not recombine this way, since spread across months isn't additive.
So: use the correct --mode from the start, don't try to reconstruct later.

AR6 reference periods (use these, not "2070"/2061-2080):
    2030 -> --period-start 2021 --period-end 2040
    2050 -> --period-start 2041 --period-end 2060
    2080 -> --period-start 2081 --period-end 2100

Land masking: land_sea_mask_1degree.nc4 ("sftlf" fraction, ATLAS
reference-grids), threshold 0.5, resolved via nearest-neighbor lookup
(handles 0..360 vs -180..180 longitude convention automatically).
"""

import argparse
import json
import time
import numpy as np
import xarray as xr


def build_land_mask(mask_path, lats, lons, threshold=0.5, varname="sftlf"):
    mask_ds = xr.open_dataset(mask_path)
    if varname not in mask_ds.variables:
        raise KeyError(
            f'Variable "{varname}" not found in {mask_path}. '
            f"Available variables: {list(mask_ds.data_vars)}"
        )
    frac = mask_ds[varname]

    extra_dims = [d for d in frac.dims if d not in ("lat", "lon")]
    if extra_dims:
        frac = frac.squeeze(extra_dims, drop=True)

    target_has_negative_lons = bool(np.any(np.asarray(lons) < 0))
    mask_has_negative_lons = bool(np.any(frac["lon"].values < 0))
    if target_has_negative_lons and not mask_has_negative_lons:
        frac = frac.assign_coords(lon=(((frac["lon"] + 180) % 360) - 180)).sortby("lon")
    elif not target_has_negative_lons and mask_has_negative_lons:
        frac = frac.assign_coords(lon=(frac["lon"] % 360)).sortby("lon")

    frac_aligned = frac.reindex(lat=lats, lon=lons, method="nearest", tolerance=0.51)
    values = frac_aligned.values
    return np.where(np.isnan(values), False, values >= threshold)


def climatology_monthly(ds, varname, start_year, end_year):
    da = ds[varname].sel(time=slice(f"{start_year}-01-01", f"{end_year}-12-31"))
    monthly = da.groupby("time.month").mean("time")     # (member, month, lat, lon)
    return monthly.mean("member")                        # (month, lat, lon)


def climatology_monthly_std(ds, varname, start_year, end_year):
    da = ds[varname].sel(time=slice(f"{start_year}-01-01", f"{end_year}-12-31"))
    monthly = da.groupby("time.month").mean("time")
    return monthly.std("member")


def climatology_annual_direct(ds, varname, start_year, end_year):
    da = ds[varname].sel(time=slice(f"{start_year}-01-01", f"{end_year}-12-31"))
    return da.mean("time").mean("member")


def climatology_annual_std_direct(ds, varname, start_year, end_year):
    da = ds[varname].sel(time=slice(f"{start_year}-01-01", f"{end_year}-12-31"))
    return da.mean("time").std("member")


def climatology_annual_from_monthly(ds, varname, start_year, end_year, how):
    da = ds[varname].sel(time=slice(f"{start_year}-01-01", f"{end_year}-12-31"))
    if how == "sum":
        annual = da.groupby("time.year").sum("time")
    elif how == "max":
        annual = da.groupby("time.year").max("time")
    elif how == "min":
        annual = da.groupby("time.year").min("time")
    else:
        raise ValueError(how)
    return annual.mean("year").mean("member")


def climatology_annual_from_monthly_std(ds, varname, start_year, end_year, how):
    da = ds[varname].sel(time=slice(f"{start_year}-01-01", f"{end_year}-12-31"))
    if how == "sum":
        annual = da.groupby("time.year").sum("time")
    elif how == "max":
        annual = da.groupby("time.year").max("time")
    elif how == "min":
        annual = da.groupby("time.year").min("time")
    return annual.mean("year").std("member")


MODE_HOW = {"annual-sum": "sum", "annual-max": "max", "annual-min": "min"}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--historical", required=True)
    p.add_argument("--future", required=True)
    p.add_argument("--varname", required=True)
    p.add_argument("--mode", required=True,
                    choices=["monthly", "annual", "annual-sum", "annual-max", "annual-min"])
    p.add_argument("--ssp", required=True)
    p.add_argument("--baseline-start", type=int, default=1995)
    p.add_argument("--baseline-end", type=int, default=2014)
    p.add_argument("--period-start", type=int, required=True)
    p.add_argument("--period-end", type=int, required=True)
    p.add_argument("--period-label", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--decimals", type=int, default=2)
    p.add_argument("--land-mask-nc", default=r"E:\CMIP6\land_sea_mask_1degree.nc4")
    p.add_argument("--land-mask-varname", default="sftlf")
    p.add_argument("--land-threshold", type=float, default=0.5)
    args = p.parse_args()

    t0 = time.time()
    ds_hist = xr.open_dataset(args.historical, chunks={"time": 120})
    ds_fut = xr.open_dataset(args.future, chunks={"time": 120})
    n_models = ds_fut.sizes.get("member")

    if args.mode == "monthly":
        baseline = climatology_monthly(ds_hist, args.varname, args.baseline_start, args.baseline_end).compute()
        future = climatology_monthly(ds_fut, args.varname, args.period_start, args.period_end).compute()
        future_std = climatology_monthly_std(ds_fut, args.varname, args.period_start, args.period_end).compute()
    elif args.mode == "annual":
        baseline = climatology_annual_direct(ds_hist, args.varname, args.baseline_start, args.baseline_end).compute()
        future = climatology_annual_direct(ds_fut, args.varname, args.period_start, args.period_end).compute()
        future_std = climatology_annual_std_direct(ds_fut, args.varname, args.period_start, args.period_end).compute()
    else:
        how = MODE_HOW[args.mode]
        baseline = climatology_annual_from_monthly(ds_hist, args.varname, args.baseline_start, args.baseline_end, how).compute()
        future = climatology_annual_from_monthly(ds_fut, args.varname, args.period_start, args.period_end, how).compute()
        future_std = climatology_annual_from_monthly_std(ds_fut, args.varname, args.period_start, args.period_end, how).compute()

    delta = future - baseline  # (month, lat, lon) for "monthly", else (lat, lon)

    lats = ds_fut["lat"].values
    lons = ds_fut["lon"].values

    print(f"Building land mask from {args.land_mask_nc} (threshold={args.land_threshold})...")
    land_mask = build_land_mask(args.land_mask_nc, lats, lons, args.land_threshold, args.land_mask_varname)
    print(f"Land cells found: {land_mask.sum()} / {land_mask.size}")

    cells = []
    lat_idx, lon_idx = np.where(land_mask)
    is_monthly = (args.mode == "monthly")
    for i, j in zip(lat_idx, lon_idx):
        if is_monthly:
            mean_val = delta.values[:, i, j]
            std_val = future_std.values[:, i, j]
            if np.isnan(mean_val).any():
                continue
            cells.append({
                "lat": round(float(lats[i]), 2), "lon": round(float(lons[j]), 2),
                "mean": [round(float(v), args.decimals) for v in mean_val],
                "std": [round(float(v), args.decimals) for v in std_val],
            })
        else:
            mean_val = float(delta.values[i, j])
            std_val = float(future_std.values[i, j])
            if np.isnan(mean_val):
                continue
            cells.append({
                "lat": round(float(lats[i]), 2), "lon": round(float(lons[j]), 2),
                "mean": round(mean_val, args.decimals),
                "std": round(std_val, args.decimals),
            })

    elapsed = round(time.time() - t0, 1)

    # sanity-check ranges, useful for spotting problems (e.g. all-zero
    # output, absurd magnitudes, sign flips) without opening the JSON
    if is_monthly:
        all_means = np.array([v for c in cells for v in c["mean"]])
    else:
        all_means = np.array([c["mean"] for c in cells])
    mean_range = (round(float(all_means.min()), 3), round(float(all_means.max()), 3)) if len(all_means) else (None, None)

    out = {
        "_meta": {
            "variable": args.varname, "mode": args.mode, "ssp": args.ssp,
            "period": args.period_label, "periodRange": f"{args.period_start}-{args.period_end}",
            "baselineRange": f"{args.baseline_start}-{args.baseline_end}",
            "nModels": int(n_models), "nCells": len(cells),
            "landMaskSource": args.land_mask_nc, "landThreshold": args.land_threshold,
            "outputShape": "12-monthly" if is_monthly else "scalar-annual",
            "meanValueRange": mean_range,
            "elapsedSeconds": elapsed,
        },
        "cells": cells,
    }

    with open(args.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"Wrote {len(cells)} land cells -> {args.out} ({elapsed}s, mean range {mean_range})")


if __name__ == "__main__":
    main()
