"""
EPW Insights
Author: Ehsan Rostami - https://github.com/ehsan-rostami
Copyright (c) 2025-2026 Ehsan Rostami
Released under the GNU Affero General Public License v3.0 or later.

generate_figures.py

Computes Pearson r and R squared, and generates a predicted versus
reference scatter plot with a 1:1 line, for every paired comparison used
in the validation README: UTCI, SET, MRT, SolarCal core (ERF and
t_rsw), the Climate Morphing self consistency benchmark, and the Layer A
external source comparison.

Reads existing CSV outputs already produced by the other validation
scripts. Does not run any validation itself.

Requirements
------------
    pip install matplotlib numpy

Usage
-----
    python generate_figures.py --results-dir results \
        --cmip6-results-dir cmip6-extraction-crosscheck/results \
        --output-dir results/figures

Expected input files, relative to --results-dir unless noted:
    epwinsights_utci_validation.csv
    epwinsights_set_validation_rerun.csv
    epwinsights_mrt_validation_rerun.csv
    epwinsights_mrt_c4_validation_rerun.csv
    epwinsights_morphing_validation.csv
    layer_a_comparison_tas.csv (relative to --cmip6-results-dir)

Any file that is missing is skipped with a printed warning rather than
stopping the whole run, so this can be used after only some validation
scripts have been re run.
"""

import argparse
import csv
import math
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


def read_csv_rows(path):
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def pearson_r(x, y):
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    x_mean, y_mean = x.mean(), y.mean()
    cov = np.sum((x - x_mean) * (y - y_mean))
    x_var = np.sum((x - x_mean) ** 2)
    y_var = np.sum((y - y_mean) ** 2)
    return cov / math.sqrt(x_var * y_var)


def compute_stats(x, y):
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    errors = y - x
    mae = np.mean(np.abs(errors))
    rmse = math.sqrt(np.mean(errors ** 2))
    r = pearson_r(x, y)
    return {"n": len(x), "mae": mae, "rmse": rmse, "r": r, "r2": r ** 2}


def plot_scatter(x, y, title, xlabel, ylabel, out_path, stats, color="#1f77b4", point_size=18):
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)

    fig, ax = plt.subplots(figsize=(6, 6), dpi=150)
    ax.scatter(x, y, s=point_size, alpha=0.6, color=color, edgecolors="none")

    lo = min(x.min(), y.min())
    hi = max(x.max(), y.max())
    margin = (hi - lo) * 0.05 if hi > lo else 1.0
    lo, hi = lo - margin, hi + margin
    ax.plot([lo, hi], [lo, hi], linestyle="--", color="gray", linewidth=1, label="1:1 line")

    ax.set_xlim(lo, hi)
    ax.set_ylim(lo, hi)
    ax.set_aspect("equal", adjustable="box")
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.set_title(title)

    annotation = (
        f"n = {stats['n']}\n"
        f"R2 = {stats['r2']:.3f}\n"
        f"r = {stats['r']:.3f}\n"
        f"MAE = {stats['mae']:.3f}\n"
        f"RMSE = {stats['rmse']:.3f}"
    )
    ax.text(
        0.03, 0.97, annotation,
        transform=ax.transAxes, va="top", ha="left",
        fontsize=9, family="monospace",
        bbox=dict(boxstyle="round", facecolor="white", alpha=0.85, edgecolor="lightgray"),
    )
    ax.legend(loc="lower right", fontsize=8)
    fig.tight_layout()
    fig.savefig(out_path)
    plt.close(fig)


def bland_altman_stats(x, y):
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    mean_vals = (x + y) / 2
    diffs = y - x
    bias = float(np.mean(diffs))
    sd = float(np.std(diffs, ddof=1))
    upper_loa = bias + 1.96 * sd
    lower_loa = bias - 1.96 * sd
    return mean_vals, diffs, bias, sd, upper_loa, lower_loa


