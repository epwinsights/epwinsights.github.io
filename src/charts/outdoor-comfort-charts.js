/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import {
  utciCategories,
  getCategoryInfo,
  calculateAdvancedMRT,
  calculateUTCI,
  calculateSET,
  buildChartTitleSuffix,
  filterDataForFrequency
} from '../core/outdoor-comfort.js';
import { materialPresets } from '../core/material-physics.js';
import { formatSimpleLocation } from '../core/location-formatter.js';
import { addExportButton, addInfoButton } from '../core/svg-exporter.js';
import { renderUnifiedFilterControls } from '../core/date-filter.js';
import { CHART_DESIGN_WIDTH } from '../core/chart-defaults.js';
import { resolveColorInterpolator, EPW_MRT_INTERPOLATOR, EPW_SET_INTERPOLATOR, EPW_SET_ANCHOR, EPW_UTCI_NUMERIC_INTERPOLATOR, EPW_UTCI_NUMERIC_ANCHOR } from '../core/color-palettes.js';
import state from '../state.js';

export function recomputeThermalData(epwData) {
  epwData.data.forEach(d => {
    d.mrt = calculateAdvancedMRT(d, epwData.metadata.location, state.humanParams);
    d.utci = calculateUTCI(d.dryBulbTemperature, d.mrt, d.windSpeed, d.relativeHumidity);
    d.set = calculateSET(d.dryBulbTemperature, d.mrt, d.windSpeed, d.relativeHumidity);
  });
  state.outdoorComfort.dataComputed = false;
}

function convertImageToBase64(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = this.width;
      canvas.height = this.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(this, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = function () {
      resolve(url);
    };
    img.src = url;
  });
}

const iconBase64Cache = new Map();

function getCachedIconBase64(url) {
  if (iconBase64Cache.has(url)) {
    return Promise.resolve(iconBase64Cache.get(url));
  }
  return convertImageToBase64(url).then(base64 => {
    iconBase64Cache.set(url, base64);
    return base64;
  });
}

