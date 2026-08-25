/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import { findRegion, findNearestRegion } from './point-in-region.js';
import { processDailyClimateIndices } from './peak-conditions.js';
import { findNearestGridCell, loadTileData, decodeCellField } from './climate-tile-loader.js';

export const SSP_SCENARIOS = [
  {
    id: 'ssp126', label: 'SSP1-2.6',
    description: 'Sustainability pathway: strong mitigation and low emissions, limiting warming to roughly 1.5-2°C by 2100.'
  },
  {
    id: 'ssp245', label: 'SSP2-4.5',
    description: 'Middle-of-the-road pathway: emissions near current trends, gradually leveling off after mid-century.'
  },
  {
    id: 'ssp370', label: 'SSP3-7.0',
    description: 'Regional rivalry pathway: high emissions and weak mitigation, driving strong 21st-century warming.'
  },
  {
    id: 'ssp585', label: 'SSP5-8.5',
    description: 'Fossil-fueled development pathway: very high emissions with continued heavy fossil fuel use; the most severe CMIP6 scenario.'
  }
];

export const TARGET_YEARS = [
  { year: 2030, tag: 'Near-term', period: '2021-2040' },
  { year: 2050, tag: 'Mid-term', period: '2041-2060' },
  { year: 2080, tag: 'Long-term', period: '2081-2100' }
];

const ANNUAL_INDEX_VARIABLES = ['cdd', 'hdd', 'fd', 'tx35', 'tx40', 'tropical_nights', 'txx', 'tnn'];
const MIN_HISTORICAL_DTR_C = 0.1;
const STRETCH_FACTOR_MIN = 0.1;
const STRETCH_FACTOR_MAX = 3.0;

let cachedRegionsGeoJSON = null;

export async function loadMorphingDatasets() {
  if (!cachedRegionsGeoJSON) {
    cachedRegionsGeoJSON = await fetch('/data/ar6_regions_land46.geojson').then(r => {
      if (!r.ok) throw new Error('Failed to load AR6 reference regions dataset.');
      return r.json();
    });
  }
  return { regionsGeoJSON: cachedRegionsGeoJSON };
}

export function getTargetYears() {
  return TARGET_YEARS;
}

/**
 * Resolves the nearest 1x1 deg CMIP6 land grid cell to the EPW station's
 * coordinates. This is the basis for all delta lookups.
 * @returns {Promise<{tileId:number, cellIndex:number, lat:number, lon:number, distanceKm:number}|null>}
 *   null only indicates a genuine data problem (no land cell found within
 *   MAX_SEARCH_RADIUS_KM); should not normally happen for a real station.
 */
export async function resolveGridCell(epwData) {
  const { latitude, longitude } = epwData.metadata.location;
  return findNearestGridCell(latitude, longitude);
}

export function resolveRegionLabel(epwData, regionsGeoJSON) {
  const { latitude, longitude } = epwData.metadata.location;
  const acronym = findRegion(latitude, longitude, regionsGeoJSON) ?? findNearestRegion(latitude, longitude, regionsGeoJSON);
  const feature = regionsGeoJSON.features.find(f => f.properties.acronym === acronym);
  return {
    acronym,
    name: feature ? feature.properties.name : (acronym || 'Unknown'),
    isFallback: !findRegion(latitude, longitude, regionsGeoJSON)
  };
}

/**
 * Reads monthly temperature deltas (tas/tasmax/tasmin, mean + std) for a
 * resolved grid cell under a given SSP/target-period, from that cell's tile.
 * All three variables are needed downstream for Shift+Stretch.
 * @param {{tileId:number, cellIndex:number}} gridCell
 * @param {string} ssp
 * @param {number} targetYear
 * @returns {Promise<{tas:{mean:number[],std:number[]}, tasmax:{mean:number[],std:number[]}, tasmin:{mean:number[],std:number[]}}|null>}
 */
export async function getMonthlyDeltas(gridCell, ssp, targetYear) {
  const tileData = await loadTileData(gridCell.tileId);
  const base = `climate-temp-${ssp}-${targetYear}`;

  const tasMean = decodeCellField(tileData, base, 'tas', 'mean', gridCell.cellIndex);
  if (tasMean === null) return null;

  return {
    tas: {
      mean: tasMean,
      std: decodeCellField(tileData, base, 'tas', 'std', gridCell.cellIndex)
    },
    tasmax: {
      mean: decodeCellField(tileData, base, 'tasmax', 'mean', gridCell.cellIndex),
      std: decodeCellField(tileData, base, 'tasmax', 'std', gridCell.cellIndex)
    },
    tasmin: {
      mean: decodeCellField(tileData, base, 'tasmin', 'mean', gridCell.cellIndex),
      std: decodeCellField(tileData, base, 'tasmin', 'std', gridCell.cellIndex)
    }
  };
}

