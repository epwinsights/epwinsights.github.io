/**
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 *
 * Sensitivity analysis for the SHARP-averaged projected area factor (fp)
 * used by calculateShortwaveDeltaMRT() (core/outdoor-comfort.js) in the
 * default, unknown-pedestrian-orientation case.
 *
 * This is NOT a validation. getProjectedAreaFactor() (SHARP-averaged) and
 * getFp() (the raw, known-orientation ASHRAE 55-2023 Table C-3 lookup) are
 * both already validated against the standard's own Table C4-1 in
 * validate_mrt_c4.mjs. What this script checks instead is sensitivity:
 * for real EPW conditions across 14 climatically diverse cities, how much
 * does the shortwave delta-MRT change between the platform's default
 * (SHARP-averaged) output and the best-case / worst-case a pedestrian with
 * a known, fixed facing direction could actually experience.
 *
 * Data: the same 14-city, 11:00-15:00 LST midday-window dataset used by
 * validate_ground_temp_plausibility.mjs, for methodological consistency
 * between the two sensitivity checks.
 *
 * Method: for each city-hour, calculateShortwaveDeltaMRT() is evaluated
 * with the default (facingAzimuth = null, SHARP-averaged) case, and then
 * swept across 72 candidate facing directions (every 5 degrees) to find
 * the true best-case (lowest) and worst-case (highest) shortwave delta-MRT
 * a known, fixed orientation could produce for that hour's actual sun
 * position.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { calculateShortwaveDeltaMRT } from './core/outdoor-comfort.js';
import * as SunCalc from 'suncalc';

const CITY_INFO = {
  'CAIRO': { display: 'Cairo', koppen: 'BWh' },
  'Chicago.Midway_International_Airport': { display: 'Chicago', koppen: 'Dfa' },
  'London.City.AP': { display: 'London', koppen: 'Cfb' },
  'MOSCOW': { display: 'Moscow', koppen: 'Dfb' },
  'MUMBAI': { display: 'Mumbai', koppen: 'Aw' },
  'NAIROBI.Wilson_Airport': { display: 'Nairobi', koppen: 'Cwb' },
  'Phoenix.Sky_Harbor_International_Airport': { display: 'Phoenix', koppen: 'BWh' },
  'Rio de Janeiro.Vila Militar': { display: 'Rio de Janeiro', koppen: 'Am' },
  'ROME': { display: 'Rome', koppen: 'Csa' },
  'SANTIAGO': { display: 'Santiago', koppen: 'BSk' },
  'SINGAPORE': { display: 'Singapore', koppen: 'Af' },
  'SYDNEY': { display: 'Sydney', koppen: 'Cfa' },
  'Tehran.Mehrabad Intl AP': { display: 'Tehran', koppen: 'BSk' },
  'ULAANBATAAR': { display: 'Ulaanbaatar', koppen: 'Dwb' }
};

const raw = readFileSync('./data/epwinsights_14city_peak_ghi_window.csv', 'utf-8');
const lines = raw.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim().length > 0);
const header = lines[0].split(',').map(h => h.trim());
const rows = lines.slice(1).map(line => {
  const parts = line.split(',');
  const row = {};
  header.forEach((h, i) => { row[h] = parts[i] !== undefined ? parts[i].trim() : ''; });
  return row;
});

function toNum(v) { return parseFloat(v); }

function buildUtcDate(row) {
  const year = 2020;
  const utcMs = Date.UTC(year, toNum(row.month) - 1, toNum(row.day), toNum(row.hour) - 1, 0)
    - toNum(row.timezone) * 3600 * 1000;
  return new Date(utcMs);
}

function analyzeRow(row) {
  const date = buildUtcDate(row);
  const sunPos = SunCalc.getPosition(date, toNum(row.lat), toNum(row.lon));
  const altRad = sunPos.altitude * Math.PI / 180;

  const d = {
    directNormalRadiation: toNum(row.directNormal),
    diffuseHorizontalRadiation: toNum(row.diffuseHoriz)
  };

  const baseParams = { posture: 'standing', groundReflectance: 0.65 };
  const averaged = calculateShortwaveDeltaMRT(d, altRad, { ...baseParams, facingAzimuth: null }, sunPos.azimuth);

  let worst = -Infinity;
  let best = Infinity;
  for (let facing = 0; facing < 360; facing += 5) {
    const val = calculateShortwaveDeltaMRT(d, altRad, { ...baseParams, facingAzimuth: facing }, sunPos.azimuth);
    if (val > worst) worst = val;
    if (val < best) best = val;
  }

  return { averaged, worst, best, altDeg: sunPos.altitude };
}

const cities = [];
const byCity = {};
for (const row of rows) {
  if (!byCity[row.city]) { byCity[row.city] = []; cities.push(row.city); }
  byCity[row.city].push(row);
}

console.log(`Loaded ${rows.length} rows (${cities.length} cities x 5-hour midday window)`);
console.log('');
console.log('City'.padEnd(20), 'Koppen'.padEnd(8), 'avgMRT'.padStart(8), 'worstMRT'.padStart(9), 'bestMRT'.padStart(8), 'worst-avg'.padStart(10), 'avg-best'.padStart(9));

const outLines = ['city,koppen,mean_averaged_dMRT_C,mean_worst_dMRT_C,mean_best_dMRT_C,mean_worst_minus_avg_C,mean_avg_minus_best_C'];
const allWorstMinusAvg = [];
const allAvgMinusBest = [];

for (const city of cities) {
  const results = byCity[city].filter(r => toNum(r.directNormal) > 0 || toNum(r.diffuseHoriz) > 0).map(analyzeRow);
  if (results.length === 0) continue;

  const meanOf = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const meanAvg = meanOf(results.map(r => r.averaged));
  const meanWorst = meanOf(results.map(r => r.worst));
  const meanBest = meanOf(results.map(r => r.best));
  const meanWorstMinusAvg = meanOf(results.map(r => r.worst - r.averaged));
  const meanAvgMinusBest = meanOf(results.map(r => r.averaged - r.best));

  const info = CITY_INFO[city] || { display: city, koppen: '' };
  console.log(
    info.display.padEnd(20), info.koppen.padEnd(8),
    meanAvg.toFixed(1).padStart(8), meanWorst.toFixed(1).padStart(9), meanBest.toFixed(1).padStart(8),
    meanWorstMinusAvg.toFixed(1).padStart(10), meanAvgMinusBest.toFixed(1).padStart(9)
  );

  allWorstMinusAvg.push(meanWorstMinusAvg);
  allAvgMinusBest.push(meanAvgMinusBest);

  outLines.push([
    info.display, info.koppen, meanAvg.toFixed(1), meanWorst.toFixed(1), meanBest.toFixed(1),
    meanWorstMinusAvg.toFixed(1), meanAvgMinusBest.toFixed(1)
  ].join(','));
}

console.log('');
console.log(`Mean (worst - averaged) across 14 cities: ${(allWorstMinusAvg.reduce((a, b) => a + b, 0) / allWorstMinusAvg.length).toFixed(1)} C`);
console.log(`Mean (averaged - best) across 14 cities:  ${(allAvgMinusBest.reduce((a, b) => a + b, 0) / allAvgMinusBest.length).toFixed(1)} C`);

mkdirSync('./results', { recursive: true });
writeFileSync('./results/epwinsights_sharp_sensitivity.csv', outLines.join('\n'));
console.log('\nPer-city results written to results/epwinsights_sharp_sensitivity.csv');
