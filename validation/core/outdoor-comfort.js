/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import SunCalc from './suncalc.js';
import state from '../state.js';
import { filterUnifiedHourlyData, buildUnifiedChartTitleSuffix } from './date-filter.js';
import { getEffectiveSkyTemperatureK, solveSteadyStateSurfaceTemperature } from './sky-temperature.js';
import { getExternalConvectionCoefficient, materialPresets } from './material-physics.js';

export function buildChartTitleSuffix(filters, latitude) {
  return buildUnifiedChartTitleSuffix(filters, latitude);
}

export function filterDataForFrequency(data, filters, metadata) {
  return filterUnifiedHourlyData(data, filters, metadata);
}

export const utciCategories = [
  { label: 'Extreme Cold Stress', min: -Infinity, max: -40, color: '#313695', icon: '/img/comfort_01.png' },
  { label: 'Very Strong Cold Stress', min: -40, max: -27, color: '#4575b4', icon: '/img/comfort_02.png' },
  { label: 'Strong Cold Stress', min: -27, max: -13, color: '#74add1', icon: '/img/comfort_03.png' },
  { label: 'Moderate Cold Stress', min: -13, max: 0, color: '#abd9e9', icon: '/img/comfort_04.png' },
  { label: 'Slight Cold Stress', min: 0, max: 9, color: '#e0f3f8', icon: '/img/comfort_05.png' },
  { label: 'No Thermal Stress', min: 9, max: 26, color: '#66bd63', icon: '/img/comfort_06.png' },
  { label: 'Moderate Heat Stress', min: 26, max: 32, color: '#fdae61', icon: '/img/comfort_07.png' },
  { label: 'Strong Heat Stress', min: 32, max: 38, color: '#f46d43', icon: '/img/comfort_08.png' },
  { label: 'Very Strong Heat Stress', min: 38, max: 46, color: '#d73027', icon: '/img/comfort_09.png' },
  { label: 'Extreme Heat Stress', min: 46, max: Infinity, color: '#a50026', icon: '/img/comfort_10.png' }
];

export function getCategoryInfo(value, categories) {
  return categories.find(cat => value <= cat.max && value > cat.min) || categories[5];
}

// Projected area factor (fp) for a pedestrian whose facing direction is unknown.
// ASHRAE 55 Appendix C (Section C3, fp lookup table sourced from Fanger 1970) defines fp as a
// function of solar altitude, posture, and SHARP (solar horizontal angle relative to the person),
// and requires SHARP as an explicit input derived from a known body orientation. In "Table C-2 Input
// Variables and Ranges for Calculation Procedure", SHARP is listed as a required input, not something
// the standard averages over.
// EPW Insights has no way to know a pedestrian's facing direction, so this project computes fp by
// trapezoidal-integrating the official fp(SHARP, altitude, posture) table over the full 0-180 degree
// SHARP range at each altitude, producing an orientation-independent average. This averaging is a
// documented adaptation of the standard for the outdoor, unknown-orientation case, not a method
// ASHRAE itself defines, recommends, or validates.
const FP_ALTITUDES = [0, 15, 30, 45, 60, 75, 90];
const FP_SHARP_AVG_STANDING = [0.299, 0.299, 0.2683, 0.2194, 0.1739, 0.122, 0.082];
const FP_SHARP_AVG_SEATED = [0.2691, 0.2835, 0.2464, 0.236, 0.2164, 0.1915, 0.177];

function getProjectedAreaFactor(altDeg, posture) {
  const table = posture === 'seated' ? FP_SHARP_AVG_SEATED : FP_SHARP_AVG_STANDING;
  const alt = Math.min(Math.max(altDeg, 0), 90);
  let i = 0;
  while (i < FP_ALTITUDES.length - 2 && alt > FP_ALTITUDES[i + 1]) i++;
  const alt1 = FP_ALTITUDES[i];
  const alt2 = FP_ALTITUDES[i + 1];
  const t = (alt - alt1) / (alt2 - alt1);
  return table[i] + t * (table[i + 1] - table[i]);
}

// Raw ASHRAE 55-2023 Appendix C fp(altitude, SHARP, posture) lookup table (Table C-3),
// with the standard's own bilinear interpolation, transcribed verbatim from the same
// source already independently validated against Table C4-1 in validate_mrt_c4.mjs
// (max error 0.0047 across 26 rows). Used only when the person's facing direction is
// known (see calculateShortwaveDeltaMRT below); the SHARP-averaged getProjectedAreaFactor
// above remains the default for the unknown-orientation case.
const FP_ALT_RANGE = [0, 15, 30, 45, 60, 75, 90];
const FP_SHARP_RANGE = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];

const FP_TABLE_STANDING = [
  [0.35, 0.35, 0.314, 0.258, 0.206, 0.144, 0.082],
  [0.342, 0.342, 0.31, 0.252, 0.2, 0.14, 0.082],
  [0.33, 0.33, 0.3, 0.244, 0.19, 0.132, 0.082],
  [0.31, 0.31, 0.275, 0.228, 0.175, 0.124, 0.082],
  [0.283, 0.283, 0.251, 0.208, 0.16, 0.114, 0.082],
  [0.252, 0.252, 0.228, 0.188, 0.15, 0.108, 0.082],
  [0.23, 0.23, 0.214, 0.18, 0.148, 0.108, 0.082],
  [0.242, 0.242, 0.222, 0.18, 0.153, 0.112, 0.082],
  [0.274, 0.274, 0.245, 0.203, 0.165, 0.116, 0.082],
  [0.304, 0.304, 0.27, 0.22, 0.174, 0.121, 0.082],
  [0.328, 0.328, 0.29, 0.234, 0.183, 0.125, 0.082],
  [0.344, 0.344, 0.304, 0.244, 0.19, 0.128, 0.082],
  [0.347, 0.347, 0.308, 0.246, 0.191, 0.128, 0.082]
];

