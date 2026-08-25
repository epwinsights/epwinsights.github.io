/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import {
  SSP_SCENARIOS,
  TARGET_YEARS,
  loadMorphingDatasets,
  resolveGridCell,
  resolveRegionLabel,
  getMonthlyDeltas,
  getAnnualIndexDeltas,
  morphHourlyTemperature,
  computeMorphingAnalysis,
  exportMorphingDataToCSV
} from '../core/climate-morphing.js';
import { formatSimpleLocation } from '../core/location-formatter.js';
import { addExportButton, addInfoButton } from '../core/svg-exporter.js';
import { CHART_DESIGN_WIDTH } from '../core/chart-defaults.js';
import state from '../state.js';

const PANE = '#climate-morphing-pane';

function darkenColor(hex, amount = 0.1) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.round(((num >> 16) & 0xff) * (1 - amount));
  const g = Math.round(((num >> 8) & 0xff) * (1 - amount));
  const b = Math.round((num & 0xff) * (1 - amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function formatScenarioSubtitle(config) {
  const sspLabel = (SSP_SCENARIOS.find(s => s.id === config.ssp) || {}).label || config.ssp;
  const yearInfo = TARGET_YEARS.find(ty => ty.year === config.targetYear);
  const periodText = yearInfo ? ` (${yearInfo.period} mean)` : '';
  return `${sspLabel} · Target Year ${config.targetYear}${periodText}`;
}

function appendScenarioSubtitle(g, width, config) {
  g.append('text')
    .attr('class', 'chart-scenario-subtitle')
    .attr('x', width / 2)
    .attr('y', -8)
    .attr('text-anchor', 'middle')
    .style('font-size', '12px')
    .style('fill', '#6c757d')
    .text(formatScenarioSubtitle(config));
}

export async function renderClimateMorphingCharts(epwData, chartRefs) {
  const mainArea = d3.select(`${PANE} .main-chart-area`);
  const panel = d3.select(`${PANE} .left-panel`);

  state.climateMorphing = state.climateMorphing || {
    ssp: 'ssp245',
    targetYear: 2050,
    baseTempHeating: 18.0,
    baseTempCooling: 24.0,
    gridCell: null,
    regionLabel: null
  };
  const config = state.climateMorphing;

  mainArea.html(`<div class="text-center text-muted p-5"><div class="spinner-border spinner-border-sm me-2" role="status"></div>Loading IPCC AR6 reference region dataset...</div>`);
  panel.html('');

  let regionsGeoJSON;
  try {
    ({ regionsGeoJSON } = await loadMorphingDatasets());
  } catch (err) {
    mainArea.html(`<div class="alert alert-warning m-4">Unable to load the AR6 reference region dataset (${err.message}). Please check your connection and reopen this tab.</div>`);
    return;
  }

  if (!config.gridCell) {
    config.gridCell = await resolveGridCell(epwData);
  }
  if (!config.gridCell) {
    mainArea.html(`<div class="alert alert-danger m-4">Unable to resolve a nearby CMIP6 land grid cell for this station's coordinates within the maximum search radius. This indicates a data or connectivity problem, not normal station behavior. Please check your network connection and try reopening this tab.</div>`);
    return;
  }

  if (!config.regionLabel) {
    config.regionLabel = resolveRegionLabel(epwData, regionsGeoJSON);
  }

  const triggerUpdate = async () => {
    mainArea.html(`<div class="text-center text-muted p-5"><div class="spinner-border spinner-border-sm me-2" role="status"></div>Loading CMIP6 projection for this scenario...</div>`);

    let monthlyDeltas, annualIndexDeltas;
    try {
      [monthlyDeltas, annualIndexDeltas] = await Promise.all([
        getMonthlyDeltas(config.gridCell, config.ssp, config.targetYear),
        getAnnualIndexDeltas(config.gridCell, config.ssp, config.targetYear)
      ]);
    } catch (err) {
      mainArea.html(`<div class="alert alert-warning m-4">Unable to load the CMIP6 tile data for this scenario (${err.message}). Please check your connection and try again.</div>`);
      return;
    }

    if (!monthlyDeltas) {
      mainArea.html(`<div class="alert alert-warning m-4">No CMIP6 temperature projection data is available for this grid cell under ${config.ssp}/${config.targetYear}.</div>`);
      return;
    }

    const morphedHourly = morphHourlyTemperature(epwData, monthlyDeltas);
    const analysis = computeMorphingAnalysis(epwData, morphedHourly, monthlyDeltas, annualIndexDeltas, config);

    mainArea.html(`
      <div id="climate-morphing-banner"></div>
      <div id="climate-morphing-kpi-cards"></div>
      <div id="climate-morphing-monthly-chart" class="chart-container mb-5 w-100"></div>
      <div id="climate-morphing-duration-chart" class="chart-container mb-5 w-100"></div>
      <div id="climate-morphing-degreeday-chart" class="chart-container mb-5 w-100"></div>
      <div id="climate-morphing-benchmark-section" class="chart-container w-100"></div>
      <div class="d-flex justify-content-between mt-4 pt-3 border-top tab-nav-container">
        <button class="btn btn-outline-secondary btn-sm" onclick="document.getElementById('data-tables-tab').click()">&larr; Previous: Data Tables</button>
        <button class="btn btn-outline-primary btn-sm" onclick="document.getElementById('compare-tab').click()">Next: Compare &rarr;</button>
      </div>
    `);

    renderContextBanner('#climate-morphing-banner', config, analysis);
    renderMorphingKPICards('#climate-morphing-kpi-cards', analysis);
    renderMonthlyTemperatureChart('#climate-morphing-monthly-chart', epwData, config, monthlyDeltas, analysis);
    renderDurationCurveChart('#climate-morphing-duration-chart', epwData, morphedHourly, config);
    renderDegreeDayComparisonChart('#climate-morphing-degreeday-chart', epwData, config, analysis);
    renderBenchmarkComparisonPanel('#climate-morphing-benchmark-section', analysis, epwData, config);
  };

  renderClimateMorphingControls(`${PANE} .left-panel`, epwData, config, triggerUpdate);
  await triggerUpdate();
}

function renderClimateMorphingControls(containerSelector, epwData, config, onUpdate) {
  const panel = d3.select(containerSelector).html('');

  const sspGroup = panel.append('div').attr('class', 'chart-controls-group');
  sspGroup.append('h6').attr('class', 'mb-3').text('Emission Scenario (SSP)');
  const seg = sspGroup.append('div').attr('class', 'custom-segmented-control');
  SSP_SCENARIOS.forEach(s => {
    seg.append('input')
      .attr('type', 'radio').attr('class', 'segmented-control-input')
      .attr('name', 'morphing-ssp').attr('id', `morph-ssp-${s.id}`)
      .property('checked', config.ssp === s.id)
      .on('change', () => { config.ssp = s.id; onUpdate(); });
    seg.append('label')
      .attr('class', 'segmented-control-label').attr('for', `morph-ssp-${s.id}`)
      .attr('data-bs-toggle', 'tooltip').attr('data-bs-placement', 'top')
      .attr('title', s.description)
      .text(s.label);
  });

  setTimeout(() => {
    seg.selectAll('[data-bs-toggle="tooltip"]').each(function () {
      if (window.bootstrap) new window.bootstrap.Tooltip(this);
    });
  }, 0);

  const yearGroup = panel.append('div').attr('class', 'chart-controls-group mt-4');
  yearGroup.append('h6').attr('class', 'mb-3').text('Target Year');
  const yearSeg = yearGroup.append('div').attr('class', 'custom-segmented-control');
  TARGET_YEARS.forEach(ty => {
    yearSeg.append('input')
      .attr('type', 'radio').attr('class', 'segmented-control-input')
      .attr('name', 'morphing-year').attr('id', `morph-year-${ty.year}`)
      .property('checked', config.targetYear === ty.year)
      .on('change', () => { config.targetYear = ty.year; onUpdate(); });
    yearSeg.append('label')
      .attr('class', 'segmented-control-label').attr('for', `morph-year-${ty.year}`)
      .attr('data-bs-toggle', 'tooltip').attr('data-bs-placement', 'top')
      .attr('title', `${ty.tag}: mean of ${ty.period}`)
      .text(ty.year);
  });

  yearGroup.append('div')
    .attr('class', 'text-muted mt-2')
    .style('font-size', '10.5px')
    .text('Each period is its own 20-year CMIP6 ensemble climatology, not interpolated.');

  setTimeout(() => {
    yearSeg.selectAll('[data-bs-toggle="tooltip"]').each(function () {
      if (window.bootstrap) new window.bootstrap.Tooltip(this);
    });
  }, 0);

  const regionGroup = panel.append('div').attr('class', 'chart-controls-group mt-4');
  regionGroup.append('h6').attr('class', 'mb-2').text('Resolved Grid Cell');
  regionGroup.append('p').attr('class', 'text-muted mb-2').style('font-size', '11px')
    .text('All deltas below come from the nearest 1°×1° CMIP6 land grid cell to the EPW station\'s coordinates. The IPCC AR6 region name is shown only as a descriptive label and is never used in the calculation.');

  const cellBox = regionGroup.append('div')
    .style('font-size', '12.5px').style('background-color', '#eaf6ec')
    .style('border', '1px solid #cdead1')
    .style('border-radius', '6px').style('padding', '0.5rem 0.75rem');
  cellBox.append('div').html(`<strong>${config.gridCell.lat.toFixed(2)}°, ${config.gridCell.lon.toFixed(2)}°</strong> (${config.gridCell.distanceKm.toFixed(0)} km from station)`);
  cellBox.append('div').style('color', '#6c757d').style('font-size', '10.5px').style('margin-top', '4px')
    .html(`IPCC AR6 region (label only): <strong>${config.regionLabel.name}</strong> (${config.regionLabel.acronym})`);
  if (config.regionLabel.isFallback) {
    cellBox.append('div').style('color', '#adb5bd').style('font-size', '10.5px')
      .text('Nearest-region fallback applied for the AR6 label (site fell near a region boundary).');
  }

  const thermalGroup = panel.append('div').attr('class', 'chart-controls-group mt-4');
  thermalGroup.append('h6').text('Degree-Day Base Temperatures');

  const hbb = thermalGroup.append('div').attr('class', 'control-item my-2');
  hbb.append('label').attr('class', 'small d-block text-muted').text('Heating Base Temp (°C):');
  hbb.append('input').attr('type', 'number').attr('class', 'form-control form-control-sm').attr('step', '0.1')
    .property('value', config.baseTempHeating)
    .on('input', function () { config.baseTempHeating = +this.value; onUpdate(); });

  const cbb = thermalGroup.append('div').attr('class', 'control-item my-2');
  cbb.append('label').attr('class', 'small d-block text-muted').text('Cooling Base Temp (°C):');
  cbb.append('input').attr('type', 'number').attr('class', 'form-control form-control-sm').attr('step', '0.1')
    .property('value', config.baseTempCooling)
    .on('input', function () { config.baseTempCooling = +this.value; onUpdate(); });

  const exportGroup = panel.append('div').attr('class', 'chart-controls-group mt-4');
  exportGroup.append('h6').text('Export');
  exportGroup.append('p').attr('class', 'text-muted mb-2').style('font-size', '11px')
    .text('Exports the full annual 8760-hour baseline vs. morphed dry-bulb temperature series.');
  exportGroup.append('button').attr('class', 'btn btn-outline-primary btn-sm w-100')
    .text('Export Morphed Data (CSV)')
    .on('click', async () => {
      const monthlyDeltas = await getMonthlyDeltas(config.gridCell, config.ssp, config.targetYear);
      if (!monthlyDeltas) return;
      const morphedHourly = morphHourlyTemperature(epwData, monthlyDeltas);
      exportMorphingDataToCSV(epwData, morphedHourly, config.regionLabel, config.ssp, config.targetYear);
    });

  const ackGroup = panel.append('div').attr('class', 'chart-controls-group mt-4');
  const headerRow = ackGroup.append('div')
    .attr('class', 'd-flex justify-content-between align-items-baseline mb-2')
    .style('cursor', 'pointer')
    .attr('data-bs-toggle', 'collapse')
    .attr('data-bs-target', '#morphing-scientific-basis');

  headerRow.append('h6').attr('class', 'mb-0').text('Scientific Basis & Assumptions');
  const toggleText = headerRow.append('span')
    .attr('class', 'text-primary')
    .style('font-size', '10px').style('font-weight', '600').style('user-select', 'none')
    .html('Read more ▼');

  const collapseContainer = ackGroup.append('div')
    .attr('id', 'morphing-scientific-basis')
    .attr('class', 'collapse');

  const infoNote = collapseContainer.append('ul').attr('class', 'info-note mb-0').style('font-size', '11px').style('padding-left', '15px');
  infoNote.html(`
        <li class="mb-2"><strong>Morphing Method:</strong> Shift + Stretch (CIBSE-style). The daily mean dry-bulb temperature is shifted by the CMIP6 ensemble-mean monthly Δtas, and the diurnal anomaly (each hour's departure from its own day's mean) is additionally scaled by the change in diurnal temperature range implied by (Δtasmax − Δtasmin). This is more defensible than shift-only for DTR-sensitive downstream metrics such as UTCI/SET/MRT.</li>
        <li class="mb-2"><strong>Climate Data Source:</strong> Copernicus Interactive Climate Atlas gridded CMIP6 dataset (no bias adjustment), DOI <code>10.1038/s41597-022-01739-y</code>, 1°×1° global grid, monthly frequency, per-model-ensemble-member.</li>
        <li class="mb-2"><strong>Land Mask:</strong> ATLAS reference-grids WFDE5/ERA5-derived land-sea mask (≥0.5 land fraction), ~24,257 land cells worldwide. Not the AR6 region polygons, which are used only as the descriptive label shown in the sidebar.</li>
        <li class="mb-2"><strong>Baseline Period:</strong> 1995-2014 (CMIP6/AR6 standard "recent past" reference), which does not necessarily match the exact year(s) recorded in the uploaded EPW/TMY file.</li>
        <li class="mb-2"><strong>Target Years:</strong> Each of 2030, 2050, and 2080 is its own independently-computed 20-year CMIP6 ensemble climatology (2021-2040 / 2041-2060 / 2081-2100 respectively); no interpolation between years or scenarios is performed.</li>
        <li class="mb-2"><strong>Spatial Resolution:</strong> Nearest 1°×1° CMIP6 land grid cell to the station's coordinates, roughly 100×100 km at the equator and narrowing toward the poles. Site-specific, not region-averaged.</li>
        <li class="mb-2"><strong>Variable Scope:</strong> Only dry-bulb temperature is morphed. Humidity, radiation, wind, and other EPW fields remain unchanged, which becomes physically inconsistent with the shifted temperature at larger deltas.</li>
        <li class="mb-2"><strong>Benchmark Comparison:</strong> The panel below cross-checks the EPW-derived frost-day and tropical-night deltas, and cooling/heating degree-days (order-of-magnitude only, since the official indices use their own fixed base temperature), against the official CMIP6 index deltas for this grid cell. This serves as an independent sanity check on the morphed output.</li>
        <li class="mb-2"><strong>Intended Use:</strong> An in-browser, exploratory view of site-specific CMIP6 warming signals, not a simulation-ready morphed EPW file. For energy-simulation-grade morphing, see CCWorldWeatherGen, epwshiftr, or FutureWeather.co.</li>
        <li class="mb-2"><strong>Uncertainty Band:</strong> The shaded band on the monthly temperature chart reflects the inter-ensemble-member standard deviation of Δtas for this grid cell, not a formal statistical confidence interval.</li>
    `);

  setTimeout(() => {
    const collapseEl = document.getElementById('morphing-scientific-basis');
    if (collapseEl) {
      collapseEl.addEventListener('show.bs.collapse', () => toggleText.html('Show less ▲'));
      collapseEl.addEventListener('hide.bs.collapse', () => toggleText.html('Read more ▼'));
    }
  }, 0);
}

function renderContextBanner(selector, config, analysis) {
  const container = d3.select(selector).html('');
  const sspLabel = (SSP_SCENARIOS.find(s => s.id === config.ssp) || {}).label || config.ssp;
  const yearInfo = TARGET_YEARS.find(ty => ty.year === config.targetYear);
  const deltaT = analysis.kpi.annualDeltaT;
  const cell = config.gridCell;

  container.attr('class', 'mb-4')
    .style('background-color', '#eef5ff')
    .style('border', '1px solid #cfe2ff')
    .style('border-radius', '8px')
    .style('padding', '0.85rem 1.1rem')
    .style('font-size', '13px')
    .style('color', '#1b3a63')
    .html(`
      <i class="bi bi-info-circle-fill me-2"></i>
      Showing projected changes for the nearest CMIP6 land grid cell (<strong>${cell.lat.toFixed(2)}°, ${cell.lon.toFixed(2)}°</strong>, ${cell.distanceKm.toFixed(0)} km from station; IPCC AR6 region <strong>${config.regionLabel.name} (${config.regionLabel.acronym})</strong>), scenario <strong>${sspLabel}</strong>, target year <strong>${config.targetYear}</strong> (${yearInfo ? yearInfo.period : ''} mean).
      Projected annual mean change: <strong>${deltaT >= 0 ? '+' : ''}${deltaT.toFixed(1)} °C</strong>.
    `);
}

function renderMorphingKPICards(selector, analysis) {
  const container = d3.select(selector).html('');
  container.style('background-color', '#f8f9fa').style('padding', '1rem').style('border-radius', '8px').style('margin-bottom', '1.5rem');

  const grid = container.append('div')
    .style('display', 'flex').style('gap', '10px').style('flex-wrap', 'wrap').style('justify-content', 'center');

  const k = analysis.kpi;

  const cards = [
    { title: 'Annual ΔT (Mean)', value: `${k.annualDeltaT >= 0 ? '+' : ''}${k.annualDeltaT.toFixed(1)} °C`, text: 'Ensemble mean, all months', color: '#e6550d' },
    { title: 'Summer Days (>25°C)', value: `${k.summerDaysDelta >= 0 ? '+' : ''}${k.summerDaysDelta} days/yr`, text: `${k.summerDaysBaseline} → ${k.summerDaysMorphed} days`, color: '#fc8d59' },
    { title: 'Annual Cooling Demand', value: `${k.deltaCDD >= 0 ? '+' : ''}${k.deltaCDD.toFixed(0)} CDD`, text: `${k.annualCDDBaseline.toFixed(0)} → ${k.annualCDDMorphed.toFixed(0)}`, color: '#d53e4f' },
    { title: 'Annual Heating Demand', value: `${k.deltaHDD >= 0 ? '+' : ''}${k.deltaHDD.toFixed(0)} HDD`, text: `${k.annualHDDBaseline.toFixed(0)} → ${k.annualHDDMorphed.toFixed(0)}`, color: '#5e4fa2' }
  ];

  cards.forEach(c => {
    const box = grid.append('div')
      .style('background-color', '#fff').style('flex', '1 1 0').style('min-width', '150px')
      .style('padding', '0.75rem').style('border-radius', '6px').style('border-left', `4px solid ${c.color}`)
      .style('box-shadow', '0 1px 3px rgba(0,0,0,0.05)')
      .style('transition', 'transform 0.8s ease-out, box-shadow 0.8s ease-out');

    box.on('mouseover', function () { d3.select(this).style('transform', 'translateY(-4px)').style('box-shadow', '0 4px 12px rgba(0,0,0,0.1)'); })
      .on('mouseout', function () { d3.select(this).style('transform', 'translateY(0)').style('box-shadow', '0 1px 3px rgba(0,0,0,0.05)'); });

    box.append('div').style('color', '#6c757d').style('font-size', '10.5px').style('font-weight', '500').style('white-space', 'nowrap').text(c.title);
    box.append('div').style('font-size', '16px').style('font-weight', 'bold').style('margin', '4px 0').text(c.value);
    box.append('div').style('color', '#adb5bd').style('font-size', '9.5px').text(c.text);
  });
}

function renderMonthlyTemperatureChart(selector, epwData, config, monthlyDeltas, analysis) {
  const container = d3.select(selector).html('');
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, 'climate-morphing-monthly-temperature', formattedLocation);
  addInfoButton(selector, 'monthlyMorphingComparison');

  container.append('h5')
    .text('Monthly Mean Temperature: Baseline vs. Projected')
    .attr('class', 'chart-title-main')
    .style('text-align', 'center').style('margin-bottom', '1.5rem').style('margin-top', '1.5rem');

  const margin = { top: 34, right: 30, bottom: 60, left: 55 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 260;

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .style('width', '100%').style('height', 'auto')
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  appendScenarioSubtitle(svg, width, config);

  const months = d3.range(12);
  const x = d3.scalePoint().domain(months).range([0, width]).padding(0.5);

  const tasStd = monthlyDeltas.tas.std;
  const upperBand = months.map(i => analysis.morphedMonthlyMeans[i] + tasStd[i]);
  const lowerBand = months.map(i => analysis.morphedMonthlyMeans[i] - tasStd[i]);
  const allVals = [...analysis.baselineMonthlyMeans, ...upperBand, ...lowerBand];
  const y = d3.scaleLinear().domain([d3.min(allVals) - 2, d3.max(allVals) + 2]).range([height, 0]);

  svg.append('g').attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).tickFormat(i => d3.timeFormat('%b')(new Date(2000, i, 1))))
    .selectAll('text').style('font-size', '9px').style('fill', '#212529');
  svg.append('g').call(d3.axisLeft(y).ticks(6)).selectAll('text').style('font-size', '9px').style('fill', '#212529');

  svg.append('text').attr('transform', 'rotate(-90)').attr('x', -(height / 2)).attr('y', -(margin.left - 16))
    .style('text-anchor', 'middle').style('font-size', '10px').style('fill', '#212529').text('Temperature (°C)');

  const bandArea = d3.area()
    .x((d, i) => x(i))
    .y0((d, i) => y(lowerBand[i]))
    .y1((d, i) => y(upperBand[i]));
  svg.append('path').datum(months).attr('fill', '#d73027').attr('opacity', 0.12).attr('d', bandArea);

  const lineGen = valueAt => d3.line().x((d, i) => x(i)).y((d, i) => y(valueAt(i)))(months);

  svg.append('path').attr('fill', 'none').attr('stroke', '#4575b4').attr('stroke-width', 2)
    .attr('d', lineGen(i => analysis.baselineMonthlyMeans[i]));
  svg.append('path').attr('fill', 'none').attr('stroke', '#d73027').attr('stroke-width', 2)
    .attr('d', lineGen(i => analysis.morphedMonthlyMeans[i]));

  const tooltip = d3.select('body').selectAll('.tooltip').data([null]).join('div').attr('class', 'tooltip');

  months.forEach(i => {
    svg.append('circle').attr('cx', x(i)).attr('cy', y(analysis.baselineMonthlyMeans[i])).attr('r', 3).attr('fill', '#4575b4')
      .style('cursor', 'pointer')
      .on('mouseover', (event) => {
        tooltip.style('opacity', 1)
          .html(`
            <strong>${d3.timeFormat('%B')(new Date(2000, i, 1))}</strong><br>
            <span style="font-size:11px;">Baseline: <b>${analysis.baselineMonthlyMeans[i].toFixed(1)} °C</b></span>
          `)
          .style('top', `${event.pageY - 12}px`).style('left', `${event.pageX + 12}px`);
      })
      .on('mousemove', (event) => {
        tooltip.style('top', `${event.pageY - 12}px`).style('left', `${event.pageX + 12}px`);
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    svg.append('circle').attr('cx', x(i)).attr('cy', y(analysis.morphedMonthlyMeans[i])).attr('r', 3).attr('fill', '#d73027')
      .style('cursor', 'pointer')
      .on('mouseover', (event) => {
        tooltip.style('opacity', 1)
          .html(`
            <strong>${d3.timeFormat('%B')(new Date(2000, i, 1))}</strong><br>
            <span style="font-size:11px;">Projected: <b>${analysis.morphedMonthlyMeans[i].toFixed(1)} °C</b></span><br>
            <span style="font-size:10.5px; color:#6c757d;">±${tasStd[i].toFixed(1)} °C inter-ensemble-member spread</span>
          `)
          .style('top', `${event.pageY - 12}px`).style('left', `${event.pageX + 12}px`);
      })
      .on('mousemove', (event) => {
        tooltip.style('top', `${event.pageY - 12}px`).style('left', `${event.pageX + 12}px`);
      })
      .on('mouseout', () => tooltip.style('opacity', 0));
  });

  const legend = svg.append('g').attr('transform', `translate(${width / 2 - 140}, ${height + 40})`);
  [{ label: 'Baseline (recorded)', color: '#4575b4' }, { label: `Projected (${config.targetYear})`, color: '#d73027' }].forEach((item, i) => {
    legend.append('rect').attr('x', i * 170).attr('y', -9).attr('width', 12).attr('height', 12).attr('fill', item.color);
    legend.append('text').attr('x', i * 170 + 16).attr('y', 1).style('font-size', '12px').style('fill', '#212529').text(item.label);
  });
}

function renderDurationCurveChart(selector, epwData, morphedHourly, config) {
  const container = d3.select(selector).html('');
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, 'climate-morphing-duration-curve', formattedLocation);
  addInfoButton(selector, 'temperatureDurationMorphing');

  container.append('h5')
    .text('Annual Temperature Duration Curve: Baseline vs. Projected')
    .attr('class', 'chart-title-main')
    .style('text-align', 'center').style('margin-bottom', '1.5rem').style('margin-top', '1.5rem');

  const baseSorted = epwData.data.map(h => h.dryBulbTemperature).sort((a, b) => b - a);
  const morphSorted = morphedHourly.map(h => h.dryBulbTemperature).sort((a, b) => b - a);

  const margin = { top: 34, right: 30, bottom: 65, left: 55 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 220;

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .style('width', '100%').style('height', 'auto')
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  appendScenarioSubtitle(svg, width, config);

  const x = d3.scaleLinear().domain([0, Math.max(baseSorted.length, morphSorted.length)]).range([0, width]);
  const y = d3.scaleLinear().domain([d3.min([...baseSorted, ...morphSorted]) - 2, d3.max([...baseSorted, ...morphSorted]) + 2]).range([height, 0]);

  svg.append('g').attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(8)).selectAll('text').style('font-size', '9px').style('fill', '#212529');
  svg.append('g').call(d3.axisLeft(y).ticks(6)).selectAll('text').style('font-size', '9px').style('fill', '#212529');

  svg.append('text').attr('x', width / 2).attr('y', height + 35)
    .style('text-anchor', 'middle').style('font-size', '10px').style('fill', '#212529').text('Hours Exceeded');
  svg.append('text').attr('transform', 'rotate(-90)').attr('x', -(height / 2)).attr('y', -(margin.left - 16))
    .style('text-anchor', 'middle').style('font-size', '10px').style('fill', '#212529').text('Temperature (°C)');

  const lineGen = arr => d3.line().x((d, i) => x(i)).y(d => y(d))(arr);

  svg.append('path').attr('fill', 'none').attr('stroke', '#4575b4').attr('stroke-width', 1.5).attr('d', lineGen(baseSorted));
  svg.append('path').attr('fill', 'none').attr('stroke', '#d73027').attr('stroke-width', 1.5).attr('d', lineGen(morphSorted));

  const tooltip = d3.select('body').selectAll('.tooltip').data([null]).join('div').attr('class', 'tooltip');
  const hoverLine = svg.append('line').attr('y1', 0).attr('y2', height)
    .attr('stroke', '#495057').attr('stroke-width', 1).attr('stroke-dasharray', '3,3').style('opacity', 0);

  svg.append('rect').attr('width', width).attr('height', height).attr('fill', 'none').attr('pointer-events', 'all')
    .on('mouseover', () => { tooltip.style('opacity', 1); hoverLine.style('opacity', 1); })
    .on('mousemove', function (event) {
      const mouseX = d3.pointer(event, this)[0];
      let idx = Math.round(x.invert(mouseX));
      idx = Math.max(0, Math.min(baseSorted.length - 1, idx));
      hoverLine.attr('x1', x(idx)).attr('x2', x(idx));
      tooltip.style('opacity', 1)
        .html(`
          <strong>Duration: ${idx + 1} hours</strong><br>
          <span style="font-size:11px;">Baseline: <b>${baseSorted[idx].toFixed(1)} °C</b></span><br>
          <span style="font-size:11px;">Projected: <b>${morphSorted[idx].toFixed(1)} °C</b></span>
        `)
        .style('top', `${event.pageY - 12}px`).style('left', `${event.pageX + 12}px`);
    })
    .on('mouseout', () => { tooltip.style('opacity', 0); hoverLine.style('opacity', 0); });

  const legend = svg.append('g').attr('transform', `translate(${width / 2 - 140}, ${height + 55})`);
  [{ label: 'Baseline (recorded)', color: '#4575b4' }, { label: `Projected (${config.targetYear})`, color: '#d73027' }].forEach((item, i) => {
    legend.append('rect').attr('x', i * 170).attr('y', -9).attr('width', 12).attr('height', 12).attr('fill', item.color);
    legend.append('text').attr('x', i * 170 + 16).attr('y', 1).style('font-size', '12px').style('fill', '#212529').text(item.label);
  });
}

function renderDegreeDayComparisonChart(selector, epwData, config, analysis) {
  const container = d3.select(selector).html('');
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, 'climate-morphing-degree-days', formattedLocation);
  addInfoButton(selector, 'hddCddMorphingComparison');

  container.append('h5')
    .text('Monthly Heating & Cooling Degree-Days: Baseline vs. Projected')
    .attr('class', 'chart-title-main')
    .style('text-align', 'center').style('margin-bottom', '1.5rem').style('margin-top', '1.5rem');

  const margin = { top: 34, right: 30, bottom: 60, left: 55 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 240;

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .style('width', '100%').style('height', 'auto')
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  appendScenarioSubtitle(svg, width, config);

  const months = d3.range(12);
  const x0 = d3.scaleBand().domain(months).range([0, width]).padding(0.25);
  const seriesKeys = ['cddBase', 'cddMorph', 'hddBase', 'hddMorph'];
  const x1 = d3.scaleBand().domain(seriesKeys).range([0, x0.bandwidth()]).padding(0.08);

  const seriesData = {
    cddBase: analysis.monthlyCddBaseline,
    cddMorph: analysis.monthlyCddMorphed,
    hddBase: analysis.monthlyHddBaseline,
    hddMorph: analysis.monthlyHddMorphed
  };
  const seriesColors = { cddBase: '#fdae61', cddMorph: '#d53e4f', hddBase: '#9ecae1', hddMorph: '#5e4fa2' };
  const seriesOpacity = { cddBase: 0.55, cddMorph: 1, hddBase: 0.55, hddMorph: 1 };
  const tooltipLabels = { cddBase: 'CDD Baseline', cddMorph: 'CDD Projected', hddBase: 'HDD Baseline', hddMorph: 'HDD Projected' };

  const maxVal = d3.max(seriesKeys.flatMap(k => seriesData[k])) || 1;
  const y = d3.scaleLinear().domain([0, maxVal * 1.1]).range([height, 0]);

  svg.append('g').attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x0).tickFormat(i => d3.timeFormat('%b')(new Date(2000, i, 1))))
    .call(g => g.select('.domain').attr('stroke', '#495057'))
    .call(g => g.selectAll('.tick line').attr('stroke', '#495057'))
    .selectAll('text').style('font-size', '9px').style('fill', '#212529');
  
  svg.append('g')
    .call(d3.axisLeft(y).ticks(6))
    .call(g => g.select('.domain').attr('stroke', '#495057'))
    .call(g => g.selectAll('.tick line').attr('stroke', '#495057'))
    .selectAll('text').style('font-size', '9px').style('fill', '#212529');
    
  svg.append('text').attr('transform', 'rotate(-90)').attr('x', -(height / 2)).attr('y', -(margin.left - 16))
    .style('text-anchor', 'middle').style('font-size', '10px').style('fill', '#212529').text('Degree-Days');

  const tooltip = d3.select('body').selectAll('.tooltip').data([null]).join('div').attr('class', 'tooltip');

  months.forEach(m => {
    seriesKeys.forEach(key => {
      const val = seriesData[key][m];
      const color = seriesColors[key];
      
      svg.append('rect')
        .attr('x', x0(m) + x1(key)).attr('width', x1.bandwidth())
        .attr('y', y(val)).attr('height', height - y(val))
        .attr('fill', color).attr('opacity', seriesOpacity[key])
        .style('cursor', 'pointer')
        .on('mouseover', function(event) {
          d3.select(this).attr('fill', darkenColor(color, 0.1));
          tooltip.style('opacity', 1)
            .html(`
              <strong>${d3.timeFormat('%B')(new Date(2000, m, 1))}</strong><br>
              <span style="font-size:11px;">${tooltipLabels[key]}: <b>${val.toFixed(1)}</b></span>
            `)
            .style('top', `${event.pageY - 12}px`).style('left', `${event.pageX + 12}px`);
        })
        .on('mousemove', (event) => {
          tooltip.style('top', `${event.pageY - 12}px`).style('left', `${event.pageX + 12}px`);
        })
        .on('mouseout', function() {
          d3.select(this).attr('fill', color);
          tooltip.style('opacity', 0);
        });
    });
  });

  const legendItems = [
    { label: 'CDD Baseline', color: seriesColors.cddBase, opacity: seriesOpacity.cddBase },
    { label: 'CDD Projected', color: seriesColors.cddMorph, opacity: seriesOpacity.cddMorph },
    { label: 'HDD Baseline', color: seriesColors.hddBase, opacity: seriesOpacity.hddBase },
    { label: 'HDD Projected', color: seriesColors.hddMorph, opacity: seriesOpacity.hddMorph }
  ];
  const legend = svg.append('g').attr('transform', `translate(${width / 2 - 250}, ${height + 40})`);
  legendItems.forEach((item, i) => {
    legend.append('rect').attr('x', i * 130).attr('y', -9).attr('width', 12).attr('height', 12).attr('fill', item.color).attr('opacity', item.opacity);
    legend.append('text').attr('x', i * 130 + 16).attr('y', 1).style('font-size', '11.5px').style('fill', '#212529').text(item.label);
  });
}