def plot_bland_altman(x, y, title, unit_label, out_path, color="#1f77b4", point_size=18):
    mean_vals, diffs, bias, sd, upper_loa, lower_loa = bland_altman_stats(x, y)

    fig, ax = plt.subplots(figsize=(6.5, 5), dpi=150)
    ax.scatter(mean_vals, diffs, s=point_size, alpha=0.6, color=color, edgecolors="none")

    ax.axhline(bias, color="black", linewidth=1.2, label=f"Bias = {bias:.3f}")
    ax.axhline(upper_loa, color="firebrick", linestyle="--", linewidth=1,
               label=f"+1.96 SD = {upper_loa:.3f}")
    ax.axhline(lower_loa, color="firebrick", linestyle="--", linewidth=1,
               label=f"-1.96 SD = {lower_loa:.3f}")

    ax.set_xlabel(f"Mean of predicted and reference ({unit_label})")
    ax.set_ylabel(f"Predicted minus reference ({unit_label})")
    ax.set_title(title)
    ax.legend(loc="best", fontsize=8)
    fig.tight_layout()
    fig.savefig(out_path)
    plt.close(fig)
    return bias, sd, upper_loa, lower_loa


def do_utci(results_dir, output_dir):
    path = results_dir / "epwinsights_utci_validation.csv"
    if not path.is_file():
        print(f"Skipping UTCI, not found: {path}")
        return
    rows = read_csv_rows(path)
    ref = [float(r["UTCI_Fiala"]) for r in rows]
    pred = [float(r["UTCI_EPWInsights"]) for r in rows]
    stats = compute_stats(ref, pred)
    print(f"UTCI: n={stats['n']} R2={stats['r2']:.4f} r={stats['r']:.4f} "
          f"MAE={stats['mae']:.4f} RMSE={stats['rmse']:.4f}")
    plot_scatter(ref, pred, "UTCI: EPW Insights vs. Broede et al. 2012 (Fiala model)",
                 "Reference UTCI (C), Fiala model", "EPW Insights UTCI (C)",
                 output_dir / "utci_scatter.png", stats, color="#d62728")
    ba = plot_bland_altman(ref, pred, "UTCI: Bland-Altman plot", "C",
                           output_dir / "utci_bland_altman.png", color="#d62728")
    print(f"UTCI Bland-Altman: bias={ba[0]:.4f} sd={ba[1]:.4f} "
          f"upper_LoA={ba[2]:.4f} lower_LoA={ba[3]:.4f}")


def do_set(results_dir, output_dir):
    path = results_dir / "epwinsights_set_validation_rerun.csv"
    if not path.is_file():
        print(f"Skipping SET, not found: {path}")
        return
    rows = read_csv_rows(path)
    ref = [float(r["SET_ASHRAE55_2023"]) for r in rows]
    pred = [float(r["SET_EPWInsights"]) for r in rows]
    stats = compute_stats(ref, pred)
    print(f"SET: n={stats['n']} R2={stats['r2']:.4f} r={stats['r']:.4f} "
          f"MAE={stats['mae']:.4f} RMSE={stats['rmse']:.4f}")
    plot_scatter(ref, pred, "SET: EPW Insights vs. ASHRAE 55-2023 Appendix D4",
                 "Reference SET (C), ASHRAE 55-2023", "EPW Insights SET (C)",
                 output_dir / "set_scatter.png", stats, color="#2ca02c", point_size=40)
    ba = plot_bland_altman(ref, pred, "SET: Bland-Altman plot", "C",
                           output_dir / "set_bland_altman.png", color="#2ca02c", point_size=40)
    print(f"SET Bland-Altman: bias={ba[0]:.4f} sd={ba[1]:.4f} "
          f"upper_LoA={ba[2]:.4f} lower_LoA={ba[3]:.4f}")


