/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

const DATA_BASE_PATH = '/data/climate/tiles/';

const INITIAL_SEARCH_RADIUS_KM = 150;
const MAX_SEARCH_RADIUS_KM = 5000;
const SEARCH_RADIUS_GROWTH_FACTOR = 2;
const SAFETY_MARGIN_RATIO = 0.8;

let cachedTileIndex = null;
let tileIndexPromise = null;

const gridTileCache = new Map();
const gridTilePromises = new Map();

const dataTileCache = new Map();
const dataTilePromises = new Map();

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function kmToDegreeMargins(km, atLatDeg) {
  const latMarginDeg = km / 111.0;
  const cosLat = Math.max(Math.cos((atLatDeg * Math.PI) / 180), 0.05);
  const lonMarginDeg = Math.min(km / (111.0 * cosLat), 90);
  return { latMarginDeg, lonMarginDeg };
}

function bboxIntersectsMargin(bbox, lat, lon, latMarginDeg, lonMarginDeg) {
  return (
    bbox.latMax >= lat - latMarginDeg &&
    bbox.latMin <= lat + latMarginDeg &&
    bbox.lonMax >= lon - lonMarginDeg &&
    bbox.lonMin <= lon + lonMarginDeg
  );
}

function formatTilePattern(pattern, tileId) {
  return pattern.replace('{id:02d}', String(tileId).padStart(2, '0'));
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (HTTP ${res.status})`);
  return res.json();
}

async function fetchTypedArray(url, TypedArrayCtor) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (HTTP ${res.status})`);
  const buf = await res.arrayBuffer();
  return new TypedArrayCtor(buf);
}

export async function loadTileIndex() {
  if (cachedTileIndex) return cachedTileIndex;
  if (!tileIndexPromise) {
    tileIndexPromise = fetchJSON(DATA_BASE_PATH + 'tile-index.json').then((idx) => {
      cachedTileIndex = idx;
      return idx;
    });
  }
  return tileIndexPromise;
}

function tileBbox(tileMeta) {
  return {
    latMin: tileMeta.latMin,
    latMax: tileMeta.latMax,
    lonMin: tileMeta.lonMin,
    lonMax: tileMeta.lonMax,
  };
}

async function loadGridTile(tileId, tileIndex) {
  if (gridTileCache.has(tileId)) return gridTileCache.get(tileId);
  if (gridTilePromises.has(tileId)) return gridTilePromises.get(tileId);

  const promise = (async () => {
    const gridBase = formatTilePattern(tileIndex.gridFilePattern, tileId);
    const manifest = await fetchJSON(DATA_BASE_PATH + gridBase + '.manifest.json');

    const binFile = manifest.buffers.int16;
    const raw = await fetchTypedArray(DATA_BASE_PATH + binFile, Int16Array);

    const nodata = manifest.nodata.int16;
    const latInfo = manifest.fields.lat;
    const lonInfo = manifest.fields.lon;
    const n = manifest.nCells;

    const lat = new Float64Array(n);
    const lon = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const rawLat = raw[latInfo.offset + i];
      const rawLon = raw[lonInfo.offset + i];
      lat[i] = rawLat === nodata ? NaN : rawLat / latInfo.scale;
      lon[i] = rawLon === nodata ? NaN : rawLon / lonInfo.scale;
    }

    const entry = { manifest, lat, lon };
    gridTileCache.set(tileId, entry);
    return entry;
  })();

  gridTilePromises.set(tileId, promise);
  return promise;
}

/**
 * @returns {Promise<{tileId:number, cellIndex:number, lat:number, lon:number, distanceKm:number}|null>}
 */
