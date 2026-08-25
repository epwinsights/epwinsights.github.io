/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import state from '../state.js';

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DEFAULT_MONTHLY_STATE = { startMonth: 1, endMonth: 12, includeAnnual: true };
const DEFAULT_DAILY_STATE = { startMonth: 1, startDay: 1, endMonth: 12, endDay: 31 };
const DEFAULT_HOURLY_STATE = { startMonth: 1, startDay: 1, startHour: 0, endMonth: 12, endDay: 31, endHour: 23 };

function debounce(fn, delayMs) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

function getReferenceYear(epwData) {
  const observed = epwData && epwData.metadata && epwData.metadata.holidays
    ? epwData.metadata.holidays.leapYearObserved
    : null;
  const isLeap = typeof observed === 'string' && observed.trim().toLowerCase() === 'yes';
  return isLeap ? 2000 : 2001;
}

export function renderDataTables(epwData) {
  renderDataTablesControls('.tab-pane.active .left-panel', epwData);
}

function renderDataTablesControls(panelSelector, epwData) {
  const hourlyData = epwData.data;
  const referenceYear = getReferenceYear(epwData);
  const panel = d3.select(panelSelector).html('');
  const tabPaneNode = panel.node() ? panel.node().closest('.tab-pane') : null;
  const tabPaneId = tabPaneNode ? tabPaneNode.id : null;

  const saved = state.dataTablesState;
  const savedColumns = saved && Array.isArray(saved.selectedColumns) ? new Set(saved.selectedColumns) : null;
  const monthlyDefaults = (saved && saved.monthly) || DEFAULT_MONTHLY_STATE;
  const dailyDefaults = (saved && saved.daily) || DEFAULT_DAILY_STATE;
  const hourlyDefaults = (saved && saved.hourly) || DEFAULT_HOURLY_STATE;

  function persistDataTablesState() {
    state.dataTablesState = {
      selectedColumns: Array.from(getSelectedColumns()),
      monthly: {
        startMonth: +d3.select('#monthly-start-month').property('value'),
        endMonth: +d3.select('#monthly-end-month').property('value'),
        includeAnnual: d3.select('#monthly-annual-check').property('checked')
      },
      daily: {
        startMonth: +d3.select('#start-daily-month-slider').property('value'),
        startDay: +d3.select('#start-daily-day-slider').property('value'),
        endMonth: +d3.select('#end-daily-month-slider').property('value'),
        endDay: +d3.select('#end-daily-day-slider').property('value')
      },
      hourly: {
        startMonth: +d3.select('#start-hourly-month-slider').property('value'),
        startDay: +d3.select('#start-hourly-day-slider').property('value'),
        startHour: +d3.select('#start-hourly-hour-slider').property('value'),
        endMonth: +d3.select('#end-hourly-month-slider').property('value'),
        endDay: +d3.select('#end-hourly-day-slider').property('value'),
        endHour: +d3.select('#end-hourly-hour-slider').property('value')
      }
    };
  }

  function validateAndSyncControls() {
    const monthlyStartMonth = +d3.select('#monthly-start-month').property('value');
    const monthlyEndMonth = +d3.select('#monthly-end-month').property('value');
    if (monthlyEndMonth < monthlyStartMonth) {
      d3.select('#monthly-end-month').property('value', monthlyStartMonth);
      d3.select('#monthly-end-month-value').text(MONTH_NAMES[monthlyStartMonth - 1]);
    }

    const dailyStartMonth = +d3.select('#start-daily-month-slider').property('value');
    const dailyStartDay = +d3.select('#start-daily-day-slider').property('value');
    const dailyStartDateNum = dailyStartMonth * 100 + dailyStartDay;
    const dailyEndDateNum = +d3.select('#end-daily-month-slider').property('value') * 100 +
                            +d3.select('#end-daily-day-slider').property('value');

    if (dailyEndDateNum < dailyStartDateNum) {
      d3.select('#end-daily-month-slider').property('value', dailyStartMonth);
      d3.select('#end-daily-month-slider-value').text(MONTH_NAMES[dailyStartMonth - 1]);

      const daysInMonth = new Date(referenceYear, dailyStartMonth, 0).getDate();
      d3.select('#end-daily-day-slider').attr('max', daysInMonth);

      d3.select('#end-daily-day-slider').property('value', dailyStartDay);
      d3.select('#end-daily-day-slider-value').text(String(dailyStartDay).padStart(2, '0'));
    }

    const hourlyStartMonth = +d3.select('#start-hourly-month-slider').property('value');
    const hourlyStartDay = +d3.select('#start-hourly-day-slider').property('value');
    const hourlyStartHour = +d3.select('#start-hourly-hour-slider').property('value');
    const hourlyStartDateNum = hourlyStartMonth * 10000 + hourlyStartDay * 100 + hourlyStartHour;
    const hourlyEndDateNum = +d3.select('#end-hourly-month-slider').property('value') * 10000 +
                             +d3.select('#end-hourly-day-slider').property('value') * 100 +
                             +d3.select('#end-hourly-hour-slider').property('value');

    if (hourlyEndDateNum < hourlyStartDateNum) {
      d3.select('#end-hourly-month-slider').property('value', hourlyStartMonth);
      d3.select('#end-hourly-month-slider-value').text(MONTH_NAMES[hourlyStartMonth - 1]);

      const daysInMonth = new Date(referenceYear, hourlyStartMonth, 0).getDate();
      d3.select('#end-hourly-day-slider').attr('max', daysInMonth);

      d3.select('#end-hourly-day-slider').property('value', hourlyStartDay);
      d3.select('#end-hourly-day-slider-value').text(String(hourlyStartDay).padStart(2, '0'));

      d3.select('#end-hourly-hour-slider').property('value', hourlyStartHour);
      d3.select('#end-hourly-hour-slider-value').text(String(hourlyStartHour).padStart(2, '0'));
    }
  }

  const debouncedRecompute = debounce(() => {
    updateMonthlyTable(epwData);
    updateDailyTable(epwData);
    updateHourlyTable(epwData);
    persistDataTablesState();
    if (tabPaneId && window.hideLocalProcessing) window.hideLocalProcessing(tabPaneId);
  }, 150);

  const updateAllTables = () => {
    validateAndSyncControls();
    if (tabPaneId && window.showLocalProcessing) window.showLocalProcessing(tabPaneId);
    debouncedRecompute();
  };

  const globalGroup = panel.append('div').attr('class', 'chart-controls-group');
  globalGroup.append('h6').text('Data Columns');
  const notes = globalGroup.append('div').attr('class', 'notes-section');
  notes.append('p').attr('class', 'small text-muted').html('<strong>Note 1:</strong> Select data types to display in all tables below.');
  notes.append('p').attr('class', 'small text-muted').html('<strong>Note 2:</strong> The "Hourly" checkbox displays the raw hourly value for that data point. It is only applicable to the "Hourly Data Explorer" table.');

  const accordionData = [
    {
      title: 'Dry Bulb Temperature',
      items: [
        { id: 'dbt_mean', label: 'Mean', checked: true },
        { id: 'dbt_max', label: 'Max', checked: false },
        { id: 'dbt_min', label: 'Min', checked: false },
        { id: 'dbt_hourly', label: 'Hourly', checked: true }
      ]
    },
    {
      title: 'Dew Point Temperature',
      items: [
        { id: 'dpt_mean', label: 'Mean', checked: false },
        { id: 'dpt_max', label: 'Max', checked: false },
        { id: 'dpt_min', label: 'Min', checked: false },
        { id: 'dpt_hourly', label: 'Hourly', checked: false }
      ]
    },
    {
      title: 'Relative Humidity',
      items: [
        { id: 'rh_mean', label: 'Mean', checked: true },
        { id: 'rh_max', label: 'Max', checked: false },
        { id: 'rh_min', label: 'Min', checked: false },
        { id: 'rh_hourly', label: 'Hourly', checked: true }
      ]
    },
    {
      title: 'Sky Cover',
      items: [
        { id: 'tsc_mean', label: 'Total Sky Cover (Mean)', checked: true },
        { id: 'tsc_max', label: 'Total Sky Cover (Max)', checked: false },
        { id: 'tsc_hourly', label: 'Total Sky Cover (Hourly)', checked: true },
        { id: 'osc_mean', label: 'Opaque Sky Cover (Mean)', checked: false },
        { id: 'osc_max', label: 'Opaque Sky Cover (Max)', checked: false },
        { id: 'osc_hourly', label: 'Opaque Sky Cover (Hourly)', checked: false },
      ]
    },
    {
      title: 'Wind',
      items: [
        { id: 'ws_mean', label: 'Speed (Mean)', checked: true },
        { id: 'ws_max', label: 'Speed (Max)', checked: false },
        { id: 'ws_hourly', label: 'Speed (Hourly)', checked: true },
        { id: 'wd_prevailing', label: 'Direction (Prevailing)', checked: true },
        { id: 'wd_hourly', label: 'Direction (Hourly)', checked: true },
      ]
    },
    {
      title: 'Snow Depth',
      items: [
        { id: 'sd_mean', label: 'Mean', checked: false },
        { id: 'sd_max', label: 'Max', checked: false },
        { id: 'sd_hourly', label: 'Hourly', checked: false }
      ]
    },
    {
      title: 'Solar Radiation',
      items: [
        { id: 'ghi_mean', label: 'GHI (Mean)', checked: true },
        { id: 'ghi_max', label: 'GHI (Max)', checked: false },
        { id: 'ghi_total', label: 'GHI (Total)', checked: false },
        { id: 'ghi_hourly', label: 'GHI (Hourly)', checked: true },
        { id: 'dni_mean', label: 'DNI (Mean)', checked: true },
        { id: 'dni_max', label: 'DNI (Max)', checked: false },
        { id: 'dni_total', label: 'DNI (Total)', checked: false },
        { id: 'dni_hourly', label: 'DNI (Hourly)', checked: true },
        { id: 'dhi_mean', label: 'DHI (Mean)', checked: true },
        { id: 'dhi_max', label: 'DHI (Max)', checked: false },
        { id: 'dhi_total', label: 'DHI (Total)', checked: false },
        { id: 'dhi_hourly', label: 'DHI (Hourly)', checked: true },
      ]
    },
    {
      title: 'Solar Illuminance',
      items: [
        { id: 'gli_mean', label: 'Global Horiz (Mean)', checked: false },
        { id: 'gli_max', label: 'Global Horiz (Max)', checked: false },
        { id: 'gli_total', label: 'Global Horiz (Total)', checked: false },
        { id: 'gli_hourly', label: 'Global Horiz (Hourly)', checked: false },
        { id: 'dnil_mean', label: 'Direct Normal (Mean)', checked: false },
        { id: 'dnil_max', label: 'Direct Normal (Max)', checked: false },
        { id: 'dnil_total', label: 'Direct Normal (Total)', checked: false },
        { id: 'dnil_hourly', label: 'Direct Normal (Hourly)', checked: false },
        { id: 'dhil_mean', label: 'Diffuse Horiz (Mean)', checked: false },
        { id: 'dhil_max', label: 'Diffuse Horiz (Max)', checked: false },
        { id: 'dhil_total', label: 'Diffuse Horiz (Total)', checked: false },
        { id: 'dhil_hourly', label: 'Diffuse Horiz (Hourly)', checked: false },
        { id: 'zl_mean', label: 'Zenith Lum (Mean)', checked: false },
        { id: 'zl_max', label: 'Zenith Lum (Max)', checked: false },
        { id: 'zl_total', label: 'Zenith Lum (Total)', checked: false },
        { id: 'zl_hourly', label: 'Zenith Lum (Hourly)', checked: false },
      ]
    }
  ];

  if (savedColumns) {
    accordionData.forEach(group => group.items.forEach(check => {
      check.checked = savedColumns.has(check.id);
    }));
  }

  const accordion = globalGroup.append('div').attr('class', 'accordion-container');
  accordionData.forEach((d) => {
    const item = accordion.append('div').attr('class', 'accordion-item');
    const button = item.append('button').attr('class', 'accordion-button').text(d.title);
    const panelNode = item.append('div').attr('class', 'accordion-panel');
    const content = panelNode.append('div').attr('class', 'accordion-panel-content');

    d.items.forEach(check => {
      content.append('div').attr('class', 'form-check form-check-sm')
        .html(`<input class="form-check-input data-col-check" type="checkbox" value="${check.id}" id="check-${check.id}" ${check.checked ? 'checked' : ''}><label class="form-check-label" for="check-${check.id}">${check.label}</label>`);
    });

    button.on('click', function () {
      const currentButton = d3.select(this);
      const currentPanel = d3.select(this.nextElementSibling);
      const isActive = currentButton.classed('active');

      accordion.selectAll('.accordion-button').classed('active', false);
      accordion.selectAll('.accordion-panel').style('max-height', null);

      if (!isActive) {
        currentButton.classed('active', true);
        currentPanel.style('max-height', currentPanel.node().scrollHeight + "px");
      }
    });
  });

  accordion.select('.accordion-button').dispatch('click');
  globalGroup.selectAll('.data-col-check').on('change', updateAllTables);

  const createSlider = (parent, { label, id, min, max, value, step = 1, onInput, isMonth = false, daySliderId = null }) => {
    const container = parent.append('div').attr('class', 'slider-control-item');
    const header = container.append('div').attr('class', 'slider-header');
    header.append('label').attr('for', id).text(label);
    const valueDisplay = header.append('span').attr('id', `${id}-value`).attr('class', 'slider-value-display');

    const slider = container.append('input')
      .attr('type', 'range').attr('id', id).attr('min', min).attr('max', max).attr('value', value).attr('step', step);

    slider.on('input', function () {
      const currentValue = +d3.select(this).property('value');
      if (isMonth) {
        valueDisplay.text(MONTH_NAMES[currentValue - 1]);
        if (daySliderId) {
          const daysInMonth = new Date(referenceYear, currentValue, 0).getDate();
          const daySlider = d3.select(`#${daySliderId}`);
          daySlider.attr('max', daysInMonth);
          if (+daySlider.property('value') > daysInMonth) {
            daySlider.property('value', daysInMonth);
            d3.select(`#${daySliderId}-value`).text(String(daysInMonth).padStart(2, '0'));
          }
        }
      } else {
        valueDisplay.text(String(currentValue).padStart(2, '0'));
      }
      onInput();
    });

    if (isMonth) { valueDisplay.text(MONTH_NAMES[value - 1]); }
    else { valueDisplay.text(String(value).padStart(2, '0')); }
  };

  const applyPreset = (values) => {
    Object.entries(values).forEach(([sliderId, val]) => {
      const sliderSel = d3.select(`#${sliderId}`);
      if (sliderSel.empty()) return;
      sliderSel.property('value', val);
      sliderSel.dispatch('input');
    });
  };

  const createPresetRow = (parent, presets) => {
    const row = parent.append('div').attr('class', 'quick-presets-row');
    presets.forEach(preset => {
      row.append('button')
        .attr('type', 'button')
        .attr('class', 'preset-btn')
        .text(preset.label)
        .on('click', () => applyPreset(preset.values));
    });
  };

  const monthlyGroup = panel.append('div').attr('class', 'chart-controls-group');
  monthlyGroup.append('h6').text('1. Monthly Summary Table');
  const monthlyControlsContainer = monthlyGroup.append('div').attr('class', 'control-item');
  createPresetRow(monthlyControlsContainer, [
    { label: 'Full Year', values: { 'monthly-start-month': 1, 'monthly-end-month': 12 } },
    { label: 'H1 (Jan\u2013Jun)', values: { 'monthly-start-month': 1, 'monthly-end-month': 6 } },
    { label: 'H2 (Jul\u2013Dec)', values: { 'monthly-start-month': 7, 'monthly-end-month': 12 } }
  ]);
  const monthlySelectionContainer = monthlyControlsContainer.append('div')
    .style('display', 'grid')
    .style('grid-template-columns', '1fr 1fr')
    .style('gap', '1.5rem')
    .classed('mt-2 mb-2', true);
  const monthlyStartContainer = monthlySelectionContainer.append('div');
  monthlyStartContainer.append('h6').attr('class', 'slider-group-subtitle').text('Start');
  const monthlyEndContainer = monthlySelectionContainer.append('div');
  monthlyEndContainer.append('h6').attr('class', 'slider-group-subtitle').text('End');
  createSlider(monthlyStartContainer, { label: 'Month', id: 'monthly-start-month', min: 1, max: 12, value: monthlyDefaults.startMonth, onInput: updateAllTables, isMonth: true });
  createSlider(monthlyEndContainer, { label: 'Month', id: 'monthly-end-month', min: 1, max: 12, value: monthlyDefaults.endMonth, onInput: updateAllTables, isMonth: true });
  monthlyControlsContainer.append('div').attr('class', 'form-check mt-2').html(`<input class="form-check-input" type="checkbox" id="monthly-annual-check" ${monthlyDefaults.includeAnnual ? 'checked' : ''}><label class="form-check-label" for="monthly-annual-check">Include Annual Summary</label>`);
  monthlyGroup.selectAll('input[type=checkbox]').on('change', updateAllTables);

  const dailyGroup = panel.append('div').attr('class', 'chart-controls-group');
  dailyGroup.append('h6').text('2. Daily Data Explorer');
  createPresetRow(dailyGroup, [
    { label: 'Full Year', values: { 'start-daily-month-slider': 1, 'start-daily-day-slider': 1, 'end-daily-month-slider': 12, 'end-daily-day-slider': 31 } },
    { label: 'Q1', values: { 'start-daily-month-slider': 1, 'start-daily-day-slider': 1, 'end-daily-month-slider': 3, 'end-daily-day-slider': 31 } },
    { label: 'Q2', values: { 'start-daily-month-slider': 4, 'start-daily-day-slider': 1, 'end-daily-month-slider': 6, 'end-daily-day-slider': 30 } },
    { label: 'Q3', values: { 'start-daily-month-slider': 7, 'start-daily-day-slider': 1, 'end-daily-month-slider': 9, 'end-daily-day-slider': 30 } },
    { label: 'Q4', values: { 'start-daily-month-slider': 10, 'start-daily-day-slider': 1, 'end-daily-month-slider': 12, 'end-daily-day-slider': 31 } }
  ]);
  const dailySelectionContainer = dailyGroup.append('div').style('display', 'grid').style('grid-template-columns', '1fr 1fr').style('gap', '1.5rem');
  const dailyStartContainer = dailySelectionContainer.append('div');
  dailyStartContainer.append('h6').attr('class', 'slider-group-subtitle').text('Start Date');
  const dailyEndContainer = dailySelectionContainer.append('div');
  dailyEndContainer.append('h6').attr('class', 'slider-group-subtitle').text('End Date');
  createSlider(dailyStartContainer, { label: 'Month', id: 'start-daily-month-slider', min: 1, max: 12, value: dailyDefaults.startMonth, onInput: updateAllTables, isMonth: true, daySliderId: 'start-daily-day-slider' });
  createSlider(dailyStartContainer, { label: 'Day', id: 'start-daily-day-slider', min: 1, max: new Date(referenceYear, dailyDefaults.startMonth, 0).getDate(), value: dailyDefaults.startDay, onInput: updateAllTables });
  createSlider(dailyEndContainer, { label: 'Month', id: 'end-daily-month-slider', min: 1, max: 12, value: dailyDefaults.endMonth, onInput: updateAllTables, isMonth: true, daySliderId: 'end-daily-day-slider' });
  createSlider(dailyEndContainer, { label: 'Day', id: 'end-daily-day-slider', min: 1, max: new Date(referenceYear, dailyDefaults.endMonth, 0).getDate(), value: dailyDefaults.endDay, onInput: updateAllTables });

  const hourlyGroup = panel.append('div').attr('class', 'chart-controls-group');
  hourlyGroup.append('h6').text('3. Hourly Data Explorer');
  createPresetRow(hourlyGroup, [
    { label: 'All Hours', values: { 'start-hourly-hour-slider': 0, 'end-hourly-hour-slider': 23 } },
    { label: 'Daytime (06\u201318)', values: { 'start-hourly-hour-slider': 6, 'end-hourly-hour-slider': 18 } },
    { label: 'Business Hours (09\u201317)', values: { 'start-hourly-hour-slider': 9, 'end-hourly-hour-slider': 17 } }
  ]);
  const hourlySelectionContainer = hourlyGroup.append('div').style('display', 'grid').style('grid-template-columns', '1fr 1fr').style('gap', '1.5rem');
  const hourlyStartContainer = hourlySelectionContainer.append('div');
  hourlyStartContainer.append('h6').attr('class', 'slider-group-subtitle').text('Start');
  const hourlyEndContainer = hourlySelectionContainer.append('div');
  hourlyEndContainer.append('h6').attr('class', 'slider-group-subtitle').text('End');
  createSlider(hourlyStartContainer, { label: 'Month', id: 'start-hourly-month-slider', min: 1, max: 12, value: hourlyDefaults.startMonth, onInput: updateAllTables, isMonth: true, daySliderId: 'start-hourly-day-slider' });
  createSlider(hourlyStartContainer, { label: 'Day', id: 'start-hourly-day-slider', min: 1, max: new Date(referenceYear, hourlyDefaults.startMonth, 0).getDate(), value: hourlyDefaults.startDay, onInput: updateAllTables });
  createSlider(hourlyStartContainer, { label: 'Hour', id: 'start-hourly-hour-slider', min: 0, max: 23, value: hourlyDefaults.startHour, onInput: updateAllTables });
  createSlider(hourlyEndContainer, { label: 'Month', id: 'end-hourly-month-slider', min: 1, max: 12, value: hourlyDefaults.endMonth, onInput: updateAllTables, isMonth: true, daySliderId: 'end-hourly-day-slider' });
  createSlider(hourlyEndContainer, { label: 'Day', id: 'end-hourly-day-slider', min: 1, max: new Date(referenceYear, hourlyDefaults.endMonth, 0).getDate(), value: hourlyDefaults.endDay, onInput: updateAllTables });
  createSlider(hourlyEndContainer, { label: 'Hour', id: 'end-hourly-hour-slider', min: 0, max: 23, value: hourlyDefaults.endHour, onInput: updateAllTables });

  const notesGroup = panel.append('div').attr('class', 'chart-controls-group');
  notesGroup.append('h6').text('Data Notes');
  const dataNotes = notesGroup.append('div').attr('class', 'info-note');
  dataNotes.append('p').attr('class', 'small text-muted').html('The EPW format uses specific large numbers to denote missing data. For example, a value of 9999 for temperature or 999900 for radiation indicates a missing reading. The parser handles these values appropriately.');
  dataNotes.append('p').attr('class', 'small text-muted').html('Columns marked with <span class="header-quality-badge">\u26A0</span> in a table header report a constant value throughout this EPW file, meaning the source station likely never recorded real data for that parameter.');

  updateAllTables();
}

