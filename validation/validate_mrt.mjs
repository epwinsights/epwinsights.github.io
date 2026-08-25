/**
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later. 
 *
 * Validation script for EPW Insights' calculateShortwaveDeltaMRT() - the
 * shortwave (solar) component of outdoor MRT.
 *
 * Unlike UTCI and SET, MRT as implemented has no single official ground
 * truth. It consists of two physically separate problems:
 *
 * 1. Shortwave (direct/diffuse/ground-reflected solar)
 *    -> Has an official reference: ASHRAE 55 Appendix C (SolarCal),
 *       as implemented in pythermalcomfort.solar_gain(). This script
 *       validates exactly this part.
 *
 * 2. Longwave (sky/ground temperature, SVF)
 *    -> No official standard exists (drawn from urban microclimate
 *       literature such as SOLWEIG/UMEP, and from a sol-air ground surface
 *       temperature model). Therefore it is documented as a limitation
 *       rather than validated here.
 *
 * Note on SHARP averaging:
 * pythermalcomfort.solar_gain() is defined for a single SHARP value
 * (solar horizontal angle relative to the person). Since EPW Insights
 * has no knowledge of a pedestrian's facing direction, it uses the
 * SHARP-averaged tables (FP_SHARP_AVG_STANDING / FP_SHARP_AVG_SEATED).
 * The ground truth column (`ref_dmrt_sharp_avg`) is the official
 * ASHRAE 55 SolarCal formula evaluated with trapezoidal averaging
 * over all SHARP angles - the correct reference for the "randomly
 * oriented person" assumption used in this library.
 *
 * This script follows the same philosophy as `validate_utci.mjs` and
 * `validate_set.mjs`:
 * - The ACTUAL project source (core/outdoor-comfort.js) is imported
 *   and executed unmodified.
 * - No formula is re-implemented in another language.
 *
 * Isolating shortwave delta-MRT:
 * calculateShortwaveDeltaMRT() is the shortwave-only sub-component of
 * calculateAdvancedMRT(), factored out specifically so it can be exercised
 * on its own, independent of the longwave/ground-temperature model. This
 * replaces an earlier version of this script that isolated the shortwave
 * delta by calling calculateAdvancedMRT() twice (once with radiation zeroed
 * out) and subtracting; that approach relied on the longwave term being
 * identical in both calls, which stopped holding once the ground surface
 * temperature became a function of solar radiation (sol-air model, see the
 * "Ground Surface Temperature" section of the manuscript). Calling the
 * shortwave function directly is both simpler and immune to any future
 * change in the longwave model.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { calculateShortwaveDeltaMRT } from './core/outdoor-comfort.js';
import state from './state.js';

const raw = readFileSync('./data/epwinsights_mrt_validation.csv', 'utf-8');
const lines = raw.split('\n').filter(l => l.trim().length > 0);

const header = lines[0].split(',').map(h => h.trim());
const rows = lines.slice(1).map(line => {
  const parts = line.split(',');
  const row = {};
  header.forEach((h, i) => {
    row[h] = (h === 'posture') ? parts[i].trim() : Number(parts[i]);
  });
  return row;
});

console.log(`Loaded ${rows.length} independent test cases (ASHRAE 55 SolarCal, SHARP-averaged fp)`);

state.urbanContext = {
  enabled: false, aspectRatio: 0.0, svf: 1.0, shadingFactor: 0.0,
  groundMaterial: 'paving_grass_soil', groundAlpha: 0.74, groundEps: 0.95
};

function computeDmrt(row) {
  const altRad = row['alt'] * Math.PI / 180;
  const d = {
    directNormalRadiation: row['direct'],
    diffuseHorizontalRadiation: row['diffuse']
  };
  const params = { posture: row['posture'], groundReflectance: row['ground_refl'] };
  return calculateShortwaveDeltaMRT(d, altRad, params);
}

const errors = [];
const jsResults = [];
for (const row of rows) {
  const jsDmrt = computeDmrt(row);
  jsResults.push(jsDmrt);
  errors.push(jsDmrt - row['ref_dmrt_sharp_avg']);
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
  console.log(`Mean error (bias) : ${mean.toFixed(6)}`);
  console.log(`MAE               : ${mae.toFixed(6)}`);
  console.log(`RMSE              : ${rmse.toFixed(6)}`);
  console.log(`Max |error|       : ${maxErr.toFixed(6)}`);

  return { n, mean, mae, rmse, maxErr };
}

summarize(errors, 'EPW Insights shortwave dMRT vs ASHRAE 55 SolarCal (SHARP-averaged, implementation-fidelity check)');

const csvLines = ['alt,direct,diffuse,ground_refl,posture,ref_dmrt_sharp_avg,js_dmrt,err'];
rows.forEach((row, i) => {
  csvLines.push([
    row['alt'], row['direct'], row['diffuse'], row['ground_refl'], row['posture'],
    row['ref_dmrt_sharp_avg'], jsResults[i].toFixed(4), errors[i].toFixed(4)
  ].join(','));
});
mkdirSync('./results', { recursive: true });
writeFileSync('./results/epwinsights_mrt_validation_rerun.csv', csvLines.join('\n'));
console.log('\nPer-row results written to results/epwinsights_mrt_validation_rerun.csv');
