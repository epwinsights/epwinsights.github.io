/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

// Standard sea-level atmospheric pressure (Pa). Used only as the default
// fallback when no station-specific pressure is supplied by the caller.
const P_atm = 101325;

export const PsychroLib = {
  // ASHRAE Handbook of Fundamentals 2017, Ch.1, Eq.3: standard atmospheric
  // pressure as a function of station elevation above sea level (meters).
  getStandardAtmPressure(altitude) {
    if (altitude === undefined || altitude === null || isNaN(altitude)) return P_atm;
    return 101325 * Math.pow(1 - 2.25577e-5 * altitude, 5.2559);
  },

  getSatVaporPressure(T) {
    const T_k = T + 273.15;
    if (T < 0) {
      const C1 = -5.6745359e3, C2 = 6.3925247, C3 = -9.677843e-3, C4 = 6.2215701e-7, C5 = 2.0747825e-9, C6 = -9.484024e-13, C7 = 4.1635019;
      return Math.exp(C1 / T_k + C2 + T_k * (C3 + T_k * (C4 + T_k * C5)) + C7 * Math.log(T_k));
    } else {
      const C1 = -5.8002206e3, C2 = 1.3914993, C3 = -4.8640239e-2, C4 = 4.1764768e-5, C5 = -1.4452093e-8, C6 = 6.5459673;
      return Math.exp(C1 / T_k + C2 + T_k * (C3 + T_k * (C4 + T_k * C5)) + C6 * Math.log(T_k));
    }
  },

  getVaporPressureFromW(W, pressure = P_atm) {
    return (W * pressure) / (0.621945 + W);
  },

  getHumidityRatio(T_db, RH_percent, pressure = P_atm) {
    const P_w = this.getSatVaporPressure(T_db) * (RH_percent / 100);
    return 0.621945 * (P_w / (pressure - P_w));
  },

  getRelHumidity(T_db, W, pressure = P_atm) {
    const P_w = this.getVaporPressureFromW(W, pressure);
    const P_ws = this.getSatVaporPressure(T_db);
    return Math.min(100.0, (P_w / P_ws) * 100);
  },

  getDewPoint(W, pressure = P_atm) {
    const pw = this.getVaporPressureFromW(W, pressure);
    if (pw < 611.2) return NaN;
    const alpha = Math.log(pw / 611.2);
    return (243.5 * alpha) / (17.67 - alpha);
  },

  getEnthalpy(T_db, W) {
    return (1.006 * T_db) + (W * (2501 + 1.86 * T_db));
  },

  getTdbFromEnthalpyAndW(h, W) {
    return (h - 2501 * W) / (1.006 + 1.86 * W);
  },

  getWetBulb(T_db, W, pressure = P_atm) {
    const targetEnthalpy = this.getEnthalpy(T_db, W);
    let low = -50, high = T_db;
    for (let i = 0; i < 30; i++) {
      let mid = (low + high) / 2;
      let w_sat_mid = this.getHumidityRatio(mid, 100, pressure);
      let h_sat_mid = this.getEnthalpy(mid, w_sat_mid);
      if (h_sat_mid < targetEnthalpy) low = mid;
      else high = mid;
    }
    return high;
  },

  getPMV(ta, tr, vel, rh, met, clo, wme = 0) {
    const pa = this.getSatVaporPressure(ta) * rh / 100;
    const icl = 0.155 * clo;
    const m = met * 58.15;
    const w = wme * 58.15;
    const mw = m - w;
    let fcl = icl < 0.078 ? 1.0 + 1.29 * icl : 1.05 + 0.645 * icl;
    const hcf = 12.1 * Math.sqrt(vel);
    const taa = ta + 273.15;
    const tra = tr + 273.15;

    let tcl = ta;
    for (let i = 0; i < 15; i++) {
      const hc = Math.max(hcf, 2.38 * Math.pow(Math.abs(tcl - ta), 0.25));
      const tcla_iter = tcl + 273.15;
      const tcl_new = 35.7 - 0.028 * mw - icl * (
        3.96e-8 * fcl * (Math.pow(tcla_iter, 4) - Math.pow(tra, 4)) +
        fcl * hc * (tcl - ta)
      );
      if (Math.abs(tcl_new - tcl) < 0.01) {
        tcl = tcl_new;
        break;
      }
      tcl = (tcl + tcl_new) / 2;
    }

    const tcla = tcl + 273.15;
    const L = 0.303 * Math.exp(-0.036 * m) + 0.028;
    const C = fcl * Math.max(hcf, 2.38 * Math.pow(Math.abs(tcl - ta), 0.25)) * (tcl - ta);
    const R = 3.96 * fcl * (Math.pow(tcla / 100, 4) - Math.pow(tra / 100, 4));
    const Edif = 3.05e-3 * (5733 - 6.99 * mw - pa);
    const Eres = 1.7e-5 * m * (5867 - pa);
    const Cres = 0.0014 * m * (34 - ta);
    const Esw = mw > 58.15 ? 0.42 * (mw - 58.15) : 0;

    return L * (mw - Edif - Esw - Eres - Cres - R - C);
  }
};

export default PsychroLib;