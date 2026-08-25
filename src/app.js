/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import state from './state.js';
import { parseEPW } from './core/epw-parser.js';
import { formatCityNameOnly, formatStationDetail } from './core/location-formatter.js';
import { displayLocationSummary } from './charts/location-summary.js';
import { displayLocationOnMap, destroyLocationMap } from './charts/map-display.js';
import { initStationPickerMap, filterStationPickerMap, destroyStationPickerMap } from './charts/station-picker-map.js';
import { initHelpGuide } from './core/help-info.js';
import { initReleaseNotes } from './core/release-notes.js';
import { initSupportModal } from './core/support-info.js';

import { renderAirTemperatureCharts } from './charts/air-temperature-charts.js';
import { renderRelativeHumidityCharts } from './charts/relative-humidity-charts.js';
import { renderSkyCoverCharts } from './charts/sky-cover-charts.js';
import { renderWindCharts } from './charts/wind-charts.js';
import { renderSolarDaylightTabs } from './charts/solar-daylight-tabs.js';
import { renderSunPathChart } from './charts/sun-path-chart.js';
import { renderPsychrometricChart } from './charts/psychrometric-chart.js';
import { renderOutdoorComfortCharts } from './charts/outdoor-comfort-charts.js';
import { renderPeakConditionsCharts } from './charts/peak-conditions-charts.js';
import { renderMaterialAnalysisCharts } from './charts/material-analysis.js';
import { renderDataTables } from './charts/data-tables.js';
import { renderClimateMorphingCharts } from './charts/climate-morphing-charts.js';
import { renderCompareCharts } from './charts/compare-charts.js';
import { renderDataUnavailableNotice, restoreDataPanel, renderDependencyBanner, isTabDataMissing } from './core/data-quality-notice.js';

const TAB_DATA_REQUIREMENTS = {
  'sky-cover-tab': { paneId: 'sky-cover-pane', fields: ['totalSkyCover'], label: 'Sky Cover' },
  'wind-tab': { paneId: 'wind-pane', fields: ['windDirection', 'windSpeed'], label: 'Wind' }
};

const TAB_FIELD_DEPENDENCIES = {
  'sun-path-tab': [
    { fields: ['globalHorizontalRadiation', 'directNormalRadiation', 'diffuseHorizontalRadiation'], label: 'Solar Radiation' }
  ],
  'outdoor-tab': [
    { fields: ['directNormalRadiation', 'diffuseHorizontalRadiation'], label: 'Solar Radiation' },
    { fields: ['windSpeed'], label: 'Wind Speed' },
    { fields: ['relativeHumidity'], label: 'Relative Humidity' }
  ],
  'peak-conditions-tab': [
    { fields: ['globalHorizontalRadiation'], label: 'Solar Radiation' },
    { fields: ['relativeHumidity'], label: 'Relative Humidity' }
  ],
  'climate-morphing-tab': [
    { fields: ['dryBulbTemperature'], label: 'Dry Bulb Temperature' }
  ],
  'material-analysis-tab': [
    { fields: ['directNormalRadiation', 'diffuseHorizontalRadiation'], label: 'Solar Radiation' },
    { fields: ['horizontalInfraredRadiationIntensity'], label: 'Infrared Radiation Intensity' },
    { fields: ['windSpeed'], label: 'Wind Speed' }
  ]
};

const statusIcons = {
  inactive: ``,
  success: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>`,
  failure: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646z"/></svg>`
};