export async function findNearestGridCell(latitude, longitude) {
  const tileIndex = await loadTileIndex();
  if (!tileIndex.tiles || tileIndex.tiles.length === 0) return null;

  let radiusKm = INITIAL_SEARCH_RADIUS_KM;
  let best = null;
  const checkedTileIds = new Set();

  while (radiusKm <= MAX_SEARCH_RADIUS_KM) {
    const { latMarginDeg, lonMarginDeg } = kmToDegreeMargins(radiusKm, latitude);

    const candidateTileIds = tileIndex.tiles
      .filter((t) => bboxIntersectsMargin(tileBbox(t), latitude, longitude, latMarginDeg, lonMarginDeg))
      .map((t) => t.id)
      .filter((id) => !checkedTileIds.has(id));

    if (candidateTileIds.length > 0) {
      const grids = await Promise.all(candidateTileIds.map((id) => loadGridTile(id, tileIndex)));

      grids.forEach((grid, i) => {
        const tileId = candidateTileIds[i];
        checkedTileIds.add(tileId);
        const { lat, lon } = grid;
        for (let cellIndex = 0; cellIndex < lat.length; cellIndex++) {
          if (Number.isNaN(lat[cellIndex]) || Number.isNaN(lon[cellIndex])) continue;
          const d = haversineKm(latitude, longitude, lat[cellIndex], lon[cellIndex]);
          if (!best || d < best.distanceKm) {
            best = { tileId, cellIndex, lat: lat[cellIndex], lon: lon[cellIndex], distanceKm: d };
          }
        }
      });
    }

    if (best && best.distanceKm <= radiusKm * SAFETY_MARGIN_RATIO) {
      return best;
    }

    radiusKm *= SEARCH_RADIUS_GROWTH_FACTOR;
  }

  return best;
}

export async function loadTileData(tileId) {
  if (dataTileCache.has(tileId)) return dataTileCache.get(tileId);
  if (dataTilePromises.has(tileId)) return dataTilePromises.get(tileId);

  const promise = (async () => {
    const tileIndex = await loadTileIndex();
    const dataBase = formatTilePattern(tileIndex.dataFilePattern, tileId);
    const manifest = await fetchJSON(DATA_BASE_PATH + dataBase + '.manifest.json');

    const buffers = {};
    if (manifest.buffers.int8) {
      buffers.int8 = await fetchTypedArray(DATA_BASE_PATH + manifest.buffers.int8, Int8Array);
    }
    if (manifest.buffers.int16) {
      buffers.int16 = await fetchTypedArray(DATA_BASE_PATH + manifest.buffers.int16, Int16Array);
    }

    const entry = { manifest, buffers };
    dataTileCache.set(tileId, entry);
    return entry;
  })();

  dataTilePromises.set(tileId, promise);
  return promise;
}

/**
 *
 * @param {object} tileDataEntry
 * @param {string} base
 * @param {string} variable
 * @param {string} stat
 * @param {number} cellIndex
 * @returns {number[]|number|null}
 */
export function decodeCellField(tileDataEntry, base, variable, stat, cellIndex) {
  const { manifest, buffers } = tileDataEntry;
  const baseEntry = manifest.bases[base];
  if (!baseEntry) return null;
  const info = baseEntry.variables[variable] && baseEntry.variables[variable][stat];
  if (!info) return null;

  const buffer = buffers[info.dtype];
  const nodata = manifest.nodata[info.dtype];
  const monthsPerCell = baseEntry.monthsPerCell || 1;

  if (monthsPerCell === 1) {
    const raw = buffer[info.offset + cellIndex];
    return raw === nodata ? null : raw / info.scale;
  }

  const start = info.offset + cellIndex * monthsPerCell;
  const values = new Array(monthsPerCell);
  for (let m = 0; m < monthsPerCell; m++) {
    const raw = buffer[start + m];
    values[m] = raw === nodata ? null : raw / info.scale;
  }
  return values;
}

export function listAvailableBases(tileDataEntry) {
  return Object.keys(tileDataEntry.manifest.bases);
}

export function __resetCachesForTests() {
  cachedTileIndex = null;
  tileIndexPromise = null;
  gridTileCache.clear();
  gridTilePromises.clear();
  dataTileCache.clear();
  dataTilePromises.clear();
}
