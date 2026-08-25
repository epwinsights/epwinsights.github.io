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

export function renderSunPathChart(epwData, chartRefs) {
  renderSunPathDiagram('#sun-path-chart', epwData, chartRefs);
  const epwYear = (epwData.data && epwData.data.length)
    ? new Date(epwData.data[0].datetime).getFullYear()
    : new Date().getFullYear();
  renderSunPathControls('.tab-pane.active .left-panel', chartRefs, epwYear, epwData.metadata.location.latitude);
}

export function renderSunPathControls(panelSelector, chartRefs, epwYear, latitude = 0) {

  const sliderYear = epwYear || new Date().getFullYear();
  const isSouthernHemisphere = latitude < 0;
  const panel = d3.select(panelSelector).html('');

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

  const slidersGroup = panel.append('div').attr('class', 'chart-controls-group');
  slidersGroup.append('h6').text('Date & Time Selection');

  const quickJumpContainer = slidersGroup.append('div')
    .attr('class', 'sun-path-quick-jump')
    .style('display', 'flex')
    .style('flex-wrap', 'nowrap')
    .style('gap', '4px')
    .style('margin-bottom', '10px');

  const slidersContainer = slidersGroup.append('div').attr('class', 'sliders-container-left-panel');
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const createSlider = (parent, { label, id, min, max, value, step = 1, onInput }) => {
    const container = parent.append('div').attr('class', 'sp-slider-item');
    const header = container.append('div').attr('class', 'sp-slider-header');
    header.append('label').attr('for', id).text(label);
    const valueDisplay = header.append('span').attr('id', `${id}-value`).attr('class', 'sp-slider-value');

    const slider = container.append('input')
      .attr('type', 'range')
      .attr('id', id)
      .attr('class', id === 'hour-slider' ? 'sp-slider sp-slider--hour' : 'sp-slider')
      .attr('min', min)
      .attr('max', max)
      .attr('value', value)
      .attr('step', step);

    slider.on('input', function () {
      const currentValue = +d3.select(this).property('value');
      if (id === 'month-slider') {
        valueDisplay.text(monthNames[currentValue - 1]);
        const daysInMonth = new Date(sliderYear, currentValue, 0).getDate();
        d3.select('#day-slider').attr('max', daysInMonth);
        const daySlider = d3.select('#day-slider');
        if (+daySlider.property('value') > daysInMonth) {
          daySlider.property('value', daysInMonth);
          d3.select('#day-slider-value').text(daysInMonth);
        }
      } else {
        valueDisplay.text(currentValue);
      }
      onInput();
    });

    if (id === 'month-slider') {
      valueDisplay.text(monthNames[value - 1]);
    } else {
      valueDisplay.text(value);
    }
    return { slider, container };
  };

  const showHideGroup = panel.append('div').attr('class', 'chart-controls-group');
  showHideGroup.append('h6').text('Show/Hide Items');
  const controlsContainer = showHideGroup.append('div').attr('class', 'controls-list');

  const chartComponents = [
    { id: 'toggle-solstice-lines', key: 'showSolsticePaths', label: 'Solstice & Equinox Paths' },
    { id: 'toggle-analemmas', key: 'showAnalemmas', label: 'Hourly Analemmas' }
  ];

  chartComponents.forEach(comp => {
    const item = controlsContainer.append('div').attr('class', 'control-item');
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

  const analysisToggleItem = controlsContainer.append('div').attr('class', 'control-item');
  const analysisSwitchContainer = analysisToggleItem.append('div').attr('class', 'form-check form-switch');
  analysisSwitchContainer.append('input')
    .attr('class', 'form-check-input')
    .attr('type', 'checkbox')
    .attr('id', 'toggle-analysis-details')
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
    .attr('for', 'toggle-analysis-details')
    .text('Sun Info Panel');

  const analemmaColorItem = controlsContainer.append('div').attr('class', 'control-item');
  const analemmaColorSwitchContainer = analemmaColorItem.append('div').attr('class', 'form-check form-switch');
  analemmaColorSwitchContainer.append('input')
    .attr('class', 'form-check-input')
    .attr('type', 'checkbox')
    .attr('id', 'toggle-analemma-irradiance-color')
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
    .attr('for', 'toggle-analemma-irradiance-color')
    .text('Color Analemmas by Irradiance');

  const irradianceGroup = panel.append('div').attr('class', 'chart-controls-group');
  irradianceGroup.append('h6').text('Irradiance Data Type');
  const irradianceContainer = irradianceGroup.append('div').attr('class', 'controls-list radio-group');

  const updateIrradianceGroupVisibility = () => {
    const sunInfoOn = d3.select('#toggle-analysis-details').property('checked');
    const analemmaColorOn = d3.select('#toggle-analemma-irradiance-color').property('checked');
    irradianceGroup.style('display', (sunInfoOn || analemmaColorOn) ? 'block' : 'none');
  };

  const irradianceTypes = [
    { id: 'dni', label: 'Direct Normal Irradiance (DNI)', checked: true },
    { id: 'ghi', label: 'Global Horizontal Irradiance (GHI)', checked: false },
    { id: 'dhi', label: 'Diffuse Horizontal Irradiance (DHI)', checked: false }
  ];

  irradianceTypes.forEach(type => {
    const item = irradianceContainer.append('div').attr('class', 'control-item');
    const radioContainer = item.append('div').attr('class', 'form-check');

    radioContainer.append('input')
      .attr('class', 'form-check-input')
      .attr('type', 'radio')
      .attr('name', 'irradiance-type')
      .attr('id', `radio-${type.id}`)
      .attr('value', type.id)
      .property('checked', type.checked)
      .on('change', function () {
        if (chartRefs.sunpath && chartRefs.sunpath.updateIrradianceType) {
          chartRefs.sunpath.updateIrradianceType(this.value);
        }
      });

    radioContainer.append('label')
      .attr('class', 'form-check-label')
      .attr('for', `radio-${type.id}`)
      .text(type.label);
  });

  const ackGroup = panel.append('div').attr('class', 'chart-controls-group');
  ackGroup.append('h6').text('Notes & Credits');
  const infoNote = ackGroup.append('p').attr('class', 'info-note');
  infoNote.html(`
      <li class="mb-2">Solar radiation values (DNI, DHI, GHI) are read directly from the EPW weather file and represent the total energy (Wh/m²) accumulated during the one-hour period preceding the indicated time.</li>
      <li class="mb-2">This chart is a custom visualization blending solar-position mechanics with EPW irradiance data. Sun-position calculations (azimuth, altitude, sunrise/sunset) are powered by the <code>SunCalc</code> library, created by Vladimir Agafonkin. <a href="https://github.com/mourner/suncalc" target="_blank">Learn more</a></li>
  `);
  const onSliderInput = () => {
    if (chartRefs.sunpath && chartRefs.sunpath.updateInteractive) {
      const month = +d3.select('#month-slider').property('value');
      const day = +d3.select('#day-slider').property('value');
      const hour = +d3.select('#hour-slider').property('value');
      chartRefs.sunpath.updateInteractive(month, day, hour);
    }
  };

  const initialMonth = 6;
  const initialDay = 21;
  const daysInInitialMonth = new Date(sliderYear, initialMonth, 0).getDate();

  createSlider(slidersContainer, { label: 'Month', id: 'month-slider', min: 1, max: 12, value: initialMonth, onInput: onSliderInput });
  createSlider(slidersContainer, { label: 'Day', id: 'day-slider', min: 1, max: daysInInitialMonth, value: initialDay, onInput: onSliderInput });
  const { container: hourSliderContainer } = createSlider(slidersContainer, { label: 'Hour', id: 'hour-slider', min: 0, max: 23, value: 12, onInput: onSliderInput });

  hourSliderContainer.append('div')
    .attr('class', 'sp-slider-ticks')
    .html('<span>0h</span><span>12h</span><span>24h</span>');

  const jumpToDate = (month, day, hour) => {
    d3.select('#month-slider').property('value', month);
    d3.select('#month-slider-value').text(monthNames[month - 1]);

    const daysInMonth = new Date(sliderYear, month, 0).getDate();
    const clampedDay = Math.min(day, daysInMonth);
    d3.select('#day-slider').attr('max', daysInMonth).property('value', clampedDay);
    d3.select('#day-slider-value').text(clampedDay);

    if (hour !== undefined) {
      d3.select('#hour-slider').property('value', hour);
      d3.select('#hour-slider-value').text(hour);
    }

    onSliderInput();
  };

  const quickJumpItems = [
    {
      label: 'Summer',
      title: `Summer Solstice (${monthNames[(isSouthernHemisphere ? 12 : 6) - 1]} 21)`,
      getDate: () => ({ month: isSouthernHemisphere ? 12 : 6, day: 21, hour: 12 })
    },
    {
      label: 'Equinox',
      title: 'Equinox (March 20)',
      getDate: () => ({ month: 3, day: 20, hour: 12 })
    },
    {
      label: 'Winter',
      title: `Winter Solstice (${monthNames[(isSouthernHemisphere ? 6 : 12) - 1]} 21)`,
      getDate: () => ({ month: isSouthernHemisphere ? 6 : 12, day: 21, hour: 12 })
    },
    {
      label: 'Now',
      title: "Current date & time (your device's local clock, not the EPW file's time zone)",
      getDate: () => { const now = new Date(); return { month: now.getMonth() + 1, day: now.getDate(), hour: now.getHours() }; }
    }
  ];

  quickJumpItems.forEach(item => {
    quickJumpContainer.append('button')
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
        jumpToDate(month, day, hour);
      });
  });

  updateIrradianceGroupVisibility();

  if (chartRefs.sunpath.updateInteractive) {
    onSliderInput();
  }
}