document.addEventListener('DOMContentLoaded', () => {
  const fileInputControl = document.getElementById('file-input-control');
  if (fileInputControl) fileInputControl.value = '';

  const fileInputCompare = document.getElementById('file-input-compare');
  if (fileInputCompare) fileInputCompare.value = '';

  initHelpGuide();
  initReleaseNotes();
  initSupportModal();

  updateFileStatus('primary', 'inactive', 'No file loaded');
  updateFileStatus('comparison', 'inactive', 'Load a primary file first');

  const dropZone = document.getElementById('drop-zone');
  setupFileInput(dropZone, fileInputControl, (file) => handleFile(file, 'primary'));

  const dropZoneCompare = document.getElementById('drop-zone-compare');
  setupFileInput(dropZoneCompare, fileInputCompare, (file) => handleFile(file, 'comparison'));

  initExamplePicker();

  const stationPickerModal = document.getElementById('station-picker-modal');
  if (stationPickerModal) {
    stationPickerModal.addEventListener('shown.bs.modal', () => {
      initStationPickerMap('station-picker-map-container');
    });
    stationPickerModal.addEventListener('hidden.bs.modal', () => {
      destroyStationPickerMap();
      const searchInput = document.getElementById('station-search-input');
      if (searchInput) searchInput.value = '';
    });
  }

  const stationSearchInput = document.getElementById('station-search-input');
  if (stationSearchInput) {
    let searchDebounce;
    stationSearchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => filterStationPickerMap(e.target.value), 200);
    });
  }

  const vizTabs = document.querySelectorAll('#viz-tabs button[data-bs-toggle="tab"]');
  vizTabs.forEach(tab => {
    tab.addEventListener('show.bs.tab', () => {
      if (state.epwDataObject) {
        showGlobalProcessing();
      }
    });

    tab.addEventListener('shown.bs.tab', (event) => {
      if (state.epwDataObject) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              renderVisibleTabCharts(event.target.id);
              hideGlobalProcessing();
            }, 50);
          });
        });
      }
    });
  });

  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  [...tooltipTriggerList].map(tooltipTriggerEl => new window.bootstrap.Tooltip(tooltipTriggerEl));

  document.getElementById('cancel-editor-btn').addEventListener('click', toggleEditorVisibility);

  document.getElementById('apply-editor-btn').addEventListener('click', () => {
    const priCity = document.getElementById('primary-city-input').value;
    const priStation = document.getElementById('primary-station-input').value;
    const compCity = document.getElementById('comparison-city-input').value;
    const compStation = document.getElementById('comparison-station-input').value;

    state.customLocationNames.primary.city = priCity.trim() !== '' ? priCity.trim() : null;
    state.customLocationNames.primary.station = priStation.trim() !== '' ? priStation.trim() : null;
    state.customLocationNames.comparison.city = compCity.trim() !== '' ? compCity.trim() : null;
    state.customLocationNames.comparison.station = compStation.trim() !== '' ? compStation.trim() : null;

    if (state.epwDataObject) {
      displayLocationSummary(state.epwDataObject, toggleEditorVisibility);
    }
    renderAllCharts();
    toggleEditorVisibility();
  });

  document.querySelectorAll('.tab-nav-container .btn').forEach(button => {
    button.addEventListener('click', () => {
      setTimeout(() => {
        const tabsMenu = document.getElementById('viz-tabs');
        if (tabsMenu) {
          tabsMenu.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    });
  });

  initCollapsiblePanels();
});

function toggleEditorVisibility() {
  const summaryContent = document.getElementById('summary-content');
  const editorPanel = document.getElementById('location-editor-panel');

  if (editorPanel.style.display === 'none') {
    summaryContent.style.display = 'none';
    editorPanel.style.display = 'block';

    const locPrimary = state.epwDataObject?.metadata?.location;
    const locComparison = state.comparisonDataObject?.metadata?.location;

    document.getElementById('primary-city-input').value =
      state.customLocationNames.primary.city || (locPrimary ? formatCityNameOnly(locPrimary.city, 'primary') : '') || '';
    document.getElementById('primary-station-input').value =
      state.customLocationNames.primary.station || (locPrimary ? formatStationDetail(locPrimary.city, 'primary') : '') || '';
    document.getElementById('comparison-city-input').value =
      state.customLocationNames.comparison.city || (locComparison ? formatCityNameOnly(locComparison.city, 'comparison') : '') || '';
    document.getElementById('comparison-station-input').value =
      state.customLocationNames.comparison.station || (locComparison ? formatStationDetail(locComparison.city, 'comparison') : '') || '';
  } else {
    editorPanel.style.display = 'none';
    summaryContent.style.display = 'block';
  }
}

let exampleCitiesCache = null;
const exampleSelection = { primary: null, comparison: null };

function initExamplePicker() {
  const modalEl = document.getElementById('example-picker-modal');
  if (!modalEl) return;

  modalEl.addEventListener('show.bs.modal', async () => {
    const container = document.getElementById('example-cards-container');
    try {
      const cities = await loadExampleCitiesList();
      renderExampleCards(cities);
    } catch (error) {
      container.innerHTML = `<div class="alert alert-danger m-3 mb-0">${error.message}</div>`;
    }
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    const searchInput = document.getElementById('example-search-input');
    if (searchInput) searchInput.value = '';
  });

  const searchInput = document.getElementById('example-search-input');
  if (searchInput) {
    let searchDebounce;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        loadExampleCitiesList().then(cities => renderExampleCards(cities, e.target.value));
      }, 150);
    });
  }

  document.querySelectorAll('.slot-clear').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      exampleSelection[btn.dataset.slot] = null;
      loadExampleCitiesList().then(cities => {
        updateExampleSlotUI(cities);
        updateExampleCardStyles();
      });
    });
  });

  const loadBtn = document.getElementById('load-selected-examples-btn');
  if (loadBtn) {
    loadBtn.addEventListener('click', async () => {
      const cities = await loadExampleCitiesList();
      const primaryCity = cities.find(c => c.id === exampleSelection.primary);
      if (!primaryCity) return;
      const comparisonCity = exampleSelection.comparison
        ? cities.find(c => c.id === exampleSelection.comparison)
        : null;

      const modalInstance = window.bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();

      loadRemoteEpwPair(primaryCity, comparisonCity);
    });
  }
}