/**
 * Reads annual CMIP6 index deltas (CDD, HDD, FD, TX35, TX40, TropicalNights,
 * TXx, TNn) for a resolved grid cell under a given SSP/target-period. Used
 * for the independent benchmark comparison in computeMorphingAnalysis, not
 * for the morphing math itself.
 * @returns {Promise<Object<string,{mean:number,std:number}>>}  Keyed by
 *   variable id; a variable is omitted if not present/nodata for this cell.
 */
export async function getAnnualIndexDeltas(gridCell, ssp, targetYear) {
  const tileData = await loadTileData(gridCell.tileId);
  const base = `climate-indices-${ssp}-${targetYear}`;

  const result = {};
  ANNUAL_INDEX_VARIABLES.forEach(variable => {
    const mean = decodeCellField(tileData, base, variable, 'mean', gridCell.cellIndex);
    if (mean === null) return;
    result[variable] = {
      mean,
      std: decodeCellField(tileData, base, variable, 'std', gridCell.cellIndex)
    };
  });
  return result;
}

function groupTempsByDay(hourlyData) {
  const days = new Map();
  hourlyData.forEach(h => {
    const key = `${h.month}-${h.day}`;
    if (!days.has(key)) days.set(key, { month: h.month, temps: [] });
    days.get(key).temps.push(h.dryBulbTemperature);
  });
  return days;
}

function computeMonthlyHistoricalDTR(epwData) {
  const days = groupTempsByDay(epwData.data);
  const monthlyRanges = Array.from({ length: 12 }, () => []);
  days.forEach(({ month, temps }) => {
    monthlyRanges[month - 1].push(d3.max(temps) - d3.min(temps));
  });
  return monthlyRanges.map(ranges => (ranges.length ? d3.mean(ranges) : 0));
}

/**
 * @param {object} epwData        Parsed EPW object (epw-parser.js output)
 * @param {object} monthlyDeltas  Output of getMonthlyDeltas()
 * @returns {object[]} New array of hourly records with dryBulbTemperature morphed
 *
 * Scope note: only dryBulbTemperature is morphed here (Shift and Stretch). Every other
 * field on each hourly record, including relativeHumidity, dewPointTemperature, all
 * radiation fields, and windSpeed, is carried over unchanged from the historical
 * baseline via the {...hour} spread below. Every annual indicator this
 * module computes or exports (CDD, HDD, frost days, tropical nights, TX35/TX40) is a
 * function of dry-bulb temperature thresholds alone, so it is unaffected by humidity,
 * radiation, or wind being stale. The exported CSV (exportMorphingDataToCSV) contains
 * only the dry-bulb series for the same reason, and this function's output is not
 * currently consumed by any other module in the platform (psychrometric, outdoor
 * comfort, or otherwise).
 */
/**
 * Computes the per-month stretch factor (raw and clamped to
 * [STRETCH_FACTOR_MIN, STRETCH_FACTOR_MAX]), given the historical monthly
 * diurnal temperature range and the CMIP6 monthly delta. Extracted as its
 * own function so morphHourlyTemperature only computes it once per month
 * instead of once per hour, and so validation/diagnostic scripts can
 * inspect clamping behavior without re-deriving the formula separately.
 * @param {object} epwData        Parsed EPW object
 * @param {object} monthlyDeltas  Output of getMonthlyDeltas()
 * @returns {{month:number, dtrHist:number, deltaDTR:number, rawStretchFactor:number, stretchFactor:number, clamped:'none'|'low'|'high'}[]}
 */

export function computeMonthlyStretchFactors(epwData, monthlyDeltas) {
  const historicalDTR = computeMonthlyHistoricalDTR(epwData);
  return historicalDTR.map((dtrHist, monthIdx) => {
    const deltaDTR = monthlyDeltas.tasmax.mean[monthIdx] - monthlyDeltas.tasmin.mean[monthIdx];
    const rawStretchFactor = dtrHist > MIN_HISTORICAL_DTR_C ? 1 + deltaDTR / dtrHist : 1;
    const stretchFactor = Math.min(STRETCH_FACTOR_MAX, Math.max(STRETCH_FACTOR_MIN, rawStretchFactor));
    let clamped = 'none';
    if (rawStretchFactor > STRETCH_FACTOR_MAX) clamped = 'high';
    else if (rawStretchFactor < STRETCH_FACTOR_MIN) clamped = 'low';
    return { month: monthIdx + 1, dtrHist, deltaDTR, rawStretchFactor, stretchFactor, clamped };
  });
}

