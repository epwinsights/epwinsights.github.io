/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as SunCalc from 'suncalc';

export function getSolarPositionForChart(date, lat, lon) {
  const pos = SunCalc.getPosition(date, lat, lon);
  if (pos.altitude < 0) return null;
  const azimuthRad = pos.azimuth * Math.PI / 180;
  return {
    azimuth: pos.azimuth,
    altitude: pos.altitude,
    unitX: Math.sin(azimuthRad),
    unitY: -Math.cos(azimuthRad)
  };
}

export default SunCalc;