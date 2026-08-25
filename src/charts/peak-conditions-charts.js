/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import { INDEX_METADATA, PRIORITY_ORDER, processDailyClimateIndices, computeSolAirTemperature } from '../core/peak-conditions.js';
import { formatSimpleLocation } from '../core/location-formatter.js';
import { addExportButton, addInfoButton } from '../core/svg-exporter.js';
import { CHART_DESIGN_WIDTH } from '../core/chart-defaults.js';

const PEAK_CONDITIONS_PANE_ID = 'peak-conditions-pane';

function runWithLocalProcessing(paneId, workFn) {
  if (typeof window.showLocalProcessing === 'function') {
    window.showLocalProcessing(paneId);
  }

  setTimeout(() => {
    workFn();

    if (typeof window.hideLocalProcessing === 'function') {
      window.hideLocalProcessing(paneId);
    }
  }, 50);
}

export function renderPeakConditionsCharts(epwData, chartRefs) {
  const chartConfig = {
    activeIndices: new Set(),
    profileDay: null,
    profileVars: 'db_rh',
    showMeanLines: true,
    baseTempHeating: 18.0,
    baseTempCooling: 24.0,
    comfortMin: 20.0,
    comfortMax: 26.0,
    demandCalcMethod: 'simple',
    surfaceColor: 'light',
    showBaseTemp: true,
    showDemandSurfaces: true,
    showComfortArea: true,
    durationPeriod: 'annual'
  };

  const triggerUpdate = () => {
    const dailyData = processDailyClimateIndices(epwData, chartConfig);
    updatePeakVisuals(dailyData, chartConfig);
    renderPeakKPICards('#peak-kpi-cards', dailyData);
    renderCalendarView('#peak-calendar-chart', epwData, dailyData, chartConfig, triggerUpdate);
    renderSelectedDayProfile('#peak-diurnal-chart', epwData, chartConfig);
    renderThermalDemandProfile('#peak-demand-chart', epwData, chartConfig);
    renderTemperatureDurationCurve('#peak-duration-chart', epwData, chartConfig);
  };

  const initialDailyData = processDailyClimateIndices(epwData, chartConfig);
  const maxTempDay = initialDailyData.find(d => d.indices.has('maxTempAbs'));
  chartConfig.profileDay = maxTempDay
  ? maxTempDay.dateStr
  : initialDailyData[Math.floor(initialDailyData.length / 2)]?.dateStr;

  const defaultActive = ['maxTempAbs', 'minTempAbs', 'maxRadAbs', 'relativeHeatwave', 'relativeColdwave'];
  defaultActive.forEach(id => chartConfig.activeIndices.add(id));

  renderPeakControls('.tab-pane.active .left-panel', epwData, chartConfig, triggerUpdate);
  triggerUpdate();
}

