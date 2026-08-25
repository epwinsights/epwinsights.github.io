/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

// exportMorphingDataToCSV touches document.createElement/appendChild/removeChild.
/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./peak-conditions.js', () => ({
  processDailyClimateIndices: vi.fn()
}));

vi.mock('./climate-tile-loader.js', () => ({
  findNearestGridCell: vi.fn(),
  loadTileData: vi.fn(),
  decodeCellField: vi.fn()
}));

import { processDailyClimateIndices } from './peak-conditions.js';
import { findNearestGridCell, loadTileData, decodeCellField } from './climate-tile-loader.js';
import {
  SSP_SCENARIOS,
  TARGET_YEARS,
  getTargetYears,
  resolveGridCell,
  resolveRegionLabel,
  getMonthlyDeltas,
  getAnnualIndexDeltas,
  morphHourlyTemperature,
  computeMonthlyMeans,
  computeMorphingAnalysis,
  exportMorphingDataToCSV,
  loadMorphingDatasets
} from './climate-morphing.js';

// Fixtures
function buildRegionsGeoJSON() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { acronym: 'TST', name: 'Test Region' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]
        }
      },
      {
        type: 'Feature',
        properties: { acronym: 'OTH', name: 'Other Region' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[50, 50], [60, 50], [60, 60], [50, 60], [50, 50]]]
        }
      }
    ]
  };
}

function buildEpwData({ latitude = 5, longitude = 5, hours = null } = {}) {
  const data = hours || Array.from({ length: 24 }, (_, i) => ({
    month: (i % 12) + 1,
    day: 1,
    hour: (i % 24) + 1,
    minute: 0,
    dryBulbTemperature: 10 + i
  }));
  return {
    metadata: { location: { latitude, longitude, city: 'Testville', country: 'Testland' } },
    data
  };
}

// Builds a flat monthlyDeltas object in the shape getMonthlyDeltas() now returns:
// { tas: {mean,std}, tasmax: {mean,std}, tasmin: {mean,std} }
function buildMonthlyDeltas({ tasMean, tasmaxMean, tasminMean } = {}) {
  return {
    tas: { mean: tasMean ?? Array(12).fill(2), std: Array(12).fill(0.5) },
    tasmax: { mean: tasmaxMean ?? Array(12).fill(2), std: Array(12).fill(0.5) },
    tasmin: { mean: tasminMean ?? Array(12).fill(2), std: Array(12).fill(0.5) }
  };
}

// Mock for processDailyClimateIndices: groups the (possibly morphed) hourly
// series by month only (not by real calendar day - irrelevant for what these
// tests check) and derives the subset of indices computeMorphingAnalysis
// actually reads: summerDay, frostDay, tropicalNight, cddValue, hddValue.
function fakeDailyIndices(hourlyData, { baseTempHeating = 18.0, baseTempCooling = 24.0 } = {}) {
  const byMonth = {};
  hourlyData.forEach(h => {
    byMonth[h.month] = byMonth[h.month] || [];
    byMonth[h.month].push(h.dryBulbTemperature);
  });
  return Object.entries(byMonth).map(([month, temps]) => {
    const maxTemp = Math.max(...temps);
    const minTemp = Math.min(...temps);
    const meanTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
    const indices = new Set();
    if (maxTemp > 25) indices.add('summerDay');
    if (minTemp < 0) indices.add('frostDay');
    if (minTemp >= 20) indices.add('tropicalNight');
    return {
      month: Number(month),
      indices,
      cddValue: Math.max(0, meanTemp - baseTempCooling),
      hddValue: Math.max(0, baseTempHeating - meanTemp)
    };
  });
}

// SSP_SCENARIOS / TARGET_YEARS
describe('SSP_SCENARIOS', () => {
  it('exposes exactly the four CMIP6 SSP scenarios with unique ids', () => {
    expect(SSP_SCENARIOS).toHaveLength(4);
    const ids = SSP_SCENARIOS.map(s => s.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids).toEqual(['ssp126', 'ssp245', 'ssp370', 'ssp585']);
  });

  it('provides a non-empty label and tooltip description for every scenario', () => {
    SSP_SCENARIOS.forEach(s => {
      expect(typeof s.label).toBe('string');
      expect(s.label.length).toBeGreaterThan(0);
      expect(typeof s.description).toBe('string');
      expect(s.description.length).toBeGreaterThan(10);
    });
  });
});