const FP_TABLE_SEATED = [
  [0.29, 0.324, 0.305, 0.303, 0.262, 0.224, 0.177],
  [0.292, 0.328, 0.294, 0.288, 0.268, 0.227, 0.177],
  [0.288, 0.332, 0.298, 0.29, 0.264, 0.222, 0.177],
  [0.274, 0.326, 0.294, 0.289, 0.252, 0.214, 0.177],
  [0.254, 0.308, 0.28, 0.276, 0.241, 0.202, 0.177],
  [0.23, 0.282, 0.262, 0.26, 0.233, 0.193, 0.177],
  [0.216, 0.26, 0.248, 0.244, 0.22, 0.186, 0.177],
  [0.234, 0.258, 0.236, 0.227, 0.208, 0.18, 0.177],
  [0.262, 0.26, 0.224, 0.208, 0.196, 0.176, 0.177],
  [0.28, 0.26, 0.21, 0.192, 0.184, 0.17, 0.177],
  [0.298, 0.256, 0.194, 0.174, 0.168, 0.168, 0.177],
  [0.306, 0.25, 0.18, 0.156, 0.156, 0.166, 0.177],
  [0.3, 0.24, 0.168, 0.152, 0.152, 0.164, 0.177]
];

function findFpSpan(arr, x) {
  const clamped = Math.min(arr[arr.length - 1], Math.max(arr[0], x));
  for (let i = 0; i < arr.length - 1; i++) {
    if (clamped >= arr[i] && clamped <= arr[i + 1]) return i;
  }
  return arr.length - 2;
}

// sharpDeg does not need to be pre-folded into 0-180 by the caller; any value (including
// negative or > 360) is normalized here first.
export function getFp(altDeg, sharpDeg, posture) {
  const table = posture === 'seated' ? FP_TABLE_SEATED : FP_TABLE_STANDING;
  const alt = Math.min(90, Math.max(0, altDeg));
  let sharp = sharpDeg % 360;
  if (sharp < 0) sharp += 360;
  if (sharp > 180) sharp = 360 - sharp;

  const altI = findFpSpan(FP_ALT_RANGE, alt);
  const sharpI = findFpSpan(FP_SHARP_RANGE, sharp);
  const fp11 = table[sharpI][altI];
  const fp12 = table[sharpI][altI + 1];
  const fp21 = table[sharpI + 1][altI];
  const fp22 = table[sharpI + 1][altI + 1];
  const [sharp1, sharp2] = [FP_SHARP_RANGE[sharpI], FP_SHARP_RANGE[sharpI + 1]];
  const [alt1, alt2] = [FP_ALT_RANGE[altI], FP_ALT_RANGE[altI + 1]];

  let fp = fp11 * (sharp2 - sharp) * (alt2 - alt);
  fp += fp21 * (sharp - sharp1) * (alt2 - alt);
  fp += fp12 * (sharp2 - sharp) * (alt - alt1);
  fp += fp22 * (sharp - sharp1) * (alt - alt1);
  fp /= (sharp2 - sharp1) * (alt2 - alt1);
  return fp;
}

// Sol-air ground surface temperature, used for the "ground" side of the MRT longwave
// exchange below, replacing the previous Tg = Ta assumption.
//
// This mirrors the sol-air temperature formulation already used for tilted building
// surfaces in material-physics.js (computeMaterialTemperatures), specialized to the
// tilt = 0 case: a horizontal surface facing straight up, with full self sky-view
// before any urban Sky View Factor (SVF) reduction is applied. Reusing the same model
// (ASHRAE Fundamentals sol-air temperature, McAdams 1954 convection coefficient, and
// the shared getEffectiveSkyTemperatureK sky model) keeps the platform's building
// surface temperature and outdoor ground surface temperature internally consistent,
// rather than introducing a second, independent formula.
//
// Urban obstructions (when urbanContext is enabled) reduce the ground patch's own sky
// exposure for both diffuse solar and longwave loss (via SVF) and its direct-beam
// exposure (via the Direct Sun Shading Factor), matching the treatment already applied
// to the pedestrian's own radiative exchange in calculateAdvancedMRT below.
export function getGroundSurfaceTemperature(d, altRad, groundAlpha, groundEps, svf) {
  const ta = d.dryBulbTemperature;

  const tSkyK = getEffectiveSkyTemperatureK(ta, d.dewPointTemperature, d.horizontalInfraredRadiationIntensity);

  let groundDirect = d.directNormalRadiation;
  if (state.urbanContext.enabled) {
    groundDirect = groundDirect * (1 - state.urbanContext.shadingFactor);
  }
  // Matches material-physics.js: SVF scales the diffuse (and longwave) terms, not the
  // direct-beam term, which is instead reduced by the explicit shading factor above.
  // At tilt = 0 the ground's own view factor to the sky is 1 before SVF reduction, and
  // there is no self-reflected term (a flat surface doesn't see its own reflection).
  const incidentDirect = altRad > 0 ? groundDirect * Math.sin(altRad) : 0;
  const incidentDiffuse = d.diffuseHorizontalRadiation * svf;
  const iTotal = incidentDirect + incidentDiffuse;

  // Pass the actual ground material explicitly, rather than letting
  // getExternalConvectionCoefficient fall back to the unrelated Material Analysis
  // tab's currently active preset (state.maState). For 'custom' ground entries there
  // is no matching preset key/group; every preset in the Paving & Hardscape group is
  // rough (none are in the Glass/Metals smooth-surface groups), so a generic
  // Paving & Hardscape group tag is a reasonable default for custom entries too.
  const groundKey = state.urbanContext.groundMaterial;
  const groundInfo = groundKey !== 'custom' ? materialPresets[groundKey] : { group: 'Paving & Hardscape' };
  const ho = getExternalConvectionCoefficient(d.windSpeed, groundKey, groundInfo);

  return solveSteadyStateSurfaceTemperature(ta, tSkyK, groundAlpha, groundEps, iTotal, ho, svf);
}