export function renderSunPathDiagram(selector, epwData, chartRefs) {
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
  const hourlyData = epwData.data;
  const location = epwData.metadata.location;
  const formattedLocationSimple = formatSimpleLocation(location.city, location.country, 'primary');
  const shortLocationSimple = formatCityNameOnly(location.city, 'primary');

  addExportButton(selector, 'annual-sun-path', formattedLocationSimple);
  addInfoButton(selector, 'sunPath');
  if (mainContainer.node().getBoundingClientRect().width === 0) return;

  const chartTitleElement = mainContainer.append('h5').attr('class', 'chart-title-main');
  const svgWrapper = mainContainer.append('div').attr('id', 'sun-path-svg-wrapper');
  svgWrapper
    .style('max-width', '55%')
    .style('margin', '0 auto')
    .style('transition', 'max-width 0.2s ease-in-out');
  const infoPanelContainer = mainContainer.append('div').attr('class', 'sun-path-bottom-panel');

  const diameter = 320;
  const radius = diameter / 2;
  const margin = { top: 25, right: 25, bottom: 15, left: 25 };
  const baseWidth = diameter + margin.left + margin.right;

  const selectedTimeHeight = 20;

  const svg = svgWrapper.append("svg")
    .attr("viewBox", `0 0 ${baseWidth} ${diameter}`)
    .attr("font-family", `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`);

  const defs = svg.append('defs');

  const skyGradient = defs.append('radialGradient').attr('id', 'sun-path-sky-gradient').attr('cx', '50%').attr('cy', '38%').attr('r', '75%');
  skyGradient.append('stop').attr('offset', '0%').attr('stop-color', '#fcfdfe');
  skyGradient.append('stop').attr('offset', '65%').attr('stop-color', '#f4f6f9');
  skyGradient.append('stop').attr('offset', '100%').attr('stop-color', '#e7eaf0');

  const glowFilter = defs.append('filter').attr('id', 'sun-path-glow').attr('x', '-100%').attr('y', '-100%').attr('width', '300%').attr('height', '300%');
  glowFilter.append('feGaussianBlur').attr('stdDeviation', 6).attr('result', 'blur');
  const glowMerge = glowFilter.append('feMerge');
  glowMerge.append('feMergeNode').attr('in', 'blur');
  glowMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  const softShadowFilter = defs.append('filter').attr('id', 'sun-path-soft-shadow').attr('x', '-40%').attr('y', '-40%').attr('width', '180%').attr('height', '180%');
  softShadowFilter.append('feDropShadow').attr('dx', 0).attr('dy', 0.5).attr('stdDeviation', 0.6).attr('flood-color', '#000000').attr('flood-opacity', 0.18);

  const analemmaSoftenFilter = defs.append('filter').attr('id', 'sun-path-analemma-soften').attr('x', '-15%').attr('y', '-15%').attr('width', '130%').attr('height', '130%');
  analemmaSoftenFilter.append('feGaussianBlur').attr('stdDeviation', 0.45);


  defs.append('style').text(`
        .sun-path-info-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; margin: 6px 0 2px; }
        .sun-path-info-table td { padding: 5px 4px; border-bottom: 1px solid #e9ecef; text-align: center; }
        .sun-path-info-table td.spt-label { color: #6c757d; font-weight: 500; white-space: nowrap; }
        .sun-path-info-table td.spt-value { color: #2f3746; font-weight: 700; white-space: nowrap; }
        .sun-path-info-table tr:last-child td { border-bottom: none; }
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

  const chartGroup = svg.append("g")
    .attr("transform", `translate(${baseWidth / 2}, ${margin.top + selectedTimeHeight + radius})`);
  const year = new Date(hourlyData[0].datetime).getFullYear();
  const r = d3.scaleLinear().domain([0, 90]).range([radius, 0]);

  let currentIrradianceType = 'dni';
  const irradianceInfo = {
    dni: { key: 'directNormalRadiation', name: 'DNI', fullName: 'Direct Normal Irradiance' },
    ghi: { key: 'globalHorizontalRadiation', name: 'GHI', fullName: 'Global Horizontal Irradiance' },
    dhi: { key: 'diffuseHorizontalRadiation', name: 'DHI', fullName: 'Diffuse Horizontal Irradiance' }
  };
  const getRobustMax = (data, key) => d3.quantileSorted(data.map(d => d[key]).sort(d3.ascending), 0.99);
  let irradianceMax = getRobustMax(hourlyData, irradianceInfo[currentIrradianceType].key);
  let colorScale = d3.scaleSequential(d3.interpolateTurbo).domain([0, irradianceMax]).clamp(true);
  const visibilityState = {
    showSelectedAzimuth: true, showSelectedAltitude: true, showSunSign: true,
    showSolsticePaths: true, showAnalemmas: true, showInfoPanel: true, showSelectedTime: true,
    colorAnalemmasByIrradiance: false
  };

  const getSunPositionForPlot = (date) => {
    const sun = getSolarPositionForChart(date, location.latitude, location.longitude);
    if (!sun) return null;
    const R = r(sun.altitude);
    return { x: R * sun.unitX, y: R * sun.unitY, azimuth: sun.azimuth, altitude: sun.altitude };
  };
  const getHourAngle = (date, lat, lon) => ((date.getTime() - SunCalc.getTimes(date, lat, lon).solarNoon.getTime()) / 36e5) * 15;
  const grid = chartGroup.append('g').attr('class', 'sun-path-grid');
  grid.append('circle').attr('r', radius).attr('class', 'sun-path-bg').style('fill', 'url(#sun-path-sky-gradient)').style('stroke', '#aeb4bd').style('stroke-width', 0.6);
  grid.append('g').attr('class', 'altitude-circles').selectAll('circle').data([10, 20, 30, 40, 50, 60, 70, 80]).join('circle').attr('r', d => r(d)).style('fill', 'none').style('stroke', '#c3c9d3').style('stroke-width', 0.5).style('stroke-dasharray', '1,4');
  grid.append('g').attr('class', 'altitude-labels').selectAll('text').data([10, 20, 30, 40, 50, 60, 70, 80]).join('text').attr('x', 5).attr('y', d => -r(d) + 8).style('font-size', '8px').style('font-weight', '500').style('fill', '#8a92a0').text(d => d + '°');
  grid.append('g').attr('class', 'azimuth-lines').selectAll('line').data(d3.range(0, 360, 15)).join('line').attr('x1', 0).attr('y1', 0).attr('x2', d => radius * Math.sin(d * Math.PI / 180)).attr('y2', d => -radius * Math.cos(d * Math.PI / 180)).style('stroke', '#d7dbe2').style('stroke-width', d => d % 90 === 0 ? 0.7 : 0.5).style('stroke-dasharray', d => d % 90 === 0 ? 'none' : '2,2');
  const directions = [{ label: 'N', angle: 0 }, { label: 'E', angle: 90 }, { label: 'S', angle: 180 }, { label: 'W', angle: 270 }];
  grid.append('g').attr('class', 'direction-labels').selectAll('text').data(directions).join('text').attr('x', d => (radius + 15) * Math.sin(d.angle * Math.PI / 180)).attr('y', d => -(radius + 15) * Math.cos(d.angle * Math.PI / 180)).attr('text-anchor', 'middle').attr('dominant-baseline', 'middle').style('font-size', '11px').style('font-weight', '700').style('fill', '#2f3746').text(d => d.label);
  grid.append('g').attr('class', 'azimuth-labels').selectAll('text').data(d3.range(0, 360, 30).filter(d => d % 90 !== 0)).join('text').attr('x', d => (radius + 12) * Math.sin(d * Math.PI / 180)).attr('y', d => -(radius + 12) * Math.cos(d * Math.PI / 180)).attr('text-anchor', 'middle').attr('dominant-baseline', 'middle').style('font-size', '9px').style('font-weight', '400').style('fill', '#8a92a0').text(d => `${d}°`);
  const pathGroup = chartGroup.append('g').attr('class', 'day-paths');
  const dayPathLine = d3.line().x(d => d.x).y(d => d.y).curve(d3.curveCatmullRom.alpha(0.5)).defined(d => d !== null);

  const isSouthernHemisphere = location.latitude < 0;
  const summerColor = '#e0554f';
  const winterColor = '#4a9fc2';
  const equinoxColor = '#5a9c5e';

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

  keyDates.forEach(dateInfo => { const pathData = d3.range(0, 24, 0.25).map(hour => { const testDate = new Date(dateInfo.date); testDate.setHours(Math.floor(hour), (hour % 1) * 60); return getSunPositionForPlot(testDate); }); if (pathData.filter(d => d).length > 1) { pathGroup.append('path').datum(pathData).attr('d', dayPathLine).style('fill', 'none').style('stroke', dateInfo.color).style('stroke-width', 1.4).style('filter', 'url(#sun-path-soft-shadow)').attr('class', `sun-path-day-line ${dateInfo.class}`); } });
  const analemmaGroup = chartGroup.append('g').attr('class', 'analemmas');
  const analemmaGrayGroup = analemmaGroup.append('g').attr('class', 'analemma-gray-lines');
  const analemmaColorGroup = analemmaGroup.append('g').attr('class', 'analemma-color-lines').style('filter', 'url(#sun-path-analemma-soften)');
  const hourlyGroups = d3.group(hourlyData, d => d.hour);
  const analemmaLine = d3.line().x(d => d.pos.x).y(d => d.pos.y).curve(d3.curveCatmullRom.alpha(0.5)).defined(d => d.pos !== null);
  const analemmaColorSegments = [];
  hourlyGroups.forEach(hourData => {
    // Note: night/zero-irradiance hours are excluded below via the `d.pos`
    // filter (getSunPositionForPlot returns null when the sun is below the
    // horizon). Radiation values coming out of epw-parser.js are never
    // negative, so a `>= 0` irradiance filter here would be a no-op and was
    // removed to avoid implying it does any filtering.
    const analemmaData = hourData
      .map(d => {
        const dt = d.datetime;
        const correctDate = createDateAsUTC(dt.getFullYear(), dt.getMonth() + 1, dt.getDate(), dt.getHours(), location.timeZone);
        return { ...d, pos: getSunPositionForPlot(correctDate) };
      }).filter(d => d.pos);
    if (analemmaData.length > 1) {
      analemmaGrayGroup.append('path').datum(analemmaData).attr('d', analemmaLine).style('fill', 'none').style('stroke', '#a8adb6').style('stroke-width', '0.8px').style('opacity', 0.85);

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
  const recolorAnalemmaSegments = () => {
    const info = irradianceInfo[currentIrradianceType];
    analemmaColorSegments.forEach(({ segment, a, b }) => {
      const value = ((a[info.key] || 0) + (b[info.key] || 0)) / 2;
      segment.style('stroke', colorScale(value));
    });
  };
  recolorAnalemmaSegments();
  const interactiveGroup = chartGroup.append('g').attr('class', 'interactive-elements');
  const altitudeCircle = interactiveGroup.append('circle').attr('class', 'altitude-circle').style('fill', 'none').style('stroke', '#e0554f').style('stroke-width', 1.1).style('stroke-dasharray', '5,3');
  const azimuthIndicator = interactiveGroup.append('circle').attr('class', 'azimuth-indicator').attr('r', 4).style('fill', '#e0554f').style('stroke', 'white').style('stroke-width', 1).style('filter', 'url(#sun-path-soft-shadow)');
  const sunIconGroup = interactiveGroup.append('g').attr('class', 'current-sun-icon-anchor');
  const sunIconVisual = sunIconGroup.append('g').attr('class', 'current-sun-icon');
  sunIconVisual.append('circle').attr('class', 'sun-glow').attr('cx', 50).attr('cy', 50).attr('r', 30).style('filter', 'url(#sun-path-glow)').style('opacity', 0.55);
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

  const selectedTimeText = svg.append('text')
    .attr('class', 'selected-time-text')
    .attr('x', baseWidth / 2)
    .attr('y', 8)
    .attr('text-anchor', 'middle')
    .style('font-size', '9.5px')
    .style('font-weight', '600')
    .style('fill', '#495057');

  const secondLegendGroup = svg.append('g').attr('class', 'second-legend-group');

  const analemmaGradientId = 'sun-path-analemma-irradiance-gradient';
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

  const infoTable = infoPanelContainer.append('table').attr('class', 'sun-path-info-table');
  const infoTableBody = infoTable.append('tbody');

  const rowsData = [
    { label: 'Location', id: 'location' },
    { label: 'Time Zone', id: 'time-zone' },
    { label: 'Latitude', id: 'latitude' },
    { label: 'Longitude', id: 'longitude' },
    { label: 'Sunrise', id: 'sunrise' },
    { label: 'Sunset', id: 'sunset' },
    { label: 'Altitude', id: 'altitude' },
    { label: 'Azimuth', id: 'azimuth' },
    { label: 'Hour Angle', id: 'hour-angle' },
    { label: 'DNI (Wh/m²)', id: 'dni' },
    { label: 'DHI (Wh/m²)', id: 'dhi' },
    { label: 'GHI (Wh/m²)', id: 'ghi' }
  ];

  for (let i = 0; i < rowsData.length; i += 4) {
    const tr = infoTableBody.append('tr');
    rowsData.slice(i, i + 4).forEach(rowData => {
      tr.append('td').attr('class', 'spt-label').text(rowData.label);
      tr.append('td').attr('class', 'spt-value').attr('id', `info-${rowData.id}`).text('N/A');
    });
  }

  d3.select('#info-location').text(shortLocationSimple);
  d3.select('#info-time-zone').text(`GMT${location.timeZone > 0 ? '+' : ''}${location.timeZone}`);
  d3.select('#info-latitude').text(`${location.latitude.toFixed(2)}°`);
  d3.select('#info-longitude').text(`${location.longitude.toFixed(2)}°`);

  const updateInteractiveElements = (month, day, hour) => {
    const selectedDate = createDateAsUTC(year, month, day, hour, location.timeZone);
    const sunPos = getSunPositionForPlot(selectedDate);
    const epwHourData = hourlyData.find(h =>
      (h.datetime.getMonth() + 1) === month &&
      h.datetime.getDate() === day &&
      h.datetime.getHours() === hour
    );
    const info = irradianceInfo[currentIrradianceType];
    let sunColor = null;
    if (sunPos) {
      const irradianceValue = epwHourData ? epwHourData[info.key] : 0;
      sunColor = colorScale(irradianceValue);
      sunIconGroup.attr('transform', `translate(${sunPos.x}, ${sunPos.y}) scale(0.25) translate(-50, -50)`);
      sunIconVisual.selectAll('circle').style('fill', sunColor);
      sunIconVisual.selectAll('line').style('stroke', sunColor);
      const azimuthRad = sunPos.azimuth * Math.PI / 180;
      azimuthIndicator.attr('cx', radius * Math.sin(azimuthRad)).attr('cy', -radius * Math.cos(azimuthRad));
      altitudeCircle.attr('r', r(sunPos.altitude));
    }
    azimuthIndicator.style('display', sunPos && visibilityState.showSelectedAzimuth ? 'block' : 'none');
    altitudeCircle.style('display', sunPos && visibilityState.showSelectedAltitude ? 'block' : 'none');
    sunIconVisual.classed('sp-hidden', !(sunPos && visibilityState.showSunSign));
    belowHorizonGroup.classed('sp-hidden', !(!sunPos && visibilityState.showSunSign));

    if (sunPos && visibilityState.showSunSign) {
      sunIrradianceLabel
        .attr('x', sunPos.x)
        .attr('y', sunPos.y + 22)
        .style('fill', sunColor)
        .style('display', 'block')
        .text(`${info.name}: ${epwHourData ? d3.format('.0f')(epwHourData[info.key]) : 'N/A'} Wh/m²`);
    } else {
      sunIrradianceLabel.style('display', 'none');
    }

    selectedTimeText.text(`Selected Time: ${d3.timeFormat('%B %d, %H:%M')(new Date(year, month - 1, day, hour))}`);

    const dayTimes = SunCalc.getTimes(selectedDate, location.latitude, location.longitude);
    const tzOffsetMilliseconds = location.timeZone * 3600 * 1000;
    const sunriseInLST = new Date(dayTimes.sunrise.getTime() + tzOffsetMilliseconds);
    const sunsetInLST = new Date(dayTimes.sunset.getTime() + tzOffsetMilliseconds);

    d3.select('#info-sunrise').text(d3.utcFormat('%H:%M')(sunriseInLST));
    d3.select('#info-sunset').text(d3.utcFormat('%H:%M')(sunsetInLST));

    const sliderFraction = (d) => (d.getUTCHours() + d.getUTCMinutes() / 60) / 23;
    let sunriseFraction = isNaN(sunriseInLST.getTime()) ? null : sliderFraction(sunriseInLST);
    let sunsetFraction = isNaN(sunsetInLST.getTime()) ? null : sliderFraction(sunsetInLST);
    let isPolarDay = null;
    if (sunriseFraction === null || sunsetFraction === null) {
      const noonDate = createDateAsUTC(year, month, day, 12, location.timeZone);
      isPolarDay = !!getSunPositionForPlot(noonDate);
    }
    const hourSliderEl = document.getElementById('hour-slider');
    if (hourSliderEl) {
      let trackGradient;
      if (sunriseFraction !== null && sunsetFraction !== null) {
        const sunrisePct = Math.max(0, Math.min(100, sunriseFraction * 100)).toFixed(2);
        const sunsetPct = Math.max(0, Math.min(100, sunsetFraction * 100)).toFixed(2);
        trackGradient = `linear-gradient(to right, #384456 0%, #384456 ${sunrisePct}%, #ffc857 ${sunrisePct}%, #ffc857 ${sunsetPct}%, #384456 ${sunsetPct}%, #384456 100%)`;
      } else {
        trackGradient = isPolarDay ? '#ffc857' : '#384456';
      }
      hourSliderEl.style.setProperty('--sp-track-bg', trackGradient);
    }


    if (sunPos) {
      d3.select('#info-azimuth').text(`${sunPos.azimuth.toFixed(1)}°`);
      d3.select('#info-altitude').text(`${sunPos.altitude.toFixed(1)}°`);
      d3.select('#info-hour-angle').text(`${getHourAngle(selectedDate, location.latitude, location.longitude).toFixed(1)}°`);
      d3.select('#info-dni').text(epwHourData ? `${epwHourData.directNormalRadiation}` : 'N/A');
      d3.select('#info-dhi').text(epwHourData ? `${epwHourData.diffuseHorizontalRadiation}` : 'N/A');
      d3.select('#info-ghi').text(epwHourData ? `${epwHourData.globalHorizontalRadiation}` : 'N/A');
    } else {
      ['#info-azimuth', '#info-altitude', '#info-hour-angle', '#info-dni', '#info-dhi', '#info-ghi'].forEach(id => d3.select(id).text('Below Horizon'));
    }
  };

  const updateStaticTextAndScale = () => {
    const info = irradianceInfo[currentIrradianceType];
    chartTitleElement.text('Annual Sun Path');
    irradianceMax = getRobustMax(hourlyData, info.key);
    colorScale.domain([0, irradianceMax]);
  };

  chartRefs.sunpath = {
    update: (options = {}) => {
      Object.assign(visibilityState, options);

      const diagramClearance = 20;
      const diagramBottomY = margin.top + selectedTimeHeight + diameter + diagramClearance;
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

      mainContainer.select('.sun-path-bottom-panel').style('display', visibilityState.showInfoPanel ? 'block' : 'none');
      selectedTimeText.style('display', visibilityState.showSelectedTime ? 'block' : 'none');

      const setVisible = (selector, isVisible) => chartGroup.select(selector).style('display', isVisible ? 'block' : 'none');
      setVisible('.day-paths', visibilityState.showSolsticePaths);
      setVisible('.analemmas', visibilityState.showAnalemmas);
      analemmaGrayGroup.style('display', visibilityState.colorAnalemmasByIrradiance ? 'none' : 'block');
      analemmaColorGroup.style('display', visibilityState.colorAnalemmasByIrradiance ? 'block' : 'none');
      if (visibilityState.colorAnalemmasByIrradiance) {
        recolorAnalemmaSegments();
      }
      sunIconVisual.classed('sp-irradiance-emphasis', visibilityState.colorAnalemmasByIrradiance);

      const month = +d3.select('#month-slider').property('value');
      const day = +d3.select('#day-slider').property('value');
      const hour = +d3.select('#hour-slider').property('value');
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
      const month = +d3.select('#month-slider').property('value');
      const day = +d3.select('#day-slider').property('value');
      const hour = +d3.select('#hour-slider').property('value');
      updateInteractiveElements(month, day, hour);
    }
  };

  updateStaticTextAndScale();
  setTimeout(() => chartRefs.sunpath.update(), 100);
}