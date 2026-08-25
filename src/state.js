/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

const state = {
  epwDataObject: null,
  comparisonDataObject: null,
  customLocationNames: {
    primary: { city: null, station: null },
    comparison: { city: null, station: null }
  },
  map: null,
  dataTablesState: null,
  solarDaylight: { activeMetric: 'radiation' },
  selectedBioclimaticStrategy: 'none',
  psychroSelection: { type: 'strategy', id: 'comfort' },
  meanOutdoorTemp: 19,
  bioclimaticFilters: {
    timePreset: 'all',
    customStart: 8,
    customEnd: 20,
    monthPreset: 'all',
    customStartMonth: 1,
    customEndMonth: 12,
    showHours: true,
    showPercent: false
  },
  windFilters: {
    timePreset: 'all',
    customStart: 8,
    customEnd: 20,
    monthPreset: 'all',
    customStartMonth: 1,
    customEndMonth: 12
  },
  activeStrategies: {
    comfort: true,
    ventilation: true,
    evaporative: true,
    thermalMass: false,
    nightVentilation: false,
    passiveSolar: true,
    activeHeating: false,
    activeCooling: false
  },
  humanParams: {
    posture: 'standing',
    facingAzimuth: null,
    groundReflectance: 0.65,
    metabolicRate: 1.5,
    clothingInsulation: 0.6
  },
  urbanContext: {
    enabled: false,
    aspectRatio: 0.0,
    svf: 1.0,
    shadingFactor: 0.0,
    groundMaterial: 'paving_concrete_aged',
    groundAlpha: 0.35,
    groundEps: 0.90
  },
  outdoorComfort: {
    activeMetric: 'MRT',
    utciHeatmapStyle: 'categorical',
    currentPalette: 'interpolateTurbo',
    filters: {
      timePreset: 'all',
      customStart: 8,
      customEnd: 20,
      monthPreset: 'all',
      customStartMonth: 1,
      customEndMonth: 12,
      showHours: true,
      showPercent: false
    },
    dataComputed: false
  },
  climateMorphing: {
    ssp: 'ssp245',
    targetYear: 2050,
    baseTempHeating: 18.0,
    baseTempCooling: 24.0,
    gridCell: null,
    regionLabel: null
  },
  maState: {
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
  }
};

export default state;