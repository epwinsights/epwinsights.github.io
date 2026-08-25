/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import SunCalc from '../core/suncalc.js';
import PsychroLib from '../core/psychrolib.js';
import BioclimaticStrategies from '../core/bioclimatic-strategies.js';
import { formatSimpleLocation } from '../core/location-formatter.js';
import { addExportButton, addInfoButton } from '../core/svg-exporter.js';
import { renderUnifiedFilterControls, filterUnifiedHourlyData, buildUnifiedChartTitleSuffix } from '../core/date-filter.js';
import { CHART_DESIGN_WIDTH } from '../core/chart-defaults.js';
import state from '../state.js';

let showBioclimaticStrategies = false;

const CHART_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const CHART_COLORS = {
  text: '#212529',
  textMuted: '#495057',
  saturationCurve: '#20242c',
  rhLine: '#64748b',
  rhLineDimmed: '#808080',
  legendBg: '#ffffff',
  legendBorder: '#dee2e6',
  indicator: '#dc2626'
};

function styleChartText(selection, { size = 11, weight = 'normal', color = CHART_COLORS.text } = {}) {
  return selection
    .style('font-family', CHART_FONT_FAMILY)
    .style('font-size', `${size}px`)
    .style('font-weight', weight)
    .style('fill', color);
}

function drawLegendCard(group, boxX, boxY, boxWidth, boxHeight, padding = 12) {
  group.insert('rect', ':first-child')
    .attr('class', 'legend-card-bg')
    .attr('x', boxX - padding)
    .attr('y', boxY - padding)
    .attr('width', boxWidth + padding * 2)
    .attr('height', boxHeight + padding * 2)
    .attr('rx', 10)
    .attr('fill', CHART_COLORS.legendBg)
    .attr('fill-opacity', 0.85)
    .attr('stroke', CHART_COLORS.legendBorder)
    .attr('stroke-width', 1);
}

const ComfortLib = (() => {
  const getComfortTemperatures = (tr, vel, rh, met, clo, pmvLimit, wme = 0) => {
    let lowerT = NaN, upperT = NaN;
    const pmvLimitAbs = Math.abs(pmvLimit);
    let low = -50, high = 50;
    for (let i = 0; i < 30; i++) {
      let mid = (low + high) / 2;
      if (mid === low || mid === high) break;
      let pmv = PsychroLib.getPMV(mid, tr, vel, rh, met, clo, wme);
      if (isNaN(pmv) || pmv < -pmvLimitAbs) low = mid;
      else high = mid;
    }
    lowerT = high;
    low = -50; high = 50;
    for (let i = 0; i < 30; i++) {
      let mid = (low + high) / 2;
      if (mid === low || mid === high) break;
      let pmv = PsychroLib.getPMV(mid, tr, vel, rh, met, clo, wme);
      if (isNaN(pmv) || pmv > pmvLimitAbs) high = mid;
      else low = mid;
    }
    upperT = low;
    if (lowerT >= upperT || isNaN(lowerT) || isNaN(upperT)) return null;
    return { lower: lowerT, upper: upperT };
  };

  const getComfortPolygon = (params, pressure = 101325) => {
    const rhPoints = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const upperCurve = [];
    const lowerCurve = [];
    rhPoints.forEach(rh => {
      const temps = getComfortTemperatures(params.mrt, params.windSpeed, rh, params.metRate, params.cloLevel, params.pmvLimit);
      if (temps) {
        const w_low = PsychroLib.getHumidityRatio(temps.lower, rh, pressure);
        const w_high = PsychroLib.getHumidityRatio(temps.upper, rh, pressure);
        upperCurve.push({ t: temps.upper, w: w_high });
        lowerCurve.unshift({ t: temps.lower, w: w_low });
      }
    });
    if (upperCurve.length < 2 || lowerCurve.length < 2) return [];
    return upperCurve.concat(lowerCurve);
  };

  return { getComfortPolygon };
})();

function getStationPressure(epwData) {
  return (epwData && typeof epwData.stationPressure === 'number') ? epwData.stationPressure : 101325;
}

function createDataHeatmap(data, xDomain, yDomain, xBins, yBins) {
  const xBinWidth = (xDomain[1] - xDomain[0]) / xBins;
  const yBinWidth = (yDomain[1] - yDomain[0]) / yBins;
  const bins = new Map();
  data.forEach(d => {
    const xBinIndex = Math.floor((d.t - xDomain[0]) / xBinWidth);
    const yBinIndex = Math.floor((d.w - yDomain[0]) / yBinWidth);
    if (xBinIndex >= 0 && xBinIndex < xBins && yBinIndex >= 0 && yBinIndex < yBins) {
      const key = `${xBinIndex},${yBinIndex}`;
      if (!bins.has(key)) {
        bins.set(key, { x0: xDomain[0] + xBinIndex * xBinWidth, x1: xDomain[0] + (xBinIndex + 1) * xBinWidth, y0: yDomain[0] + yBinIndex * yBinWidth, y1: yDomain[0] + (yBinIndex + 1) * yBinWidth, count: 0, });
      }
      bins.get(key).count++;
    }
  });
  return Array.from(bins.values());
}

export function renderPsychrometricChart(epwData, chartRefs) {
  if (!chartRefs) chartRefs = {};
  if (!chartRefs.psychro) chartRefs.psychro = {};
  state.selectedBioclimaticStrategy = state.selectedBioclimaticStrategy || 'none';
  state.psychroSelection = state.psychroSelection || { type: 'all' };

  const chartContainerSelector = '#psychrometric-chart';

  let temporalContainer = d3.select('#temporal-distribution-chart');
  if (temporalContainer.empty()) {
    const parentNode = d3.select('#bioclimatic-frequency-chart').node().parentNode;
    d3.select(parentNode)
      .insert('div', '#bioclimatic-frequency-chart')
      .attr('id', 'temporal-distribution-chart')
      .attr('class', 'chart-container mt-5');
  }

  renderPsychroControls('.tab-pane.active .left-panel', chartRefs, epwData);
  renderPsychroChart(chartContainerSelector, epwData, chartRefs);
  renderTemporalDistributionChart('#temporal-distribution-chart', epwData, chartRefs);
  renderBioclimaticFrequencyChart('#bioclimatic-frequency-chart', epwData);
}

