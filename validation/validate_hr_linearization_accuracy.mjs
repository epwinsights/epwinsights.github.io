/**
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 *
 * Accuracy and convergence check for the linearized radiative heat transfer
 * coefficient (h_r) method used to solve the sol-air surface energy balance in
 * solveSteadyStateSurfaceTemperature() (core/sky-temperature.js). This is the same
 * method used for the exterior surface heat balance in EnergyPlus (Walton 1983,
 * Thermal Analysis Research Program Reference Manual, NBSSIR 83-2655; ASHRAE 1993
 * Handbook of Fundamentals; McClellan and Pedersen 1997, ASHRAE Transactions
 * 103(2):469-484).
 *
 * This script does not depend on any EPW data or on the platform's own iterative
 * solver as its reference. Instead, for each test condition it computes an
 * independent reference solution by bisection on the exact (unlinearized) residual
 * function
 *   R(T_surf) = T_surf - T_air - (alpha*I_total - eps*sigma*viewFactor*
 *               (T_surf^4 - T_sky^4)) / h_o
 * Bisection shares no formula or code with the h_r method, so it cannot reproduce a
 * systematic error the h_r method might have; it only relies on R being continuous
 * and changing sign across the bracket, which holds for every physically valid
 * input. The h_r-linearized solve is then compared against this independent
 * reference, not against an earlier/less precise run of itself.
 *
 * The grid spans conditions well beyond what real EPW files produce (dew-point
 * depression to 45 C, incident radiation to 1300 W/m2, wind down to 0 m/s) to stress
 * the method past the range this platform will ever actually see it operate in.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { solveSteadyStateSurfaceTemperature } from './core/sky-temperature.js';

const SIGMA = 5.67e-8;

function skyTempK(airC, dewC, irHoriz) {
  const airK = airC + 273.15;
  if (irHoriz && irHoriz > 0) return Math.pow(irHoriz / SIGMA, 0.25);
  const tDewK = dewC + 273.15;
  const eps = Math.min(1.0, 0.787 + 0.764 * Math.log(tDewK / 273));
  return airK * Math.pow(eps, 0.25);
}

function getHo(windSpeed, smooth = false) {
  const V = Math.max(windSpeed || 0, 0);
  let m, n, p;
  if (V < 4.88) { m = smooth ? 0.99 : 1.09; n = smooth ? 0.21 : 0.23; p = 1; }
  else { m = 0; n = smooth ? 0.50 : 0.53; p = 0.78; }
  const hc = 5.678 * (m + n * Math.pow(V / 0.3048, p));
  return Math.max(hc, 5.0);
}

// Independent reference solution via bisection on the exact (unlinearized) residual.
// Shares no formula with solveSteadyStateSurfaceTemperature(), so it cannot mask a
// shared systematic error.
function bisectionReference(airC, skyK, alpha, eps, iTotal, ho, viewFactor) {
  const airK = airC + 273.15;
  const R = (xK) => (xK - airK) - (alpha * iTotal - eps * SIGMA * viewFactor * (Math.pow(xK, 4) - Math.pow(skyK, 4))) / ho;
  let lo = Math.min(airK, skyK) - 200;
  let hi = Math.max(airK, skyK) + 300;
  let Rlo = R(lo), Rhi = R(hi);
  if (Rlo * Rhi > 0) { lo -= 500; hi += 500; Rlo = R(lo); Rhi = R(hi); }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const Rmid = R(mid);
    if (Rlo * Rmid <= 0) { hi = mid; } else { lo = mid; Rlo = Rmid; }
    if (hi - lo < 1e-9) break;
  }
  return (lo + hi) / 2 - 273.15;
}

const airCs = [-15, 0, 15, 32, 45, 50];
const dewOffsets = [-30, -15, -5, 2];
const windSpeeds = [0, 0.5, 1, 2, 5, 10, 15];
const alphas = [0.15, 0.35, 0.65, 0.85, 0.97];
const epss = [0.85, 0.90, 0.95, 0.98];
const iTotals = [0, 200, 500, 800, 1100, 1300];
const svfs = [0.2, 0.6, 1.0];

const results = [];
for (const airC of airCs) {
  for (const dOff of dewOffsets) {
    const dewC = airC + dOff;
    for (const ws of windSpeeds) {
      for (const alpha of alphas) {
        for (const eps of epss) {
          for (const iTotal of iTotals) {
            for (const svf of svfs) {
              const skyK = skyTempK(airC, dewC, 0);
              const ho = getHo(ws, false);

              let iterCount = 0;
              const originalWarn = console.warn;
              console.warn = () => { iterCount = -1; }; // flag non-convergence without printing 60k+ warnings
              const hrVal = solveSteadyStateSurfaceTemperature(airC, skyK, alpha, eps, iTotal, ho, svf);
              console.warn = originalWarn;

              const truth = bisectionReference(airC, skyK, alpha, eps, iTotal, ho, svf);
              const err = Math.abs(hrVal - truth);
              results.push({ airC, dewC, ws, alpha, eps, iTotal, svf, ho, hrVal, truth, err, nonConverged: iterCount === -1 });
            }
          }
        }
      }
    }
  }
}

console.log(`Total scenarios tested: ${results.length}`);

const errs = results.map(r => r.err);
const maxErr = Math.max(...errs);
const meanErr = errs.reduce((a, b) => a + b, 0) / errs.length;
const nNonConverged = results.filter(r => r.nonConverged).length;
const nOver001 = results.filter(r => r.err > 0.001).length;
const nOver01 = results.filter(r => r.err > 0.01).length;

console.log(`Max error vs independent bisection reference: ${maxErr.toFixed(6)} C`);
console.log(`Mean error: ${meanErr.toFixed(6)} C`);
console.log(`Scenarios that did NOT converge within 50 iterations: ${nNonConverged}`);
console.log(`Scenarios with error > 0.001 C: ${nOver001}`);
console.log(`Scenarios with error > 0.01 C: ${nOver01}`);

// Summary table by wind-speed band and surface darkness
function band(ws) {
  if (ws <= 1) return 'Calm (<=1 m/s)';
  if (ws <= 5) return 'Moderate (1-5 m/s)';
  return 'Windy (>5 m/s)';
}
function darkness(alpha) {
  if (alpha <= 0.35) return 'Light (alpha<=0.35)';
  if (alpha <= 0.65) return 'Medium (0.35<alpha<=0.65)';
  return 'Dark (alpha>0.65)';
}

const summary = {};
for (const r of results) {
  const key = `${band(r.ws)}|${darkness(r.alpha)}`;
  if (!summary[key]) summary[key] = { n: 0, maxErr: 0, sumErr: 0 };
  summary[key].n++;
  summary[key].sumErr += r.err;
  summary[key].maxErr = Math.max(summary[key].maxErr, r.err);
}

console.log('\nSummary by wind band and surface darkness (appendix-ready):');
console.log('Wind band'.padEnd(22), 'Surface'.padEnd(28), 'n'.padStart(7), 'meanErr(C)'.padStart(12), 'maxErr(C)'.padStart(12));
const outLines = ['wind_band,surface_darkness,n,mean_error_C,max_error_C'];
for (const [key, s] of Object.entries(summary)) {
  const [b, d] = key.split('|');
  const meanE = s.sumErr / s.n;
  console.log(b.padEnd(22), d.padEnd(28), String(s.n).padStart(7), meanE.toFixed(6).padStart(12), s.maxErr.toFixed(6).padStart(12));
  outLines.push([b, d, s.n, meanE.toFixed(6), s.maxErr.toFixed(6)].join(','));
}

mkdirSync('./results', { recursive: true });
writeFileSync('./results/epwinsights_hr_linearization_accuracy.csv', outLines.join('\n'));
console.log('\nSummary written to results/epwinsights_hr_linearization_accuracy.csv');

// Worst 10 individual cases for supplementary material.
results.sort((a, b) => b.err - a.err);
console.log('\nWorst 10 individual cases:');
const worstLines = ['airC,dewC,windSpeed,alpha,eps,iTotal,svf,ho,hr_value_C,bisection_reference_C,error_C'];
for (const r of results.slice(0, 10)) {
  console.log(`  airC=${r.airC} dewC=${r.dewC} wind=${r.ws} alpha=${r.alpha} eps=${r.eps} I=${r.iTotal} svf=${r.svf} | ho=${r.ho.toFixed(2)} | h_r=${r.hrVal.toFixed(4)} truth=${r.truth.toFixed(4)} err=${r.err.toFixed(6)}`);
  worstLines.push([r.airC, r.dewC, r.ws, r.alpha, r.eps, r.iTotal, r.svf, r.ho.toFixed(2), r.hrVal.toFixed(4), r.truth.toFixed(4), r.err.toFixed(6)].join(','));
}
writeFileSync('./results/epwinsights_hr_linearization_worst_cases.csv', worstLines.join('\n'));
console.log('\nWorst-case detail written to results/epwinsights_hr_linearization_worst_cases.csv');
