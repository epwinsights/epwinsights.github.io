/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import state from '../state.js';
import { renderSolarRadiationCharts } from './solar-radiation-charts.js';
import { renderDaylightIlluminanceCharts } from './daylight-illuminance-charts.js';
import { isTabDataMissing, renderSectionUnavailableNotice, setSidePanelAvailable } from '../core/data-quality-notice.js';

const RADIATION_FIELDS = ['globalHorizontalRadiation', 'directNormalRadiation', 'diffuseHorizontalRadiation'];
const ILLUMINANCE_FIELDS = ['globalHorizontalIlluminance', 'directNormalIlluminance', 'diffuseHorizontalIlluminance', 'zenithLuminance'];

export function renderSolarDaylightTabs(epwData, chartRefs) {
  state.solarDaylight = state.solarDaylight || { activeMetric: 'radiation' };

  renderTopMenu('#solar-top-menu-container', epwData, chartRefs);
  updateActiveView(epwData, chartRefs);
}

function renderTopMenu(selector, epwData, chartRefs) {
  let container = d3.select(selector);
  if (container.empty()) return;

  container.html('');
  const menu = container.append('div').attr('class', 'solar-top-menu text-center mb-4 pb-3 border-bottom');
  const toggleGroup = menu.append('div').attr('class', 'custom-segmented-control');

  ['Radiation', 'Daylight Illuminance'].forEach(label => {
    const value = label === 'Radiation' ? 'radiation' : 'illuminance';

    toggleGroup.append('input')
      .attr('type', 'radio')
      .attr('class', 'segmented-control-input')
      .attr('name', 'solar-metric-toggle')
      .attr('id', `btn-top-${value}`)
      .property('checked', state.solarDaylight.activeMetric === value)
      .on('change', () => {
        if (typeof window.showLocalProcessing === 'function') {
          window.showLocalProcessing('solar-rad-pane');
        }

        setTimeout(() => {
          state.solarDaylight.activeMetric = value;
          updateActiveView(epwData, chartRefs);

          if (typeof window.hideLocalProcessing === 'function') {
            window.hideLocalProcessing('solar-rad-pane');
          }
        }, 50);
      });

    toggleGroup.append('label')
      .attr('class', 'segmented-control-label')
      .attr('for', `btn-top-${value}`)
      .text(label);
  });
}

function updateActiveView(epwData, chartRefs) {
  const isRad = state.solarDaylight.activeMetric === 'radiation';

  d3.select('#radiation-view').style('display', isRad ? 'block' : 'none');
  d3.select('#illuminance-view').style('display', isRad ? 'none' : 'block');

  if (isRad) {
    if (isTabDataMissing(epwData, RADIATION_FIELDS)) {
      setSidePanelAvailable('#solar-rad-pane', false);
      renderSectionUnavailableNotice('#radiation-view', 'Solar Radiation');
    } else {
      setSidePanelAvailable('#solar-rad-pane', true);
      renderSolarRadiationCharts(epwData, chartRefs);
    }
  } else {
    if (isTabDataMissing(epwData, ILLUMINANCE_FIELDS)) {
      setSidePanelAvailable('#solar-rad-pane', false);
      renderSectionUnavailableNotice('#illuminance-view', 'Daylight Illuminance');
    } else {
      setSidePanelAvailable('#solar-rad-pane', true);
      renderDaylightIlluminanceCharts(epwData, chartRefs);
    }
  }
}