async function loadExampleCitiesList() {
  if (exampleCitiesCache) return exampleCitiesCache;
  const response = await fetch('/epw/examples.json');
  if (!response.ok) throw new Error('Could not load the example climate list.');
  exampleCitiesCache = await response.json();
  return exampleCitiesCache;
}

function renderExampleCards(cities, filterText = '') {
  const container = document.getElementById('example-cards-container');
  const q = filterText.trim().toLowerCase();
  const filtered = !q ? cities : cities.filter(c =>
    c.city.toLowerCase().includes(q) ||
    c.country.toLowerCase().includes(q) ||
    c.continent.toLowerCase().includes(q) ||
    c.koppen.toLowerCase().includes(q) ||
    c.koppenLabel.toLowerCase().includes(q)
  );

  if (!filtered.length) {
    container.innerHTML = `<div class="text-center text-muted py-5">No climates match your search.</div>`;
    return;
  }

  container.innerHTML = `<div class="row g-3">${filtered.map(exampleCardTemplate).join('')}</div>`;

  container.querySelectorAll('.example-city-card').forEach(card => {
    card.addEventListener('click', () => handleExampleCardClick(card.dataset.id, cities));
  });

  updateExampleSlotUI(cities);
  updateExampleCardStyles();
}

function exampleCardTemplate(c) {
  const group = (c.koppen || '').charAt(0);
  return `
    <div class="col-6 col-md-4 col-lg-3">
      <div class="example-city-card" data-id="${c.id}" role="button" tabindex="0">
        ${c.featured ? '<span class="example-featured-badge" title="Featured pair"><i class="bi bi-star-fill"></i></span>' : ''}
        <div class="example-city-card-top">
          <span class="example-koppen-badge koppen-${group}" title="${c.koppenLabel}">${c.koppen}</span>
          <span class="example-continent">${c.continent}</span>
        </div>
        <div class="example-city-name">${c.city}</div>
        <div class="example-city-country">${c.country} &middot; ${c.koppenLabel}</div>
        <div class="example-city-body">
          <div class="example-city-tagline">${c.tagline}</div>
          <img class="example-city-thumb" src="${c.image}" alt="${c.city}" loading="lazy" onerror="this.style.display='none'">
        </div>
      </div>
    </div>`;
}

function handleExampleCardClick(id, cities) {
  if (exampleSelection.primary === id) {
    exampleSelection.primary = null;
  } else if (exampleSelection.comparison === id) {
    exampleSelection.comparison = null;
  } else if (!exampleSelection.primary) {
    exampleSelection.primary = id;
  } else if (!exampleSelection.comparison) {
    exampleSelection.comparison = id;
  } else {
    exampleSelection.comparison = id;
  }

  updateExampleSlotUI(cities);
  updateExampleCardStyles();
  document.getElementById('load-selected-examples-btn').disabled = !exampleSelection.primary;
}

function updateExampleSlotUI(cities) {
  const primaryCity = cities.find(c => c.id === exampleSelection.primary);
  const comparisonCity = cities.find(c => c.id === exampleSelection.comparison);
  document.querySelector('#example-slot-primary .slot-label').innerHTML =
    `Primary: <em>${primaryCity ? primaryCity.city : 'none'}</em>`;
  document.querySelector('#example-slot-comparison .slot-label').innerHTML =
    `Comparison: <em>${comparisonCity ? comparisonCity.city : 'none'}</em>`;
  document.getElementById('load-selected-examples-btn').disabled = !exampleSelection.primary;
}