function exportThermalDataToCSV(epwData) {
  let csvRows = [];
  csvRows.push(["DateTime", "Month", "Day", "Hour", "DryBulb_Temp(C)", "Relative_Humidity(%)", "Wind_Speed(m/s)", "MRT(C)", "UTCI(C)", "SET(C)"].join(","));

  epwData.data.forEach(d => {
    const row = [
      d.datetime instanceof Date ? d.datetime.toISOString() : d.datetime,
      d.month,
      d.day,
      d.hour,
      d.dryBulbTemperature.toFixed(2),
      d.relativeHumidity.toFixed(1),
      d.windSpeed.toFixed(2),
      d.mrt.toFixed(2),
      d.utci.toFixed(2),
      d.set.toFixed(2)
    ];
    csvRows.push(row.join(","));
  });

  const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);

  const locationName = (epwData.metadata && epwData.metadata.location && epwData.metadata.location.city)
    ? epwData.metadata.location.city
    : 'Location';

  link.setAttribute("download", `Thermal_Comfort_Data_${locationName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function renderOutdoorComfortCharts(epwData, chartRefs) {
  state.selectedBioclimaticStrategy = state.selectedBioclimaticStrategy || 'none';
  state.psychroSelection = state.psychroSelection || { type: 'strategy', id: 'comfort' };

  if (!state.outdoorComfort.dataComputed) {
    recomputeThermalData(epwData);
  }

  renderOutdoorSidebar('#outdoor .left-panel', epwData);
  renderOutdoorTopMenu('#outdoor .main-chart-area', epwData);
  updateMainChartArea(epwData);
}

export function renderOutdoorTopMenu(selector, epwData) {
  let container = d3.select(selector).select('.outdoor-top-menu');
  if (container.empty()) {
    container = d3.select(selector).insert('div', ':first-child').attr('class', 'outdoor-top-menu text-center mb-4 pb-3 border-bottom');
  }
  container.html('');

  const toggleGroup = container.append('div').attr('class', 'custom-segmented-control');
  ['MRT', 'UTCI', 'SET'].forEach(metric => {
    toggleGroup.append('input')
      .attr('type', 'radio')
      .attr('class', 'segmented-control-input')
      .attr('name', 'metric-toggle')
      .attr('id', `btn-top-${metric}`)
      .property('checked', state.outdoorComfort.activeMetric === metric)
      .on('change', () => {
        
        if (typeof window.showLocalProcessing === 'function') {
          window.showLocalProcessing('outdoor');
        }

        setTimeout(() => {
          state.outdoorComfort.activeMetric = metric;
          d3.select('#set-physio-params').style('display', metric === 'SET' ? 'block' : 'none');
          d3.select('#utci-heatmap-style-group').style('display', metric === 'UTCI' ? 'block' : 'none');

          updateMainChartArea(epwData);

          if (typeof window.hideLocalProcessing === 'function') {
            window.hideLocalProcessing('outdoor');
          }
        }, 50);
        
      });
      
    toggleGroup.append('label')
      .attr('class', 'segmented-control-label')
      .attr('for', `btn-top-${metric}`)
      .text(metric);
  });
}

export function renderOutdoorSidebar(panelSelector, epwData) {
  const panel = d3.select(panelSelector).html('');

  const utciStyleGroup = panel.append('div')
    .attr('id', 'utci-heatmap-style-group')
    .attr('class', 'chart-controls-group mb-4')
    .style('display', state.outdoorComfort.activeMetric === 'UTCI' ? 'block' : 'none');

  utciStyleGroup.append('h6').text('UTCI Heatmap Type');
  utciStyleGroup.append('p').attr('class', 'text-muted mb-2').style('font-size', '11px').text('Select the visualization style for the heatmap.');

  const utciStyleSelect = utciStyleGroup.append('select')
    .attr('class', 'form-select form-select-sm')
    .attr('id', 'utci-heatmap-style');

  utciStyleSelect.append('option')
    .attr('value', 'categorical')
    .property('selected', state.outdoorComfort.utciHeatmapStyle === 'categorical')
    .text('Thermal Stress Categories');

  utciStyleSelect.append('option')
    .attr('value', 'numeric')
    .property('selected', state.outdoorComfort.utciHeatmapStyle === 'numeric')
    .text('Continuous Numeric (°C)');

  utciStyleSelect.on('change', function () {
    if (typeof window.showLocalProcessing === 'function') window.showLocalProcessing('outdoor');
    setTimeout(() => {
      state.outdoorComfort.utciHeatmapStyle = d3.select(this).property('value');
      updateMainChartArea(epwData);
      if (typeof window.hideLocalProcessing === 'function') window.hideLocalProcessing('outdoor');
    }, 50);
  });

  const mrtControls = panel.append('div').attr('class', 'chart-controls-group');
  mrtControls.append('h6').text('Radiant Environment & Human Geometry');

  const postureItem = mrtControls.append('div').attr('class', 'control-item');
  postureItem.append('label').text('Posture (Influences fp Factor)');
  const postureSelect = postureItem.append('select').attr('class', 'form-select form-select-sm').attr('id', 'hp-posture');
  postureSelect.append('option').attr('value', 'standing').property('selected', state.humanParams.posture === 'standing').text('Standing');
  postureSelect.append('option').attr('value', 'seated').property('selected', state.humanParams.posture === 'seated').text('Seated');

  const orientationItem = mrtControls.append('div').attr('class', 'control-item mt-2');
  orientationItem.append('label').text('Facing Direction (Influences fp Factor)');
  const orientationSelect = orientationItem.append('select').attr('class', 'form-select form-select-sm').attr('id', 'hp-orientation-mode');
  orientationSelect.append('option').attr('value', 'unknown').property('selected', state.humanParams.facingAzimuth === null).text('Unknown (SHARP-averaged, default)');
  orientationSelect.append('option').attr('value', 'known').property('selected', state.humanParams.facingAzimuth !== null).text('Known orientation');

  const orientationDegItem = orientationItem.append('div').attr('class', 'mt-2')
    .style('display', state.humanParams.facingAzimuth !== null ? 'block' : 'none');
  orientationDegItem.append('input')
    .attr('type', 'number').attr('class', 'form-control form-control-sm').attr('id', 'hp-facing-azimuth')
    .attr('step', '1').attr('min', '0').attr('max', '359')
    .property('value', state.humanParams.facingAzimuth !== null ? state.humanParams.facingAzimuth : 180);
  orientationDegItem.append('p').attr('class', 'text-muted mt-1 mb-0').style('font-size', '10px')
    .text('Compass bearing the pedestrian (or space) faces: 0 = North, 90 = East, 180 = South, 270 = West.');

  orientationSelect.on('change', function () {
    orientationDegItem.style('display', this.value === 'known' ? 'block' : 'none');
  });

  const groundControls = panel.append('div').attr('class', 'chart-controls-group mt-3');
  groundControls.append('h6').text('Ground Surface Material');
  groundControls.append('p').attr('class', 'text-muted mb-2').style('font-size', '11px').text('Determines the ground surface (sol-air) temperature used in the MRT longwave term, and the reflectance used in the shortwave reflected-radiation term.');

  const groundPresetItem = groundControls.append('div').attr('class', 'control-item');
  groundPresetItem.append('label').text('Surface Preset');
  const groundSelect = groundPresetItem.append('select').attr('class', 'form-select form-select-sm').attr('id', 'ground-preset');
  groundSelect.append('option').attr('value', 'custom').text('-- Custom / Manual Entry --');

  const groundGroups = {};
  Object.entries(materialPresets).forEach(([key, val]) => {
    if (val.group !== 'Paving & Hardscape') return;
    if (!groundGroups[val.group]) groundGroups[val.group] = [];
    groundGroups[val.group].push({ key, ...val });
  });
  Object.keys(groundGroups).forEach(gName => {
    const optgroup = groundSelect.append('optgroup').attr('label', gName);
    groundGroups[gName].forEach(m => {
      optgroup.append('option').attr('value', m.key).property('selected', state.urbanContext.groundMaterial === m.key).text(m.name);
    });
  });

  const groundAlphaItem = groundControls.append('div').attr('class', 'control-item mt-2');
  groundAlphaItem.append('label').text('Solar Absorptance (α)');
  const groundAlphaInput = groundAlphaItem.append('input').attr('type', 'number').attr('class', 'form-control form-control-sm').attr('id', 'ground-alpha').attr('step', '0.05').attr('min', '0').attr('max', '1').property('value', state.urbanContext.groundAlpha);

  const groundEpsItem = groundControls.append('div').attr('class', 'control-item mt-2');
  groundEpsItem.append('label').text('Thermal Emissivity (ε)');
  const groundEpsInput = groundEpsItem.append('input').attr('type', 'number').attr('class', 'form-control form-control-sm').attr('id', 'ground-eps').attr('step', '0.05').attr('min', '0').attr('max', '1').property('value', state.urbanContext.groundEps);

  const groundReflectanceNote = groundControls.append('p').attr('class', 'text-muted mt-1 mb-0').style('font-size', '10px');
  const updateReflectanceNote = () => {
    const a = parseFloat(groundAlphaInput.property('value'));
    const refl = isNaN(a) ? state.humanParams.groundReflectance : (1 - a);
    groundReflectanceNote.text(`Reflectance used for reflected shortwave radiation: ${refl.toFixed(2)} (= 1 - α).`);
  };
  updateReflectanceNote();

  const syncGroundCustom = () => { groundSelect.property('value', 'custom'); updateReflectanceNote(); };
  groundAlphaInput.on('input', syncGroundCustom);
  groundEpsInput.on('input', syncGroundCustom);

  groundSelect.on('change', function () {
    if (this.value === 'custom') { updateReflectanceNote(); return; }
    const p = materialPresets[this.value];
    groundAlphaInput.property('value', p.alpha);
    groundEpsInput.property('value', p.eps);
    updateReflectanceNote();
  });

  const physioControls = panel.append('div')
    .attr('class', 'chart-controls-group mt-3')
    .attr('id', 'set-physio-params')
    .style('display', state.outdoorComfort.activeMetric === 'SET' ? 'block' : 'none');

  physioControls.append('h6').text('Physiological Parameters (SET)');
  physioControls.append('p').attr('class', 'text-muted mb-2').style('font-size', '11px').text('Personal factors for Two-Node model.');

  const metItem = physioControls.append('div').attr('class', 'control-item');
  metItem.append('label').text('Metabolic Rate (met)');
  metItem.append('input').attr('type', 'number').attr('class', 'form-control form-control-sm').attr('id', 'hp-met').attr('step', '0.1').attr('min', '0.8').attr('max', '4.0').property('value', state.humanParams.metabolicRate);

  const cloItem = physioControls.append('div').attr('class', 'control-item mt-2');
  cloItem.append('label').text('Clothing Insulation (clo)');
  cloItem.append('input').attr('type', 'number').attr('class', 'form-control form-control-sm').attr('id', 'hp-clo').attr('step', '0.1').attr('min', '0').attr('max', '2.5').property('value', state.humanParams.clothingInsulation);

  const urbanControls = panel.append('div').attr('class', 'chart-controls-group mt-4');
  urbanControls.append('h6').text('Urban Context & Shading');
  urbanControls.append('p').attr('class', 'text-muted mb-2').style('font-size', '11px').text('Simulates street canyons and local obstructions on radiation values.');

  const switchDiv = urbanControls.append('div').attr('class', 'form-check form-switch my-2');
  const urbanSwitch = switchDiv.append('input')
    .attr('class', 'form-check-input')
    .attr('type', 'checkbox')
    .attr('id', 'urban-toggle')
    .property('checked', state.urbanContext.enabled);

  switchDiv.append('label')
    .attr('class', 'form-check-label')
    .attr('for', 'urban-toggle')
    .text('Enable Urban Morphology Shading');

  const urbanOptionsContainer = urbanControls.append('div')
    .attr('id', 'urban-options-container')
    .style('display', state.urbanContext.enabled ? 'block' : 'none');

  const hwItem = urbanOptionsContainer.append('div').attr('class', 'control-item');
  hwItem.append('label').text('Canyon Aspect Ratio (H/W)');
  const hwInput = hwItem.append('input')
    .attr('type', 'number')
    .attr('class', 'form-control form-control-sm')
    .attr('id', 'urban-hw')
    .attr('step', '0.1')
    .attr('min', '0')
    .property('value', state.urbanContext.aspectRatio);
  hwItem.append('p').attr('class', 'text-muted mt-1 mb-0').style('font-size', '10px').text('Building height / street width. Updates SVF.');

  const svfItem = urbanOptionsContainer.append('div').attr('class', 'control-item mt-2');
  svfItem.append('label').text('Sky View Factor (SVF)');
  const svfInput = svfItem.append('input')
    .attr('type', 'number')
    .attr('class', 'form-control form-control-sm')
    .attr('id', 'urban-svf')
    .attr('step', '0.05')
    .attr('min', '0')
    .attr('max', '1')
    .property('value', state.urbanContext.svf);
  svfItem.append('p').attr('class', 'text-muted mt-1 mb-0').style('font-size', '10px').text('Visible sky fraction (0-1). Scales diffuse sky radiation.');

  const shadingItem = urbanOptionsContainer.append('div').attr('class', 'control-item mt-2');
  shadingItem.append('label').text('Direct Sun Shading Factor');
  const shadingInput = shadingItem.append('input')
    .attr('type', 'number')
    .attr('class', 'form-control form-control-sm')
    .attr('id', 'urban-shading')
    .attr('step', '0.05')
    .attr('min', '0')
    .attr('max', '1')
    .property('value', state.urbanContext.shadingFactor);
  shadingItem.append('p').attr('class', 'text-muted mt-1 mb-0').style('font-size', '10px').text('Fraction of direct sunlight blocked by obstacles (0-1).');

  const mrtBtnRow = urbanControls.append('div').attr('class', 'row g-2 mt-3');
  mrtBtnRow.append('div').attr('class', 'col-6').append('button').attr('id', 'btn-default-mrt').attr('class', 'btn btn-secondary btn-sm w-100').text('Default');
  mrtBtnRow.append('div').attr('class', 'col-6').append('button').attr('id', 'btn-recompute-mrt').attr('class', 'btn btn-primary btn-sm w-100').text('Recalculate');

  const filterControlsContainer = panel.append('div')
    .attr('id', 'outdoor-date-filter-container')
    .attr('class', 'mt-4');

  renderUnifiedFilterControls('#outdoor-date-filter-container', state.outdoorComfort.filters, () => {
    if (typeof window.showLocalProcessing === 'function') window.showLocalProcessing('outdoor');
    setTimeout(() => {
      updateMainChartArea(epwData);
      if (typeof window.hideLocalProcessing === 'function') window.hideLocalProcessing('outdoor');
    }, 50);
  });

  const labelToggles = panel.append('div').attr('class', 'chart-controls-group mt-2 pt-2 border-top');
  labelToggles.append('label').style('font-size', '11px').style('font-weight', 'bold').text('Data Labels:');

  const hoursToggleItem = labelToggles.append('div').attr('class', 'form-check form-switch mt-1');
  hoursToggleItem.html(`<input class="form-check-input" type="checkbox" id="outdoor-show-hours" ${state.outdoorComfort.filters.showHours ? 'checked' : ''}><label class="form-check-label" style="font-size: 11px" for="outdoor-show-hours">Show Hours</label>`);

  const percentToggleItem = labelToggles.append('div').attr('class', 'form-check form-switch');
  percentToggleItem.html(`<input class="form-check-input" type="checkbox" id="outdoor-show-percent" ${state.outdoorComfort.filters.showPercent ? 'checked' : ''}><label class="form-check-label" style="font-size: 11px" for="outdoor-show-percent">Show Percentage</label>`);

  d3.select('#outdoor-show-hours').on('change', function () {
    if (typeof window.showLocalProcessing === 'function') window.showLocalProcessing('outdoor');
    setTimeout(() => {
      state.outdoorComfort.filters.showHours = this.checked;
      updateMainChartArea(epwData);
      if (typeof window.hideLocalProcessing === 'function') window.hideLocalProcessing('outdoor');
    }, 50);
  });

  d3.select('#outdoor-show-percent').on('change', function () {
    if (typeof window.showLocalProcessing === 'function') window.showLocalProcessing('outdoor');
    setTimeout(() => {
      state.outdoorComfort.filters.showPercent = this.checked;
      updateMainChartArea(epwData);
      if (typeof window.hideLocalProcessing === 'function') window.hideLocalProcessing('outdoor');
    }, 50);
  });

  const exportControls = panel.append('div').attr('class', 'chart-controls-group mt-4');
  exportControls.append('h6').text('Bulk Data Export');
  exportControls.append('p').attr('class', 'text-muted mb-2').style('font-size', '11px').text('Exports full annual 8760-hour calculated indices to a standardized CSV dataset.');
  exportControls.append('button')
    .attr('id', 'btn-export-csv')
    .attr('class', 'btn btn-success btn-sm w-100 mt-1')
    .text('Export Thermal Data (CSV)')
    .on('click', () => {
      exportThermalDataToCSV(epwData);
    });

  const ackGroup = panel.append('div').attr('class', 'chart-controls-group mt-4');
  const headerRow = ackGroup.append('div').attr('class', 'd-flex justify-content-between align-items-baseline mb-2').style('cursor', 'pointer').attr('data-bs-toggle', 'collapse').attr('data-bs-target', '#outdoor-scientific-basis');
  headerRow.append('h6').attr('class', 'mb-0').text('Scientific Basis & Assumptions');
  headerRow.append('span').attr('class', 'text-primary').style('font-size', '10px').html('Read more ▼');

  const collapseContainer = ackGroup.append('div').attr('id', 'outdoor-scientific-basis').attr('class', 'collapse');
  const infoNote = collapseContainer.append('ul').attr('class', 'info-note mb-0').style('font-size', '11px').style('padding-left', '15px');
  infoNote.html(`
        <li class="mb-2"><strong>MRT (Mean Radiant Temperature):</strong> Shortwave component follows the <em>ASHRAE 55 SolarCal</em> (Appendix C) structure exactly — projected area factor (f_p), fraction of body surface exposed to the radiant environment (f_eff = 0.725 standing / 0.696 seated), and the standard's fixed linearized radiative heat transfer coefficient (h_r = 6 W/m²K) — validated to within 0.005°C against pythermalcomfort's solar_gain() reference implementation, averaged over solar horizontal angle (SHARP) since pedestrian facing direction is unknown from EPW data alone. Diffuse radiation uses the EPW file's own measured value rather than SolarCal's simplified 0.2×direct estimate. Longwave component blends sky and ground radiant temperature via Sky View Factor (SVF): sky temperature is derived from the EPW file's horizontal infrared radiation (Stefan-Boltzmann law), with a Clark and Allen (1978) dew-point-based fallback when unavailable; ground surface temperature is estimated with a sol-air temperature model (ASHRAE Fundamentals, McAdams 1954 convection coefficient) driven by the user-selected Ground Surface Material, rather than assumed equal to air temperature. This is the same physical model used for building surface temperatures in the Material Analysis module, applied here to a horizontal, unobstructed ground patch.</li>
        <li class="mb-2"><strong>Urban Morphological Modifications:</strong> Activating the urban context alters radiation fluxes. Sky View Factor (SVF) downscales diffuse atmospheric radiation and sky-facing ground reflection. SVF and Street Canyon Aspect Ratio (H/W) are tightly coupled via the infinite canyon analytical approximation. The Direct Sun Shading Factor linearly scales down direct solar normal radiation.</li>
        <li class="mb-2"><strong>UTCI Thermal Indices:</strong> UTCI calculation utilizes an advanced 10th-order sparse orthogonal regression model with Legendre polynomials (comprising 209 coefficients) developed by Roman et al. (2025). This method replaces the legacy 6th-order WMO polynomial to significantly improve predictive accuracy and prevent numerical divergence during climatic extremes. Based on a reference walking metabolic rate (135 W/m²) and adaptive clothing. Input parameters exceeding the model's validity limits (e.g., wind speed below 0.5 m/s) are automatically clamped to the nearest threshold to ensure numerical stability. </li>
        <li class="mb-2"><strong>SET (Standard Effective Temperature):</strong> Derived using the <em>ASHRAE 55-2023 revision</em> of the Gagge Two-Node Model. The algorithm simulates human thermoregulation (sweating, shivering, adaptive skin blood flow, and an iteratively solved radiative heat transfer coefficient) over a 60-minute interval with 1-minute time steps. The final physiological states (skin temperature and wettedness) are projected via secant-method root-finding onto a standard reference environment (v = 0.1 m/s, RH = 50%) to yield the precise SET value. Validated to within 0.1°C RMSE against the 22-row ASHRAE 55-2023 Table D-1 lookup table (Normative Appendix D). Note: per the 2023 revision, the model omits the "self-generated convection" term still present in the original 1986 Gagge formulation (and in tools such as pythermalcomfort/CBE Thermal Comfort Tool); this causes SET values here to diverge from those tools by a few degrees at high metabolic rates (met > ~1.5), a documented and deliberate alignment with the current standard rather than a discrepancy.</li>
        <li class="mb-2"><strong>Wind Speed Modification:</strong> Meteorological wind speed (v_10) is applied unchanged for UTCI calculations natively expecting reference height. For SET heat exchange algorithms, the speed is approximated for bio-meteorological height (1.1m) using the 0.67 reduction factor representing standard urban roughness.</li>
    `);

  setTimeout(() => {
    const collapseEl = document.getElementById('outdoor-scientific-basis');
    if (collapseEl) {
      const toggleText = d3.select('#outdoor-scientific-basis').node().parentNode.querySelector('span');
      collapseEl.addEventListener('show.bs.collapse', () => d3.select(toggleText).html('Show less ▲'));
      collapseEl.addEventListener('hide.bs.collapse', () => d3.select(toggleText).html('Read more ▼'));
    }
  }, 0);

  urbanSwitch.on('change', function () {
    const isChecked = d3.select(this).property('checked');
    state.urbanContext.enabled = isChecked;
    urbanOptionsContainer.style('display', isChecked ? 'block' : 'none');
  });

  hwInput.on('input', function () {
    const val = parseFloat(d3.select(this).property('value')) || 0;
    state.urbanContext.aspectRatio = val;
    const calculatedSvf = 1 / Math.sqrt(1 + val * val);
    state.urbanContext.svf = Math.round(calculatedSvf * 100) / 100;
    svfInput.property('value', state.urbanContext.svf);
  });

  svfInput.on('input', function () {
    const val = parseFloat(d3.select(this).property('value')) || 1.0;
    const clampedSvf = Math.min(1, Math.max(0.01, val));
    state.urbanContext.svf = clampedSvf;
    if (clampedSvf < 1) {
      const calculatedHw = Math.sqrt(Math.pow(1 / clampedSvf, 2) - 1);
      state.urbanContext.aspectRatio = Math.round(calculatedHw * 100) / 100;
      hwInput.property('value', state.urbanContext.aspectRatio);
    } else {
      state.urbanContext.aspectRatio = 0.0;
      hwInput.property('value', 0);
    }
  });

  shadingInput.on('input', function () {
    state.urbanContext.shadingFactor = Math.min(1, Math.max(0, parseFloat(d3.select(this).property('value')) || 0));
  });

  d3.select('#btn-recompute-mrt').on('click', () => {
    if (typeof window.showLocalProcessing === 'function') window.showLocalProcessing('outdoor');
    
    setTimeout(() => {
      state.humanParams.posture = d3.select('#hp-posture').property('value');
      state.humanParams.metabolicRate = parseFloat(d3.select('#hp-met').property('value')) || 1.5;
      state.humanParams.clothingInsulation = parseFloat(d3.select('#hp-clo').property('value')) || 0.6;

      if (d3.select('#hp-orientation-mode').property('value') === 'known') {
        let az = parseFloat(d3.select('#hp-facing-azimuth').property('value'));
        if (isNaN(az)) az = 180;
        az = ((az % 360) + 360) % 360;
        state.humanParams.facingAzimuth = az;
      } else {
        state.humanParams.facingAzimuth = null;
      }

      state.urbanContext.groundMaterial = d3.select('#ground-preset').property('value');
      state.urbanContext.groundAlpha = parseFloat(d3.select('#ground-alpha').property('value'));
      if (isNaN(state.urbanContext.groundAlpha)) state.urbanContext.groundAlpha = 0.35;
      state.urbanContext.groundEps = parseFloat(d3.select('#ground-eps').property('value'));
      if (isNaN(state.urbanContext.groundEps)) state.urbanContext.groundEps = 0.90;
      // Single source of truth: the shortwave reflected-radiation term and the
      // longwave sol-air ground temperature term both derive from the same
      // ground surface material, so groundReflectance is never set independently.
      state.humanParams.groundReflectance = 1 - state.urbanContext.groundAlpha;

      state.urbanContext.enabled = d3.select('#urban-toggle').property('checked');
      state.urbanContext.aspectRatio = parseFloat(d3.select('#urban-hw').property('value')) || 0;
      state.urbanContext.svf = parseFloat(d3.select('#urban-svf').property('value')) || 1.0;
      state.urbanContext.shadingFactor = parseFloat(d3.select('#urban-shading').property('value')) || 0;
      
      recomputeThermalData(epwData);
      updateMainChartArea(epwData);

      if (typeof window.hideLocalProcessing === 'function') window.hideLocalProcessing('outdoor');
    }, 50);
  });

  d3.select('#btn-default-mrt').on('click', () => {
    if (typeof window.showLocalProcessing === 'function') window.showLocalProcessing('outdoor');
    
    setTimeout(() => {
      state.humanParams = { posture: 'standing', facingAzimuth: null, groundReflectance: 0.65, metabolicRate: 1.5, clothingInsulation: 0.6 };
      state.urbanContext = { enabled: false, aspectRatio: 0.0, svf: 1.0, shadingFactor: 0.0, groundMaterial: 'paving_concrete_aged', groundAlpha: 0.35, groundEps: 0.90 };

      d3.select('#hp-posture').property('value', 'standing');
      d3.select('#hp-orientation-mode').property('value', 'unknown');
      d3.select('#hp-facing-azimuth').property('value', 180);
      orientationDegItem.style('display', 'none');
      d3.select('#hp-met').property('value', 1.5);
      d3.select('#hp-clo').property('value', 0.6);

      d3.select('#ground-preset').property('value', 'paving_concrete_aged');
      d3.select('#ground-alpha').property('value', 0.35);
      d3.select('#ground-eps').property('value', 0.90);
      updateReflectanceNote();

      d3.select('#urban-toggle').property('checked', false);
      d3.select('#urban-hw').property('value', 0);
      d3.select('#urban-svf').property('value', 1.0);
      d3.select('#urban-shading').property('value', 0);
      urbanOptionsContainer.style('display', 'none');
      
      recomputeThermalData(epwData);
      updateMainChartArea(epwData);

      if (typeof window.hideLocalProcessing === 'function') window.hideLocalProcessing('outdoor');
    }, 50);
  });

  d3.select('#filter-time').on('change', function () {
    const val = d3.select(this).property('value');
    d3.select('#custom-time-row').style('display', val === 'custom' ? 'flex' : 'none');
  });

  d3.select('#btn-apply-filters').on('click', () => {
    if (typeof window.showLocalProcessing === 'function') window.showLocalProcessing('outdoor');

    setTimeout(() => {
      state.outdoorComfort.filters.timePreset = d3.select('#filter-time').property('value');
      state.outdoorComfort.filters.customStart = parseInt(d3.select('#filter-start-hr').property('value')) || 8;
      state.outdoorComfort.filters.customEnd = parseInt(d3.select('#filter-end-hr').property('value')) || 20;
      state.outdoorComfort.filters.monthPreset = d3.select('#filter-month').property('value');
      
      updateMainChartArea(epwData);

      if (typeof window.hideLocalProcessing === 'function') window.hideLocalProcessing('outdoor');
    }, 50);
  });
}

export function updateMainChartArea(epwData) {
  const mainArea = d3.select('#outdoor-charts-wrapper');
  mainArea.html('');

  const filteredData = filterDataForFrequency(epwData.data, state.outdoorComfort.filters, epwData.metadata.location);
  const location = epwData.metadata.location || epwData.metadata;
  const suffix = buildChartTitleSuffix(state.outdoorComfort.filters, location.latitude);
  const formatLocation = formatSimpleLocation(location.city, location.country, 'primary');

  if (state.outdoorComfort.activeMetric === 'UTCI') {
    if (state.outdoorComfort.utciHeatmapStyle === 'numeric') {
      mainArea.append('div').attr('id', 'outdoor-utci-numeric-heatmap').attr('class', 'chart-container mb-4');
      renderContinuousHeatmap('#outdoor-utci-numeric-heatmap', epwData, 'utci', 'Universal Thermal Climate Index (UTCI) (°C)', null, true, { midpoint: EPW_UTCI_NUMERIC_ANCHOR, interpolator: EPW_UTCI_NUMERIC_INTERPOLATOR });      addExportButton('#outdoor-utci-numeric-heatmap', 'utci-numeric-heatmap', formatLocation);
      addInfoButton('#outdoor-utci-numeric-heatmap', 'utciHeatmap');
    } else {
      mainArea.append('div').attr('id', 'outdoor-heatmap-chart').attr('class', 'chart-container mb-4');
      renderThermalHeatmap('#outdoor-heatmap-chart', epwData, 'utci', utciCategories, 'Universal Thermal Climate Index (UTCI)');
      addExportButton('#outdoor-heatmap-chart', 'universal-thermal-climate-index-utci', formatLocation);
      addInfoButton('#outdoor-heatmap-chart', 'utciHeatmap');
    }

    mainArea.append('div').attr('id', 'outdoor-bar-chart').attr('class', 'chart-container mb-3');
    mainArea.append('div').attr('id', 'outdoor-utci-boxplot').attr('class', 'chart-container');

    renderComfortFrequencyChart('#outdoor-bar-chart', filteredData, 'utci', utciCategories, 'UTCI Category Frequency' + suffix);
    renderComfortBoxplot('#outdoor-utci-boxplot', epwData, 'utci', 'Monthly UTCI Distribution', '#6baed6', '#3182bd');

    addExportButton('#outdoor-bar-chart', 'utci-category-frequency', formatLocation);
    addInfoButton('#outdoor-bar-chart', 'utciFrequency');
    addExportButton('#outdoor-utci-boxplot', 'utci-monthly-distribution', formatLocation);
    addInfoButton('#outdoor-utci-boxplot', 'utciDistribution');

  } else if (state.outdoorComfort.activeMetric === 'SET') {
    mainArea.append('div').attr('id', 'outdoor-set-numeric-heatmap').attr('class', 'chart-container mb-4');
    mainArea.append('div').attr('id', 'outdoor-set-boxplot').attr('class', 'chart-container');

    renderContinuousHeatmap('#outdoor-set-numeric-heatmap', epwData, 'set', 'Standard Effective Temperature (SET)', null, true, { midpoint: EPW_SET_ANCHOR, interpolator: EPW_SET_INTERPOLATOR });    renderComfortBoxplot('#outdoor-set-boxplot', epwData, 'set', 'Monthly SET Distribution', '#bcbddc', '#756bb1');

    addExportButton('#outdoor-set-numeric-heatmap', 'standard-effective-temperature-set', formatLocation);
    addInfoButton('#outdoor-set-numeric-heatmap', 'setHeatmap');
    addExportButton('#outdoor-set-boxplot', 'set-monthly-distribution', formatLocation);
    addInfoButton('#outdoor-set-boxplot', 'setDistribution');

  } else if (state.outdoorComfort.activeMetric === 'MRT') {
    mainArea.append('div').attr('id', 'outdoor-heatmap-chart').attr('class', 'chart-container mb-4');
    mainArea.append('div').attr('id', 'outdoor-mrt-boxplot').attr('class', 'chart-container');

    renderNumericHeatmap('#outdoor-heatmap-chart', epwData, 'mrt', 'Mean Radiant Temperature (MRT)');
    renderComfortBoxplot('#outdoor-mrt-boxplot', epwData, 'mrt', 'Monthly MRT Distribution', '#ec7063', '#e74c3c');

    addExportButton('#outdoor-heatmap-chart', 'mean-radiant-temperature-mrt', formatLocation);
    addInfoButton('#outdoor-heatmap-chart', 'mrtHeatmap');
    addExportButton('#outdoor-mrt-boxplot', 'mrt-monthly-distribution', formatLocation);
    addInfoButton('#outdoor-mrt-boxplot', 'mrtDistribution');
  }
}

export function renderThermalHeatmap(containerId, epwData, dataKey, categories, title) {
  const container = d3.select(containerId).html('');
  container.append('h5').attr('class', 'chart-title-main').text(title);

  const margin = { top: 20, right: 40, bottom: 90, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([1, 365]).range([0, width]);
  const y = d3.scaleLinear().domain([0, 24]).range([height, 0]);

  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthTicks = [];
  let cumulative = 0;
  for (let i = 0; i < 12; i++) {
    monthTicks.push(cumulative + (daysInMonth[i] / 2));
    cumulative += daysInMonth[i];
  }

  const cellWidth = width / 365;
  const cellHeight = height / 24;
  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");

  svg.selectAll('.heatmap-cell').data(epwData.data).enter().append('rect')
    .attr('class', 'heatmap-cell')
    .attr('x', (d, i) => x(Math.floor(i / 24) + 1))
    .attr('y', (d, i) => y((i % 24) + 1))
    .attr('width', cellWidth + 0.3)
    .attr('height', cellHeight + 0.3)
    .style('fill', d => getCategoryInfo(d[dataKey], categories).color)
    .on('mouseover', function (event, d) {
      const val = d[dataKey];
      const cat = getCategoryInfo(val, categories);
      tooltip.style('opacity', 1).html(`<strong>${monthNames[d.month - 1]} ${d.day}, ${d.hour}:00</strong><br>Value: ${val.toFixed(1)} °C<br>Stress: ${cat.label}`);
    })
    .on('mousemove', (event) => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
    .on('mouseout', () => tooltip.style('opacity', 0));

  svg.append('g').attr('class', 'axis x-axis').attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).tickValues(monthTicks).tickFormat((d, i) => monthNames[i]));

  svg.append('g').attr('class', 'axis y-axis')
    .call(d3.axisLeft(y).tickValues([0, 6, 12, 18, 24]).tickFormat(d => d));

  svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 22).attr("x", -height / 2).style("text-anchor", "middle").text("Hour").style("font-family", "sans-serif").style("font-size", "12px");
  svg.append("text").attr("class", "x-axis-label axis-title").attr("x", width / 2).attr("y", height + 35).style("text-anchor", "middle").text("Month").style("font-family", "sans-serif").style("font-size", "12px");

  const legendGroup = svg.append("g").attr("transform", `translate(0, ${height + 55})`);
  const numCols = 5; const colWidth = width / numCols; const rowHeight = 20;
  [...categories].reverse().forEach((cat, idx) => {
    const row = Math.floor(idx / numCols); const col = idx % numCols;
    const item = legendGroup.append("g").attr("transform", `translate(${col * colWidth}, ${row * rowHeight})`);
    item.append("rect").attr("width", 14).attr("height", 14).attr("rx", 2).style("fill", cat.color);
    item.append("text").attr("x", 20).attr("y", 11).style("font-size", "10px").text(cat.label);
  });
}

export function renderComfortFrequencyChart(containerId, filteredData, dataKey, categories, title) {
  const container = d3.select(containerId).html('');
  container.append('h5').attr('class', 'chart-title-main').text(title);

  if (filteredData.length === 0) {
    container.append('p').attr('class', 'text-muted text-center mt-5').text('No data available for the selected filters.');
    return;
  }

  const margin = { top: 20, right: 20, bottom: 85, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 300 - margin.top - margin.bottom;

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");

  const catCounts = {};
  categories.forEach(cat => catCounts[cat.label] = 0);
  filteredData.forEach(d => {
    const cat = getCategoryInfo(d[dataKey], categories).label;
    if (catCounts[cat] !== undefined) catCounts[cat]++;
  });

  const totalHours = filteredData.length;
  const chartData = categories.map(cat => ({
    category: cat.label,
    count: catCounts[cat.label],
    percentage: ((catCounts[cat.label] / totalHours) * 100).toFixed(1),
    color: cat.color,
    icon: cat.icon
  }));

  const x = d3.scaleBand().domain(chartData.map(d => d.category)).range([0, width]).padding(0.2);
  const y = d3.scaleLinear().domain([0, d3.max(chartData, d => d.count)]).nice().range([height, 0]);

  const xAxis = svg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0, ${height})`)
    .call(d3.axisBottom(x).tickSize(0));

  const emojiSize = 24;

  xAxis.selectAll(".tick").each(function (d) {
    const tick = d3.select(this);
    tick.select("text").remove();

    const words = d.split(' ');
    const textNode = tick.append("text").attr("y", 44).attr("fill", "#333").style("font-size", "9px").style("text-anchor", "middle");
    words.forEach((word, idx) => {
      textNode.append("tspan").attr("x", 0).attr("dy", idx === 0 ? 0 : "1.1em").text(word);
    });
  });

  Promise.all(chartData.map(d => getCachedIconBase64(d.icon))).then(base64Images => {
    xAxis.selectAll(".tick").each(function (d, i) {
      const tick = d3.select(this);
      const dataMatch = chartData[i];

      if (dataMatch && base64Images[i]) {
        tick.insert("image", "text")
          .attr("xlink:href", base64Images[i])
          .attr("href", base64Images[i])
          .attr("x", -emojiSize / 2)
          .attr("y", 8)
          .attr("width", emojiSize)
          .attr("height", emojiSize)
          .style("image-rendering", "crisp-edges")
          .style("image-rendering", "-webkit-optimize-contrast");
      }
    });
  });

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

  const showHours = state.outdoorComfort.filters.showHours;
  const showPercent = state.outdoorComfort.filters.showPercent;

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
}

