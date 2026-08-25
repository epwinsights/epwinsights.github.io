/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import SunCalc from '../core/suncalc.js';
import { getSolarPositionForChart } from '../core/suncalc.js';
import { formatSimpleLocation, formatCityNameOnly } from '../core/location-formatter.js';
import { addExportButton, addInfoButton } from '../core/svg-exporter.js';

export function renderSunPathCompareCharts(epwDataA, epwDataB) {
  const chartRefs = {};
  const contentArea = d3.select("#compare-content-area").html('');
  contentArea.append('div').attr('id', 'compare-sun-path-chart').attr('class', 'chart-container');
  const epwYear = (epwDataA.data && epwDataA.data.length)
    ? new Date(epwDataA.data[0].datetime).getFullYear()
    : new Date().getFullYear();
  const shortNameA = formatCityNameOnly(epwDataA.metadata.location.city, 'primary');
  const shortNameB = formatCityNameOnly(epwDataB.metadata.location.city, 'comparison');
  renderSunPathCompareControls('#compare-pane .left-panel', chartRefs, epwYear, shortNameA, shortNameB);
  renderSunPathComparison('#compare-sun-path-chart', epwDataA, epwDataB, chartRefs);
}

export function renderSunPathCompareControls(panelSelector, chartRefs, epwYear, locationNameA = 'Location A', locationNameB = 'Location B') {
  // Use the year actually present in the EPW file (not the browser's current
  // system year) so that leap-year day counts (e.g. Feb 29) always match the
  // data the chart will look up. Mixing system year with EPW year can make
  // the day slider allow/disallow Feb 29 inconsistently with the loaded data.
  const sliderYear = epwYear || new Date().getFullYear();
  const panel = d3.select(panelSelector);

  panel.append('style').text(`
    .sp-slider-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
    .sp-slider-header label { font-size: 0.82rem; font-weight: 600; color: #3c4148; }
    .sp-slider-value { font-size: 0.76rem; font-weight: 700; color: #fff; background: #3468c0; padding: 2px 8px; border-radius: 20px; min-width: 2.1em; text-align: center; line-height: 1.5; }
    .sp-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; margin: 0; border-radius: 4px; background: transparent; outline: none; cursor: pointer; }
    .sp-slider::-webkit-slider-runnable-track { height: 6px; border-radius: 4px; background: var(--sp-track-bg, #e2e5ea); transition: background 0.2s ease; }
    .sp-slider::-moz-range-track { height: 6px; border-radius: 4px; background: var(--sp-track-bg, #e2e5ea); transition: background 0.2s ease; }
    .sp-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 15px; height: 15px; margin-top: -4.5px; border-radius: 50%; background: #fff; border: 2.5px solid #3468c0; box-shadow: 0 1px 3px rgba(0,0,0,0.25); transition: transform 0.15s ease, box-shadow 0.15s ease; }
    .sp-slider::-moz-range-thumb { width: 15px; height: 15px; border-radius: 50%; background: #fff; border: 2.5px solid #3468c0; box-shadow: 0 1px 3px rgba(0,0,0,0.25); transition: transform 0.15s ease, box-shadow 0.15s ease; }
    .sp-slider:hover::-webkit-slider-thumb, .sp-slider:focus-visible::-webkit-slider-thumb { transform: scale(1.15); box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
    .sp-slider:hover::-moz-range-thumb, .sp-slider:focus-visible::-moz-range-thumb { transform: scale(1.15); box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
    .sp-slider-ticks { display: flex; justify-content: space-between; font-size: 9px; color: #9aa1ab; margin-top: 4px; padding: 0 1px; }
  `);

  const sunPathControls = panel.append('div').attr('class', 'chart-controls-group');
  const sunPathSlidersGroup = sunPathControls.append('div').attr('class', 'chart-controls-group');
  sunPathSlidersGroup.append('h6').text('Date & Time Selection').style('font-size', '0.9rem').style('font-weight', '600');

  const sunPathQuickJumpContainer = sunPathSlidersGroup.append('div')
    .attr('class', 'sun-path-quick-jump')
    .style('display', 'flex')
    .style('flex-wrap', 'nowrap')
    .style('gap', '4px')
    .style('margin-bottom', '10px');

  const sunPathSlidersContainer = sunPathSlidersGroup.append('div').attr('class', 'sliders-container-left-panel');
  sunPathSlidersGroup.append('p')
    .attr('class', 'info-note')
    .html('<strong>Note</strong>: The selected time is applied as the <strong>local time</strong> for each location.');
  const sunPathMonthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const createSunPathSlider = (parent, { label, id, min, max, value, step = 1, onInput }) => {
    const container = parent.append('div').attr('class', 'sp-slider-item');
    const header = container.append('div').attr('class', 'sp-slider-header');
    header.append('label').attr('for', id).text(label);
    const valueDisplay = header.append('span').attr('id', `${id}-value`).attr('class', 'sp-slider-value');

    const slider = container.append('input')
      .attr('type', 'range')
      .attr('id', id)
      .attr('class', id === 'sun-path-hour-slider-compare' ? 'sp-slider sp-slider--hour' : 'sp-slider')
      .attr('min', min).attr('max', max).attr('value', value).attr('step', step);

    slider.on('input', function () {
      const currentValue = +d3.select(this).property('value');
      if (id === 'sun-path-month-slider-compare') {
        valueDisplay.text(sunPathMonthNames[currentValue - 1]);
        const daysInMonth = new Date(sliderYear, currentValue, 0).getDate();
        const daySlider = d3.select('#sun-path-day-slider-compare');
        daySlider.attr('max', daysInMonth);
        if (+daySlider.property('value') > daysInMonth) {
          daySlider.property('value', daysInMonth);
          d3.select('#sun-path-day-slider-compare-value').text(daysInMonth);
        }
      } else {
        valueDisplay.text(currentValue);
      }
      onInput();
    });

    if (id === 'sun-path-month-slider-compare') {
      valueDisplay.text(sunPathMonthNames[value - 1]);
    } else {
      valueDisplay.text(value);
    }
    return { slider, container };
  };

  const onSunPathSliderInput = () => {
    if (chartRefs.sunpath && chartRefs.sunpath.updateInteractive) {
      const month = +d3.select('#sun-path-month-slider-compare').property('value');
      const day = +d3.select('#sun-path-day-slider-compare').property('value');
      const hour = +d3.select('#sun-path-hour-slider-compare').property('value');
      chartRefs.sunpath.updateInteractive(month, day, hour);
    }
  };

  const initialSunPathMonth = 6;
  const initialSunPathDay = 21;
  const daysInInitialSunPathMonth = new Date(sliderYear, initialSunPathMonth, 0).getDate();

  createSunPathSlider(sunPathSlidersContainer, { label: 'Month', id: 'sun-path-month-slider-compare', min: 1, max: 12, value: initialSunPathMonth, onInput: onSunPathSliderInput });
  createSunPathSlider(sunPathSlidersContainer, { label: 'Day', id: 'sun-path-day-slider-compare', min: 1, max: daysInInitialSunPathMonth, value: initialSunPathDay, onInput: onSunPathSliderInput });
  createSunPathSlider(sunPathSlidersContainer, { label: 'Hour', id: 'sun-path-hour-slider-compare', min: 0, max: 23, value: 12, onInput: onSunPathSliderInput });

  const buildDayNightBar = (parent, suffix, name) => {
    const wrapper = parent.append('div')
      .attr('class', 'sun-path-daynight-bar-wrapper')
      .style('margin-bottom', '4px');
    wrapper.append('div')
      .style('font-size', '9px')
      .style('font-weight', '600')
      .style('color', '#6c757d')
      .style('margin-bottom', '2px')
      .text(name);
    wrapper.append('div')
      .attr('id', `sun-path-daynight-bar-${suffix}`)
      .style('position', 'relative')
      .style('height', '6px')
      .style('border-radius', '4px')
      .style('overflow', 'hidden')
      .style('background', '#384456')
      .append('div')
      .attr('id', `sun-path-daynight-marker-${suffix}`)
      .style('position', 'absolute')
      .style('top', '0')
      .style('bottom', '0')
      .style('width', '2px')
      .style('background', '#212529')
      .style('left', '50%');
  };

  const dayNightBarsWrapper = sunPathSlidersContainer.append('div').style('margin-top', '2px');
  buildDayNightBar(dayNightBarsWrapper, 'a', locationNameA);
  buildDayNightBar(dayNightBarsWrapper, 'b', locationNameB);
  dayNightBarsWrapper.append('div')
    .attr('class', 'sp-slider-ticks')
    .html('<span>0h</span><span>12h</span><span>24h</span>');
  dayNightBarsWrapper.append('div')
    .style('font-size', '9px')
    .style('color', '#9aa1ab')
    .style('text-align', 'center')
    .style('margin-top', '2px')
    .text('Shaded = night at each location');

  const jumpToSunPathDate = (month, day, hour) => {
    d3.select('#sun-path-month-slider-compare').property('value', month);
    d3.select('#sun-path-month-slider-compare-value').text(sunPathMonthNames[month - 1]);

    const daysInMonth = new Date(sliderYear, month, 0).getDate();
    const clampedDay = Math.min(day, daysInMonth);
    d3.select('#sun-path-day-slider-compare').attr('max', daysInMonth).property('value', clampedDay);
    d3.select('#sun-path-day-slider-compare-value').text(clampedDay);

    if (hour !== undefined) {
      d3.select('#sun-path-hour-slider-compare').property('value', hour);
      d3.select('#sun-path-hour-slider-compare-value').text(hour);
    }

    onSunPathSliderInput();
  };

  const sunPathQuickJumpItems = [
    { label: 'June', title: 'June Solstice (June 21)', getDate: () => ({ month: 6, day: 21, hour: 12 }) },
    { label: 'Equinox', title: 'Equinox (March 20)', getDate: () => ({ month: 3, day: 20, hour: 12 }) },
    { label: 'December', title: 'December Solstice (December 21)', getDate: () => ({ month: 12, day: 21, hour: 12 }) },
    {
      label: 'Now',
      title: "Current date & time (your device's local clock, not either location's time zone)",
      getDate: () => { const now = new Date(); return { month: now.getMonth() + 1, day: now.getDate(), hour: now.getHours() }; }
    }
  ];

  sunPathQuickJumpItems.forEach(item => {
    sunPathQuickJumpContainer.append('button')
      .attr('type', 'button')
      .attr('class', 'btn btn-outline-secondary btn-sm')
      .attr('title', item.title)
      .style('font-size', '10px')
      .style('padding', '2px 4px')
      .style('flex', '1 1 0')
      .style('white-space', 'nowrap')
      .text(item.label)
      .on('click', () => {
        const { month, day, hour } = item.getDate();
        jumpToSunPathDate(month, day, hour);
      });
  });

  const sunPathShowHideGroup = sunPathControls.append('div').attr('class', 'chart-controls-group');
  sunPathShowHideGroup.append('h6').text('Show/Hide Items').style('font-size', '0.9rem').style('font-weight', '600');
  const sunPathControlsContainer = sunPathShowHideGroup.append('div').attr('class', 'controls-list');

  const staticComponents = [
    { id: 'toggle-solstice-lines-compare', key: 'showSolsticePaths', label: 'Solstice & Equinox Paths' },
    { id: 'toggle-analemmas-compare', key: 'showAnalemmas', label: 'Hourly Analemmas' }
  ];

  staticComponents.forEach(comp => {
    const item = sunPathControlsContainer.append('div').attr('class', 'control-item');
    const switchContainer = item.append('div').attr('class', 'form-check form-switch');

    switchContainer.append('input')
      .attr('class', 'form-check-input')
      .attr('type', 'checkbox')
      .attr('id', comp.id)
      .property('checked', true)
      .on('change', function () {
        if (chartRefs.sunpath && chartRefs.sunpath.update) {
          chartRefs.sunpath.update({ [comp.key]: d3.select(this).property('checked') });
        }
      });

    switchContainer.append('label')
      .attr('class', 'form-check-label')
      .attr('for', comp.id)
      .text(comp.label);
  });

  const analysisToggleItem = sunPathControlsContainer.append('div').attr('class', 'control-item');
  const analysisSwitchContainer = analysisToggleItem.append('div').attr('class', 'form-check form-switch');
  analysisSwitchContainer.append('input')
    .attr('class', 'form-check-input')
    .attr('type', 'checkbox')
    .attr('id', 'toggle-analysis-details-compare')
    .property('checked', true)
    .on('change', function () {
      const isChecked = d3.select(this).property('checked');
      updateIrradianceGroupVisibility();
      if (chartRefs.sunpath && chartRefs.sunpath.update) {
        chartRefs.sunpath.update({
          showSunSign: isChecked,
          showInfoPanel: isChecked,
          showSelectedAzimuth: isChecked,
          showSelectedAltitude: isChecked,
          showSelectedTime: isChecked
        });
      }
    });
  analysisSwitchContainer.append('label')
    .attr('class', 'form-check-label')
    .attr('for', 'toggle-analysis-details-compare')
    .text('Sun Info Panel');

  const analemmaColorItem = sunPathControlsContainer.append('div').attr('class', 'control-item');
  const analemmaColorSwitchContainer = analemmaColorItem.append('div').attr('class', 'form-check form-switch');
  analemmaColorSwitchContainer.append('input')
    .attr('class', 'form-check-input')
    .attr('type', 'checkbox')
    .attr('id', 'toggle-analemma-irradiance-color-compare')
    .property('checked', false)
    .on('change', function () {
      const isChecked = d3.select(this).property('checked');
      updateIrradianceGroupVisibility();
      if (chartRefs.sunpath && chartRefs.sunpath.update) {
        chartRefs.sunpath.update({ colorAnalemmasByIrradiance: isChecked });
      }
    });
  analemmaColorSwitchContainer.append('label')
    .attr('class', 'form-check-label')
    .attr('for', 'toggle-analemma-irradiance-color-compare')
    .text('Color Analemmas by Irradiance');

  const sunPathIrradianceGroup = sunPathControls.append('div').attr('class', 'chart-controls-group');
  sunPathIrradianceGroup.append('h6').text('Irradiance Data Type').style('font-size', '0.9rem').style('font-weight', '600');
  const sunPathIrradianceContainer = sunPathIrradianceGroup.append('div').attr('class', 'controls-list radio-group');

  const updateIrradianceGroupVisibility = () => {
    const sunInfoOn = d3.select('#toggle-analysis-details-compare').property('checked');
    const analemmaColorOn = d3.select('#toggle-analemma-irradiance-color-compare').property('checked');
    sunPathIrradianceGroup.style('display', (sunInfoOn || analemmaColorOn) ? 'block' : 'none');
  };

  const sunPathIrradianceTypes = [
    { id: 'dni', label: 'Direct Normal Irradiance (DNI)', checked: true },
    { id: 'ghi', label: 'Global Horizontal Irradiance (GHI)', checked: false },
    { id: 'dhi', label: 'Diffuse Horizontal Irradiance (DHI)', checked: false }
  ];

  sunPathIrradianceTypes.forEach(type => {
    const item = sunPathIrradianceContainer.append('div').attr('class', 'control-item');
    const radioContainer = item.append('div').attr('class', 'form-check');

    radioContainer.append('input')
      .attr('class', 'form-check-input')
      .attr('type', 'radio')
      .attr('name', 'sunpath-irradiance-type-compare')
      .attr('id', `radio-sunpath-${type.id}-compare`)
      .attr('value', type.id)
      .property('checked', type.checked)
      .on('change', function () {
        if (chartRefs.sunpath && chartRefs.sunpath.updateIrradianceType) {
          chartRefs.sunpath.updateIrradianceType(this.value);
        }
      });

    radioContainer.append('label')
      .attr('class', 'form-check-label')
      .attr('for', `radio-sunpath-${type.id}-compare`)
      .text(type.label);
  });

  const ackGroup = sunPathControls.append('div').attr('class', 'chart-controls-group');
  ackGroup.append('h6').text('Notes & Credits').style('font-size', '0.9rem').style('font-weight', '600');
  const infoNote = ackGroup.append('p').attr('class', 'info-note');
    infoNote.html(`
      <li class="mb-2">Solar radiation values (DNI, DHI, GHI) are read directly from the EPW weather file and represent the total energy (Wh/m²) accumulated during the one-hour period preceding the indicated time.</li>
      <li class="mb-2">This chart is a custom visualization blending solar-position mechanics with EPW irradiance data. Sun-position calculations (azimuth, altitude, sunrise/sunset) are powered by the <code>SunCalc</code> library, created by Vladimir Agafonkin. <a href="https://github.com/mourner/suncalc" target="_blank">Learn more</a></li>
  `);
}