function renderPeakControls(containerSelector, epwData, chartRefs, onToggleCallback) {
  const panel = d3.select(containerSelector).html('');
  const group = panel.append('div').attr('class', 'chart-controls-group');
  group.append('h6').attr('class', 'mb-3').text('Critical Conditions');

  const categories = {};
  Object.entries(INDEX_METADATA).forEach(([id, meta]) => {
    if (!categories[meta.category]) categories[meta.category] = [];
    categories[meta.category].push({ id, ...meta });
  });

  Object.entries(categories).forEach(([catName, items]) => {
    group.append('div').attr('class', 'fw-bold text-muted small mt-2 mb-1').text(catName);
    items.forEach(item => {
      const wrapper = group.append('div').attr('class', 'form-check my-1');
      const checkbox = wrapper.append('input')
        .attr('class', 'form-check-input').attr('type', 'checkbox')
        .attr('id', `check-${item.id}`)
        .property('checked', chartRefs.activeIndices.has(item.id));
      wrapper.append('label')
        .attr('class', 'form-check-label small d-flex align-items-center gap-2')
        .attr('for', `check-${item.id}`)
        .attr('title', item.tooltip)
        .style('cursor', 'help')
        .html(`<span style="width:12px;height:12px;background-color:${item.color};display:inline-block;border-radius:2px;"></span> ${item.label}`);
      checkbox.on('change', function () {
        if (this.checked) chartRefs.activeIndices.add(item.id);
        else chartRefs.activeIndices.delete(item.id);
        runWithLocalProcessing(PEAK_CONDITIONS_PANE_ID, onToggleCallback);
      });
    });
  });

  const profileGroup = panel.append('div').attr('class', 'chart-controls-group mt-4');
  profileGroup.append('h6').text('Hourly Environmental Climate Profile');
  const selectVar = profileGroup.append('select').attr('class', 'form-select form-select-sm mb-2');

  const varOptions = [
    { value: 'db_rh', text: 'Dry Bulb & Relative Humidity' },
    { value: 'dp_rh', text: 'Dew Point & Relative Humidity' },
    { value: 'db_rad', text: 'Dry Bulb & Solar Radiation' },
    { value: 'rad_rh', text: 'Solar Radiation & Relative Humidity' }
  ];

  varOptions.forEach(opt => {
    selectVar.append('option').attr('value', opt.value).text(opt.text);
  });

  selectVar.property('value', chartRefs.profileVars);
  selectVar.on('change', function () {
    chartRefs.profileVars = this.value;
    runWithLocalProcessing(PEAK_CONDITIONS_PANE_ID, onToggleCallback);
  });

  const settingsGroup = panel.append('div').attr('class', 'chart-controls-group mt-4');
  settingsGroup.append('h6').text('Thermal Analysis');

  const hbb = settingsGroup.append('div').attr('class', 'control-item my-2');
  hbb.append('label').attr('class', 'small d-block text-muted').text('Heating Base Temp (°C):');
  hbb.append('input').attr('type', 'number').attr('class', 'form-control form-control-sm')
    .attr('step', '0.1').property('value', chartRefs.baseTempHeating)
    .on('change', function () { chartRefs.baseTempHeating = +this.value; runWithLocalProcessing(PEAK_CONDITIONS_PANE_ID, onToggleCallback); });

  const cbb = settingsGroup.append('div').attr('class', 'control-item my-2');
  cbb.append('label').attr('class', 'small d-block text-muted').text('Cooling Base Temp (°C):');
  cbb.append('input').attr('type', 'number').attr('class', 'form-control form-control-sm')
    .attr('step', '0.1').property('value', chartRefs.baseTempCooling)
    .on('change', function () { chartRefs.baseTempCooling = +this.value; runWithLocalProcessing(PEAK_CONDITIONS_PANE_ID, onToggleCallback); });

  settingsGroup.append('div').style('font-size', '10px').style('color', '#6c757d').style('margin-bottom', '10px').style('line-height', '1.3')
    .text('Base temperature represents the balance point where a building requires no active heating or cooling.');

  const cmin = settingsGroup.append('div').attr('class', 'control-item my-2');
  cmin.append('label').attr('class', 'small d-block text-muted').text('Comfort Min Temp (°C):');
  cmin.append('input').attr('type', 'number').attr('class', 'form-control form-control-sm')
    .attr('step', '0.1').property('value', chartRefs.comfortMin)
    .on('change', function () { chartRefs.comfortMin = +this.value; runWithLocalProcessing(PEAK_CONDITIONS_PANE_ID, onToggleCallback); });

  const cmax = settingsGroup.append('div').attr('class', 'control-item my-2');
  cmax.append('label').attr('class', 'small d-block text-muted').text('Comfort Max Temp (°C):');
  cmax.append('input').attr('type', 'number').attr('class', 'form-control form-control-sm')
    .attr('step', '0.1').property('value', chartRefs.comfortMax)
    .on('change', function () { chartRefs.comfortMax = +this.value; runWithLocalProcessing(PEAK_CONDITIONS_PANE_ID, onToggleCallback); });

  const methodDiv = settingsGroup.append('div').attr('class', 'control-item my-2');
  methodDiv.append('label').attr('class', 'small d-block text-muted').text('Calculation Method:');
  const methodSelect = methodDiv.append('select').attr('class', 'form-select form-select-sm');
  methodSelect.append('option').attr('value', 'simple').text('Simple (Dry Bulb)');
  methodSelect.append('option').attr('value', 'sol_air').text('Sol-Air Temperature');
  methodSelect.property('value', chartRefs.demandCalcMethod)
    .on('change', function () {
      chartRefs.demandCalcMethod = this.value;
      colorDiv.style('display', chartRefs.demandCalcMethod === 'sol_air' ? null : 'none');
      runWithLocalProcessing(PEAK_CONDITIONS_PANE_ID, onToggleCallback);
    });

  const colorDiv = settingsGroup.append('div').attr('class', 'control-item my-2')
    .style('display', chartRefs.demandCalcMethod === 'sol_air' ? null : 'none');
  colorDiv.append('label').attr('class', 'small d-block text-muted').text('Surface Color (Sol-Air):');
  const colorSelect = colorDiv.append('select').attr('class', 'form-select form-select-sm');
  colorSelect.append('option').attr('value', 'light').text('Light-Colored');
  colorSelect.append('option').attr('value', 'dark').text('Dark-Colored');
  colorSelect.property('value', chartRefs.surfaceColor || 'light')
    .on('change', function () { chartRefs.surfaceColor = this.value; runWithLocalProcessing(PEAK_CONDITIONS_PANE_ID, onToggleCallback); });

  const cbt = settingsGroup.append('div').attr('class', 'form-check my-1');
  cbt.append('input').attr('class', 'form-check-input').attr('type', 'checkbox').attr('id', 'chk-basetemp').property('checked', chartRefs.showBaseTemp !== false)
    .on('change', function () { chartRefs.showBaseTemp = this.checked; runWithLocalProcessing(PEAK_CONDITIONS_PANE_ID, onToggleCallback); });
  cbt.append('label').attr('class', 'form-check-label small').attr('for', 'chk-basetemp').text('Show Base Temperatures');

  const ctl = settingsGroup.append('div').attr('class', 'form-check my-1');
  ctl.append('input').attr('class', 'form-check-input').attr('type', 'checkbox').attr('id', 'chk-surfaces').property('checked', chartRefs.showDemandSurfaces !== false)
    .on('change', function () { chartRefs.showDemandSurfaces = this.checked; runWithLocalProcessing(PEAK_CONDITIONS_PANE_ID, onToggleCallback); });
  ctl.append('label').attr('class', 'form-check-label small').attr('for', 'chk-surfaces').text('Show Demand Surfaces');

  const cz = settingsGroup.append('div').attr('class', 'form-check my-1');
  cz.append('input').attr('class', 'form-check-input').attr('type', 'checkbox').attr('id', 'chk-comfort').property('checked', chartRefs.showComfortArea)
    .on('change', function () { chartRefs.showComfortArea = this.checked; runWithLocalProcessing(PEAK_CONDITIONS_PANE_ID, onToggleCallback); });
  cz.append('label').attr('class', 'form-check-label small').attr('for', 'chk-comfort').text('Show Comfort Band');

  const durationGroup = panel.append('div').attr('class', 'chart-controls-group mt-4');
  durationGroup.append('h6').text('Temperature Duration Profile');
  const selectPeriod = durationGroup.append('select')
    .attr('id', 'duration-period-select')
    .attr('class', 'form-select form-select-sm mb-2');
  selectPeriod.append('option').attr('value', 'annual').text('Annual');
  d3.range(1, 13).forEach(m => {
    selectPeriod.append('option').attr('value', m).text(d3.timeFormat('%B')(new Date(2000, m - 1, 1)));
  });
  selectPeriod.property('value', chartRefs.durationPeriod || 'annual');
  selectPeriod.on('change', function () {
    chartRefs.durationPeriod = this.value === 'annual' ? 'annual' : +this.value;
    runWithLocalProcessing(PEAK_CONDITIONS_PANE_ID, onToggleCallback);
  });

  const ackGroup = panel.append('div').attr('class', 'chart-controls-group mt-4');
  const headerRow = ackGroup.append('div')
    .attr('class', 'd-flex justify-content-between align-items-baseline mb-2')
    .style('cursor', 'pointer')
    .attr('data-bs-toggle', 'collapse')
    .attr('data-bs-target', '#peak-scientific-basis');

  headerRow.append('h6').attr('class', 'mb-0').text('Scientific Basis & Assumptions');
  const toggleText = headerRow.append('span')
    .attr('class', 'text-primary')
    .style('font-size', '10px')
    .style('font-weight', '600')
    .style('user-select', 'none')
    .html('Read more ▼');

  const collapseContainer = ackGroup.append('div')
    .attr('id', 'peak-scientific-basis')
    .attr('class', 'collapse');

const infoNote = collapseContainer.append('ul').attr('class', 'info-note mb-0').style('font-size', '11px').style('padding-left', '15px');
  infoNote.html(`
      <li class="mb-2"><strong>Degree-Day Method:</strong> Cooling/Heating Degree-Hours are derived from the mean of all 24 hourly readings in a day (or Sol-Air equivalent), not the classic (Tmax+Tmin)/2 approximation. This makes the metric more sensitive to short intraday spikes.</li>
      <li class="mb-2"><strong>Sol-Air Temperature:</strong> Uses the ASHRAE Fundamentals tabulated sol-air approximation for a horizontal (roof-facing) surface, te = T_db + (α/ho)×GHI - 4°C, with α/ho = 0.026 for a light-colored surface or 0.052 for a dark-colored surface (selectable above). This is orientation-independent (horizontal only, based on global horizontal radiation) and is distinct from the full surface heat-balance model used in the Material Analyses section, which resolves actual absorptance, emissivity, convection, and orientation.</li>
      <li class="mb-2"><strong>Relative Heatwaves/Coldwaves:</strong> Defined here as 3+ consecutive days where the daily mean temperature exceeds the 95th (or falls below the 5th) percentile of the current EPW file's specific year. Unlike official meteorological definitions (e.g., WMO) which rely on historical multi-decade baselines, this metric identifies site-specific, relative thermal extremes strictly within the loaded dataset.</li>
      <li class="mb-2"><strong>Base Temperatures:</strong> Heating/Cooling base temps are user-adjustable balance points, not derived from building physics. The 18°C/24°C defaults are generic starting points. Adjust them to reflect your building's actual envelope and internal gains.</li>
  `);

  setTimeout(() => {
    const collapseEl = document.getElementById('peak-scientific-basis');
    if (collapseEl) {
      collapseEl.addEventListener('show.bs.collapse', () => toggleText.html('Show less ▲'));
      collapseEl.addEventListener('hide.bs.collapse', () => toggleText.html('Read more ▼'));
    }
  }, 0);
}