function updateExampleCardStyles() {
  document.querySelectorAll('.example-city-card').forEach(card => {
    card.classList.remove('is-primary', 'is-comparison');
    if (card.dataset.id === exampleSelection.primary) card.classList.add('is-primary');
    if (card.dataset.id === exampleSelection.comparison) card.classList.add('is-comparison');
  });
}

function setupLocationEditor() {
  if (!state.epwDataObject) return;

  const locPrimary = state.epwDataObject.metadata.location;
  document.getElementById('primary-city-input').value = formatCityNameOnly(locPrimary.city, 'primary') || '';
  document.getElementById('primary-station-input').value = formatStationDetail(locPrimary.city, 'primary') || '';

  const comparisonHeader = document.getElementById('comparison-header');
  const comparisonCityInput = document.getElementById('comparison-city-input');
  const comparisonStationInput = document.getElementById('comparison-station-input');

  if (state.comparisonDataObject) {
    const locCompare = state.comparisonDataObject.metadata.location;
    comparisonHeader.style.display = 'block';
    comparisonCityInput.style.display = 'block';
    comparisonStationInput.style.display = 'block';

    comparisonCityInput.value = formatCityNameOnly(locCompare.city, 'comparison') || '';
    comparisonStationInput.value = formatStationDetail(locCompare.city, 'comparison') || '';

    document.querySelector('.location-editor-grid').style.gridTemplateColumns = 'auto 1fr 1fr';
  } else {
    comparisonHeader.style.display = 'none';
    comparisonCityInput.style.display = 'none';
    comparisonStationInput.style.display = 'none';
    document.querySelector('.location-editor-grid').style.gridTemplateColumns = 'auto 1fr';
  }
}

async function loadRemoteEpwPair(primaryCity, comparisonCity) {
  showLoadingIndicator();
  hideError();

  try {
    const fetches = [fetch(primaryCity.file)];
    if (comparisonCity) fetches.push(fetch(comparisonCity.file));

    const responses = await Promise.all(fetches);
    if (responses.some(r => !r.ok)) {
      throw new Error('Could not fetch one or both example EPW files.');
    }

    const texts = await Promise.all(responses.map(r => r.text()));

    const primaryData = parseEPW(texts[0]);
    if (!primaryData) throw new Error('Failed to parse the primary example file.');

    state.epwDataObject = primaryData;
    state.customLocationNames.primary = { city: null, station: null };
    updateFileStatus('primary', 'success', `${primaryCity.city}.epw (example)`);
    setComparisonZoneEnabled(true);

    if (comparisonCity) {
      const comparisonData = parseEPW(texts[1]);
      if (!comparisonData) throw new Error('Failed to parse the comparison example file.');

      state.comparisonDataObject = comparisonData;
      state.customLocationNames.comparison = { city: null, station: null };
      updateFileStatus('comparison', 'success', `${comparisonCity.city}.epw (example)`);
    } else {
      state.comparisonDataObject = null;
      updateFileStatus('comparison', 'inactive', 'No file loaded');
    }

    resetUI();
    displayLocationSummary(state.epwDataObject, toggleEditorVisibility);
    document.getElementById('visualization-container').classList.remove('visually-hidden');
    const loc = state.epwDataObject.metadata.location;
    if (loc) { displayLocationOnMap(loc.latitude, loc.longitude, loc.city); }
    requestAnimationFrame(() => { if (state.map) state.map.invalidateSize(); });
    renderAllCharts();
    updateCompareTabVisibility();
    setupLocationEditor();

  } catch (error) {
    showError(error.message);
    updateFileStatus('primary', 'failure', 'Example load failed');
    updateFileStatus('comparison', 'failure', 'Example load failed');
    state.epwDataObject = null;
    state.comparisonDataObject = null;
    setComparisonZoneEnabled(false);
    resetUI();
  } finally {
    hideLoadingIndicator();
  }
}


function setupFileInput(dropZone, fileInput, callback) {
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    dropZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length) { callback(files[0]); }
  });
  fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length) { callback(files[0]); }
  });
}

function updateFileStatus(type, status, message) {
  const indicator = d3.select(`#${type}-file-status`);
  indicator.html(`${statusIcons[status]} ${message}`)
    .attr('class', `file-status-indicator status-${status}`);
}

function setComparisonZoneEnabled(enabled) {
  const comparisonWrapper = document.getElementById('comparison-drop-zone-wrapper');
  if (!comparisonWrapper) return;
  comparisonWrapper.classList.toggle('inactive', !enabled);
  if (!enabled) {
    updateFileStatus('comparison', 'inactive', 'Load a primary file first');
  } else if (!state.comparisonDataObject) {
    updateFileStatus('comparison', 'inactive', 'No file loaded');
  }
}

