/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later. 
 *
 * EPW Insights - Validation
 * Self-consistency benchmark for the Future Climate Projection module.
 *
 * Compares two independently-derived quantities from the same CMIP6
 * ensemble for a given grid cell and SSP/period: (a) HDD/CDD and frost/
 * tropical-night day counts derived by running the app's real Shift+Stretch
 * morphing pipeline on a baseline EPW file, and (b) the same indices as
 * published directly by the CMIP6 gridded dataset for that cell. This is
 * NOT a validation against independent measured data (see README.md); it
 * is a benchmark of internal consistency between the morphing pipeline and
 * the model's own precomputed indices.
 *
 * KNOWN, VALIDATED DATA CHARACTERISTIC -- 
 * heatingDegreeDays (hdd) under ssp245/ssp370/ssp585 at target year 2080
 * is quantized at a slightly reduced Int16 scale (~6.9-9.9 instead of the
 * usual 10.0) by the offline tile-generation pipeline (step2_binarize.py,
 * compute_field_scale()), because the global (whole-Earth) maximum |hdd|
 * for those specific SSP/period files exceeds what scale=10 can hold
 * without clipping. This makes CMIP6_Delta values for exactly those rows
 * come out with non-round decimals instead of the usual 1-decimal-place
 * numbers, purely as a quantization-precision artifact -- the worst-case
 * rounding error this introduces is on the order of +/-0.05 to +/-0.07
 * degree-days, negligible next to the actual deltas (hundreds of
 * degree-days). It does not involve interpolation or extrapolation
 * between years/scenarios. Confirmed against the actual tile manifests
 * and cross-checked with the pipeline's own validate_v4_v5.py, which
 * already accounts for this per-field scale in its error tolerances.
 *
 * DEGREE-DAY BASE TEMPERATURE (fixed here, previously a mismatch) --
 * coolingDegreeDays/heatingDegreeDays are computed on the EPW side with
 * the base temperatures explicitly matching the CMIP6-native cd/hd
 * definition (22C / 15.5C, IPCC AR6 WGI Annex VI), not the platform's own
 * user-adjustable default (24C / 18C). An earlier version of this script
 * used the platform default, which meant the two sides of the comparison
 * were computed with different physical definitions of a degree-day; that
 * alone was sufficient to produce a large, systematic negative bias
 * (roughly -55 CDD, -11 HDD in the previous run), since a higher base
 * temperature mechanically reduces sensitivity to a given warming shift.
 * See the manuscript, Section 4.2, for the full explanation.
 *
 * Run with: node validate_morphing.mjs
 * (after running: npm run sync && bash sync-morphing.sh)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const realFetch = globalThis.fetch;
globalThis.fetch = async function fetchWithFileSupport(input, init) {
  let url = typeof input === 'string' ? input : input.url;

  // Map browser-style root-relative paths to the real public/ folder
  if (url.startsWith('/data/')) {
    const fsPath = join(__dirname, '..', 'public', url.slice(1)); // /data/... → ../public/data/...
    url = 'file://' + fsPath;
  }

  if (url.startsWith('file://')) {
    try {
      const data = await readFile(fileURLToPath(url));
      return new Response(data, { status: 200, statusText: 'OK' });
    } catch (e) {
      return new Response(null, { status: 404, statusText: 'Not Found' });
    }
  }
  return realFetch(input, init);
};

import { parseEPW } from './core/epw-parser.js';
import {
  resolveGridCell,
  getMonthlyDeltas,
  getAnnualIndexDeltas,
  morphHourlyTemperature,
  computeMorphingAnalysis,
  SSP_SCENARIOS,
  TARGET_YEARS
} from './core/climate-morphing.js';

