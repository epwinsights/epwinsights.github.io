/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect } from 'vitest';
import BioclimaticStrategies from './bioclimatic-strategies.js';

describe('Bioclimatic Strategies', () => {
  it('should load strategy definitions', () => {
    const defs = BioclimaticStrategies.getStrategyDefinitions();
    expect(defs.comfort).toBeDefined();
    expect(defs.ventilation.color).toBe('#00BCD4');
  });

  it('should check if a point is inside a simple polygon', () => {
    const poly = [
      { t: 0, w: 0 },
      { t: 10, w: 0 },
      { t: 10, w: 10 },
      { t: 0, w: 10 }
    ];
    expect(BioclimaticStrategies.isPointInPolygon(5, 5, poly)).toBe(true);
    expect(BioclimaticStrategies.isPointInPolygon(15, 5, poly)).toBe(false);
  });

  it('should calculate comfort strategy percentage over test hourly data', () => {
    const mockData = [
      { dryBulbTemperature: 22, relativeHumidity: 50 },
      { dryBulbTemperature: 35, relativeHumidity: 80 }
    ];
    const pct = BioclimaticStrategies.calculatePercentage(mockData, 'comfort');
    expect(pct).toBeCloseTo(50, 1);
  });
});