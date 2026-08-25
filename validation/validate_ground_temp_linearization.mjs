/**
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 *
 * Quantifies the error introduced by the earliest closed-form linearization of the
 * sol-air ground surface temperature model (q_lw evaluated at T_air,K instead of
 * T_surf,K, used to avoid an iterative solve), against the current
 * getGroundSurfaceTemperature() in core/outdoor-comfort.js. The "new" column always
 * calls the real, current function, so it automatically reflects whichever iterative
 * method solveSteadyStateSurfaceTemperature() uses internally; as of this revision
 * that is the linearized radiative heat transfer coefficient (h_r) method used for
 * the exterior surface heat balance in EnergyPlus (Walton 1983; ASHRAE 1993 Handbook
 * of Fundamentals; McClellan and Pedersen 1997), not the intermediate 5-iteration
 * fixed-point solve this project used for a time in between (see
 * validate_fixedpoint_convergence.mjs for that intermediate stage's own diagnostic).
 *
 * Uses the same 14-city, 11:00-15:00 LST peak-GHI-day midday window as
 * validate_ground_temp_plausibility.mjs, so the two scripts share their input data
 * and city set. The "old" column reproduces the very first, pre-iterative formula
 * inline (rather than importing it, since it no longer exists in the codebase in any
 * form); the "new" column calls the actual, current getGroundSurfaceTemperature().
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { getGroundSurfaceTemperature } from './core/outdoor-comfort.js';
import { getEffectiveSkyTemperatureK } from './core/sky-temperature.js';
import { materialPresets } from './core/material-physics.js';
import * as SunCalc from 'suncalc';
import state from './state.js';

const SIGMA = 5.67e-8;

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

// Pre-fix linearized formula, reproduced inline (evaluates q_lw at T_air,K).
function oldLinearizedGroundTemp(d, altRad, groundAlpha, groundEps, svf, ho) {
  const ta = d.dryBulbTemperature;
  const taK = ta + 273.15;
  const tSkyK = getEffectiveSkyTemperatureK(ta, d.dewPointTemperature, d.horizontalInfraredRadiationIntensity);

  let groundDirect = d.directNormalRadiation;
  if (state.urbanContext.enabled) {
    groundDirect = groundDirect * (1 - state.urbanContext.shadingFactor);
  }
  const incidentDirect = altRad > 0 ? groundDirect * Math.sin(altRad) : 0;
  const incidentDiffuse = d.diffuseHorizontalRadiation * svf;
  const iTotal = incidentDirect + incidentDiffuse;

  const lwLoss = groundEps * SIGMA * (Math.pow(taK, 4) - Math.pow(tSkyK, 4)) * svf;
  return ta + (groundAlpha * iTotal - lwLoss) / ho;
}

function computeRow(row) {
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
  const groundKey = state.urbanContext.groundMaterial;

  // ho only depends on wind speed and material roughness, unaffected by the fix,
  // so it is safe to compute once via the current (post-fix) code path and reuse
  // it for the old formula too, isolating the comparison to the longwave term.
  const tNew = getGroundSurfaceTemperature(d, altRad, preset.alpha, preset.eps, 1.0);

  // Recover the ho actually used by getGroundSurfaceTemperature is not exposed, so
  // it is recomputed here identically for the old formula.
  const groundInfo = materialPresets[groundKey];
  const smooth = groundInfo && (groundInfo.group === 'Glass' || groundInfo.group === 'Metals');
  const V = Math.max(d.windSpeed || 0, 0);
  let m, n, p;
  if (V < 4.88) { m = smooth ? 0.99 : 1.09; n = smooth ? 0.21 : 0.23; p = 1; }
  else { m = 0; n = smooth ? 0.50 : 0.53; p = 0.78; }
  const ho = Math.max(5.678 * (m + n * Math.pow(V / 0.3048, p)), 5.0);

  const tOld = oldLinearizedGroundTemp(d, altRad, preset.alpha, preset.eps, 1.0, ho);

  return { ta: d.dryBulbTemperature, tOld, tNew, error: tOld - tNew };
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
console.log('City'.padEnd(20), 'Koppen'.padEnd(8), 'meanTold'.padStart(9), 'meanTnew'.padStart(9), 'meanErr'.padStart(8), 'maxErr'.padStart(7));

const outLines = ['city,koppen,mean_Told_C,mean_Tnew_C,mean_error_C,max_abs_error_C'];
const cityMeanErrors = [];

for (const city of cities) {
  const results = byCity[city].map(computeRow);
  const meanTold = results.reduce((a, r) => a + r.tOld, 0) / results.length;
  const meanTnew = results.reduce((a, r) => a + r.tNew, 0) / results.length;
  const errors = results.map(r => r.error);
  const meanErr = errors.reduce((a, b) => a + b, 0) / errors.length;
  const maxAbsErr = Math.max(...errors.map(Math.abs));

  const info = CITY_INFO[city] || { display: city, koppen: '' };
  console.log(info.display.padEnd(20), info.koppen.padEnd(8), meanTold.toFixed(2).padStart(9), meanTnew.toFixed(2).padStart(9), meanErr.toFixed(3).padStart(8), maxAbsErr.toFixed(3).padStart(7));

  cityMeanErrors.push(meanErr);
  outLines.push([info.display, info.koppen, meanTold.toFixed(2), meanTnew.toFixed(2), meanErr.toFixed(3), maxAbsErr.toFixed(3)].join(','));
}

const overallMeanErr = cityMeanErrors.reduce((a, b) => a + b, 0) / cityMeanErrors.length;
console.log('');
console.log(`Mean of city mean errors (old - new): ${overallMeanErr.toFixed(3)} C`);
console.log(`Range of city mean errors: ${Math.min(...cityMeanErrors).toFixed(3)} to ${Math.max(...cityMeanErrors).toFixed(3)} C`);

mkdirSync('./results', { recursive: true });
writeFileSync('./results/epwinsights_ground_temp_linearization_error.csv', outLines.join('\n'));
console.log('\nPer-city results written to results/epwinsights_ground_temp_linearization_error.csv');
