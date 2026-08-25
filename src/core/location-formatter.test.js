/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { toTitleCase, formatStationDetail, formatLocationName, formatSimpleLocation, formatCityNameOnly } from './location-formatter';
import state from '../state.js';

describe('Location Formatter', () => {
  beforeEach(() => {
    state.customLocationNames = {
      primary: { city: null, station: null },
      comparison: { city: null, station: null }
    };
  });

  it('toTitleCase should format strings to Title Case', () => {
    expect(toTitleCase('tehran international ap')).toBe('Tehran International Ap');
  });

  it('formatStationDetail should parse station suffixes accurately', () => {
    expect(formatStationDetail('Tehran-Intl.AP')).toBe('International Airport');
    expect(formatStationDetail('London_Wea_Ctr')).toBe('Weather Center');
  });

  it('formatLocationName should format full titles', () => {
    expect(formatLocationName('Tehran-Intl.AP', 'IRN')).toBe('Tehran (International Airport) │ Iran');
  });

  it('formatLocationName should support custom override', () => {
    state.customLocationNames.primary.city = 'MyCity';
    state.customLocationNames.primary.station = 'MyStation';
    expect(formatLocationName('Tehran-Intl.AP', 'IRN', 'primary')).toBe('MyCity (MyStation) │ Iran');
  });

  it('formatSimpleLocation should extract main city and country', () => {
    expect(formatSimpleLocation('Tehran-Intl.AP', 'IRN')).toBe('Tehran (Iran)');
  });

  it('formatCityNameOnly should extract only the city name', () => {
    expect(formatCityNameOnly('Tehran-Intl.AP')).toBe('Tehran');
  });
});