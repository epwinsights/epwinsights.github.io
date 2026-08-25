/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import SunCalc from './suncalc.js';

export function getActiveMonths(filters, latitude = 0) {
  const { monthPreset, customStartMonth, customEndMonth } = filters;
  
  if (monthPreset === 'all') {
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }
  
  if (monthPreset === 'custom') {
    const start = parseInt(customStartMonth) || 1;
    const end = parseInt(customEndMonth) || 12;
    const months = [];
    if (start <= end) {
      for (let m = start; m <= end; m++) months.push(m);
    } else {
      for (let m = start; m <= 12; m++) months.push(m);
      for (let m = 1; m <= end; m++) months.push(m);
    }
    return months;
  }

  const isNorthern = latitude >= 0;
  if (monthPreset === 'summer') {
    return isNorthern ? [6, 7, 8] : [12, 1, 2];
  }
  if (monthPreset === 'winter') {
    return isNorthern ? [12, 1, 2] : [6, 7, 8];
  }
  if (monthPreset === 'transition') {
    return [3, 4, 5, 9, 10, 11];
  }
  
  return Array.from({ length: 12 }, (_, i) => i + 1);
}

export function buildUnifiedChartTitleSuffix(filters, latitude = 0) {
  const { monthPreset, timePreset, customStart, customEnd, customStartMonth, customEndMonth } = filters;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  let monthLabel = "Annual";
  if (monthPreset === 'summer') monthLabel = latitude >= 0 ? "Jun-Aug" : "Dec-Feb";
  if (monthPreset === 'winter') monthLabel = latitude >= 0 ? "Dec-Feb" : "Jun-Aug";
  if (monthPreset === 'transition') monthLabel = "Mar-May, Sep-Nov";
  if (monthPreset === 'custom') {
    const startIdx = (parseInt(customStartMonth) || 1) - 1;
    const endIdx = (parseInt(customEndMonth) || 12) - 1;
    monthLabel = `${monthNames[startIdx]}-${monthNames[endIdx]}`;
  }

  let timeLabel = "24/7";
  if (timePreset === 'daylight') timeLabel = "Daylight";
  if (timePreset === 'active') timeLabel = "08:00-20:00";
  if (timePreset === 'custom') {
    const pad = num => String(num).padStart(2, '0');
    timeLabel = `${pad(customStart)}:00-${pad(customEnd)}:00`;
  }

  return ` (${monthLabel}, ${timeLabel})`;
}

export function filterUnifiedHourlyData(data, filters, metadata) {
  const latitude = metadata.latitude || 0;
  const longitude = metadata.longitude || 0;
  const activeMonths = getActiveMonths(filters, latitude);

  return data.filter(d => {
    if (!activeMonths.includes(d.month)) return false;

    if (filters.timePreset === 'daylight') {
      if (!d.datetime) return false;
      const times = SunCalc.getTimes(d.datetime, latitude, longitude);
      return d.datetime >= times.sunrise && d.datetime <= times.sunset;
    }
    if (filters.timePreset === 'active') {
      return d.hour >= 8 && d.hour <= 20;
    }
    if (filters.timePreset === 'custom') {
      const start = filters.customStart;
      const end = filters.customEnd;
      if (start <= end) {
        return d.hour >= start && d.hour <= end;
      } else {
        return d.hour >= start || d.hour <= end;
      }
    }
    return true;
  });
}