export function renderNumericHeatmap(containerId, epwData, dataKey, title) {
  const container = d3.select(containerId).html('');
  container.append('h5').attr('class', 'chart-title-main').text(title);

  const margin = { top: 20, right: 80, bottom: 60, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const values = epwData.data.map(d => d[dataKey]);
  const dataMin = d3.min(values);
  const dataMax = d3.max(values);

  const colorScale = d3.scaleSequential(EPW_MRT_INTERPOLATOR).domain([dataMin, dataMax]);

  const x = d3.scaleLinear().domain([1, 365]).range([0, width]);
  const y = d3.scaleLinear().domain([0, 24]).range([height, 0]);

  const cellWidth = width / 365;
  const cellHeight = height / 24;
  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  svg.selectAll('.heatmap-cell').data(epwData.data).enter().append('rect').attr('class', 'heatmap-cell')
    .attr('x', (d, i) => x(Math.floor(i / 24) + 1))
    .attr('y', (d, i) => y((i % 24) + 1))
    .attr('width', cellWidth + 0.3)
    .attr('height', cellHeight + 0.3)
    .style('fill', d => colorScale(d[dataKey]))
    .on('mouseover', function (event, d) {
      tooltip.style('opacity', 1).html(`<strong>${monthNames[d.month - 1]} ${d.day}, ${d.hour}:00</strong><br>Value: ${d[dataKey].toFixed(1)} °C`);
    })
    .on('mousemove', (event) => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
    .on('mouseout', () => tooltip.style('opacity', 0));

  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const monthTicks = []; let cumulative = 0;
  for (let i = 0; i < 12; i++) { monthTicks.push(cumulative + (daysInMonth[i] / 2)); cumulative += daysInMonth[i]; }

  svg.append('g').attr('class', 'axis x-axis').attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).tickValues(monthTicks).tickFormat((d, i) => monthNames[i]));
  svg.append('g').attr('class', 'axis y-axis').call(d3.axisLeft(y).tickValues([0, 6, 12, 18, 24]));

  svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 22).attr("x", -height / 2).style("text-anchor", "middle").text("Hour").style("font-size", "12px");
  svg.append("text").attr("class", "x-axis-label axis-title").attr("x", width / 2).attr("y", height + 40).style("text-anchor", "middle").text("Month").style("font-size", "12px");

  const legendWidth = 14;
  const legendGroup = svg.append("g").attr("transform", `translate(${width + 20}, 0)`);

  legendGroup.append("text").attr("x", legendWidth / 2).attr("y", -8).attr("class", "axis-title").style("text-anchor", "middle").text("°C").style("font-family", "sans-serif").style("font-size", "11px");

  const defs = svg.append("defs");
  const gradientId = `mrt-gradient-${Date.now()}`;
  const linearGradient = defs.append("linearGradient").attr("id", gradientId).attr("x1", "0%").attr("y1", "100%").attr("x2", "0%").attr("y2", "0%");

  for (let i = 0; i <= 10; i++) {
    let t = i / 10;
    let valColor = dataMin + t * (dataMax - dataMin);
    linearGradient.append("stop").attr("offset", (t * 100) + "%").attr("stop-color", colorScale(valColor));
  }

  legendGroup.append("rect").attr("width", legendWidth).attr("height", height).style("fill", `url(#${gradientId})`).attr("stroke", "#ccc").attr("stroke-width", 0.5);
  const legendScale = d3.scaleLinear().domain([dataMin, dataMax]).range([height, 0]);
  legendGroup.append("g").attr("transform", `translate(${legendWidth}, 0)`).call(d3.axisRight(legendScale).ticks(5).tickFormat(d3.format(".1f")));
}

