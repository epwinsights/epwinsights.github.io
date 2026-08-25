/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect } from 'vitest';
import PsychroLib from './psychrolib.js';

describe('Psychrometric Library', () => {
  it('should calculate saturation vapor pressure', () => {
    const svp0 = PsychroLib.getSatVaporPressure(0);
    const svp20 = PsychroLib.getSatVaporPressure(20);
    expect(svp0).toBeCloseTo(611.2, 0);
    expect(svp20).toBeCloseTo(2338.8, 0);
  });

  it('should calculate humidity ratio correctly', () => {
    const hr = PsychroLib.getHumidityRatio(20, 50);
    expect(hr).toBeCloseTo(0.00726, 4);
  });

  it('should reverse and calculate relative humidity', () => {
    const hr = PsychroLib.getHumidityRatio(25, 60);
    const rh = PsychroLib.getRelHumidity(25, hr);
    expect(rh).toBeCloseTo(60, 1);
  });

  it('should compute PMV index closely to standard comfort outputs', () => {
    const pmv = PsychroLib.getPMV(22, 22, 0.1, 50, 1.0, 1.0);
    expect(pmv).toBeCloseTo(-0.35, 1);
  });
});