/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import { formatCityNameOnly } from '../core/location-formatter.js';
import { renderOverviewCompare } from './compare-overview.js';
import { renderAirTemperatureCompareCharts } from './compare-air-temperature.js';
import { renderRelativeHumidityCompareCharts } from './compare-relative-humidity.js';
import { renderSkyCoverCompareCharts } from './compare-sky-cover.js';
import { renderWindCompareCharts } from './compare-wind.js';
import { renderSolarRadiationCompareCharts } from './compare-solar-radiation.js';
import { renderSunPathCompareCharts } from './compare-sun-path.js';
import { getMissingSources, renderCompareUnavailableNotice, renderCompareDependencyBanner } from '../core/data-quality-notice.js';

const COMPARE_BLOCKING_REQUIREMENTS = {
  sky: { fields: ['totalSkyCover'], label: 'Sky Cover', containerIds: ['compare-sky-cover-chart'] },
  wind: { fields: ['windDirection', 'windSpeed'], label: 'Wind', containerIds: ['compare-wind-rose-chart', 'compare-wind-speed-chart'] },
  rh: { fields: ['relativeHumidity'], label: 'Relative Humidity', containerIds: ['compare-rh-dist-chart', 'compare-rh-diurnal-chart'] }
};

const COMPARE_WARNING_DEPENDENCIES = {
  overview: [
    { fields: ['globalHorizontalRadiation'], label: 'Solar Radiation' },
    { fields: ['windSpeed'], label: 'Wind Speed' },
    { fields: ['totalSkyCover'], label: 'Sky Cover' },
    { fields: ['relativeHumidity'], label: 'Relative Humidity' }
  ],
  'sun-path': [
    { fields: ['globalHorizontalRadiation', 'directNormalRadiation', 'diffuseHorizontalRadiation'], label: 'Solar Radiation' }
  ]
};

let compareNavInitialized = false;

let latestCompareData = { epwDataA: null, epwDataB: null };

export function renderCompareCharts(epwDataA, epwDataB) {
  const leftPanel = d3.select('#compare-pane .left-panel');
  const mainArea = d3.select('#compare-pane .main-chart-area');

  if (!epwDataA || !epwDataB) {
    mainArea.html('');
    leftPanel.html('');
    mainArea.insert('div', ':first-child')
      .attr('class', 'alert alert-info mt-3')
      .html('Please load both a <strong>Primary EPW File</strong> and a <strong>Comparison EPW File</strong> to activate this feature.');
    return;
  }

  latestCompareData = { epwDataA, epwDataB };

  if (compareNavInitialized) {
    const activeRadio = mainArea.select('.compare-top-menu input:checked').node();
    if (activeRadio) {
      activeRadio.dispatchEvent(new Event('change'));
    }
    return;
  }

  leftPanel.html('');
  mainArea.html('');

  const topMenu = mainArea.append('div')
    .attr('class', 'compare-top-menu text-center mb-4 pb-3 border-bottom');

  const toggleGroup = topMenu.append('div')
    .attr('class', 'custom-segmented-control');

  mainArea.append('div').attr('id', 'compare-content-area');

  const navItems = [
    { id: 'overview', label: 'Overview', renderFunc: renderOverviewCompare },
    { id: 'temp', label: 'Air Temperature', renderFunc: renderAirTemperatureCompareCharts },
    { id: 'rh', label: 'Relative Humidity', renderFunc: renderRelativeHumidityCompareCharts },
    { id: 'sky', label: 'Sky Cover', renderFunc: renderSkyCoverCompareCharts },
    { id: 'wind', label: 'Wind', renderFunc: renderWindCompareCharts },
    { id: 'solar', label: 'Solar Radiation & Daylight', renderFunc: renderSolarRadiationCompareCharts },
    { id: 'sun-path', label: 'Sun Path', renderFunc: renderSunPathCompareCharts }
  ];

  navItems.forEach((item, index) => {
    const radioId = `btn-compare-${item.id}`;

    toggleGroup.append('input')
      .attr('type', 'radio')
      .attr('class', 'segmented-control-input')
      .attr('name', 'compare-mode')
      .attr('id', radioId)
      .property('checked', index === 0)
      .on('change', function () {
        const contentArea = d3.select('#compare-content-area');

        contentArea.html('');
        leftPanel.selectAll('.chart-controls-group').remove();

        if (typeof window.showLocalProcessing === 'function') window.showLocalProcessing('compare-pane');

        setTimeout(() => {
          const { epwDataA: currentA, epwDataB: currentB } = latestCompareData;
          renderCompareGeneralSummaryWidget('#compare-pane .left-panel', currentA, currentB);

          const blockRule = COMPARE_BLOCKING_REQUIREMENTS[item.id];
          if (blockRule) {
            const missing = getMissingSources(currentA, currentB, blockRule.fields);
            if (missing.length) {
              blockRule.containerIds.forEach((id, i) => {
                contentArea.append('div').attr('id', id).attr('class', i === 0 ? 'chart-container' : 'chart-container mb-5');
              });
              renderCompareUnavailableNotice(`#${blockRule.containerIds[0]}`, blockRule.label, missing);
              if (typeof window.hideLocalProcessing === 'function') window.hideLocalProcessing('compare-pane');
              return;
            }
          }

          if (item.renderFunc) {
            item.renderFunc(currentA, currentB);
          } else {
            contentArea.html(`<div class="alert alert-warning">Chart function for "${item.label}" is not available.</div>`);
          }

          const warnRules = COMPARE_WARNING_DEPENDENCIES[item.id];
          if (warnRules) {
            const triggered = warnRules
              .map(r => ({ label: r.label, missingSources: getMissingSources(currentA, currentB, r.fields) }))
              .filter(r => r.missingSources.length);
            renderCompareDependencyBanner('#compare-content-area', triggered);
          }

          if (typeof window.hideLocalProcessing === 'function') window.hideLocalProcessing('compare-pane');
        }, 50);
      });

    toggleGroup.append('label')
      .attr('class', 'segmented-control-label')
      .attr('for', radioId)
      .text(item.label);
  });

  compareNavInitialized = true;

  const firstTab = document.getElementById(`btn-compare-${navItems[0].id}`);
  if (firstTab) {
    firstTab.dispatchEvent(new Event('change'));
  }
}

