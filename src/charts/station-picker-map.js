/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 * Data source: NREL/EnergyPlus master.geojson, trimmed at build time by
 */

import { getEnglishLabeledStyle, FALLBACK_STYLE_URL } from './map-style.js';

const DATA_URL = '/data/station-index.json';

const CLUSTER_RADIUS = 45;
const CLUSTER_MAX_ZOOM = 8;

const LOADING_HTML = `
  <div class="station-picker-loading">
    <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
    <span>Loading station index…</span>
  </div>
`;

let stationMap = null;
let clusterIndex = null;
let allStations = null;
let loadPromise = null;
let pickedCallback = null;

let renderedMarkers = [];
let currentInitToken = 0;
let mapMoveHandler = null;

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

function clusterSizeClass(pointCount) {
  if (pointCount < 10) return 'marker-cluster-small';
  if (pointCount < 100) return 'marker-cluster-medium';
  return 'marker-cluster-large';
}

function stationsToGeoJSON(stations) {
  return stations.map((station) => ({
    type: 'Feature',
    properties: station,
    geometry: { type: 'Point', coordinates: [station.lon, station.lat] }
  }));
}

function buildClusterIndex(stations) {
  const index = new window.Supercluster({
    radius: CLUSTER_RADIUS,
    maxZoom: CLUSTER_MAX_ZOOM
  });
  index.load(stationsToGeoJSON(stations));
  return index;
}

function clearRenderedMarkers() {
  renderedMarkers.forEach((marker) => marker.remove());
  renderedMarkers = [];
}

function createStationMarker(station) {
  const el = document.createElement('img');
  el.src = '/img/marker-icon.svg';
  el.className = 'my-custom-marker';
  el.style.width = '24px';
  el.style.height = '24px';

  const marker = new window.maplibregl.Marker({ element: el, anchor: 'bottom' })
    .setLngLat([station.lon, station.lat]);

  const popup = new window.maplibregl.Popup({ offset: 24, className: 'my-custom-popup' }).setHTML(buildPopupHtml(station));
  popup.on('open', () => {
    const popupEl = popup.getElement();
    const btn = popupEl && popupEl.querySelector('.station-download-btn');
    if (btn) {
      btn.addEventListener('click', () => handleStationPick(station), { once: true });
    }
  });
  marker.setPopup(popup);

  marker.addTo(stationMap);
  return marker;
}

function createClusterMarker(cluster) {
  const [lon, lat] = cluster.geometry.coordinates;
  const pointCount = cluster.properties.point_count;
  const clusterId = cluster.properties.cluster_id;

  const el = document.createElement('div');
  el.className = `custom-cluster-icon ${clusterSizeClass(pointCount)}`;
  el.innerHTML = `<div>${cluster.properties.point_count_abbreviated}</div>`;

  el.addEventListener('click', (event) => {
    event.stopPropagation();

    const expansionZoom = clusterIndex.getClusterExpansionZoom(clusterId);
    const canSplitFurther = expansionZoom <= CLUSTER_MAX_ZOOM;

    if (canSplitFurther) {
      stationMap.easeTo({ center: [lon, lat], zoom: expansionZoom });
    } else {
      spiderfyCluster(clusterId, lon, lat);
    }
  });

  const marker = new window.maplibregl.Marker({ element: el, anchor: 'center' })
    .setLngLat([lon, lat])
    .addTo(stationMap);

  return marker;
}

function spiderfyCluster(clusterId, centerLon, centerLat) {
  const leaves = clusterIndex.getLeaves(clusterId, Infinity);
  clearRenderedMarkers();

  const centerPoint = stationMap.project([centerLon, centerLat]);
  const radius = 12 + leaves.length * 4;
  const angleStep = (2 * Math.PI) / leaves.length;

  leaves.forEach((leaf, i) => {
    const angle = i * angleStep;
    const offsetPoint = {
      x: centerPoint.x + radius * Math.cos(angle),
      y: centerPoint.y + radius * Math.sin(angle)
    };
    const offsetLngLat = stationMap.unproject(offsetPoint);
    const marker = createStationMarker(leaf.properties);
    marker.setLngLat(offsetLngLat);
    renderedMarkers.push(marker);
  });
}

function renderVisibleStations() {
  if (!stationMap || !clusterIndex) return;

  clearRenderedMarkers();

  const bounds = stationMap.getBounds();
  const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
  const zoom = Math.round(stationMap.getZoom());
  const clusters = clusterIndex.getClusters(bbox, zoom);

  clusters.forEach((feature) => {
    if (feature.properties.cluster) {
      renderedMarkers.push(createClusterMarker(feature));
    } else {
      renderedMarkers.push(createStationMarker(feature.properties));
    }
  });
}

function collapseAttributionByDefault(map) {
  const attribEl = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
  if (attribEl) {
    attribEl.classList.remove('maplibregl-compact-show');
    attribEl.classList.add('attrib-visible');
  }
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

  let style;
  try {
    style = await getEnglishLabeledStyle();
  } catch (error) {
    console.error('Falling back to the default map style:', error);
    style = FALLBACK_STYLE_URL;
  }

  if (myToken !== currentInitToken) return;

  if (stationMap) {
    stationMap.remove();
    stationMap = null;
  }
  container.innerHTML = '';

  stationMap = new window.maplibregl.Map({
    container: containerId,
    style,
    center: [10, 20],
    zoom: 2,
    renderWorldCopies: true,
    attributionControl: { compact: true }
  });

  stationMap.once('idle', () => collapseAttributionByDefault(stationMap));

  clusterIndex = buildClusterIndex(stations);

  mapMoveHandler = () => renderVisibleStations();
  stationMap.on('moveend', mapMoveHandler);

  stationMap.once('load', () => {
    if (stationMap) {
      stationMap.resize();
      renderVisibleStations();
    }
  });
}

export function filterStationPickerMap(query) {
  if (!stationMap || !allStations) return;

  const container = stationMap.getContainer();
  hideEmptyMessage(container);

  const term = query.trim().toLowerCase();
  const filtered = term
    ? allStations.filter((station) => station.t.toLowerCase().includes(term))
    : allStations;

  clusterIndex = buildClusterIndex(filtered);

  if (filtered.length === 0) {
    clearRenderedMarkers();
    showEmptyMessage(container);
    return;
  }

  if (term) {
    const lons = filtered.map((s) => s.lon);
    const lats = filtered.map((s) => s.lat);
    stationMap.fitBounds(
      [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding: 40, maxZoom: 10 }
    );
  } else {
    stationMap.setCenter([10, 20]);
    stationMap.setZoom(2);
  }

  renderVisibleStations();
}

export function destroyStationPickerMap() {
  currentInitToken++;

  clearRenderedMarkers();

  if (stationMap) {
    if (mapMoveHandler) stationMap.off('moveend', mapMoveHandler);
    stationMap.remove();
    stationMap = null;
  }
  clusterIndex = null;
  mapMoveHandler = null;
  pickedCallback = null;
}
