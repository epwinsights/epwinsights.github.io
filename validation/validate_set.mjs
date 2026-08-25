/**
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later. 
 *
 * Validation script for EPW Insights' calculateSET() function.
 *
 * Runs the ACTUAL project source (core/outdoor-comfort.js) against the
 * official ASHRAE 55-2023 Appendix D4 ground truth (22 rows). The test
 * data was transcribed directly from the standard's own published table,
 * not from a third-party package, since ASHRAE 55-2023 publishes SET
 * reference values that differ from the 2013 Table G-1 (a documented
 * edition-to-edition change in three model constants: cDil, the hCc
 * metabolic floor, and tempCoreNeutral; see the comment in
 * core/outdoor-comfort.js for details).
 *
 * This script mirrors the methodology used in validate_utci.mjs:
 * - The real JS module is imported and executed unmodified.
 * - No re-implementation in another language.
 * - Every error reported here is a genuine measure of calculateSET() itself.
 *
 * This validation deliberately compensates for two implementation details:
 *
 * 1. Wind speed handling:
 *    calculateSET() internally converts v10 (10m wind speed) to
 *    near-body wind speed using airSpeed = v10 * 0.67 (outdoor
 *    simplification). Since the ASHRAE table's vel column is already
 *    at the correct reference height, we pass v10 = vel / 0.67 so the
 *    internal factor cancels out exactly.
 *
 * 2. Human parameters:
 *    state.humanParams (met, clo, posture) must be set per-row before
 *    each call, because calculateSET() reads them from shared state
 *    rather than accepting them as direct arguments.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { calculateSET } from './core/outdoor-comfort.js';
import state from './state.js';

const raw = readFileSync('./data/epwinsights_set_validation.csv', 'utf-8');
const lines = raw.split('\n').filter(l => l.trim().length > 0);

const header = lines[0].split(',').map(h => h.trim());
const rows = lines.slice(1).map(line => {
  const parts = line.split(',').map(Number);
  const row = {};
  header.forEach((h, i) => { row[h] = parts[i]; });
  return row;
});

console.log(`Loaded ${rows.length} independent test cases from ASHRAE 55-2023 Appendix D4`);

const WIND_COMPENSATION = 0.67; // cancels calculateSET()'s internal v10 * 0.67 reduction

function runRow(row) {
  state.humanParams = {
    posture: 'standing',
    groundReflectance: 0.25,
    metabolicRate: row['met'],
    clothingInsulation: row['clo']
  };

  const v10Compensated = row['vel'] / WIND_COMPENSATION;
  return calculateSET(row['Ta'], row['Tr'], v10Compensated, row['rH']);
}

const jsResults = [];
const errorsVsAshrae = [];
for (const row of rows) {
  const jsSet = runRow(row);
  jsResults.push(jsSet);
  errorsVsAshrae.push(jsSet - row['SET_ASHRAE55_2023']);
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

summarize(errorsVsAshrae, 'EPW Insights calculateSET() vs ASHRAE 55-2023 Appendix D4 (independent ground truth)');

// Per-row results, for the article appendix / Bland-Altman plot
const csvLines = [
  'Ta,Tr,vel,rH,met,clo,SET_ASHRAE55_2023,SET_EPWInsights,Error_vs_ASHRAE'
];
rows.forEach((row, i) => {
  csvLines.push([
    row['Ta'], row['Tr'], row['vel'], row['rH'], row['met'], row['clo'],
    row['SET_ASHRAE55_2023'], jsResults[i].toFixed(4),
    errorsVsAshrae[i].toFixed(4)
  ].join(','));
});
mkdirSync('./results', { recursive: true });
writeFileSync('./results/epwinsights_set_validation_rerun.csv', csvLines.join('\n'));
console.log('\nPer-row results written to results/epwinsights_set_validation_rerun.csv');