export function renderCompareGeneralSummaryWidget(panelSelector, epwDataA, epwDataB) {
  const panel = d3.select(panelSelector);

  const cityA = formatCityNameOnly(epwDataA.metadata.location.city, 'primary');
  const cityB = formatCityNameOnly(epwDataB.metadata.location.city, 'comparison');
  const countryA = epwDataA.metadata.location.country;
  const countryB = epwDataB.metadata.location.country;

  const flagA = `<i class="bi bi-geo-alt text-primary fs-5"></i>`;
  const flagB = `<i class="bi bi-geo-alt fs-5" style="color: #9333ea;"></i>`;

  const summaryHtml = `
            <h6 class="border-bottom pb-2 mb-3">
                <i class="bi bi-geo-alt me-2 text-muted"></i>Comparing Locations
            </h6>
            
            <div class="d-flex flex-column gap-3">
                <div class="p-3 rounded-3 border position-relative" style="background-color: rgba(59, 130, 246, 0.05); border-color: rgba(59, 130, 246, 0.2) !important;">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25">Primary</span>
                        <div class="d-flex align-items-center">${flagA}</div>
                    </div>
                    <div class="fw-bold text-dark text-truncate" title="${cityA}" style="font-size: 1.05rem;">${cityA}</div>
                    <div class="text-muted text-truncate" style="font-size: 0.8rem;" title="${countryA}">${countryA}</div>
                </div>

                <div class="p-3 rounded-3 border position-relative" style="background-color: rgba(168, 85, 247, 0.05); border-color: rgba(168, 85, 247, 0.2) !important;">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <span class="badge bg-purple bg-opacity-10 border" style="color: #9333ea; border-color: rgba(168, 85, 247, 0.25); background-color: #f3e8ff;">Comparison</span>
                        <div class="d-flex align-items-center">${flagB}</div>
                    </div>
                    <div class="fw-bold text-dark text-truncate" title="${cityB}" style="font-size: 1.05rem;">${cityB}</div>
                    <div class="text-muted text-truncate" style="font-size: 0.8rem;" title="${countryB}">${countryB}</div>
                </div>
            </div>
            
            <div class="mt-3 text-muted" style="font-size: 0.75rem; text-align: justify;">
                <i class="bi bi-info-circle me-1"></i>
                Select a tab above to explore detailed comparative analytics for different climate variables.
            </div>
    `;

  panel.insert('div', ':first-child')
    .attr('class', 'chart-controls-group mb-4')
    .html(summaryHtml);
}