describe('TARGET_YEARS / getTargetYears', () => {
  it('exposes exactly the three discrete AR6 reference periods (no continuous range)', () => {
    expect(TARGET_YEARS).toHaveLength(3);
    expect(TARGET_YEARS.map(t => t.year)).toEqual([2030, 2050, 2080]);
  });

  it('pairs each year with its correct tag and AR6 period string', () => {
    expect(TARGET_YEARS).toEqual([
      { year: 2030, tag: 'Near-term', period: '2021-2040' },
      { year: 2050, tag: 'Mid-term', period: '2041-2060' },
      { year: 2080, tag: 'Long-term', period: '2081-2100' }
    ]);
  });

  it('getTargetYears() returns the same TARGET_YEARS data', () => {
    expect(getTargetYears()).toEqual(TARGET_YEARS);
  });
});

// resolveGridCell
describe('resolveGridCell', () => {
  afterEach(() => vi.clearAllMocks());

  it('delegates to findNearestGridCell with the EPW station\'s lat/lon', async () => {
    const epwData = buildEpwData({ latitude: 12.3, longitude: 45.6 });
    const fakeCell = { tileId: 3, cellIndex: 7, lat: 12.5, lon: 45.5, distanceKm: 25 };
    findNearestGridCell.mockResolvedValue(fakeCell);

    const result = await resolveGridCell(epwData);

    expect(findNearestGridCell).toHaveBeenCalledWith(12.3, 45.6);
    expect(result).toEqual(fakeCell);
  });

  it('propagates a null result (data problem: no land cell within max search radius)', async () => {
    findNearestGridCell.mockResolvedValue(null);
    const result = await resolveGridCell(buildEpwData());
    expect(result).toBeNull();
  });
});

// resolveRegionLabel (label-only, still backed by real point-in-region.js)
describe('resolveRegionLabel', () => {
  it('resolves a point that falls inside a region polygon (no fallback)', () => {
    const geojson = buildRegionsGeoJSON();
    const epwData = buildEpwData({ latitude: 5, longitude: 5 });
    const result = resolveRegionLabel(epwData, geojson);
    expect(result.acronym).toBe('TST');
    expect(result.name).toBe('Test Region');
    expect(result.isFallback).toBe(false);
  });

  it('falls back to the nearest region when the point misses every polygon', () => {
    const geojson = buildRegionsGeoJSON();
    const epwData = buildEpwData({ latitude: -10, longitude: -10 });
    const result = resolveRegionLabel(epwData, geojson);
    expect(result.acronym).toBe('TST');
    expect(result.isFallback).toBe(true);
  });

  it('falls back to "Unknown" name if the resolved acronym has no matching feature', () => {
    const geojson = { type: 'FeatureCollection', features: [] };
    const epwData = buildEpwData({ latitude: 5, longitude: 5 });
    const result = resolveRegionLabel(epwData, geojson);
    expect(result.acronym).toBeNull();
    expect(result.name).toBe('Unknown');
  });
});

// getMonthlyDeltas (now async, tile-backed)
describe('getMonthlyDeltas', () => {
  const gridCell = { tileId: 4, cellIndex: 10 };
  const fakeTileData = { manifest: {}, buffers: {} };

  beforeEach(() => {
    loadTileData.mockResolvedValue(fakeTileData);
  });

  afterEach(() => vi.clearAllMocks());

  it('loads the cell\'s tile and reads tas/tasmax/tasmin mean+std from the correct base', async () => {
    decodeCellField.mockImplementation((tileData, base, variable, stat) => {
      const values = { tas: { mean: 2, std: 0.4 }, tasmax: { mean: 3, std: 0.6 }, tasmin: { mean: 1, std: 0.3 } };
      return values[variable][stat];
    });

    const result = await getMonthlyDeltas(gridCell, 'ssp245', 2050);

    expect(loadTileData).toHaveBeenCalledWith(4);
    expect(decodeCellField).toHaveBeenCalledWith(fakeTileData, 'climate-temp-ssp245-2050', 'tas', 'mean', 10);
    expect(result).toEqual({
      tas: { mean: 2, std: 0.4 },
      tasmax: { mean: 3, std: 0.6 },
      tasmin: { mean: 1, std: 0.3 }
    });
  });

  it('returns null when the tas/mean field is unavailable for this cell (e.g. nodata)', async () => {
    decodeCellField.mockReturnValue(null);
    const result = await getMonthlyDeltas(gridCell, 'ssp585', 2080);
    expect(result).toBeNull();
  });

  it('builds the base key from ssp and targetYear', async () => {
    decodeCellField.mockReturnValue(1);
    await getMonthlyDeltas(gridCell, 'ssp126', 2030);
    expect(decodeCellField).toHaveBeenCalledWith(expect.anything(), 'climate-temp-ssp126-2030', expect.any(String), expect.any(String), 10);
  });
});

