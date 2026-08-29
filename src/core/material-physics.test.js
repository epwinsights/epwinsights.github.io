/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { computeMaterialTemperatures, computeThermalMass1D, materialPresets, thermalMassPresets } from './material-physics.js';
import state from '../state.js';

describe('Material Physics & Thermal Mass', () => {
  beforeEach(() => {
    state.maState = {
      mode: 'absolute',
      preset: 'facade_brick_red',
      massPreset: 'm01_100mm_brick',
      alpha: 0.65,
      eps: 0.90,
      thickness: 0.1016,
      density: 1920,
      specificHeat: 790,
      conductivity: 0.89,
      tilt: 90,
      azimuth: 180,
      svf: 1.0,
      albedoGround: 0.2,
      threshold: 50,
      monthFilter: 'Annual',
      dataComputed: false,
      massComputed: false
    };
  });

  it('should load material libraries presets', () => {
    expect(materialPresets.roof_white_epdm).toBeDefined();
    expect(thermalMassPresets.m01_100mm_brick.density).toBe(1920);
  });

  it('should calculate surface temperatures using steady-state heat balance', () => {
    const mockEpwData = {
      metadata: { location: { latitude: 35.68, longitude: 51.32 } },
      data: [
        {
          datetime: new Date(2026, 5, 21, 12, 0),
          dryBulbTemperature: 30.0,
          dewPointTemperature: 18.0,
          directNormalRadiation: 800,
          diffuseHorizontalRadiation: 100,
          horizontalInfraredRadiationIntensity: 350,
          windSpeed: 2.0
        }
      ]
    };

    computeMaterialTemperatures(mockEpwData);
    const result = mockEpwData.data[0];

    expect(result.ma_TSurf).toBeDefined();
    expect(result.ma_TSurf).toBeGreaterThan(30.0);
    expect(result.ma_DeltaT).toBeCloseTo(result.ma_TSurf - 30.0, 4);
  });

  it('should estimate sky temperature from dew point using the Clark and Allen (1978) clear-sky model when horizontal IR data is unavailable', () => {
    const mockEpwData = {
      metadata: { location: { latitude: 35.68, longitude: 51.32 } },
      data: [
        {
          datetime: new Date(2026, 5, 21, 0, 0),
          dryBulbTemperature: 25.0,
          dewPointTemperature: 15.0,
          directNormalRadiation: 0,
          diffuseHorizontalRadiation: 0,
          windSpeed: 1.0
        }
      ]
    };

    computeMaterialTemperatures(mockEpwData);
    const result = mockEpwData.data[0];

    // Reference value computed independently in Node using the same closed-form
    // equations documented in the paper: epsSkyClear = 0.787 + 0.764*ln(Tdp_K/273),
    // Tsky = Tair_K * epsSkyClear^0.25, hc = 5.678*(m + n*(V/0.3048)^p) with
    // rough-surface coefficients (facade_brick_red is not in the smooth set), and the
    // h_r-linearized radiative solve in solveSteadyStateSurfaceTemperature (see
    // sky-temperature.js), the method used for the exterior surface heat balance in
    // EnergyPlus (Walton 1983; ASHRAE 1993 Fundamentals; McClellan and Pedersen 1997).
    expect(result.ma_TSurf).toBeCloseTo(22.365, 2);
    expect(result.ma_DeltaT).toBeCloseTo(-2.635, 2);
  });

  it('should calculate transient heat propagation using 1D finite-difference', () => {
    const mockEpwData = {
      metadata: { location: { latitude: 35.68, longitude: 51.32 } },
      data: [
        {
          datetime: new Date(2026, 5, 21, 12, 0),
          dryBulbTemperature: 30.0,
          directNormalRadiation: 800,
          diffuseHorizontalRadiation: 100,
          horizontalInfraredRadiationIntensity: 350,
          windSpeed: 2.0,
          ma_TSurf: 45.0
        }
      ]
    };

    computeThermalMass1D(mockEpwData);
    const result = mockEpwData.data[0];

    expect(result.ma_TOutMass).toBeDefined();
    expect(result.ma_TInMass).toBeDefined();
    expect(result.ma_TMassNodes.length).toBe(10);
  });

  it('should fall back to the lumped-capacitance model for thermally-thin materials (e.g. thin sheet metal), where the explicit scheme would need more than 36,000 sub-steps/hour to stay stable', () => {
    state.maState = {
      ...state.maState,
      thickness: thermalMassPresets.f08_metal_surface.thickness,
      density: thermalMassPresets.f08_metal_surface.density,
      specificHeat: thermalMassPresets.f08_metal_surface.specificHeat,
      conductivity: thermalMassPresets.f08_metal_surface.conductivity
    };

    const mockEpwData = {
      metadata: { location: { latitude: 35.68, longitude: 51.32 } },
      data: Array.from({ length: 48 }, (_, h) => ({
        datetime: new Date(2026, 5, 21, h % 24, 0),
        dryBulbTemperature: 20 + 10 * Math.sin((2 * Math.PI * h) / 24),
        windSpeed: 2 + 3 * Math.abs(Math.sin(h)),
        ma_TSurf: 20 + 10 * Math.sin((2 * Math.PI * h) / 24)
      }))
    };

    computeThermalMass1D(mockEpwData);

    expect(mockEpwData.thermalMassIsLumped).toBe(true);

    const result = mockEpwData.data[30];
    expect(Number.isNaN(result.ma_TOutMass)).toBe(false);
    expect(result.ma_TOutMass).toBe(result.ma_TInMass);
    expect(result.ma_TMassNodes.every(t => t === result.ma_TOutMass)).toBe(true);
  });

  it('should still use the explicit finite-difference scheme (not the lumped fallback) for a normal-thickness material like brick', () => {
    const mockEpwData = {
      metadata: { location: { latitude: 35.68, longitude: 51.32 } },
      data: Array.from({ length: 48 }, (_, h) => ({
        datetime: new Date(2026, 5, 21, h % 24, 0),
        dryBulbTemperature: 20 + 10 * Math.sin((2 * Math.PI * h) / 24),
        windSpeed: 2 + 3 * Math.abs(Math.sin(h)),
        ma_TSurf: 20 + 10 * Math.sin((2 * Math.PI * h) / 24)
      }))
    };

    computeThermalMass1D(mockEpwData);

    expect(mockEpwData.thermalMassIsLumped).toBe(false);

    const result = mockEpwData.data[30];
    expect(result.ma_TOutMass).not.toBe(result.ma_TInMass);
  });
});