function renderPeakKPICards(selector, dailyData) {
  const container = d3.select(selector).html('');

  container.style('background-color', '#f8f9fa')
    .style('padding', '1rem')
    .style('border-radius', '8px')
    .style('margin-bottom', '1.5rem');

  const grid = container.append('div')
    .style('display', 'flex')
    .style('gap', '10px')
    .style('flex-wrap', 'wrap')
    .style('justify-content', 'center');

  const absMax = dailyData.find(d => d.indices.has('maxTempAbs'));
  const absMin = dailyData.find(d => d.indices.has('minTempAbs'));
  const absRad = dailyData.find(d => d.indices.has('maxRadAbs'));
  const peakCDD = dailyData.find(d => d.indices.has('peakCDD'));
  const totalHeatwaves = dailyData.filter(d => d.indices.has('relativeHeatwave')).length;

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return d3.timeFormat('%d %B')(new Date(y, m - 1, d));
  };

  const cards = [
    { title: 'Absolute Max Temp', value: `${absMax ? absMax.maxTemp.toFixed(1) : '-'} °C`, text: absMax ? `Occurred on ${formatDate(absMax.dateStr)}` : '', color: '#d73027' },
    { title: 'Absolute Min Temp', value: `${absMin ? absMin.minTemp.toFixed(1) : '-'} °C`, text: absMin ? `Occurred on ${formatDate(absMin.dateStr)}` : '', color: '#4575b4' },
    { title: 'Max Solar Radiation', value: `${absRad ? absRad.maxRad.toFixed(0) : '-'} W/m²`, text: absRad ? `Occurred on ${formatDate(absRad.dateStr)}` : '', color: '#e6550d' },
    { title: 'Peak Cooling Demand', value: `${peakCDD ? peakCDD.cddValue.toFixed(1) : '-'} CDD`, text: peakCDD ? `Occurred on ${formatDate(peakCDD.dateStr)}` : '', color: '#d53e4f' },
    { title: 'Relative Heatwave Days', value: `${totalHeatwaves} Days`, text: 'Cumulative duration', color: '#fdae61' }
  ];

  cards.forEach(c => {
    const box = grid.append('div')
      .style('background-color', '#fff')
      .style('flex', '1 1 0')
      .style('min-width', '135px')
      .style('padding', '0.75rem')
      .style('border-radius', '6px')
      .style('border-left', `4px solid ${c.color}`)
      .style('box-shadow', '0 1px 3px rgba(0,0,0,0.05)')
      .style('transition', 'transform 0.8s ease-out, box-shadow 0.8s ease-out');

    box.on('mouseover', function () { d3.select(this).style('transform', 'translateY(-4px)').style('box-shadow', '0 4px 12px rgba(0,0,0,0.1)'); })
      .on('mouseout', function () { d3.select(this).style('transform', 'translateY(0)').style('box-shadow', '0 1px 3px rgba(0,0,0,0.05)'); });

    box.append('div').style('color', '#6c757d').style('font-size', '10.5px').style('font-weight', '500').style('white-space', 'nowrap').text(c.title);
    box.append('div').style('font-size', '16px').style('font-weight', 'bold').style('margin', '4px 0').text(c.value);
    box.append('div').style('color', '#adb5bd').style('font-size', '9.5px').text(c.text);
  });
}

