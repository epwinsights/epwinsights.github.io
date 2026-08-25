/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect } from 'vitest';
import SunCalc, { getSolarPositionForChart } from './suncalc.js';

describe('SunCalc v2 adapter output conventions', () => {
  it('returns altitude and azimuth within valid degree ranges', () => {
    const date = new Date('2026-06-21T12:00:00Z');
    const pos = SunCalc.getPosition(date, 40.0, -3.7);
    expect(pos.altitude).toBeGreaterThanOrEqual(-90);
    expect(pos.altitude).toBeLessThanOrEqual(90);
    expect(pos.azimuth).toBeGreaterThanOrEqual(0);
    expect(pos.azimuth).toBeLessThan(360);
  });

  it('places the sun due south at solar noon in the northern hemisphere', () => {
    const lat = 40.0;
    const lon = -3.7;
    const date = new Date('2026-03-20T00:00:00Z');
    const times = SunCalc.getTimes(date, lat, lon);
    const posAtNoon = SunCalc.getPosition(times.solarNoon, lat, lon);
    expect(Math.abs(posAtNoon.azimuth - 180)).toBeLessThan(2);
  });

  it('matches the analytic equinox altitude at solar noon', () => {
    const lat = 40.0;
    const lon = -3.7;
    const date = new Date('2026-03-20T00:00:00Z');
    const times = SunCalc.getTimes(date, lat, lon);
    const posAtNoon = SunCalc.getPosition(times.solarNoon, lat, lon);
    const expectedAltitude = 90 - lat;
    expect(Math.abs(posAtNoon.altitude - expectedAltitude)).toBeLessThan(1.5);
  });

  it('crosses zero altitude at sunrise and sunset', () => {
    const lat = 40.0;
    const lon = -3.7;
    const date = new Date('2026-06-21T00:00:00Z');
    const times = SunCalc.getTimes(date, lat, lon);
    const posAtSunrise = SunCalc.getPosition(times.sunrise, lat, lon);
    const posAtSunset = SunCalc.getPosition(times.sunset, lat, lon);
    expect(Math.abs(posAtSunrise.altitude)).toBeLessThan(1);
    expect(Math.abs(posAtSunset.altitude)).toBeLessThan(1);
  });
});

describe('getSolarPositionForChart', () => {
  it('returns null below the horizon', () => {
    const lat = 40.0;
    const lon = -3.7;
    const date = new Date('2026-06-21T00:00:00Z');
    const sun = getSolarPositionForChart(date, lat, lon);
    expect(sun).toBeNull();
  });

  it('projects due south to positive y and zero x', () => {
    const lat = 40.0;
    const lon = -3.7;
    const date = new Date('2026-03-20T00:00:00Z');
    const times = SunCalc.getTimes(date, lat, lon);
    const sun = getSolarPositionForChart(times.solarNoon, lat, lon);
    expect(sun).not.toBeNull();
    expect(Math.abs(sun.unitX)).toBeLessThan(0.05);
    expect(sun.unitY).toBeGreaterThan(0.9);
  });

  it('projects due east to positive x and near-zero y', () => {
    const lat = 40.0;
    const lon = -3.7;
    const date = new Date('2026-03-20T00:00:00Z');
    const times = SunCalc.getTimes(date, lat, lon);
    const sun = getSolarPositionForChart(new Date(times.sunrise.getTime() + 5 * 60000), lat, lon);
    expect(sun).not.toBeNull();
    expect(sun.unitX).toBeGreaterThan(0.9);
    expect(Math.abs(sun.unitY)).toBeLessThan(0.3);
  });
});