export function renderSunPathComparison(selector, dataA, dataB, chartRefs) {
  // Converts an EPW local hour (in the file's fixed UTC offset `timeZone`)
  // into the correct UTC instant. Date.UTC correctly rolls the calendar
  // date forward/backward when `hour - timeZone` is outside [0, 23], which
  // is required for a correct absolute instant. Known limitation: because
  // SunCalc.getTimes() derives its solar-noon reference from the *absolute*
  // instant combined with longitude (not from the EPW's local calendar
  // day), sunrise/sunset for hours very close to local midnight at large
  // timeZone offsets can, in rare edge cases, be computed against the
  // adjacent solar day. Only the displayed HH:MM is affected (already
  // converted back to LST), so this is visually unnoticeable in practice.
  function createDateAsUTC(year, month, day, hour, timeZone) {
    return new Date(Date.UTC(year, month - 1, day, hour - timeZone));
  }
  const mainContainer = d3.select(selector).html('');
  const locNameA = formatSimpleLocation(dataA.metadata.location.city, dataA.metadata.location.country, 'primary');
  const locNameB = formatSimpleLocation(dataB.metadata.location.city, dataB.metadata.location.country, 'comparison');
  const legendNameA = formatCityNameOnly(dataA.metadata.location.city, 'primary');
  const legendNameB = formatCityNameOnly(dataB.metadata.location.city, 'comparison');

  addExportButton(selector, `sun-path-${locNameA}-vs-${locNameB}`, `${locNameA} vs. ${locNameB}`);
  addInfoButton(selector, 'compareSunPath');

  mainContainer.append('style').text(`
        .sun-path-compare-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; margin: 6px 0 2px; }
        .sun-path-compare-table th, .sun-path-compare-table td { padding: 6px 8px; border-bottom: 1px solid #e9ecef; text-align: center; vertical-align: middle; }
        .sun-path-compare-table thead th { color: #3c4148; font-weight: 700; background: #f4f6f9; border-bottom: 2px solid #dde1e7; }
        .sun-path-compare-table td.spt-label { color: #6c757d; font-weight: 500; white-space: nowrap; text-align: left; }
        .sun-path-compare-table td.spt-value { color: #2f3746; font-weight: 700; white-space: nowrap; }
        .sun-path-compare-table tbody tr:last-child td { border-bottom: none; }
    `);

  const chartTitleElement = mainContainer.append('h5').attr('class', 'chart-title-main');
  const svgWrapper = mainContainer.append('div').attr('id', 'sun-path-svg-wrapper-compare');

  const diameter = 380;
  const radius = diameter / 2;
  const margin = { top: 70, right: 20, bottom: 20, left: 20 };
  const gap = 40;
  const baseWidth = (diameter * 2) + gap + margin.left + margin.right;

  const svg = svgWrapper.append("svg")
    .attr("viewBox", `0 0 ${baseWidth} ${diameter + margin.top + margin.bottom}`)
    .attr("font-family", `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`);

  const defs = svg.append('defs');

  const skyGradient = defs.append('radialGradient').attr('id', 'sun-path-sky-gradient-compare').attr('cx', '50%').attr('cy', '38%').attr('r', '75%');
  skyGradient.append('stop').attr('offset', '0%').attr('stop-color', '#fcfdfe');
  skyGradient.append('stop').attr('offset', '65%').attr('stop-color', '#f4f6f9');
  skyGradient.append('stop').attr('offset', '100%').attr('stop-color', '#e7eaf0');

  const glowFilter = defs.append('filter').attr('id', 'sun-path-glow-compare').attr('x', '-100%').attr('y', '-100%').attr('width', '300%').attr('height', '300%');
  glowFilter.append('feGaussianBlur').attr('stdDeviation', 6).attr('result', 'blur');
  const glowMerge = glowFilter.append('feMerge');
  glowMerge.append('feMergeNode').attr('in', 'blur');
  glowMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  const softShadowFilter = defs.append('filter').attr('id', 'sun-path-soft-shadow-compare').attr('x', '-40%').attr('y', '-40%').attr('width', '180%').attr('height', '180%');
  softShadowFilter.append('feDropShadow').attr('dx', 0).attr('dy', 0.5).attr('stdDeviation', 0.6).attr('flood-color', '#000000').attr('flood-opacity', 0.18);

  const analemmaSoftenFilter = defs.append('filter').attr('id', 'sun-path-analemma-soften-compare').attr('x', '-15%').attr('y', '-15%').attr('width', '130%').attr('height', '130%');
  analemmaSoftenFilter.append('feGaussianBlur').attr('stdDeviation', 0.45);

  defs.append('style').text(`
        @keyframes flicker { 0% { opacity: 1; transform: scale(1.1); } 25% { opacity: 0.5; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.15); } 75% { opacity: 0.4; transform: scale(1.05); } 100% { opacity: 1; transform: scale(1.1); } }
        .flickering-rays .ray { transform-origin: 50px 50px; animation: flicker 2s linear infinite; stroke-linecap: round; }
        .direction-labels text { paint-order: stroke; stroke: #fcfdfe; stroke-width: 3px; stroke-linejoin: round; letter-spacing: 0.4px; }
        .sun-path-day-line, .analemmas path { stroke-linecap: round; }
        /* Cross-fade the sun glyph and the "below horizon" badge instead of
           an abrupt display:none swap -- see updateInteractiveElements. */
        .current-sun-icon { transform-origin: 50px 50px; transition: opacity 0.5s ease, transform 0.5s cubic-bezier(0.34, 1.4, 0.64, 1); }
        .below-horizon-badge { transform-origin: 0px -6px; transition: opacity 0.5s ease, transform 0.5s cubic-bezier(0.34, 1.4, 0.64, 1); }
        .current-sun-icon.sp-hidden, .below-horizon-badge.sp-hidden { opacity: 0; transform: scale(0.55); pointer-events: none; }
        .sun-irradiance-label { paint-order: stroke; stroke: #fcfdfe; stroke-width: 3px; stroke-linejoin: round; }
        /* NEW: when the analemma lines are colored by the same colorScale as
           the current-sun indicator, give the indicator a white halo so it
           still reads clearly against similarly-colored lines behind it. */
        .current-sun-icon.sp-irradiance-emphasis .sun-core { stroke: #ffffff; stroke-width: 2.2px; }
        .current-sun-icon.sp-irradiance-emphasis .sun-glow { opacity: 0.8; }
    `);

  const chartGroupA = svg.append("g").attr("transform", `translate(${margin.left + radius}, ${margin.top + radius})`);
  const chartGroupB = svg.append("g").attr("transform", `translate(${margin.left + diameter + gap + radius}, ${margin.top + radius})`);

  chartGroupA.append('text').attr('class', 'location-title').attr('y', -radius - 35).attr('text-anchor', 'middle').style('font-size', '15px').style('font-weight', '700').style('fill', '#2f3746').text(legendNameA);
  chartGroupB.append('text').attr('class', 'location-title').attr('y', -radius - 35).attr('text-anchor', 'middle').style('font-size', '15px').style('font-weight', '700').style('fill', '#2f3746').text(legendNameB);

  const selectedTimeText = svg.append('text')
    .attr('class', 'selected-time-text')
    .attr('x', baseWidth / 2)
    .attr('y', 14)
    .attr('text-anchor', 'middle')
    .style('font-size', '9.5px')
    .style('font-weight', '600')
    .style('fill', '#495057');

  let currentIrradianceType = 'dni';
  const irradianceInfo = {
    dni: { key: 'directNormalRadiation', name: 'DNI', fullName: 'Direct Normal Irradiance' },
    ghi: { key: 'globalHorizontalRadiation', name: 'GHI', fullName: 'Global Horizontal Irradiance' },
    dhi: { key: 'diffuseHorizontalRadiation', name: 'DHI', fullName: 'Diffuse Horizontal Irradiance' }
  };
  const getRobustMax = (dataSets, key) => d3.quantileSorted(dataSets.flatMap(data => data.map(d => d[key])).sort(d3.ascending), 0.99);
  let irradianceMax = getRobustMax([dataA.data, dataB.data], irradianceInfo[currentIrradianceType].key);
  let colorScale = d3.scaleSequential(d3.interpolateTurbo).domain([0, irradianceMax]).clamp(true);
  const visibilityState = {
    showSelectedAzimuth: true, showSelectedAltitude: true, showSunSign: true,
    showSolsticePaths: true, showAnalemmas: true, showInfoPanel: true, showSelectedTime: true,
    colorAnalemmasByIrradiance: false
  };
  const getHourAngle = (date, lat, lon) => ((date.getTime() - SunCalc.getTimes(date, lat, lon).solarNoon.getTime()) / 36e5) * 15;
  const summerColor = '#e0554f';
  const winterColor = '#4a9fc2';
  const equinoxColor = '#5a9c5e';

  const drawSingleSunPath = (chartGroup, epwData) => {
    const location = epwData.metadata.location;
    const hourlyData = epwData.data;
    const year = new Date(hourlyData[0].datetime).getFullYear();
    const rScale = d3.scaleLinear().domain([0, 90]).range([radius, 0]);

  const getSunPositionForPlot = (date) => {
    const sun = getSolarPositionForChart(date, location.latitude, location.longitude);
    if (!sun) return null;
    const R = rScale (sun.altitude);
    return { x: R * sun.unitX, y: R * sun.unitY, azimuth: sun.azimuth, altitude: sun.altitude };
  };

    const grid = chartGroup.append('g').attr('class', 'sun-path-grid');
    grid.append('circle').attr('r', radius).attr('class', 'sun-path-bg').style('fill', 'url(#sun-path-sky-gradient-compare)').style('stroke', '#aeb4bd').style('stroke-width', 0.6);
    grid.append('g').attr('class', 'altitude-circles').selectAll('circle').data([10, 20, 30, 40, 50, 60, 70, 80]).join('circle').attr('r', d => rScale(d)).style('fill', 'none').style('stroke', '#c3c9d3').style('stroke-width', 0.5).style('stroke-dasharray', '1,4');
    grid.append('g').attr('class', 'altitude-labels').selectAll('text').data([10, 20, 30, 40, 50, 60, 70, 80]).join('text').attr('x', 5).attr('y', d => -rScale(d) + 8).style('font-size', '8px').style('font-weight', '500').style('fill', '#8a92a0').text(d => d + '°');
    grid.append('g').attr('class', 'azimuth-lines').selectAll('line').data(d3.range(0, 360, 15)).join('line').attr('x1', 0).attr('y1', 0).attr('x2', d => radius * Math.sin(d * Math.PI / 180)).attr('y2', d => -radius * Math.cos(d * Math.PI / 180)).style('stroke', '#d7dbe2').style('stroke-width', d => d % 90 === 0 ? 0.7 : 0.5).style('stroke-dasharray', d => d % 90 === 0 ? 'none' : '2,2');
    const directions = [{ label: 'N', angle: 0 }, { label: 'E', angle: 90 }, { label: 'S', angle: 180 }, { angle: 270, label: 'W' }];
    grid.append('g').attr('class', 'direction-labels').selectAll('text').data(directions).join('text').attr('x', d => (radius + 15) * Math.sin(d.angle * Math.PI / 180)).attr('y', d => -(radius + 15) * Math.cos(d.angle * Math.PI / 180)).attr('text-anchor', 'middle').attr('dominant-baseline', 'middle').style('font-size', '11px').style('font-weight', '700').style('fill', '#2f3746').text(d => d.label);
    grid.append('g').attr('class', 'azimuth-labels').selectAll('text').data(d3.range(0, 360, 30).filter(d => d % 90 !== 0)).join('text').attr('x', d => (radius + 12) * Math.sin(d * Math.PI / 180)).attr('y', d => -(radius + 12) * Math.cos(d * Math.PI / 180)).attr('text-anchor', 'middle').attr('dominant-baseline', 'middle').style('font-size', '9px').style('font-weight', '400').style('fill', '#8a92a0').text(d => `${d}°`);

    const pathGroup = chartGroup.append('g').attr('class', 'day-paths');
    const dayPathLine = d3.line().x(d => d.x).y(d => d.y).curve(d3.curveCatmullRom.alpha(0.5)).defined(d => d !== null);

    const isSouthernHemisphere = location.latitude < 0;

    const keyDates = [
      {
        date: isSouthernHemisphere ? new Date(year, 11, 21) : new Date(year, 5, 21),
        color: summerColor,
        class: 'summer-solstice'
      },
      {
        date: new Date(year, 2, 20),
        color: equinoxColor,
        class: 'spring-equinox'
      },
      {
        date: isSouthernHemisphere ? new Date(year, 5, 21) : new Date(year, 11, 21),
        color: winterColor,
        class: 'winter-solstice'
      }
    ];

    keyDates.forEach(dateInfo => { const pathData = d3.range(0, 24, 0.25).map(hour => { const testDate = new Date(dateInfo.date); testDate.setHours(Math.floor(hour), (hour % 1) * 60); return getSunPositionForPlot(testDate); }); if (pathData.filter(d => d).length > 1) { pathGroup.append('path').datum(pathData).attr('d', dayPathLine).style('fill', 'none').style('stroke', dateInfo.color).style('stroke-width', 1.4).style('filter', 'url(#sun-path-soft-shadow-compare)').attr('class', `sun-path-day-line ${dateInfo.class}`); } });

    const analemmaGroup = chartGroup.append('g').attr('class', 'analemmas');
    const analemmaGrayGroup = analemmaGroup.append('g').attr('class', 'analemma-gray-lines');
    const analemmaColorGroup = analemmaGroup.append('g').attr('class', 'analemma-color-lines').style('filter', 'url(#sun-path-analemma-soften-compare)');
    const hourlyGroups = d3.group(hourlyData, d => d.hour);
    const analemmaLine = d3.line().x(d => d.pos.x).y(d => d.pos.y).curve(d3.curveCatmullRom.alpha(0.5)).defined(d => d.pos !== null);
    const analemmaColorSegments = [];

    hourlyGroups.forEach(hourData => {
      const analemmaData = hourData.map(d => {
        const dt = d.datetime;
        const correctDate = createDateAsUTC(dt.getFullYear(), dt.getMonth() + 1, dt.getDate(), dt.getHours(), location.timeZone);
        return { ...d, pos: getSunPositionForPlot(correctDate) };
      }).filter(d => d.pos);

      if (analemmaData.length > 1) {
        analemmaGrayGroup.append('path')
          .datum(analemmaData)
          .attr('d', analemmaLine)
          .style('fill', 'none').style('stroke', '#a8adb6').style('stroke-width', '0.8px').style('opacity', 0.85);

        for (let i = 0; i < analemmaData.length - 1; i++) {
          const a = analemmaData[i];
          const b = analemmaData[i + 1];
          const segment = analemmaColorGroup.append('line')
            .attr('x1', a.pos.x).attr('y1', a.pos.y)
            .attr('x2', b.pos.x).attr('y2', b.pos.y)
            .style('stroke-width', '1.6px')
            .style('stroke-linecap', 'round')
            .style('opacity', 0.9);
          analemmaColorSegments.push({ segment, a, b });
        }
      }
    });

    const interactiveGroup = chartGroup.append('g').attr('class', 'interactive-elements');
    const altitudeCircle = interactiveGroup.append('circle').attr('class', 'altitude-circle').style('fill', 'none').style('stroke', '#e0554f').style('stroke-width', 1.1).style('stroke-dasharray', '5,3');
    const azimuthIndicator = interactiveGroup.append('circle').attr('class', 'azimuth-indicator').attr('r', 4).style('fill', '#e0554f').style('stroke', 'white').style('stroke-width', 1).style('filter', 'url(#sun-path-soft-shadow-compare)');

    const sunIconGroup = interactiveGroup.append('g').attr('class', 'current-sun-icon-anchor');
    const sunIconVisual = sunIconGroup.append('g').attr('class', 'current-sun-icon sp-hidden');
    sunIconVisual.append('circle').attr('class', 'sun-glow').attr('cx', 50).attr('cy', 50).attr('r', 30).style('filter', 'url(#sun-path-glow-compare)').style('opacity', 0.55);
    sunIconVisual.append('circle').attr('class', 'sun-core').attr('cx', 50).attr('cy', 50).attr('r', 25);
    const rayGroup = sunIconVisual.append('g').attr('class', 'flickering-rays');
    const raysData = [{ x1: 50, y1: 24, x2: 50, y2: 9 }, { x1: 50, y1: 76, x2: 50, y2: 91 }, { x1: 24, y1: 50, x2: 9, y2: 50 }, { x1: 76, y1: 50, x2: 91, y2: 50 }, { x1: 32.3, y1: 32.3, x2: 18.2, y2: 18.2 }, { x1: 67.7, y1: 67.7, x2: 81.8, y2: 81.8 }, { x1: 32.3, y1: 67.7, x2: 18.2, y2: 81.8 }, { x1: 67.7, y1: 32.3, x2: 81.8, y2: 18.2 }];
    rayGroup.selectAll('line.ray').data(raysData).join('line').attr('class', 'ray').style('stroke-width', 3).attr('x1', d => d.x1).attr('y1', d => d.y1).attr('x2', d => d.x2).attr('y2', d => d.y2);

    const sunIrradianceLabel = interactiveGroup.append('text')
      .attr('class', 'sun-irradiance-label')
      .attr('text-anchor', 'middle')
      .style('font-size', '9.5px')
      .style('font-weight', '700')
      .style('display', 'none');

    const belowHorizonGroup = interactiveGroup.append('g').attr('class', 'below-horizon-badge sp-hidden');
    belowHorizonGroup.append('circle').attr('cy', -12).attr('r', 9).style('fill', '#3d4a63');
    belowHorizonGroup.append('circle').attr('cx', 4).attr('cy', -15).attr('r', 8).style('fill', '#f8f9fa');
    belowHorizonGroup.append('text').attr('y', 10).attr('text-anchor', 'middle').style('font-size', '10px').style('font-weight', '600').style('fill', '#3d4a63').text('Sun below horizon');

    return { getSunPositionForPlot, rScale, interactiveGroup, sunIconGroup, sunIconVisual, sunIrradianceLabel, azimuthIndicator, altitudeCircle, belowHorizonGroup, analemmaGrayGroup, analemmaColorGroup, analemmaColorSegments };
  };

  const chartA = drawSingleSunPath(chartGroupA, dataA);
  const chartB = drawSingleSunPath(chartGroupB, dataB);

  const recolorAnalemmaSegments = () => {
    const info = irradianceInfo[currentIrradianceType];
    [chartA, chartB].forEach(chart => {
      chart.analemmaColorSegments.forEach(({ segment, a, b }) => {
        const value = ((a[info.key] || 0) + (b[info.key] || 0)) / 2;
        segment.style('stroke', colorScale(value));
      });
    });
  };
  recolorAnalemmaSegments();

  const secondLegendGroup = svg.append('g').attr('class', 'second-legend-group');

  const analemmaGradientId = 'sun-path-analemma-irradiance-gradient-compare';
  const analemmaGradient = defs.append('linearGradient').attr('id', analemmaGradientId).attr('x1', '0%').attr('x2', '100%').attr('y1', '0%').attr('y2', '0%');
  d3.range(0, 1.0001, 0.1).forEach(t => {
    analemmaGradient.append('stop').attr('offset', `${(t * 100).toFixed(0)}%`).attr('stop-color', d3.interpolateTurbo(t));
  });

  const irradianceLegendGroup = svg.append('g').attr('class', 'irradiance-legend-group');

  const legendItemDefs = [
    { key: 'showSolsticePaths', type: 'line', color: summerColor, text: 'Summer Solstice' },
    { key: 'showSolsticePaths', type: 'line', color: equinoxColor, text: 'Equinoxes' },
    { key: 'showSolsticePaths', type: 'line', color: winterColor, text: 'Winter Solstice' },
    { key: 'showAnalemmas', type: 'curve', color: '#999', text: 'Hourly Analemmas' },
    { key: 'showSelectedAzimuth', type: 'dot', color: '#e0554f', text: 'Azimuth' },
    { key: 'showSelectedAltitude', type: 'circle-dash', color: '#e0554f', text: 'Altitude' }
  ];

  const buildSunPathLegend = () => {
    secondLegendGroup.selectAll('*').remove();
    const items = legendItemDefs.filter(it => visibilityState[it.key]).map(it => {
      if (it.key === 'showAnalemmas' && visibilityState.colorAnalemmasByIrradiance) {
        return { ...it, color: `url(#${analemmaGradientId})`, text: `Hourly Analemmas (${irradianceInfo[currentIrradianceType].name})` };
      }
      return it;
    });
    if (!items.length) return 0;

    const maxRowWidth = baseWidth - 12;
    const rowGap = 14;

    const measureRow = (rowItems, iconW, iconGap, itemGap, fontSize) => {
      const groups = rowItems.map(it => {
        const g = secondLegendGroup.append('g').attr('class', 'legend-inline-item');
        if (it.type === 'line') {
          g.append('line').attr('x1', 0).attr('y1', 7).attr('x2', iconW).attr('y2', 7).style('stroke', it.color).style('stroke-width', 2);
        } else if (it.type === 'curve') {
          const cy = 7, amp = 4.5;
          g.append('path').attr('d', `M0,${cy} Q${iconW * 0.25},${cy - amp} ${iconW * 0.5},${cy} T${iconW},${cy}`)
            .style('stroke', it.color).style('stroke-width', 1.3).style('fill', 'none');
        } else if (it.type === 'dot') {
          g.append('circle').attr('cx', iconW / 2).attr('cy', 7).attr('r', 3.2).style('fill', it.color).style('stroke', 'white').style('stroke-width', 0.6);
        } else if (it.type === 'circle-dash') {
          g.append('circle').attr('cx', iconW / 2).attr('cy', 7).attr('r', 6).style('fill', 'none').style('stroke', it.color).style('stroke-width', 1.3).style('stroke-dasharray', '2,2');
        }
        const label = g.append('text').attr('x', iconW + iconGap).attr('y', 10).style('font-size', `${fontSize}px`).style('font-weight', '500').style('fill', '#495057').text(it.text);
        return { g, label };
      });
      let totalWidth = 0;
      const widths = groups.map(o => {
        const w = iconW + iconGap + o.label.node().getComputedTextLength();
        totalWidth += w;
        return w;
      });
      totalWidth += itemGap * (groups.length - 1);
      return { groups, widths, totalWidth };
    };

    let single = measureRow(items, 18, 5, 16, 10);
    if (single.totalWidth <= maxRowWidth) {
      let cursorX = (baseWidth - single.totalWidth) / 2;
      single.groups.forEach((o, i) => {
        o.g.attr('transform', `translate(${cursorX}, 0)`);
        cursorX += single.widths[i] + 16;
      });
      return 18;
    }

    secondLegendGroup.selectAll('*').remove();
    const mid = Math.ceil(items.length / 2);
    const rows = [items.slice(0, mid), items.slice(mid)];
    const iconW = 14, iconGap = 4, itemGap = 12, fontSize = 9;

    rows.forEach((rowItems, rowIndex) => {
      if (!rowItems.length) return;
      const row = measureRow(rowItems, iconW, iconGap, itemGap, fontSize);
      let cursorX = (baseWidth - row.totalWidth) / 2;
      row.groups.forEach((o, i) => {
        o.g.attr('transform', `translate(${cursorX}, ${rowIndex * rowGap})`);
        cursorX += row.widths[i] + itemGap;
      });
    });

    return rowGap + 14;
  };

  const buildIrradianceLegend = () => {
    irradianceLegendGroup.selectAll('*').remove();
    const info = irradianceInfo[currentIrradianceType];
    const barWidth = 160;
    const barHeight = 8;
    const barX = (baseWidth - barWidth) / 2;

    irradianceLegendGroup.append('text')
      .attr('x', baseWidth / 2).attr('y', 8).attr('text-anchor', 'middle')
      .style('font-size', '9px').style('font-weight', '600').style('fill', '#495057')
      .text(`Analemma Color Scale — ${info.name} (Wh/m²)`);

    irradianceLegendGroup.append('rect')
      .attr('x', barX).attr('y', 14).attr('width', barWidth).attr('height', barHeight)
      .attr('rx', 3).style('fill', `url(#${analemmaGradientId})`).style('stroke', '#c3c9d3').style('stroke-width', 0.5);

    irradianceLegendGroup.append('text')
      .attr('x', barX).attr('y', 14 + barHeight + 10).attr('text-anchor', 'start')
      .style('font-size', '8px').style('fill', '#8a92a0').text('0');

    irradianceLegendGroup.append('text')
      .attr('x', barX + barWidth).attr('y', 14 + barHeight + 10).attr('text-anchor', 'end')
      .style('font-size', '8px').style('fill', '#8a92a0').text(d3.format('.0f')(irradianceMax));

    return 14 + barHeight + 14;
  };

  const infoPanelDiv = mainContainer.append('div').attr('class', 'info-panel-container mt-3');
  const infoTableContainer = infoPanelDiv.append('div').attr('class', 'table-responsive');
  const infoTable = infoTableContainer.append('table').attr('class', 'sun-path-compare-table');

  const tableHeader = infoTable.append('thead').append('tr');
  tableHeader.append('th').attr('class', 'spt-label').text('Parameter');
  tableHeader.append('th').text(legendNameA);
  tableHeader.append('th').text(legendNameB);

  const tableBody = infoTable.append('tbody');
  const rowsData = [
    { label: 'Time Zone', id: 'time-zone' }, { label: 'Latitude', id: 'latitude' },
    { label: 'Longitude', id: 'longitude' }, { label: 'Sunrise', id: 'sunrise' },
    { label: 'Sunset', id: 'sunset' }, { label: 'Altitude', id: 'altitude' },
    { label: 'Azimuth', id: 'azimuth' }, { label: 'Hour Angle', id: 'hour-angle' },
    { label: 'DNI (Wh/m²)', id: 'dni' }, { label: 'DHI (Wh/m²)', id: 'dhi' },
    { label: 'GHI (Wh/m²)', id: 'ghi' }
  ];

  rowsData.forEach(rowData => {
    const row = tableBody.append('tr');
    row.append('td').attr('class', 'spt-label').text(rowData.label);
    row.append('td').attr('class', 'spt-value').attr('id', `info-${rowData.id}-a`);
    row.append('td').attr('class', 'spt-value').attr('id', `info-${rowData.id}-b`);
  });

  const updateInteractiveElements = (month, day, hour) => {
    const year = new Date(dataA.data[0].datetime).getFullYear();

    selectedTimeText.text(`Selected Time: ${d3.timeFormat('%B %d, %H:%M')(new Date(year, month - 1, day, hour))}`);

    const updateLocation = (epwData, chart, suffix) => {
      const loc = epwData.metadata.location;
      const selDate = createDateAsUTC(year, month, day, hour, loc.timeZone); 
      const sunPos = chart.getSunPositionForPlot(selDate);
      const epwHourData = epwData.data.find(h =>
        (h.datetime.getMonth() + 1) === month &&
        h.datetime.getDate() === day &&
        h.datetime.getHours() === hour
      );

      const info = irradianceInfo[currentIrradianceType];
      let sunColor = null;
      if (sunPos) {
        const irradianceValue = epwHourData ? epwHourData[info.key] : 0;
        sunColor = colorScale(irradianceValue);
        chart.sunIconGroup.attr('transform', `translate(${sunPos.x}, ${sunPos.y}) scale(0.25) translate(-50, -50)`);
        chart.sunIconVisual.selectAll('circle').style('fill', sunColor);
        chart.sunIconVisual.selectAll('line').style('stroke', sunColor);
        const azimuthRad = sunPos.azimuth * Math.PI / 180;
        chart.azimuthIndicator.attr('cx', radius * Math.sin(azimuthRad)).attr('cy', -radius * Math.cos(azimuthRad));
        chart.altitudeCircle.attr('r', chart.rScale(sunPos.altitude));
      }
      chart.azimuthIndicator.style('display', sunPos && visibilityState.showSelectedAzimuth ? 'block' : 'none');
      chart.altitudeCircle.style('display', sunPos && visibilityState.showSelectedAltitude ? 'block' : 'none');
      chart.sunIconVisual.classed('sp-hidden', !(sunPos && visibilityState.showSunSign));
      chart.sunIconVisual.classed('sp-irradiance-emphasis', visibilityState.colorAnalemmasByIrradiance);
      chart.belowHorizonGroup.classed('sp-hidden', !(!sunPos && visibilityState.showSunSign));

      if (sunPos && visibilityState.showSunSign) {
        chart.sunIrradianceLabel
          .attr('x', sunPos.x)
          .attr('y', sunPos.y + 22)
          .style('fill', sunColor)
          .style('display', 'block')
          .text(`${info.name}: ${epwHourData ? d3.format('.0f')(epwHourData[info.key]) : 'N/A'} Wh/m²`);
      } else {
        chart.sunIrradianceLabel.style('display', 'none');
      }

      const dayTimes = SunCalc.getTimes(selDate, loc.latitude, loc.longitude);
      d3.select(`#info-time-zone-${suffix}`).text(`GMT${loc.timeZone >= 0 ? '+' : ''}${loc.timeZone}`);
      d3.select(`#info-latitude-${suffix}`).text(`${loc.latitude.toFixed(2)}°`);
      d3.select(`#info-longitude-${suffix}`).text(`${loc.longitude.toFixed(2)}°`);
      const tzOffsetMilliseconds = loc.timeZone * 3600 * 1000;

      const sunriseInLST = new Date(dayTimes.sunrise.getTime() + tzOffsetMilliseconds);
      const sunsetInLST = new Date(dayTimes.sunset.getTime() + tzOffsetMilliseconds);

      d3.select(`#info-sunrise-${suffix}`).text(d3.utcFormat('%H:%M')(sunriseInLST));
      d3.select(`#info-sunset-${suffix}`).text(d3.utcFormat('%H:%M')(sunsetInLST));

      const dayFraction = (d) => (d.getUTCHours() + d.getUTCMinutes() / 60) / 24;
      const sunriseFraction = isNaN(sunriseInLST.getTime()) ? null : dayFraction(sunriseInLST);
      const sunsetFraction = isNaN(sunsetInLST.getTime()) ? null : dayFraction(sunsetInLST);
      let isPolarDay = null;
      if (sunriseFraction === null || sunsetFraction === null) {
        const noonDate = createDateAsUTC(year, month, day, 12, loc.timeZone);
        isPolarDay = !!chart.getSunPositionForPlot(noonDate);
      }
      const bar = document.getElementById(`sun-path-daynight-bar-${suffix}`);
      if (bar) {
        if (sunriseFraction !== null && sunsetFraction !== null) {
          const sunrisePct = (sunriseFraction * 100).toFixed(2);
          const sunsetPct = (sunsetFraction * 100).toFixed(2);
          bar.style.background = `linear-gradient(to right, #384456 0%, #384456 ${sunrisePct}%, #ffc857 ${sunrisePct}%, #ffc857 ${sunsetPct}%, #384456 ${sunsetPct}%, #384456 100%)`;
        } else {
          bar.style.background = isPolarDay ? '#ffc857' : '#384456';
        }
      }
      const marker = document.getElementById(`sun-path-daynight-marker-${suffix}`);
      if (marker) marker.style.left = `${(hour / 24) * 100}%`;

      if (sunPos) {
        d3.select(`#info-azimuth-${suffix}`).text(`${sunPos.azimuth.toFixed(1)}°`);
        d3.select(`#info-altitude-${suffix}`).text(`${sunPos.altitude.toFixed(1)}°`);
        d3.select(`#info-hour-angle-${suffix}`).text(`${getHourAngle(selDate, loc.latitude, loc.longitude).toFixed(1)}°`);
        d3.select(`#info-dni-${suffix}`).text(epwHourData ? `${epwHourData.directNormalRadiation}` : 'N/A');
        d3.select(`#info-dhi-${suffix}`).text(epwHourData ? `${epwHourData.diffuseHorizontalRadiation}` : 'N/A');
        d3.select(`#info-ghi-${suffix}`).text(epwHourData ? `${epwHourData.globalHorizontalRadiation}` : 'N/A');
      } else {
        [`#info-azimuth-${suffix}`, `#info-altitude-${suffix}`, `#info-hour-angle-${suffix}`, `#info-dni-${suffix}`, `#info-dhi-${suffix}`, `#info-ghi-${suffix}`].forEach(idVal => d3.select(idVal).text('Below Horizon'));
      }
    };
    updateLocation(dataA, chartA, 'a');
    updateLocation(dataB, chartB, 'b');
  };

  const updateStaticTextAndScale = () => {
    const info = irradianceInfo[currentIrradianceType];
    chartTitleElement.text('Annual Sun Path Comparison');
    irradianceMax = getRobustMax([dataA.data, dataB.data], info.key);
    colorScale.domain([0, irradianceMax]);
  };

  chartRefs.sunpath = {
    update: (options = {}) => {
      Object.assign(visibilityState, options);

      const diagramClearance = 10;
      const diagramBottomY = margin.top + diameter + diagramClearance;
      let totalHeight = diagramBottomY + margin.bottom;

      let legendBottomY = diagramBottomY + margin.bottom;
      const legendItems = legendItemDefs.filter(it => visibilityState[it.key]);
      if (legendItems.length) {
        secondLegendGroup.style('display', 'block')
          .attr('transform', `translate(0, ${legendBottomY})`);
        const legendHeight = buildSunPathLegend();
        legendBottomY += legendHeight;
        totalHeight = legendBottomY;
      } else {
        secondLegendGroup.style('display', 'none');
      }

      const showIrradianceLegend = visibilityState.showAnalemmas && visibilityState.colorAnalemmasByIrradiance;
      if (showIrradianceLegend) {
        irradianceLegendGroup.style('display', 'block')
          .attr('transform', `translate(0, ${legendBottomY + 6})`);
        const irrLegendHeight = buildIrradianceLegend();
        totalHeight = legendBottomY + 6 + irrLegendHeight;
      } else {
        irradianceLegendGroup.style('display', 'none');
      }

      svg.attr("viewBox", `0 0 ${baseWidth} ${totalHeight}`);

      infoPanelDiv.style('display', visibilityState.showInfoPanel ? 'block' : 'none');
      selectedTimeText.style('display', visibilityState.showSelectedTime ? 'block' : 'none');

      [chartGroupA, chartGroupB].forEach(chartGroup => {
        const setVisible = (selectorVal, isVisible) => chartGroup.select(selectorVal).style('display', isVisible ? 'block' : 'none');
        setVisible('.day-paths', visibilityState.showSolsticePaths);
        setVisible('.analemmas', visibilityState.showAnalemmas);
      });

      [chartA, chartB].forEach(chart => {
        chart.analemmaGrayGroup.style('display', visibilityState.colorAnalemmasByIrradiance ? 'none' : 'block');
        chart.analemmaColorGroup.style('display', visibilityState.colorAnalemmasByIrradiance ? 'block' : 'none');
      });
      if (visibilityState.colorAnalemmasByIrradiance) {
        recolorAnalemmaSegments();
      }

      const month = +d3.select('#sun-path-month-slider-compare').property('value');
      const day = +d3.select('#sun-path-day-slider-compare').property('value');
      const hour = +d3.select('#sun-path-hour-slider-compare').property('value');
      updateInteractiveElements(month, day, hour);
    },
    updateInteractive: (month, day, hour) => {
      updateInteractiveElements(month, day, hour);
    },
    updateIrradianceType: (newType) => {
      currentIrradianceType = newType;
      updateStaticTextAndScale();
      if (visibilityState.colorAnalemmasByIrradiance) {
        recolorAnalemmaSegments();
        if (visibilityState.showAnalemmas) {
          buildIrradianceLegend();
        }
      }
      const month = +d3.select('#sun-path-month-slider-compare').property('value');
      const day = +d3.select('#sun-path-day-slider-compare').property('value');
      const hour = +d3.select('#sun-path-hour-slider-compare').property('value');
      updateInteractiveElements(month, day, hour);
    }
  };

  updateStaticTextAndScale();
  setTimeout(() => {
    if (chartRefs.sunpath && chartRefs.sunpath.update) {
      chartRefs.sunpath.update();
    }
    if (d3.select('#sun-path-month-slider-compare').node()) {
      const month = +d3.select('#sun-path-month-slider-compare').property('value');
      const day = +d3.select('#sun-path-day-slider-compare').property('value');
      const hour = +d3.select('#sun-path-hour-slider-compare').property('value');
      if (chartRefs.sunpath && chartRefs.sunpath.updateInteractive) {
        chartRefs.sunpath.updateInteractive(month, day, hour);
      }
    }
  }, 100);
}