// Shortwave (solar) delta-MRT: ASHRAE 55 Appendix C SolarCal, adapted for outdoor,
// orientation-unknown pedestrians (SHARP-averaged fp instead of a single known
// orientation), using the EPW file's own measured diffuse radiation instead of the
// standard's simplified 0.2 x direct estimate, and a variable ground reflectance
// instead of the standard's fixed 0.6.
//
// Deliberately independent of the longwave/ground-temperature model above: this is
// the same physical quantity Table C4-1 validates (ERF / t_rsw), isolated as its own
// function specifically so it stays testable in isolation, immune to any future change
// in how the longwave baseline (sky/ground temperature) is computed.
export function calculateShortwaveDeltaMRT(d, altRad, params, sunAzimuthDeg) {
  const alt = altRad * 180 / Math.PI;
  if (!(alt > 0 && (d.directNormalRadiation > 0 || d.diffuseHorizontalRadiation > 0))) return 0;

  const fEff = params.posture === 'seated' ? 0.696 : 0.725; // fraction of body surface exposed to radiant environment
  const asw = 0.7; // shortwave (solar) absorptivity of skin/clothing
  const lwAbs = 0.95; // longwave absorptivity, used to convert ERF's SW component to LW-equivalent
  const hr = 6.0; // ASHRAE 55 SolarCal fixed linearized radiative heat transfer coefficient

  // Known facing direction (a fixed compass bearing for the pedestrian or space, e.g. the
  // orientation of a street or plaza): use the exact SHARP-based fp for that hour's sun
  // position. Otherwise (the default, unknown-orientation case): SHARP-averaged fp.
  let fp;
  if (params.facingAzimuth !== null && params.facingAzimuth !== undefined && sunAzimuthDeg !== undefined) {
    const sharp = sunAzimuthDeg - params.facingAzimuth;
    fp = getFp(alt, sharp, params.posture);
  } else {
    fp = getProjectedAreaFactor(alt, params.posture);
  }

  const svf = state.urbanContext.enabled ? state.urbanContext.svf : 1.0;

  let directRad = d.directNormalRadiation;
  const diffuseRad = d.diffuseHorizontalRadiation; // EPW-measured value used directly, rather than the standard's own 0.2x-direct estimate

  if (state.urbanContext.enabled) {
    directRad = directRad * (1 - state.urbanContext.shadingFactor);
  }

  const eDiff = fEff * svf * 0.5 * diffuseRad;
  const eDirect = fEff * fp * directRad;
  const eReflected = fEff * svf * 0.5 * (directRad * Math.sin(altRad) + diffuseRad) * params.groundReflectance; // user-set surface reflectance used directly, rather than the standard's fixed 0.6 average-ground assumption

  const eSolar = eDiff + eDirect + eReflected;
  const ERF_sw = eSolar * (asw / lwAbs);

  return ERF_sw / (hr * fEff);
}

export function calculateAdvancedMRT(d, metadata, params) {
  const ta = d.dryBulbTemperature;
  const lat = metadata.latitude || 0;
  const lon = metadata.longitude || 0;
  const sunPos = SunCalc.getPosition(d.datetime, lat, lon);
  const alt = sunPos.altitude;
  const altRad = alt * Math.PI / 180;

  const svf = state.urbanContext.enabled ? state.urbanContext.svf : 1.0;

  const tSkyK = getEffectiveSkyTemperatureK(ta, d.dewPointTemperature, d.horizontalInfraredRadiationIntensity);

  const groundAlpha = state.urbanContext.groundAlpha;
  const groundEps = state.urbanContext.groundEps;
  const tGround = getGroundSurfaceTemperature(d, altRad, groundAlpha, groundEps, svf);
  const tGroundK = tGround + 273.15;

  const tmrtLongwaveK = Math.pow(svf * Math.pow(tSkyK, 4) + (1 - svf) * Math.pow(tGroundK, 4), 0.25);
  let tmrt = tmrtLongwaveK - 273.15;

  tmrt += calculateShortwaveDeltaMRT(d, altRad, params, sunPos.azimuth);

  return tmrt;
}