// getAnnualIndexDeltas
describe('getAnnualIndexDeltas', () => {
  const gridCell = { tileId: 2, cellIndex: 6 };
  const fakeTileData = { manifest: {}, buffers: {} };

  beforeEach(() => {
    loadTileData.mockResolvedValue(fakeTileData);
  });

  afterEach(() => vi.clearAllMocks());

  it('reads only the variables available (non-null) for this cell, from the indices base', async () => {
    decodeCellField.mockImplementation((tileData, base, variable, stat) => {
      const available = { cdd: 120, hdd: -40, fd: -3 };
      if (!(variable in available)) return null;
      return stat === 'mean' ? available[variable] : 5;
    });

    const result = await getAnnualIndexDeltas(gridCell, 'ssp370', 2050);

    expect(loadTileData).toHaveBeenCalledWith(2);
    expect(decodeCellField).toHaveBeenCalledWith(fakeTileData, 'climate-indices-ssp370-2050', 'cdd', 'mean', 6);
    expect(result).toEqual({
      cdd: { mean: 120, std: 5 },
      hdd: { mean: -40, std: 5 },
      fd: { mean: -3, std: 5 }
    });
    expect(result.tx35).toBeUndefined();
    expect(result.txx).toBeUndefined();
  });

  it('returns an empty object when no index variables are available for this cell', async () => {
    decodeCellField.mockReturnValue(null);
    const result = await getAnnualIndexDeltas(gridCell, 'ssp245', 2050);
    expect(result).toEqual({});
  });
});

