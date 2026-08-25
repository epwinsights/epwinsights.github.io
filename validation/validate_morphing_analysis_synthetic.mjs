/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import { computeMorphingAnalysis } from './core/climate-morphing.js';

const TOLERANCE = 1e-9;
const YEAR = 2020;

const BASELINE_MIN_MAX_BY_MONTH = [
  [-5, 5],
  [2, 10],
  [5, 15],
  [10, 20],
  [15, 25],
  [20, 28],
  [22, 35],
  [21, 33],
  [15, 25],
  [8, 18],
  [2, 10],
  [-8, 2]
];

const DELTA_TAS_BY_MONTH = [6.0, 1.2, 1.5, 1.8, 2.0, 2.3, 2.6, 2.4, 2.0, 1.7, 1.3, 9.0];

function buildDailyDataset(minMaxByMonth, shiftByMonth = null) {
  const data = [];
  minMaxByMonth.forEach((minMax, monthIdx) => {
    const shift = shiftByMonth ? shiftByMonth[monthIdx] : 0;
    minMax.forEach((temp, hourIdx) => {
      data.push({
        year: YEAR,
        month: monthIdx + 1,
        day: 1,
        hour: hourIdx + 1,
        dryBulbTemperature: temp + shift,
        relativeHumidity: 50,
        globalHorizontalRadiation: 100
      });
    });
  });
  return { data };
}

function buildMonthlyDeltas(tasByMonth) {
  return {
    tas: { mean: tasByMonth, std: Array(12).fill(0) },
    tasmax: { mean: tasByMonth, std: Array(12).fill(0) },
    tasmin: { mean: tasByMonth, std: Array(12).fill(0) }
  };
}

function approxEqual(actual, expected, tolerance = TOLERANCE) {
  if (expected === null) return actual === null;
  return Math.abs(actual - expected) <= tolerance;
}

const failures = [];

function check(label, actual, expected) {
  const pass = approxEqual(actual, expected);
  if (!pass) failures.push({ label, expected, actual });
  console.log(`  [${pass ? 'OK' : 'FAIL'}] ${label}: expected ${expected}, got ${actual}`);
}

console.log('Test 1: default base temperatures (18C heating / 24C cooling), with benchmark');

const baselineEpwData = buildDailyDataset(BASELINE_MIN_MAX_BY_MONTH);
const morphedEpwData = buildDailyDataset(BASELINE_MIN_MAX_BY_MONTH, DELTA_TAS_BY_MONTH);
const monthlyDeltas = buildMonthlyDeltas(DELTA_TAS_BY_MONTH);

const annualIndexDeltas = {
  fd: { mean: -1.8, std: 0.5 },
  tropical_nights: { mean: 0.2, std: 0.1 },
  cdd: { mean: 8.0, std: 1.0 },
  hdd: { mean: -20.0, std: 2.0 },
  tx35: { mean: 1.0, std: 0.2 },
  txx: { mean: 2.0, std: 0.3 },
  tnn: { mean: 1.5, std: 0.2 }
};

const result1 = computeMorphingAnalysis(
  baselineEpwData,
  morphedEpwData.data,
  monthlyDeltas,
  annualIndexDeltas,
  {}
);

check('warmestMonthIdx', result1.kpi.warmestMonthIdx, 6);
check('annualDeltaT', result1.kpi.annualDeltaT, 33.8 / 12);
check('deltaWarmestMonth', result1.kpi.deltaWarmestMonth, 2.6);

check('frostDaysBaseline', result1.kpi.frostDaysBaseline, 2);
check('frostDaysMorphed', result1.kpi.frostDaysMorphed, 0);
check('frostDaysDelta', result1.kpi.frostDaysDelta, -2);

check('tropicalNightsBaseline', result1.kpi.tropicalNightsBaseline, 3);
check('tropicalNightsMorphed', result1.kpi.tropicalNightsMorphed, 3);
check('tropicalNightsDelta', result1.kpi.tropicalNightsDelta, 0);

check('summerDaysBaseline', result1.kpi.summerDaysBaseline, 3);
check('summerDaysMorphed', result1.kpi.summerDaysMorphed, 5);
check('summerDaysDelta', result1.kpi.summerDaysDelta, 2);

check('annualCDDBaseline', result1.kpi.annualCDDBaseline, 7.5);
check('annualCDDMorphed', result1.kpi.annualCDDMorphed, 14.8);
check('deltaCDD', result1.kpi.deltaCDD, 7.3);

check('annualHDDBaseline', result1.kpi.annualHDDBaseline, 79);
check('annualHDDMorphed', result1.kpi.annualHDDMorphed, 56.5);
check('deltaHDD', result1.kpi.deltaHDD, -22.5);

check('benchmark.frostDays.epwDelta', result1.benchmark.frostDays.epwDelta, -2);
check('benchmark.frostDays.cmip6Delta', result1.benchmark.frostDays.cmip6Delta, -1.8);
check('benchmark.tropicalNights.epwDelta', result1.benchmark.tropicalNights.epwDelta, 0);
check('benchmark.tropicalNights.cmip6Delta', result1.benchmark.tropicalNights.cmip6Delta, 0.2);
check('benchmark.coolingDegreeDays.epwDelta', result1.benchmark.coolingDegreeDays.epwDelta, 7.3);
check('benchmark.coolingDegreeDays.cmip6Delta', result1.benchmark.coolingDegreeDays.cmip6Delta, 8.0);
check('benchmark.heatingDegreeDays.epwDelta', result1.benchmark.heatingDegreeDays.epwDelta, -22.5);
check('benchmark.heatingDegreeDays.cmip6Delta', result1.benchmark.heatingDegreeDays.cmip6Delta, -20.0);
check('benchmark.cmip6Only.tx35', result1.benchmark.cmip6Only.tx35, 1.0);
check('benchmark.cmip6Only.tx40 (missing input)', result1.benchmark.cmip6Only.tx40, null);
check('benchmark.cmip6Only.txx', result1.benchmark.cmip6Only.txx, 2.0);
check('benchmark.cmip6Only.tnn', result1.benchmark.cmip6Only.tnn, 1.5);

console.log('');
console.log('Test 2: custom base temperatures (15C heating / 22C cooling), no annualIndexDeltas');

const result2 = computeMorphingAnalysis(
  baselineEpwData,
  morphedEpwData.data,
  monthlyDeltas,
  null,
  { baseTempHeating: 15, baseTempCooling: 22 }
);

check('annualCDDBaseline (custom)', result2.kpi.annualCDDBaseline, 13.5);
check('annualCDDMorphed (custom)', result2.kpi.annualCDDMorphed, 20.8);
check('deltaCDD (custom)', result2.kpi.deltaCDD, 7.3);

check('annualHDDBaseline (custom)', result2.kpi.annualHDDBaseline, 58);
check('annualHDDMorphed (custom)', result2.kpi.annualHDDMorphed, 37.3);
check('deltaHDD (custom)', result2.kpi.deltaHDD, -20.7);

check('benchmark is null when annualIndexDeltas is not provided', result2.benchmark, null);

console.log('');
console.log('-'.repeat(60));
console.log(`Failures: ${failures.length}`);

if (failures.length > 0) {
  console.log('');
  console.log('Failure details:');
  failures.forEach(f => {
    console.log(`  [${f.label}] expected ${f.expected}, got ${f.actual}`);
  });
  process.exit(1);
} else {
  console.log('All computeMorphingAnalysis synthetic cases match hand-calculated expected values.');
  process.exit(0);
}