export function calculateUTCI(tdb, tr, v10, rh) {
  // 10th-degree sparse orthogonal regression on a Legendre polynomial basis (Roman  et al., 2026), 
  // not the original 6th-degree monomial-basis polynomial published in
  // Bröde et al. (2012). Both are fitted to the same underlying offset dataset from Bröde et al.
  // (2012), itself derived from the Fiala multi-node physiological model, but the Legendre-basis
  // fit achieves substantially lower error and a much lighter large-error tail (see Roman et al.
  // 2026, Table 3): on the independent 1000-point Zenodo test set used by validate_utci.mjs, this
  // reproduces to RMSE 0.955 C, matching Roman et al.'s own reported 0.96 C for this exact model
  // on the same test set, versus roughly 2.77 C for the original 6th-degree polynomial.
  const Ta = Math.min(Math.max(tdb, -50.0), 50.0);
  const va = Math.min(Math.max(v10, 0.5), 30.3);
  const rH = Math.min(Math.max(rh, 5.0), 100.0);
  const dTrTa = Math.min(Math.max(tr - Ta, -30.0), 70.0);

  const nTa = Ta / 50.0;
  const ndTrTa = (dTrTa - 20.0) / 50.0;
  const nva = (va - 15.4) / 14.9;
  const nrH = (rH - 52.5) / 47.5;

  const Ta1 = nTa;
  const Ta2 = 0.5 * (-1.0 + 3.0 * nTa**2);
  const Ta3 = 0.5 * (-3.0 * nTa + 5.0 * nTa**3);
  const Ta4 = 0.125 * (3.0 - 30.0 * nTa**2 + 35.0 * nTa**4);
  const Ta5 = 0.125 * (15.0 * nTa - 70.0 * nTa**3 + 63.0 * nTa**5);
  const Ta6 = 0.0625 * (-5.0 + 105.0 * nTa**2 - 315.0 * nTa**4 + 231.0 * nTa**6);
  const Ta7 = 0.0625 * (-35.0 * nTa + 315.0 * nTa**3 - 693.0 * nTa**5 + 429.0 * nTa**7);
  const Ta8 = 0.0078125 * (35.0 - 1260.0 * nTa**2 + 6930.0 * nTa**4 - 12012.0 * nTa**6 + 6435.0 * nTa**8);
  const Ta9 = 0.0078125 * (315.0 * nTa - 4620.0 * nTa**3 + 18018.0 * nTa**5 - 25740.0 * nTa**7 + 12155.0 * nTa**9);
  const Ta10 = 0.00390625 * (-63.0 + 3465.0 * nTa**2 - 30030.0 * nTa**4 + 90090.0 * nTa**6 - 109395.0 * nTa**8 + 46189.0 * nTa**10);

  const dTrTa1 = ndTrTa;
  const dTrTa2 = 0.5 * (-1.0 + 3.0 * ndTrTa**2);
  const dTrTa3 = 0.5 * (-3.0 * ndTrTa + 5.0 * ndTrTa**3);

  const va1 = nva;
  const va2 = 0.5 * (-1.0 + 3.0 * nva**2);
  const va3 = 0.5 * (-3.0 * nva + 5.0 * nva**3);
  const va4 = 0.125 * (3.0 - 30.0 * nva**2 + 35.0 * nva**4);
  const va5 = 0.125 * (15.0 * nva - 70.0 * nva**3 + 63.0 * nva**5);
  const va6 = 0.0625 * (-5.0 + 105.0 * nva**2 - 315.0 * nva**4 + 231.0 * nva**6);
  const va7 = 0.0625 * (-35.0 * nva + 315.0 * nva**3 - 693.0 * nva**5 + 429.0 * nva**7);
  const va8 = 0.0078125 * (35.0 - 1260.0 * nva**2 + 6930.0 * nva**4 - 12012.0 * nva**6 + 6435.0 * nva**8);
  const va9 = 0.0078125 * (315.0 * nva - 4620.0 * nva**3 + 18018.0 * nva**5 - 25740.0 * nva**7 + 12155.0 * nva**9);
  const va10 = 0.00390625 * (-63.0 + 3465.0 * nva**2 - 30030.0 * nva**4 + 90090.0 * nva**6 - 109395.0 * nva**8 + 46189.0 * nva**10);

  const rH1 = nrH;
  const rH2 = 0.5 * (-1.0 + 3.0 * nrH**2);
  const rH3 = 0.5 * (-3.0 * nrH + 5.0 * nrH**3);
  const rH4 = 0.125 * (3.0 - 30.0 * nrH**2 + 35.0 * nrH**4);
  const rH5 = 0.125 * (15.0 * nrH - 70.0 * nrH**3 + 63.0 * nrH**5);
  const rH6 = 0.0625 * (-5.0 + 105.0 * nrH**2 - 315.0 * nrH**4 + 231.0 * nrH**6);
  const rH7 = 0.0625 * (-35.0 * nrH + 315.0 * nrH**3 - 693.0 * nrH**5 + 429.0 * nrH**7);
  const rH8 = 0.0078125 * (35.0 - 1260.0 * nrH**2 + 6930.0 * nrH**4 - 12012.0 * nrH**6 + 6435.0 * nrH**8);
  const rH9 = 0.0078125 * (315.0 * nrH - 4620.0 * nrH**3 + 18018.0 * nrH**5 - 25740.0 * nrH**7 + 12155.0 * nrH**9);

  const UTCI_offset_normalized =
    -0.0137842169737312 +
    0.605451658287147 * Ta1 +
    0.228978616673604 * dTrTa1 +
    -0.411887517706717 * va1 +
    0.0516822161148559 * rH1 +
    0.280580929387293 * Ta2 +
    0.0494441100625763 * Ta1 * dTrTa1 +
    0.407606222800615 * Ta1 * va1 +
    0.0989531628394581 * Ta1 * rH1 +
    0.0246471408147623 * dTrTa2 +
    -0.0571289630222624 * dTrTa1 * va1 +
    -0.00981948141197167 * dTrTa1 * rH1 +
    0.115659720373134 * va2 +
    -0.00534228470468843 * va1 * rH1 +
    0.016606193686503 * rH2 +
    -0.151030966047951 * Ta2 * dTrTa1 +
    0.188807982337807 * Ta2 * va1 +
    0.0881449234650015 * Ta2 * rH1 +
    -0.00930063989106069 * Ta1 * dTrTa2 +
    0.0215873308746893 * Ta1 * dTrTa1 * va1 +
    -0.0227872935667395 * Ta1 * dTrTa1 * rH1 +
    -0.11306527433562 * Ta1 * va2 +
    -0.0109236071122277 * Ta1 * va1 * rH1 +
    0.0255963885144559 * Ta1 * rH2 +
    -0.000676664345791177 * dTrTa3 +
    0.0244340319236622 * dTrTa1 * va2 +
    0.0020488990800455 * dTrTa1 * va1 * rH1 +
    -0.00198787369921777 * dTrTa1 * rH2 +
    -0.0262531747919802 * va3 +
    0.00241202999394371 * va2 * rH1 +
    -0.0899003481633464 * Ta4 +
    -0.0518348124459142 * Ta3 * dTrTa1 +
    -0.019305242850497 * Ta3 * va1 +
    0.0288567768313003 * Ta3 * rH1 +
    -0.00532373584837672 * Ta2 * dTrTa2 +
    0.00865046786070809 * Ta2 * dTrTa1 * va1 +
    -0.0200025901337491 * Ta2 * dTrTa1 * rH1 +
    -0.0560921250768577 * Ta2 * va2 +
    -0.0120111532564824 * Ta2 * va1 * rH1 +
    0.0193526595005879 * Ta2 * rH2 +
    -0.00147617610703898 * Ta1 * dTrTa3 +
    0.0147709386142124 * Ta1 * dTrTa2 * va1 +
    0.000223025361668181 * Ta1 * dTrTa2 * rH1 +
    -0.0267126314476705 * Ta1 * dTrTa1 * va2 +
    0.00293284619228001 * Ta1 * dTrTa1 * va1 * rH1 +
    -0.00274343594032762 * Ta1 * dTrTa1 * rH2 +
    0.0255375758890182 * Ta1 * va3 +
    0.00617742875276631 * Ta1 * va2 * rH1 +
    0.00131758038812698 * dTrTa3 * va1 +
    -1.19588186117375E-05 * dTrTa2 * va2 +
    -0.0195473208292468 * dTrTa1 * va3 +
    0.0308499978887788 * va4 +
    -0.00168292560551294 * va3 * rH1 +
    -0.000721243580359172 * rH4 +
    0.0241135789170187 * Ta5 +
    0.0667693514821362 * Ta4 * dTrTa1 +
    -0.105442958374474 * Ta4 * va1 +
    0.0169733342570069 * Ta3 * dTrTa2 +
    -0.0588730143622148 * Ta3 * dTrTa1 * va1 +
    -0.00478455509424903 * Ta3 * dTrTa1 * rH1 +
    0.0322224934071458 * Ta3 * va2 +
    -0.0109309219781879 * Ta3 * va1 * rH1 +
    0.00298613871955914 * Ta2 * dTrTa3 +
    -0.00970592755419437 * Ta2 * dTrTa2 * va1 +
    0.0143009046314569 * Ta2 * va3 +
    0.0073472142860989 * Ta2 * va2 * rH1 +
    -0.0118859833533268 * Ta2 * rH3 +
    -0.00811197236365886 * Ta1 * dTrTa2 * va2 +
    0.0202049930797466 * Ta1 * dTrTa1 * va3 +
    -0.00948544475972315 * Ta1 * va4 +
    -0.00407327808659386 * Ta1 * va3 * rH1 +
    0.0013485215681372 * dTrTa2 * va3 +
    0.00386595947690624 * dTrTa1 * va4 +
    2.17696778130301E-05 * dTrTa1 * va3 * rH1 +
    -0.00261892113164038 * dTrTa1 * rH4 +
    -0.00489648267639115 * va5 +
    0.000681848728845763 * va4 * rH1 +
    0.0082368236806339 * Ta6 +
    0.0421952883373002 * Ta5 * dTrTa1 +
    -0.0188866947129327 * Ta5 * va1 +
    -0.0230895202091769 * Ta5 * rH1 +
    0.00050946740381826 * Ta4 * dTrTa2 +
    0.0387368190996963 * Ta4 * va2 +
    -0.00365652796668801 * Ta4 * va1 * rH1 +
    -0.0165226812597451 * Ta4 * rH2 +
    -0.02106808547032 * Ta3 * dTrTa2 * va1 +
    0.0455127356554093 * Ta3 * dTrTa1 * va2 +
    -0.0327523492050705 * Ta3 * va3 +
    0.00411199080502651 * Ta3 * va2 * rH1 +
    -0.00529398688982106 * Ta3 * rH3 +
    -0.00299659797672848 * Ta2 * dTrTa3 * va1 +
    0.0127070225168592 * Ta2 * dTrTa2 * va2 +
    -0.0039536575347961 * Ta2 * va3 * rH1 +
    0.00176928876312725 * Ta1 * dTrTa2 * va3 +
    0.0249223383434746 * Ta1 * va5 +
    0.0010279948173077 * Ta1 * va4 * rH1 +
    -0.000456624197665442 * dTrTa2 * va4 +
    0.000227993624070799 * dTrTa2 * rH4 +
    -0.000497222888028054 * dTrTa1 * va1 * rH4 +
    0.00189906855480326 * va2 * rH4 +
    -0.00516323105647903 * rH6 +
    -0.0388335821720079 * Ta7 +
    -0.0142074242411286 * Ta6 * dTrTa1 +
    0.0488685513521004 * Ta6 * va1 +
    -0.0269122930593438 * Ta6 * rH1 +
    -0.00845228865914141 * Ta5 * dTrTa2 +
    0.0386364103297441 * Ta5 * dTrTa1 * va1 +
    0.00333840546426587 * Ta5 * dTrTa1 * rH1 +
    -0.0274986339482448 * Ta5 * va2 +
    -0.0233728308709061 * Ta5 * rH2 +
    -0.0010233136301785 * Ta4 * dTrTa3 +
    0.0109665440679091 * Ta4 * dTrTa2 * va1 +
    -0.0141154511737893 * Ta4 * dTrTa1 * va2 +
    0.00797571345288548 * Ta4 * dTrTa1 * rH2 +
    -0.00626818826879268 * Ta4 * rH3 +
    0.000541492731933859 * Ta3 * dTrTa2 * va2 +
    -0.0194848041587283 * Ta3 * dTrTa1 * va3 +
    -0.00242146589114414 * Ta3 * dTrTa1 * va1 * rH2 +
    0.00862214501674155 * Ta3 * va4 +
    -0.000813086246676268 * Ta3 * va3 * rH1 +
    -0.0109313281200866 * Ta2 * dTrTa2 * va3 +
    0.0107908356351421 * Ta2 * dTrTa1 * va4 +
    -0.00154886246960825 * Ta2 * dTrTa1 * rH4 +
    0.000285510363654986 * Ta2 * va3 * rH2 +
    0.00600871455392313 * Ta1 * dTrTa1 * va5 +
    0.0133563698637056 * Ta1 * va6 +
    0.00200056613397992 * dTrTa2 * va5 +
    -0.000487892088628483 * dTrTa2 * va1 * rH4 +
    0.00239926457161527 * dTrTa1 * va2 * rH4 +
    -0.00147299336560724 * va3 * rH4 +
    -0.0034747543766636 * rH7 +
    -0.042138668585659 * Ta7 * dTrTa1 +
    0.0226809825649836 * Ta7 * va1 +
    -0.0317422118129167 * Ta7 * rH1 +
    -0.0165868569214051 * Ta6 * dTrTa2 +
    0.00866283641928592 * Ta6 * dTrTa1 * va1 +
    -0.0158286817515286 * Ta6 * va2 +
    -0.0123918623262792 * Ta6 * rH2 +
    0.00865497207378352 * Ta5 * dTrTa2 * va1 +
    -0.0313622056127219 * Ta5 * dTrTa1 * va2 +
    0.0059883355097739 * Ta5 * dTrTa1 * rH2 +
    0.0282517594922186 * Ta5 * va3 +
    -0.00055801074931404 * Ta5 * rH3 +
    0.00216134547091048 * Ta4 * dTrTa3 * va1 +
    -0.00390324341081546 * Ta4 * dTrTa2 * va2 +
    0.0163223310714439 * Ta4 * dTrTa1 * va3 +
    -0.00150025871011703 * Ta4 * dTrTa1 * va1 * rH2 +
    0.00276956624980006 * Ta4 * dTrTa1 * rH3 +
    -0.0229190983632922 * Ta4 * va4 +
    0.00314130091223181 * Ta3 * dTrTa1 * va2 * rH2 +
    -0.0112810754291653 * Ta3 * va5 +
    0.00416439851600464 * Ta3 * rH5 +
    -0.000700256201721478 * Ta2 * dTrTa3 * va3 +
    -0.000514959299985243 * Ta2 * dTrTa1 * va3 * rH2 +
    0.00233921794871584 * Ta2 * dTrTa1 * va1 * rH4 +
    0.00619041956132346 * Ta2 * va6 +
    -0.00342955079343321 * Ta1 * dTrTa1 * va2 * rH4 +
    0.000527414639632667 * dTrTa1 * va7 +
    -0.000183752476546752 * dTrTa1 * va1 * rH6 +
    -0.0118888391328967 * va8 +
    0.000238712903990469 * va4 * rH4 +
    -0.00274527466548323 * rH8 +
    -0.00346736606571359 * Ta9 +
    -0.015821140907443 * Ta8 * dTrTa1 +
    -0.0159703972679985 * Ta8 * va1 +
    -0.00220146749570155 * Ta8 * rH1 +
    -0.0196462686116071 * Ta7 * dTrTa1 * va1 +
    0.0160930622139814 * Ta7 * va2 +
    0.0271083926542394 * Ta6 * dTrTa1 * va2 +
    -0.0169727859361079 * Ta6 * va3 +
    -0.00262019654796821 * Ta5 * va2 * rH2 +
    0.0117666226277279 * Ta5 * rH4 +
    0.00865116634722382 * Ta4 * dTrTa2 * va3 +
    -0.0318664489619453 * Ta4 * dTrTa1 * va4 +
    0.00136762123420908 * Ta4 * va3 * rH2 +
    -0.00648813541319593 * Ta2 * dTrTa2 * va5 +
    0.00283418925119063 * Ta2 * dTrTa1 * va6 +
    0.000627683891249201 * dTrTa2 * rH7 +
    0.000464486061684286 * va7 * rH2 +
    -0.012558774419946 * Ta10 +
    0.0142246701070405 * Ta9 * dTrTa1 +
    -0.0219945853668843 * Ta9 * va1 +
    0.00147989498898127 * Ta9 * rH1 +
    0.020694589513114 * Ta8 * dTrTa2 +
    -0.0159821465878725 * Ta8 * dTrTa1 * va1 +
    0.00122990587236154 * Ta8 * va2 +
    0.00774643224013198 * Ta8 * rH2 +
    0.00348972484418949 * Ta7 * dTrTa3 +
    -0.00449889353160404 * Ta7 * dTrTa2 * va1 +
    0.00150065745949661 * Ta7 * dTrTa2 * rH1 +
    -0.000617652342920564 * Ta7 * va3 +
    0.0150749840950315 * Ta7 * rH3 +
    -0.00456928274166078 * Ta6 * dTrTa1 * va3 +
    0.0132771238868905 * Ta6 * va4 +
    -0.00313385473186283 * Ta6 * va2 * rH2 +
    0.0187605036147175 * Ta5 * dTrTa1 * va4 +
    0.000600921760262751 * Ta5 * va3 * rH2 +
    -0.00662490990387182 * Ta4 * va6 +
    0.00527904629696365 * Ta4 * va2 * rH4 +
    -0.000464141239154267 * Ta3 * dTrTa1 * va6 +
    -0.00506780416680173 * Ta3 * va3 * rH4 +
    0.0040868742073381 * Ta2 * va8 +
    0.000288339820559906 * Ta1 * dTrTa2 * rH7 +
    -0.0158274027071249 * Ta1 * va9 +
    0.00170167068625823 * dTrTa2 * rH8 +
    0.00283124879915756 * dTrTa1 * va9 +
    -0.000290365909059354 * dTrTa1 * va1 * rH8 +
    -0.0131987351201934 * va10 +
    0.000543804208687463 * va1 * rH9;

  const UTCI_offset = UTCI_offset_normalized * 45.135 - 17.085;

  return Ta + UTCI_offset;
}