def do_mrt(results_dir, output_dir):
    path = results_dir / "epwinsights_mrt_validation_rerun.csv"
    if not path.is_file():
        print(f"Skipping MRT, not found: {path}")
        return
    rows = read_csv_rows(path)
    ref = [float(r["ref_dmrt_sharp_avg"]) for r in rows]
    pred = [float(r["js_dmrt"]) for r in rows]
    stats = compute_stats(ref, pred)
    print(f"MRT: n={stats['n']} R2={stats['r2']:.6f} r={stats['r']:.6f} "
          f"MAE={stats['mae']:.4f} RMSE={stats['rmse']:.4f}")
    plot_scatter(ref, pred, "MRT (shortwave): EPW Insights vs. ASHRAE 55 SolarCal",
                 "Reference delta MRT (C), SHARP averaged", "EPW Insights delta MRT (C)",
                 output_dir / "mrt_scatter.png", stats, color="#9467bd", point_size=14)
    ba = plot_bland_altman(ref, pred, "MRT (shortwave): Bland-Altman plot", "C",
                           output_dir / "mrt_bland_altman.png", color="#9467bd", point_size=14)
    print(f"MRT Bland-Altman: bias={ba[0]:.6f} sd={ba[1]:.6f} "
          f"upper_LoA={ba[2]:.6f} lower_LoA={ba[3]:.6f}")


MORPHING_INDEX_LABELS = {
    "frostDays": "Frost days",
    "tropicalNights": "Tropical nights",
    "coolingDegreeDays": "Cooling degree days",
    "heatingDegreeDays": "Heating degree days",
}


def do_morphing(results_dir, output_dir):
    path = results_dir / "epwinsights_morphing_validation.csv"
    if not path.is_file():
        print(f"Skipping Climate Morphing self consistency benchmark, not found: {path}")
        return
    rows = read_csv_rows(path)

    fig, axes = plt.subplots(2, 2, figsize=(11, 11), dpi=150)
    axes = axes.flatten()

    for ax, (index_key, label) in zip(axes, MORPHING_INDEX_LABELS.items()):
        subset = [r for r in rows if r["Index"] == index_key]
        cmip6 = [float(r["CMIP6_Delta"]) for r in subset]
        epw = [float(r["EPW_Derived_Delta"]) for r in subset]
        stats = compute_stats(cmip6, epw)
        print(f"Morphing {index_key}: n={stats['n']} R2={stats['r2']:.4f} r={stats['r']:.4f} "
              f"MAE={stats['mae']:.4f} RMSE={stats['rmse']:.4f}")

        ax.scatter(cmip6, epw, s=14, alpha=0.6, color="#1f77b4", edgecolors="none")
        lo = min(min(cmip6), min(epw))
        hi = max(max(cmip6), max(epw))
        margin = (hi - lo) * 0.05 if hi > lo else 1.0
        lo, hi = lo - margin, hi + margin
        ax.plot([lo, hi], [lo, hi], linestyle="--", color="gray", linewidth=1)
        ax.set_xlim(lo, hi)
        ax.set_ylim(lo, hi)
        ax.set_aspect("equal", adjustable="box")
        ax.set_xlabel("CMIP6 direct delta")
        ax.set_ylabel("EPW derived delta")
        ax.set_title(label)
        ax.text(
            0.03, 0.97,
            f"n={stats['n']}  R2={stats['r2']:.3f}  r={stats['r']:.3f}\n"
            f"MAE={stats['mae']:.2f}  RMSE={stats['rmse']:.2f}",
            transform=ax.transAxes, va="top", ha="left", fontsize=8, family="monospace",
            bbox=dict(boxstyle="round", facecolor="white", alpha=0.85, edgecolor="lightgray"),
        )

    fig.suptitle("Climate Morphing self consistency: EPW derived vs. CMIP6 direct (168 city x SSP x year combinations)")
    fig.tight_layout()
    fig.savefig(output_dir / "morphing_self_consistency_scatter.png")
    plt.close(fig)

    fig_ba, axes_ba = plt.subplots(2, 2, figsize=(11, 9), dpi=150)
    axes_ba = axes_ba.flatten()

    for ax, (index_key, label) in zip(axes_ba, MORPHING_INDEX_LABELS.items()):
        subset = [r for r in rows if r["Index"] == index_key]
        cmip6 = [float(r["CMIP6_Delta"]) for r in subset]
        epw = [float(r["EPW_Derived_Delta"]) for r in subset]
        mean_vals, diffs, bias, sd, upper_loa, lower_loa = bland_altman_stats(cmip6, epw)

        ax.scatter(mean_vals, diffs, s=12, alpha=0.6, color="#1f77b4", edgecolors="none")
        ax.axhline(bias, color="black", linewidth=1.1, label=f"Bias={bias:.2f}")
        ax.axhline(upper_loa, color="firebrick", linestyle="--", linewidth=0.9,
                   label=f"+1.96SD={upper_loa:.2f}")
        ax.axhline(lower_loa, color="firebrick", linestyle="--", linewidth=0.9,
                   label=f"-1.96SD={lower_loa:.2f}")
        ax.set_xlabel("Mean of EPW derived and CMIP6 direct")
        ax.set_ylabel("EPW derived minus CMIP6 direct")
        ax.set_title(label)
        ax.legend(loc="best", fontsize=7)

    fig_ba.suptitle("Climate Morphing self consistency: Bland-Altman plots")
    fig_ba.tight_layout()
    fig_ba.savefig(output_dir / "morphing_self_consistency_bland_altman.png")
    plt.close(fig_ba)


