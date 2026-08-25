/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';

export const INDEX_METADATA = {
  'relativeHeatwave': { label: 'Relative Heatwave', tooltip: 'Period of 3+ consecutive days with daily mean temperature exceeding the year\'s 95th percentile', color: '#d73027', category: 'Thermal Waves' },
  'relativeColdwave': { label: 'Relative Coldwave', tooltip: 'Period of 3+ consecutive days with daily mean temperature dropping below the year\'s 5th percentile', color: '#4575b4', category: 'Thermal Waves' },
  'maxTempAbs': { label: 'Absolute Max Temp', tooltip: 'The single day with the highest recorded dry bulb temperature', color: '#b30000', category: 'Temperature Extremes' },
  'minTempAbs': { label: 'Absolute Min Temp', tooltip: 'The single day with the lowest recorded dry bulb temperature', color: '#045a8d', category: 'Temperature Extremes' },
  'extremeHeat': { label: 'Extreme Heat Day', tooltip: 'Daily mean temperature is above the 95th percentile', color: '#fc8d59', category: 'Temperature Extremes' },
  'extremeCold': { label: 'Extreme Cold Day', tooltip: 'Daily mean temperature is below the 5th percentile', color: '#74add1', category: 'Temperature Extremes' },
  'maxRadAbs': { label: 'Absolute Max Radiation', tooltip: 'The day with the highest peak global horizontal radiation', color: '#e6550d', category: 'Solar & Moisture' },
  'extremeRad': { label: 'Extreme Solar Day', tooltip: 'Daily max solar radiation is above the 95th percentile', color: '#fec44f', category: 'Solar & Moisture' },
  'maxRhAbs': { label: 'Absolute Max Humidity', tooltip: 'The day with the highest peak relative humidity', color: '#006d2c', category: 'Solar & Moisture' },
  'extremeRh': { label: 'Extreme Humid Day', tooltip: 'Daily max relative humidity is above the 95th percentile', color: '#74c476', category: 'Solar & Moisture' },
  'frostDay': { label: 'Frost Day', tooltip: 'Minimum daily temperature drops below 0°C', color: '#6baed6', category: 'ETCCDI Indices' },
  'tropicalNight': { label: 'Tropical Night', tooltip: 'Minimum daily temperature does not drop below 20°C', color: '#f46d43', category: 'ETCCDI Indices' },
  'summerDay': { label: 'Summer Day', tooltip: 'Maximum daily temperature exceeds 25°C', color: '#fdae61', category: 'ETCCDI Indices' },
  'peakCDD': { label: 'Peak Cooling Demand', tooltip: 'The day with the highest calculated Cooling Degree Days (CDD)', color: '#d53e4f', category: 'ASHRAE Demand' },
  'peakHDD': { label: 'Peak Heating Demand', tooltip: 'The day with the highest calculated Heating Degree Days (HDD)', color: '#5e4fa2', category: 'ASHRAE Demand' }
};

export const PRIORITY_ORDER = [
  'relativeHeatwave', 'relativeColdwave', 'maxTempAbs', 'minTempAbs',
  'extremeHeat', 'extremeCold', 'peakCDD', 'peakHDD',
  'maxRadAbs', 'maxRhAbs', 'extremeRad', 'extremeRh',
  'tropicalNight', 'frostDay', 'summerDay'
];

// Simplified sol-air temperature for a horizontal (roof-facing) surface.
// Source: ASHRAE Handbook, Fundamentals, Chapter 18 "Nonresidential Cooling and
// Heating Load Calculations", Section "Sol-Air Temperature", Eq. 29:
//   te = to + (alpha * Et) / ho - (epsilon * deltaR) / ho
// with the tabulated simplification (same chapter, "Tabulated Temperature Values"):
//   alpha/ho = 0.026 for a light-colored surface, 0.052 for a dark-colored surface
//   (epsilon * deltaR) / ho = 4 K for a horizontal surface (ho = 17 W/(m2*K)),
//   assuming epsilon = 1; this term is taken as 0 for vertical surfaces by common
//   practice, per the same section, since it does not apply here (horizontal only).
// This module only has access to global horizontal radiation, so it always evaluates
// the horizontal-surface case; there is no orientation/azimuth input.
const SOL_AIR_COEFFICIENTS = {
  light: { k: 0.026, correction: -4 },
  dark: { k: 0.052, correction: -4 }
};

export function getSolAirCoefficients(surfaceColor) {
  return SOL_AIR_COEFFICIENTS[surfaceColor] || SOL_AIR_COEFFICIENTS.light;
}

export function computeSolAirTemperature(dryBulbTemperature, globalHorizontalRadiation, surfaceColor) {
  const { k, correction } = getSolAirCoefficients(surfaceColor);
  return dryBulbTemperature + k * (globalHorizontalRadiation || 0) + correction;
}

