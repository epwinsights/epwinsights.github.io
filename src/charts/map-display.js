/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import state from '../state.js';
import { getEnglishLabeledStyle, FALLBACK_STYLE_URL } from './map-style.js';

let handleMapResize = null;
let mapResizeObserver = null;
let orientationTimeout = null;

let scrollHintEl = null;
let currentMarker = null;
let currentDisplayToken = 0;

export async function displayLocationOnMap(latitude, longitude, locationName) {
  const mapContainer = document.getElementById('map-container');
  if (!mapContainer) {
    console.error('Map container not found!');
    return;
  }

  destroyLocationMap();
  const myToken = ++currentDisplayToken;

  let style;
  try {
    style = await getEnglishLabeledStyle();
  } catch (error) {
    console.error('Falling back to the default map style:', error);
    style = FALLBACK_STYLE_URL;
  }

  if (myToken !== currentDisplayToken) return;

  state.map = new window.maplibregl.Map({
    container: 'map-container',
    style,
    center: [longitude, latitude],
    zoom: 4,
    scrollZoom: false,
    attributionControl: { compact: true }
  });

  state.map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  state.map.once('idle', () => collapseAttributionByDefault(state.map));

  setupScrollZoomAffordance(mapContainer);

  const markerEl = document.createElement('img');
  markerEl.src = '/img/marker-icon.svg';
  markerEl.className = 'my-custom-marker';
  markerEl.style.width = '28px';
  markerEl.style.height = '28px';

  currentMarker = new window.maplibregl.Marker({ element: markerEl, anchor: 'bottom' })
    .setLngLat([longitude, latitude])
    .addTo(state.map);

  if (locationName) {
    const popup = new window.maplibregl.Popup({ offset: 28, className: 'my-custom-popup' }).setHTML(
      `<div class="my-custom-popup-content"><b>${locationName}</b><br>${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°</div>`
    );
    currentMarker.setPopup(popup);
  }

  state.map.once('load', () => {
    if (state.map) state.map.resize();
  });

  setupMapResizeHandler();
}

export function destroyLocationMap() {
  currentDisplayToken++;
  cleanupMapResizeHandler();
  cleanupScrollZoomAffordance();

  currentMarker = null;

  if (state.map) {
    state.map.remove();
    state.map = null;
  }
}

function collapseAttributionByDefault(map) {
  const attribEl = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
  if (attribEl) {
    attribEl.classList.remove('maplibregl-compact-show');
  }
}

function setupScrollZoomAffordance(mapContainer) {
  scrollHintEl = document.createElement('div');
  scrollHintEl.className = 'map-scroll-hint';
  scrollHintEl.textContent = 'Click to enable scroll zoom';
  mapContainer.parentElement.appendChild(scrollHintEl);

  const enableScrollZoom = () => {
    state.map.scrollZoom.enable();
    scrollHintEl.classList.add('map-scroll-hint-hidden');
  };

  const disableScrollZoom = () => {
    state.map.scrollZoom.disable();
    scrollHintEl.classList.remove('map-scroll-hint-hidden');
  };

  state.map.on('click', enableScrollZoom);
  state.map.getContainer().addEventListener('mouseleave', disableScrollZoom);
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
        state.map.resize();
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