export function morphHourlyTemperature(epwData, monthlyDeltas) {
  const monthlyStretch = computeMonthlyStretchFactors(epwData, monthlyDeltas);

  const dailyMeanByKey = new Map();
  groupTempsByDay(epwData.data).forEach((day, key) => {
    dailyMeanByKey.set(key, d3.mean(day.temps));
  });

  return epwData.data.map(hour => {
    const monthIdx = hour.month - 1;
    const key = `${hour.month}-${hour.day}`;
    const dayMean = dailyMeanByKey.get(key);
    const diurnalAnomaly = hour.dryBulbTemperature - dayMean;

    const deltaTas = monthlyDeltas.tas.mean[monthIdx];
    const stretchFactor = monthlyStretch[monthIdx].stretchFactor;

    const morphedDayMean = dayMean + deltaTas;
    const morphedTemp = morphedDayMean + diurnalAnomaly * stretchFactor;

    return {
      ...hour,
      dryBulbTemperature: morphedTemp
    };
  });
}

export function computeMonthlyMeans(hourlyData) {
  const sums = Array(12).fill(0);
  const counts = Array(12).fill(0);
  hourlyData.forEach(h => {
    sums[h.month - 1] += h.dryBulbTemperature;
    counts[h.month - 1]++;
  });
  return sums.map((s, i) => (counts[i] ? s / counts[i] : null));
}

function argmax(arr) {
  let idx = 0;
  arr.forEach((v, i) => { if (v > arr[idx]) idx = i; });
  return idx;
}

function sumByMonth(dailyData, key) {
  const totals = Array(12).fill(0);
  dailyData.forEach(d => { totals[d.month - 1] += d[key]; });
  return totals;
}

/**
 * Computes baseline vs. morphed KPIs/degree-days, plus an optional independent
 * benchmark comparison against the official CMIP6 index deltas.
 * @param {object} epwData              Parsed EPW object
 * @param {object[]} morphedHourlyData   Output of morphHourlyTemperature()
 * @param {object} monthlyDeltas         Output of getMonthlyDeltas()
 * @param {Object<string,{mean:number,std:number}>|null} [annualIndexDeltas]
 * @param {{baseTempHeating?:number, baseTempCooling?:number}} [thermalSettings]
 */
