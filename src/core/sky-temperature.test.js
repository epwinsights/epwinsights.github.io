/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect } from 'vitest';
import { getEffectiveSkyTemperatureK } from './sky-temperature.js';

describe('Effective Sky Temperature (shared model)', () => {
  it('should invert the Stefan-Boltzmann law from the EPW file\'s measured horizontal infrared radiation when available', () => {
    // 350 W/m2 horizontal IR -> Tsky = (350 / sigma)^0.25 = 280.299 K, independent of
    // air/dew-point temperature (this branch does not use them).
    const tSkyK = getEffectiveSkyTemperatureK(30, 18, 350);
    expect(tSkyK).toBeCloseTo(280.299, 2);
  });

  it('should fall back to the Clark and Allen (1978) dew-point clear-sky model when horizontal IR is missing (undefined)', () => {
    // Ta=25C, Tdp=15C. Reference value computed independently in Node using the same
    // closed-form equation documented in the manuscript:
    // epsSkyClear = 0.787 + 0.764*ln(Tdp_K/273) = 0.828263
    // Tsky = Tair_K * epsSkyClear^0.25 = 284.431 K (11.281 C)
    const tSkyK = getEffectiveSkyTemperatureK(25, 15, undefined);
    expect(tSkyK).toBeCloseTo(284.431, 2);
  });

  it('should fall back to the dew-point model when horizontal IR is exactly zero, not just undefined', () => {
    const tSkyKZero = getEffectiveSkyTemperatureK(25, 15, 0);
    const tSkyKUndefined = getEffectiveSkyTemperatureK(25, 15, undefined);
    expect(tSkyKZero).toBeCloseTo(tSkyKUndefined, 6);
  });

  it('should return a sky temperature below air temperature under typical clear-sky conditions', () => {
    // A clear sky always radiates at less than the full air-temperature blackbody
    // value (epsSkyClear < 1), so Tsky should be below Tair whenever the dew-point
    // fallback is used with a realistic dew point.
    const tAirK = 20 + 273.15;
    const tSkyK = getEffectiveSkyTemperatureK(20, 8, 0);
    expect(tSkyK).toBeLessThan(tAirK);
  });
});
