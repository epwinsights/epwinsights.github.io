/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import state from '../state.js';

let handleMapResize = null;
let mapResizeObserver = null;
let orientationTimeout = null;

let scrollHintEl = null;

export function displayLocationOnMap(latitude, longitude, locationName) {
  const mapContainer = document.getElementById('map-container');
  if (!mapContainer) {
    console.error('Map container not found!');
    return;
  }

  destroyLocationMap();

  state.map = window.L.map('map-container', {
    scrollWheelZoom: false,
    zoomControl: false
  }).setView([latitude, longitude], 4);

  window.L.control.zoom({
    position: 'bottomright'
  }).addTo(state.map);

  setupScrollZoomAffordance(mapContainer);

  window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    attribution: '© OpenStreetMap contributors © CARTO',
    subdomains: 'abcd'
  }).addTo(state.map);

  const customIcon = window.L.icon({
    iconUrl: '/img/marker-icon.svg',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
    className: 'my-custom-marker'
  });

  const marker = window.L.marker([latitude, longitude], { icon: customIcon }).addTo(state.map);
  if (locationName) {
    marker.bindPopup(
      `<div class="my-custom-popup-content"><b>${locationName}</b><br>${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°</div>`,
      { className: 'my-custom-popup' }
    );
  }

  setTimeout(() => {
    if (state.map) {
      state.map.invalidateSize();
    }
  }, 100);

  setupMapResizeHandler();
}

export function destroyLocationMap() {
  cleanupMapResizeHandler();
  cleanupScrollZoomAffordance();

  if (state.map) {
    state.map.remove();
    state.map = null;
  }
}

function setupScrollZoomAffordance(mapContainer) {
  scrollHintEl = document.createElement('div');
  scrollHintEl.className = 'map-scroll-hint';
  scrollHintEl.textContent = 'Click to enable scroll zoom';
  mapContainer.parentElement.appendChild(scrollHintEl);

  const enableScrollZoom = () => {
    state.map.scrollWheelZoom.enable();
    scrollHintEl.classList.add('map-scroll-hint-hidden');
  };

  const disableScrollZoom = () => {
    state.map.scrollWheelZoom.disable();
    scrollHintEl.classList.remove('map-scroll-hint-hidden');
  };

  state.map.on('click', enableScrollZoom);
  state.map.on('mouseout', disableScrollZoom);
}

function cleanupScrollZoomAffordance() {
  if (scrollHintEl && scrollHintEl.parentElement) {
    scrollHintEl.parentElement.removeChild(scrollHintEl);
  }
  scrollHintEl = null;
}

function setupMapResizeHandler() {
  cleanupMapResizeHandler();

  let resizeTimeout;

  handleMapResize = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (state.map) {
        state.map.invalidateSize({
          animate: false,
          pan: false
        });

        setTimeout(() => {
          if (state.map) {
            state.map.invalidateSize(true);
          }
        }, 50);
      }
    }, 100);
  };

  window.addEventListener('resize', handleMapResize);
  window.addEventListener('orientationchange', handleOrientationChange);

  if (window.ResizeObserver) {
    const mapContainer = document.getElementById('map-container');
    if (mapContainer) {
      mapResizeObserver = new ResizeObserver(handleMapResize);
      mapResizeObserver.observe(mapContainer);
    }
  }
}

function handleOrientationChange() {
  clearTimeout(orientationTimeout);
  orientationTimeout = setTimeout(() => {
    if (handleMapResize) handleMapResize();
  }, 200);
}

function cleanupMapResizeHandler() {
  if (handleMapResize) {
    window.removeEventListener('resize', handleMapResize);
    handleMapResize = null;
  }
  window.removeEventListener('orientationchange', handleOrientationChange);
  clearTimeout(orientationTimeout);

  if (mapResizeObserver) {
    mapResizeObserver.disconnect();
    mapResizeObserver = null;
  }
}