/**
 * Renders the independent benchmark comparison introduced by
 * computeMorphingAnalysis()'s `benchmark` object: a dumbbell (paired-dot)
 * chart of EPW-derived vs. official CMIP6 index deltas for the four indices
 * that have a genuine EPW-side equivalent, followed by a full reference
 * table (including the four CMIP6-only indices with no EPW-side match).
 *
 * Design intent: this section is a *sanity check*, not an error report.
 * Some spread between the EPW-derived and official CMIP6 deltas is expected
 * (see the caption below) and must not read as "something is wrong":
 * hence same-weight, non-alarming colors for both series (no red/green),
 * and a thin, low-opacity connecting line rather than a bold "gap"/diff
 * highlight.
 */
function renderBenchmarkComparisonPanel(selector, analysis, epwData, config) {
  const container = d3.select(selector).html('');
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, 'climate-morphing-benchmark', formattedLocation);
  addInfoButton(selector, 'cmip6BenchmarkComparison');

  container.append('h5')
    .text('Independent Benchmark: EPW-Derived vs. Official CMIP6 Indices')
    .attr('class', 'chart-title-main')
    .style('text-align', 'center').style('margin-bottom', '0.5rem').style('margin-top', '1.5rem');

  const b = analysis.benchmark;
  if (!b) {
    container.append('div').attr('class', 'alert alert-secondary mx-auto mt-3')
      .style('max-width', '640px').style('font-size', '12px')
      .text('No CMIP6 index data was available for this grid cell/scenario, so no benchmark comparison could be computed.');
    return;
  }

  const introBox = container.append('div')
    .attr('class', 'mx-auto mb-4')
    .style('max-width', '75%')
    .style('background-color', '#f8f9fa')
    .style('border', '1px solid #e9ecef')
    .style('border-radius', '8px')
    .style('padding', '0.75rem 1rem');

  introBox.append('p')
    .attr('class', 'mb-2')
    .style('font-size', '11px').style('color', '#495057')
    .text('Cross-checks the morphed EPW\'s derived index deltas against the official CMIP6 index deltas for the same grid cell, as an independent sanity check on the Shift+Stretch output.');

  introBox.append('div')
    .style('font-size', '10.5px').style('font-weight', '600').style('color', '#495057')
    .html('<i class="bi bi-exclamation-circle me-1"></i>Some spread between the two is expected and is not a sign of a calculation error:');

  const caveatList = introBox.append('ul')
    .style('font-size', '10.5px').style('color', '#6c757d')
    .style('margin', '0.35rem 0 0').style('padding-left', '1.2rem');

  caveatList.append('li').attr('class', 'mb-1')
    .text('EPW-derived values come from a single parametric transform (mean shift + diurnal-range stretch) applied to one synthetic/typical year.');
  caveatList.append('li').attr('class', 'mb-1')
    .text('CMIP6 values are computed natively from the full daily-resolution model ensemble, including changes in day-to-day variability that a mean-based morph cannot fully reproduce.');
  caveatList.append('li')
    .text('Threshold-crossing counts (frost/tropical nights) are naturally more sensitive to this than the degree-day comparisons.');

  const EPW_COLOR = '#4575b4';
  const CMIP6_COLOR = '#8c6bae';

  const chartRows = [
    { label: 'Frost Days', sub: 'Tmin < 0°C', unit: 'days/yr', epw: b.frostDays.epwDelta, cmip6: b.frostDays.cmip6Delta },
    { label: 'Tropical Nights', sub: 'Tmin ≥ 20°C', unit: 'days/yr', epw: b.tropicalNights.epwDelta, cmip6: b.tropicalNights.cmip6Delta },
    { label: 'Cooling Degree-Days', sub: `base ${config.baseTempCooling}°C`, unit: 'CDD', epw: b.coolingDegreeDays.epwDelta, cmip6: b.coolingDegreeDays.cmip6Delta },
    { label: 'Heating Degree-Days', sub: `base ${config.baseTempHeating}°C`, unit: 'HDD', epw: b.heatingDegreeDays.epwDelta, cmip6: b.heatingDegreeDays.cmip6Delta }
  ].filter(r => r.cmip6 !== null);

  if (chartRows.length > 0) {
    const chartWrap = container.append('div').attr('class', 'mx-auto mb-4').style('max-width', '820px');

    const margin = { top: 24, right: 40, bottom: 50, left: 150 };
    const rowHeight = 62;
    const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
    const plotHeight = chartRows.length * rowHeight;

    const outerSvg = chartWrap.append('svg')
      .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${plotHeight + margin.top + margin.bottom}`)
      .style('width', '100%').style('height', 'auto');

    outerSvg.append('rect')
      .attr('x', 1).attr('y', 1)
      .attr('width', width + margin.left + margin.right - 2)
      .attr('height', plotHeight + margin.top + 14)
      .attr('rx', 8).attr('fill', '#f8f9fa');

    const svg = outerSvg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    appendScenarioSubtitle(svg, width, config);
    const tooltip = d3.select('body').selectAll('.tooltip').data([null]).join('div').attr('class', 'tooltip');

    chartRows.forEach((r, i) => {
      const rowY = i * rowHeight + rowHeight / 2;
      const maxAbs = Math.max(Math.abs(r.epw), Math.abs(r.cmip6)) * 1.4 || 1;
      const x = d3.scaleLinear().domain([-maxAbs, maxAbs]).range([0, width]);

      const row = svg.append('g').attr('transform', `translate(0, ${rowY})`);

      row.append('text').attr('x', -margin.left + 4).attr('y', -6)
        .style('font-size', '11.5px').style('font-weight', '600').style('fill', '#212529')
        .text(r.label);
      row.append('text').attr('x', -margin.left + 4).attr('y', 9)
        .style('font-size', '9.5px').style('fill', '#adb5bd')
        .text(r.sub);

      row.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', -20).attr('y2', 22)
        .attr('stroke', '#e9ecef').attr('stroke-width', 1);

      row.append('line').attr('x1', x(r.epw)).attr('x2', x(r.cmip6)).attr('y1', 0).attr('y2', 0)
        .attr('stroke', '#ced4da').attr('stroke-width', 1.5);

      row.append('circle').attr('cx', x(r.epw)).attr('cy', 0).attr('r', 5.5).attr('fill', EPW_COLOR)
        .style('cursor', 'pointer')
        .on('mouseover', function (event) {
          d3.select(this).attr('fill', darkenColor(EPW_COLOR));
          tooltip.style('opacity', 1)
            .html(`
              <strong>${r.label}</strong><br>
              <span style="font-size:11px;">EPW-derived: <b>${r.epw >= 0 ? '+' : ''}${r.epw.toFixed(1)} ${r.unit}</b></span>
            `)
            .style('top', `${event.pageY - 12}px`).style('left', `${event.pageX + 12}px`);
        })
        .on('mousemove', (event) => {
          tooltip.style('top', `${event.pageY - 12}px`).style('left', `${event.pageX + 12}px`);
        })
        .on('mouseout', function () {
          d3.select(this).attr('fill', EPW_COLOR);
          tooltip.style('opacity', 0);
        });
      row.append('circle').attr('cx', x(r.cmip6)).attr('cy', 0).attr('r', 5.5).attr('fill', CMIP6_COLOR)
        .style('cursor', 'pointer')
        .on('mouseover', function (event) {
          d3.select(this).attr('fill', darkenColor(CMIP6_COLOR));
          tooltip.style('opacity', 1)
            .html(`
              <strong>${r.label}</strong><br>
              <span style="font-size:11px;">Official CMIP6: <b>${r.cmip6 >= 0 ? '+' : ''}${r.cmip6.toFixed(1)} ${r.unit}</b></span>
            `)
            .style('top', `${event.pageY - 12}px`).style('left', `${event.pageX + 12}px`);
        })
        .on('mousemove', (event) => {
          tooltip.style('top', `${event.pageY - 12}px`).style('left', `${event.pageX + 12}px`);
        })
        .on('mouseout', function () {
          d3.select(this).attr('fill', CMIP6_COLOR);
          tooltip.style('opacity', 0);
        });

      row.append('text').attr('x', x(r.epw)).attr('y', -13).attr('text-anchor', 'middle')
        .style('font-size', '10.5px').style('font-weight', '600').style('fill', EPW_COLOR)
        .text(`${r.epw >= 0 ? '+' : ''}${r.epw.toFixed(1)}`);
      row.append('text').attr('x', x(r.cmip6)).attr('y', 25).attr('text-anchor', 'middle')
        .style('font-size', '10.5px').style('font-weight', '600').style('fill', CMIP6_COLOR)
        .text(`${r.cmip6 >= 0 ? '+' : ''}${r.cmip6.toFixed(1)}`);
    });

    const legend = svg.append('g').attr('transform', `translate(0, ${plotHeight + 34})`);
    [{ label: 'EPW-derived Δ', color: EPW_COLOR }, { label: 'Official CMIP6 index Δ', color: CMIP6_COLOR }].forEach((item, i) => {
      const g = legend.append('g').attr('transform', `translate(${width / 2 - 150 + i * 200}, 0)`);
      g.append('circle').attr('cx', 0).attr('cy', -3).attr('r', 5).attr('fill', item.color);
      g.append('text').attr('x', 10).attr('y', 1).style('font-size', '11px').style('fill', '#212529').text(item.label);
    });
  }

  const tableRows = [
    { label: 'Frost Days (Tmin < 0°C)', epw: b.frostDays.epwDelta, cmip6: b.frostDays.cmip6Delta, unit: 'days/yr', note: 'Directly comparable' },
    { label: 'Tropical Nights (Tmin ≥ 20°C)', epw: b.tropicalNights.epwDelta, cmip6: b.tropicalNights.cmip6Delta, unit: 'days/yr', note: 'Directly comparable' },
    { label: 'Cooling Degree-Days', epw: b.coolingDegreeDays.epwDelta, cmip6: b.coolingDegreeDays.cmip6Delta, unit: 'CDD', note: `Order-of-magnitude only; the official index uses a fixed base of 22°C, not the ${config.baseTempCooling}°C set here` },
    { label: 'Heating Degree-Days', epw: b.heatingDegreeDays.epwDelta, cmip6: b.heatingDegreeDays.cmip6Delta, unit: 'HDD', note: `Order-of-magnitude only; the official index uses a fixed base of 15.5°C, not the ${config.baseTempHeating}°C set here` }
  ];

  const referenceRows = [
    { label: 'TX35 Days (Tmax > 35°C)', value: b.cmip6Only.tx35, unit: 'days/yr' },
    { label: 'TX40 Days (Tmax > 40°C)', value: b.cmip6Only.tx40, unit: 'days/yr' },
    { label: 'TXx (annual max of monthly Tmax)', value: b.cmip6Only.txx, unit: '°C' },
    { label: 'TNn (annual min of monthly Tmin)', value: b.cmip6Only.tnn, unit: '°C' }
  ];

  const table = container.append('table').attr('class', 'table table-sm mb-2')
    .style('font-size', '12.5px').style('max-width', '760px').style('margin', '0.5rem auto 0')
    .style('border-collapse', 'collapse');

  const colgroup = table.append('colgroup');
  [['30%'], ['19%'], ['19%'], ['32%']].forEach(([w]) => colgroup.append('col').style('width', w));

  const headRow = table.append('thead').append('tr').style('border-bottom', '1px solid #dee2e6');
  ['Index', 'EPW-derived Δ', 'Official CMIP6 Δ', 'Note'].forEach(h => {
    headRow.append('th').style('font-weight', '600').style('color', '#495057').style('text-align', 'center').text(h);
  });

  const tbody = table.append('tbody');
  tableRows.forEach(r => {
    const tr = tbody.append('tr').style('border-bottom', '1px solid #f1f3f5');
    tr.append('td').style('text-align', 'center').text(r.label);
    tr.append('td').style('color', EPW_COLOR).style('font-weight', '600').style('text-align', 'center')
      .text(`${r.epw >= 0 ? '+' : ''}${r.epw.toFixed(1)} ${r.unit}`);
    tr.append('td').style('color', CMIP6_COLOR).style('font-weight', '600').style('text-align', 'center')
      .text(r.cmip6 !== null ? `${r.cmip6 >= 0 ? '+' : ''}${r.cmip6.toFixed(1)} ${r.unit}` : 'n/a');
    tr.append('td').style('color', '#6c757d').style('font-size', '10.5px').style('text-align', 'center').text(r.note);
  });

  const sepRow = tbody.append('tr');
  sepRow.append('td').attr('colspan', 4)
    .style('padding-top', '10px').style('padding-bottom', '4px')
    .style('font-size', '10.5px').style('font-weight', '600').style('color', '#6c757d')
    .style('border-top', '1px solid #eee')
    .text('CMIP6-only reference indices (no matching EPW-derived value yet)');

  referenceRows.forEach(r => {
    const tr = tbody.append('tr').style('border-bottom', '1px solid #f1f3f5');
    tr.append('td').style('text-align', 'center').text(r.label);
    tr.append('td').attr('colspan', 2).style('color', CMIP6_COLOR).style('font-weight', '600').style('text-align', 'center')
      .text(r.value !== null ? `${r.value >= 0 ? '+' : ''}${r.value.toFixed(1)} ${r.unit}` : 'n/a');
    tr.append('td').style('color', '#6c757d').style('font-size', '10.5px').style('text-align', 'center').text('No matching EPW-side index');
  });
}