function handleFile(file, type) {
  if (!file.name.toLowerCase().endsWith('.epw')) {
    showError('Invalid file type. Please select an EPW file.');
    updateFileStatus(type, 'failure', 'Invalid file type');
    return;
  }
  showLoadingIndicator();
  hideError();

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsedData = parseEPW(e.target.result);
      if (!parsedData || !parsedData.data || parsedData.data.length === 0) {
        throw new Error("Parsed data is empty or invalid.");
      }
      updateFileStatus(type, 'success', file.name);

      if (type === 'primary') {
        state.epwDataObject = parsedData;
        state.customLocationNames.primary = { city: null, station: null };
        setComparisonZoneEnabled(true);
        resetUI();
        displayLocationSummary(state.epwDataObject, toggleEditorVisibility);
        document.getElementById('visualization-container').classList.remove('visually-hidden');
        const loc = state.epwDataObject.metadata.location;
        if (loc) { displayLocationOnMap(loc.latitude, loc.longitude, loc.city); }
        requestAnimationFrame(() => { if (state.map) state.map.invalidateSize(); });
        renderAllCharts();
      } else {
        state.comparisonDataObject = parsedData;
        state.customLocationNames.comparison = { city: null, station: null };
      }
      updateCompareTabVisibility();
      setupLocationEditor();
    } catch (error) {
      showError(error.message);
      updateFileStatus(type, 'failure', 'Parsing failed');
    } finally {
      hideLoadingIndicator();
    }
  };
  reader.onerror = () => {
    hideLoadingIndicator();
    showError('Error reading the selected file.');
    updateFileStatus(type, 'failure', 'Read error');
  };
  reader.readAsText(file);
}

function updateCompareTabVisibility() {
  const compareTabButton = document.getElementById('compare-tab');
  if (state.epwDataObject && state.comparisonDataObject) {
    compareTabButton.classList.remove('disabled');
    compareTabButton.removeAttribute('tabindex');
  } else {
    compareTabButton.classList.add('disabled');
    compareTabButton.setAttribute('tabindex', '-1');
  }
}

function renderVisibleTabCharts(tabId) {
  if (!state.epwDataObject) return;

  const requirement = TAB_DATA_REQUIREMENTS[tabId];
  if (requirement) {
    const paneSelector = `#${requirement.paneId}`;
    if (isTabDataMissing(state.epwDataObject, requirement.fields)) {
      renderDataUnavailableNotice(paneSelector, requirement.label);
      return;
    }
    restoreDataPanel(paneSelector);
  }

  const chartRefs = { heatmap: {}, boxplot: {}, multibar: {}, psychro: {} };

  switch (tabId) {
    case 'air-temp-tab':
      renderAirTemperatureCharts(state.epwDataObject, chartRefs);
      break;
    case 'rel-humidity-tab':
      renderRelativeHumidityCharts(state.epwDataObject, chartRefs);
      break;
    case 'sky-cover-tab':
      renderSkyCoverCharts(state.epwDataObject, chartRefs);
      break;
    case 'wind-tab':
      renderWindCharts(state.epwDataObject, chartRefs);
      break;
    case 'solar-rad-tab':
      renderSolarDaylightTabs(state.epwDataObject, chartRefs);
      break;
    case 'sun-path-tab':
      renderSunPathChart(state.epwDataObject, chartRefs);
      break;
    case 'psychro-chart-tab':
      renderPsychrometricChart(state.epwDataObject, chartRefs);
      break;
    case 'outdoor-tab':
      renderOutdoorComfortCharts(state.epwDataObject, chartRefs);
      break;
    case 'peak-conditions-tab':
      renderPeakConditionsCharts(state.epwDataObject, chartRefs);
      break;
    case 'material-analysis-tab':
      renderMaterialAnalysisCharts(state.epwDataObject, chartRefs);
      break;
    case 'data-tables-tab':
      renderDataTables(state.epwDataObject, chartRefs);
      break;
    case 'climate-morphing-tab':
      renderClimateMorphingCharts(state.epwDataObject, chartRefs);
      break;
    case 'compare-tab':
      renderCompareCharts(state.epwDataObject, state.comparisonDataObject);
      break;
  }
  renderDependencyWarnings(tabId);
}

