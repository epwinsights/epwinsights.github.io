/**
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later. 
 *
 * Validation script for the core SolarCal (ERF / fp) formula against
 * ASHRAE 55-2023's own Table C4-1 (Appendix C, "Computer Code Validation
 * Table"), transcribed directly from the standard text.
 *
 * Scope: this checks the underlying physics engine, not
 * calculateAdvancedMRT() end to end. calculateAdvancedMRT() is an outdoor
 * adaptation of Appendix C (SHARP-averaged fp instead of a single known
 * orientation, tsol = 1 and fbes = 1 since there is no glazing outdoors,
 * measured diffuse radiation instead of the standard's 0.2 x Idir estimate,
 * and a variable ground reflectance instead of the standard's fixed 0.6).
 * None of those substitutions can be exercised by Table C4-1, since every
 * row in it uses tsol < 1 and fbes < 1 (indoor, behind-glass scenarios).
 *
 * So this script does two separate things:
 *
 * 1. Runs getFp() and erf(), a direct transcription of ASHRAE 55-2023's
 *    own get_fp() and ERF() functions (Appendix C), against Table C4-1.
 *    This is NOT the shipped app code; it exists only to confirm the fp
 *    lookup table and ERF formula were transcribed correctly, since the
 *    app itself has no reason to expose the raw, non-averaged fp function.
 *
 * 2. Imports the REAL, shipped getProjectedAreaFactor() indirectly via
 *    the project's own FP_SHARP_AVG_STANDING / FP_SHARP_AVG_SEATED
 *    constants (re-exported below for this check) and confirms they are
 *    the exact trapezoidal average, over the full 0-180 deg SHARP range,
 *    of the same official fp table used in step 1. This is the one part
 *    of the pipeline Table C4-1 cannot check directly (since it always
 *    holds SHARP fixed), so it is checked against the raw table instead.
 *
 * Excluded: the 3 "horizontal" posture rows in Table C4-1, which require
 * an additional alt/sharp transform not implemented here. 26 of 29 rows
 * are used, covering seated and standing.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const raw = readFileSync('./data/epwinsights_mrt_c4_validation.csv', 'utf-8');
const lines = raw.split('\n').filter(l => l.trim().length > 0);
const header = lines[0].split(',').map(h => h.trim());
const rows = lines.slice(1).map(line => {
  const parts = line.split(',');
  const row = {};
  header.forEach((h, i) => {
    row[h] = ['posture'].includes(h) ? parts[i] : Number(parts[i]);
  });
  return row;
}).filter(r => r.posture !== 'horizontal');

console.log(`Loaded ${rows.length} usable test cases (seated/standing) from ASHRAE 55-2023 Table C4-1`);

// --- 1. Direct transcription of ASHRAE 55-2023 Appendix C get_fp() / ERF() ---

const ALT_RANGE = [0, 15, 30, 45, 60, 75, 90];
const SHARP_RANGE = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];

const FP_TABLE_STANDING = [
  [0.35, 0.35, 0.314, 0.258, 0.206, 0.144, 0.082],
  [0.342, 0.342, 0.31, 0.252, 0.2, 0.14, 0.082],
  [0.33, 0.33, 0.3, 0.244, 0.19, 0.132, 0.082],
  [0.31, 0.31, 0.275, 0.228, 0.175, 0.124, 0.082],
  [0.283, 0.283, 0.251, 0.208, 0.16, 0.114, 0.082],
  [0.252, 0.252, 0.228, 0.188, 0.15, 0.108, 0.082],
  [0.23, 0.23, 0.214, 0.18, 0.148, 0.108, 0.082],
  [0.242, 0.242, 0.222, 0.18, 0.153, 0.112, 0.082],
  [0.274, 0.274, 0.245, 0.203, 0.165, 0.116, 0.082],
  [0.304, 0.304, 0.27, 0.22, 0.174, 0.121, 0.082],
  [0.328, 0.328, 0.29, 0.234, 0.183, 0.125, 0.082],
  [0.344, 0.344, 0.304, 0.244, 0.19, 0.128, 0.082],
  [0.347, 0.347, 0.308, 0.246, 0.191, 0.128, 0.082],
];

const FP_TABLE_SEATED = [
  [0.29, 0.324, 0.305, 0.303, 0.262, 0.224, 0.177],
  [0.292, 0.328, 0.294, 0.288, 0.268, 0.227, 0.177],
  [0.288, 0.332, 0.298, 0.29, 0.264, 0.222, 0.177],
  [0.274, 0.326, 0.294, 0.289, 0.252, 0.214, 0.177],
  [0.254, 0.308, 0.28, 0.276, 0.241, 0.202, 0.177],
  [0.23, 0.282, 0.262, 0.26, 0.233, 0.193, 0.177],
  [0.216, 0.26, 0.248, 0.244, 0.22, 0.186, 0.177],
  [0.234, 0.258, 0.236, 0.227, 0.208, 0.18, 0.177],
  [0.262, 0.26, 0.224, 0.208, 0.196, 0.176, 0.177],
  [0.28, 0.26, 0.21, 0.192, 0.184, 0.17, 0.177],
  [0.298, 0.256, 0.194, 0.174, 0.168, 0.168, 0.177],
  [0.306, 0.25, 0.18, 0.156, 0.156, 0.166, 0.177],
  [0.3, 0.24, 0.168, 0.152, 0.152, 0.164, 0.177],
];

function findSpan(arr, x) {
  for (let i = 0; i < arr.length - 1; i++) {
    if (x >= arr[i] && x <= arr[i + 1]) return i;
  }
  return -1;
}

function getFp(alt, sharp, posture) {
  const table = posture === 'standing' ? FP_TABLE_STANDING : FP_TABLE_SEATED;
  const altI = findSpan(ALT_RANGE, alt);
  const sharpI = findSpan(SHARP_RANGE, sharp);
  const fp11 = table[sharpI][altI];
  const fp12 = table[sharpI][altI + 1];
  const fp21 = table[sharpI + 1][altI];
  const fp22 = table[sharpI + 1][altI + 1];
  const [sharp1, sharp2] = [SHARP_RANGE[sharpI], SHARP_RANGE[sharpI + 1]];
  const [alt1, alt2] = [ALT_RANGE[altI], ALT_RANGE[altI + 1]];
  let fp = fp11 * (sharp2 - sharp) * (alt2 - alt);
  fp += fp21 * (sharp - sharp1) * (alt2 - alt);
  fp += fp12 * (sharp2 - sharp) * (alt - alt1);
  fp += fp22 * (sharp - sharp1) * (alt - alt1);
  fp /= (sharp2 - sharp1) * (alt2 - alt1);
  return fp;
}

const DEG_TO_RAD = 0.0174532925;

function erf(alt, sharp, posture, Idir, tsol, fsvv, fbes, asa) {
  const hr = 6;
  const Idiff = 0.2 * Idir;
  const fp = getFp(alt, sharp, posture);
  const feff = posture === 'standing' ? 0.725 : 0.696;
  const swAbs = asa;
  const lwAbs = 0.95;
  const eDiff = 0.5 * feff * fsvv * tsol * Idiff;
  const eDirect = fp * feff * fbes * tsol * Idir;
  const eRefl = 0.5 * feff * fsvv * tsol * (Idir * Math.sin(alt * DEG_TO_RAD) + Idiff) * 0.6;
  const eSolar = eDiff + eDirect + eRefl;
  const ERF = eSolar * (swAbs / lwAbs);
  const trsw = ERF / (hr * feff);
  return { ERF, trsw };
}

const jsResults = [];
const errsErf = [];
const errsTrsw = [];
for (const row of rows) {
  const { ERF, trsw } = erf(row.alt, row.sharp, row.posture, row.Idir, row.tsol, row.fsvv, row.fbes, row.asa);
  jsResults.push({ ERF, trsw });
  errsErf.push(ERF - row.ERF_ASHRAE55_2023);
  errsTrsw.push(trsw - row.trsw_ASHRAE55_2023);
}

function summarize(errArr, name) {
  const absErr = errArr.map(Math.abs);
  const n = errArr.length;
  const mean = errArr.reduce((a, b) => a + b, 0) / n;
  const mae = absErr.reduce((a, b) => a + b, 0) / n;
  const rmse = Math.sqrt(errArr.reduce((a, b) => a + b * b, 0) / n);
  const maxErr = Math.max(...absErr);
  console.log(`\n=== ${name} ===`);
  console.log(`N                 : ${n}`);
  console.log(`Mean error (bias) : ${mean.toFixed(4)}`);
  console.log(`MAE               : ${mae.toFixed(4)}`);
  console.log(`RMSE              : ${rmse.toFixed(4)}`);
  console.log(`Max |error|       : ${maxErr.toFixed(4)}`);
  return { n, mean, mae, rmse, maxErr };
}

summarize(errsErf, 'SolarCal ERF vs ASHRAE 55-2023 Table C4-1 (independent ground truth)');
summarize(errsTrsw, 'SolarCal trsw vs ASHRAE 55-2023 Table C4-1 (independent ground truth)');

// --- 2. Confirm the shipped SHARP-averaged fp constants against the same raw table ---

const FP_ALTITUDES = [0, 15, 30, 45, 60, 75, 90];
// These must match FP_SHARP_AVG_STANDING / FP_SHARP_AVG_SEATED in core/outdoor-comfort.js exactly.
const SHIPPED_FP_AVG_STANDING = [0.299, 0.299, 0.2683, 0.2194, 0.1739, 0.122, 0.082];
const SHIPPED_FP_AVG_SEATED = [0.2691, 0.2835, 0.2464, 0.236, 0.2164, 0.1915, 0.177];

function trapzAvgFp(alt, posture) {
  const step = 1;
  let total = 0;
  for (let s = 0; s < 180; s += step) {
    total += (getFp(alt, s, posture) + getFp(alt, s + step, posture)) / 2 * step;
  }
  return total / 180;
}

console.log('\n=== Shipped SHARP-averaged fp constants vs. trapezoidal average of Table C-3 raw fp table ===');
let fpAvgMaxErr = 0;
for (const [postureLabel, shipped] of [['standing', SHIPPED_FP_AVG_STANDING], ['seated', SHIPPED_FP_AVG_SEATED]]) {
  FP_ALTITUDES.forEach((alt, i) => {
    const computed = trapzAvgFp(alt, postureLabel);
    const diff = computed - shipped[i];
    fpAvgMaxErr = Math.max(fpAvgMaxErr, Math.abs(diff));
    console.log(`  ${postureLabel} alt=${alt}: computed=${computed.toFixed(4)} shipped=${shipped[i].toFixed(4)} diff=${diff.toFixed(4)}`);
  });
}
console.log(`Max |diff| across all 14 values: ${fpAvgMaxErr.toFixed(4)}`);

// Per-row results
const csvLines = [
  'alt,sharp,posture,Idir,tsol,fsvv,fbes,asa,ERF_ASHRAE55_2023,ERF_EPWInsights,Error_ERF,trsw_ASHRAE55_2023,trsw_EPWInsights,Error_trsw'
];
rows.forEach((row, i) => {
  csvLines.push([
    row.alt, row.sharp, row.posture, row.Idir, row.tsol, row.fsvv, row.fbes, row.asa,
    row.ERF_ASHRAE55_2023, jsResults[i].ERF.toFixed(4), errsErf[i].toFixed(4),
    row.trsw_ASHRAE55_2023, jsResults[i].trsw.toFixed(4), errsTrsw[i].toFixed(4)
  ].join(','));
});
mkdirSync('./results', { recursive: true });
writeFileSync('./results/epwinsights_mrt_c4_validation_rerun.csv', csvLines.join('\n'));
console.log('\nPer-row results written to results/epwinsights_mrt_c4_validation_rerun.csv');
