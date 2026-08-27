/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 * Data source: NREL/EnergyPlus master.geojson, trimmed at build time by
 */

const DATA_URL = '/data/station-index.json';

const LOADING_HTML = `
  <div class="station-picker-loading">
    <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
    <span>Loading station index…</span>
  </div>
`;

let stationMap = null;
let markerClusterGroup = null;
let allStations = null;
let loadPromise = null;
let pickedCallback = null;
let stationIcon = null;

let currentInitToken = 0;

function getStationIcon() {
  if (!stationIcon) {
    stationIcon = window.L.icon({
      iconUrl: '/img/marker-icon.svg',
      iconSize: [24, 24],
      iconAnchor: [12, 24],
      popupAnchor: [0, -24],
      className: 'my-custom-marker'
    });
  }
  return stationIcon;
}

function loadStationIndex() {
  if (allStations) return Promise.resolve(allStations);
  if (!loadPromise) {
    loadPromise = fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error('Could not load the station index.');
        return response.json();
      })
      .then((data) => {
        allStations = data;
        return data;
      })
      .catch((error) => {
        loadPromise = null;
        throw error;
      });
  }
  return loadPromise;
}

function buildPopupHtml(station) {
  const label = station.t.replace(/_/g, ' ');
  const countryCode = station.t.split('_')[0] || '';
  const meta = `${countryCode ? countryCode + ' · ' : ''}${station.lat.toFixed(2)}°, ${station.lon.toFixed(2)}°`;
  return `
    <div class="station-popup">
      <div class="station-popup-title">${label}</div>
      <div class="station-popup-meta">${meta}</div>
      <button type="button" class="btn btn-sm btn-primary w-100 station-download-btn">
        <i class="bi bi-download"></i> Download EPW
      </button>
    </div>
  `;
}

function handleStationPick(station) {
  window.open(station.u, '_blank', 'noopener');
  if (typeof pickedCallback === 'function') {
    pickedCallback(station);
  }
}

function buildMarkerClusterGroup(stations) {
  const group = window.L.markerClusterGroup({
    disableClusteringAtZoom: 9,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    maxClusterRadius: 45
  });

  stations.forEach((station) => {
    const marker = window.L.marker([station.lat, station.lon], { icon: getStationIcon() });
    marker.bindPopup(buildPopupHtml(station), { className: 'my-custom-popup' });
    marker.on('popupopen', (event) => {
      const popupEl = event.popup.getElement();
      const btn = popupEl && popupEl.querySelector('.station-download-btn');
      if (btn) {
        btn.addEventListener('click', () => handleStationPick(station), { once: true });
      }
    });
    group.addLayer(marker);
  });

  return group;
}

function showEmptyMessage(container) {
  hideEmptyMessage(container);
  const el = document.createElement('div');
  el.className = 'station-picker-empty-message';
  el.id = 'station-picker-empty-message';
  el.textContent = 'No stations match your search.';
  container.appendChild(el);
}

function hideEmptyMessage(container) {
  const existing = container.querySelector('#station-picker-empty-message');
  if (existing) existing.remove();
}

export async function initStationPickerMap(containerId, options = {}) {
  const myToken = ++currentInitToken;
  pickedCallback = options.onStationPicked || null;

  const container = document.getElementById(containerId);
  if (!container) {
    console.error('Station picker map container not found!');
    return;
  }

  container.innerHTML = LOADING_HTML;

  let stations;
  try {
    stations = await loadStationIndex();
  } catch (error) {
    if (myToken !== currentInitToken) return;
    container.innerHTML = '<div class="alert alert-danger m-3">Failed to load the station index. Please check your connection and try again.</div>';
    console.error(error);
    return;
  }

  if (myToken !== currentInitToken) return;

  if (stationMap) {
    stationMap.remove();
    stationMap = null;
  }
  container.innerHTML = '';

  stationMap = window.L.map(containerId, {
    worldCopyJump: true
  }).setView([20, 10], 2);

  window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 16,
    attribution: 'Tiles © Esri'
  }).addTo(stationMap);

  markerClusterGroup = buildMarkerClusterGroup(stations);
  markerClusterGroup.addTo(stationMap);

  setTimeout(() => {
    if (stationMap) stationMap.invalidateSize();
  }, 100);
}

export function filterStationPickerMap(query) {
  if (!stationMap || !allStations) return;

  if (markerClusterGroup) {
    stationMap.removeLayer(markerClusterGroup);
  }

  const container = stationMap.getContainer();
  hideEmptyMessage(container);

  const term = query.trim().toLowerCase();
  const filtered = term
    ? allStations.filter((station) => station.t.toLowerCase().includes(term))
    : allStations;

  markerClusterGroup = buildMarkerClusterGroup(filtered);
  markerClusterGroup.addTo(stationMap);

  if (filtered.length === 0) {
    showEmptyMessage(container);
    return;
  }

  if (term) {
    stationMap.fitBounds(markerClusterGroup.getBounds(), {
      padding: [40, 40],
      maxZoom: 10
    });
  } else {
    stationMap.setView([20, 10], 2);
  }
}

export function destroyStationPickerMap() {
  currentInitToken++;

  if (stationMap) {
    stationMap.remove();
    stationMap = null;
    markerClusterGroup = null;
  }
  pickedCallback = null;
}