function renderCalendarView(selector, epwData, dailyData, chartRefs, triggerUpdate) {
  const container = d3.select(selector).html('');
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, 'extreme-and-peak-events-calendar', formattedLocation);
  addInfoButton(selector, 'extremePeakCalendar');

  if (container.node().getBoundingClientRect().width === 0) return;

  container.append('h5')
    .text('Extreme and Peak Events Calendar')
    .attr('class', 'chart-title-main')
    .style('text-align', 'center');

  const containerW = CHART_DESIGN_WIDTH;

  const nCols = 4, nRows = 3;
  const padX = 12, padY = 14;
  const gapX = 10, gapY = 18;

  const monthW = Math.floor((containerW - 2 * padX - (nCols - 1) * gapX) / nCols);
  const cellStep = Math.floor(monthW / 7);
  const cellSize = Math.max(cellStep - 2, 8);
  const labelH = 20;
  const monthH = labelH + 5 * cellStep;
  const legendH = 46;
  const svgH = 2 * padY + nRows * monthH + (nRows - 1) * gapY + legendH;

  const monthsData = d3.groups(dailyData, d => d.month);
  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${containerW} ${svgH}`)
    .style('width', '100%')
    .style('height', 'auto');

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");

  monthsData.forEach(([monthNum, days], mIndex) => {
    const col = mIndex % nCols;
    const row = Math.floor(mIndex / nCols);
    const xOffset = padX + col * (monthW + gapX);
    const yOffset = padY + row * (monthH + gapY);

    const monthGroup = svg.append('g').attr('transform', `translate(${xOffset}, ${yOffset})`);

    monthGroup.append('text')
      .attr('x', 0).attr('y', 14)
      .style('font-size', '11px').style('font-weight', '600').style('fill', '#343a40')
      .text(d3.timeFormat('%B')(new Date(2000, monthNum - 1, 1)));

    monthGroup.selectAll('.day-cell')
      .data(days)
      .join('g')
      .attr('class', 'day-cell')
      .each(function (d) {
        const cell = d3.select(this);
        const gridCol = (d.day - 1) % 7;
        const gridRow = Math.floor((d.day - 1) / 7);
        const cx = gridCol * cellStep;
        const cy = labelH + gridRow * cellStep;

        cell.append('rect')
          .attr('x', cx).attr('y', cy)
          .attr('width', cellSize).attr('height', cellSize)
          .attr('rx', 2.5).attr('ry', 2.5)
          .attr('fill', '#f1f3f5')
          .attr('stroke', '#dee2e6')
          .attr('stroke-width', 0.5)
          .style('cursor', 'pointer')
          .on('click', function (event, d) {
            chartRefs.profileDay = d.dateStr;
            chartRefs.durationPeriod = d.month;

            renderSelectedDayProfile('#peak-diurnal-chart', epwData, chartRefs);
            renderThermalDemandProfile('#peak-demand-chart', epwData, chartRefs);

            const periodSelect = d3.select('#duration-period-select');
            if (!periodSelect.empty()) periodSelect.property('value', d.month);

            if (typeof renderTemperatureDurationCurve === 'function') {
              renderTemperatureDurationCurve('#peak-duration-chart', epwData, chartRefs);
            }
          })
          .on('mouseover', function (event, d) {
            const activeTags = PRIORITY_ORDER.filter(id => d.indices.has(id) && chartRefs.activeIndices.has(id));
            const tagHtml = activeTags.map(id =>
              `<span style="display:inline-block;background:${INDEX_METADATA[id].color};color:#fff;border-radius:3px;padding:2px 6px;margin:2px 2px 0 0;font-size:10px;">${INDEX_METADATA[id].label}</span>`
            ).join('');

            const formattedDate = d3.timeFormat('%d %B')(new Date(2000, d.month - 1, d.day));

            tooltip.style('opacity', 1).html(`
                            <strong>${formattedDate}</strong><br>
                            <span style="font-size:11px;">Max Temp: <b>${d.maxTemp.toFixed(1)}°C</b> | Min Temp: <b>${d.minTemp.toFixed(1)}°C</b> | Mean Temp: <b>${d.meanTemp.toFixed(1)}°C</b></span><br>
                            <span style="font-size:11px;">Max Relative Humidity: <b>${d.maxRh.toFixed(0)}%</b><br>
                            <span style="font-size:11px;">Max Solar Radiation: <b>${d.maxRad.toFixed(0)} W/m²</b>                           
                            <div style="margin-top:5px;">${tagHtml || '<span style="color:#adb5bd;font-size:11px;">No active indices on this day</span>'}</div>
                        `);
          })
          .on('mousemove', function (event) {
            tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`);
          })
          .on('mouseout', function () {
            tooltip.style('opacity', 0);
          });

        cell.append('text')
          .attr('x', cx + cellSize - 2)
          .attr('y', cy + 9)
          .attr('text-anchor', 'end')
          .style('font-size', '10px')
          .style('font-weight', '600')
          .style('font-family', 'monospace')
          .style('fill', '#111')
          .style('opacity', 0.35)
          .style('pointer-events', 'none')
          .style('user-select', 'none')
          .text(d.day);

        cell.append('g').attr('class', 'dots-group').attr('transform', `translate(${cx}, ${cy})`);
      });
  });

  const legendGroup = svg.append('g').attr('class', 'calendar-svg-legend');
  renderCalendarSvgLegend(legendGroup, containerW, svgH, legendH, chartRefs);

  requestAnimationFrame(() => updatePeakVisuals(dailyData, chartRefs));
}

function updatePeakVisuals(dailyData, chartRefs) {
  d3.selectAll('.day-cell').each(function (d) {
    const cell = d3.select(this);
    const dotsGroup = cell.select('.dots-group').html('');
    const activeOnDay = PRIORITY_ORDER.filter(id => d.indices.has(id) && chartRefs.activeIndices.has(id));

    if (activeOnDay.length > 0) {
      const primaryId = activeOnDay[0];
      cell.select('rect')
        .attr('fill', INDEX_METADATA[primaryId].color)
        .attr('fill-opacity', 0.88);

      activeOnDay.slice(1, 4).forEach((id, idx) => {
        dotsGroup.append('circle')
          .attr('cx', 4 + idx * 6).attr('cy', 12)
          .attr('r', 2.5)
          .attr('fill', INDEX_METADATA[id].color)
          .attr('stroke', '#fff').attr('stroke-width', 0.5);
      });
    } else {
      cell.select('rect').attr('fill', '#f1f3f5').attr('fill-opacity', 1);
    }
  });
}