export function renderPsychroControls(panelSelector, chartRefs, epwData) {
  const panel = d3.select(panelSelector).html('');

  state.bioclimaticFilters = state.bioclimaticFilters || {
    timePreset: 'all',
    customStart: 8,
    customEnd: 20,
    monthPreset: 'all',
    showHours: true,
    showPercent: false
  };

  state.activeStrategies = state.activeStrategies || {
    comfort: true,
    ventilation: true,
    evaporative: true,
    thermalMass: false,
    nightVentilation: false,
    passiveSolar: true,
    activeHeating: false,
    activeCooling: false
  };

  const visualControls = panel.append('div').attr('class', 'chart-controls-group');
  visualControls.append('h6').text('Visualization');
  const vizSwitches = [
    { id: 'heatmap-toggle', label: 'Show Data Heatmap', checked: true },
    { id: 'points-toggle', label: 'Show Data Points', checked: false },
    { id: 'indicator-toggle', label: 'Show Position Indicator', checked: true }
  ];
  vizSwitches.forEach(s => {
    const item = visualControls.append('div').attr('class', 'control-item');
    item.append('div').attr('class', 'form-check form-switch')
      .html(`<input class="form-check-input" type="checkbox" id="psychro-${s.id}" ${s.checked ? 'checked' : ''}><label class="form-check-label" for="psychro-${s.id}">${s.label}</label>`);
  });

  const chartMetrics = panel.append('div').attr('class', 'chart-controls-group mt-3');
  chartMetrics.append('h6').text('Chart Metrics');
  const metrics = [
    { id: 'dbt', label: 'Dry Bulb Temperature', checked: true },
    { id: 'hr', label: 'Humidity Ratio', checked: true },
    { id: 'rh', label: 'Relative Humidity', checked: true },
    { id: 'wb', label: 'Wet Bulb Temperature', checked: false },
    { id: 'enthalpy', label: 'Enthalpy', checked: false },
    { id: 'vp', label: 'Vapor Pressure', checked: false }
  ];

  metrics.forEach(m => {
    const item = chartMetrics.append('div').attr('class', 'control-item');
    item.append('div').attr('class', 'form-check form-switch')
      .html(`<input class="form-check-input" type="checkbox" id="psychro-${m.id}-toggle" ${m.checked ? 'checked' : ''}><label class="form-check-label" for="psychro-${m.id}-toggle">${m.label}</label>`);
  });

  const comfortOverlay = panel.append('div').attr('class', 'chart-controls-group mt-3');
  comfortOverlay.append('h6').text('Comfort Analysis & Strategies');

  const comfortModels = [
    { id: 'none', label: 'None', checked: true },
    { id: 'ashrae', label: 'ASHRAE 55 Comfort Zone', checked: false },
    { id: 'iso', label: 'ISO 7730 PMV Map', checked: false },
    { id: 'bioclimatic', label: 'Bioclimatic Strategies', checked: false }
  ];

  const modelSelector = comfortOverlay.append('div').attr('class', 'comfort-model-selector');
  modelSelector.selectAll('.control-item').data(comfortModels).join('div').attr('class', 'control-item')
    .append('div').attr('class', 'form-check')
    .html(m => `<input class="form-check-input" type="radio" name="comfortModel" id="comfort-model-${m.id}" value="${m.id}" ${m.checked ? 'checked' : ''}>
                    <label class="form-check-label" for="comfort-model-${m.id}">${m.label}</label>`);

  const comfortOptionsContainer = comfortOverlay.append('div').attr('id', 'comfort-options-container');
  const slidersContainer = comfortOptionsContainer.append('div').attr('class', 'sliders-container-left-panel mt-2').style('display', 'none');

  const comfortParams = [
    { id: 'mrt', label: 'Mean Radiant Temp (°C)', value: 24, min: 0, max: 50, step: 0.5 },
    { id: 'wind-speed', label: 'Wind Speed (m/s)', value: 0.1, min: 0, max: 2, step: 0.1 },
    { id: 'met-rate', label: 'Metabolic Rate (met)', value: 1.0, min: 0.7, max: 4, step: 0.1 },
    { id: 'clo-level', label: 'Clothing Level (clo)', value: 1.0, min: 0, max: 2, step: 0.1 }
  ];

  const modelDefaults = {
    ashrae: { mrt: 24.0, 'wind-speed': 0.1, 'met-rate': 1.0, 'clo-level': 1.0 },
    iso: { mrt: 20.0, 'wind-speed': 0.2, 'met-rate': 1.0, 'clo-level': 1.0 }
  };

  comfortParams.forEach(p => {
    const item = slidersContainer.append('div').attr('class', 'slider-control-item');
    const header = item.append('div').attr('class', 'slider-header');
    header.append('label').attr('for', `psychro-${p.id}`).text(p.label);
    header.append('span').attr('id', `psychro-${p.id}-value`).attr('class', 'slider-value-display').text(p.value.toFixed(1));

    item.append('input').attr('type', 'range').attr('class', 'form-range')
      .attr('id', `psychro-${p.id}`).attr('min', p.min).attr('max', p.max).attr('step', p.step).attr('value', p.value);
  });

  const sliderWrapper = comfortOverlay.append('div')
    .attr('class', 'control-item mt-3')
    .attr('id', 'mot-slider-container')
    .style('display', 'none');

  const initialMot = state.meanOutdoorTemp || 19;
  sliderWrapper.html(`
        <label for="mot-slider" class="form-label" style="font-size: 0.85em; font-weight: bold;">
            Mean Outdoor Temp: <span id="mot-val">${initialMot}</span> °C
        </label>
        <input type="range" class="form-range" id="mot-slider" min="10" max="35" step="0.5" value="${initialMot}">
    `);

  const strategyTogglesWrapper = comfortOverlay.append('div')
    .attr('id', 'strategy-toggles-container')
    .attr('class', 'mt-2')
    .style('display', 'none');

  const bioFilterControls = panel.append('div')
    .attr('id', 'bio-date-filter-container')
    .attr('class', 'mt-4');

  renderUnifiedFilterControls('#bio-date-filter-container', state.bioclimaticFilters, () => {
    renderPsychroChart('#psychrometric-chart', epwData, chartRefs);
    if (typeof renderTemporalDistributionChart === 'function') {
      renderTemporalDistributionChart('#temporal-distribution-chart', epwData, chartRefs);
    }
    renderBioclimaticFrequencyChart('#bioclimatic-frequency-chart', epwData);
  });

  const labelToggles = panel.append('div').attr('class', 'chart-controls-group mt-2 pt-2 border-top');
  labelToggles.append('label').style('font-size', '11px').style('font-weight', 'bold').text('Data Labels:');

  const hoursToggleItem = labelToggles.append('div').attr('class', 'form-check form-switch mt-1');
  hoursToggleItem.html(`<input class="form-check-input" type="checkbox" id="bio-show-hours" ${state.bioclimaticFilters.showHours ? 'checked' : ''}><label class="form-check-label" style="font-size: 11px" for="bio-show-hours">Show Hours</label>`);

  const percentToggleItem = labelToggles.append('div').attr('class', 'form-check form-switch');
  percentToggleItem.html(`<input class="form-check-input" type="checkbox" id="bio-show-percent" ${state.bioclimaticFilters.showPercent ? 'checked' : ''}><label class="form-check-label" style="font-size: 11px" for="bio-show-percent">Show Percentage</label>`);

  d3.select('#bio-show-hours').on('change', function () {
    state.bioclimaticFilters.showHours = this.checked;
    renderBioclimaticFrequencyChart('#bioclimatic-frequency-chart', epwData);
  });

  d3.select('#bio-show-percent').on('change', function () {
    state.bioclimaticFilters.showPercent = this.checked;
    renderBioclimaticFrequencyChart('#bioclimatic-frequency-chart', epwData);
  });

  const scientificBasisGroup = panel.append('div').attr('class', 'chart-controls-group mt-4');
  const scientificBasisHeader = scientificBasisGroup.append('div')
    .attr('class', 'd-flex justify-content-between align-items-baseline mb-2')
    .style('cursor', 'pointer')
    .attr('data-bs-toggle', 'collapse')
    .attr('data-bs-target', '#psychro-scientific-basis');
  scientificBasisHeader.append('h6').attr('class', 'mb-0').text('Scientific Basis & Assumptions');
  scientificBasisHeader.append('span').attr('class', 'text-primary').style('font-size', '10px').html('Read more ▼');

  const scientificBasisCollapse = scientificBasisGroup.append('div').attr('id', 'psychro-scientific-basis').attr('class', 'collapse');
  const scientificBasisNote = scientificBasisCollapse.append('ul').attr('class', 'info-note mb-0').style('font-size', '11px').style('padding-left', '15px');
  scientificBasisNote.html(`
        <li class="mb-2"><strong>Psychrometric Properties:</strong> Saturation vapor pressure, humidity ratio, wet bulb temperature, dew point and enthalpy follow the ASHRAE Handbook of Fundamentals correlations (Hyland and Wexler). Wet bulb temperature has no closed form solution, so it is found iteratively by matching enthalpy at saturation. The psychrometric formulas implemented here follow the ASHRAE Handbook of Fundamentals (Hyland & Wexler correlations), consistent with the open-source PsychroLib project (Meyer & Thevenard, 2019, MIT License).</li>
        <li class="mb-2"><strong>Bioclimatic Strategy Polygons:</strong> The strategy zones (Natural Ventilation, Evaporative Cooling, Thermal Mass, Passive Solar Heating and the others) follow the Givoni bioclimatic chart framework, with the central Comfort Zone matching ASHRAE 55. These are fixed reference boundaries, not fitted to your specific building or climate, so treat them as a general screening tool rather than a substitute for detailed simulation.</li>
        <li class="mb-2"><strong>PMV / ISO 7730 Overlay:</strong> The Predicted Mean Vote overlay uses Fanger's steady state model, calibrated for typical indoor conditions using the clothing and activity levels set in the panel above. For outdoor thermal stress specifically, the dedicated Outdoor Comfort tab uses UTCI and SET, which are better suited to the variable wind and radiant conditions found outdoors.</li>
        <li class="mb-2"><strong>Temperature Axis Range (-10 to 50 °C):</strong> This mirrors ASHRAE's own "Normal Temperature" psychrometric chart, the version most commonly used since it covers the great majority of inhabited climates. Hours whose dry bulb temperature falls outside this range are not plotted and are not included in the bioclimatic percentages. When this happens, a note appears below the chart legend showing how many hours were excluded.</li>
        <li class="mb-2"><strong>Atmospheric Pressure (station-corrected):</strong> The saturation curve, humidity ratio and comfort zone boundaries use the station's own atmospheric pressure rather than assuming sea level. When the EPW file reports a valid measured atmospheric station pressure, its average is used; otherwise pressure is derived from the station's elevation (ASHRAE Handbook of Fundamentals, Ch.1) or, lastly, standard sea level pressure (101325 Pa) if no elevation is available. This matters most for high altitude stations (Denver, La Paz, mountain sites), where sea level pressure would meaningfully misplace the saturation curve and comfort boundaries.</li>
    `);

  setTimeout(() => {
    const collapseEl = document.getElementById('psychro-scientific-basis');
    if (collapseEl) {
      const toggleText = d3.select('#psychro-scientific-basis').node().parentNode.querySelector('span');
      collapseEl.addEventListener('show.bs.collapse', () => d3.select(toggleText).html('Show less ▲'));
      collapseEl.addEventListener('hide.bs.collapse', () => d3.select(toggleText).html('Read more ▼'));
    }
  }, 0);

  const updateChart = () => {
    if (chartRefs.psychro && chartRefs.psychro.update) {
      let comfortModel = d3.select('input[name="comfortModel"]:checked').property('value');
      let params = {
        mrt: +d3.select('#psychro-mrt').property('value'),
        windSpeed: +d3.select('#psychro-wind-speed').property('value'),
        metRate: +d3.select('#psychro-met-rate').property('value'),
        cloLevel: +d3.select('#psychro-clo-level').property('value'),
        pmvLimit: 0.5
      };

      chartRefs.psychro.update({
        showDBT: d3.select('#psychro-dbt-toggle').property('checked'),
        showHR: d3.select('#psychro-hr-toggle').property('checked'),
        showRH: d3.select('#psychro-rh-toggle').property('checked'),
        showWB: d3.select('#psychro-wb-toggle').property('checked'),
        showEnthalpy: d3.select('#psychro-enthalpy-toggle').property('checked'),
        showVP: d3.select('#psychro-vp-toggle').property('checked'),
        showHeatmap: d3.select('#psychro-heatmap-toggle').property('checked'),
        showPoints: d3.select('#psychro-points-toggle').property('checked'),
        comfortModel: comfortModel,
        comfortParams: params,
      });
    }
  };

  const updateDependentControls = () => {
    const selectedModel = d3.select('input[name="comfortModel"]:checked').property('value');
    const heatmapToggle = d3.select('#psychro-heatmap-toggle');
    const pointsToggle = d3.select('#psychro-points-toggle');

    if (selectedModel !== 'none') {
      heatmapToggle.property('checked', false).property('disabled', true);
    } else {
      heatmapToggle.property('disabled', false);
      if (state.prevComfortModel !== 'none') {
        heatmapToggle.property('checked', true);
        pointsToggle.property('checked', false);
      }
    }

    state.prevComfortModel = selectedModel;

    slidersContainer.style('display', 'none');
    sliderWrapper.style('display', 'none');
    strategyTogglesWrapper.style('display', 'none');
    showBioclimaticStrategies = false;

    if (selectedModel === 'ashrae' || selectedModel === 'iso') {
      slidersContainer.style('display', 'block');
      if (modelDefaults[selectedModel]) {
        const defaults = modelDefaults[selectedModel];
        comfortParams.forEach(p => {
          d3.select(`#psychro-${p.id}`).property('value', defaults[p.id]);
          d3.select(`#psychro-${p.id}-value`).text(defaults[p.id].toFixed(1));
        });
      }
    } else if (selectedModel === 'bioclimatic') {
      sliderWrapper.style('display', 'block');
      strategyTogglesWrapper.style('display', 'block');
      showBioclimaticStrategies = true;

      const defs = BioclimaticStrategies.getStrategyDefinitions();
      strategyTogglesWrapper.html('<div style="font-size: 0.85em; font-weight: bold; margin-bottom: 5px;">Active Strategies:</div>');

      Object.values(defs).forEach(strat => {
        const isChecked = state.activeStrategies[strat.id];
        const row = strategyTogglesWrapper.append('div').attr('class', 'form-check form-switch control-item');
        row.html(`
                    <input class="form-check-input strategy-checkbox" type="checkbox" id="strat-${strat.id}" data-id="${strat.id}" ${isChecked ? 'checked' : ''}>
                    <label class="form-check-label" for="strat-${strat.id}" style="font-size:0.85em;">
                        <span style="display:inline-block; width:10px; height:10px; background:${strat.color}; margin-right:5px; border-radius:2px;"></span>
                        ${strat.name}
                    </label>
                `);
      });

      strategyTogglesWrapper.selectAll('.strategy-checkbox').on('change', function () {
        const stratId = d3.select(this).attr('data-id');
        state.activeStrategies[stratId] = this.checked;
        updateChart();
      });
    }
  };

  panel.selectAll('input').on('input', function () {
    if (this.name === 'comfortModel') {
      updateDependentControls();
    }

    if (this.id === 'psychro-heatmap-toggle' && this.checked) {
      d3.select('#psychro-points-toggle').property('checked', false);
    }
    if (this.id === 'psychro-points-toggle' && this.checked) {
      d3.select('#psychro-heatmap-toggle').property('checked', false);
    }

    comfortParams.forEach(p => {
      if (this.id === `psychro-${p.id}`) {
        d3.select(`#psychro-${p.id}-value`).text((+this.value).toFixed(1));
      }
    });

    updateChart();
  });

  d3.select('#mot-slider').on('input', function () {
    state.meanOutdoorTemp = parseFloat(this.value);
    d3.select('#mot-val').text(this.value);
    updateChart();
    if (typeof renderTemporalDistributionChart === 'function') {
      renderTemporalDistributionChart('#temporal-distribution-chart', epwData, chartRefs);
    }
    if (typeof renderBioclimaticFrequencyChart === 'function') {
      renderBioclimaticFrequencyChart('#bioclimatic-frequency-chart', epwData);
    }
  });

  updateDependentControls();
}