export function renderContinuousHeatmap(selector, epwData, dataKey, title, interpolatorName, reversePalette, divergingConfig) {
  const container = d3.select(selector).html('');
  const hourlyData = epwData.data;

  if (container.node().getBoundingClientRect().width === 0) return;

  container.append('h5').text(title).attr('class', 'chart-title-main');
  const margin = { top: 20, right: 90, bottom: 60, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;
  const svg = container.append("svg").attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const legend = svg.append("g");
  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");

  const domain = d3.extent(hourlyData, d => d[dataKey]);
  let colorScale;

  if (divergingConfig) {
    const mid = Math.min(Math.max(divergingConfig.midpoint, domain[0] + 1e-6), domain[1] - 1e-6);
    const divDomain = reversePalette ? [domain[0], mid, domain[1]] : [domain[1], mid, domain[0]];
    colorScale = d3.scaleDiverging(divergingConfig.interpolator).domain(divDomain);
  } else {
    const finalDomain = reversePalette ? domain : [domain[1], domain[0]];
    colorScale = d3.scaleSequential(resolveColorInterpolator(interpolatorName)).domain(finalDomain);
  }

  const year = hourlyData[0].year;
  const x = d3.scaleLinear().range([0, width]);
  const y = d3.scaleLinear().domain([0, 24]).range([height, 0]);
  const daysInYear = d3.timeDays(new Date(year, 0, 1), new Date(year + 1, 0, 1)).length;
  x.domain([1, daysInYear + 1]);

  svg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).tickValues(d3.range(0, 12).map(m => d3.timeDay.count(new Date(year, 0, 1), new Date(year, m, 15)))).tickFormat(d => d3.timeFormat("%b")(d3.timeParse("%j")(d))));
  svg.append("g").attr("class", "axis y-axis").call(d3.axisLeft(y).tickValues([0, 6, 12, 18, 24]));
  svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 22).attr("x", -height / 2).style("text-anchor", "middle").text("Hour of Day").style("font-family", "sans-serif").style("font-size", "12px");
  svg.append("text").attr("class", "x-axis-label axis-title").attr("x", width / 2).attr("y", height + 40).style("text-anchor", "middle").text("Month").style("font-family", "sans-serif").style("font-size", "12px");

  const rectWidth = Math.max(0.1, width / daysInYear);
  svg.selectAll(".hour-rect").data(hourlyData).join("rect").attr("class", "hour-rect")
    .attr("x", d => x(+d3.timeFormat("%j")(d.datetime) + 0.6)).attr("y", d => y(d.hour))
    .attr("width", rectWidth).attr("height", height / 24)
    .style("fill", d => colorScale(d[dataKey]))
    .on("mouseover", (event, d) => tooltip.style("opacity", 1).html(`<strong>${d3.timeFormat('%b %d, %H:%M')(d.datetime)}</strong><br>${dataKey.toUpperCase()}: ${d[dataKey].toFixed(1)} °C`))
    .on("mousemove", (event) => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
    .on("mouseout", () => tooltip.style("opacity", 0));

  legend.html('').attr("transform", `translate(${width + 20}, 0)`);
  legend.append("text").attr("x", -7.5).attr("y", -8).attr("class", "axis-title").style("text-anchor", "middle").text("°C").style("font-family", "sans-serif").style("font-size", "11px");
  const legendScale = d3.scaleLinear().domain(domain).range([height, 0]);
  legend.append("g").call(d3.axisRight(legendScale).ticks(8).tickFormat(d => d.toFixed(0)));
  const gradientId = `temp-grad-${dataKey}`;
  const gradient = legend.append("defs").append("linearGradient").attr("id", gradientId).attr("x1", "0%").attr("y1", "100%").attr("x2", "0%").attr("y2", "0%");
  gradient.selectAll("stop")
    .data(d3.range(0, 1.01, 0.05))
    .join("stop")
    .attr("offset", d => `${d * 100}%`)
    .attr("stop-color", t => colorScale(legendScale.invert(height * (1 - t))));
  legend.append("rect").attr("x", -15).attr("y", 0).attr("width", 15).attr("height", height).style("fill", `url(#${gradientId})`);
}