function renderCalendarSvgLegend(group, totalWidth, svgH, legendH, chartRefs) {
  group.selectAll('*').remove();
  const items = PRIORITY_ORDER.filter(id => chartRefs.activeIndices.has(id));
  if (!items.length) return;

  const swatchSize = 11, iconGap = 5, itemGap = 16, fontSize = 11, rowGap = 18;
  const maxRowWidth = totalWidth - 24;

  const buildRow = (rowItems) => rowItems.map(id => {
    const meta = INDEX_METADATA[id];
    const g = group.append('g').attr('class', 'legend-inline-item');
    g.append('rect')
      .attr('width', swatchSize).attr('height', swatchSize)
      .attr('rx', 2).attr('fill', meta.color);
    const label = g.append('text')
      .attr('x', swatchSize + iconGap).attr('y', swatchSize - 1)
      .style('font-size', `${fontSize}px`).style('fill', '#555')
      .text(meta.label);
    const width = swatchSize + iconGap + label.node().getComputedTextLength();
    return { g, width };
  });

  const placeRow = (rowMeasured, y) => {
    const rowWidth = d3.sum(rowMeasured, m => m.width) + itemGap * (rowMeasured.length - 1);
    let cursorX = (totalWidth - rowWidth) / 2;
    rowMeasured.forEach(m => {
      m.g.attr('transform', `translate(${cursorX}, ${y})`);
      cursorX += m.width + itemGap;
    });
  };

  const single = buildRow(items);
  const singleWidth = d3.sum(single, m => m.width) + itemGap * (single.length - 1);

  if (singleWidth <= maxRowWidth) {
    placeRow(single, svgH - legendH / 2 - swatchSize / 2);
  } else {
    group.selectAll('*').remove();
    const mid = Math.ceil(items.length / 2);
    const row1 = buildRow(items.slice(0, mid));
    const row2 = buildRow(items.slice(mid));
    const bandTop = svgH - legendH + 10;
    placeRow(row1, bandTop);
    placeRow(row2, bandTop + rowGap);
  }
}

export function renderSelectedDayProfile(selector, epwData, chartRefs) {
  const container = d3.select(selector).html('');
  const dateStr = chartRefs.profileDay;
  if (!dateStr) return;

  const [y, m, d] = dateStr.split('-');
  const displayDate = d3.timeFormat('%d %B')(new Date(y, m - 1, d));
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, `hourly-profile-critical-day-${dateStr}`, formattedLocation);
  addInfoButton(selector, 'hourlyClimateProfile');

  if (container.node().getBoundingClientRect().width === 0) return;

  container.append('h5')
    .text(`Hourly Environmental Climate Profile for ${displayDate}`)
    .attr('class', 'chart-title-main')
    .style('text-align', 'center')
    .style('margin-bottom', '1rem');

  const targetData = epwData.data.filter(h => {
    const k = `${h.year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`;
    return k === dateStr;
  });
  if (targetData.length === 0) return;

  const varsConfig = {
    db_rh: {
      left: { key: 'dryBulbTemperature', label: 'Dry Bulb Temperature (°C)', color: '#e41a1c' },
      right: { key: 'relativeHumidity', label: 'Relative Humidity (%)', color: '#377eb8' }
    },
    dp_rh: {
      left: { key: 'dewPointTemperature', label: 'Dew Point Temperature (°C)', color: '#4daf4a' },
      right: { key: 'relativeHumidity', label: 'Relative Humidity (%)', color: '#377eb8' }
    },
    db_rad: {
      left: { key: 'dryBulbTemperature', label: 'Dry Bulb Temperature (°C)', color: '#e41a1c' },
      right: { key: 'globalHorizontalRadiation', label: 'Solar Radiation (W/m²)', color: '#ff7f00' }
    },
    rad_rh: {
      left: { key: 'globalHorizontalRadiation', label: 'Solar Radiation (W/m²)', color: '#ff7f00' },
      right: { key: 'relativeHumidity', label: 'Relative Humidity (%)', color: '#377eb8' }
    }
  };

  const activeVars = varsConfig[chartRefs.profileVars];
  const margin = { top: 35, right: 68, bottom: 65, left: 58 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 165;

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .style('width', '100%')
    .style('height', 'auto')
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const yLeftDomain = [
    d3.min(targetData, d => d[activeVars.left.key]) * (d3.min(targetData, d => d[activeVars.left.key]) < 0 ? 1.1 : 0.9) - 1,
    d3.max(targetData, d => d[activeVars.left.key]) * 1.1 + 1
  ];
  const yRightDomain = [
    d3.min(targetData, d => d[activeVars.right.key]) * 0.9,
    d3.max(targetData, d => d[activeVars.right.key]) * 1.1 + 1
  ];

  if (activeVars.left.key === 'relativeHumidity' || activeVars.left.key === 'globalHorizontalRadiation') yLeftDomain[0] = 0;
  if (activeVars.right.key === 'relativeHumidity' || activeVars.right.key === 'globalHorizontalRadiation') yRightDomain[0] = 0;

  const x = d3.scaleLinear().domain([1, 24]).range([0, width]);
  const yLeft = d3.scaleLinear().domain(yLeftDomain).range([height, 0]);
  const yRight = d3.scaleLinear().domain(yRightDomain).range([height, 0]);

  svg.append('g').attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(12).tickFormat(d => `${d}:00`))
    .selectAll('text').style('font-size', '9px').style('fill', '#212529');

  svg.append('g').call(d3.axisLeft(yLeft).ticks(5))
    .selectAll('text').style('font-size', '9px').style('fill', '#212529');

  svg.append('g').attr('transform', `translate(${width},0)`)
    .call(d3.axisRight(yRight).ticks(5))
    .selectAll('text').style('font-size', '9px').style('fill', '#212529');

  svg.append('text')
    .attr('x', width / 2).attr('y', height + 35)
    .style('text-anchor', 'middle').style('font-size', '10px').style('fill', '#212529')
    .text('Hour of Day');

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -(height / 2)).attr('y', -(margin.left - 16))
    .style('text-anchor', 'middle').style('font-size', '10px').style('fill', '#212529')
    .text(activeVars.left.label);

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -(height / 2)).attr('y', width + margin.right - 14)
    .style('text-anchor', 'middle').style('font-size', '10px').style('fill', '#212529')
    .text(activeVars.right.label);

  const lineLeft = d3.line().x(d => x(d.hour)).y(d => yLeft(d[activeVars.left.key]));
  svg.append('path').datum(targetData)
    .attr('fill', 'none').attr('stroke', activeVars.left.color).attr('stroke-width', 2).attr('d', lineLeft);

  const lineRight = d3.line().x(d => x(d.hour)).y(d => yRight(d[activeVars.right.key]));
  svg.append('path').datum(targetData)
    .attr('fill', 'none').attr('stroke', activeVars.right.color).attr('stroke-width', 2)
    .attr('stroke-dasharray', '4,3').attr('d', lineRight);

  const lg = svg.append('g').attr('transform', `translate(${width / 2}, ${height + 48})`);

  lg.append('line').attr('x1', -160).attr('y1', 0).attr('x2', -145).attr('y2', 0).attr('stroke', activeVars.left.color).attr('stroke-width', 2);
  lg.append('text').attr('x', -140).attr('y', 4).style('font-size', '9.5px').style('fill', '#212529').text(`${activeVars.left.label.split('(')[0].trim()} (Hourly)`);

  lg.append('line').attr('x1', 30).attr('y1', 0).attr('x2', 45).attr('y2', 0).attr('stroke', activeVars.right.color).attr('stroke-width', 2).attr('stroke-dasharray', '4,3');
  lg.append('text').attr('x', 50).attr('y', 4).style('font-size', '9.5px').style('fill', '#212529').text(`${activeVars.right.label.split('(')[0].trim()} (Hourly)`);
}

