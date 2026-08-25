/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

const SIGMA = 5.67e-8;

// Estimates the effective sky temperature (K) used by longwave radiation exchange
// calculations throughout the platform (outdoor MRT, material surface temperature).
//
// Preferred source: direct Stefan-Boltzmann inversion of the EPW file's own measured
// horizontal infrared radiation intensity, when available and non-zero.
//
// Fallback (Clark and Allen, 1978): a clear-sky emissivity correlation from dew-point
// temperature, applied when horizontal IR is missing or zero. Clamped to an emissivity
// of 1.0 as a numerical safeguard, since the correlation can exceed unity at very high
// dew points.
//
// This function is the single shared sky-temperature model for the project; both
// outdoor-comfort.js (pedestrian MRT) and material-physics.js (building/ground surface
// temperature) call it, so the two modules never diverge on this assumption.
export function getEffectiveSkyTemperatureK(dryBulbC, dewPointC, horizontalInfraredRadiationIntensity) {
  const tAirK = dryBulbC + 273.15;

  const irHoriz = horizontalInfraredRadiationIntensity;
  if (irHoriz && irHoriz > 0) {
    return Math.pow(irHoriz / SIGMA, 0.25);
  }

  const tDewK = dewPointC + 273.15;
  const epsSkyClear = Math.min(1.0, 0.787 + 0.764 * Math.log(tDewK / 273));
  return tAirK * Math.pow(epsSkyClear, 0.25);
}

// Steady-state sol-air surface temperature, solved with the linearized radiative
// heat transfer coefficient (h_r) method rather than either of the two approaches
// this project used previously (a closed-form linearization that evaluated longwave
// loss at T_air, and a fixed 5-iteration undamped fixed-point substitution).
//
// The underlying energy balance (ASHRAE Fundamentals sol-air method) is:
//   T_surf = T_air + (alpha * I_total - q_lw) / h_o
//   q_lw = eps * sigma * viewFactor * (T_surf,K^4 - T_sky,K^4)
// T_surf appears on both sides, so a closed-form solution requires either an
// iterative/numerical solve or a simplifying approximation.
//
// This project's original code evaluated q_lw at T_air,K instead of T_surf,K to avoid
// the circularity, accurate only when T_surf stays close to T_air; the platform's own
// 14-city plausibility check (Table A.2) shows midday ground-air differences of up to
// ~19 C, where that approximation systematically understates q_lw and so overstates
// T_surf. A later revision replaced it with a plain, fixed 5-iteration fixed-point
// loop; that fixed the systematic bias in typical conditions but was itself found
// (validate_fixedpoint_convergence.mjs, real 14-city peak-GHI data) to under-converge
// by up to ~2.7 C in low-wind, high-radiation, dark-surface conditions (e.g. Phoenix),
// since 5 iterations is not always enough when the wind-floored convective coefficient
// (h_o >= 5.0 W/m2K, see getExternalConvectionCoefficient) is low relative to the
// radiative feedback.
//
// The method here is the one used for the exterior surface heat balance in EnergyPlus
// (Walton 1983, Thermal Analysis Research Program Reference Manual, NBSSIR 83-2655;
// ASHRAE 1993 Handbook of Fundamentals; McClellan and Pedersen 1997, ASHRAE
// Transactions 103(2):469-484; see EnergyPlus Engineering Reference, "Outside Surface
// Heat Balance"). The quartic loss term is rewritten with the exact algebraic identity
//   T_surf,K^4 - T_sky,K^4 = (T_surf,K - T_sky,K)(T_surf,K + T_sky,K)(T_surf,K^2 + T_sky,K^2)
// so q_lw = h_r * (T_surf,K - T_sky,K), with
//   h_r = eps * sigma * viewFactor * (T_surf,K + T_sky,K) * (T_surf,K^2 + T_sky,K^2)
// This is not an approximation; it is an exact restatement of the same physics, valid
// for any T_surf and T_sky. The only unknown left inside h_r is T_surf,K itself, so the
// energy balance is solved by computing h_r from the current T_surf estimate, solving
// the now-linear balance for a new T_surf, recomputing h_r, and repeating. Because h_r
// is a smooth, weakly-varying function of T_surf near the true solution (it enters only
// through the coefficient, not through the residual directly, unlike the earlier plain
// fixed-point loop), this converges in a handful of iterations across the full range of
// conditions the platform produces: an independent 60,480-scenario stress test (air
// temperature -15 to 50 C, dew-point depression up to 45 C, wind 0 to 15 m/s, alpha
// 0.15 to 0.97, eps 0.85 to 0.98, incident radiation 0 to 1300 W/m2, sky view factor
// 0.2 to 1.0), checked against an independent bisection solve of the exact residual,
// found a maximum of 12 iterations to reach the 0.001 C tolerance below, and a maximum
// error of 0.000234 C against the bisection reference (see
// validate_hr_linearization_accuracy.mjs for the full grid and per-condition summary).
// A hard maxIterations cap is kept as a safety net for any input this analysis did not
// anticipate; if it is ever hit, a console warning is emitted so the condition is
// visible rather than silently wrong.
export function solveSteadyStateSurfaceTemperature(
  airC,
  skyK,
  alpha,
  eps,
  iTotal,
  ho,
  viewFactor,
  { tolerance = 0.001, maxIterations = 50 } = {}
) {
  const airK = airC + 273.15;
  let surfK = airK;
  let converged = false;

  for (let i = 0; i < maxIterations; i++) {
    const hr = eps * SIGMA * viewFactor * (surfK + skyK) * (surfK * surfK + skyK * skyK);
    const newSurfK = (ho * airK + alpha * iTotal + hr * skyK) / (ho + hr);
    const step = newSurfK - surfK;
    surfK = newSurfK;

    if (Math.abs(step) < tolerance) {
      converged = true;
      break;
    }
  }

  if (!converged) {
    console.warn(
      `[sky-temperature] solveSteadyStateSurfaceTemperature did not converge within ${maxIterations} iterations ` +
      `(airC=${airC}, ho=${ho}, alpha=${alpha}, eps=${eps}, iTotal=${iTotal}). Returning the last estimate.`
    );
  }

  return surfK - 273.15;
}
