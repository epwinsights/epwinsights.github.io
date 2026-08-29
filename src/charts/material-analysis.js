/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import {
  materialPresets,
  thermalMassPresets,
  computeMaterialTemperatures,
  computeThermalMass1D,
  getExternalConvectionCoefficient
} from '../core/material-physics.js';
import { formatSimpleLocation, formatCityNameOnly } from '../core/location-formatter.js';
import { addExportButton, addInfoButton } from '../core/svg-exporter.js';
import { MaterialSketch } from './material-sketch.js';
import { ThermalMassSketch } from './thermal-mass-sketch.js';
import { CHART_DESIGN_WIDTH } from '../core/chart-defaults.js';
import {
  EPW_SURFACE_TEMPERATURE_INTERPOLATOR,
  EPW_SURFACE_DELTA_INTERPOLATOR
} from '../core/color-palettes.js';
import state from '../state.js';

export function renderMaterialAnalysisCharts(epwData, chartRefs) {
  window._recomputeMaterialData = () => {
    computeMaterialTemperatures(epwData);
    state.maState.dataComputed = true;

    if (state.maState.mode === 'mass') {
      computeThermalMass1D(epwData);
      state.maState.massComputed = true;
    }

    updateMAChartArea(epwData);
  };

  if (!state.maState.dataComputed) {
    computeMaterialTemperatures(epwData);
    state.maState.dataComputed = true;
  }

  const sketchContainer = d3.select('#material-sketch-container');
  if (!sketchContainer.empty() && sketchContainer.selectAll('svg').empty()) {
    MaterialSketch.init('#material-sketch-container');
  }

  renderMASidebar('#material-analysis-pane .left-panel', epwData);
  renderMATopMenu('#material-analysis-pane .main-chart-area', epwData);
  updateMAChartArea(epwData);
}

function renderMATopMenu(selector, epwData) {
  let container = d3.select(selector).select('.ma-top-menu');
  if (container.empty()) {
    container = d3.select(selector).insert('div', ':first-child').attr('class', 'ma-top-menu text-center mb-4 pb-3 border-bottom');
  }
  container.html('');

  const toggleGroup = container.append('div').attr('class', 'custom-segmented-control');
  const modes = [
    { id: 'abs', mode: 'absolute', label: 'Absolute Temp' },
    { id: 'delta', mode: 'delta', label: 'Surface-Air Difference' },
    { id: 'mass', mode: 'mass', label: 'Thermal Mass' }
  ];

  modes.forEach(m => {
    toggleGroup.append('input')
      .attr('type', 'radio')
      .attr('class', 'segmented-control-input')
      .attr('name', 'ma-mode')
      .attr('id', `btn-top-${m.id}`)
      .property('checked', state.maState.mode === m.mode)
      .on('change', () => {
        if (typeof window.showLocalProcessing === 'function') {
          window.showLocalProcessing('material-analysis-pane');
        }

        state.maState.mode = m.mode;

        const isMass = state.maState.mode === 'mass';
        d3.select('#collapseMaterialSketch').node().parentNode.style.display = 'block';

        const cardHeader = d3.select('#collapseMaterialSketch').node().parentNode.querySelector('.card-header h6');
        if (cardHeader) {
          cardHeader.innerText = isMass ? 'Transient Thermal Mass Visualization' : 'Surface Heat Balance Visualization';
        }

        d3.select('#material-sketch-container').style('display', isMass ? 'none' : 'block');

        let tmContainer = d3.select('#thermal-mass-sketch-container');
        if (tmContainer.empty()) {
          d3.select('#collapseMaterialSketch .card-body').append('div').attr('id', 'thermal-mass-sketch-container');
          ThermalMassSketch.init('#thermal-mass-sketch-container');
          tmContainer = d3.select('#thermal-mass-sketch-container');
        }
        tmContainer.style('display', isMass ? 'block' : 'none');

        d3.select('#material-heatmap-chart').style('display', isMass ? 'none' : 'block');
        d3.select('#material-boxplot-chart').style('display', isMass ? 'none' : 'block');
        d3.select('#thermal-mass-chart').style('display', isMass ? 'block' : 'none');

        const kpiDiv = d3.select('#thermal-mass-kpis');
        if (!kpiDiv.empty()) {
          kpiDiv.style('display', isMass ? 'block' : 'none');
        }

        renderMASidebar('#material-analysis-pane .left-panel', epwData);

        setTimeout(() => {
          if (isMass && !state.maState.massComputed) {
            computeThermalMass1D(epwData);
            state.maState.massComputed = true;
          }
          updateMAChartArea(epwData);

          if (typeof window.hideLocalProcessing === 'function') {
            window.hideLocalProcessing('material-analysis-pane');
          }
        }, 50);
      });

    toggleGroup.append('label')
      .attr('class', 'segmented-control-label')
      .attr('for', `btn-top-${m.id}`)
      .text(m.label);
  });
}

