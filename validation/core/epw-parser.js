/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import PsychroLib from './psychrolib.js';

const DATA_QUALITY_FIELDS = [
  'dryBulbTemperature',
  'relativeHumidity',
  'atmosphericStationPressure',
  'atmosphericStationPressure',
  'totalSkyCover',
  'opaqueSkyCover',
  'windDirection',
  'windSpeed',
  'globalHorizontalRadiation',
  'directNormalRadiation',
  'diffuseHorizontalRadiation',
  'globalHorizontalIlluminance',
  'directNormalIlluminance',
  'diffuseHorizontalIlluminance',
  'zenithLuminance'
];

const MISSING_VALUE_SENTINELS = {
  dryBulbTemperature: 99.9,
  dewPointTemperature: 99.9,
  relativeHumidity: 999,
  atmosphericStationPressure: 999999,
  extraterrestrialHorizontalRadiation: 9999,
  extraterrestrialDirectNormalRadiation: 9999,
  horizontalInfraredRadiationIntensity: 9999,
  globalHorizontalRadiation: 9999,
  directNormalRadiation: 9999,
  diffuseHorizontalRadiation: 9999,
  globalHorizontalIlluminance: 999900,
  directNormalIlluminance: 999900,
  diffuseHorizontalIlluminance: 999900,
  zenithLuminance: 9999,
  windDirection: 999,
  windSpeed: 999,
  totalSkyCover: 99,
  opaqueSkyCover: 99,
  visibility: 9999,
  ceilingHeight: 99999,
  precipitableWater: 999,
  aerosolOpticalDepth: 0.999,
  snowDepth: 999,
  daysSinceLastSnowfall: 99,
  albedo: 999,
  liquidPrecipitationDepth: 999,
  liquidPrecipitationQuantity: 99
};

function computeDataQuality(data) {
  const quality = {};
  if (!data.length) {
    DATA_QUALITY_FIELDS.forEach(field => {
      quality[field] = { isConstant: false, value: null };
    });
    return quality;
  }

  DATA_QUALITY_FIELDS.forEach(field => {
    const first = data[0][field];
    const isConstant = data.every(d => d[field] === first);
    quality[field] = { isConstant, value: first };
  });

  return quality;
}

// Plausible bounds for real-world station pressure (Pa). Anything outside
// this range is treated as unusable (e.g. a leftover 0 from a column that
// was entirely missing and got backfilled with no prior valid value).
const MIN_PLAUSIBLE_PRESSURE = 31000;
const MAX_PLAUSIBLE_PRESSURE = 120000;

// Determines the atmospheric pressure to use for psychrometric calculations.
// Preference order:
//  1. The average of the EPW file's own measured atmosphericStationPressure
//     readings (most accurate, since it reflects real conditions).
//  2. If that field is constant across the whole file (never actually varies,
//     which usually means the file never reported it and it was backfilled),
//     but the constant value is still physically plausible, use it as-is.
//  3. Otherwise fall back to the ASHRAE standard-atmosphere formula using the
//     station's elevation from the LOCATION header.
//  4. Final fallback: sea-level pressure (101325 Pa).
function computeStationPressure(result) {
  const elevation = result.metadata.location ? result.metadata.location.elevation : NaN;
  const standardPressure = PsychroLib.getStandardAtmPressure(elevation);

  if (!result.data.length) return standardPressure;

  const validPressures = result.data
    .map(d => d.atmosphericStationPressure)
    .filter(p => typeof p === 'number' && p >= MIN_PLAUSIBLE_PRESSURE && p <= MAX_PLAUSIBLE_PRESSURE);

  if (validPressures.length === 0) return standardPressure;

  const quality = result.dataQuality.atmosphericStationPressure;
  if (quality && quality.isConstant) {
    return validPressures[0];
  }

  const sum = validPressures.reduce((acc, p) => acc + p, 0);
  return sum / validPressures.length;
}