const SAMPLE_LOCATIONS = [
  { name: 'Cairo', epwPath: '../public/epw/Cairo.epw' },
  { name: 'Chicago', epwPath: '../public/epw/Chicago.epw' },
  { name: 'London', epwPath: '../public/epw/London.epw' },
  { name: 'Moscow', epwPath: '../public/epw/Moscow.epw' },
  { name: 'Mumbai', epwPath: '../public/epw/Mumbai.epw' },
  { name: 'Nairobi', epwPath: '../public/epw/Nairobi.epw' },
  { name: 'Phoenix', epwPath: '../public/epw/Phoenix.epw' },
  { name: 'Rio de Janeiro', epwPath: '../public/epw/RioDeJaneiro.epw' },
  { name: 'Rome', epwPath: '../public/epw/Rome.epw' },
  { name: 'Santiago', epwPath: '../public/epw/Santiago.epw' },
  { name: 'Singapore', epwPath: '../public/epw/Singapore.epw' },
  { name: 'Sydney', epwPath: '../public/epw/Sydney.epw' },
  { name: 'Tehran', epwPath: '../public/epw/Tehran.epw' },
  { name: 'Ulaanbaatar', epwPath: '../public/epw/Ulaanbataar.epw' }
];

const SSPS_TO_RUN = ['ssp126', 'ssp245', 'ssp370', 'ssp585'];
const TARGET_YEARS_TO_RUN = [2030, 2050, 2080];

// Sanity-check the requested scenarios against what the morphing module
// itself declares as supported, so a typo here fails loudly instead of
// silently producing "no monthly deltas" warnings for every row. This is
// deliberately tolerant of shape: SSP_SCENARIOS/TARGET_YEARS may be flat
// arrays of primitives, or arrays of objects like {value,label} -- so we
// flatten a couple of plausible primitive fields before comparing, and we
// only warn (never throw), since a shape we didn't anticipate should not
// block a run that the actual fetch calls below prove works fine.
function knownPrimitives(exported) {
  if (!Array.isArray(exported)) return null;
  return exported.map(e => (e && typeof e === 'object') ? (e.value ?? e.id ?? e.year ?? e.name ?? e) : e);
}
const knownSsps = knownPrimitives(SSP_SCENARIOS);
const knownYears = knownPrimitives(TARGET_YEARS);
if (knownSsps) {
  const unknown = SSPS_TO_RUN.filter(s => !knownSsps.includes(s));
  if (unknown.length) console.warn(`NOTE: SSP(s) not found in module's SSP_SCENARIOS export (may just be a different shape -- verify manually if any row below is unexpectedly all n/a): ${unknown.join(', ')}`);
}
if (knownYears) {
  const unknown = TARGET_YEARS_TO_RUN.filter(y => !knownYears.includes(y));
  if (unknown.length) console.warn(`NOTE: target year(s) not found in module's TARGET_YEARS export (may just be a different shape -- verify manually if any row below is unexpectedly all n/a): ${unknown.join(', ')}`);
}

const INDEX_KEYS = ['frostDays', 'tropicalNights', 'coolingDegreeDays', 'heatingDegreeDays'];

// Below this |CMIP6_Delta| magnitude, a percentage error is not
// meaningful (a tiny reference value turns any small absolute error into
// an enormous, misleading percentage). Points under threshold are
// excluded from MAPE but still counted in MAE/RMSE/Bias, which don't have
// this problem. Units match each index: days for frost/tropical-night
// counts, degree-days for CDD/HDD.
const REL_ERROR_EPSILON = {
  frostDays: 1,
  tropicalNights: 1,
  coolingDegreeDays: 10,
  heatingDegreeDays: 10
};

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Cosmetic rounding for the printed/saved CSV table only. All statistics
// (MAE, RMSE, Bias, MAPE, nRMSE, r in summarize() below) are computed from
// the raw, unrounded epwDelta/cmip6Delta/error values in `records` -- this
// function never touches those. It exists purely so the CSV is readable
// (e.g. hides the float noise from day-by-day summation, and the harmless
// quantization-precision decimals described in the header comment above)
// without discarding any precision from the actual analysis.
function displayRound(v) {
  return Math.round(v * 100) / 100;
}

function rmse(errors) {
  return errors.length ? Math.sqrt(mean(errors.map(e => e * e))) : null;
}

function stdDev(arr) {
  if (arr.length < 2) return null;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map(v => (v - m) ** 2)));
}