function renderMASidebar(panelSelector, epwData) {
  const panel = d3.select(panelSelector).html('');
  const isMass = state.maState.mode === 'mass';

  const geoControls = panel.append('div').attr('class', 'chart-controls-group mb-4');
  geoControls.append('h6').text('Surface Geometry');

  const tiltItem = geoControls.append('div').attr('class', 'control-item');
  tiltItem.append('label').text('Surface Tilt (Degrees)');
  geoControls.append('p').attr('class', 'text-muted mb-1').style('font-size', '10px').text('0 = Roof, 90 = Wall');
  const tiltInput = tiltItem.append('input').attr('type', 'number').attr('class', 'form-control form-control-sm').attr('min', '0').attr('max', '180').property('value', state.maState.tilt);

  const azItem = geoControls.append('div').attr('class', 'control-item mt-2');
  azItem.append('label').text('Surface Azimuth (Degrees)');
  geoControls.append('p').attr('class', 'text-muted mb-1').style('font-size', '10px').text('0 = North, 90 = East, 180 = South, 270 = West');
  const azInput = azItem.append('input').attr('type', 'number').attr('class', 'form-control form-control-sm').attr('min', '0').attr('max', '360').property('value', state.maState.azimuth);

  if (isMass) {
    const timeControls = panel.append('div').attr('class', 'chart-controls-group mb-4');
    timeControls.append('h6').text('Time Filter');
    const monthSelect = timeControls.append('select').attr('class', 'form-select form-select-sm').attr('id', 'ma-month-filter');
    const months = ["Annual", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    months.forEach((m) => {
      monthSelect.append('option').attr('value', m).text(m).property('selected', state.maState.monthFilter === m);
    });

    const matControls = panel.append('div').attr('class', 'chart-controls-group mb-4');
    matControls.append('h6').text('Thermophysical Properties');

    const presetItem = matControls.append('div').attr('class', 'control-item mb-3');
    presetItem.append('label').text('Material Library');
    const select = presetItem.append('select').attr('class', 'form-select form-select-sm').attr('id', 'ma-mass-preset');
    select.append('option').attr('value', 'custom').text('-- Custom / Manual Entry --');
    matControls.append('p').attr('class', 'text-muted mb-3').style('font-size', '10px').style('line-height', '1.3').text('Based on ASHRAE HOF 2005 / EnergyPlus dataset.');

    const groups = {};
    Object.entries(thermalMassPresets).forEach(([key, val]) => {
      if (!groups[val.group]) groups[val.group] = [];
      groups[val.group].push({ key, ...val });
    });
    Object.keys(groups).forEach(gName => {
      const optgroup = select.append('optgroup').attr('label', gName);
      groups[gName].forEach(m => {
        optgroup.append('option').attr('value', m.key).property('selected', state.maState.massPreset === m.key).text(m.name);
      });
    });

    const buildInput = (label, key, step, unit) => {
      const item = matControls.append('div').attr('class', 'control-item mt-2');
      item.append('label').html(`${label} <span style="font-size:9px; color:#888;">${unit}</span>`);
      return item.append('input').attr('type', 'number').attr('class', 'form-control form-control-sm').attr('step', step).property('value', state.maState[key]);
    };

    const thInput = buildInput('Thickness', 'thickness', '0.01', '(m)');
    const rhoInput = buildInput('Density', 'density', '10', '(kg/m³)');
    const cpInput = buildInput('Specific Heat', 'specificHeat', '10', '(J/kg·K)');
    const kInput = buildInput('Conductivity', 'conductivity', '0.05', '(W/m·K)');
    const alphaInput = buildInput('Solar Absorptance', 'alpha', '0.05', '(0-1)');
    const epsInput = buildInput('Thermal Emissivity', 'eps', '0.05', '(0-1)');

    const syncCustom = () => { select.property('value', 'custom'); state.maState.massPreset = 'custom'; };
    [thInput, rhoInput, cpInput, kInput, alphaInput, epsInput].forEach(inp => inp.on('input', syncCustom));

    select.on('change', function () {
      if (this.value === 'custom') { state.maState.massPreset = 'custom'; return; }
      const p = thermalMassPresets[this.value];
      state.maState.massPreset = this.value;
      thInput.property('value', p.thickness);
      rhoInput.property('value', p.density);
      cpInput.property('value', p.specificHeat);
      kInput.property('value', p.conductivity);
      alphaInput.property('value', p.alpha);
      epsInput.property('value', p.eps);
    });

    const fireMassSketchUpdate = () => {
      if (ThermalMassSketch) {
        const getVal = (input, def) => isNaN(parseFloat(input.property('value'))) ? def : parseFloat(input.property('value'));
        let groupName = "default";
        const presetVal = select.property('value');
        if (presetVal !== 'custom' && thermalMassPresets[presetVal]) {
          groupName = thermalMassPresets[presetVal].group;
        }
        const presetText = presetVal === 'custom' ? 'Custom Mass' : select.node().options[select.node().selectedIndex].text;

        ThermalMassSketch.update(
          getVal(thInput, 0.1),
          getVal(rhoInput, 1000),
          getVal(cpInput, 1000),
          getVal(kInput, 1.0),
          getVal(alphaInput, 0.5),
          getVal(epsInput, 0.9),
          getVal(tiltInput, 90),
          getVal(azInput, 180),
          groupName,
          presetText
        );
      }
    };

    [thInput, rhoInput, cpInput, kInput, alphaInput, epsInput, tiltInput, azInput].forEach(inp => inp.on('input.mass-sketch', fireMassSketchUpdate));
    select.on('change.mass-sketch', fireMassSketchUpdate);
    setTimeout(fireMassSketchUpdate, 150);

  panel.append('button').attr('class', 'btn btn-primary btn-sm w-100 mt-3').text('Simulate Thermal Mass')
    .on('click', () => {
      if (typeof window.showLocalProcessing === 'function') {
        window.showLocalProcessing('material-analysis-pane');
      }

      setTimeout(() => {
        state.maState.monthFilter = monthSelect.property('value');
        state.maState.tilt = parseFloat(tiltInput.property('value')) || 0;
        state.maState.azimuth = parseFloat(azInput.property('value')) || 0;
        state.maState.thickness = parseFloat(thInput.property('value')) || 0.1;
        state.maState.density = parseFloat(rhoInput.property('value')) || 1000;
        state.maState.specificHeat = parseFloat(cpInput.property('value')) || 1000;
        state.maState.conductivity = parseFloat(kInput.property('value')) || 1.0;
        state.maState.alpha = parseFloat(alphaInput.property('value')) || 0.5;
        state.maState.eps = parseFloat(epsInput.property('value')) || 0.9;

        window._recomputeMaterialData();

        if (typeof window.hideLocalProcessing === 'function') {
          window.hideLocalProcessing('material-analysis-pane');
        }
      }, 50);
    });
  }
  else {
    const matControls = panel.append('div').attr('class', 'chart-controls-group mb-4');
    matControls.append('h6').text('Surface Properties');

    const presetItem = matControls.append('div').attr('class', 'control-item');
    presetItem.append('label').text('Preset Library');
    const select = presetItem.append('select').attr('class', 'form-select form-select-sm').attr('id', 'ma-preset');
    select.append('option').attr('value', 'custom').text('-- Custom / Manual Entry --');

    const groups = {};
    Object.entries(materialPresets).forEach(([key, val]) => {
      if (!groups[val.group]) groups[val.group] = [];
      groups[val.group].push({ key, ...val });
    });
    Object.keys(groups).forEach(gName => {
      const optgroup = select.append('optgroup').attr('label', gName);
      groups[gName].forEach(m => {
        optgroup.append('option').attr('value', m.key).property('selected', state.maState.preset === m.key).text(m.name);
      });
    });

    const alphaItem = matControls.append('div').attr('class', 'control-item mt-2');
    alphaItem.append('label').text('Solar Absorptance (α)');
    const alphaInput = alphaItem.append('input').attr('type', 'number').attr('class', 'form-control form-control-sm').attr('step', '0.05').attr('min', '0').attr('max', '1').property('value', state.maState.alpha);

    const epsItem = matControls.append('div').attr('class', 'control-item mt-2');
    epsItem.append('label').text('Thermal Emissivity (ε)');
    const epsInput = epsItem.append('input').attr('type', 'number').attr('class', 'form-control form-control-sm').attr('step', '0.05').attr('min', '0').attr('max', '1').property('value', state.maState.eps);

    const envControls = panel.append('div').attr('class', 'chart-controls-group mt-4');
    envControls.append('h6').text('Analysis Settings');

    const svfItem = envControls.append('div').attr('class', 'control-item');
    svfItem.append('label').text('Sky View Factor (SVF)');
    const svfInput = svfItem.append('input').attr('type', 'number').attr('class', 'form-control form-control-sm').attr('step', '0.05').attr('min', '0').attr('max', '1').property('value', state.maState.svf);

    const threshItem = envControls.append('div').attr('class', 'control-item mt-2');
    threshItem.append('label').text('Critical Temp Threshold (°C)');
    const threshInput = threshItem.append('input').attr('type', 'number').attr('class', 'form-control form-control-sm').property('value', state.maState.threshold);

    const syncCustom = () => { select.property('value', 'custom'); state.maState.preset = 'custom'; };
    alphaInput.on('input', syncCustom);
    epsInput.on('input', syncCustom);

    select.on('change', function () {
      if (this.value === 'custom') { state.maState.preset = 'custom'; return; }
      const p = materialPresets[this.value];
      state.maState.preset = this.value;
      alphaInput.property('value', p.alpha);
      epsInput.property('value', p.eps);
    });

    const fireSketchUpdate = () => {
      if (MaterialSketch) {
        const getVal = (input, def) => isNaN(parseFloat(input.property('value'))) ? def : parseFloat(input.property('value'));
        const presetName = select.property('value') === 'custom' ? 'Custom Material' : select.node().options[select.node().selectedIndex].text;
        MaterialSketch.update(getVal(alphaInput, 0), getVal(epsInput, 0), getVal(tiltInput, 0), getVal(azInput, 0), getVal(svfInput, 1.0), presetName);
      }
    };

    [alphaInput, epsInput, tiltInput, azInput, svfInput].forEach(inp => inp.on('input.sketch', fireSketchUpdate));
    select.on('change.sketch', fireSketchUpdate);
    setTimeout(fireSketchUpdate, 100);

  panel.append('button').attr('class', 'btn btn-primary btn-sm w-100 mt-3').text('Simulate Temperatures')
    .on('click', () => {
      if (typeof window.showLocalProcessing === 'function') {
        window.showLocalProcessing('material-analysis-pane');
      }

      setTimeout(() => {
        state.maState.alpha = parseFloat(alphaInput.property('value')) || 0;
        state.maState.eps = parseFloat(epsInput.property('value')) || 0;
        state.maState.tilt = parseFloat(tiltInput.property('value')) || 0;
        state.maState.azimuth = parseFloat(azInput.property('value')) || 0;
        state.maState.svf = parseFloat(svfInput.property('value')) || 1.0;
        state.maState.threshold = parseFloat(threshInput.property('value')) || 50;
        window._recomputeMaterialData();

        if (typeof window.hideLocalProcessing === 'function') {
          window.hideLocalProcessing('material-analysis-pane');
        }
      }, 50);
    });
  }

  const ackGroup = panel.append('div').attr('class', 'chart-controls-group mt-4');
  const headerRow = ackGroup.append('div').attr('class', 'd-flex justify-content-between align-items-baseline mb-2').style('cursor', 'pointer').attr('data-bs-toggle', 'collapse').attr('data-bs-target', '#ma-scientific-basis');
  headerRow.append('h6').attr('class', 'mb-0').text('Scientific Basis & Assumptions');
  const toggleText = headerRow.append('span').attr('class', 'text-primary').style('font-size', '10px').html('Read more ▼');

  const collapseContainer = ackGroup.append('div').attr('id', 'ma-scientific-basis').attr('class', 'collapse');
  const infoNote = collapseContainer.append('ul').attr('class', 'info-note mb-0').style('font-size', '11px').style('padding-left', '15px');

  if (isMass) {
    infoNote.html(`
        <li class="mb-2"><strong>1D Explicit Finite Difference:</strong> The material thickness is discretized into 10 nodes, and conduction between them is advanced forward in time with an explicit central-difference scheme. Each hourly EPW record is internally subdivided into a number of shorter sub-steps (not just one step per hour) so the temperature field can respond smoothly within the hour rather than jumping discretely between hourly values.</li>
        <li class="mb-2"><strong>Dynamic Stability Control:</strong> Explicit schemes are only stable below a maximum time step that depends on the material's thickness, density, specific heat and conductivity, as well as the exterior convective coefficient. The simulation computes this limit automatically for the selected material and wind conditions, applies a safety margin, and derives the number of sub-steps per hour from it, so the scheme stays numerically stable without the user needing to set anything manually. For materials thin and conductive enough that this would require an impractically large number of sub-steps (for example, thin sheet metal), the material is instead modeled as a single lumped thermal mass, an exact, unconditionally stable simplification that is accurate precisely because such materials have no meaningful internal temperature gradient to resolve.</li>
        <li class="mb-2"><strong>Boundary Conditions:</strong> The exterior node exchanges heat with the sol-air temperature through the convective coefficient described above; the interior node exchanges heat with a fixed indoor air temperature of 22°C through a constant indoor film coefficient of 8.3 W/m²K, a typical still-air value rather than a value derived from an actual room or HVAC model. The interior side is therefore a simplified boundary, not a full building energy simulation.</li>
        <li class="mb-2"><strong>Solar Geometry & Incidence:</strong> Sun position (altitude and azimuth) is computed for each timestamp from the file's latitude and longitude. The angle of incidence on the tilted surface then combines direct beam radiation (using the cosine of the incidence angle, only when the sun is above the horizon and facing the surface), sky diffuse radiation (an isotropic sky model weighted by the surface's view factor to the sky, adjustable via the SVF parameter), and ground-reflected radiation (estimated from the surface's view factor to the ground and the configured ground albedo).</li>
        <li class="mb-2"><strong>External Convective Coefficient:</strong> Calculated with the McAdams (1954) correlation, using separate roughness parameters for smooth and rough surfaces as reviewed in Mirsadeghi et al. (2013). The weather file's 10 m wind speed is used directly as the model's reference wind speed, a simplification also used by some building energy simulation programs; the actual wind speed at the surface can differ notably from this value.</li>
        <li class="mb-2"><strong>Sky Temperature Estimation:</strong> When the EPW file reports horizontal infrared radiation intensity, the sky temperature is derived from it directly via the Stefan-Boltzmann law. When that field is unavailable, a sky emissivity is estimated from the dew point temperature using the Clark and Allen (1978) correlation, adjusted for opaque sky cover following Walton (1983), and the sky temperature is derived from that emissivity instead.</li>
        <li class="mb-2"><strong>Iterative Longwave Solve:</strong> The night sky radiative loss depends on the surface temperature being solved for, so the exterior heat balance is solved with the linearized radiative heat transfer coefficient (h<sub>r</sub>) method used for the exterior surface heat balance in EnergyPlus (Walton 1983; ASHRAE 1993 Handbook of Fundamentals; McClellan and Pedersen 1997). The quartic radiative loss term is rewritten exactly as h<sub>r</sub> times a linear temperature difference, h<sub>r</sub> is recomputed from each new surface temperature estimate, and the now-linear balance is re-solved until the surface temperature changes by less than 0.001°C between iterations (or a maximum of 50 iterations is reached). Checked against an independent bisection solve across 241,920 combinations of air temperature, wind speed, surface absorptance and emissivity, incident radiation, sky view factor, and opaque sky cover, this converges in 12 iterations or fewer, with a maximum error of 0.0002°C.</li>
        <li class="mb-2"><strong>Spin-up to Periodic Steady State:</strong> The simulation repeats the full year until the node temperatures at year-end stop changing meaningfully between passes (or a maximum number of passes is reached), so very thick or dense materials have enough cycles to shed their arbitrary starting temperature.</li>
        <li class="mb-2"><strong>Surface-Averaged, Not Geometry-Aware:</strong> Convection and radiation are treated as uniform over the surface. Effects such as building height, wind direction relative to the facade, edges, and sheltering by nearby buildings are not modeled, consistent with most of the correlations.</li>
        `);
  } else {
    infoNote.html(`
        <li class="mb-2"><strong>Surface Heat Balance:</strong> For each hour, the exterior surface temperature is obtained by solving an algebraic (quasi-steady) energy balance between absorbed solar radiation, net longwave radiative loss to the sky, and convective exchange with outdoor air. This mode has no thermal mass or memory of previous hours: it reports what the surface temperature would be if it responded instantly, which is why it differs from the Thermal Mass mode where time lag and damping are represented explicitly.</li>
        <li class="mb-2"><strong>Solar Geometry & Incidence:</strong> Sun position (altitude and azimuth) is computed for each timestamp from the file's latitude and longitude. The angle of incidence on the tilted surface then combines direct beam radiation (using the cosine of the incidence angle, only when the sun is above the horizon and facing the surface), sky diffuse radiation (an isotropic sky model weighted by the surface's view factor to the sky, adjustable via the SVF parameter), and ground-reflected radiation (estimated from the surface's view factor to the ground and the configured ground albedo).</li>
        <li class="mb-2"><strong>Convective Heat Transfer:</strong> Calculated with the McAdams (1954) correlation, using separate roughness parameters for smooth and rough surfaces as reviewed in Mirsadeghi et al. (2013). The weather file's 10 m wind speed is used directly as the model's reference wind speed, a simplification also used by some building energy simulation programs; the actual wind speed at the surface can differ notably from this value.</li>
        <li class="mb-2"><strong>Sky Temperature Estimation:</strong> When the EPW file reports horizontal infrared radiation intensity, the sky temperature is derived from it directly via the Stefan-Boltzmann law. When that field is unavailable, a sky emissivity is estimated from the dew point temperature using the Clark and Allen (1978) correlation, adjusted for opaque sky cover following Walton (1983), and the sky temperature is derived from that emissivity instead.</li>
        <li class="mb-2"><strong>Iterative Longwave Solve:</strong> The night sky radiative loss depends on the surface temperature being solved for, so the exterior heat balance is solved with the linearized radiative heat transfer coefficient (h<sub>r</sub>) method used for the exterior surface heat balance in EnergyPlus (Walton 1983; ASHRAE 1993 Handbook of Fundamentals; McClellan and Pedersen 1997). The quartic radiative loss term is rewritten exactly as h<sub>r</sub> times a linear temperature difference, h<sub>r</sub> is recomputed from each new surface temperature estimate, and the now-linear balance is re-solved until the surface temperature changes by less than 0.001°C between iterations (or a maximum of 50 iterations is reached). Checked against an independent bisection solve across 241,920 combinations of air temperature, wind speed, surface absorptance and emissivity, incident radiation, sky view factor, and opaque sky cover, this converges in 12 iterations or fewer, with a maximum error of 0.0002°C.</li>
        <li class="mb-2"><strong>Surface-Averaged, Not Geometry-Aware:</strong> Convection and radiation are treated as uniform over the surface. Effects such as building height, wind direction relative to the facade, edges, and sheltering by nearby buildings are not modeled, consistent with most of the correlations.</li>
        `);
  }

  setTimeout(() => {
    const collapseEl = document.getElementById('ma-scientific-basis');
    if (collapseEl) {
      collapseEl.addEventListener('show.bs.collapse', () => toggleText.html('Show less ▲'));
      collapseEl.addEventListener('hide.bs.collapse', () => toggleText.html('Read more ▼'));
    }
  }, 0);
}

function updateMAChartArea(epwData) {
  let kpiContainer = d3.select('#thermal-mass-kpis');
  if (kpiContainer.empty()) {
    const chartNode = d3.select('#thermal-mass-chart').node();
    const wrapper = document.createElement('div');
    wrapper.id = 'thermal-mass-kpis';
    chartNode.parentNode.insertBefore(wrapper, chartNode);
    kpiContainer = d3.select('#thermal-mass-kpis');
  }

  let crossSectionContainer = d3.select('#thermal-mass-cross-section');
  if (crossSectionContainer.empty()) {
    const diurnalChartNode = d3.select('#thermal-mass-chart').node();
    const wrapper = document.createElement('div');
    wrapper.id = 'thermal-mass-cross-section';
    wrapper.className = 'chart-container mb-5 w-100';
    diurnalChartNode.parentNode.insertBefore(wrapper, diurnalChartNode.nextSibling);
    crossSectionContainer = d3.select('#thermal-mass-cross-section');
  }

  let heatFluxContainer = d3.select('#thermal-mass-heatflux');
  if (heatFluxContainer.empty()) {
    const crossNode = d3.select('#thermal-mass-cross-section').node();
    const wrapper = document.createElement('div');
    wrapper.id = 'thermal-mass-heatflux';
    wrapper.className = 'chart-container mb-5 w-100';
    crossNode.parentNode.insertBefore(wrapper, crossNode.nextSibling);
    heatFluxContainer = d3.select('#thermal-mass-heatflux');
  }

  if (state.maState.mode === 'mass') {
    kpiContainer.style('display', 'block');
    d3.select('#thermal-mass-chart').style('display', 'block');
    crossSectionContainer.style('display', 'block');
    heatFluxContainer.style('display', 'block');

    let lumpedNotice = d3.select('#thermal-mass-lumped-notice');
    if (lumpedNotice.empty()) {
      const kpiNode = d3.select('#thermal-mass-kpis').node();
      const wrapper = document.createElement('div');
      wrapper.id = 'thermal-mass-lumped-notice';
      kpiNode.parentNode.insertBefore(wrapper, kpiNode);
      lumpedNotice = d3.select('#thermal-mass-lumped-notice');
    }
    lumpedNotice.html('');
    if (epwData.thermalMassIsLumped) {
      lumpedNotice.append('div')
        .attr('class', 'alert alert-info py-2 px-3 mb-3')
        .style('font-size', '12px')
        .html('<strong>Note:</strong> this material is thin and conductive enough that internal temperature gradients are negligible over an hourly time step. It is modeled as a single lumped thermal mass rather than resolved across 10 internal nodes.');
    }

    renderThermalMassKPICards('#thermal-mass-kpis', epwData);
    renderThermalMassDiurnalChart('#thermal-mass-chart', epwData);
    renderThermalMassCrossSectionHeatmap('#thermal-mass-cross-section', epwData);
    renderThermalMassHeatFluxChart('#thermal-mass-heatflux', epwData);
  } else {
    kpiContainer.style('display', 'none');
    crossSectionContainer.style('display', 'none');
    heatFluxContainer.style('display', 'none');
    renderHeatmapAndBoxplot(epwData);
  }
}

function renderThermalMassKPICards(selector, epwData) {
  const container = d3.select(selector).html('');
  if (container.node().getBoundingClientRect().width === 0) return;

  container.style('background-color', '#f8f9fa')
    .style('padding', '1rem')
    .style('border-radius', '8px')
    .style('margin-bottom', '1.5rem');

  const grid = container.append('div')
    .style('display', 'flex')
    .style('gap', '10px')
    .style('flex-wrap', 'wrap')
    .style('justify-content', 'center');

  let filteredData = epwData.data;
  if (state.maState.monthFilter !== "Annual") {
    const monthIndex = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(state.maState.monthFilter) + 1;
    filteredData = filteredData.filter(d => d.month === monthIndex);
  }

  const hourlyAvg = Array.from(d3.group(filteredData, d => d.hour), ([hour, records]) => {
    return {
      hour: hour,
      solAir: d3.mean(records, d => d.ma_TSurf),
      outMass: d3.mean(records, d => d.ma_TOutMass),
      inMass: d3.mean(records, d => d.ma_TInMass)
    };
  }).sort((a, b) => a.hour - b.hour);

  let maxSolAir = -Infinity, maxSolAirHour = 0;
  let maxInMass = -Infinity, maxInMassHour = 0;
  let minSolAir = Infinity, minInMass = Infinity;
  let sumSolAir = 0, sumInMass = 0;

  hourlyAvg.forEach(d => {
    if (d.solAir > maxSolAir) { maxSolAir = d.solAir; maxSolAirHour = d.hour; }
    if (d.inMass > maxInMass) { maxInMass = d.inMass; maxInMassHour = d.hour; }
    if (d.solAir < minSolAir) minSolAir = d.solAir;
    if (d.inMass < minInMass) minInMass = d.inMass;
    sumSolAir += d.solAir;
    sumInMass += d.inMass;
  });

  let timeLag = maxInMassHour - maxSolAirHour;
  if (timeLag < 0) timeLag += 24;

  const ampSolAir = maxSolAir - minSolAir;
  const ampInMass = maxInMass - minInMass;
  const decrementFactor = ampSolAir !== 0 ? (ampInMass / ampSolAir) : 0;

  const maxOutMass = d3.max(hourlyAvg, d => d.outMass);
  const minOutMass = d3.min(hourlyAvg, d => d.outMass);
  const massMeanSwing = ((maxOutMass + maxInMass) / 2) - ((minOutMass + minInMass) / 2);
  const dailyHeatStorage = (state.maState.density * state.maState.specificHeat * state.maState.thickness * massMeanSwing) / 3600;

  const nHours = hourlyAvg.length || 1;
  const meanSolAir = sumSolAir / nHours;
  const meanInMass = sumInMass / nHours;

  let varSolAir = 0, varInMass = 0;
  hourlyAvg.forEach(d => {
    varSolAir += Math.pow(d.solAir - meanSolAir, 2);
    varInMass += Math.pow(d.inMass - meanInMass, 2);
  });

  const stdSolAir = Math.sqrt(varSolAir / nHours);
  const stdInMass = Math.sqrt(varInMass / nHours);
  const stabilityIndex = stdInMass !== 0 ? (stdSolAir / stdInMass) : Infinity;

  const cards = [
    { title: 'Time Lag', value: `${timeLag} hrs`, text: 'Peak shifting delay', color: '#d73027', tooltip: 'The time delay between the peak outer Sol-Air temperature and the peak inner surface temperature.' },
    { title: 'Decrement Factor', value: decrementFactor.toFixed(3), text: 'Amplitude damping', color: '#fdae61', tooltip: 'The ratio of the inner surface temperature amplitude to the outer Sol-Air temperature amplitude.' },
    { title: 'Daily Heat Storage', value: `${Math.max(0, dailyHeatStorage).toFixed(0)} Wh/m²`, text: 'Thermal mass capacity', color: '#abdda4', tooltip: 'The estimated amount of thermal energy absorbed and released by the material per square meter.' },
    { title: 'Interior Peak Temp', value: `${maxInMass.toFixed(1)} °C`, text: 'Overheating threshold', color: '#f46d43', tooltip: 'The maximum temperature reached on the inner surface.' },
    { title: 'Thermal Stability', value: stabilityIndex === Infinity ? '∞' : stabilityIndex.toFixed(1), text: 'Variance ratio', color: '#4575b4', tooltip: 'The ratio of external environmental temperature variance to internal surface temperature variance.' }
  ];

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");

  cards.forEach(c => {
    const box = grid.append('div')
      .style('background-color', '#fff')
      .style('flex', '1 1 0')
      .style('min-width', '135px')
      .style('padding', '0.75rem')
      .style('border-radius', '6px')
      .style('border-left', `4px solid ${c.color}`)
      .style('box-shadow', '0 1px 3px rgba(0,0,0,0.05)')
      .style('transition', 'transform 0.8s ease-out, box-shadow 0.8s ease-out')
      .style('cursor', 'help');

    box.on('mouseover', function (event) {
      d3.select(this).style('transform', 'translateY(-4px)').style('box-shadow', '0 4px 12px rgba(0,0,0,0.1)');
      tooltip.style('opacity', 1).html(`
                <div style="max-width: 200px; white-space: normal; text-align: left;">
                    <strong>${c.title}</strong><br>
                    <span style="font-size:11px; color: #ccc;">${c.tooltip}</span>
                </div>
            `);
    })
      .on('mousemove', function (event) {
        tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`);
      })
      .on('mouseout', function () {
        d3.select(this).style('transform', 'translateY(0)').style('box-shadow', '0 1px 3px rgba(0,0,0,0.05)');
        tooltip.style('opacity', 0);
      });

    box.append('div').style('color', '#6c757d').style('font-size', '10.5px').style('font-weight', '500').style('white-space', 'nowrap').text(c.title);
    box.append('div').style('font-size', '16px').style('font-weight', 'bold').style('margin', '4px 0').text(c.value);
    box.append('div').style('color', '#adb5bd').style('font-size', '9.5px').text(c.text);
  });
}

function renderThermalMassDiurnalChart(selector, epwData) {
  const container = d3.select(selector).html('');
  if (container.node().getBoundingClientRect().width === 0) return;

  container.append('h5').text(`Thermal Mass Effect (${state.maState.monthFilter})`).attr('class', 'chart-title-main');

  let filteredData = epwData.data;
  if (state.maState.monthFilter !== "Annual") {
    const monthIndex = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(state.maState.monthFilter) + 1;
    filteredData = filteredData.filter(d => d.month === monthIndex);
  }

  const hourlyAvg = Array.from(d3.group(filteredData, d => d.hour), ([hour, records]) => {
    return {
      hour: hour,
      air: d3.mean(records, d => d.dryBulbTemperature),
      solAir: d3.mean(records, d => d.ma_TSurf),
      outMass: d3.mean(records, d => d.ma_TOutMass),
      inMass: d3.mean(records, d => d.ma_TInMass)
    };
  }).sort((a, b) => a.hour - b.hour);

  const margin = { top: 30, right: 30, bottom: 120, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([1, 24]).range([0, width]);

  const yMin = d3.min(hourlyAvg, d => Math.min(d.air, d.solAir, d.outMass, d.inMass)) - 2;
  const yMax = d3.max(hourlyAvg, d => Math.max(d.air, d.solAir, d.outMass, d.inMass)) + 2;
  const y = d3.scaleLinear().domain([yMin, yMax]).range([height, 0]);

  svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).ticks(12).tickFormat(d => `${d}:00`));
  svg.append("g").call(d3.axisLeft(y));

  svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -45).attr("x", -height / 2).style("text-anchor", "middle").text("Temperature (°C)").style("font-size", "12px");
  svg.append("text").attr("class", "x-axis-label axis-title").attr("x", width / 2).attr("y", height + 35).style("text-anchor", "middle").text("Hour of Day").style("font-size", "12px");

  const lineAir = d3.line().curve(d3.curveMonotoneX).x(d => x(d.hour)).y(d => y(d.air));
  const lineSolAir = d3.line().curve(d3.curveMonotoneX).x(d => x(d.hour)).y(d => y(d.solAir));
  const lineOutMass = d3.line().curve(d3.curveMonotoneX).x(d => x(d.hour)).y(d => y(d.outMass));
  const lineInMass = d3.line().curve(d3.curveMonotoneX).x(d => x(d.hour)).y(d => y(d.inMass));

  const colors = {
    air: "#4285F4",
    solAir: "#EA4335",
    outMass: "#FBBC05",
    inMass: "#34A853"
  };

  svg.append("path").datum(hourlyAvg).attr("fill", "none").attr("stroke", colors.solAir).attr("stroke-width", 2).attr("stroke-dasharray", "5,5").attr("d", lineSolAir);
  svg.append("path").datum(hourlyAvg).attr("fill", "none").attr("stroke", colors.air).attr("stroke-width", 2).attr("d", lineAir);
  svg.append("path").datum(hourlyAvg).attr("fill", "none").attr("stroke", colors.outMass).attr("stroke-width", 2.5).attr("d", lineOutMass);
  svg.append("path").datum(hourlyAvg).attr("fill", "none").attr("stroke", colors.inMass).attr("stroke-width", 3).attr("d", lineInMass);

  const legend = svg.append("g").attr("transform", `translate(${width / 2}, ${height + 60})`);
  const legends = [
    { name: "Outdoor Air Temp", col: colors.air, dash: "0" },
    { name: "Sol-Air (0-Mass)", col: colors.solAir, dash: "5,5" },
    { name: "Outer Surf (Mass)", col: colors.outMass, dash: "0" },
    { name: "Inner Surf (Mass)", col: colors.inMass, dash: "0" }
  ];

  const itemWidth = 115;
  const startX = -(legends.length * itemWidth) / 2;

  legends.forEach((l, i) => {
    const item = legend.append("g").attr("transform", `translate(${startX + (i * itemWidth)}, 0)`);
    item.append("line").attr("x1", 0).attr("x2", 15).attr("y1", -4).attr("y2", -4).attr("stroke", l.col).attr("stroke-width", 2).attr("stroke-dasharray", l.dash);
    item.append("text").attr("x", 20).attr("y", 0).style("font-size", "10px").style("font-family", "sans-serif").text(l.name);
  });

  const metaText = svg.append("text")
    .attr("x", width / 2).attr("y", height + 85)
    .style("text-anchor", "middle").style("font-size", "10px").style("fill", "#6c757d");

  metaText.append("tspan").attr("x", width / 2).attr("dy", 0)
    .text(`Thickness = ${state.maState.thickness} m | Density = ${state.maState.density} kg/m³ | Specific Heat = ${state.maState.specificHeat} J/kg·K | Conductivity = ${state.maState.conductivity} W/m·K`);

  metaText.append("tspan").attr("x", width / 2).attr("dy", 15)
    .text(`Solar Absorptance = ${state.maState.alpha} | Thermal Emissivity = ${state.maState.eps} | Surface Tilt = ${state.maState.tilt}° | Surface Azimuth = ${state.maState.azimuth}°`);

  if (typeof addExportButton === 'function') {
    const location = epwData.metadata.location || epwData.metadata;
    const formatLocation = typeof formatSimpleLocation === 'function' ? formatSimpleLocation(location.city, location.country, 'primary') : `${location.city}, ${location.country}`;
    addExportButton(selector, 'thermal-mass-diurnal', formatLocation);
    addInfoButton(selector, 'thermalMassEffect');
  }
}

function renderThermalMassCrossSectionHeatmap(selector, epwData) {
  const container = d3.select(selector).html('');
  if (container.node().getBoundingClientRect().width === 0) return;

  container.append('h5').text(`Transient Heat Transfer (${state.maState.monthFilter})`).attr('class', 'chart-title-main');

  let filteredData = epwData.data;
  if (state.maState.monthFilter !== "Annual") {
    const monthIndex = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(state.maState.monthFilter) + 1;
    filteredData = filteredData.filter(d => d.month === monthIndex);
  }

  const N = 10;
  const hourlyAvg = [];
  let minTemp = Infinity, maxTemp = -Infinity;

  const hourlyGroups = d3.group(filteredData, d => d.hour);
  for (let h = 1; h <= 24; h++) {
    const records = hourlyGroups.get(h) || [];
    if (records.length === 0) continue;
    for (let n = 0; n < N; n++) {
      const avgTemp = d3.mean(records, d => d.ma_TMassNodes[n]);
      if (avgTemp < minTemp) minTemp = avgTemp;
      if (avgTemp > maxTemp) maxTemp = avgTemp;
      const depth = (n / (N - 1)) * state.maState.thickness;
      hourlyAvg.push({ hour: h, node: n, depth: depth, temp: avgTemp });
    }
  }

  const margin = { top: 20, right: 90, bottom: 60, left: 75 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 300 - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");

  const xBand = d3.scaleBand().domain(d3.range(1, 25)).range([0, width]);
  const yBand = d3.scaleBand().domain(d3.range(0, N)).range([0, height]);
  const colorScale = d3.scaleSequential(d3.interpolateTurbo).domain([minTemp, maxTemp]);

  svg.selectAll(".cross-rect").data(hourlyAvg).join("rect")
    .attr("class", "cross-rect")
    .attr("x", d => xBand(d.hour))
    .attr("y", d => yBand(d.node))
    .attr("width", xBand.bandwidth() + 0.3)
    .attr("height", yBand.bandwidth() + 0.3)
    .style("fill", d => colorScale(d.temp))
    .on("mouseover", function (event, d) {
      tooltip.style('opacity', 1).html(`
                <div style="max-width: 200px; white-space: normal; text-align: left;">
                    <strong>Hour: ${d.hour}:00</strong><br>
                    <span style="font-size:11px; color: #ccc;">Depth: ${d.depth.toFixed(3)}m (Node ${d.node})</span><br>
                    <span style="font-size:12px; font-weight: bold; margin-top:4px; display:inline-block; color: ${colorScale(d.temp)}; filter: brightness(1.2);">${d.temp.toFixed(1)} °C</span>
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
    .tickValues([0, 4, 9])
    .tickFormat(d => {
      if (d === 0) return `Out (0.00m)`;
      if (d === 9) return `In (${state.maState.thickness.toFixed(2)}m)`;
      return `${((d / (N - 1)) * state.maState.thickness).toFixed(2)}m`;
    })
    .tickSizeOuter(0);
  svg.append("g").attr("class", "axis y-axis").call(yAxis);

  svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 15).attr("x", -height / 2).style("text-anchor", "middle").text("Material Depth").style("font-size", "12px");
  svg.append("text").attr("class", "x-axis-label axis-title").attr("x", width / 2).attr("y", height + 40).style("text-anchor", "middle").text("Hour of Day").style("font-size", "12px");

  const legend = svg.append("g").attr("transform", `translate(${width + 20}, 0)`);
  legend.append("text").attr("x", 7.5).attr("y", -8).attr("class", "axis-title").style("text-anchor", "middle").text("°C").style("font-size", "11px");

  const legendScale = d3.scaleLinear().domain([minTemp, maxTemp]).range([height, 0]);
  legend.append("g").attr("transform", "translate(15,0)").call(d3.axisRight(legendScale).ticks(6).tickFormat(d => d.toFixed(1)));

  const gradientId = `cross-grad-material-heat-transfer`;
  const gradient = legend.append("defs").append("linearGradient").attr("id", gradientId).attr("x1", "0%").attr("y1", "100%").attr("x2", "0%").attr("y2", "0%");
  gradient.selectAll("stop").data(d3.range(0, 1.01, 0.05)).join("stop").attr("offset", d => `${d * 100}%`).attr("stop-color", t => colorScale(d3.interpolateNumber(minTemp, maxTemp)(t)));

  legend.append("rect").attr("x", 0).attr("y", 0).attr("width", 15).attr("height", height).style("fill", `url(#${gradientId})`);

  if (typeof addExportButton === 'function') {
    const location = epwData.metadata.location || epwData.metadata;
    const formatLocation = typeof formatSimpleLocation === 'function' ? formatSimpleLocation(location.city, location.country, 'primary') : `${location.city}, ${location.country}`;
    addExportButton(selector, 'thermal-mass-cross-section', formatLocation);
    addInfoButton(selector, 'transientHeatTransfer');
  }
}

function renderHeatmapAndBoxplot(epwData) {
  const containerSelector = '#material-heatmap-chart';
  const container = d3.select(containerSelector).html('');
  if (container.node().getBoundingClientRect().width === 0) return;

  const isDelta = state.maState.mode === 'delta';
  const title = isDelta ? `Surface to Air Temperature Difference` : `Absolute Surface Temperature`;
  const dataKey = isDelta ? 'ma_DeltaT' : 'ma_TSurf';

  container.append('h5').text(title).attr('class', 'chart-title-main');

  const margin = { top: 20, right: 90, bottom: 70, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");

  const domain = d3.extent(epwData.data, d => d[dataKey]);
  let colorScale;

  if (isDelta) {
    const maxAbs = Math.max(Math.abs(domain[0]), Math.abs(domain[1]));
    colorScale = d3.scaleSequential(EPW_SURFACE_DELTA_INTERPOLATOR).domain([-maxAbs, maxAbs]);
  } else {
    colorScale = d3.scaleSequential(EPW_SURFACE_TEMPERATURE_INTERPOLATOR).domain(domain);
  }

  const year = epwData.data[0].year;
  const x = d3.scaleLinear().range([0, width]);
  const y = d3.scaleLinear().domain([0, 24]).range([height, 0]);
  const daysInYear = Math.max(365, d3.max(epwData.data, d => +d3.timeFormat("%j")(d.datetime)) || 365);
  x.domain([1, daysInYear + 1]);

  const rectWidth = width / daysInYear;
  const cellHeight = height / 24;

  svg.selectAll(".hour-rect").data(epwData.data).join("rect").attr("class", "hour-rect")
    .attr("x", d => x(+d3.timeFormat("%j")(d.datetime)))
    .attr("y", d => y(d.hour))
    .attr("width", rectWidth + 0.3)
    .attr("height", cellHeight + 0.3)
    .style("fill", d => colorScale(d[dataKey]))
    .attr("stroke", d => (d.ma_TSurf >= state.maState.threshold) ? "#ff00ff" : "none")
    .on("mouseover", (event, d) => {
      let html = `<strong>${d3.timeFormat('%b %d, %H:%M')(d.datetime)}</strong><br>`;
      html += `Surface Temp: <b>${d.ma_TSurf.toFixed(1)} °C</b><br>`;
      html += `Air Temp: ${d.dryBulbTemperature.toFixed(1)} °C<br>`;
      html += `&Delta;T: ${d.ma_DeltaT.toFixed(1)} °C<br>`;
      html += `Incident Solar: ${d.ma_ITotal.toFixed(0)} W/m²<br>`;
      html += `Wind Speed: ${d.windSpeed.toFixed(1)} m/s`;
      if (d.ma_TSurf >= state.maState.threshold) {
        html += `<br><span style="color: #ff00ff; font-weight:bold;">⚠️ Exceeds Critical Threshold</span>`;
      }
      tooltip.style("opacity", 1).html(html);
    })
    .on("mousemove", (event) => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
    .on("mouseout", () => tooltip.style("opacity", 0));

  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthTicks = [];
  let cumulative = 0;
  for (let i = 0; i < 12; i++) {
    monthTicks.push(cumulative + (daysInMonth[i] / 2));
    cumulative += daysInMonth[i];
  }

  svg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).tickValues(monthTicks).tickFormat((d, i) => monthNames[i]));
  svg.append("g").attr("class", "axis y-axis").call(d3.axisLeft(y).tickValues([0, 6, 12, 18, 24]));
  svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 22).attr("x", -height / 2).style("text-anchor", "middle").text("Hour of Day").style("font-size", "12px");
  svg.append("text").attr("class", "x-axis-label axis-title").attr("x", width / 2).attr("y", height + 40).style("text-anchor", "middle").text("Month").style("font-size", "12px");

  const metaText = svg.append("text")
    .attr("class", "chart-meta-properties")
    .attr("x", width / 2)
    .attr("y", height + 58)
    .style("text-anchor", "middle")
    .style("font-size", "11px")
    .style("fill", "#6c757d")
    .style("font-weight", "500");
  metaText.append("tspan")
    .text(`Configuration Profile: α = ${state.maState.alpha.toFixed(2)} | ε = ${state.maState.eps.toFixed(2)} | Tilt = ${state.maState.tilt}° | Azimuth = ${state.maState.azimuth}° | SVF = ${state.maState.svf.toFixed(2)} | `);
  metaText.append("tspan")
    .style("fill", "#ff00ff")
    .style("font-weight", "bold")
    .text(`Critical Threshold: ${state.maState.threshold}°C`);

  const legend = svg.append("g").attr("transform", `translate(${width + 20}, 0)`);
  legend.append("text").attr("x", 7.5).attr("y", -8).attr("class", "axis-title").style("text-anchor", "middle").text("°C").style("font-size", "11px");

  const legendScale = d3.scaleLinear().domain(domain).range([height, 0]);
  legend.append("g").attr("transform", "translate(15,0)").call(d3.axisRight(legendScale).ticks(6).tickFormat(d => d.toFixed(0)));

  const gradientId = `mat-grad-${dataKey}`;
  const gradient = legend.append("defs").append("linearGradient").attr("id", gradientId).attr("x1", "0%").attr("y1", "100%").attr("x2", "0%").attr("y2", "0%");
  gradient.selectAll("stop").data(d3.range(0, 1.01, 0.05)).join("stop").attr("offset", d => `${d * 100}%`).attr("stop-color", t => colorScale(d3.interpolateNumber(domain[0], domain[1])(t)));

  legend.append("rect").attr("x", 0).attr("y", 0).attr("width", 15).attr("height", height).style("fill", `url(#${gradientId})`);

  if (typeof addExportButton === 'function') {
    const location = epwData.metadata.location || epwData.metadata;
    const formatLocation = typeof formatSimpleLocation === 'function' ? formatSimpleLocation(location.city, location.country, 'primary') : `${location.city}, ${location.country}`;
    addExportButton(containerSelector, 'material-surface-temperature', formatLocation);
    addInfoButton(containerSelector, 'materialSurfaceHeatmap');
  }

  const boxplotSelector = '#material-boxplot-chart';
  const boxTitle = isDelta ? 'Monthly Temp Difference Distribution (Surface vs. Air)' : 'Monthly Absolute Surface Temp Distribution';
  const baseColor = isDelta ? '#9ecae1' : '#fdae6b';
  const hoverColor = isDelta ? '#3182bd' : '#e6550d';

  renderMaterialBoxplot(boxplotSelector, epwData, dataKey, boxTitle, baseColor, hoverColor);

  if (typeof addExportButton === 'function') {
    const location = epwData.metadata.location || epwData.metadata;
    const formatLocation = typeof formatSimpleLocation === 'function' ? formatSimpleLocation(location.city, location.country, 'primary') : `${location.city}, ${location.country}`;
    const exportFileName = isDelta ? 'material-delta-t-distribution' : 'material-absolute-temp-distribution';
    addExportButton(boxplotSelector, exportFileName, formatLocation);
    addInfoButton(boxplotSelector, 'materialSurfaceDistribution');
  }
}

function renderMaterialBoxplot(selector, epwData, dataKey, title, baseColor, hoverColor) {
  const container = d3.select(selector).html('');
  const hourlyData = epwData.data;
  if (container.node().getBoundingClientRect().width === 0) return;

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  container.append('h5').text(title).attr('class', 'chart-title-main');

  const margin = { top: 20, right: 20, bottom: 65, left: 60 };
  const legendHeight = 50;
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom + legendHeight}`)
    .style("overflow", "visible")
    .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  svg.append("rect").attr("width", width).attr("height", height).attr("fill", "#f8f9fa").style("transition", "fill 0.3s ease-in-out")
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

  const whiskerExtent = d3.extent(allPlotData.flatMap(d => [d.stats.lower, d.stats.upper]));
  const safeExtent = (whiskerExtent[0] === undefined || isNaN(whiskerExtent[0])) ? [-40, 80] : whiskerExtent;
  const extentPad = (safeExtent[1] - safeExtent[0]) * 0.08 || 1;
  const paddedExtent = [safeExtent[0] - extentPad, safeExtent[1] + extentPad];

  const x = d3.scaleBand().domain([...monthlyData.map(d => d3.timeFormat("%b")(new Date(2000, d.key - 1))), "", "Annual"]).range([0, width]).paddingInner(0.6).paddingOuter(0.3);
  const y = d3.scaleLinear().domain(paddedExtent).nice().range([height, 0]);

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

  boxGroup.append("rect").attr("class", "box-part").attr("x", 0).attr("y", d => y(d.stats.q3)).attr("width", x.bandwidth()).attr("height", d => Math.max(0, y(d.stats.q1) - y(d.stats.q3)))
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

  const metaText = svg.append("text").attr("class", "chart-meta-properties").attr("x", width / 2).attr("y", height + 42).style("text-anchor", "middle").style("font-size", "11px").style("fill", "#6c757d").style("font-weight", "500");
  metaText.append("tspan").text(`Configuration Profile: α = ${state.maState.alpha.toFixed(2)} | ε = ${state.maState.eps.toFixed(2)} | Tilt = ${state.maState.tilt}° | Azimuth = ${state.maState.azimuth}° | SVF = ${state.maState.svf.toFixed(2)}`);

  const legendItemsData = [
    { icon: `<svg viewBox="0 0 12 12"><rect width="11" height="11" x="0.5" y="0.5" fill="${baseColor}" stroke="black" stroke-width="1"></rect></svg>`, text: 'Interquartile Range (IQR)' },
    { icon: `<svg viewBox="0 0 12 12"><path d="M6 1 V 11 M 3 1 H 9 M 3 11 H 9" stroke="black" stroke-width="1.5" fill="none"></path></svg>`, text: '1.5 * IQR' },
    { icon: `<svg viewBox="0 0 12 12"><rect x="0" y="0" width="12" height="12" fill="${baseColor}" stroke="black" stroke-width="0.5"></rect><line x1="0" y1="6" x2="12" y2="6" stroke="black" stroke-width="2"></line></svg>`, text: 'Median' },
    { icon: `<svg viewBox="0 0 12 12"><rect x="0" y="0" width="12" height="12" fill="${baseColor}" stroke="black" stroke-width="0.5"></rect><circle cx="6" cy="6" r="2.5" fill="black"></circle></svg>`, text: 'Mean' }
  ];

  let legendHTML = `<div xmlns="http://www.w3.org/1999/xhtml" style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 1rem 1.5rem; padding: 0.5rem; width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: transparent;">`;
  legendItemsData.forEach(itemData => {
    legendHTML += `<div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem;"><div style="width: 14px; height: 14px; flex-shrink: 0;">${itemData.icon}</div><span style="white-space: nowrap;">${itemData.text}</span></div>`;
  });
  legendHTML += `</div>`;

  svg.append('foreignObject').attr('x', 0).attr('y', height + margin.bottom - 5).attr('width', width).attr('height', legendHeight).html(legendHTML);
}

function renderThermalMassHeatFluxChart(selector, epwData) {
  const container = d3.select(selector).html('');
  if (container.node().getBoundingClientRect().width === 0) return;

  container.append('h5').text(`Diurnal Heat Flux (${state.maState.monthFilter})`).attr('class', 'chart-title-main');

  let filteredData = epwData.data;
  if (state.maState.monthFilter !== "Annual") {
    const monthIndex = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(state.maState.monthFilter) + 1;
    filteredData = filteredData.filter(d => d.month === monthIndex);
  }

  const hourlyAvg = Array.from(d3.group(filteredData, d => d.hour), ([hour, records]) => {
    return {
      hour: hour,
      qOut: d3.mean(records, d => {
        const hout = getExternalConvectionCoefficient(d.windSpeed);
        return hout * (d.ma_TSurf - d.ma_TOutMass);
      }),
      qIn: d3.mean(records, d => {
        const hin = 8.3;
        const Tin_bnd = 22;
        return hin * (d.ma_TInMass - Tin_bnd);
      })
    };
  }).sort((a, b) => a.hour - b.hour);

  const margin = { top: 30, right: 30, bottom: 120, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([1, 24]).range([0, width]);

  const maxFlux = d3.max(hourlyAvg, d => Math.max(Math.abs(d.qOut), Math.abs(d.qIn))) * 1.1;
  const y = d3.scaleLinear().domain([-maxFlux, maxFlux]).nice().range([height, 0]);

  svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).ticks(12).tickFormat(d => `${d}:00`));
  svg.append("g").call(d3.axisLeft(y));

  svg.append("line")
    .attr("x1", 0).attr("x2", width)
    .attr("y1", y(0)).attr("y2", y(0))
    .attr("stroke", "#000").attr("stroke-width", 1).attr("stroke-dasharray", "4,4")
    .attr("opacity", 0.3);

  svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -45).attr("x", -height / 2).style("text-anchor", "middle").text("Heat Flux (W/m²)").style("font-size", "12px");
  svg.append("text").attr("class", "x-axis-label axis-title").attr("x", width / 2).attr("y", height + 35).style("text-anchor", "middle").text("Hour of Day").style("font-size", "12px");

  const lineQOut = d3.line().curve(d3.curveMonotoneX).x(d => x(d.hour)).y(d => y(d.qOut));
  const lineQIn = d3.line().curve(d3.curveMonotoneX).x(d => x(d.hour)).y(d => y(d.qIn));

  const colors = {
    qOut: "#EA4335",
    qIn: "#4285F4"
  };

  svg.append("path").datum(hourlyAvg).attr("fill", "none").attr("stroke", colors.qOut).attr("stroke-width", 2).attr("stroke-dasharray", "5,5").attr("d", lineQOut);
  svg.append("path").datum(hourlyAvg).attr("fill", "none").attr("stroke", colors.qIn).attr("stroke-width", 3).attr("d", lineQIn);

  const legend = svg.append("g").attr("transform", `translate(${width / 2}, ${height + 60})`);
  const legends = [
    { name: "External Heat Flux (q_out)", col: colors.qOut, dash: "5,5" },
    { name: "Internal Heat Flux (q_in)", col: colors.qIn, dash: "0" }
  ];

  const itemWidth = 180;
  const startX = -(legends.length * itemWidth) / 2;

  legends.forEach((l, i) => {
    const item = legend.append("g").attr("transform", `translate(${startX + (i * itemWidth)}, 0)`);
    item.append("line").attr("x1", 0).attr("x2", 15).attr("y1", -4).attr("y2", -4).attr("stroke", l.col).attr("stroke-width", l.dash === "0" ? 3 : 2).attr("stroke-dasharray", l.dash);
    item.append("text").attr("x", 20).attr("y", 0).style("font-size", "10px").style("font-family", "sans-serif").text(l.name);
  });

  svg.append("text").attr("x", width).attr("y", y(0) - 5).style("text-anchor", "end").style("font-size", "9px").style("fill", "#6c757d").text("+ Heat Gain (Cooling Load)");
  svg.append("text").attr("x", width).attr("y", y(0) + 12).style("text-anchor", "end").style("font-size", "9px").style("fill", "#6c757d").text("- Heat Loss (Heating Load)");

  const metaText = svg.append("text")
    .attr("x", width / 2).attr("y", height + 85)
    .style("text-anchor", "middle").style("font-size", "10px").style("fill", "#6c757d");

  metaText.append("tspan").attr("x", width / 2).attr("dy", 0)
    .text(`Thickness = ${state.maState.thickness} m | Density = ${state.maState.density} kg/m³ | Specific Heat = ${state.maState.specificHeat} J/kg·K | Conductivity = ${state.maState.conductivity} W/m·K`);

  metaText.append("tspan").attr("x", width / 2).attr("dy", 15)
    .text(`Solar Absorptance = ${state.maState.alpha} | Thermal Emissivity = ${state.maState.eps} | Surface Tilt = ${state.maState.tilt}° | Surface Azimuth = ${state.maState.azimuth}°`);

  if (typeof addExportButton === 'function') {
    const location = epwData.metadata.location || epwData.metadata;
    const formatLocation = typeof formatSimpleLocation === 'function' ? formatSimpleLocation(location.city, location.country, 'primary') : `${location.city}, ${location.country}`;
    addExportButton(selector, 'thermal-mass-heatflux', formatLocation);
    addInfoButton(selector, 'diurnalHeatFlux');
  }
}