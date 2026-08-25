/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import PsychroLib from './psychrolib.js';

export const BioclimaticStrategies = {
  getStrategyDefinitions() {
    return {
      comfort: {
        id: 'comfort',
        name: 'Comfort Zone (ASHRAE 55)',
        color: '#4CAF50',
        points: [
          { t: 20.0, rh: 80 }, { t: 24.0, rh: 80 },
          { t: 25.0, rh: 50 }, { t: 23.5, rh: 20 },
          { t: 20.0, rh: 20 }
        ]
      },
      ventilation: {
        id: 'ventilation',
        name: 'Natural Ventilation',
        color: '#00BCD4',
        points: [
          { t: 24.0, rh: 90 }, { t: 29.3, rh: 85 },
          { t: 28.5, rh: 50 }, { t: 26.0, rh: 20 },
          { t: 23.5, rh: 20 }, { t: 25.0, rh: 50 },
          { t: 24.0, rh: 80 }
        ]
      },
      evaporative: {
        id: 'evaporative',
        name: 'Evaporative Cooling',
        color: '#FF9800',
        points: [
          { t: 26.0, rh: 20 }, { t: 28.5, rh: 50 },
          { t: 40.0, rh: 30 }, { t: 44.0, rh: 15 },
          { t: 44.0, rh: 5 }, { t: 26.0, rh: 5 }
        ]
      },
      thermalMass: {
        id: 'thermalMass',
        name: 'High Thermal Mass',
        color: '#9C27B0',
        points: [
          { t: 25.0, rh: 50 }, { t: 34.0, rh: 45 },
          { t: 32.0, rh: 20 }, { t: 26.0, rh: 20 }
        ]
      },
      nightVentilation: {
        id: 'nightVentilation',
        name: 'Thermal Mass + Night Ventilation',
        color: '#3F51B5',
        points: [
          { t: 28.5, rh: 50 }, { t: 38.0, rh: 40 },
          { t: 36.0, rh: 15 }, { t: 32.0, rh: 20 },
          { t: 34.0, rh: 45 }
        ]
      },
      passiveSolar: {
        id: 'passiveSolar',
        name: 'Passive Solar Heating',
        color: '#E91E63',
        points: [
          { t: 10.0, rh: 85 }, { t: 20.0, rh: 80 },
          { t: 20.0, rh: 20 }, { t: 10.0, rh: 20 }
        ]
      },
      activeHeating: {
        id: 'activeHeating',
        name: 'Active Heating',
        color: '#FF5722',
        points: [
          { t: -10.0, rh: 95 }, { t: 10.0, rh: 85 },
          { t: 10.0, rh: 20 }, { t: -10.0, rh: 20 }
        ]
      },
      activeCooling: {
        id: 'activeCooling',
        name: 'Active Cooling',
        color: '#795548',
        points: [
          { t: 29.3, rh: 100 }, { t: 46.0, rh: 100 },
          { t: 46.0, rh: 30 }, { t: 40.0, rh: 30 },
          { t: 28.5, rh: 50 }, { t: 29.3, rh: 85 }
        ]
      }
    };
  },

  getStrategyPointsInW(strategyId, pressure = 101325, meanTempOffset = 0) {
    const defs = this.getStrategyDefinitions();
    const strategyDef = defs[strategyId];
    if (!strategyDef) return [];

    const interpolatedPoints = this.interpolatePoints(strategyDef.points);

    return interpolatedPoints.map(p => {
      const shiftedT = p.t + meanTempOffset;
      let w = p.w;

      if (w === undefined) {
        try {
          w = PsychroLib.getHumidityRatio(shiftedT, p.rh, pressure);
        } catch (e) {
          w = 0;
        }
      }
      return { t: shiftedT, w: w };
    });
  },

  interpolatePoints(points) {
    const interpolated = [];
    const T_STEP = 0.1;
    const RH_STEP = 0.2;

    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];

      interpolated.push(p1);

      const tDiff = p2.t - p1.t;
      const rhDiff = p2.rh - p1.rh;

      const stepsT = Math.abs(tDiff) / T_STEP;
      const stepsRH = Math.abs(rhDiff) / RH_STEP;
      const steps = Math.floor(Math.max(stepsT, stepsRH));

      if (steps > 1) {
        for (let j = 1; j < steps; j++) {
          const fraction = j / steps;
          interpolated.push({
            t: p1.t + (tDiff * fraction),
            rh: p1.rh + (rhDiff * fraction)
          });
        }
      }
    }
    return interpolated;
  },

  isPointInPolygon(t, w, polygonPoints) {
    let inside = false;
    for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
      const xi = polygonPoints[i].t, yi = polygonPoints[i].w;
      const xj = polygonPoints[j].t, yj = polygonPoints[j].w;

      const intersect = ((yi > w) !== (yj > w))
        && (t < (xj - xi) * (w - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  },

  calculateMatchStats(actualData, strategyId, pressure = 101325, meanTempOffset = 0) {
    const polyPoints = this.getStrategyPointsInW(strategyId, pressure, meanTempOffset);
    if (polyPoints.length === 0 || !actualData || !Array.isArray(actualData)) {
      return { count: 0, total: 0, percentage: 0 };
    }

    let totalHours = 0;
    let matchingHours = 0;

    actualData.forEach(d => {
      if (d.dryBulbTemperature === undefined || d.relativeHumidity === undefined) return;
      totalHours++;
      const t = d.dryBulbTemperature;
      const rh = d.relativeHumidity;

      let w = d.humidityRatio;
      if (w === undefined) {
        try {
          w = PsychroLib.getHumidityRatio(t, rh, pressure);
        } catch (e) {
          w = 0;
        }
      }

      if (this.isPointInPolygon(t, w, polyPoints)) {
        matchingHours++;
      }
    });

    return {
      count: matchingHours,
      total: totalHours,
      percentage: totalHours > 0 ? (matchingHours / totalHours) * 100 : 0
    };
  },

  calculatePercentage(actualData, strategyId, pressure = 101325, meanTempOffset = 0) {
    return this.calculateMatchStats(actualData, strategyId, pressure, meanTempOffset).percentage;
  }
};

export default BioclimaticStrategies;