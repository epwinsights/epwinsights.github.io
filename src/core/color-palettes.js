/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';

export function createHclInterpolator(colors) {
  const n = colors.length - 1;
  return function (t) {
    const seg = Math.min(Math.floor(t * n), n - 1);
    const localT = t * n - seg;
    return d3.interpolateHcl(colors[seg], colors[seg + 1])(localT);
  };
}

export const EPW_TEMPERATURE_INTERPOLATOR = createHclInterpolator([
  '#8c2f24', '#eaa23c', '#0f6f77', '#122845'
]);

export const EPW_HUMIDITY_INTERPOLATOR = createHclInterpolator([
  '#cdb07f', '#8a9a6a', '#1f7a80', '#123a5e'
]);

export const EPW_SOLAR_DNI_INTERPOLATOR = createHclInterpolator([
  '#0d1b3e', '#c65d1e', '#ffd23f'
]);

export const EPW_ILLUMINANCE_DNI_INTERPOLATOR = createHclInterpolator([
  '#241b4e', '#c9932f', '#f2e0ad'
]);

export const EPW_ZENITH_LUMINANCE_INTERPOLATOR = createHclInterpolator([
  '#2b3a4a', '#3f7ea6', '#bfe3f0'
]);

export const EPW_MRT_INTERPOLATOR = createHclInterpolator([
  '#123a3f', '#5b2a6e', '#d1495b', '#f4c95d'
]);

export const EPW_SET_ANCHOR = 24; // degC, ASHRAE 55 neutral SET
export const EPW_SET_INTERPOLATOR = createHclInterpolator([
  '#0e5c66', '#4fa6a0', '#eef0e1', '#d98a3d', '#8a3a1f'
]);

export const EPW_UTCI_NUMERIC_ANCHOR = 17.5; // degC, midpoint of the No Thermal Stress band
export const EPW_UTCI_NUMERIC_INTERPOLATOR = createHclInterpolator([
  '#2e1a47', '#3f6fa8', '#ede3c8', '#c4453c', '#6e1423'
]);

export const EPW_SURFACE_TEMPERATURE_INTERPOLATOR = createHclInterpolator([
  '#1a1a2e', '#7a2048', '#c1440e', '#f2a93c', '#fff4d6'
]);

export const EPW_SURFACE_DELTA_ANCHOR = 0; // degC, surface equals air temperature
export const EPW_SURFACE_DELTA_INTERPOLATOR = createHclInterpolator([
  '#134e6f', '#5b96a8', '#f2ede0', '#c2703f', '#6e2a1f'
]);

export const EPW_SIGNATURE_PALETTES = {
  epwTemperature: { label: 'EPW Insights (Signature)', interpolator: EPW_TEMPERATURE_INTERPOLATOR },
  epwHumidity: { label: 'EPW Insights (Signature)', interpolator: EPW_HUMIDITY_INTERPOLATOR },
  epwSolarDNI: { label: 'EPW Insights (Signature)', interpolator: EPW_SOLAR_DNI_INTERPOLATOR },
  epwIlluminanceDNI: { label: 'EPW Insights (Signature)', interpolator: EPW_ILLUMINANCE_DNI_INTERPOLATOR },
  epwZenithLuminance: { label: 'EPW Insights (Signature)', interpolator: EPW_ZENITH_LUMINANCE_INTERPOLATOR },
  epwMRT: { label: 'EPW Insights (Signature)', interpolator: EPW_MRT_INTERPOLATOR },
  epwSET: { label: 'EPW Insights (Signature)', interpolator: EPW_SET_INTERPOLATOR, diverging: true, anchor: EPW_SET_ANCHOR },
  epwUTCINumeric: { label: 'EPW Insights (Signature)', interpolator: EPW_UTCI_NUMERIC_INTERPOLATOR, diverging: true, anchor: EPW_UTCI_NUMERIC_ANCHOR },
  epwSurfaceTemperature: { label: 'EPW Insights (Signature)', interpolator: EPW_SURFACE_TEMPERATURE_INTERPOLATOR },
  epwSurfaceDelta: { label: 'EPW Insights (Signature)', interpolator: EPW_SURFACE_DELTA_INTERPOLATOR, diverging: true, anchor: EPW_SURFACE_DELTA_ANCHOR }
};

export function resolveColorInterpolator(name) {
  return EPW_SIGNATURE_PALETTES[name]?.interpolator || d3[name];
}