export function parseEPW(epwString) {
  try {
    const lines = epwString.split(/\r\n|\n|\r/);
    const result = {
      metadata: {},
      data: []
    };

    const dataFieldHeaders = [
      'year', 'month', 'day', 'hour', 'minute', 'dataSource',
      'dryBulbTemperature', 'dewPointTemperature', 'relativeHumidity',
      'atmosphericStationPressure', 'extraterrestrialHorizontalRadiation',
      'extraterrestrialDirectNormalRadiation', 'horizontalInfraredRadiationIntensity',
      'globalHorizontalRadiation', 'directNormalRadiation', 'diffuseHorizontalRadiation',
      'globalHorizontalIlluminance', 'directNormalIlluminance', 'diffuseHorizontalIlluminance',
      'zenithLuminance', 'windDirection', 'windSpeed', 'totalSkyCover',
      'opaqueSkyCover', 'visibility', 'ceilingHeight', 'presentWeatherObservation',
      'presentWeatherCodes', 'precipitableWater', 'aerosolOpticalDepth',
      'snowDepth', 'daysSinceLastSnowfall', 'albedo', 'liquidPrecipitationDepth',
      'liquidPrecipitationQuantity'
    ];

    const headerLines = lines.slice(0, 8);
    headerLines.forEach(line => {
      const parts = line.split(',');
      const type = parts[0].trim();

      switch (type) {
        case 'LOCATION':
          result.metadata.location = {
            city: parts[1].trim(),
            stateProvince: parts[2].trim(),
            country: parts[3].trim(),
            source: parts[4].trim(),
            wmoStationNumber: parts[5].trim(),
            latitude: parseFloat(parts[6]),
            longitude: parseFloat(parts[7]),
            timeZone: parseFloat(parts[8]),
            elevation: parseFloat(parts[9])
          };
          break;
        case 'DESIGN CONDITIONS':
          if (!result.metadata.designConditions) result.metadata.designConditions = [];
          result.metadata.designConditions.push(parts.slice(1));
          break;
        case 'TYPICAL/EXTREME PERIODS':
          if (!result.metadata.typicalExtremePeriods) result.metadata.typicalExtremePeriods = [];
          result.metadata.typicalExtremePeriods.push(parts.slice(1));
          break;
        case 'GROUND TEMPERATURES':
          if (!result.metadata.groundTemperatures) result.metadata.groundTemperatures = [];
          result.metadata.groundTemperatures.push(parts.slice(1));
          break;
        case 'HOLIDAYS/DAYLIGHT SAVING':
          result.metadata.holidays = {
            leapYearObserved: parts[1].trim(),
            daylightSavingStartDate: parts[2].trim(),
            daylightSavingEndDate: parts[3].trim(),
            numberOfHolidays: parseInt(parts[4], 10),
          };
          break;
        case 'COMMENTS 1':
          result.metadata.comments1 = parts.slice(1).join(',').trim();
          break;
        case 'COMMENTS 2':
          result.metadata.comments2 = parts.slice(1).join(',').trim();
          break;
        case 'DATA PERIODS':
          if (!result.metadata.dataPeriods) result.metadata.dataPeriods = [];
          result.metadata.dataPeriods.push({
            numberOfPeriods: parseInt(parts[1], 10),
            recordsPerHour: parseInt(parts[2], 10),
            periodName: parts[3].trim(),
            startDayOfWeek: parts[4].trim(),
            startDate: parts[5].trim(),
            endDate: parts[6].trim()
          });
          break;
      }
    });

    const dataLines = lines.slice(8);
    let lastValidData = {};

    dataLines.forEach(line => {
      if (line.trim() === '') return;

      const values = line.split(',');
      const hourlyData = {};

      dataFieldHeaders.forEach((header, index) => {
        const value = values[index];
        if (index !== 5) {
          const trimVal = value ? value.trim() : '';
          let parsed = parseFloat(trimVal);

          const sentinel = MISSING_VALUE_SENTINELS[header];
          const isMissing = isNaN(parsed) || (sentinel !== undefined && Math.abs(parsed - sentinel) < 1e-6);

          if (isMissing) {
            parsed = lastValidData[header] !== undefined ? lastValidData[header] : 0;
          }
          hourlyData[header] = parsed;
          lastValidData[header] = parsed;
        } else {
          hourlyData[header] = value;
        }
      });

      const jsHour = hourlyData.hour - 1;
      const jsMinute = hourlyData.minute === 60 ? 0 : hourlyData.minute;

      const date = new Date(
        hourlyData.year,
        hourlyData.month - 1,
        hourlyData.day,
        jsHour,
        jsMinute
      );

      hourlyData.datetime = date;
      result.data.push(hourlyData);
    });

    if (result.data.length < 8760 && result.data.length > 0) {
      console.warn(`Parsed EPW file contains ${result.data.length} data records. A full year is 8760.`);
    }

    // A calendar year is at most 8784 hourly records (8760 + 24 for a leap
    // year). The EPW format doesn't technically forbid more than that in a
    // single file, and some EnergyPlus workflows (e.g. multi-year resilience
    // studies) produce concatenated multi-year files. Every downstream
    // module in this app (morphing, degree-days, psychrometrics, etc.)
    // assumes a single calendar year, so we truncate to the first 8784
    // records and warn rather than silently analyzing only part of a
    // multi-year dataset or producing undefined behavior downstream.
    const MAX_EPW_RECORDS = 8784;
    if (result.data.length > MAX_EPW_RECORDS) {
      console.warn(`Parsed EPW file contains ${result.data.length} data records, more than a single calendar year (max ${MAX_EPW_RECORDS} for a leap year). This looks like a multi-year file; only the first ${MAX_EPW_RECORDS} records will be used.`);
      result.data = result.data.slice(0, MAX_EPW_RECORDS);
    }

    result.dataQuality = computeDataQuality(result.data);
    result.stationPressure = computeStationPressure(result);

    return result;

  } catch (error) {
    console.error("Error parsing EPW file:", error);
    throw new Error("Failed to parse the EPW file. Please ensure it is a valid, text-based EPW file.");
  }
}