function renderDependencyWarnings(tabId) {
  const config = TAB_FIELD_DEPENDENCIES[tabId];
  if (!config) return;

  const tabButton = document.getElementById(tabId);
  const paneSelector = tabButton ? tabButton.dataset.bsTarget : null;
  if (!paneSelector) return;

  const triggered = config.filter(c => isTabDataMissing(state.epwDataObject, c.fields));
  renderDependencyBanner(`${paneSelector} .main-chart-area`, triggered);
}

function resetUI() {
  hideError();
  document.getElementById('visualization-container').classList.add('visually-hidden');
  document.querySelectorAll('.chart-container, .left-panel, .data-table-container, #monthly-wind-roses-chart').forEach(container => {
    if (container) container.innerHTML = '';
  });
  document.querySelectorAll('.tab-pane .row.no-side-panel').forEach(row => row.classList.remove('no-side-panel'));
  document.getElementById('summary-content').innerHTML = '';
  document.querySelectorAll('.tab-pane .row.no-side-panel').forEach(row => row.classList.remove('no-side-panel'));

  if (state.climateMorphing) {
    state.climateMorphing.gridCell = null;
    state.climateMorphing.regionLabel = null;
  }

  if (state.map) {
    destroyLocationMap();
    document.getElementById('map-container').innerHTML = '';
    state.selectedBioclimaticStrategy = 'none';
  }

  document.getElementById('summary-content').style.display = 'block';
  document.getElementById('location-editor-panel').style.display = 'none';
}

function showLoadingIndicator() { d3.select('#loading-indicator').style('display', 'flex'); }
function hideLoadingIndicator() { d3.select('#loading-indicator').style('display', 'none'); }
function showError(message) { d3.select('#error-alert').text(message).style('display', 'block'); }
function hideError() { d3.select('#error-alert').style('display', 'none'); }

function renderAllCharts() {
  const activeTab = document.querySelector('#viz-tabs .nav-link.active');
  if (activeTab) {
    renderVisibleTabCharts(activeTab.id);
  }
}

function showGlobalProcessing() {
  const overlay = document.getElementById('global-processing-overlay');
  if (overlay) overlay.classList.add('processing-active');
}

function hideGlobalProcessing() {
  const overlay = document.getElementById('global-processing-overlay');
  if (overlay) overlay.classList.remove('processing-active');
}

window.showLocalProcessing = function (tabPaneId) {
  const mainArea = document.querySelector(`#${tabPaneId} .main-chart-area`);
  if (!mainArea) return;

  let overlay = mainArea.querySelector('.local-processing-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'local-processing-overlay';
    overlay.innerHTML = `
            <div class="processing-indicator-wrapper">
                <div class="modern-spinner"></div>
            </div>
        `;
    mainArea.appendChild(overlay);
  }
  overlay.classList.add('processing-active');
};

window.hideLocalProcessing = function (tabPaneId) {
  const overlay = document.querySelector(`#${tabPaneId} .local-processing-overlay`);
  if (overlay) overlay.classList.remove('processing-active');
};

function initCollapsiblePanels() {
  const leftPanels = document.querySelectorAll('.tab-pane .left-panel');

  leftPanels.forEach(leftPanel => {
    const rowParent = leftPanel.closest('.row');
    if (!rowParent) return;

    if (rowParent.querySelector('.left-panel-toggle-btn')) return;

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'left-panel-toggle-btn';
    toggleBtn.setAttribute('aria-label', 'Toggle Side Panel');
    toggleBtn.innerHTML = '<i class="bi bi-chevron-left"></i>';

    leftPanel.parentNode.insertBefore(toggleBtn, leftPanel.nextSibling);

    toggleBtn.addEventListener('click', () => {
      const activeTabId = leftPanel.closest('.tab-pane').id;
      window.showLocalProcessing(activeTabId);

      requestAnimationFrame(() => {
        const isCollapsed = leftPanel.classList.toggle('collapsed');

        const icon = toggleBtn.querySelector('i');
        if (isCollapsed) {
          icon.className = 'bi bi-chevron-right';
        } else {
          icon.className = 'bi bi-chevron-left';
        }
      });
    });

    leftPanel.addEventListener('transitionend', (event) => {
      if (event.propertyName === 'width' || event.propertyName === 'padding') {
        if (state.epwDataObject) {
          renderAllCharts();
        }
        const activeTabId = leftPanel.closest('.tab-pane').id;
        window.hideLocalProcessing(activeTabId);
      }
    });
  });
}