// Pearson correlation between the pipeline's own deltas and the direct
// CMIP6 deltas -- captures whether the two track each other even where
// their magnitudes disagree.
function pearsonR(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom > 0 ? num / denom : null;
}

// 95% CI for a Pearson r via Fisher z transform (Table 5 uses the same method).
function fisherCI(r, n, z = 1.96) {
  if (r === null || n < 4) return [null, null];
  const zr = Math.atanh(r);
  const se = 1 / Math.sqrt(n - 3);
  return [Math.tanh(zr - z * se), Math.tanh(zr + z * se)];
}

async function loadLocation(location) {
  const epwString = readFileSync(location.epwPath, 'utf-8');
  const epwData = parseEPW(epwString);
  const gridCell = await resolveGridCell(epwData);
  return { epwData, gridCell };
}

async function runOne(location, epwData, gridCell, ssp, targetYear) {
  const monthlyDeltas = await getMonthlyDeltas(gridCell, ssp, targetYear);
  const annualIndexDeltas = await getAnnualIndexDeltas(gridCell, ssp, targetYear);
  if (!monthlyDeltas) {
    console.warn(`No monthly deltas for ${location.name} (${ssp}, ${targetYear}), skipping.`);
    return null;
  }

  const morphedHourlyData = morphHourlyTemperature(epwData, monthlyDeltas);
  const cmip6ThermalSettings = { baseTempCooling: 22.0, baseTempHeating: 15.5 };
  const analysis = computeMorphingAnalysis(epwData, morphedHourlyData, monthlyDeltas, annualIndexDeltas, cmip6ThermalSettings);

  return {
    location: location.name,
    ssp,
    targetYear,
    benchmark: analysis.benchmark,
    kpi: analysis.kpi,
    // Ensemble std (spread across the 22 CMIP6 models) for cdd/hdd, a proxy
    // for how much inter-model / inter-year variability exists in this
    // particular signal. If the residual error correlates with this, it
    // supports a variance-related (not a simple definitional) explanation.
    cmip6CddStd: annualIndexDeltas.cdd ? annualIndexDeltas.cdd.std : null,
    cmip6HddStd: annualIndexDeltas.hdd ? annualIndexDeltas.hdd.std : null
  };
}

// Same 14-city Koppen classification used elsewhere in the project's
// validation scripts (e.g. validate_ground_temp_plausibility.mjs), used
// here only to group cities into broad climate families for diagnostics.
const CLIMATE_GROUP = {
  'Cairo': 'Hot/Arid (BWh)', 'Phoenix': 'Hot/Arid (BWh)',
  'Tehran': 'Semi-arid (BSk)', 'Santiago': 'Semi-arid (BSk)',
  'Mumbai': 'Tropical (Aw)', 'Singapore': 'Tropical (Af)', 'Rio de Janeiro': 'Tropical (Am)', 'Nairobi': 'Temperate highland (Cwb)',
  'Rome': 'Mediterranean (Csa)', 'Sydney': 'Humid subtropical (Cfa)', 'London': 'Oceanic (Cfb)',
  'Chicago': 'Cold/Continental (Dfa)', 'Moscow': 'Cold/Continental (Dfb)', 'Ulaanbaatar': 'Cold/Continental (Dwb)'
};

