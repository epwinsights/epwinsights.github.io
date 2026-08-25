/**
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 *
 * Plausibility check for the sol-air ground surface temperature model
 * (getGroundSurfaceTemperature() in core/outdoor-comfort.js), which
 * replaced the earlier Tg = Ta assumption in the MRT longwave term.
 *
 * This is NOT a validation. There is no field-measured ground surface
 * temperature dataset available for this project to validate against, and
 * this script makes no such claim. What it checks instead is plausibility:
 * whether the model, run on real EPW data across a set of climatically
 * diverse cities, produces a ground-air temperature difference (Tg - Ta) of
 * a physically reasonable order of magnitude, one that responds sensibly to
 * climate and radiation intensity rather than producing implausible or
 * erratic values.
 *
 * Data: for each of the 14 EPW files used in the climate morphing
 * validation (see validate_morphing.mjs), the day with the single highest
 * hourly Global Horizontal Radiation was identified, and the 11:00-15:00
 * local standard time window of that day was extracted (see
 * extract_peak_ghi_window.ps1 in this repository). Using a 5-hour midday
 * window rather than one single hour avoids over-weighting a single,
 * possibly atypical hour (for example, an unusually calm one) that happens
 * to have the single highest instantaneous radiation value of the year.
 *
 * Ground surface material: the platform default (aged concrete paving,
 * alpha = 0.35, epsilon = 0.90). An earlier iteration of this check used a
 * grass/soil preset and found implausibly large temperature differences
 * under calm, high-radiation conditions; this was traced to the sol-air
 * model's lack of an evapotranspiration term, an effect that matters for
 * vegetated surfaces but not for dry, impermeable pavement, so the
 * platform's default ground material was changed accordingly.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { getGroundSurfaceTemperature } from './core/outdoor-comfort.js';
import { materialPresets } from './core/material-physics.js';
import * as SunCalc from 'suncalc';
import state from './state.js';

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

// Local civil time (EPW hour convention: hour N covers the period ending at N:00,
// so the representative instant is hour N-1:00) converted to a true UTC instant using
// the station's own UTC offset from the EPW LOCATION header.
function buildUtcDate(row) {
  const year = 2020; // arbitrary; EPW TMY/IWEC files are not tied to a real calendar year
  const utcMs = Date.UTC(year, toNum(row.month) - 1, toNum(row.day), toNum(row.hour) - 1, 0)
    - toNum(row.timezone) * 3600 * 1000;
  return new Date(utcMs);
}

function computeDeltaT(row) {
  const date = buildUtcDate(row);
  const sunPos = SunCalc.getPosition(date, toNum(row.lat), toNum(row.lon));
  const altRad = sunPos.altitude * Math.PI / 180;

  const d = {
    dryBulbTemperature: toNum(row.dryBulb),
    dewPointTemperature: toNum(row.dewPoint),
    directNormalRadiation: toNum(row.directNormal),
    diffuseHorizontalRadiation: toNum(row.diffuseHoriz),
    horizontalInfraredRadiationIntensity: toNum(row.horizIR),
    windSpeed: toNum(row.windSpeed)
  };

  const preset = materialPresets[state.urbanContext.groundMaterial];
  const tGround = getGroundSurfaceTemperature(d, altRad, preset.alpha, preset.eps, 1.0);
  return { ta: d.dryBulbTemperature, tGround, deltaT: tGround - d.dryBulbTemperature };
}

const cities = [];
const byCity = {};
for (const row of rows) {
  if (!byCity[row.city]) { byCity[row.city] = []; cities.push(row.city); }
  byCity[row.city].push(row);
}

console.log(`Loaded ${rows.length} rows (${cities.length} cities x 5-hour midday window)`);
console.log(`Ground material: ${materialPresets[state.urbanContext.groundMaterial].name} (alpha=${state.urbanContext.groundAlpha}, eps=${state.urbanContext.groundEps})`);
console.log('');
console.log('City'.padEnd(20), 'Koppen'.padEnd(8), 'meanTa'.padStart(8), 'meanTg'.padStart(8), 'meanDT'.padStart(8), 'minDT'.padStart(7), 'maxDT'.padStart(7));

const outLines = ['city,koppen,peak_day_month,peak_day_day,mean_Ta_C,mean_Tg_C,mean_deltaT_C,min_deltaT_C,max_deltaT_C'];
const cityMeans = [];

for (const city of cities) {
  const results = byCity[city].map(computeDeltaT);
  const meanTa = results.reduce((a, r) => a + r.ta, 0) / results.length;
  const meanTg = results.reduce((a, r) => a + r.tGround, 0) / results.length;
  const deltas = results.map(r => r.deltaT);
  const meanDT = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const minDT = Math.min(...deltas);
  const maxDT = Math.max(...deltas);

  const info = CITY_INFO[city] || { display: city, koppen: '' };
  console.log(info.display.padEnd(20), info.koppen.padEnd(8), meanTa.toFixed(1).padStart(8), meanTg.toFixed(1).padStart(8), meanDT.toFixed(1).padStart(8), minDT.toFixed(1).padStart(7), maxDT.toFixed(1).padStart(7));

  cityMeans.push(meanDT);
  outLines.push([info.display, info.koppen, byCity[city][0].month, byCity[city][0].day, meanTa.toFixed(1), meanTg.toFixed(1), meanDT.toFixed(1), minDT.toFixed(1), maxDT.toFixed(1)].join(','));
}

const overallMean = cityMeans.reduce((a, b) => a + b, 0) / cityMeans.length;
console.log('');
console.log(`Mean of city means: ${overallMean.toFixed(1)} C`);
console.log(`Range of city means: ${Math.min(...cityMeans).toFixed(1)} to ${Math.max(...cityMeans).toFixed(1)} C`);

mkdirSync('./results', { recursive: true });
writeFileSync('./results/epwinsights_ground_temp_plausibility.csv', outLines.join('\n'));
console.log('\nPer-city results written to results/epwinsights_ground_temp_plausibility.csv');