// morphHourlyTemperature (Shift+Stretch)
describe('morphHourlyTemperature', () => {
  it('shifts the daily mean by that month\'s Δtas and scales the diurnal anomaly by the DTR-derived stretch factor', () => {
    // Month 1, single day, two hours: dayMean=15, historicalDTR=10.
    const epwData = buildEpwData({
      hours: [
        { month: 1, day: 1, hour: 1, minute: 0, dryBulbTemperature: 10 },
        { month: 1, day: 1, hour: 13, minute: 0, dryBulbTemperature: 20 }
      ]
    });
    // deltaTas=2, deltaDTR = tasmax(3) - tasmin(1) = 2 -> rawStretchFactor = 1 + 2/10 = 1.2 (no clamp)
    const monthlyDeltas = buildMonthlyDeltas({
      tasMean: Array(12).fill(2),
      tasmaxMean: Array(12).fill(3),
      tasminMean: Array(12).fill(1)
    });

    const morphed = morphHourlyTemperature(epwData, monthlyDeltas);

    // morphedDayMean = 15 + 2 = 17; anomalies were -5/+5 -> scaled by 1.2 -> -6/+6
    expect(morphed[0].dryBulbTemperature).toBeCloseTo(11, 5);
    expect(morphed[1].dryBulbTemperature).toBeCloseTo(23, 5);
  });

  it('falls back to shift-only (stretchFactor=1) when historical DTR is below the minimum guard, regardless of Δtasmax/Δtasmin', () => {
    // dayMean=20.025, historicalDTR=0.05 (< MIN_HISTORICAL_DTR_C = 0.1)
    const epwData = buildEpwData({
      hours: [
        { month: 3, day: 1, hour: 1, minute: 0, dryBulbTemperature: 20.0 },
        { month: 3, day: 1, hour: 13, minute: 0, dryBulbTemperature: 20.05 }
      ]
    });
    // deltaTas=0, huge deltaDTR that WOULD blow up the stretch factor if the guard didn't apply
    const monthlyDeltas = buildMonthlyDeltas({
      tasMean: Array(12).fill(0),
      tasmaxMean: Array(12).fill(50),
      tasminMean: Array(12).fill(0)
    });

    const morphed = morphHourlyTemperature(epwData, monthlyDeltas);

    // If the guard did NOT apply, rawStretchFactor would be 1 + 50/0.05 = 1001, clamped to 3.0,
    // giving very different values from the originals. With the guard, stretchFactor=1 and
    // deltaTas=0, so morphed temperatures equal the originals.
    expect(morphed[0].dryBulbTemperature).toBeCloseTo(20.0, 5);
    expect(morphed[1].dryBulbTemperature).toBeCloseTo(20.05, 5);
  });

  it('clamps an extreme positive stretch factor to STRETCH_FACTOR_MAX (3.0)', () => {
    // dayMean=15, historicalDTR=1
    const epwData = buildEpwData({
      hours: [
        { month: 6, day: 1, hour: 1, minute: 0, dryBulbTemperature: 14.5 },
        { month: 6, day: 1, hour: 13, minute: 0, dryBulbTemperature: 15.5 }
      ]
    });
    // deltaDTR=50 -> raw = 1 + 50/1 = 51 -> clamps to 3.0
    const monthlyDeltas = buildMonthlyDeltas({
      tasMean: Array(12).fill(0),
      tasmaxMean: Array(12).fill(50),
      tasminMean: Array(12).fill(0)
    });

    const morphed = morphHourlyTemperature(epwData, monthlyDeltas);

    // morphedDayMean = 15; anomalies -0.5/+0.5 scaled by clamp 3.0 -> -1.5/+1.5
    expect(morphed[0].dryBulbTemperature).toBeCloseTo(13.5, 5);
    expect(morphed[1].dryBulbTemperature).toBeCloseTo(16.5, 5);
  });

  it('clamps an extreme negative stretch factor to STRETCH_FACTOR_MIN (0.1)', () => {
    const epwData = buildEpwData({
      hours: [
        { month: 6, day: 1, hour: 1, minute: 0, dryBulbTemperature: 14.5 },
        { month: 6, day: 1, hour: 13, minute: 0, dryBulbTemperature: 15.5 }
      ]
    });
    // deltaDTR=-5 (historicalDTR=1) -> raw = 1 - 5 = -4 -> clamps to 0.1
    const monthlyDeltas = buildMonthlyDeltas({
      tasMean: Array(12).fill(0),
      tasmaxMean: Array(12).fill(-5),
      tasminMean: Array(12).fill(0)
    });

    const morphed = morphHourlyTemperature(epwData, monthlyDeltas);

    // morphedDayMean = 15; anomalies -0.5/+0.5 scaled by clamp 0.1 -> -0.05/+0.05
    expect(morphed[0].dryBulbTemperature).toBeCloseTo(14.95, 5);
    expect(morphed[1].dryBulbTemperature).toBeCloseTo(15.05, 5);
  });

  it('preserves all other hourly fields unchanged', () => {
    const epwData = buildEpwData({
      hours: [{ month: 3, day: 15, hour: 12, minute: 0, dryBulbTemperature: 15, relativeHumidity: 40 }]
    });
    const monthlyDeltas = buildMonthlyDeltas();
    const morphed = morphHourlyTemperature(epwData, monthlyDeltas);
    expect(morphed[0].relativeHumidity).toBe(40);
    expect(morphed[0].day).toBe(15);
    expect(morphed[0].hour).toBe(12);
  });

  it('does not mutate the original epwData', () => {
    const epwData = buildEpwData({
      hours: [{ month: 1, day: 1, hour: 1, minute: 0, dryBulbTemperature: 10 }]
    });
    const original = epwData.data[0].dryBulbTemperature;
    morphHourlyTemperature(epwData, buildMonthlyDeltas());
    expect(epwData.data[0].dryBulbTemperature).toBe(original);
  });
});

// computeMonthlyMeans
describe('computeMonthlyMeans', () => {
  it('averages dry-bulb temperature per month', () => {
    const hourlyData = [
      { month: 1, dryBulbTemperature: 10 },
      { month: 1, dryBulbTemperature: 20 },
      { month: 2, dryBulbTemperature: 30 }
    ];
    const means = computeMonthlyMeans(hourlyData);
    expect(means[0]).toBe(15); // January
    expect(means[1]).toBe(30); // February
  });

  it('returns null for months with no data', () => {
    const means = computeMonthlyMeans([{ month: 1, dryBulbTemperature: 10 }]);
    expect(means[0]).toBe(10);
    expect(means[1]).toBeNull();
    expect(means).toHaveLength(12);
  });
});