export function renderUnifiedFilterControls(containerSelector, filters, onUpdateCallback, options = {}) {
  const { asSubsection = false, sectionTitle = 'Occupancy & Seasonal Filters' } = options;
  const container = d3.select(containerSelector).html('');
  const group = asSubsection
    ? container.append('div').attr('class', 'control-item mb-3')
    : container.append('div').attr('class', 'chart-controls-group');

  if (asSubsection) {
    group.append('div')
      .style('font-size', '0.875rem')
      .style('font-weight', '700')
      .style('color', '#212529')
      .style('margin-bottom', '0.6rem')
      .text(sectionTitle);
  } else {
    group.append('h6').text(sectionTitle);
  }

  group.append('label').text('Season Type:');
  const monthSelect = group.append('select')
    .attr('class', 'form-select form-select-sm mb-2')
    .on('change', function() {
      filters.monthPreset = this.value;
      customMonthWrapper.style('display', this.value === 'custom' ? 'block' : 'none');
      onUpdateCallback();
    });

  monthSelect.append('option').attr('value', 'all').property('selected', filters.monthPreset === 'all').text('Annual (All Months)');
  monthSelect.append('option').attr('value', 'summer').property('selected', filters.monthPreset === 'summer').text('Summer');
  monthSelect.append('option').attr('value', 'winter').property('selected', filters.monthPreset === 'winter').text('Winter');
  monthSelect.append('option').attr('value', 'transition').property('selected', filters.monthPreset === 'transition').text('Transition Months');
  monthSelect.append('option').attr('value', 'custom').property('selected', filters.monthPreset === 'custom').text('Custom Months...');

  const customMonthWrapper = group.append('div')
    .attr('class', 'mb-2')
    .style('display', filters.monthPreset === 'custom' ? 'block' : 'none');

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  customMonthWrapper.append('label').text('Start Month:').style('font-size', '11px');
  const startMonthSelect = customMonthWrapper.append('select')
    .attr('class', 'form-select form-select-sm mb-1')
    .on('change', function() {
      filters.customStartMonth = parseInt(this.value);
      onUpdateCallback();
    });
  monthNames.forEach((m, idx) => {
    startMonthSelect.append('option').attr('value', idx + 1).property('selected', filters.customStartMonth === (idx + 1)).text(m);
  });

  customMonthWrapper.append('label').text('End Month:').style('font-size', '11px');
  const endMonthSelect = customMonthWrapper.append('select')
    .attr('class', 'form-select form-select-sm')
    .on('change', function() {
      filters.customEndMonth = parseInt(this.value);
      onUpdateCallback();
    });
  monthNames.forEach((m, idx) => {
    endMonthSelect.append('option').attr('value', idx + 1).property('selected', filters.customEndMonth === (idx + 1)).text(m);
  });

  group.append('label').text('Daily Hours:').attr('class', 'mt-2');
  const timeSelect = group.append('select')
    .attr('class', 'form-select form-select-sm mb-2')
    .on('change', function() {
      filters.timePreset = this.value;
      customHoursWrapper.style('display', this.value === 'custom' ? 'block' : 'none');
      onUpdateCallback();
    });

  timeSelect.append('option').attr('value', 'all').property('selected', filters.timePreset === 'all').text('24 Hours (Full Day)');
  timeSelect.append('option').attr('value', 'daylight').property('selected', filters.timePreset === 'daylight').text('Daylight Hours Only');
  timeSelect.append('option').attr('value', 'active').property('selected', filters.timePreset === 'active').text('Occupancy Hours (08:00 - 20:00)');
  timeSelect.append('option').attr('value', 'custom').property('selected', filters.timePreset === 'custom').text('Custom Hours...');

  const customHoursWrapper = group.append('div')
    .attr('class', 'row g-1 mb-2')
    .style('display', filters.timePreset === 'custom' ? 'block' : 'none');

  const colStart = customHoursWrapper.append('div').attr('class', 'col-6');
  colStart.append('label').text('Start Hour:').style('font-size', '11px');
  const startHourSelect = colStart.append('select')
    .attr('class', 'form-select form-select-sm')
    .on('change', function() {
      filters.customStart = parseInt(this.value);
      onUpdateCallback();
    });
  for (let h = 0; h < 24; h++) {
    startHourSelect.append('option').attr('value', h).property('selected', filters.customStart === h).text(`${String(h).padStart(2, '0')}:00`);
  }

  const colEnd = customHoursWrapper.append('div').attr('class', 'col-6');
  colEnd.append('label').text('End Hour:').style('font-size', '11px');
  const endHourSelect = colEnd.append('select')
    .attr('class', 'form-select form-select-sm')
    .on('change', function() {
      filters.customEnd = parseInt(this.value);
      onUpdateCallback();
    });
  for (let h = 0; h < 24; h++) {
    endHourSelect.append('option').attr('value', h).property('selected', filters.customEnd === h).text(`${String(h).padStart(2, '0')}:00`);
  }
}