function getPrevailingWindDirection(data) {
  if (!data || data.length === 0) return 'N/A';
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const counts = new Array(16).fill(0);
  data.forEach(d => { if (d.windSpeed > 0.1) { counts[Math.round(d.windDirection / 22.5) % 16]++; } });
  const maxIndex = d3.maxIndex(counts);
  return counts[maxIndex] > 0 ? directions[maxIndex] : 'Calm';
}

function copyTableToClipboard(button, headers, data) {
  const headerText = headers.map(h => h.label).join('\t');
  const rowText = data.map(row => headers.map(h => {
    const val = row[h.id];
    return val !== undefined && val !== null ? h.format(val) : 'N/A';
  }).join('\t')).join('\n');

  const fullText = `${headerText}\n${rowText}`;
  navigator.clipboard.writeText(fullText).then(() => {
    const originalIcon = button.html();
    const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
    button.html(checkIcon).classed('copied', true).property('disabled', true);
    setTimeout(() => {
      button.html(originalIcon).classed('copied', false).property('disabled', false);
    }, 2000);
  }).catch(err => console.error('Failed to copy text: ', err));
}

function downloadTableAsCSV(title, headers, data) {
  const headerRow = headers.map(h => `"${h.label.replace(/"/g, '""')}"`).join(',');
  const rows = data.map(row =>
    headers.map(h => {
      const val = row[h.id];
      const formattedVal = val !== undefined && val !== null ? h.format(val) : 'N/A';
      return `"${String(formattedVal).replace(/"/g, '""')}"`;
    }).join(',')
  ).join('\n');

  const csvContent = `${headerRow}\n${rows}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

function getSelectedColumns() {
  return new Set(d3.selectAll('.data-col-check:checked').nodes().map(n => n.value));
}

function getAllColumnDefinitions() {
  return new Map([
    ['dbt_mean', { id: 'dbt_mean', label: 'DBT Mean (\u00B0C)', format: d => d.toFixed(1), aggregate: 'mean', source: 'dryBulbTemperature' }],
    ['dbt_max', { id: 'dbt_max', label: 'DBT Max (\u00B0C)', format: d => d.toFixed(1), aggregate: 'max', source: 'dryBulbTemperature' }],
    ['dbt_min', { id: 'dbt_min', label: 'DBT Min (\u00B0C)', format: d => d.toFixed(1), aggregate: 'min', source: 'dryBulbTemperature' }],
    ['dbt_hourly', { id: 'dryBulbTemperature', label: 'DBT (\u00B0C)', format: d => d.toFixed(1), aggregate: 'hourly' }],
    ['dpt_mean', { id: 'dpt_mean', label: 'DPT Mean (\u00B0C)', format: d => d.toFixed(1), aggregate: 'mean', source: 'dewPointTemperature' }],
    ['dpt_max', { id: 'dpt_max', label: 'DPT Max (\u00B0C)', format: d => d.toFixed(1), aggregate: 'max', source: 'dewPointTemperature' }],
    ['dpt_min', { id: 'dpt_min', label: 'DPT Min (\u00B0C)', format: d => d.toFixed(1), aggregate: 'min', source: 'dewPointTemperature' }],
    ['dpt_hourly', { id: 'dewPointTemperature', label: 'DPT (\u00B0C)', format: d => d.toFixed(1), aggregate: 'hourly' }],
    ['rh_mean', { id: 'rh_mean', label: 'RH Mean (%)', format: d => d.toFixed(0), aggregate: 'mean', source: 'relativeHumidity' }],
    ['rh_max', { id: 'rh_max', label: 'RH Max (%)', format: d => d.toFixed(0), aggregate: 'max', source: 'relativeHumidity' }],
    ['rh_min', { id: 'rh_min', label: 'RH Min (%)', format: d => d.toFixed(0), aggregate: 'min', source: 'relativeHumidity' }],
    ['rh_hourly', { id: 'relativeHumidity', label: 'RH (%)', format: d => d.toFixed(0), aggregate: 'hourly' }],
    ['tsc_mean', { id: 'tsc_mean', label: 'Total Sky Cover Mean', format: d => d.toFixed(1), aggregate: 'mean', source: 'totalSkyCover' }],
    ['tsc_max', { id: 'tsc_max', label: 'Total Sky Cover Max', format: d => d.toFixed(1), aggregate: 'max', source: 'totalSkyCover' }],
    ['tsc_hourly', { id: 'totalSkyCover', label: 'Total Sky Cover', format: d => d.toFixed(0), aggregate: 'hourly' }],
    ['osc_mean', { id: 'osc_mean', label: 'Opaque Sky Cover Mean', format: d => d.toFixed(1), aggregate: 'mean', source: 'opaqueSkyCover' }],
    ['osc_max', { id: 'osc_max', label: 'Opaque Sky Cover Max', format: d => d.toFixed(1), aggregate: 'max', source: 'opaqueSkyCover' }],
    ['osc_hourly', { id: 'opaqueSkyCover', label: 'Opaque Sky Cover', format: d => d.toFixed(0), aggregate: 'hourly' }],
    ['ws_mean', { id: 'ws_mean', label: 'Wind Speed Mean (m/s)', format: d => d.toFixed(1), aggregate: 'mean', source: 'windSpeed' }],
    ['ws_max', { id: 'ws_max', label: 'Wind Speed Max (m/s)', format: d => d.toFixed(1), aggregate: 'max', source: 'windSpeed' }],
    ['ws_hourly', { id: 'windSpeed', label: 'Wind Speed (m/s)', format: d => d.toFixed(1), aggregate: 'hourly' }],
    ['wd_prevailing', { id: 'wd_prevailing', label: 'Prev. Wind Dir.', format: d => d, aggregate: 'prevailing', source: 'windDirection' }],
    ['wd_hourly', { id: 'windDirection', label: 'Wind Dir. (\u00B0)', format: d => d.toFixed(0), aggregate: 'hourly' }],
    ['sd_mean', { id: 'sd_mean', label: 'Snow Depth Mean (cm)', format: d => d.toFixed(1), aggregate: 'mean', source: 'snowDepth' }],
    ['sd_max', { id: 'sd_max', label: 'Snow Depth Max (cm)', format: d => d.toFixed(1), aggregate: 'max', source: 'snowDepth' }],
    ['sd_hourly', { id: 'snowDepth', label: 'Snow Depth (cm)', format: d => d.toFixed(1), aggregate: 'hourly' }],
    ['ghi_mean', { id: 'ghi_mean', label: 'GHI Mean (Wh/m\u00B2)', format: d => d.toFixed(0), aggregate: 'mean', source: 'globalHorizontalRadiation' }],
    ['ghi_max', { id: 'ghi_max', label: 'GHI Max (Wh/m\u00B2)', format: d => d.toFixed(0), aggregate: 'max', source: 'globalHorizontalRadiation' }],
    ['ghi_total', { id: 'ghi_total', label: 'GHI Total (Wh/m\u00B2)', format: d => d.toFixed(0), aggregate: 'sum', source: 'globalHorizontalRadiation' }],
    ['ghi_hourly', { id: 'globalHorizontalRadiation', label: 'GHI (Wh/m\u00B2)', format: d => d.toFixed(0), aggregate: 'hourly' }],
    ['dni_mean', { id: 'dni_mean', label: 'DNI Mean (Wh/m\u00B2)', format: d => d.toFixed(0), aggregate: 'mean', source: 'directNormalRadiation' }],
    ['dni_max', { id: 'dni_max', label: 'DNI Max (Wh/m\u00B2)', format: d => d.toFixed(0), aggregate: 'max', source: 'directNormalRadiation' }],
    ['dni_total', { id: 'dni_total', label: 'DNI Total (Wh/m\u00B2)', format: d => d.toFixed(0), aggregate: 'sum', source: 'directNormalRadiation' }],
    ['dni_hourly', { id: 'directNormalRadiation', label: 'DNI (Wh/m\u00B2)', format: d => d.toFixed(0), aggregate: 'hourly' }],
    ['dhi_mean', { id: 'dhi_mean', label: 'DHI Mean (Wh/m\u00B2)', format: d => d.toFixed(0), aggregate: 'mean', source: 'diffuseHorizontalRadiation' }],
    ['dhi_max', { id: 'dhi_max', label: 'DHI Max (Wh/m\u00B2)', format: d => d.toFixed(0), aggregate: 'max', source: 'diffuseHorizontalRadiation' }],
    ['dhi_total', { id: 'dhi_total', label: 'DHI Total (Wh/m\u00B2)', format: d => d.toFixed(0), aggregate: 'sum', source: 'diffuseHorizontalRadiation' }],
    ['dhi_hourly', { id: 'diffuseHorizontalRadiation', label: 'DHI (Wh/m\u00B2)', format: d => d.toFixed(0), aggregate: 'hourly' }],
    ['gli_mean', { id: 'gli_mean', label: 'Global Horiz Illum Mean (lux)', format: d => d.toFixed(0), aggregate: 'mean', source: 'globalHorizontalIlluminance' }],
    ['gli_max', { id: 'gli_max', label: 'Global Horiz Illum Max (lux)', format: d => d.toFixed(0), aggregate: 'max', source: 'globalHorizontalIlluminance' }],
    ['gli_total', { id: 'gli_total', label: 'Global Horiz Illum Total (lux)', format: d => d.toFixed(0), aggregate: 'sum', source: 'globalHorizontalIlluminance' }],
    ['gli_hourly', { id: 'globalHorizontalIlluminance', label: 'Global Horiz Illum (lux)', format: d => d.toFixed(0), aggregate: 'hourly' }],
    ['dnil_mean', { id: 'dnil_mean', label: 'Direct Normal Illum Mean (lux)', format: d => d.toFixed(0), aggregate: 'mean', source: 'directNormalIlluminance' }],
    ['dnil_max', { id: 'dnil_max', label: 'Direct Normal Illum Max (lux)', format: d => d.toFixed(0), aggregate: 'max', source: 'directNormalIlluminance' }],
    ['dnil_total', { id: 'dnil_total', label: 'Direct Normal Illum Total (lux)', format: d => d.toFixed(0), aggregate: 'sum', source: 'directNormalIlluminance' }],
    ['dnil_hourly', { id: 'directNormalIlluminance', label: 'Direct Normal Illum (lux)', format: d => d.toFixed(0), aggregate: 'hourly' }],
    ['dhil_mean', { id: 'dhil_mean', label: 'Diffuse Horiz Illum Mean (lux)', format: d => d.toFixed(0), aggregate: 'mean', source: 'diffuseHorizontalIlluminance' }],
    ['dhil_max', { id: 'dhil_max', label: 'Diffuse Horiz Illum Max (lux)', format: d => d.toFixed(0), aggregate: 'max', source: 'diffuseHorizontalIlluminance' }],
    ['dhil_total', { id: 'dhil_total', label: 'Diffuse Horiz Illum Total (lux)', format: d => d.toFixed(0), aggregate: 'sum', source: 'diffuseHorizontalIlluminance' }],
    ['dhil_hourly', { id: 'diffuseHorizontalIlluminance', label: 'Diffuse Horiz Illum (lux)', format: d => d.toFixed(0), aggregate: 'hourly' }],
    ['zl_mean', { id: 'zl_mean', label: 'Zenith Lum Mean (cd/m\u00B2)', format: d => d.toFixed(0), aggregate: 'mean', source: 'zenithLuminance' }],
    ['zl_max', { id: 'zl_max', label: 'Zenith Lum Max (cd/m\u00B2)', format: d => d.toFixed(0), aggregate: 'max', source: 'zenithLuminance' }],
    ['zl_total', { id: 'zl_total', label: 'Zenith Lum Total (cd/m\u00B2)', format: d => d.toFixed(0), aggregate: 'sum', source: 'zenithLuminance' }],
    ['zl_hourly', { id: 'zenithLuminance', label: 'Zenith Lum (cd/m\u00B2)', format: d => d.toFixed(0), aggregate: 'hourly' }],
  ]);
}

function aggregateData(data, colDefs, selectedCols) {
  const result = {};
  if (!data || data.length === 0) return result;

  selectedCols.forEach(colId => {
    const def = colDefs.get(colId);
    if (def && def.aggregate !== 'hourly') {
      const sourceField = def.source;
      switch (def.aggregate) {
        case 'mean':
          result[def.id] = d3.mean(data, d => d[sourceField]);
          break;
        case 'max':
          result[def.id] = d3.max(data, d => d[sourceField]);
          break;
        case 'min':
          result[def.id] = d3.min(data, d => d[sourceField]);
          break;
        case 'sum':
          result[def.id] = d3.sum(data, d => d[sourceField]);
          break;
        case 'prevailing':
          result[def.id] = getPrevailingWindDirection(data);
          break;
      }
    }
  });
  return result;
}

function updateMonthlyTable(epwData) {
  const hourlyData = epwData.data;
  const container = d3.select('#monthly-summary-table');
  const selectedCols = getSelectedColumns();
  const allColDefs = getAllColumnDefinitions();

  const headers = [{ id: 'Month', label: 'Month', format: d => d, align: 'left' }];
  selectedCols.forEach(colId => {
    const def = allColDefs.get(colId);
    if (def && def.aggregate !== 'hourly') {
      headers.push(def);
    }
  });

  const monthlyData = d3.groups(hourlyData, d => d.month).map(([month, values]) => {
    const aggregates = aggregateData(values, allColDefs, selectedCols);
    return {
      Month: d3.timeFormat("%B")(new Date(2000, month - 1)),
      ...aggregates
    };
  }).sort((a, b) => new Date(`1 ${a.Month} 2012`) - new Date(`1 ${b.Month} 2012`));

  const includeAnnual = d3.select('#monthly-annual-check').property('checked');
  if (includeAnnual) {
    const annualSummary = {
      Month: 'Annual',
      ...aggregateData(hourlyData, allColDefs, selectedCols)
    };
    monthlyData.push(annualSummary);
  }

  const startMonth = +d3.select('#monthly-start-month').property('value');
  const endMonth = +d3.select('#monthly-end-month').property('value');
  const allMonthNames = d3.range(0, 12).map(m => d3.timeFormat('%B')(new Date(2000, m)));
  const visibleMonthNames = new Set(allMonthNames.slice(startMonth - 1, endMonth));
  const filteredData = monthlyData.filter(d => (d.Month === 'Annual' && includeAnnual) || visibleMonthNames.has(d.Month));

  createTable(container, 'Monthly Weather Data Summary', headers, filteredData, epwData.dataQuality, false, 'monthly');
}

function updateDailyTable(epwData) {
  const hourlyData = epwData.data;
  const container = d3.select('#daily-data-table');
  const selectedCols = getSelectedColumns();
  const allColDefs = getAllColumnDefinitions();

  const startMonth = +d3.select('#start-daily-month-slider').property('value');
  const startDay = +d3.select('#start-daily-day-slider').property('value');
  const endMonth = +d3.select('#end-daily-month-slider').property('value');
  const endDay = +d3.select('#end-daily-day-slider').property('value');

  const startDate = new Date(2000, startMonth - 1, startDay);
  const endDate = new Date(2000, endMonth - 1, endDay);

  const filteredHourlyData = hourlyData.filter(d => {
    const recordDate = new Date(2000, d.month - 1, d.day);
    return recordDate >= startDate && recordDate <= endDate;
  });

  const dailyData = d3.groups(filteredHourlyData, d => d3.timeDay.floor(d.datetime)).map(([date, values]) => {
    const aggregates = aggregateData(values, allColDefs, selectedCols);
    return {
      date,
      ...aggregates
    };
  });

  const headers = [{ id: 'date', label: 'Date', format: d => d3.timeFormat('%m-%d')(d), align: 'left' }];
  selectedCols.forEach(colId => {
    const def = allColDefs.get(colId);
    if (def && def.aggregate !== 'hourly') {
      headers.push(def);
    }
  });

  createTable(container, 'Daily Data Explorer', headers, dailyData, epwData.dataQuality, true, 'daily');
}

function updateHourlyTable(epwData) {
  const hourlyData = epwData.data;
  const container = d3.select('#hourly-data-table');
  const selectedCols = getSelectedColumns();
  const allColDefs = getAllColumnDefinitions();

  const startMonth = +d3.select('#start-hourly-month-slider').property('value');
  const startDay = +d3.select('#start-hourly-day-slider').property('value');
  const startHour = +d3.select('#start-hourly-hour-slider').property('value');
  const endMonth = +d3.select('#end-hourly-month-slider').property('value');
  const endDay = +d3.select('#end-hourly-day-slider').property('value');
  const endHour = +d3.select('#end-hourly-hour-slider').property('value');

  const startFilterVal = startMonth * 10000 + startDay * 100 + startHour;
  const endFilterVal = endMonth * 10000 + endDay * 100 + endHour;

  const filteredData = hourlyData.filter(d => {
    const dVal = d.month * 10000 + d.day * 100 + (d.hour - 1);
    return dVal >= startFilterVal && dVal <= endFilterVal;
  });

  const headers = [
    { id: 'date', label: 'Date', format: d => d3.timeFormat('%m-%d')(d), align: 'left' },
    { id: 'time', label: 'Time', format: d => d3.timeFormat('%H:%M')(d), align: 'left' }
  ];

  selectedCols.forEach(colId => {
    const def = allColDefs.get(colId);
    if (def && def.aggregate === 'hourly') {
      headers.push(def);
    }
  });

  const formattedData = filteredData.map(d => ({
    ...d,
    date: d.datetime,
    time: d.datetime
  }));

  createTable(container, 'Hourly Data Explorer', headers, formattedData, epwData.dataQuality, true, 'hourly');
}

function isColumnFlagged(headerDef, dataQuality) {
  if (!dataQuality) return false;
  const sourceField = headerDef.source || headerDef.id;
  const quality = dataQuality[sourceField];
  return !!(quality && quality.isConstant);
}

function createTable(container, title, headers, data, dataQuality, usePreview = false, section = '') {
  container.html('').append('h5').attr('class', 'chart-title-main').text(title);

  const controls = container.append('div').attr('class', 'table-controls');
  const copyButton = controls.append('button')
    .attr('class', 'table-control-btn')
    .attr('title', 'Copy to Clipboard');
  copyButton.html(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`);
  const csvButton = controls.append('button')
    .attr('class', 'table-control-btn')
    .attr('title', 'Download as CSV');
  csvButton.html(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`);

  const tableContainer = container.append('div').attr('class', 'table-wrapper').attr('data-section', section);
  const table = tableContainer.append('div').attr('class', 'table-responsive').append('table').attr('class', 'table table-striped table-hover table-sm stylish-table');

  const headerRow = table.append('thead').append('tr').selectAll('th').data(headers).join('th')
    .attr('class', d => d.align === 'left' ? '' : 'text-end');

  headerRow.each(function (d) {
    const th = d3.select(this);
    th.append('span').attr('class', 'th-label-text').text(d.label);
    if (isColumnFlagged(d, dataQuality)) {
      th.append('span')
        .attr('class', 'header-quality-badge')
        .attr('title', `${d.label}: this EPW file reports a constant/default value for this parameter, so it is likely unavailable at the source station.`)
        .text('\u26A0');
    }
  });

  const tbody = table.append('tbody');

  const PREVIEW_ROWS = 5;
  const useRippedEffect = usePreview && data.length > (PREVIEW_ROWS * 2);

  const displayData = useRippedEffect
    ? [...data.slice(0, PREVIEW_ROWS), { isPreviewGap: true }, ...data.slice(data.length - PREVIEW_ROWS)]
    : data;

  displayData.forEach(d => {
    if (d.isPreviewGap) {
      const gapRow = tbody.append('tr').attr('class', 'table-preview-gap');
      const gapCell = gapRow.append('td').attr('colspan', headers.length);
      gapCell.append('div').attr('class', 'ripped-paper-container')
        .append('span').text(`... ${data.length - (PREVIEW_ROWS * 2)} more rows ...`);
      return;
    }
    const row = tbody.append('tr');
    headers.forEach(h => {
      const value = d[h.id];
      row.append('td')
        .attr('class', h.align === 'left' ? '' : 'text-end')
        .text(value !== undefined && value !== null ? h.format(value) : 'N/A');
    });
  });

  const flaggedCount = headers.filter(h => isColumnFlagged(h, dataQuality)).length;
  if (flaggedCount > 0) {
    container.append('p').attr('class', 'small table-quality-footnote')
      .html(`<span class="header-quality-badge">\u26A0</span> ${flaggedCount === 1 ? 'One selected column reports' : `${flaggedCount} selected columns report`} a constant value throughout this file \u2014 likely unavailable at the source station, not a real reading.`);
  }

  copyButton.on('click', () => copyTableToClipboard(copyButton, headers, data));
  csvButton.on('click', () => downloadTableAsCSV(title, headers, data));
}