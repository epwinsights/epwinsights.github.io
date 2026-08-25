/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import { morphHourlyTemperature } from './core/climate-morphing.js';

const TOLERANCE = 1e-9;

function buildEpwData(month, dayTemps) {
  const data = [];
  dayTemps.forEach((temps, dayIdx) => {
    temps.forEach((temp, hourIdx) => {
      data.push({
        month,
        day: dayIdx + 1,
        hour: hourIdx + 1,
        dryBulbTemperature: temp
      });
    });
  });
  return { data };
}

function buildMonthlyDeltas(month, { tas, tasmax, tasmin }) {
  const zeros = () => Array(12).fill(0);
  const tasArr = zeros();
  const tasmaxArr = zeros();
  const tasminArr = zeros();
  tasArr[month - 1] = tas;
  tasmaxArr[month - 1] = tasmax;
  tasminArr[month - 1] = tasmin;
  return {
    tas: { mean: tasArr, std: zeros() },
    tasmax: { mean: tasmaxArr, std: zeros() },
    tasmin: { mean: tasminArr, std: zeros() }
  };
}

const testCases = [
  {
    name: 'single day, mid-range stretch factor',
    month: 1,
    dayTemps: [[10, 20]],
    deltas: { tas: 2, tasmax: 3, tasmin: 1 },
    expected: [11, 23]
  },
  {
    name: 'stretch factor clamped at upper bound (3.0)',
    month: 2,
    dayTemps: [[14, 15]],
    deltas: { tas: 0, tasmax: 10, tasmin: 0 },
    expected: [13, 16]
  },
  {
    name: 'stretch factor clamped at lower bound (0.1)',
    month: 3,
    dayTemps: [[10, 15]],
    deltas: { tas: 1, tasmax: -5, tasmin: 5 },
    expected: [13.25, 13.75]
  },
  {
    name: 'zero historical DTR forces stretch factor to 1',
    month: 4,
    dayTemps: [[20]],
    deltas: { tas: 3, tasmax: 100, tasmin: 0 },
    expected: [23]
  },
  {
    name: 'month-level DTR averaged across days, day-level anomaly preserved',
    month: 5,
    dayTemps: [[10, 20], [12, 18]],
    deltas: { tas: 0, tasmax: 4, tasmin: 0 },
    expected: [7.5, 22.5, 10.5, 19.5]
  }
];

let totalHours = 0;
let failedHours = 0;
const failures = [];

testCases.forEach(testCase => {
  const epwData = buildEpwData(testCase.month, testCase.dayTemps);
  const monthlyDeltas = buildMonthlyDeltas(testCase.month, testCase.deltas);
  const morphed = morphHourlyTemperature(epwData, monthlyDeltas);

  morphed.forEach((hourRecord, idx) => {
    totalHours += 1;
    const expected = testCase.expected[idx];
    const actual = hourRecord.dryBulbTemperature;
    const error = Math.abs(actual - expected);
    if (error > TOLERANCE) {
      failedHours += 1;
      failures.push({
        test: testCase.name,
        index: idx,
        expected,
        actual,
        error
      });
    }
  });

  console.log(testCase.name);
  console.log('  input temps  :', testCase.dayTemps.flat().join(', '));
  console.log('  expected     :', testCase.expected.join(', '));
  console.log('  actual       :', morphed.map(h => h.dryBulbTemperature).join(', '));
  console.log('');
});

console.log('-'.repeat(60));
console.log(`Hours checked : ${totalHours}`);
console.log(`Failures      : ${failedHours}`);

if (failedHours > 0) {
  console.log('');
  console.log('Failure details:');
  failures.forEach(f => {
    console.log(`  [${f.test}] index ${f.index}: expected ${f.expected}, got ${f.actual}, error ${f.error}`);
  });
  process.exit(1);
} else {
  console.log('All synthetic Shift+Stretch cases match hand-calculated expected values.');
  process.exit(0);
}