SOLARCAL_CORE_SUBMETRICS = [
    ("ERF_ASHRAE55_2023", "ERF_EPWInsights", "ERF (W/m2)", "#8c564b", 40),
    ("trsw_ASHRAE55_2023", "trsw_EPWInsights", "t_rsw (C)", "#e377c2", 40),
]


def do_solarcal_core(results_dir, output_dir):
    path = results_dir / "epwinsights_mrt_c4_validation_rerun.csv"
    if not path.is_file():
        print(f"Skipping SolarCal core (ERF/t_rsw), not found: {path}")
        return
    rows = read_csv_rows(path)

    fig, axes = plt.subplots(1, 2, figsize=(11, 5.5), dpi=150)
    fig_ba, axes_ba = plt.subplots(1, 2, figsize=(11, 4.5), dpi=150)

    for ax, ax_ba, (ref_col, pred_col, label, color, size) in zip(axes, axes_ba, SOLARCAL_CORE_SUBMETRICS):
        ref = [float(r[ref_col]) for r in rows]
        pred = [float(r[pred_col]) for r in rows]
        stats = compute_stats(ref, pred)
        print(f"SolarCal core {label}: n={stats['n']} R2={stats['r2']:.4f} r={stats['r']:.4f} "
              f"MAE={stats['mae']:.4f} RMSE={stats['rmse']:.4f}")

        ax.scatter(ref, pred, s=size, alpha=0.7, color=color, edgecolors="none")
        lo = min(min(ref), min(pred))
        hi = max(max(ref), max(pred))
        margin = (hi - lo) * 0.05 if hi > lo else 1.0
        lo, hi = lo - margin, hi + margin
        ax.plot([lo, hi], [lo, hi], linestyle="--", color="gray", linewidth=1)
        ax.set_xlim(lo, hi)
        ax.set_ylim(lo, hi)
        ax.set_aspect("equal", adjustable="box")
        ax.set_xlabel(f"ASHRAE 55-2023 Table C4-1 {label}")
        ax.set_ylabel(f"EPW Insights {label}")
        ax.set_title(label)
        ax.text(
            0.03, 0.97,
            f"n={stats['n']}  R2={stats['r2']:.3f}  r={stats['r']:.3f}\n"
            f"MAE={stats['mae']:.3f}  RMSE={stats['rmse']:.3f}",
            transform=ax.transAxes, va="top", ha="left", fontsize=8, family="monospace",
            bbox=dict(boxstyle="round", facecolor="white", alpha=0.85, edgecolor="lightgray"),
        )

        mean_vals, diffs, bias, sd, upper_loa, lower_loa = bland_altman_stats(ref, pred)
        print(f"SolarCal core {label} Bland-Altman: bias={bias:.4f} sd={sd:.4f} "
              f"upper_LoA={upper_loa:.4f} lower_LoA={lower_loa:.4f}")
        ax_ba.scatter(mean_vals, diffs, s=size, alpha=0.7, color=color, edgecolors="none")
        ax_ba.axhline(bias, color="black", linewidth=1.1, label=f"Bias={bias:.3f}")
        ax_ba.axhline(upper_loa, color="firebrick", linestyle="--", linewidth=0.9,
                      label=f"+1.96SD={upper_loa:.3f}")
        ax_ba.axhline(lower_loa, color="firebrick", linestyle="--", linewidth=0.9,
                      label=f"-1.96SD={lower_loa:.3f}")
        ax_ba.set_xlabel(f"Mean of predicted and reference ({label})")
        ax_ba.set_ylabel(f"Predicted minus reference ({label})")
        ax_ba.set_title(label)
        ax_ba.legend(loc="best", fontsize=7)

    fig.suptitle("SolarCal core (ERF, t_rsw): EPW Insights vs. ASHRAE 55-2023 Table C4-1 (26 points)")
    fig.tight_layout()
    fig.savefig(output_dir / "solarcal_core_scatter.png")
    plt.close(fig)

    fig_ba.suptitle("SolarCal core (ERF, t_rsw): Bland-Altman plots")
    fig_ba.tight_layout()
    fig_ba.savefig(output_dir / "solarcal_core_bland_altman.png")
    plt.close(fig_ba)