export function processDailyClimateIndices(epwData, chartRefs) {
  const daysMap = {};
  const cddBase = chartRefs ? chartRefs.baseTempCooling : 24.0;
  const hddBase = chartRefs ? chartRefs.baseTempHeating : 18.0;
  const surfaceColor = chartRefs ? chartRefs.surfaceColor : 'light';

  epwData.data.forEach(h => {
    const key = `${h.year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`;
    if (!daysMap[key]) {
      daysMap[key] = { dateStr: key, month: h.month, day: h.day, hourlyRecords: [], temps: [], rhs: [], rads: [] };
    }
    daysMap[key].hourlyRecords.push(h);
    daysMap[key].temps.push(h.dryBulbTemperature);
    daysMap[key].rhs.push(h.relativeHumidity);
    daysMap[key].rads.push(h.globalHorizontalRadiation);
  });

  const dailyList = Object.values(daysMap).map(d => {
    const maxTemp = d3.max(d.temps), minTemp = d3.min(d.temps);

    const ambientMeanTemp = d3.mean(d.temps);

    let effectiveTemps = d.hourlyRecords.map(h => {
      if (chartRefs && chartRefs.demandCalcMethod === 'sol_air') {
        return computeSolAirTemperature(h.dryBulbTemperature, h.globalHorizontalRadiation, surfaceColor);
      }
      return h.dryBulbTemperature;
    });

    const meanTemp = d3.mean(effectiveTemps);
    const maxRh = d3.max(d.rhs), maxRad = d3.max(d.rads);
    return {
      ...d, maxTemp, minTemp, meanTemp, ambientMeanTemp, maxRh, maxRad,
      cddValue: Math.max(0, meanTemp - cddBase), hddValue: Math.max(0, hddBase - meanTemp), indices: new Set()
    };
  });

  const allDailyMeans = dailyList.map(d => d.ambientMeanTemp).sort(d3.ascending);
  const allDailyMaxRad = dailyList.map(d => d.maxRad).sort(d3.ascending);
  const allDailyMaxRh = dailyList.map(d => d.maxRh).sort(d3.ascending);

  const t95 = d3.quantile(allDailyMeans, 0.95);
  const t05 = d3.quantile(allDailyMeans, 0.05);
  const rad95 = d3.quantile(allDailyMaxRad, 0.95);
  const rh95 = d3.quantile(allDailyMaxRh, 0.95);

  const absMaxTemp = d3.max(dailyList, d => d.maxTemp);
  const absMinTemp = d3.min(dailyList, d => d.minTemp);
  const absMaxRad = d3.max(dailyList, d => d.maxRad);
  const absMaxRh = d3.max(dailyList, d => d.maxRh);
  const absMaxCDD = d3.max(dailyList, d => d.cddValue);
  const absMaxHDD = d3.max(dailyList, d => d.hddValue);

  dailyList.forEach(d => {
    if (d.maxTemp === absMaxTemp) d.indices.add('maxTempAbs');
    if (d.minTemp === absMinTemp) d.indices.add('minTempAbs');
    if (d.maxRad === absMaxRad) d.indices.add('maxRadAbs');
    if (d.maxRh === absMaxRh) d.indices.add('maxRhAbs');
    if (d.cddValue === absMaxCDD && d.cddValue > 0) d.indices.add('peakCDD');
    if (d.hddValue === absMaxHDD && d.hddValue > 0) d.indices.add('peakHDD');
    if (d.ambientMeanTemp >= t95) d.indices.add('extremeHeat');
    if (d.ambientMeanTemp <= t05) d.indices.add('extremeCold');
    if (d.maxRad >= rad95) d.indices.add('extremeRad');
    if (d.maxRh >= rh95) d.indices.add('extremeRh');
    if (d.minTemp < 0) d.indices.add('frostDay');
    if (d.minTemp >= 20) d.indices.add('tropicalNight');
    if (d.maxTemp > 25) d.indices.add('summerDay');
  });

  for (let i = 2; i < dailyList.length; i++) {
    if (dailyList[i].ambientMeanTemp >= t95 && dailyList[i - 1].ambientMeanTemp >= t95 && dailyList[i - 2].ambientMeanTemp >= t95) {
      [0, 1, 2].forEach(k => dailyList[i - k].indices.add('relativeHeatwave'));
    }
    if (dailyList[i].ambientMeanTemp <= t05 && dailyList[i - 1].ambientMeanTemp <= t05 && dailyList[i - 2].ambientMeanTemp <= t05) {
      [0, 1, 2].forEach(k => dailyList[i - k].indices.add('relativeColdwave'));
    }
  }

  return dailyList;
}