export function renderPsychroChart(selector, epwData, chartRefs) {
  const container = d3.select(selector).html('');
  const hourlyData = filterUnifiedHourlyData(epwData.data, state.bioclimaticFilters, epwData.metadata.location);
  const location = epwData.metadata.location;
  const pressure = getStationPressure(epwData);
  const formattedLocationSimple = formatSimpleLocation(location.city, location.country, 'primary');

  addExportButton(selector, 'psychrometric-chart', formattedLocationSimple);
  addInfoButton(selector, 'psychrometric');

  const suffix = buildUnifiedChartTitleSuffix(state.bioclimaticFilters, location.latitude || 0);
  container.append('h5').text('Psychrometric Chart' + suffix).attr('class', 'chart-title-main');
  
  const chartArea = container.append('div').attr('class', 'chart-area-wrapper').style('position', 'relative');

  const margin = { top: 20, right: 90, bottom: 170, left: 80 };
  const width = Math.max(600, CHART_DESIGN_WIDTH - margin.left - margin.right);
  const height = Math.max(400, width * 0.7) - margin.top - margin.bottom;

  const svg = chartArea.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const t_min = -10, t_max = 50, w_min = 0, w_max = 0.030;
  const x = d3.scaleLinear().domain([t_min, t_max]).range([0, width]);
  const y = d3.scaleLinear().domain([w_min, w_max]).range([height, 0]);
  const y_vp = d3.scaleLinear().domain([
    PsychroLib.getVaporPressureFromW(w_min, pressure),
    PsychroLib.getVaporPressureFromW(w_max, pressure)
  ]).range([height, 0]);

  const clippedGridGroup = svg.append("g")
    .attr("clip-path", "url(#chart-area)");

  clippedGridGroup.append("g")
    .attr("class", "grid x-grid")
    .attr("transform", `translate(0, ${height})`)
    .call(d3.axisBottom(x).tickSize(-height).tickFormat('').ticks(12));

  clippedGridGroup.append("g")
    .attr("class", "grid y-grid")
    .attr("transform", `translate(${width}, 0)`)
    .call(d3.axisRight(y).tickSize(-width).tickFormat('').ticks(15));

  svg.append("g")
    .attr("class", "grid y-grid-vp")
    .call(d3.axisLeft(y_vp).tickSize(-width).tickFormat('').ticks(10));

  svg.selectAll(".grid.x-grid .tick line, .grid.y-grid .tick line").attr("stroke", "#e9ecef");
  svg.selectAll(".grid.y-grid-vp .tick line").attr("stroke", "#6c757d").style("stroke-dasharray", "3,3");

  const xAxis = svg.append("g").attr('class', 'axis x-axis').attr("transform", `translate(0, ${height})`)
    .call(d3.axisBottom(x)
      .tickValues(d3.range(t_min, t_max + 1, 1))
      .tickSize(5)
      .tickSizeOuter(0)
      .tickPadding(8)
      .tickFormat((d) => d % 5 === 0 ? d : '')
    );

  xAxis.selectAll('.tick line')
    .attr('stroke', (d) => d % 5 === 0 ? '#212529' : '#ced4da')
    .attr('stroke-width', 1)
    .style('shape-rendering', 'crispEdges');

  xAxis.selectAll('text')
    .style('font-family', CHART_FONT_FAMILY)
    .style('font-size', '11px')
    .style('fill', '#212529');

  const yAxis = svg.append("g").attr('class', 'axis y-axis').attr("transform", `translate(${width}, 0)`)
    .call(d3.axisRight(y).ticks(30).tickSize(5).tickSizeOuter(0).tickPadding(8).tickFormat(d => {
      const val = d * 1000;
      return val % 2 === 0 ? val.toFixed(0) : '';
    }));
  yAxis.selectAll('.tick line').attr('stroke-width', (d) => (d * 1000) % 2 === 0 ? 1 : 0.5);
  yAxis.selectAll('text')
    .style('font-family', CHART_FONT_FAMILY)
    .style('font-size', '11px')
    .style('fill', '#212529');

  const yAxisVP = svg.append("g").attr('class', 'axis y-axis-vp')
    .call(d3.axisLeft(y_vp).ticks(10).tickSize(5).tickPadding(8));
  yAxisVP.selectAll('text')
    .style('font-family', CHART_FONT_FAMILY)
    .style('font-size', '11px')
    .style('fill', '#212529');

  svg.append("text")
    .attr("x", width / 2).attr("y", height + 40)
    .attr("text-anchor", "middle")
    .style("font-family", "sans-serif")
    .style("font-size", "12px")
    .style("font-weight", "bold")
    .style("fill", "#333")
    .text("Dry Bulb Temperature (°C)");

  svg.append("text")
    .attr("transform", `translate(${width + 55}, ${height / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .style("font-family", "sans-serif")
    .style("font-size", "12px")
    .style("font-weight", "bold")
    .style("fill", "#333")
    .text("Humidity Ratio (g/kg)");

  const yAxisVPTitle = svg.append("text")
    .attr("transform", `translate(-55, ${height / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .style("font-family", "sans-serif")
    .style("font-size", "12px")
    .style("font-weight", "bold")
    .style("fill", "#333")
    .text("Vapor Pressure (Pa)");

  const line = d3.line().x(d => x(d.t)).y(d => y(d.w)).curve(d3.curveCatmullRom);
  const satCurveData = d3.range(t_min, t_max + 0.2, 0.2).map(t => ({ t: t, w: Math.min(w_max, PsychroLib.getHumidityRatio(t, 100, pressure)) }));
  svg.append('path').datum(satCurveData.filter(d => d.w <= w_max)).attr('d', line).attr('fill', 'none').attr('stroke', CHART_COLORS.saturationCurve).attr('stroke-width', 2);

  const dataPoints = hourlyData.map(d => ({ t: d.dryBulbTemperature, w: d.humidityRatio !== undefined ? d.humidityRatio : PsychroLib.getHumidityRatio(d.dryBulbTemperature, d.relativeHumidity, pressure) })).filter(d => d.t >= t_min && d.t <= t_max && d.w >= w_min && d.w <= w_max);

  const infoContainer = chartArea.append('div').attr('class', 'hover-info-panel').style('display', 'none');
  const infoItems = { 'Dry bulb temperature': '°C', 'Relative humidity': '%', 'Humidity ratio': 'g/kg', 'Wet bulb temp': '°C', 'Dew point temp': '°C', 'Enthalpy': 'kJ/kg' };
  const infoItemsGrid = infoContainer.append('div').attr('class', 'info-items-psychrometric-grid');
  Object.entries(infoItems).forEach(([label, unit]) => {
    infoItemsGrid.append('div').attr('class', 'info-item').append('span').attr('class', 'label').text(label + ':').append('span').attr('class', 'value').attr('id', `info-${label.toLowerCase().replace(/ /g, '-')}`).html(`-- ${unit}`);
  });

  const defs = svg.append('defs');

  defs.append('clipPath')
    .attr('id', 'rect-area')
    .append('rect')
    .attr('width', width)
    .attr('height', height);

  const validSatData = satCurveData.filter(d => d.w <= w_max);
  const clipPathLine = d3.line().x(d => x(d.t)).y(d => y(d.w)).curve(d3.curveCatmullRom);
  let clipD = clipPathLine(validSatData);
  clipD += ` L ${width},${height} L 0,${height} Z`;

  defs.append('clipPath')
    .attr('id', 'chart-area')
    .append('path')
    .attr('d', clipD);

  const gradient = defs.append('linearGradient').attr('id', 'ashrae-gradient').attr('x1', '0%').attr('y1', '100%').attr('x2', '0%').attr('y2', '0%');
  gradient.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(27, 173, 209, 0.2)');
  gradient.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(15, 58, 199, 0.6)');

  const indicatorShadow = defs.append('filter')
    .attr('id', 'indicator-shadow')
    .attr('x', '-60%').attr('y', '-60%').attr('width', '220%').attr('height', '220%');
  indicatorShadow.append('feDropShadow')
    .attr('dx', 0).attr('dy', 1).attr('stdDeviation', 1.4)
    .attr('flood-color', '#000000').attr('flood-opacity', 0.35);

  const heatmapGroup = svg.append('g')
    .attr('class', 'data-heatmap')
    .attr('clip-path', 'url(#chart-area)');
  const isoPmvOverlayGroup = svg.append('g').attr('class', 'iso-pmv-overlay').attr('clip-path', 'url(#chart-area)');
  const pointsGroup = svg.append('g').attr('class', 'data-points');
  const comfortGroup = svg.append('g').attr('class', 'comfort-zone').attr('clip-path', 'url(#chart-area)');
  const lineGroup = svg.append('g').attr('class', 'psychro-lines');
  const labelGroup = svg.append('g').attr('class', 'psychro-labels');
  const legendsGroup = svg.append('g').attr('class', 'psychro-legends');
  const indicator = svg.append('g')
    .style('display', 'none')
    .attr('class', 'indicator')
    .style('pointer-events', 'none')
    .attr('filter', 'url(#indicator-shadow)');
  indicator.append('circle').attr('class', 'indicator-halo').attr('r', 9).attr('fill', '#ffffff').attr('fill-opacity', 0.55).attr('stroke', 'none');
  indicator.append('circle').attr('class', 'indicator-ring').attr('r', 6).attr('fill', 'none').attr('stroke', CHART_COLORS.indicator).attr('stroke-width', 2);
  indicator.append('circle').attr('class', 'indicator-dot').attr('r', 1.5).attr('fill', CHART_COLORS.indicator).attr('stroke', 'none');

  chartRefs.psychro.update = (options) => {
    chartRefs.psychro.currentOptions = options;
    heatmapGroup.selectAll('*').remove();
    pointsGroup.selectAll('*').remove();
    lineGroup.selectAll('*').remove();
    labelGroup.selectAll('*').remove();
    comfortGroup.selectAll('*').remove();
    isoPmvOverlayGroup.selectAll('*').remove();
    legendsGroup.selectAll('*').remove();

    svg.select('.x-grid').style('display', options.showDBT ? 'block' : 'none');
    svg.select('.y-grid').style('display', options.showHR ? 'block' : 'none');
    [yAxisVP, svg.select('.y-grid-vp'), yAxisVPTitle].forEach(sel => sel.style('display', options.showVP ? 'block' : 'none'));

    let bioData = null;
    if (typeof drawBioclimaticLayer === 'function') {
      bioData = drawBioclimaticLayer(svg, x, y, epwData, chartRefs);
    }

    if (options.showHeatmap) {
      const heatmapData = createDataHeatmap(dataPoints, [t_min, t_max], [w_min, w_max], 70, 35);
      const maxCount = d3.max(heatmapData, d => d.count) || 0;
      const colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, maxCount || 1]);

      heatmapGroup.selectAll('rect').data(heatmapData).join('rect')
        .attr('x', d => x(d.x0)).attr('y', d => y(d.y1))
        .attr('width', d => x(d.x1) - x(d.x0)).attr('height', d => y(d.y0) - y(d.y1))
        .attr('fill', d => colorScale(d.count)).attr('opacity', 0.7)
        .attr('stroke', d => {
          const s = state.psychroSelection;
          return (s && s.type === 'heatmap' && s.data && s.data.x0 === d.x0 && s.data.y0 === d.y0) ? '#111' : 'none';
        })
        .attr('stroke-width', d => {
          const s = state.psychroSelection;
          return (s && s.type === 'heatmap' && s.data && s.data.x0 === d.x0 && s.data.y0 === d.y0) ? 1.5 : 0;
        })
        .style('cursor', 'pointer')
        .style('pointer-events', 'all')
        .on('click', function (event, d) {
          event.stopPropagation();
          const s = state.psychroSelection;

          if (s && s.type === 'heatmap' && s.data && s.data.x0 === d.x0 && s.data.y0 === d.y0) {
            state.psychroSelection = { type: 'all' };
          } else {
            state.psychroSelection = { type: 'heatmap', data: d };
          }

          if (chartRefs && chartRefs.psychro && typeof chartRefs.psychro.update === 'function') {
            chartRefs.psychro.update(chartRefs.psychro.currentOptions);
          }
          renderTemporalDistributionChart('#temporal-distribution-chart', epwData, chartRefs);
        });

      heatmapGroup.raise();
    }

    if (options.comfortModel === 'ashrae') {
      const polygonData = ComfortLib.getComfortPolygon(options.comfortParams, pressure);
      if (polygonData.length > 0) {
        comfortGroup.append('path')
          .attr('d', d3.line().x(d => x(d.t)).y(d => y(d.w))(polygonData) + 'Z')
          .attr('fill', 'url(#ashrae-gradient)')
          .attr('stroke', 'rgba(18, 79, 172, 0.9)')
          .attr('stroke-width', 1.5);

        const pixelPolygon = polygonData.map(p => [x(p.t), y(p.w)]);
        const [cx, cy] = d3.polygonCentroid(pixelPolygon);
        if (!isNaN(cx) && !isNaN(cy)) {
          labelGroup.append('text')
            .attr('x', cx).attr('y', cy).attr('text-anchor', 'middle').attr('dy', '0.35em')
            .style('font-family', CHART_FONT_FAMILY)
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .style('fill', '#eeeeeeff')
            .style('text-shadow', '0 1px 3px rgba(0,0,0,0.6)')
            .style('pointer-events', 'none')
            .text('COMFORT');
        }
      }
    } else if (options.comfortModel === 'iso') {
      const p = options.comfortParams;
      const pmvColorScale = d3.scaleDiverging([3, 0, -3], d3.interpolateRdBu).clamp(true);

      const gridData = [];
      const tStep = 1.0, wStep = 0.0005;
      for (let t = t_min; t < t_max; t += tStep) {
        const w_sat_current = PsychroLib.getHumidityRatio(t, 100, pressure);
        const w_sat_next = PsychroLib.getHumidityRatio(t + tStep, 100, pressure);
        const w_limit = Math.min(w_max, Math.max(w_sat_current, w_sat_next)) + wStep;

        for (let w = w_min; w < w_limit; w += wStep) {
          const rh = Math.min(100, PsychroLib.getRelHumidity(t, w, pressure));
          const pmv = PsychroLib.getPMV(t, p.mrt, p.windSpeed, rh, p.metRate, p.cloLevel);
          gridData.push({ t: t, w: w, pmv: pmv });
        }
      }

      isoPmvOverlayGroup.selectAll('rect').data(gridData).join('rect')
        .attr('x', d => x(d.t)).attr('y', d => y(d.w + wStep))
        .attr('width', x(t_min + tStep) - x(t_min))
        .attr('height', y(w_min) - y(w_min + wStep))
        .attr('fill', d => pmvColorScale(d.pmv))
        .attr('opacity', 0.6);

      const contours = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];
      contours.forEach(level => {
        const contourData = [];
        for (let t = t_min; t <= t_max; t += 1) {
          let low = 0, high = 100;
          for (let i = 0; i < 15; i++) {
            let mid_rh = (low + high) / 2;
            let pmv = PsychroLib.getPMV(t, p.mrt, p.windSpeed, mid_rh, p.metRate, p.cloLevel);
            if (pmv < level) low = mid_rh; else high = mid_rh;
          }
          const W = PsychroLib.getHumidityRatio(t, high, pressure);
          if (W >= w_min && W <= w_max) contourData.push({ t, w: W });
        }
        if (contourData.length > 1) {
          isoPmvOverlayGroup.append('path').datum(contourData).attr('d', line).attr('fill', 'none').attr('stroke', '#343a40').attr('stroke-width', 0.7).attr('opacity', 0.4).attr('clip-path', 'url(#chart-area)');
        }
      });
    }

    if (options.showPoints) {
      pointsGroup.selectAll('circle').data(dataPoints.filter((d, i) => i % 10 === 0)).join('circle')
        .attr('cx', d => x(d.t)).attr('cy', d => y(d.w))
        .attr('r', 1.5).attr('fill', '#2f4f4f').attr('opacity', 0.6);
    }

    if (options.showRH) {
      [10, 20, 30, 40, 50, 60, 70, 80, 90].forEach(rh => {
        const rhData = d3.range(t_min, t_max + 0.5, 0.5).map(t => ({ t: t, w: PsychroLib.getHumidityRatio(t, rh, pressure) }));
        const rhDataFiltered = rhData.filter(d => d.w <= w_max && d.w >= w_min && x(d.t) <= width);
        lineGroup.append('path').datum(rhDataFiltered).attr('d', line).attr('fill', 'none').attr('stroke', options.comfortModel === 'iso' ? CHART_COLORS.rhLineDimmed : CHART_COLORS.rhLine).attr('stroke-width', 1).attr('opacity', 0.8).style("stroke-dasharray", ("3, 3"));
        if (rhDataFiltered.length > 1) {
          const lastPoint = rhDataFiltered[rhDataFiltered.length - 1];
          const labelX = x(lastPoint.t);
          const labelY = y(lastPoint.w);

          let finalY = labelY;
          let verticalOffset = '-0.3em';
          let anchor = 'end';

          if (labelY < 15) {
            finalY = 0;
            verticalOffset = '-0.5em';
            anchor = 'middle';
          }

          labelGroup.append('text')
            .attr('x', labelX - 2)
            .attr('y', finalY)
            .attr('dy', verticalOffset)
            .attr('text-anchor', anchor)
            .style('font-family', CHART_FONT_FAMILY)
            .style('font-size', '10px')
            .style('fill', options.comfortModel === 'iso' ? '#28282B' : CHART_COLORS.rhLine)
            .text(`${rh}%`);
        }
      });
    }
    if (options.showWB) {
      d3.range(-10, 35, 5).forEach(wbt => {
        const h_wb = PsychroLib.getEnthalpy(wbt, PsychroLib.getHumidityRatio(wbt, 100, pressure));
        const wbDataPoints = d3.range(wbt, t_max + 0.5, 0.5).map(t => ({ t, w: (h_wb - 1.006 * t) / (2501 + 1.86 * t) })).filter(p => p.w >= w_min && p.w <= w_max && p.t >= wbt);
        if (wbDataPoints.length > 1) {
          lineGroup.append('path').datum(wbDataPoints).attr('d', line).attr('fill', 'none').attr('stroke', options.comfortModel === 'iso' ? '#808080' : '#17a2b8').attr('stroke-width', 1).attr('stroke-dasharray', '4,4');

          const labelPoint = wbDataPoints[0];
          if (x(labelPoint.t) >= 0 && y(labelPoint.w) <= height) {
            let labelX = x(labelPoint.t);
            let labelY = y(labelPoint.w);
            let textAnchor = 'end';
            let dx = -8;
            let dy = -8;

            if (labelX < 20) {
              textAnchor = 'start';
              dx = 8;
            }

            if (labelY < 15) {
              dy = 15;
            }

            labelGroup.append('text')
              .attr('x', labelX)
              .attr('y', labelY)
              .attr('dx', dx)
              .attr('dy', dy)
              .attr('text-anchor', textAnchor)
              .style('font-family', CHART_FONT_FAMILY)
              .style('font-size', '10px')
              .style('fill', options.comfortModel === 'iso' ? '#28282B' : '#17a2b8')
              .text(`${wbt}°`);
          }
        }
      });
    }
    if (options.showEnthalpy) {
      d3.range(-10, 121, 10).forEach(h => {
        const p_bottom = { t: PsychroLib.getTdbFromEnthalpyAndW(h, 0), w: 0 };
        const p_top = { t: PsychroLib.getTdbFromEnthalpyAndW(h, w_max), w: w_max };

        lineGroup.append('line')
          .attr('x1', x(p_bottom.t)).attr('y1', y(p_bottom.w))
          .attr('x2', x(p_top.t)).attr('y2', y(p_top.w))
          .attr('stroke', options.comfortModel === 'iso' ? '#808080' : '#28a745').attr('stroke-width', 1)
          .attr('stroke-dasharray', '5,3').attr('clip-path', 'url(#rect-area)');

        let labelPos = null;

        const t_at_w_max = PsychroLib.getTdbFromEnthalpyAndW(h, w_max);
        if (t_at_w_max > t_min && t_at_w_max <= t_max) {
          labelPos = { x: x(t_at_w_max), y: y(w_max), anchor: 'middle', dy: 12 };
        }
        else {
          const w_at_t_min = (h - 1.006 * t_min) / (2501 + 1.86 * t_min);
          if (w_at_t_min > w_min && w_at_t_min < w_max) {
            labelPos = { x: x(t_min), y: y(w_at_t_min), anchor: 'start', dx: 5, dy: -6 };
          }
        }
        if (!labelPos) {
          const w_at_t_max = (h - 1.006 * t_max) / (2501 + 1.86 * t_max);
          if (w_at_t_max >= w_min && w_at_t_max < w_max) {
            labelPos = { x: x(t_max), y: y(w_at_t_max), anchor: 'end', dx: -5, dy: -10 };
          }
        }

        if (labelPos && labelPos.x >= 0 && labelPos.x <= width && labelPos.y >= 0 && labelPos.y <= height) {
          labelGroup.append('text')
            .attr('x', labelPos.x)
            .attr('y', labelPos.y)
            .attr('dx', labelPos.dx || 0)
            .attr('dy', labelPos.dy || 0)
            .attr('text-anchor', labelPos.anchor)
            .style('font-family', CHART_FONT_FAMILY)
            .style('font-size', '10px')
            .style('fill', options.comfortModel === 'iso' ? '#28282B' : '#28a745')
            .text(h);
        }
      });
    }

    defs.selectAll('linearGradient[id$="-legend-gradient"]').remove();
    const legendWidth = 250;

    const LEGEND_PAD = 14;

    const drawHeatmapLegend = (lx, ly) => {
      const contentHeight = 44;
      const heatmapLegend = legendsGroup.append('g')
        .attr('class', 'heatmap-legend legend-card')
        .attr('transform', `translate(${lx}, ${ly})`);

      drawLegendCard(heatmapLegend, 0, 0, legendWidth, contentHeight, LEGEND_PAD);

      const legendGradient = defs.append('linearGradient').attr('id', 'heatmap-legend-gradient').attr('x1', '0%').attr('y1', '0%').attr('x2', '100%').attr('y2', '0%');
      legendGradient.selectAll('stop').data(d3.range(0, 1.01, 0.1)).join('stop').attr('offset', d => `${d * 100}%`).attr('stop-color', t => d3.interpolateYlOrRd(t));

      styleChartText(heatmapLegend.append('text').attr('x', legendWidth / 2).attr('y', 10).attr('text-anchor', 'middle'), { size: 11, weight: 'bold' })
        .text('Annual Weather Data Distribution');
      heatmapLegend.append('rect').attr('x', 0).attr('y', 15).attr('width', legendWidth).attr('height', 10).attr('rx', 2).style('fill', 'url(#heatmap-legend-gradient)');
      styleChartText(heatmapLegend.append('text').attr('x', 0).attr('y', 40).attr('text-anchor', 'start'), { size: 10, color: CHART_COLORS.textMuted })
        .text('Fewer Hours');
      styleChartText(heatmapLegend.append('text').attr('x', legendWidth).attr('y', 40).attr('text-anchor', 'end'), { size: 10, color: CHART_COLORS.textMuted })
        .text('More Hours');

      return contentHeight;
    };

    const drawIsoLegend = (lx, ly) => {
      const contentHeight = 64;
      const isoLegend = legendsGroup.append('g')
        .attr('class', 'iso-legend legend-card')
        .attr('transform', `translate(${lx}, ${ly})`);

      drawLegendCard(isoLegend, 0, 0, legendWidth, contentHeight, LEGEND_PAD);

      const emojiMap = { '-3': '🥶', '-2': '', '-1': '', '0': '😊', '1': '', '2': '', '3': '🥵' };

      const pmvColorScale = d3.scaleDiverging([3, 0, -3], d3.interpolateRdBu);
      const legendGradient = defs.append('linearGradient').attr('id', 'pmv-legend-gradient').attr('x1', '0%').attr('x2', '100%');
      legendGradient.selectAll('stop').data(d3.range(-3, 3.01, 0.5)).join('stop').attr('offset', d => `${((d + 3) / 6) * 100}%`).attr('stop-color', t => pmvColorScale(t));

      styleChartText(isoLegend.append('text').attr('x', legendWidth / 2).attr('y', 10).attr('text-anchor', 'middle'), { size: 11, weight: 'bold' })
        .text('Predicted Mean Vote (PMV)');
      isoLegend.append('rect').attr('x', 0).attr('y', 15).attr('width', legendWidth).attr('height', 10).attr('rx', 2).style('fill', 'url(#pmv-legend-gradient)');

      const legendScale = d3.scaleLinear().domain([-3, 3]).range([0, legendWidth]);
      const legendTicks = [-3, -2, -1, 0, 1, 2, 3];

      styleChartText(
        isoLegend.selectAll('text.legend-tick-label').data(legendTicks).join('text')
          .attr('x', d => legendScale(d)).attr('y', 40).attr('text-anchor', 'middle'),
        { size: 10, color: CHART_COLORS.textMuted }
      ).text(d => d > 0 ? `+${d}` : d);

      isoLegend.selectAll('text.legend-emoji-label').data(legendTicks).join('text')
        .attr('x', d => legendScale(d)).attr('y', 60).attr('text-anchor', 'middle').style('font-size', '16px')
        .text(d => emojiMap[d]);

      return contentHeight;
    };

    const drawBioLegend = (ly, data, mot) => {
      const startY = 25;
      const colCount = 3;
      const colWidth = 230;
      const totalGridWidth = colCount * colWidth;
      const startX = (width - totalGridWidth) / 2 + 30;
      const rowHeight = 22;
      const totalRows = Math.ceil(data.length / colCount);
      const contentHeight = startY + (totalRows * rowHeight) - 8;

      const bioLegend = legendsGroup.append('g')
        .attr('class', 'bio-legend legend-card')
        .attr('transform', `translate(0, ${ly})`);

      drawLegendCard(bioLegend, 0, 0, width, contentHeight, LEGEND_PAD);

      const headerG = bioLegend.append('g').attr('transform', `translate(${width / 2}, 5)`);
      headerG.append('line').attr('x1', -110).attr('x2', -90).attr('y1', -4).attr('y2', -4)
        .attr('stroke', CHART_COLORS.indicator).attr('stroke-width', 1.5).attr('stroke-dasharray', '6,4');
      styleChartText(headerG.append('text').attr('x', -85).attr('y', 0).attr('text-anchor', 'start'), { size: 11, weight: 'bold' })
        .text(`Mean Outdoor Temperature: ${mot}°C`);

      data.forEach((item, index) => {
        const row = Math.floor(index / colCount);
        const col = index % colCount;

        const itemX = startX + (col * colWidth);
        const itemY = startY + (row * rowHeight);

        const itemG = bioLegend.append('g')
          .attr('transform', `translate(${itemX}, ${itemY})`);

        itemG.append('rect').attr('x', 0).attr('y', 0).attr('width', 12).attr('height', 12)
          .attr('fill', item.isComfort ? item.color : 'transparent')
          .attr('stroke', item.color).attr('stroke-width', 2)
          .attr('stroke-dasharray', item.isComfort ? 'none' : '2,2').attr('rx', 2);

        styleChartText(itemG.append('text').attr('x', 18).attr('y', 10), { size: 11 })
          .text(`${item.name}: ${item.percent.toFixed(1)}%`);
      });

      return contentHeight;
    };

    const showHeatmapLegend = options.showHeatmap;
    const showIsoLegend = options.comfortModel === 'iso';

    let currentY = height + 65 + LEGEND_PAD;

    if (showHeatmapLegend || showIsoLegend) {
      let usedHeight = 0;
      if (showHeatmapLegend && showIsoLegend) {
        const legendGap = 40;
        const totalLegendsWidth = legendWidth * 2 + legendGap;
        const startX = (width - totalLegendsWidth) / 2;
        usedHeight = Math.max(drawHeatmapLegend(startX, currentY), drawIsoLegend(startX + legendWidth + legendGap, currentY));
      } else if (showHeatmapLegend) {
        const legendX = (width - legendWidth) / 2;
        usedHeight = drawHeatmapLegend(legendX, currentY);
      } else if (showIsoLegend) {
        const legendX = (width - legendWidth) / 2;
        usedHeight = drawIsoLegend(legendX, currentY);
      }
      currentY += usedHeight + LEGEND_PAD * 2 + 15;
    }

    if (options.comfortModel === 'bioclimatic' && bioData && bioData.legendData.length > 0) {
      const bioHeight = drawBioLegend(currentY, bioData.legendData, bioData.mot);
      currentY += bioHeight + LEGEND_PAD * 2 + 15;
    }

    const showComfortParams = options.comfortModel === 'ashrae' || options.comfortModel === 'iso';
    if (showComfortParams) {
      const params = options.comfortParams;
      const paramsTextLine = legendsGroup.append('text')
        .attr('x', width / 2)
        .attr('y', currentY)
        .attr('text-anchor', 'middle');

      styleChartText(paramsTextLine.append('tspan'), { size: 11, weight: 'bold' })
        .text('Comfort Analysis Parameters: ');

      const valuesString = `Mean Radiant Temp: ${params.mrt.toFixed(1)} °C  │  Wind Speed: ${params.windSpeed.toFixed(1)} m/s  │  Metabolic Rate: ${params.metRate.toFixed(1)} met  │  Clothing Level: ${params.cloLevel.toFixed(1)} clo`;
      styleChartText(paramsTextLine.append('tspan'), { size: 10, color: CHART_COLORS.textMuted })
        .text(valuesString);

      currentY += 15;
    }

    const excludedCount = hourlyData.length - dataPoints.length;
    if (excludedCount > 0 && hourlyData.length > 0) {
      const excludedPercent = (excludedCount / hourlyData.length) * 100;
      const excludedNote = legendsGroup.append('text')
        .attr('x', width / 2)
        .attr('y', currentY)
        .attr('text-anchor', 'middle');
      styleChartText(excludedNote, { size: 9, color: CHART_COLORS.textMuted })
        .text(`${excludedCount} hour${excludedCount === 1 ? '' : 's'} (${excludedPercent.toFixed(1)}%) fall outside the ${t_min} to ${t_max} °C chart range and are not plotted`);
      currentY += 13;
    }

    const dynamicTotalHeight = currentY + margin.top + 10;
    d3.select(selector).select('svg')
      .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${dynamicTotalHeight}`);
  };

  svg.insert('rect', ':first-child')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'transparent')
    .attr('clip-path', 'url(#chart-area)');

  svg.on('mousemove', function (event) {
      if (!d3.select('#psychro-indicator-toggle').property('checked')) {
          svg.style('cursor', 'default');
          return;
      }

      const [mx, my] = d3.pointer(event, svg.node());
      const t = x.invert(mx), w = Math.max(0, y.invert(my));
      
      if (w > PsychroLib.getHumidityRatio(t, 100, pressure) || 
          t < t_min || t > t_max || 
          mx > width || mx < 0 || my > height || my < 0) {
          
          indicator.style('display', 'none');
          infoContainer.style('display', 'none');
          svg.style('cursor', 'default');
          return;
      }
      
      const overHeatmapCell = !!(event.target && event.target.closest && event.target.closest('.data-heatmap'));

      if (overHeatmapCell) {
        indicator.style('display', 'none');
      } else {
        svg.style('cursor', 'crosshair');
        indicator.style('display', 'block').attr('transform', `translate(${mx}, ${my})`);
      }
      
      infoContainer
          .style('display', 'block')
          .style('left', `${margin.left + 20}px`)
          .style('right', 'auto')
          .style('top', `${margin.top + 20}px`);

      const rh = PsychroLib.getRelHumidity(t, w, pressure), 
            h = PsychroLib.getEnthalpy(t, w), 
            wbt = PsychroLib.getWetBulb(t, w, pressure), 
            dpt = PsychroLib.getDewPoint(w, pressure);
      
      d3.select('#info-dry-bulb-temperature').text(` ${t.toFixed(1)} °C`);
      d3.select('#info-humidity-ratio').text(` ${(w * 1000).toFixed(1)} g/kg`);
      d3.select('#info-relative-humidity').text(` ${rh.toFixed(1)} %`);
      d3.select('#info-wet-bulb-temp').text(` ${wbt.toFixed(1)} °C`);
      d3.select('#info-enthalpy').text(` ${h.toFixed(1)} kJ/kg`);
      d3.select('#info-dew-point-temp').text(dpt ? ` ${dpt.toFixed(1)} °C` : ' -- °C');
  })
  .on('mouseleave', () => { 
      indicator.style('display', 'none'); 
      infoContainer.style('display', 'none'); 
      svg.style('cursor', 'default');
  });

  container.append('style').text(`
        .hover-info-panel { position: absolute; background-color: rgba(255, 255, 255, 0.72); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); border: 1px solid rgba(222, 226, 230, 0.9); border-radius: 8px; padding: 8px 9px; font-size: 9px; box-shadow: 0 4px 14px rgba(0,0,0,0.12); pointer-events: none; top: ${margin.top + 1}px; left: ${margin.left + 1}px; transition: left 0.12s ease, right 0.12s ease; }
        .info-items-psychrometric-grid { display: grid; grid-template-columns: auto auto; gap: 2px 8px; }
        .info-item-psychrometric .label { font-weight: bold; } .info-item-psychrometric .value { text-align: right; }
        #comfort-options-container { transition: opacity 0.3s ease; }
    `);

  const initialUpdate = () => {
    if (chartRefs.psychro && chartRefs.psychro.update) {
      d3.select('input[name="comfortModel"]').dispatch('input');
    } else { setTimeout(initialUpdate, 50); }
  };
  initialUpdate();
}

export function drawBioclimaticLayer(svg, xScale, yScale, epwData, chartRefs) {
  svg.selectAll('.bioclimatic-poly-group').remove();
  svg.selectAll('.mot-line-group').remove();
  svg.selectAll('.bioclimatic-legend-group').remove();

  if (!showBioclimaticStrategies) return null;

  const mot = state.meanOutdoorTemp || 19;
  const meanTempOffset = mot - 19;
  const pressure = getStationPressure(epwData);
  const defs = BioclimaticStrategies.getStrategyDefinitions();

  const polyGroup = svg.append('g')
    .attr('class', 'bioclimatic-poly-group')
    .attr('clip-path', 'url(#chart-area)');

  const motLineGroup = svg.append('g')
    .attr('class', 'mot-line-group')
    .attr('clip-path', 'url(#chart-area)');

  motLineGroup.append('line')
    .attr('x1', xScale(mot))
    .attr('x2', xScale(mot))
    .attr('y1', yScale(yScale.domain()[0]))
    .attr('y2', yScale(yScale.domain()[1]))
    .attr('stroke', CHART_COLORS.indicator)
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '6,4')
    .style('pointer-events', 'none');

  const filteredData = filterUnifiedHourlyData(epwData.data, state.bioclimaticFilters, epwData.metadata.location);

  let legendData = [];
  const bioLine = d3.line().x(d => xScale(d.t)).y(d => yScale(d.w));

  Object.values(defs).forEach(strategyDef => {
    if (!state.activeStrategies || !state.activeStrategies[strategyDef.id]) return;

    const pointsInW = BioclimaticStrategies.getStrategyPointsInW(strategyDef.id, pressure, meanTempOffset);
    if (pointsInW.length === 0) return;

    const isComfort = strategyDef.id === 'comfort';
    const s = state.psychroSelection;
    const isSelected = s && s.type === 'strategy' && s.id === strategyDef.id;

    const stats = BioclimaticStrategies.calculateMatchStats(filteredData, strategyDef.id, pressure, meanTempOffset);
    legendData.push({
      name: strategyDef.name,
      color: strategyDef.color,
      isComfort: isComfort,
      percent: stats.percentage
    });

    polyGroup.append('path')
      .datum(pointsInW)
      .attr('d', d => bioLine(d) + " Z")
      .attr('fill', strategyDef.color)
      .attr('fill-opacity', isSelected ? (isComfort ? 0.50 : 0.40) : (isComfort ? 0.25 : 0.15))
      .attr('stroke', strategyDef.color)
      .attr('stroke-width', isSelected ? (isComfort ? 3.5 : 2.5) : (isComfort ? 2.5 : 1.5))
      .attr('stroke-dasharray', isComfort ? 'none' : '4,3')
      .style('cursor', 'pointer')
      .style('pointer-events', 'all')
      .on('click', function (event) {
        event.stopPropagation();
        const sel = state.psychroSelection;

        if (sel && sel.type === 'strategy' && sel.id === strategyDef.id) {
          state.psychroSelection = { type: 'all' };
        } else {
          state.psychroSelection = { type: 'strategy', id: strategyDef.id };
        }

        if (chartRefs && chartRefs.psychro && typeof chartRefs.psychro.update === 'function') {
          chartRefs.psychro.update(chartRefs.psychro.currentOptions);
        }
        renderTemporalDistributionChart('#temporal-distribution-chart', epwData, chartRefs);
      });
  });

  return { legendData, mot };
}

export function renderBioclimaticFrequencyChart(selector, epwData) {
  const container = d3.select(selector).html('');
  const location = epwData.metadata.location;

  const filteredData = filterUnifiedHourlyData(epwData.data, state.bioclimaticFilters, epwData.metadata.location);
  const suffix = buildUnifiedChartTitleSuffix(state.bioclimaticFilters, location.latitude);
  const formattedLocationSimple = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, 'bioclimatic-strategies-frequency', formattedLocationSimple);
  addInfoButton(selector, 'bioclimaticFrequency');

  container.append('h5').attr('class', 'chart-title-main').text('Bioclimatic Strategies Frequency' + suffix);

  const margin = { top: 20, right: 20, bottom: 95, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 320 - margin.top - margin.bottom;

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  const defs = BioclimaticStrategies.getStrategyDefinitions();
  const mot = state.meanOutdoorTemp || 19;
  const meanTempOffset = mot - 19;
  const pressure = getStationPressure(epwData);

  const totalHours = filteredData.length;

  if (totalHours === 0) {
    container.append('p').attr('class', 'text-muted text-center mt-4').text('No data available for the selected filters.');
    return;
  }

  const chartData = Object.values(defs).map((strat, index) => {
    const paddedIndex = String(index + 1).padStart(2, '0');
    const stats = BioclimaticStrategies.calculateMatchStats(filteredData, strat.id, pressure, meanTempOffset);
    return {
      category: strat.name,
      count: stats.count,
      percentage: stats.percentage.toFixed(1),
      color: strat.color,
      icon: `img/strategy_${paddedIndex}.png`
    };
  });

  const x = d3.scaleBand().domain(chartData.map(d => d.category)).range([0, width]).padding(0.2);
  const y = d3.scaleLinear().domain([0, d3.max(chartData, d => d.count)]).nice().range([height, 0]);

  const xAxis = svg.append("g")
    .attr("class", "axis x-axis")
    .attr("transform", `translate(0, ${height})`)
    .call(d3.axisBottom(x).tickSize(0));

  xAxis.selectAll(".tick text")
    .each(function (d) {
      const tick = d3.select(this);
      const words = d.split(' ');
      tick.text('');

      words.forEach((word, idx) => {
        tick.append("tspan")
          .attr("x", 0)
          .attr("dy", idx === 0 ? "0.8em" : "1.2em")
          .text(word);
      });
    })
    .style("font-size", "10px")
    .attr("fill", "#333");

  svg.append("g").attr("class", "axis y-axis").call(d3.axisLeft(y));
  svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 20).attr("x", -height / 2).style("text-anchor", "middle").text("Hours").style("font-size", "12px");

  svg.selectAll('.freq-bar').data(chartData).join('rect').attr('class', 'freq-bar')
    .attr('x', d => x(d.category))
    .attr('y', d => y(d.count))
    .attr('width', x.bandwidth())
    .attr('height', d => height - y(d.count))
    .attr('fill', d => d.color)
    .attr("stroke", "#444").attr("stroke-width", 0.5)
    .on("mouseover", function (event, d) {
      d3.select(this).style('fill', d3.color(d.color).darker(0.3));
      tooltip.style("opacity", 1).html(`<strong>${d.category}</strong><br>Hours: ${d.count}<br>Percentage: ${d.percentage}%`);
    })
    .on("mousemove", (event) => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
    .on("mouseout", function (event, d) {
      d3.select(this).style('fill', d.color);
      tooltip.style("opacity", 0);
    });

  const showHours = state.bioclimaticFilters.showHours;
  const showPercent = state.bioclimaticFilters.showPercent;

  if (showHours || showPercent) {
    const labelsG = svg.append('g').attr('class', 'bar-labels');

    labelsG.selectAll('.label-group')
      .data(chartData)
      .join('g')
      .attr('class', 'label-group')
      .attr('transform', d => {
        const yOffset = (showHours && showPercent) ? 14 : 6;
        return `translate(${x(d.category) + x.bandwidth() / 2}, ${y(d.count) - yOffset})`;
      })
      .each(function (d) {
        const g = d3.select(this);
        if (showHours && showPercent) {
          g.append('text').text(d.count).attr('text-anchor', 'middle').style('font-size', '10px').style('font-weight', 'bold').style('fill', '#333');
          g.append('text').text(`(${d.percentage}%)`).attr('text-anchor', 'middle').attr('dy', '1.1em').style('font-size', '9px').style('fill', '#555');
        } else if (showHours) {
          g.append('text').text(d.count).attr('text-anchor', 'middle').style('font-size', '10px').style('font-weight', 'bold').style('fill', '#333');
        } else if (showPercent) {
          g.append('text').text(`${d.percentage}%`).attr('text-anchor', 'middle').style('font-size', '10px').style('font-weight', 'bold').style('fill', '#333');
        }
      });
  }

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height + 85)
    .attr("text-anchor", "middle")
    .style("font-size", "10px")
    .style("font-weight", "bold")
    .style("fill", "#333")
    .text(`Mean Outdoor Temperature: ${mot} °C`);
}

export function renderTemporalDistributionChart(selector, epwData, chartRefs) {
  const container = d3.select(selector);
  if (container.empty() || container.node().getBoundingClientRect().width === 0) return;
  container.html('');

  state.psychroSelection = state.psychroSelection || { type: 'all' };
  const selection = state.psychroSelection;

  const mot = state.meanOutdoorTemp || 19;
  const meanTempOffset = mot - 19;
  const pressure = getStationPressure(epwData);

  let targetPoly = null;
  let mainTitle = '';
  let detailText = '';
  const activeColor = '#1f77b4';

  if (selection.type === 'strategy') {
    const defs = BioclimaticStrategies.getStrategyDefinitions();
    let strategyDef = defs[selection.id];
    if (!strategyDef) strategyDef = defs['comfort'];

    targetPoly = BioclimaticStrategies.getStrategyPointsInW(strategyDef.id, pressure, meanTempOffset);
    mainTitle = 'Temporal Distribution Matrix';
    detailText = `Strategy: ${strategyDef.name}`;
  } else if (selection.type === 'heatmap') {
    const heatmapData = selection.data;
    const t0 = heatmapData.x0.toFixed(1);
    const t1 = heatmapData.x1.toFixed(1);
    const w0 = (heatmapData.y0 * 1000).toFixed(1);
    const w1 = (heatmapData.y1 * 1000).toFixed(1);
    mainTitle = 'Temporal Matrix for Heatmap Range';
    detailText = `Dry Bulb Temperature [${t0} - ${t1} °C], Humidity Ratio [${w0} - ${w1} g/kg]`;
  } else if (selection.type === 'all') {
    mainTitle = 'Temporal Distribution Matrix';
    detailText = 'All Hours (Whole Year)';
  }

  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, 'temporal-distribution-calendar', formattedLocation);
  addInfoButton(selector, 'bioclimaticTemporalDistribution');

  const suffix = buildUnifiedChartTitleSuffix(state.bioclimaticFilters, location.latitude || 0);

  container.append('h5')
    .text(mainTitle)
    .attr('class', 'chart-title-main')
    .style('text-align', 'center')
    .style('margin-bottom', '0.25rem')
    .style('margin-top', '1.5rem');

  if (selection.type === 'all' || (selection.type === 'strategy' && selection.id === 'comfort')) {
    const heatmapVisible = !!(chartRefs && chartRefs.psychro && chartRefs.psychro.currentOptions && chartRefs.psychro.currentOptions.showHeatmap);
    const helperHtml = heatmapVisible
      ? 'Click a <strong>heatmap cell</strong> or select a <strong>bioclimatic strategy</strong> to see its hourly coverage.'
      : 'Select a <strong>bioclimatic strategy</strong> to see its hourly coverage.';

    container.append('p')
      .attr('class', 'text-muted text-center')
      .style('font-size', '12px')
      .style('margin-bottom', '1rem')
      .html(helperHtml);
  }

  const gridData = [];
  const gridMap = new Map();
  for (let m = 1; m <= 12; m++) {
    for (let h = 1; h <= 24; h++) {
      const cell = { month: m, hour: h, count: 0, totalDays: 0, percentage: null };
      gridData.push(cell);
      gridMap.set(`${m}-${h}`, cell);
    }
  }

  const filteredData = filterUnifiedHourlyData(epwData.data, state.bioclimaticFilters, location);

  filteredData.forEach(d => {
    const m = d.month;
    const h = d.hour;
    const t = d.dryBulbTemperature;
    const rh = d.relativeHumidity;
    let w = d.humidityRatio !== undefined ? d.humidityRatio : PsychroLib.getHumidityRatio(t, rh, pressure);

    let isMatch = false;
    if (selection.type === 'strategy' && targetPoly) {
      isMatch = BioclimaticStrategies.isPointInPolygon(t, w, targetPoly);
    } else if (selection.type === 'heatmap' && selection.data) {
      const hd = selection.data;
      isMatch = (t >= hd.x0 && t <= hd.x1 && w >= hd.y0 && w <= hd.y1);
    } else if (selection.type === 'all') {
      isMatch = true;
    }

    const cell = gridMap.get(`${m}-${h}`);
    if (cell) {
      cell.totalDays++;
      if (isMatch) cell.count++;
    }
  });

  gridData.forEach(d => {
    d.percentage = d.totalDays > 0 ? (d.count / d.totalDays) * 100 : null;
  });

  const margin = { top: 38, right: 90, bottom: 85, left: 75 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 325 - margin.top - margin.bottom;

  const svgRoot = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);

  svgRoot.append("text")
    .attr("class", "chart-title-detail")
    .attr("x", (width + margin.left + margin.right) / 2)
    .attr("y", 18)
    .attr("text-anchor", "middle")
    .style("font-size", "11px")
    .style("fill", "#6c757d")
    .text(detailText + suffix);

  const svg = svgRoot.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  const xBand = d3.scaleBand().domain(d3.range(1, 25)).range([0, width]);
  const yBand = d3.scaleBand().domain(d3.range(1, 13)).range([0, height]);
  const colorScale = d3.scaleSequential(d3.interpolateBlues).domain([0, 100]);

  const defs = svg.append('defs');
  const excludedPatternId = 'temporal-distribution-excluded-pattern';
  const excludedPattern = defs.append('pattern')
    .attr('id', excludedPatternId)
    .attr('width', 6).attr('height', 6)
    .attr('patternTransform', 'rotate(45)')
    .attr('patternUnits', 'userSpaceOnUse');
  excludedPattern.append('rect').attr('width', 6).attr('height', 6).attr('fill', '#f1f3f5');
  excludedPattern.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6).attr('stroke', '#ced4da').attr('stroke-width', 2);

  svg.selectAll(".cross-rect").data(gridData).join("rect")
    .attr("class", "cross-rect")
    .attr("x", d => xBand(d.hour))
    .attr("y", d => yBand(d.month))
    .attr("width", xBand.bandwidth() + 0.3)
    .attr("height", yBand.bandwidth() + 0.3)
    .style("fill", d => d.totalDays === 0 ? `url(#${excludedPatternId})` : colorScale(d.percentage))
    .on("mouseover", function (event, d) {
      const body = d.totalDays === 0
        ? `<span style="font-size:11px; color: #ccc;">Excluded by the active date/time filter</span>`
        : `<span style="font-size:11px; color: #ccc;">Matching: ${d.count} / ${d.totalDays} days (${d.percentage.toFixed(1)}%)</span>`;
      tooltip.style('opacity', 1).html(`
                <div style="max-width: 200px; white-space: normal; text-align: left;">
                    <strong>Hour: ${d.hour}:00</strong><br>
                    <span style="font-size:11px; color: #ccc;">Month: ${d3.timeFormat('%B')(new Date(2000, d.month - 1, 1))}</span><br>
                    ${body}
                </div>
            `);
    })
    .on("mousemove", event => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
    .on("mouseout", () => tooltip.style("opacity", 0));

  const xAxis = d3.axisBottom(xBand)
    .tickValues(d3.range(2, 25, 2))
    .tickFormat(d => `${d}:00`)
    .tickSizeOuter(0);
  svg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${height})`).call(xAxis);

  const yAxis = d3.axisLeft(yBand)
    .tickFormat(d => d3.timeFormat('%b')(new Date(2000, d - 1)))
    .tickSizeOuter(0);
  svg.append("g").attr("class", "axis y-axis").call(yAxis);

  svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 25).attr("x", -height / 2).style("text-anchor", "middle").text("Month").style("font-size", "12px");
  svg.append("text").attr("class", "x-axis-label axis-title").attr("x", width / 2).attr("y", height + 40).style("text-anchor", "middle").text("Hour of Day").style("font-size", "12px");

  const legend = svg.append("g").attr("transform", `translate(${width + 20}, 0)`);
  legend.append("text").attr("x", 7.5).attr("y", -8).attr("class", "axis-title").style("text-anchor", "middle").text("% Days").style("font-size", "11px");

  const legendScale = d3.scaleLinear().domain([0, 100]).range([height, 0]);
  legend.append("g").attr("transform", "translate(15,0)").call(d3.axisRight(legendScale).ticks(5).tickFormat(d => `${d.toFixed(0)}%`));

  const gradientId = `temp-grad-temporal-distribution`;
  const gradient = legend.append("defs").append("linearGradient").attr("id", gradientId).attr("x1", "0%").attr("y1", "100%").attr("x2", "0%").attr("y2", "0%");
  gradient.selectAll("stop").data(d3.range(0, 1.01, 0.05)).join("stop").attr("offset", d => `${d * 100}%`).attr("stop-color", t => colorScale(t * 100));

  legend.append("rect").attr("x", 0).attr("y", 0).attr("width", 15).attr("height", height).style("fill", `url(#${gradientId})`);

  const hasExcludedCells = gridData.some(d => d.totalDays === 0);
  const monthTotals = d3.rollups(gridData, v => d3.sum(v, d => d.totalDays), d => d.month);
  const fullyExcludedMonthsCount = monthTotals.filter(([, total]) => total === 0).length;

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height + 85)
    .attr("text-anchor", "middle")
    .style("font-size", "10px")
    .style("font-weight", "bold")
    .style("fill", "#212529")
    .text(`Mean Outdoor Temperature: ${mot} °C`);

  if (hasExcludedCells) {
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height + 100)
      .attr("text-anchor", "middle")
      .style("font-size", "9px")
      .style("fill", CHART_COLORS.textMuted)
      .text('Hatched cells fall outside the active date/time filter (no data to evaluate)');
  }

  if (fullyExcludedMonthsCount > 0) {
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height + 113)
      .attr("text-anchor", "middle")
      .style("font-size", "9px")
      .style("fill", CHART_COLORS.textMuted)
      .text(`${fullyExcludedMonthsCount} month${fullyExcludedMonthsCount === 1 ? '' : 's'} fully excluded by the season filter`);
  }
}