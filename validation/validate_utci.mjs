/**
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later. 
 *
 * Validation script for EPW Insights' calculateUTCI() function.
 *
 * Runs the actual project source (core/outdoor-comfort.js) against the
 * independent UTCI test dataset from Bröde et al. (2012) / Zenodo 5503968,
 * using the UTCI-Fiala model column as ground truth.
 *
 * This implementation exactly mirrors the methodology of Cell 17 in
 * UTCI_sparse_regression.ipynb (Roman et al. 2025), allowing direct
 * comparison of statistics with the "standard" and "new" approximations
 * reported in that paper.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { calculateUTCI } from './core/outdoor-comfort.js';

const raw = readFileSync('./data/UTCI-Test-Data.txt', 'utf-8');
const lines = raw.split('\n').filter(l => l.trim().length > 0 && !l.startsWith('#'));

const header = lines[0].split('\t').map(h => h.trim());
const rows = lines.slice(1).map(line => {
  const parts = line.split('\t').map(Number);
  const row = {};
  header.forEach((h, i) => { row[h] = parts[i]; });
  return row;
});

console.log(`Loaded ${rows.length} independent test cases from UTCI-Test-Data.txt`);

const errors = [];
const jsResults = [];
for (const row of rows) {
  const Ta = row['Ta'];
  const dTrTa = row['Tr-Ta'];
  const va = row['va'];
  const rH = row['rH'];
  const utciFiala = row['UTCI']; // ground truth (UTCI-Fiala model)

  const tr = Ta + dTrTa;
  const jsUtci = calculateUTCI(Ta, tr, va, rH);

  jsResults.push(jsUtci);
  errors.push(jsUtci - utciFiala);
}

function summarize(errArr, name) {
  const absErr = errArr.map(Math.abs);
  const n = errArr.length;
  const mean = errArr.reduce((a, b) => a + b, 0) / n;
  const mae = absErr.reduce((a, b) => a + b, 0) / n;
  const rmse = Math.sqrt(errArr.reduce((a, b) => a + b * b, 0) / n);

  const sortedAbs = [...absErr].sort((a, b) => a - b);
  const percentile = p => {
    const idx = (p / 100) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sortedAbs[lo];
    return sortedAbs[lo] + (sortedAbs[hi] - sortedAbs[lo]) * (idx - lo);
  };

  const tail = thr => 100 * absErr.filter(e => e >= thr).length / n;

  console.log(`\n=== ${name} ===`);
  console.log(`N                 : ${n}`);
  console.log(`Mean error        : ${mean.toFixed(4)}`);
  console.log(`MAE               : ${mae.toFixed(4)}`);
  console.log(`RMSE              : ${rmse.toFixed(4)}`);
  console.log('Abs-error percentiles (°C):');
  for (const p of [50, 90, 99, 99.9, 99.99]) {
    console.log(`  ${p}% : ${percentile(p).toFixed(4)}`);
  }
  console.log('Tail frequencies (% of cases with |error| >= threshold):');
  for (const thr of [1, 2, 3, 4, 5]) {
    console.log(`  >= ${thr}°C : ${tail(thr).toFixed(2)}%`);
  }

  return { n, mean, mae, rmse };
}

const result = summarize(errors, 'EPW Insights calculateUTCI() vs UTCI-Fiala (independent test data)');

const csvLines = ['Ta,Tr_Ta,va,rH,UTCI_Fiala,UTCI_EPWInsights,Error'];
rows.forEach((row, i) => {
  csvLines.push([row['Ta'], row['Tr-Ta'], row['va'], row['rH'], row['UTCI'], jsResults[i].toFixed(4), errors[i].toFixed(4)].join(','));
});
mkdirSync('./results', { recursive: true });
writeFileSync('./results/epwinsights_utci_validation.csv', csvLines.join('\n'));
console.log('\nPer-row results written to epwinsights_utci_validation.csv');