export function renderThermalDemandProfile(selector, epwData, chartRefs) {
  const container = d3.select(selector);
  if (container.empty() || container.node().getBoundingClientRect().width === 0) return;
  container.html('');

  const dateStr = chartRefs.profileDay;
  if (!dateStr) return;

  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, `hourly-thermal-demand-profile-day-${dateStr}`, formattedLocation);
  addInfoButton(selector, 'hourlyThermalDemandComfort');

  const [year, m, d] = dateStr.split('-');
  const displayDate = d3.timeFormat('%d %B')(new Date(year, m - 1, d));

  container.append('h5')
    .text(`Hourly Thermal Demand & Comfort Profile for ${displayDate}`)
    .attr('class', 'chart-title-main')
    .style('text-align', 'center')
    .style('margin-bottom', '1.5rem');

  const targetData = epwData.data.filter(h => {
    const k = `${h.year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`;
    return k === dateStr;
  });
  if (targetData.length === 0) return;

  const demandData = targetData.map(h => {
    let temp = h.dryBulbTemperature;
    if (chartRefs.demandCalcMethod === 'sol_air') {
      temp = computeSolAirTemperature(h.dryBulbTemperature, h.globalHorizontalRadiation, chartRefs.surfaceColor);
    }
    return { hour: h.hour, temp: temp };
  });

  const margin = { top: 35, right: 68, bottom: 80, left: 58 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 165;

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .style('width', '100%')
    .style('height', 'auto')
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const extent = d3.extent(demandData, d => d.temp);
  const yDomain = [
    Math.min(extent[0], chartRefs.baseTempHeating, chartRefs.comfortMin) - 3,
    Math.max(extent[1], chartRefs.baseTempCooling, chartRefs.comfortMax) + 3
  ];

  const x = d3.scaleLinear().domain([1, 24]).range([0, width]);
  const y = d3.scaleLinear().domain(yDomain).range([height, 0]);

  svg.append('g').attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(12).tickFormat(d => `${d}:00`))
    .selectAll('text').style('font-size', '9px').style('fill', '#212529');

  svg.append('g').call(d3.axisLeft(y).ticks(5))
    .selectAll('text').style('font-size', '9px').style('fill', '#212529');

  svg.append('text')
    .attr('x', width / 2).attr('y', height + 35)
    .style('text-anchor', 'middle').style('font-size', '10px').style('fill', '#212529')
    .text('Hour of Day');

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -(height / 2)).attr('y', -(margin.left - 16))
    .style('text-anchor', 'middle').style('font-size', '10px').style('fill', '#212529')
    .text('Temperature (°C)');

  svg.append('g').attr('transform', `translate(${width},0)`)
    .call(d3.axisRight(y).ticks(5))
    .selectAll('text').style('font-size', '9px').style('fill', '#212529');

  const methodLabel = chartRefs.demandCalcMethod === 'sol_air' ? 'Method: Sol-Air Temperature' : 'Method: Simple (Dry Bulb)';

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -(height / 2)).attr('y', width + 42)
    .style('text-anchor', 'middle')
    .style('font-size', '10px')
    .style('font-weight', '600')
    .style('fill', '#212529')
    .text('Thermal Demand Intensity (°C·h)');

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -(height / 2)).attr('y', width + 54)
    .style('text-anchor', 'middle')
    .style('font-size', '8.5px')
    .style('fill', '#6c757d')
    .text(methodLabel);

  if (chartRefs.showComfortArea) {
    svg.append('rect')
      .attr('x', x(1))
      .attr('width', x(24) - x(1))
      .attr('y', y(chartRefs.comfortMax))
      .attr('height', y(chartRefs.comfortMin) - y(chartRefs.comfortMax))
      .attr('fill', '#e5f5e0')
      .attr('opacity', 0.45);
  }

  if (chartRefs.showDemandSurfaces) {
    const coolingAreaGen = d3.area()
      .x(d => x(d.hour))
      .y0(d => y(chartRefs.baseTempCooling))
      .y1(d => y(Math.max(chartRefs.baseTempCooling, d.temp)));

    svg.append('path').datum(demandData)
      .attr('fill', '#e41a1c')
      .attr('opacity', 0.28)
      .attr('d', coolingAreaGen);

    const heatingAreaGen = d3.area()
      .x(d => x(d.hour))
      .y0(d => y(chartRefs.baseTempHeating))
      .y1(d => y(Math.min(chartRefs.baseTempHeating, d.temp)));

    svg.append('path').datum(demandData)
      .attr('fill', '#377eb8')
      .attr('opacity', 0.28)
      .attr('d', heatingAreaGen);
  }

  if (chartRefs.showBaseTemp) {
    svg.append('line').attr('x1', x(1)).attr('x2', x(24)).attr('y1', y(chartRefs.baseTempCooling)).attr('y2', y(chartRefs.baseTempCooling))
      .attr('stroke', '#e41a1c').attr('stroke-dasharray', '3,3').attr('stroke-width', 1);
    svg.append('line').attr('x1', x(1)).attr('x2', x(24)).attr('y1', y(chartRefs.baseTempHeating)).attr('y2', y(chartRefs.baseTempHeating))
      .attr('stroke', '#377eb8').attr('stroke-dasharray', '3,3').attr('stroke-width', 1);
  }

  const tempLineGen = d3.line().x(d => x(d.hour)).y(d => y(d.temp));
  svg.append('path').datum(demandData)
    .attr('fill', 'none').attr('stroke', '#212529').attr('stroke-width', 1.5).attr('d', tempLineGen);

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  const hoverLine = svg.append('line')
    .attr('y1', 0)
    .attr('y2', height)
    .attr('stroke', '#495057')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '3,3')
    .style('opacity', 0);

  svg.append('rect')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'none')
    .attr('pointer-events', 'all')
    .on('mouseover', () => { tooltip.style('opacity', 1); hoverLine.style('opacity', 1); })
    .on('mousemove', function (event) {
      const mouseX = d3.pointer(event, this)[0];
      let hour = Math.round(x.invert(mouseX));
      hour = Math.max(1, Math.min(24, hour));

      const dHour = demandData.find(d => d.hour === hour);
      if (!dHour) return;

      hoverLine.attr('x1', x(hour)).attr('x2', x(hour));

      let intensityHtml = '0.0 °C·h';
      if (dHour.temp > chartRefs.baseTempCooling) {
        const deltaT = dHour.temp - chartRefs.baseTempCooling;
        intensityHtml = `<span style="color:#fdbfbf;">Cooling: +${deltaT.toFixed(1)} °C·h</span>`;
      } else if (dHour.temp < chartRefs.baseTempHeating) {
        const deltaT = chartRefs.baseTempHeating - dHour.temp;
        intensityHtml = `<span style="color:#abd0f1;">Heating: +${deltaT.toFixed(1)} °C·h</span>`;
      }

      let comfortStatus = '<span style="color:#9fd997; font-weight:600;">Within Comfort Range</span>';
      if (dHour.temp > chartRefs.comfortMax) {
        comfortStatus = '<span style="color:#fca4a4; font-weight:600;">Above Comfort Range</span>';
      } else if (dHour.temp < chartRefs.comfortMin) {
        comfortStatus = '<span style="color:#92c5de; font-weight:600;">Below Comfort Range</span>';
      }

      const activeMethodLabel = chartRefs.demandCalcMethod === 'sol_air' ? 'Sol-Air Temperature' : 'Dry Bulb Temperature';

      tooltip.style('opacity', 1)
        .html(`
                    <strong>Hour: ${String(hour).padStart(2, '0')}:00</strong><br>
                    <span style="font-size:11px;">${activeMethodLabel}: <b>${dHour.temp.toFixed(1)} °C</b></span><br>
                    <span style="font-size:11px;">Thermal Demand Intensity: <b>${intensityHtml}</b></span><br>
                    <span style="font-size:11px;">Comfort Status: <b>${comfortStatus}</b></span>
                `)
        .style("top", `${event.pageY - 12}px`)
        .style("left", `${event.pageX + 12}px`);
    })
    .on('mouseout', () => {
      tooltip.style('opacity', 0);
      hoverLine.style('opacity', 0);
    });

  const lg = svg.append('g').attr('transform', `translate(${width / 2}, ${height + 48})`);

  lg.append('rect').attr('x', -240).attr('y', -6).attr('width', 15).attr('height', 10).attr('fill', '#e41a1c').attr('opacity', 0.3);
  lg.append('text').attr('x', -220).attr('y', 3).style('font-size', '9.5px').style('fill', '#212529').text('Cooling Demand Surface');

  lg.append('rect').attr('x', -60).attr('y', -6).attr('width', 15).attr('height', 10).attr('fill', '#377eb8').attr('opacity', 0.3);
  lg.append('text').attr('x', -40).attr('y', 3).style('font-size', '9.5px').style('fill', '#212529').text('Heating Demand Surface');

  lg.append('rect').attr('x', 120).attr('y', -6).attr('width', 15).attr('height', 10).attr('fill', '#e5f5e0').attr('opacity', 0.5);
  lg.append('text').attr('x', 140).attr('y', 3).style('font-size', '9.5px').style('fill', '#212529').text('Comfort Zone Band');

  lg.append('line').attr('x1', -240).attr('y1', 14).attr('x2', -225).attr('y2', 14).attr('stroke', '#212529').attr('stroke-width', 1.5);
  lg.append('text').attr('x', -220).attr('y', 17).style('font-size', '9.5px').style('fill', '#212529')
    .text(chartRefs.demandCalcMethod === 'sol_air' ? 'Sol-Air Temperature' : 'Dry Bulb Temperature');

  lg.append('line').attr('x1', -60).attr('y1', 14).attr('x2', -45).attr('y2', 14).attr('stroke', '#e41a1c').attr('stroke-dasharray', '3,3').attr('stroke-width', 1);
  lg.append('text').attr('x', -40).attr('y', 17).style('font-size', '9.5px').style('fill', '#212529').text('Cooling Base Temp');

  lg.append('line').attr('x1', 120).attr('y1', 14).attr('x2', 135).attr('y2', 14).attr('stroke', '#377eb8').attr('stroke-dasharray', '3,3').attr('stroke-width', 1);
  lg.append('text').attr('x', 140).attr('y', 17).style('font-size', '9.5px').style('fill', '#212529').text('Heating Base Temp');
}