def do_layer_a(cmip6_results_dir, output_dir):
    path = cmip6_results_dir / "layer_a_comparison_tas.csv"
    if not path.is_file():
        print(f"Skipping Layer A, not found: {path}")
        return
    rows = read_csv_rows(path)
    atlas = [float(r["atlas_delta_tas"]) for r in rows]
    project = [float(r["project_delta_tas"]) for r in rows]
    stats = compute_stats(atlas, project)
    print(f"Layer A: n={stats['n']} R2={stats['r2']:.4f} r={stats['r']:.4f} "
          f"MAE={stats['mae']:.4f} RMSE={stats['rmse']:.4f}")
    plot_scatter(atlas, project, "Layer A: project tas delta vs. IPCC-WG1 Atlas regional delta",
                 "IPCC-WG1 Atlas delta tas (C)", "Project delta tas (C)",
                 output_dir / "layer_a_scatter.png", stats, color="#ff7f0e", point_size=22)
    ba = plot_bland_altman(atlas, project, "Layer A: Bland-Altman plot", "C",
                           output_dir / "layer_a_bland_altman.png", color="#ff7f0e", point_size=22)
    print(f"Layer A Bland-Altman: bias={ba[0]:.4f} sd={ba[1]:.4f} "
          f"upper_LoA={ba[2]:.4f} lower_LoA={ba[3]:.4f}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--results-dir", type=Path, default=Path("results"),
                         help="Folder containing the UTCI, SET, MRT, and morphing CSV files.")
    parser.add_argument("--cmip6-results-dir", type=Path, default=Path("cmip6-extraction-crosscheck/results"),
                         help="Folder containing layer_a_comparison_tas.csv.")
    parser.add_argument("--output-dir", type=Path, default=Path("results/figures"),
                         help="Where to write the generated PNG figures.")
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)

    do_utci(args.results_dir, args.output_dir)
    do_set(args.results_dir, args.output_dir)
    do_mrt(args.results_dir, args.output_dir)
    do_solarcal_core(args.results_dir, args.output_dir)
    do_morphing(args.results_dir, args.output_dir)
    do_layer_a(args.cmip6_results_dir, args.output_dir)

    print(f"\nFigures written to {args.output_dir.resolve()}")


if __name__ == "__main__":
    main()