// computeMorphingAnalysis
describe('computeMorphingAnalysis', () => {
  beforeEach(() => {
    processDailyClimateIndices.mockImplementation((epwLike, thermalSettings) => fakeDailyIndices(epwLike.data, thermalSettings));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('computes annual mean delta as the average of monthlyDeltas.tas.mean', () => {
    const epwData = buildEpwData();
    const monthlyDeltas = buildMonthlyDeltas({ tasMean: Array(12).fill(2) });
    const morphed = morphHourlyTemperature(epwData, monthlyDeltas);
    const analysis = computeMorphingAnalysis(epwData, morphed, monthlyDeltas);
    expect(analysis.kpi.annualDeltaT).toBeCloseTo(2, 5);
  });

  it('uses default base temperatures of 18/24°C when no thermalSettings are supplied', () => {
    const epwData = buildEpwData();
    const monthlyDeltas = buildMonthlyDeltas({ tasMean: Array(12).fill(1) });
    const morphed = morphHourlyTemperature(epwData, monthlyDeltas);
    computeMorphingAnalysis(epwData, morphed, monthlyDeltas);
    expect(processDailyClimateIndices).toHaveBeenCalledWith(
      expect.anything(),
      { baseTempHeating: 18.0, baseTempCooling: 24.0 }
    );
  });

  it('passes through custom base temperatures via the thermalSettings param', () => {
    const epwData = buildEpwData();
    const monthlyDeltas = buildMonthlyDeltas({ tasMean: Array(12).fill(1) });
    const morphed = morphHourlyTemperature(epwData, monthlyDeltas);
    computeMorphingAnalysis(epwData, morphed, monthlyDeltas, null, { baseTempHeating: 16, baseTempCooling: 22 });
    expect(processDailyClimateIndices).toHaveBeenCalledWith(
      expect.anything(),
      { baseTempHeating: 16, baseTempCooling: 22 }
    );
  });

  it('reports increased summer days (Tmax>25°C) and cooling demand when warming is applied', () => {
    const hours = Array.from({ length: 12 }, (_, m) => ({
      month: m + 1, day: 1, hour: 12, minute: 0, dryBulbTemperature: 24
    }));
    const epwData = buildEpwData({ hours });
    const monthlyDeltas = buildMonthlyDeltas({ tasMean: Array(12).fill(5) });
    const morphed = morphHourlyTemperature(epwData, monthlyDeltas);
    const analysis = computeMorphingAnalysis(epwData, morphed, monthlyDeltas);

    expect(analysis.kpi.summerDaysBaseline).toBe(0);
    expect(analysis.kpi.summerDaysMorphed).toBe(12);
    expect(analysis.kpi.summerDaysDelta).toBe(12);
    expect(analysis.kpi.deltaCDD).toBeGreaterThan(0);
    expect(analysis.kpi.deltaHDD).toBeLessThanOrEqual(0);
  });

  it('produces monthly CDD/HDD series of length 12', () => {
    const epwData = buildEpwData();
    const monthlyDeltas = buildMonthlyDeltas({ tasMean: Array(12).fill(1) });
    const morphed = morphHourlyTemperature(epwData, monthlyDeltas);
    const analysis = computeMorphingAnalysis(epwData, morphed, monthlyDeltas);
    expect(analysis.monthlyCddBaseline).toHaveLength(12);
    expect(analysis.monthlyHddMorphed).toHaveLength(12);
  });

  it('omits the benchmark section entirely when annualIndexDeltas is null', () => {
    const epwData = buildEpwData();
    const monthlyDeltas = buildMonthlyDeltas({ tasMean: Array(12).fill(1) });
    const morphed = morphHourlyTemperature(epwData, monthlyDeltas);
    const analysis = computeMorphingAnalysis(epwData, morphed, monthlyDeltas, null);
    expect(analysis.benchmark).toBeNull();
  });

  it('builds frostDays/tropicalNights/CDD/HDD deltas and cmip6Only fields when annualIndexDeltas is provided', () => {
    const hours = Array.from({ length: 12 }, (_, m) => ({
      month: m + 1, day: 1, hour: 12, minute: 0, dryBulbTemperature: 24
    }));
    const epwData = buildEpwData({ hours });
    const monthlyDeltas = buildMonthlyDeltas({ tasMean: Array(12).fill(5) });
    const morphed = morphHourlyTemperature(epwData, monthlyDeltas);

    const annualIndexDeltas = {
      fd: { mean: -3, std: 1 },
      tropical_nights: { mean: 10, std: 2 },
      cdd: { mean: 80, std: 5 },
      hdd: { mean: -40, std: 5 },
      tx35: { mean: 6, std: 1 },
      txx: { mean: 1.2, std: 0.3 }
      // tx40 and tnn intentionally absent -> should surface as null, not throw
    };

    const analysis = computeMorphingAnalysis(epwData, morphed, monthlyDeltas, annualIndexDeltas);

    expect(analysis.benchmark.frostDays.cmip6Delta).toBe(-3);
    expect(analysis.benchmark.tropicalNights.cmip6Delta).toBe(10);
    expect(analysis.benchmark.coolingDegreeDays.cmip6Delta).toBe(80);
    expect(analysis.benchmark.heatingDegreeDays.cmip6Delta).toBe(-40);
    expect(analysis.benchmark.frostDays.epwDelta).toBe(analysis.kpi.frostDaysDelta);
    expect(analysis.benchmark.tropicalNights.epwDelta).toBe(analysis.kpi.tropicalNightsDelta);
    expect(analysis.benchmark.cmip6Only).toEqual({ tx35: 6, tx40: null, txx: 1.2, tnn: null });
  });
});

// exportMorphingDataToCSV
describe('exportMorphingDataToCSV', () => {
  let createElementSpy;
  let appendChildSpy;
  let removeChildSpy;
  let fakeAnchor;

  beforeEach(() => {
    fakeAnchor = { setAttribute: vi.fn(), click: vi.fn() };
    createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor);
    appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
  });

  afterEach(() => {
    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it('writes the DateTime column using the projected target year, not the source EPW year', () => {
    const epwData = buildEpwData({
      hours: [{ year: 1990, month: 7, day: 15, hour: 13, minute: 0, dryBulbTemperature: 25 }]
    });
    const morphed = [{ dryBulbTemperature: 28 }];

    exportMorphingDataToCSV(epwData, morphed, { acronym: 'TST' }, 'ssp245', 2050);

    const hrefArg = fakeAnchor.setAttribute.mock.calls.find(c => c[0] === 'href')[1];
    const csvContent = decodeURIComponent(hrefArg);
    expect(csvContent).toContain('2050-07-15T13:00');
    expect(csvContent).not.toContain('1990');
  });

  it('builds a descriptive filename including region, scenario, and target year', () => {
    const epwData = buildEpwData({
      hours: [{ year: 1990, month: 1, day: 1, hour: 1, minute: 0, dryBulbTemperature: 10 }]
    });
    const morphed = [{ dryBulbTemperature: 12 }];

    exportMorphingDataToCSV(epwData, morphed, { acronym: 'TST' }, 'ssp245', 2050);

    const downloadArg = fakeAnchor.setAttribute.mock.calls.find(c => c[0] === 'download')[1];
    expect(downloadArg).toContain('TST');
    expect(downloadArg).toContain('2050');
    expect(downloadArg).toContain('SSP245');
  });

  it('triggers the download via click and cleans up the temporary anchor', () => {
    const epwData = buildEpwData({
      hours: [{ year: 1990, month: 1, day: 1, hour: 1, minute: 0, dryBulbTemperature: 10 }]
    });
    exportMorphingDataToCSV(epwData, [{ dryBulbTemperature: 11 }], { acronym: 'TST' }, 'ssp245', 2050);

    expect(fakeAnchor.click).toHaveBeenCalledTimes(1);
    expect(appendChildSpy).toHaveBeenCalledWith(fakeAnchor);
    expect(removeChildSpy).toHaveBeenCalledWith(fakeAnchor);
  });
});

// loadMorphingDatasets
describe('loadMorphingDatasets', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // Order matters here: loadMorphingDatasets() caches its result in a
  // module-level variable that this file's single climate-morphing.js
  // instance keeps for its whole lifetime. A rejected fetch does NOT
  // populate that cache (the `await fetch(...).then(...)` throws before the
  // assignment completes), but a successful one does and there's no reset
  // hook exported. So the failure case must run first - otherwise a later
  // "does it actually call fetch" assertion would silently pass against a
  // stale cached value instead of exercising the real fetch call.
  it('throws a descriptive error when the fetch response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    await expect(loadMorphingDatasets()).rejects.toThrow('Failed to load AR6 reference regions dataset.');
  });

  it('fetches the AR6 label geojson (not the old ar6_morphing_deltas.json) and returns it as regionsGeoJSON', async () => {
    const fakeGeoJSON = { type: 'FeatureCollection', features: [] };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(fakeGeoJSON) });

    const result = await loadMorphingDatasets();

    expect(global.fetch).toHaveBeenCalledWith('/data/ar6_regions_land46.geojson');
    expect(result.regionsGeoJSON).toEqual(fakeGeoJSON);
  });
});