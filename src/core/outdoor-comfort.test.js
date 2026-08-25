/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { calculateUTCI, calculateSET, getCategoryInfo, utciCategories, getGroundSurfaceTemperature, getFp, calculateShortwaveDeltaMRT } from './outdoor-comfort.js';
import state from '../state.js';

describe('Outdoor Comfort Library', () => {
  beforeEach(() => {
    state.humanParams = {
      posture: 'standing',
      groundReflectance: 0.65,
      metabolicRate: 1.5,
      clothingInsulation: 0.6
    };
    state.urbanContext = {
      enabled: false,
      aspectRatio: 0.0,
      svf: 1.0,
      shadingFactor: 0.0,
      groundMaterial: 'paving_concrete_aged',
      groundAlpha: 0.35,
      groundEps: 0.90
    };
  });

  it('should categorize UTCI values', () => {
    const catNoStress = getCategoryInfo(20, utciCategories);
    const catExtremeHeat = getCategoryInfo(50, utciCategories);
    expect(catNoStress.label).toBe('No Thermal Stress');
    expect(catExtremeHeat.label).toBe('Extreme Heat Stress');
  });

  it('should calculate UTCI index accurately using the Legendre Polynomial model', () => {
    const utci = calculateUTCI(21.5, 22.6, 2, 34);
    expect(utci).toBeCloseTo(18.9, 0);
  });

  it('should calculate SET correctly using the ASHRAE 55-2013 Gagge 2-Node Model', () => {
    state.humanParams.metabolicRate = 1.0;
    state.humanParams.clothingInsulation = 1.0;
    const setVal = calculateSET(25, 25, 1.0, 50);
    expect(setVal).toBeCloseTo(24.9, 0);
  });

  describe('Ground Surface Temperature (sol-air model, replaces the Tg = Ta assumption)', () => {
    it('should estimate ground surface temperature above air temperature under moderate midday solar radiation, consistent with the 14-city plausibility check reported in the manuscript (Section 3.3)', () => {
      const d = {
        dryBulbTemperature: 32,
        dewPointTemperature: 15,
        directNormalRadiation: 750,
        diffuseHorizontalRadiation: 110,
        horizontalInfraredRadiationIntensity: 0,
        windSpeed: 3.5
      };
      const altRad = 65 * Math.PI / 180;
      const tGround = getGroundSurfaceTemperature(
        d, altRad, state.urbanContext.groundAlpha, state.urbanContext.groundEps, state.urbanContext.svf
      );
      // Reference value computed independently in Node using the same closed-form
      // sol-air equations: default 'paving_concrete_aged' ground (alpha=0.35, eps=0.90),
      // rough-surface McAdams convection coefficient, dew-point sky temperature fallback,
      // and the linearized radiative coefficient (h_r) solve in solveSteadyStateSurfaceTemperature
      // (see sky-temperature.js), the method used for the exterior surface heat balance in
      // EnergyPlus (Walton 1983; ASHRAE 1993 Fundamentals; McClellan and Pedersen 1997).
      expect(tGround).toBeCloseTo(39.37, 1);
      expect(tGround - d.dryBulbTemperature).toBeGreaterThan(1);
      expect(tGround - d.dryBulbTemperature).toBeLessThan(30);
    });

    it('should estimate ground surface temperature below air temperature at night due to longwave radiative cooling to the sky', () => {
      const d = {
        dryBulbTemperature: 18,
        dewPointTemperature: 12,
        directNormalRadiation: 0,
        diffuseHorizontalRadiation: 0,
        horizontalInfraredRadiationIntensity: 0,
        windSpeed: 2.0
      };
      const altRad = -30 * Math.PI / 180;
      const tGround = getGroundSurfaceTemperature(
        d, altRad, state.urbanContext.groundAlpha, state.urbanContext.groundEps, state.urbanContext.svf
      );
      // Reference value computed independently in Node, same closed-form equations,
      // default 'paving_concrete_aged' ground (alpha=0.35, eps=0.90), h_r-linearized
      // radiative solve (see sky-temperature.js).
      expect(tGround).toBeCloseTo(14.66, 1);
      expect(tGround).toBeLessThan(d.dryBulbTemperature);
    });

    it('should use the ground material\'s own roughness for the convection coefficient, not the unrelated Material Analysis tab\'s active preset', () => {
      const d = {
        dryBulbTemperature: 32,
        dewPointTemperature: 15,
        directNormalRadiation: 750,
        diffuseHorizontalRadiation: 110,
        horizontalInfraredRadiationIntensity: 0,
        windSpeed: 3.5
      };
      const altRad = 65 * Math.PI / 180;

      const tGroundBefore = getGroundSurfaceTemperature(
        d, altRad, state.urbanContext.groundAlpha, state.urbanContext.groundEps, state.urbanContext.svf
      );

      state.maState = state.maState || {};
      state.maState.mode = 'absolute';
      state.maState.preset = 'facade_alum_polished';

      const tGroundAfter = getGroundSurfaceTemperature(
        d, altRad, state.urbanContext.groundAlpha, state.urbanContext.groundEps, state.urbanContext.svf
      );

      expect(tGroundAfter).toBeCloseTo(tGroundBefore, 6);
    });
  });

  describe('Facing Direction (known-orientation SHARP, replaces SHARP-averaging when set)', () => {
    it('should return the exact ASHRAE 55-2023 Table C-3 fp value at grid points, with SHARP folded correctly for angles outside 0-180', () => {
      expect(getFp(45, 30, 'standing')).toBeCloseTo(0.244, 3);
      expect(getFp(45, -30, 'standing')).toBeCloseTo(0.244, 3);
      expect(getFp(45, 330, 'standing')).toBeCloseTo(0.244, 3);
      expect(getFp(45, 210, 'standing')).toBeCloseTo(getFp(45, 150, 'standing'), 6);
    });

    it('should behave identically to the unknown-orientation default when facingAzimuth is null, whether or not the sun azimuth argument is passed at all (backward compatibility)', () => {
      const d = { dryBulbTemperature: 32, directNormalRadiation: 750, diffuseHorizontalRadiation: 110 };
      const altRad = 40 * Math.PI / 180;
      const params = { posture: 'standing', facingAzimuth: null, groundReflectance: 0.65 };

      const withAzimuthArg = calculateShortwaveDeltaMRT(d, altRad, params, 220);
      const withoutAzimuthArg = calculateShortwaveDeltaMRT(d, altRad, params);

      expect(withAzimuthArg).toBeCloseTo(52.0953, 3);
      expect(withoutAzimuthArg).toBeCloseTo(withAzimuthArg, 6);
    });

    it('should give a lower shortwave delta-MRT for a side-on orientation (SHARP=90) than for facing toward or away from the sun (SHARP=0 or 180), consistent with a smaller projected body area at SHARP=90', () => {
      const d = { dryBulbTemperature: 32, directNormalRadiation: 750, diffuseHorizontalRadiation: 110 };
      const altRad = 40 * Math.PI / 180;
      const sunAzimuth = 220;

      const facingSun = calculateShortwaveDeltaMRT(d, altRad, { posture: 'standing', facingAzimuth: 220, groundReflectance: 0.65 }, sunAzimuth);
      const backToSun = calculateShortwaveDeltaMRT(d, altRad, { posture: 'standing', facingAzimuth: 40, groundReflectance: 0.65 }, sunAzimuth);
      const sideOn = calculateShortwaveDeltaMRT(d, altRad, { posture: 'standing', facingAzimuth: 130, groundReflectance: 0.65 }, sunAzimuth);

      expect(facingSun).toBeCloseTo(55.8685, 3);
      expect(backToSun).toBeCloseTo(54.9475, 3);
      expect(sideOn).toBeCloseTo(48.0089, 3);
      expect(sideOn).toBeLessThan(backToSun);
      expect(sideOn).toBeLessThan(facingSun);
    });
  });
});