export function renderComfortBoxplot(selector, epwData, dataKey, title, baseColor, hoverColor) {
  const container = d3.select(selector).html('');
  const hourlyData = epwData.data;

  if (container.node().getBoundingClientRect().width === 0) return;

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  container.append('h5').text(title).attr('class', 'chart-title-main');

  const margin = { top: 20, right: 20, bottom: 50, left: 60 };
  const legendHeight = 50;
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom + legendHeight}`)
    .style("overflow", "visible")
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  svg.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "#f8f9fa")
    .style("transition", "fill 0.3s ease-in-out")
    .on("mouseover", function () { d3.select(this).attr("fill", "#f7fafc"); })
    .on("mouseout", function () { d3.select(this).attr("fill", "#f8f9fa"); });

  const monthlyData = Array.from(d3.group(hourlyData, d => d.month), ([key, value]) => ({ key, value })).sort((a, b) => a.key - b.key);
  const allPlotData = [...monthlyData, { key: "Annual", value: hourlyData }];

  allPlotData.forEach(d => {
    const vals = d.value.map(h => h[dataKey]).sort(d3.ascending);
    const min = d3.min(vals), max = d3.max(vals);
    const q1 = d3.quantile(vals, 0.25), median = d3.quantile(vals, 0.5), q3 = d3.quantile(vals, 0.75);
    const iqr = q3 - q1;
    d.stats = { min, max, q1, median, q3, lower: Math.max(min, q1 - 1.5 * iqr), upper: Math.min(max, q3 + 1.5 * iqr) };
    d.mean = d3.mean(d.value, h => h[dataKey]);
  });

  const dataExtent = d3.extent(hourlyData, d => d[dataKey]);
  const safeExtent = (dataExtent[0] === undefined || isNaN(dataExtent[0])) ? [-40, 45] : dataExtent;

  const x = d3.scaleBand().domain([...monthlyData.map(d => d3.timeFormat("%b")(new Date(2000, d.key - 1))), "", "Annual"]).range([0, width]).paddingInner(0.6).paddingOuter(0.3);
  const y = d3.scaleLinear().domain(safeExtent).nice().range([height, 0]);

  svg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0, ${height})`).call(d3.axisBottom(x));
  svg.select(".x-axis").selectAll(".tick").filter(d => d === "").style("display", "none");
  svg.append("g").attr("class", "axis y-axis").call(d3.axisLeft(y).tickFormat(d => `${d}°`));

  svg.append("g").attr("class", "grid-line").call(d3.axisLeft(y).tickSize(-width).tickFormat(""))
    .selectAll("line").attr("stroke", "#b0b0b0").attr("stroke-opacity", 0.6).attr("stroke-dasharray", "3,3");
  svg.select(".grid-line").selectAll(".tick").filter(d => d === y.domain()[0]).remove();
  svg.select(".grid-line .domain").remove();

  svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 20).attr("x", -height / 2).text("°C");

  const boxGroup = svg.selectAll(".box-group").data(allPlotData).join("g").attr("class", "box-group")
    .attr("transform", d => `translate(${x(d.key === 'Annual' ? 'Annual' : d3.timeFormat("%b")(new Date(2000, d.key - 1)))}, 0)`);

  boxGroup.append("line").attr("class", "box-part").attr("x1", x.bandwidth() / 2).attr("x2", x.bandwidth() / 2).attr("y1", d => y(d.stats.upper)).attr("y2", d => y(d.stats.q3)).attr("stroke", "black").attr("stroke-width", 0.5);
  boxGroup.append("line").attr("class", "box-part").attr("x1", x.bandwidth() / 2).attr("x2", x.bandwidth() / 2).attr("y1", d => y(d.stats.q1)).attr("y2", d => y(d.stats.lower)).attr("stroke", "black").attr("stroke-width", 0.5);
  boxGroup.append("line").attr("class", "box-part").attr("x1", x.bandwidth() * 0.25).attr("x2", x.bandwidth() * 0.75).attr("y1", d => y(d.stats.upper)).attr("y2", d => y(d.stats.upper)).attr("stroke", "black");
  boxGroup.append("line").attr("class", "box-part").attr("x1", x.bandwidth() * 0.25).attr("x2", x.bandwidth() * 0.75).attr("y1", d => y(d.stats.lower)).attr("y2", d => y(d.stats.lower)).attr("stroke", "black");

  boxGroup.append("rect").attr("class", "box-part").attr("x", 0).attr("y", d => y(d.stats.q3)).attr("width", x.bandwidth()).attr("height", d => y(d.stats.q1) - y(d.stats.q3))
    .attr("fill", baseColor).attr("stroke", "black").attr("stroke-width", 0.5).style("transition", "fill 0.2s ease-in-out")
    .on("mouseover", function (event, d) {
      d3.select(this).attr("fill", hoverColor);
      tooltip.style("opacity", 1);
      const monthName = d.key === 'Annual' ? 'Annual' : d3.timeFormat("%B")(new Date(2000, d.key - 1));
      tooltip.html(`<strong>${monthName}</strong><br>Max: ${d.stats.max.toFixed(1)} °C<br>Median: ${d.stats.median.toFixed(1)} °C<br>Mean: ${d.mean.toFixed(1)} °C<br>Min: ${d.stats.min.toFixed(1)} °C`);
    })
    .on("mousemove", event => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
    .on("mouseout", function () { d3.select(this).attr("fill", baseColor); tooltip.style("opacity", 0); });

  boxGroup.append("line").attr("class", "box-part").attr("x1", 0).attr("x2", x.bandwidth()).attr("y1", d => y(d.stats.median)).attr("y2", d => y(d.stats.median)).attr("stroke", "black").attr("stroke-width", 1.5);
  boxGroup.append("circle").attr("class", "box-part").attr("cx", x.bandwidth() / 2).attr("cy", d => y(d.mean)).attr("r", 2.5).attr("fill", "black");

  const legendItemsData = [
    { icon: `<svg viewBox="0 0 12 12"><rect width="11" height="11" x="0.5" y="0.5" fill="${baseColor}" stroke="black" stroke-width="1"></rect></svg>`, text: 'Interquartile Range (IQR)' },
    { icon: `<svg viewBox="0 0 12 12"><path d="M6 1 V 11 M 3 1 H 9 M 3 11 H 9" stroke="black" stroke-width="1.5" fill="none"></path></svg>`, text: '1.5 * IQR' },
    { icon: `<svg viewBox="0 0 12 12"><rect x="0" y="0" width="12" height="12" fill="${baseColor}" stroke="black" stroke-width="0.5"></rect><line x1="0" y1="6" x2="12" y2="6" stroke="black" stroke-width="2"></line></svg>`, text: 'Median' },
    { icon: `<svg viewBox="0 0 12 12"><rect x="0" y="0" width="12" height="12" fill="${baseColor}" stroke="black" stroke-width="0.5"></rect><circle cx="6" cy="6" r="2.5" fill="black"></circle></svg>`, text: 'Mean' }
  ];

  let legendHTML = `<div xmlns="http://www.w3.org/1999/xhtml" style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 1rem 1.5rem; padding: 0.5rem; width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: transparent;">`;
  legendItemsData.forEach(itemData => {
    legendHTML += `<div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem;">
            <div style="width: 14px; height: 14px; flex-shrink: 0;">${itemData.icon}</div>
            <span style="white-space: nowrap;">${itemData.text}</span>
        </div>`;
  });
  legendHTML += `</div>`;

  svg.append('foreignObject')
    .attr('x', 0)
    .attr('y', height + margin.bottom - 10)
    .attr('width', width)
    .attr('height', legendHeight)
    .html(legendHTML);
}