export function renderTemperatureDurationCurve(selector, epwData, chartRefs) {
  const container = d3.select(selector);
  if (container.empty() || container.node().getBoundingClientRect().width === 0) return;
  container.html('');

  const period = chartRefs.durationPeriod || 'annual';
  const isAnnual = period === 'annual';

  let targetData = epwData.data || epwData;
  let periodLabel = 'Annual';

  if (!isAnnual) {
    targetData = targetData.filter(h => h.month === period);
    periodLabel = d3.timeFormat('%B')(new Date(2000, period - 1, 1));
  }

  if (targetData.length === 0) return;

  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, `temperature-duration-curve-${periodLabel.toLowerCase()}`, formattedLocation);
  addInfoButton(selector, 'temperatureDurationCurve');

  container.append('h5')
    .text(`Temperature Duration Curve for ${periodLabel}`)
    .attr('class', 'chart-title-main')
    .style('text-align', 'center')
    .style('margin-bottom', '1.5rem')
    .style('margin-top', '1.5rem');

  const sortedData = targetData.map(h => {
    let temp = h.dryBulbTemperature;
    if (chartRefs.demandCalcMethod === 'sol_air') {
      temp = computeSolAirTemperature(h.dryBulbTemperature, h.globalHorizontalRadiation, chartRefs.surfaceColor);
    }
    return { temp: temp };
  }).sort((a, b) => b.temp - a.temp).map((d, i) => ({ ...d, hoursExceeded: i + 1 }));

  const margin = { top: 35, right: 68, bottom: 80, left: 58 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 180;

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .style('width', '100%')
    .style('height', 'auto')
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const xMax = isAnnual ? sortedData.length : sortedData.length;
  const x = d3.scaleLinear().domain([0, xMax]).range([0, width]);

  const yDomain = d3.extent(sortedData, d => d.temp);
  yDomain[0] = Math.min(yDomain[0], chartRefs.baseTempHeating - 5);
  yDomain[1] = Math.max(yDomain[1], chartRefs.baseTempCooling + 5);
  const y = d3.scaleLinear().domain([yDomain[0] - 2, yDomain[1] + 2]).range([height, 0]);

  svg.append('g').attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(10))
    .selectAll('text').style('font-size', '9px').style('fill', '#212529');

  svg.append('g').call(d3.axisLeft(y).ticks(6))
    .selectAll('text').style('font-size', '9px').style('fill', '#212529');

  svg.append('text')
    .attr('x', width / 2).attr('y', height + 35)
    .style('text-anchor', 'middle').style('font-size', '10px').style('fill', '#212529')
    .text('Hours Exceeded');

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -(height / 2)).attr('y', -(margin.left - 16))
    .style('text-anchor', 'middle').style('font-size', '10px').style('fill', '#212529')
    .text('Temperature (°C)');

  const cBase = chartRefs.baseTempCooling;
  const hBase = chartRefs.baseTempHeating;

  const bands = [
    { name: 'Extreme Heat', min: cBase + 6, max: 100, color: '#bd0026' },
    { name: 'Cooling Demand', min: cBase, max: cBase + 6, color: '#fd8d3c' },
    { name: 'Comfort / Transition', min: hBase, max: cBase, color: '#74c476' },
    { name: 'Heating Demand', min: hBase - 10, max: hBase, color: '#6baed6' },
    { name: 'Extreme Cold', min: -100, max: hBase - 10, color: '#08519c' }
  ];

  const yMinAxis = y.domain()[0];
  const yMaxAxis = y.domain()[1];

  svg.append("defs").append("clipPath")
    .attr("id", "clip-duration-chart")
    .append("rect")
    .attr("width", width)
    .attr("height", height);

  bands.forEach(band => {
    const areaGen = d3.area()
      .x(d => x(d.hoursExceeded))
      .y0(d => {
        const val0 = Math.max(yMinAxis, Math.min(yMaxAxis, band.min));
        return y(val0);
      })
      .y1(d => {
        const val1 = Math.max(yMinAxis, Math.min(yMaxAxis, Math.min(band.max, d.temp)));
        const clampedMin = Math.max(yMinAxis, Math.min(yMaxAxis, band.min));
        return y(val1 < clampedMin ? clampedMin : val1);
      });

    svg.append('path')
      .datum(sortedData)
      .attr('fill', band.color)
      .attr('opacity', 0.6)
      .attr('clip-path', 'url(#clip-duration-chart)')
      .attr('d', areaGen);
  });

  const lineGen = d3.line()
    .x(d => x(d.hoursExceeded))
    .y(d => y(d.temp));

  svg.append('path')
    .datum(sortedData)
    .attr('fill', 'none')
    .attr('stroke', '#212529')
    .attr('stroke-width', 1.5)
    .attr('clip-path', 'url(#clip-duration-chart)')
    .attr('d', lineGen);

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  const hoverLine = svg.append('line')
    .attr('y1', 0).attr('y2', height)
    .attr('stroke', '#495057').attr('stroke-width', 1).attr('stroke-dasharray', '3,3')
    .style('opacity', 0);

  svg.append('rect')
    .attr('width', width).attr('height', height).attr('fill', 'none').attr('pointer-events', 'all')
    .on('mouseover', () => { tooltip.style('opacity', 1); hoverLine.style('opacity', 1); })
    .on('mousemove', function (event) {
      const mouseX = d3.pointer(event, this)[0];
      let hourIdx = Math.round(x.invert(mouseX));
      hourIdx = Math.max(1, Math.min(sortedData.length, hourIdx));

      const dPt = sortedData[hourIdx - 1];
      if (!dPt) return;

      hoverLine.attr('x1', x(hourIdx)).attr('x2', x(hourIdx));
      const activeMethodLabel = chartRefs.demandCalcMethod === 'sol_air' ? 'Sol-Air Temp' : 'Dry Bulb Temp';
      const percentage = ((hourIdx / sortedData.length) * 100).toFixed(1);

      tooltip.style('opacity', 1)
        .html(`
                    <strong>Duration: ${hourIdx} Hours</strong> (${percentage}%)<br>
                    <span style="font-size:11px;">${activeMethodLabel}: <b>${dPt.temp.toFixed(1)} °C</b></span><br>
                    <span style="font-size:11px; color:#6c757d;">Conditions exceed this temperature for ${hourIdx} hours in the selected period.</span>
                `)
        .style("top", `${event.pageY - 12}px`)
        .style("left", `${event.pageX + 12}px`);
    })
    .on('mouseout', () => { tooltip.style('opacity', 0); hoverLine.style('opacity', 0); });

  const lg = svg.append('g').attr('transform', `translate(${width / 2}, ${height + 55})`);

  const legendItems = [
    { label: `> ${cBase + 6}°C`, color: '#bd0026' },
    { label: `${cBase}°C - ${cBase + 6}°C`, color: '#fd8d3c' },
    { label: `${hBase}°C - ${cBase}°C`, color: '#74c476' },
    { label: `${hBase - 10}°C - ${hBase}°C`, color: '#6baed6' },
    { label: `< ${hBase - 10}°C`, color: '#08519c' }
  ];

  const itemWidth = 100;
  const startX = -((legendItems.length * itemWidth) / 2) + 20;

  legendItems.forEach((item, i) => {
    lg.append('rect').attr('x', startX + i * itemWidth).attr('y', -6).attr('width', 12).attr('height', 12).attr('fill', item.color).attr('opacity', 0.6);
    lg.append('text').attr('x', startX + i * itemWidth + 16).attr('y', 4).style('font-size', '9px').style('fill', '#212529').text(item.label);
  });
}