export function computeMorphingAnalysis(epwData, morphedHourlyData, monthlyDeltas, annualIndexDeltas = null, thermalSettings = {}) {
  const baseTempHeating = thermalSettings.baseTempHeating ?? 18.0;
  const baseTempCooling = thermalSettings.baseTempCooling ?? 24.0;
  const degreeDaySettings = { baseTempHeating, baseTempCooling };

  const baselineDaily = processDailyClimateIndices(epwData, degreeDaySettings);
  const morphedDaily = processDailyClimateIndices({ data: morphedHourlyData }, degreeDaySettings);

  const baselineMonthlyMeans = computeMonthlyMeans(epwData.data);
  const morphedMonthlyMeans = computeMonthlyMeans(morphedHourlyData);

  const warmestMonthIdx = argmax(baselineMonthlyMeans);
  const annualDeltaT = d3.mean(monthlyDeltas.tas.mean);
  const deltaWarmestMonth = monthlyDeltas.tas.mean[warmestMonthIdx];

  const summerDaysBaseline = baselineDaily.filter(d => d.indices.has('summerDay')).length;
  const summerDaysMorphed = morphedDaily.filter(d => d.indices.has('summerDay')).length;

  const frostDaysBaseline = baselineDaily.filter(d => d.indices.has('frostDay')).length;
  const frostDaysMorphed = morphedDaily.filter(d => d.indices.has('frostDay')).length;

  const tropicalNightsBaseline = baselineDaily.filter(d => d.indices.has('tropicalNight')).length;
  const tropicalNightsMorphed = morphedDaily.filter(d => d.indices.has('tropicalNight')).length;

  const annualCDDBaseline = d3.sum(baselineDaily, d => d.cddValue);
  const annualCDDMorphed = d3.sum(morphedDaily, d => d.cddValue);
  const annualHDDBaseline = d3.sum(baselineDaily, d => d.hddValue);
  const annualHDDMorphed = d3.sum(morphedDaily, d => d.hddValue);

  let benchmark = null;
  if (annualIndexDeltas) {
    benchmark = {
      frostDays: {
        epwDelta: frostDaysMorphed - frostDaysBaseline,
        cmip6Delta: annualIndexDeltas.fd ? annualIndexDeltas.fd.mean : null
      },
      tropicalNights: {
        epwDelta: tropicalNightsMorphed - tropicalNightsBaseline,
        cmip6Delta: annualIndexDeltas.tropical_nights ? annualIndexDeltas.tropical_nights.mean : null
      },
      coolingDegreeDays: {
        epwDelta: annualCDDMorphed - annualCDDBaseline,
        cmip6Delta: annualIndexDeltas.cdd ? annualIndexDeltas.cdd.mean : null
      },
      heatingDegreeDays: {
        epwDelta: annualHDDMorphed - annualHDDBaseline,
        cmip6Delta: annualIndexDeltas.hdd ? annualIndexDeltas.hdd.mean : null
      },
      cmip6Only: {
        tx35: annualIndexDeltas.tx35 ? annualIndexDeltas.tx35.mean : null,
        tx40: annualIndexDeltas.tx40 ? annualIndexDeltas.tx40.mean : null,
        txx: annualIndexDeltas.txx ? annualIndexDeltas.txx.mean : null,
        tnn: annualIndexDeltas.tnn ? annualIndexDeltas.tnn.mean : null
      }
    };
  }

  return {
    baselineDaily,
    morphedDaily,
    baselineMonthlyMeans,
    morphedMonthlyMeans,
    monthlyCddBaseline: sumByMonth(baselineDaily, 'cddValue'),
    monthlyCddMorphed: sumByMonth(morphedDaily, 'cddValue'),
    monthlyHddBaseline: sumByMonth(baselineDaily, 'hddValue'),
    monthlyHddMorphed: sumByMonth(morphedDaily, 'hddValue'),
    kpi: {
      annualDeltaT,
      warmestMonthIdx,
      deltaWarmestMonth,
      summerDaysBaseline,
      summerDaysMorphed,
      summerDaysDelta: summerDaysMorphed - summerDaysBaseline,
      frostDaysBaseline,
      frostDaysMorphed,
      frostDaysDelta: frostDaysMorphed - frostDaysBaseline,
      tropicalNightsBaseline,
      tropicalNightsMorphed,
      tropicalNightsDelta: tropicalNightsMorphed - tropicalNightsBaseline,
      annualCDDBaseline,
      annualCDDMorphed,
      deltaCDD: annualCDDMorphed - annualCDDBaseline,
      annualHDDBaseline,
      annualHDDMorphed,
      deltaHDD: annualHDDMorphed - annualHDDBaseline
    },
    benchmark
  };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatProjectedDateTime(hour, targetYear) {
  const minute = hour.minute === 60 ? 0 : hour.minute;
  return `${targetYear}-${pad2(hour.month)}-${pad2(hour.day)}T${pad2(hour.hour)}:${pad2(minute)}`;
}

export function exportMorphingDataToCSV(epwData, morphedHourlyData, regionInfo, ssp, targetYear) {
  const sspLabel = (SSP_SCENARIOS.find(s => s.id === ssp) || {}).label || ssp;
  const csvRows = [];
  csvRows.push(["DateTime", "Month", "Day", "Hour", "DryBulb_Baseline(C)", "DryBulb_Morphed(C)", "Delta(C)"].join(","));

  epwData.data.forEach((h, i) => {
    const morphed = morphedHourlyData[i];
    const row = [
      formatProjectedDateTime(h, targetYear),
      h.month,
      h.day,
      h.hour,
      h.dryBulbTemperature.toFixed(2),
      morphed.dryBulbTemperature.toFixed(2),
      (morphed.dryBulbTemperature - h.dryBulbTemperature).toFixed(2)
    ];
    csvRows.push(row.join(","));
  });

  const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);

  const locationName = (epwData.metadata && epwData.metadata.location && epwData.metadata.location.city)
    ? epwData.metadata.location.city
    : 'Location';

  link.setAttribute("download", `Climate_Morphing_${locationName}_${regionInfo.acronym}_${sspLabel.replace(/[^a-zA-Z0-9]/g, '')}_${targetYear}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}