export function calculateSET(ta, tmrt, v10, rh) {
  // Gagge two-node model of human thermoregulation (Gagge, Fobelets and Berglund 1986), following the
  // JavaScript SET code published in Normative Appendix D of ASHRAE 55-2023 (pierceSET, CALCULATE_CE = false).
  // Validated directly against the standard's own 22-row reference table (Appendix D4), independently
  // re-derived line by line from the 2023 source text: MAE = 0.033 C, max |error| = 0.112 C.
  //
  // Three constants below differ from the 2013 Appendix G code (and from the R package comf, which still
  // targets 2013): cDil (200 vs 120), tempCoreNeutral (36.8 vs 36.49), and the heatTransferConvMet floor
  // on hCc for the actual (non-standard) environment, which 2013 explicitly removed and 2023 restored.
  // These three changed together as one coherent revision between editions; 2013's own Table G-1 (MAE
  // 0.020 C when reproduced with its own matching constants: bodyWeight 69.9, cDil 120, no hCc floor) was
  // checked independently and is not used here, since mixing constants across editions was found to
  // perform worse than either edition applied consistently (MAE 0.111 C in an earlier, mixed version of
  // this function).
  const met = state.humanParams.metabolicRate;
  const clo = state.humanParams.clothingInsulation;
  const posture = state.humanParams.posture || 'standing';
  const wme = 0; // external mechanical work, not modeled

  // Outdoor-specific pre-processing: EPW wind speed is measured at 10 m.
  // This reduction to a near-body reference height is a deliberate, documented  simplification for outdoor use, independent of the official model below.
  const airSpeed = Math.max(0.1, v10 * 0.67);

  const bodyWeight = 69.9; // kg, ASHRAE reference adult (Appendix D4, same value in 2013 and 2023)
  const metFactor = 58.2; // W/m² per met
  const sbc = 5.6697e-8; // Stefan-Boltzmann constant, W/(m²K⁴)
  const cSw = 170; // sweating driving coefficient
  const cDil = 200; // vasodilation driving coefficient, ASHRAE 55-2023 Appendix D value (2013 used 120, see header comment)
  const cStr = 0.5; // vasoconstriction driving coefficient
  const bodySurfaceArea = 1.8258; // m², DuBois standard adult
  const pressureInAtm = 1.0; // p_atm = 101325 Pa (sea level default)

  const tempSkinNeutral = 33.7;
  const tempCoreNeutral = 36.8;
  let alfa = 0.1; // fraction of body mass assigned to the skin compartment (adaptive)
  const tempBodyNeutral = alfa * tempSkinNeutral + (1 - alfa) * tempCoreNeutral;
  const skinBloodFlowNeutral = 6.3;

  let tSkin = tempSkinNeutral;
  let tCore = tempCoreNeutral;
  let mBl = skinBloodFlowNeutral;

  let eSkin = 0.1 * met;
  let qSensible = 0;
  let w = 0;

  const vaporPressure = (rh / 100) * Math.exp(18.6686 - 4030.183 / (ta + 235.0)); // torr

  const rClo = 0.155 * clo; // thermal resistance of clothing, °C·m²/W
  const fACl = 1.0 + 0.15 * clo; // clothed-surface area factor
  const lr = 2.2 / pressureInAtm; // Lewis ratio

  const rm = (met - wme) * metFactor;
  let m = met * metFactor; // mutates below via shivering feedback

  const iCl = clo > 0 ? 0.45 : 1.0; // vapor permeation efficiency of clothing
  let wMax = clo > 0 ? 0.59 * Math.pow(airSpeed, -0.08) : 0.38 * Math.pow(airSpeed, -0.29);

  // Metabolic floor on hCc (self-generated convection), ASHRAE 55-2023 Appendix D, applied whenever
  // CALCULATE_CE is false, i.e. for the ordinary SET calculation done here (not the cooling-effect path).
  // 2013's Appendix G removed this floor entirely; 2023 restored it. See header comment above.
  const heatTransferConvMet = met < 0.85 ? 3.0 : 5.66 * Math.pow(met - 0.85, 0.39);
  let hCc = 3.0 * Math.pow(pressureInAtm, 0.53);
  const hFc = 8.600001 * Math.pow(airSpeed * pressureInAtm, 0.53);
  hCc = Math.max(hCc, hFc);
  hCc = Math.max(hCc, heatTransferConvMet);

  let hR = 4.7; // initial guess, recomputed dynamically inside the loop below
  let hT = hR + hCc;
  let rA = 1.0 / (fACl * hT);
  let tOp = (hR * tmrt + hCc * ta) / hT;

  let tBody = alfa * tSkin + (1 - alfa) * tCore;

  // Respiration losses use the *initial* metabolic rate and are held constant
  // for the whole simulation (matches the official model exactly).
  const qRes = 0.0023 * m * (44.0 - vaporPressure);
  const cRes = 0.0014 * m * (34.0 - ta);

  let nSimulation = 1;
  while (nSimulation < 60) {
    nSimulation++;

    // Iteratively solve clothing surface temperature together with the
    // radiative heat transfer coefficient (Stefan-Boltzmann, posture-dependent).
    let tCl = (rA * tSkin + rClo * tOp) / (rA + rClo);
    let converged = false;
    let iterations = 0;
    while (!converged) {
      const radFactor = posture === 'seated' ? 0.7 : 0.73; // body/radiation area ratio
      hR = 4.0 * 0.95 * sbc * Math.pow((tCl + tmrt) / 2.0 + 273.15, 3.0) * radFactor;
      hT = hR + hCc;
      rA = 1.0 / (fACl * hT);
      tOp = (hR * tmrt + hCc * ta) / hT;
      const tClNew = (rA * tSkin + rClo * tOp) / (rA + rClo);
      if (Math.abs(tClNew - tCl) <= 0.01) converged = true;
      tCl = tClNew;
      iterations++;
      if (iterations > 150) break; // safety valve (official model raises an error here)
    }

    // Dry heat exchange as a series network: air-layer resistance (rA) + clothing (rClo)
    qSensible = (tSkin - tOp) / (rA + rClo);

    const hfCs = (tCore - tSkin) * (5.28 + 1.163 * mBl); // core↔skin heat transport
    const sCore = m - hfCs - qRes - cRes - wme;
    const sSkin = hfCs - qSensible - eSkin;
    const tcSk = 0.97 * alfa * bodyWeight; // thermal capacity, skin compartment
    const tcCr = 0.97 * (1 - alfa) * bodyWeight; // thermal capacity, core compartment
    const dTSk = (sSkin * bodySurfaceArea) / (tcSk * 60.0);
    const dTCr = (sCore * bodySurfaceArea) / (tcCr * 60.0);
    tSkin += dTSk;
    tCore += dTCr;
    tBody = alfa * tSkin + (1 - alfa) * tCore;

    const skSig = tSkin - tempSkinNeutral;
    const warmSk = skSig > 0 ? skSig : 0;
    const colds = -skSig > 0 ? -skSig : 0;
    const cRegSig = tCore - tempCoreNeutral;
    const cWarm = cRegSig > 0 ? cRegSig : 0;
    const cCold = -cRegSig > 0 ? -cRegSig : 0;
    const bdSig = tBody - tempBodyNeutral;
    const warmB = bdSig > 0 ? bdSig : 0;

    mBl = (skinBloodFlowNeutral + cDil * cWarm) / (1 + cStr * colds);
    mBl = Math.min(mBl, 90); // max_skin_blood_flow
    mBl = Math.max(mBl, 0.5); // official floor, prevents numerical skin freeze-out

    let mRsw = cSw * warmB * Math.exp(warmSk / 10.7);
    mRsw = Math.min(mRsw, 500); // max_sweating
    let eRsw = 0.68 * mRsw;

    const rEa = 1.0 / (lr * fACl * hCc); // evaporative resistance, air layer
    const rEcl = rClo / (lr * iCl); // evaporative resistance, clothing (permeation-scaled)

    let eMax = (Math.exp(18.6686 - 4030.183 / (tSkin + 235.0)) - vaporPressure) / (rEa + rEcl);
    if (eMax === 0) eMax = 0.001;

    let pRsw = eRsw / eMax;
    w = 0.06 + 0.94 * pRsw;
    let eDiff = w * eMax - eRsw;
    if (w > wMax) {
      w = wMax;
      pRsw = wMax / 0.94;
      eRsw = pRsw * eMax;
      eDiff = 0.06 * (1.0 - pRsw) * eMax;
    }
    if (eMax < 0) {
      eDiff = 0;
      eRsw = 0;
      w = wMax;
    }
    eSkin = eRsw + eDiff;

    const metShivering = 19.4 * colds * cCold;
    m = rm + metShivering; // feeds back into sCore on the next iteration

    alfa = 0.0417737 + 0.7451833 / (mBl + 0.585417); // adaptive skin-mass fraction
  }

  const qSkin = qSensible + eSkin;
  const pSsk = Math.exp(18.6686 - 4030.183 / (tSkin + 235.0));

  // "Standard environment" reference coefficients (used only for the SET solve)
  const hRs = hR;
  let hCs = 3.0 * Math.pow(pressureInAtm, 0.53);
  if (met > 0.85) {
    hCs = Math.max(hCs, 5.66 * Math.pow(met - 0.85, 0.39));
  }
  hCs = Math.max(hCs, 3.0);
  const hTs = hCs + hRs;
  const rCloS = 1.52 / (met - wme / metFactor + 0.6944) - 0.1835;
  const rClS = 0.155 * rCloS;
  const fAClS = 1.0 + 0.25 * rCloS; // k_clo = 0.25
  const fClS = 1.0 / (1.0 + 0.155 * fAClS * hTs * rCloS);
  const iMS = 0.45;
  const iClS = (iMS * hCs / hTs * (1 - fClS)) / (hCs / hTs - fClS * iMS);
  const rAS = 1.0 / (fAClS * hTs);
  const rEaS = 1.0 / (lr * fAClS * hCs);
  const rEclS = rClS / (lr * iClS);
  const hDS = 1.0 / (rAS + rClS);
  const hES = 1.0 / (rEaS + rEclS);

  // Secant-method solve for SET (matches the official model's root-finding exactly,
  const delta = 0.0001;
  let dx = 100.0;
  let setOld = Math.round((tSkin - qSkin / hDS) * 100) / 100;
  let set = setOld;
  while (Math.abs(dx) > 0.01) {
    const err1 = qSkin - hDS * (tSkin - setOld) - w * hES * (pSsk - 0.5 * Math.exp(18.6686 - 4030.183 / (setOld + 235.0)));
    const err2 = qSkin - hDS * (tSkin - (setOld + delta)) - w * hES * (pSsk - 0.5 * Math.exp(18.6686 - 4030.183 / (setOld + delta + 235.0)));
    set = setOld - (delta * err1) / (err2 - err1);
    dx = set - setOld;
    setOld = set;
  }

  return set;
}