function summarize(label, records) {
  const lines = [label];
  INDEX_KEYS.forEach(key => {
    const recs = records.filter(r => r.index === key);
    const errors = recs.map(r => r.error);
    const relErrors = recs.filter(r => r.relErrorPct !== null).map(r => r.relErrorPct);
    const excluded = recs.length - relErrors.length;
    const refs = recs.map(r => r.cmip6Delta);
    const refStd = stdDev(refs);

    const maeVal = mean(errors.map(Math.abs));
    const rmseVal = rmse(errors);
    const biasVal = mean(errors);
    const mapeVal = mean(relErrors);
    const nrmseVal = (rmseVal !== null && refStd) ? (rmseVal / refStd) * 100 : null;
    const r = pearsonR(recs.map(rr => rr.epwDelta), refs);

    const fmt = v => v === null ? 'n/a' : v.toFixed(2);
    lines.push(
      `  ${key}: MAE=${fmt(maeVal)}  RMSE=${fmt(rmseVal)}  Bias=${fmt(biasVal)}  ` +
      `MAPE=${mapeVal !== null ? mapeVal.toFixed(1) + '%' : 'n/a'} (excl. ${excluded} near-zero-ref)  ` +
      `nRMSE=${nrmseVal !== null ? nrmseVal.toFixed(1) + '%' : 'n/a'}  r=${fmt(r)}  (n=${recs.length})`
    );
  });
  const text = lines.join('\n');
  console.log(`\n${text}`);
  return text;
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function diagnosticReport(records) {
  const lines = [];
  lines.push('='.repeat(78));
  lines.push('DIAGNOSTIC: residual error vs. CMIP6 ensemble std, and per-city breakdown');
  lines.push('(HDD/CDD only; testing whether the residual HDD bias correlates with');
  lines.push(' inter-model spread and/or climate type, consistent with a synoptic/');
  lines.push(' inter-annual variability-change effect that Shift+Stretch cannot capture,');
  lines.push(' as opposed to a simple, fixable definitional mismatch.)');
  lines.push('='.repeat(78));

  ['coolingDegreeDays', 'heatingDegreeDays'].forEach(key => {
    const recs = records.filter(r => r.index === key && r.cmip6Std !== null && r.baselineValue !== null);
    if (recs.length === 0) return;

    lines.push(`\n--- ${key} ---`);

    const errs = recs.map(r => Math.abs(r.error));
    const stds = recs.map(r => r.cmip6Std);
    const r_errVsStd = pearsonR(errs, stds);
    const [ciLoStd, ciHiStd] = fisherCI(r_errVsStd, recs.length);
    lines.push(`Correlation |error| vs CMIP6 ensemble std, across all ${recs.length} rows: r = ${r_errVsStd === null ? 'n/a' : r_errVsStd.toFixed(3)}` +
      (ciLoStd !== null ? ` (95% CI: ${ciLoStd.toFixed(3)} to ${ciHiStd.toFixed(3)})` : ''));

    const baselines = recs.map(r => r.baselineValue);
    const r_errVsBaseline = pearsonR(errs, baselines);
    lines.push(`Correlation |error| vs baseline (historical) ${key}, across all ${recs.length} rows: r = ${r_errVsBaseline === null ? 'n/a' : r_errVsBaseline.toFixed(3)}`);

    const biasVal = mean(recs.map(r => r.error));
    const meanBaselineOverall = mean(baselines);
    const medianBaselineOverall = median(baselines);
    const pctOfMean = (biasVal / meanBaselineOverall) * 100;
    const pctOfMedian = (biasVal / medianBaselineOverall) * 100;
    lines.push(`\nBias in context: mean (signed) error = ${biasVal >= 0 ? '+' : ''}${biasVal.toFixed(2)}`);
    lines.push(`Baseline (historical) ${key}: mean = ${meanBaselineOverall.toFixed(1)}, median = ${medianBaselineOverall.toFixed(1)} (${recs.length} rows, ${new Set(recs.map(r => r.location)).size} cities)`);
    lines.push(`Bias as % of baseline: ${pctOfMean.toFixed(1)}% of mean, ${pctOfMedian.toFixed(1)}% of median`);

    lines.push(`\nPer climate group (mean |error|, mean CMIP6 std, mean baseline value):`);
    const groups = [...new Set(recs.map(r => r.climateGroup))];
    const groupStats = groups.map(g => {
      const gr = recs.filter(r => r.climateGroup === g);
      return {
        group: g,
        n: gr.length,
        meanAbsErr: mean(gr.map(r => Math.abs(r.error))),
        meanStd: mean(gr.map(r => r.cmip6Std)),
        meanBaseline: mean(gr.map(r => r.baselineValue))
      };
    }).sort((a, b) => b.meanAbsErr - a.meanAbsErr);
    groupStats.forEach(g => {
      lines.push(`  ${g.group.padEnd(28)} meanAbsErr=${g.meanAbsErr.toFixed(1).padStart(7)}  meanCMIP6Std=${g.meanStd.toFixed(1).padStart(7)}  meanBaseline=${g.meanBaseline.toFixed(1).padStart(8)}  (n=${g.n})`);
    });

    lines.push(`\nPer city (mean |error|, mean CMIP6 std, mean baseline value), sorted worst to best:`);
    const cities = [...new Set(recs.map(r => r.location))];
    const cityStats = cities.map(c => {
      const cr = recs.filter(r => r.location === c);
      return {
        city: c,
        n: cr.length,
        meanAbsErr: mean(cr.map(r => Math.abs(r.error))),
        meanStd: mean(cr.map(r => r.cmip6Std)),
        meanBaseline: mean(cr.map(r => r.baselineValue))
      };
    }).sort((a, b) => b.meanAbsErr - a.meanAbsErr);
    cityStats.forEach(c => {
      lines.push(`  ${c.city.padEnd(20)} meanAbsErr=${c.meanAbsErr.toFixed(1).padStart(7)}  meanCMIP6Std=${c.meanStd.toFixed(1).padStart(7)}  meanBaseline=${c.meanBaseline.toFixed(1).padStart(8)}  (n=${c.n})`);
    });
  });

  const text = lines.join('\n');
  console.log('\n' + text);
  return text;
}

async function main() {
  const rows = [['Location', 'SSP', 'TargetYear', 'Index', 'EPW_Derived_Delta', 'CMIP6_Delta', 'Error', 'AbsError', 'RelErrorPct']];
  const records = [];

  for (const location of SAMPLE_LOCATIONS) {
    let epwData, gridCell;
    try {
      ({ epwData, gridCell } = await loadLocation(location));
    } catch (e) {
      console.error(`Failed to load ${location.name}:`, e.message);
      continue;
    }
    if (!gridCell) {
      console.warn(`No grid cell resolved for ${location.name}, skipping all scenarios.`);
      continue;
    }

    for (const ssp of SSPS_TO_RUN) {
      for (const targetYear of TARGET_YEARS_TO_RUN) {
        let result;
        try {
          result = await runOne(location, epwData, gridCell, ssp, targetYear);
        } catch (e) {
          console.error(`Failed for ${location.name} (${ssp}, ${targetYear}):`, e.message);
          continue;
        }
        if (!result || !result.benchmark) continue;

        INDEX_KEYS.forEach(key => {
          const { epwDelta, cmip6Delta } = result.benchmark[key];
          if (epwDelta === null || cmip6Delta === null) return;

          const error = epwDelta - cmip6Delta;
          const absErr = Math.abs(error);
          const epsilon = REL_ERROR_EPSILON[key] ?? 0;
          const relErrorPct = Math.abs(cmip6Delta) >= epsilon ? (absErr / Math.abs(cmip6Delta)) * 100 : null;

          const cmip6Std = key === 'coolingDegreeDays' ? result.cmip6CddStd
            : key === 'heatingDegreeDays' ? result.cmip6HddStd
            : null;
          const baselineValue = key === 'coolingDegreeDays' ? result.kpi.annualCDDBaseline
            : key === 'heatingDegreeDays' ? result.kpi.annualHDDBaseline
            : null;

          records.push({
            location: location.name, ssp, targetYear, index: key,
            epwDelta, cmip6Delta, error, relErrorPct, cmip6Std, baselineValue,
            climateGroup: CLIMATE_GROUP[location.name] || 'Unclassified'
          });
          rows.push([
            location.name, ssp, targetYear, key,
            displayRound(epwDelta), displayRound(cmip6Delta),
            displayRound(error), displayRound(absErr),
            relErrorPct !== null ? relErrorPct.toFixed(1) : 'n/a'
          ]);
        });
      }
    }
  }

  const csv = rows.map(r => r.join(',')).join('\n');
  console.log(csv);

  const summaryTexts = [];
  summaryTexts.push(summarize('Overall (all cities, SSPs, horizons):', records));
  SSPS_TO_RUN.forEach(ssp => {
    summaryTexts.push(summarize(`SSP = ${ssp}:`, records.filter(r => r.ssp === ssp)));
  });
  TARGET_YEARS_TO_RUN.forEach(year => {
    summaryTexts.push(summarize(`Target year = ${year}:`, records.filter(r => r.targetYear === year)));
  });

  const diagnosticText = diagnosticReport(records);

  const resultsDir = join(__dirname, 'results');
  mkdirSync(resultsDir, { recursive: true });
  const ts = timestamp();
  const csvPath = join(resultsDir, `epwinsights_morphing_validation_${ts}.csv`);
  const summaryPath = join(resultsDir, `epwinsights_morphing_validation_summary_${ts}.txt`);
  const diagnosticPath = join(resultsDir, `epwinsights_morphing_hdd_diagnostic_${ts}.txt`);

  writeFileSync(csvPath, csv, 'utf-8');

  const methodologyNote =
    'Note: heatingDegreeDays under ssp245/ssp370/ssp585 at target year 2080 is quantized\n' +
    'at a slightly reduced precision by the offline tile-generation pipeline (Int16 scale\n' +
    '~6.9-9.9 instead of 10.0, because the whole-Earth max |hdd| for those specific\n' +
    'SSP/period files would otherwise clip). Worst-case rounding error: +/-0.05 to\n' +
    '+/-0.07 degree-days, negligible next to the actual deltas (hundreds of degree-days).\n' +
    'Not interpolation/extrapolation, and not included in any statistic above beyond its\n' +
    'true (negligible) contribution to the raw values already used to compute them.\n\n' +
    'Note: coolingDegreeDays/heatingDegreeDays above are computed on the EPW side with\n' +
    'base temperatures of 22C/15.5C, matching the CMIP6-native cd/hd definition (IPCC AR6\n' +
    'WGI Annex VI), not the platform default of 24C/18C used elsewhere in the app. This is\n' +
    'a deliberate choice for this self-consistency comparison specifically, so both sides\n' +
    'use the same physical definition of a degree-day; see the manuscript, Section 4.2.';
  writeFileSync(summaryPath, summaryTexts.join('\n\n') + '\n\n' + methodologyNote, 'utf-8');
  writeFileSync(diagnosticPath, diagnosticText, 'utf-8');

  // --- Additional export for dependent-correlation comparison (Steiger's Z) ---
  const pairedRows = [['Location', 'SSP', 'TargetYear', 'CDD_Error', 'HDD_Error', 'CDD_EnsembleStd', 'HDD_EnsembleStd']];
  const byKey = {};
  records.forEach(r => {
    if (r.index !== 'coolingDegreeDays' && r.index !== 'heatingDegreeDays') return;
    const key = `${r.location}|${r.ssp}|${r.targetYear}`;
    byKey[key] = byKey[key] || { location: r.location, ssp: r.ssp, targetYear: r.targetYear };
    if (r.index === 'coolingDegreeDays') {
      byKey[key].cddError = r.error;
      byKey[key].cddStd = r.cmip6Std;
    } else {
      byKey[key].hddError = r.error;
      byKey[key].hddStd = r.cmip6Std;
    }
  });
  Object.values(byKey).forEach(row => {
    pairedRows.push([row.location, row.ssp, row.targetYear, row.cddError, row.hddError, row.cddStd, row.hddStd]);
  });
  const pairedCsv = pairedRows.map(r => r.join(',')).join('\n');
  const pairedPath = join(resultsDir, `epwinsights_hdd_cdd_paired_${ts}.csv`);
  writeFileSync(pairedPath, pairedCsv, 'utf-8');
  console.log(`Saved paired HDD/CDD error+std CSV to: ${pairedPath}`);


    console.log(`\nSaved CSV to: ${csvPath}`);
    console.log(`Saved summary to: ${summaryPath}`);
    console.log(`Saved HDD/CDD diagnostic to: ${diagnosticPath}`);
  }

main();
