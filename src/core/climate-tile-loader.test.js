/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadTileIndex,
  findNearestGridCell,
  loadTileData,
  decodeCellField,
  listAvailableBases,
  __resetCachesForTests
} from './climate-tile-loader.js';

const DATA_BASE_PATH = '/data/climate/tiles/';
const NODATA_I16 = -32768;
const NODATA_I8 = -128;

// Fixture builders
// These mirror the encoding scheme produced by the real pipeline
// (step2_binarize.py / tile_merged_v6.py): raw = round(value * scale),
// with a fixed nodata sentinel per dtype.

function tileIdStr(id) {
  return String(id).padStart(2, '0');
}

/**
 * Builds a lightweight grid-tile fixture (climate-grid-index.tileNN):
 * a manifest + the matching Int16Array binary, laid out as
 * [lat values..., lon values...] exactly like tile_merged_v6.py's output.
 * `lats`/`lons` entries of `null` become the nodata sentinel (ocean/missing cell).
 */
function buildGridTileFixture({ tileId, lats, lons, scaleLat = 100, scaleLon = 100 }) {
  const n = lats.length;
  const rawLat = lats.map(v => (v === null ? NODATA_I16 : Math.round(v * scaleLat)));
  const rawLon = lons.map(v => (v === null ? NODATA_I16 : Math.round(v * scaleLon)));
  const buffer = new Int16Array([...rawLat, ...rawLon]);

  const gridBase = `climate-grid-index.tile${tileIdStr(tileId)}`;
  const binFile = `${gridBase}.i16.bin`;

  const manifest = {
    type: 'grid-index',
    nCells: n,
    nodata: { int16: NODATA_I16 },
    buffers: { int16: binFile },
    fields: {
      lat: { dtype: 'int16', offset: 0, scale: scaleLat },
      lon: { dtype: 'int16', offset: n, scale: scaleLon }
    }
  };

  return {
    manifestUrl: DATA_BASE_PATH + gridBase + '.manifest.json',
    binUrl: DATA_BASE_PATH + binFile,
    manifest,
    buffer
  };
}

/** Small helper to lay out several fields sequentially into one flat typed-array buffer. */
function makeFieldLayoutBuilder() {
  let offset = 0;
  const values = [];
  return {
    add(rawValues) {
      const start = offset;
      values.push(...rawValues);
      offset += rawValues.length;
      return start;
    },
    values
  };
}

/**
 * Builds a combined data-tile fixture (data.tileNN): a manifest + Int8Array/Int16Array
 * binaries, matching the structure produced by tile_merged_v6.py (see
 * data_tile00_manifest.json). Includes one monthly temperature base
 * (monthsPerCell: 12) and one scalar index base (monthsPerCell absent).
 */
function buildDataTileFixture(tileId) {
  const nCells = 3;

  // --- int8 buffer: tas.mean / tas.std for 3 cells x 12 months each ---
  const i8 = makeFieldLayoutBuilder();
  const tasMeanRaw = [
    ...[10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21], // cell0: 1.0..2.1
    ...Array(12).fill(5), // cell1: 0.5 every month
    ...[20, 20, 20, 20, 20, NODATA_I8, 20, 20, 20, 20, 20, 20] // cell2: 2.0, month5 missing
  ];
  const tasStdRaw = [
    ...Array(12).fill(3), // cell0 std: 0.3
    ...Array(12).fill(2), // cell1 std: 0.2
    ...Array(12).fill(1) // cell2 std: 0.1
  ];
  const tasMeanOffset = i8.add(tasMeanRaw);
  const tasStdOffset = i8.add(tasStdRaw);
  const int8Buffer = new Int8Array(i8.values);

  // --- int16 buffer: cdd.mean / cdd.std, one scalar per cell ---
  const i16 = makeFieldLayoutBuilder();
  const cddMeanRaw = [123, 45, NODATA_I16]; // cell2 missing
  const cddStdRaw = [30, 25, 20];
  const cddMeanOffset = i16.add(cddMeanRaw);
  const cddStdOffset = i16.add(cddStdRaw);
  const int16Buffer = new Int16Array(i16.values);

  const dataBase = `data.tile${tileIdStr(tileId)}`;
  const int8File = `${dataBase}.i8.bin`;
  const int16File = `${dataBase}.i16.bin`;

  const manifest = {
    tileId,
    nCells,
    gridFile: `climate-grid-index.tile${tileIdStr(tileId)}.i16.bin`,
    gridManifest: `climate-grid-index.tile${tileIdStr(tileId)}.manifest.json`,
    nodata: { int8: NODATA_I8, int16: NODATA_I16 },
    buffers: { int8: int8File, int16: int16File },
    bases: {
      'climate-temp-ssp245-2050': {
        ssp: 'ssp245',
        period: '2050',
        monthsPerCell: 12,
        variables: {
          tas: {
            mean: { dtype: 'int8', offset: tasMeanOffset, scale: 10 },
            std: { dtype: 'int8', offset: tasStdOffset, scale: 10 }
          }
        }
      },
      'climate-indices-ssp245-2050': {
        ssp: 'ssp245',
        period: '2050',
        variables: {
          cdd: {
            mean: { dtype: 'int16', offset: cddMeanOffset, scale: 10 },
            std: { dtype: 'int16', offset: cddStdOffset, scale: 10 }
          }
        }
      }
    }
  };

  return {
    manifestUrl: DATA_BASE_PATH + dataBase + '.manifest.json',
    int8Url: DATA_BASE_PATH + int8File,
    int16Url: DATA_BASE_PATH + int16File,
    manifest,
    int8Buffer,
    int16Buffer
  };
}

// fetch mock plumbing
/**
 * Installs a global fetch mock backed by a routing table:
 *   routes.json:   Map<url, object>       -> served as res.json()
 *   routes.binary: Map<url, TypedArray>   -> served as res.arrayBuffer()
 * Any URL not present in either map resolves with { ok: false, status: 404 }.
 * Returns the vi.fn() so call counts / call args can be inspected per URL.
 */
function installFetchMock() {
  const jsonRoutes = new Map();
  const binaryRoutes = new Map();

  const fetchMock = vi.fn(async (url) => {
    if (jsonRoutes.has(url)) {
      return { ok: true, status: 200, json: async () => jsonRoutes.get(url) };
    }
    if (binaryRoutes.has(url)) {
      const typed = binaryRoutes.get(url);
      // Return a fresh copy of the underlying buffer each time, the same way a
      // real network response would (no shared references back to the fixture).
      const copy = typed.buffer.slice(typed.byteOffset, typed.byteOffset + typed.byteLength);
      return { ok: true, status: 200, arrayBuffer: async () => copy };
    }
    return { ok: false, status: 404, json: async () => { throw new Error('not found'); } };
  });

  global.fetch = fetchMock;

  return {
    fetchMock,
    registerJSON(url, body) { jsonRoutes.set(url, body); },
    registerBinary(url, typedArray) { binaryRoutes.set(url, typedArray); },
    callsFor(url) { return fetchMock.mock.calls.filter(c => c[0] === url).length; }
  };
}

function buildTileIndexFixture(tiles) {
  return {
    nCellsTotal: tiles.reduce((s, t) => s + t.nCells, 0),
    gridFilePattern: 'climate-grid-index.tile{id:02d}',
    dataFilePattern: 'data.tile{id:02d}',
    tiles
  };
}

let mock;

beforeEach(() => {
  mock = installFetchMock();
  __resetCachesForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete global.fetch;
});

// loadTileIndex
describe('loadTileIndex', () => {
  it('fetches tile-index.json and caches the result across calls', async () => {
    const tileIndex = buildTileIndexFixture([
      { id: 0, latMin: 0, latMax: 10, lonMin: 0, lonMax: 10, nCells: 3 }
    ]);
    mock.registerJSON(DATA_BASE_PATH + 'tile-index.json', tileIndex);

    const first = await loadTileIndex();
    const second = await loadTileIndex();

    expect(first).toEqual(tileIndex);
    expect(second).toBe(first);
    expect(mock.callsFor(DATA_BASE_PATH + 'tile-index.json')).toBe(1);
  });

  it('throws a descriptive error when the request fails', async () => {
    // Nothing registered -> mock resolves with ok: false.
    await expect(loadTileIndex()).rejects.toThrow(/Failed to load/);
  });

  it('re-fetches after __resetCachesForTests clears the cache', async () => {
    const tileIndex = buildTileIndexFixture([]);
    mock.registerJSON(DATA_BASE_PATH + 'tile-index.json', tileIndex);

    await loadTileIndex();
    __resetCachesForTests();
    await loadTileIndex();

    expect(mock.callsFor(DATA_BASE_PATH + 'tile-index.json')).toBe(2);
  });
});

// findNearestGridCell
describe('findNearestGridCell', () => {
  it('returns null immediately when the tile index has no tiles', async () => {
    mock.registerJSON(DATA_BASE_PATH + 'tile-index.json', buildTileIndexFixture([]));
    const result = await findNearestGridCell(10, 10);
    expect(result).toBeNull();
  });

  it('finds the nearest valid land cell within a single covering tile', async () => {
    const tileIndex = buildTileIndexFixture([
      { id: 0, latMin: 0, latMax: 20, lonMin: 0, lonMax: 20, nCells: 3 }
    ]);
    mock.registerJSON(DATA_BASE_PATH + 'tile-index.json', tileIndex);

    const grid = buildGridTileFixture({
      tileId: 0,
      lats: [10.01, 12, 15],
      lons: [10.01, 12, 15]
    });
    mock.registerJSON(grid.manifestUrl, grid.manifest);
    mock.registerBinary(grid.binUrl, grid.buffer);

    const result = await findNearestGridCell(10, 10);

    expect(result).not.toBeNull();
    expect(result.tileId).toBe(0);
    expect(result.cellIndex).toBe(0); // cell (10.01, 10.01) is nearest to (10, 10)
    expect(result.distanceKm).toBeGreaterThan(0);
    expect(result.distanceKm).toBeLessThan(5);
  });

  it('skips nodata (ocean) cells when searching for the nearest land cell', async () => {
    const tileIndex = buildTileIndexFixture([
      { id: 0, latMin: 0, latMax: 20, lonMin: 0, lonMax: 20, nCells: 3 }
    ]);
    mock.registerJSON(DATA_BASE_PATH + 'tile-index.json', tileIndex);

    // Cell 0 is geometrically closest but is an ocean/nodata cell -> must be skipped.
    const grid = buildGridTileFixture({
      tileId: 0,
      lats: [null, 12, 15],
      lons: [null, 12, 15]
    });
    mock.registerJSON(grid.manifestUrl, grid.manifest);
    mock.registerBinary(grid.binUrl, grid.buffer);

    const result = await findNearestGridCell(10, 10);

    expect(result.cellIndex).toBe(1);
    expect(result.lat).toBeCloseTo(12, 5);
    expect(result.lon).toBeCloseTo(12, 5);
  });

  it('keeps expanding the search radius when the best distance is not safely inside the current radius', async () => {
    // Single tile, only candidate cell is ~140km away at the initial 150km radius.
    // distanceKm / radiusKm = 140/150 ≈ 0.93 > SAFETY_MARGIN_RATIO (0.8), so the
    // loop must double the radius (to 300km) before accepting the result, even
    // though no better cell exists and no new tile is discovered.
    const tileIndex = buildTileIndexFixture([
      { id: 0, latMin: -80, latMax: 80, lonMin: -170, lonMax: 170, nCells: 1 }
    ]);
    mock.registerJSON(DATA_BASE_PATH + 'tile-index.json', tileIndex);

    // ~1.26 degrees of latitude ≈ 140 km.
    const grid = buildGridTileFixture({ tileId: 0, lats: [11.26], lons: [10] });
    mock.registerJSON(grid.manifestUrl, grid.manifest);
    mock.registerBinary(grid.binUrl, grid.buffer);

    const result = await findNearestGridCell(10, 10);

    expect(result.tileId).toBe(0);
    expect(result.cellIndex).toBe(0);
    expect(result.distanceKm).toBeGreaterThan(130);
    expect(result.distanceKm).toBeLessThan(150);
    // The tile's grid file must only be fetched once even though the search
    // spanned two radius iterations (checkedTileIds prevents a re-fetch).
    expect(mock.callsFor(grid.manifestUrl)).toBe(1);
    expect(mock.callsFor(grid.binUrl)).toBe(1);
  });

  it('discovers a nearer cell in a neighboring tile only revealed after the radius expands (tile-boundary case)', async () => {
    // Tile A covers the query point but its only land cell is far away (~782 km),
    // so the first pass (150km radius, safety threshold 150*0.8=120km) cannot
    // accept it and the search must expand.
    //
    // Tile B's bbox (latMin: 12.0) is genuinely outside the 150km search margin:
    // query lat 10 + latMarginDeg(150km) = 10 + 150/111 ≈ 11.351 < 12.0, so tile B
    // is NOT a candidate on the first pass. Only once the radius doubles to 300km
    // (margin ≈ 10 + 300/111 ≈ 12.703 >= 12.0) does tile B's bbox intersect the
    // search margin, revealing a much closer cell (~228 km) that becomes the new
    // best and satisfies the 300*0.8=240km safety threshold.
    const tileIndex = buildTileIndexFixture([
      { id: 0, latMin: 5, latMax: 10, lonMin: 5, lonMax: 15, nCells: 1 }, // tile A
      { id: 1, latMin: 12.0, latMax: 20, lonMin: 5, lonMax: 15, nCells: 1 } // tile B
    ]);
    mock.registerJSON(DATA_BASE_PATH + 'tile-index.json', tileIndex);

    const gridA = buildGridTileFixture({ tileId: 0, lats: [5], lons: [5] }); // ~782km away
    mock.registerJSON(gridA.manifestUrl, gridA.manifest);
    mock.registerBinary(gridA.binUrl, gridA.buffer);

    const gridB = buildGridTileFixture({ tileId: 1, lats: [12.05], lons: [10] }); // ~228km away
    mock.registerJSON(gridB.manifestUrl, gridB.manifest);
    mock.registerBinary(gridB.binUrl, gridB.buffer);

    const result = await findNearestGridCell(10, 10);

    expect(result.tileId).toBe(1);
    expect(result.cellIndex).toBe(0);
    expect(result.distanceKm).toBeGreaterThan(200);
    expect(result.distanceKm).toBeLessThan(250);
    // Tile B must only be fetched once the radius expands past the first pass,
    // and neither tile should ever be re-fetched once checked.
    expect(mock.callsFor(gridA.binUrl)).toBe(1);
    expect(mock.callsFor(gridB.binUrl)).toBe(1);
  });

  it('returns null when no valid land cell exists anywhere up to the max search radius', async () => {
    const tileIndex = buildTileIndexFixture([
      { id: 0, latMin: -80, latMax: 80, lonMin: -170, lonMax: 170, nCells: 2 }
    ]);
    mock.registerJSON(DATA_BASE_PATH + 'tile-index.json', tileIndex);

    // All cells are nodata (ocean) -> should never resolve to a cell, even
    // after the radius grows past MAX_SEARCH_RADIUS_KM.
    const grid = buildGridTileFixture({ tileId: 0, lats: [null, null], lons: [null, null] });
    mock.registerJSON(grid.manifestUrl, grid.manifest);
    mock.registerBinary(grid.binUrl, grid.buffer);

    const result = await findNearestGridCell(10, 10);

    expect(result).toBeNull();
    // The single tile is only checked once (checkedTileIds), regardless of
    // how many radius doublings it takes to hit the max radius.
    expect(mock.callsFor(grid.binUrl)).toBe(1);
  });
});

// loadTileData
describe('loadTileData', () => {
  it('fetches the manifest and both buffers, decoding them into typed arrays', async () => {
    const tileIndex = buildTileIndexFixture([
      { id: 5, latMin: 0, latMax: 10, lonMin: 0, lonMax: 10, nCells: 3 }
    ]);
    mock.registerJSON(DATA_BASE_PATH + 'tile-index.json', tileIndex);

    const data = buildDataTileFixture(5);
    mock.registerJSON(data.manifestUrl, data.manifest);
    mock.registerBinary(data.int8Url, data.int8Buffer);
    mock.registerBinary(data.int16Url, data.int16Buffer);

    const entry = await loadTileData(5);

    expect(entry.manifest).toEqual(data.manifest);
    expect(entry.buffers.int8).toBeInstanceOf(Int8Array);
    expect(entry.buffers.int16).toBeInstanceOf(Int16Array);
    expect(Array.from(entry.buffers.int8)).toEqual(Array.from(data.int8Buffer));
    expect(Array.from(entry.buffers.int16)).toEqual(Array.from(data.int16Buffer));
  });

  it('caches per tileId so repeated and concurrent calls only fetch once', async () => {
    const tileIndex = buildTileIndexFixture([
      { id: 5, latMin: 0, latMax: 10, lonMin: 0, lonMax: 10, nCells: 3 }
    ]);
    mock.registerJSON(DATA_BASE_PATH + 'tile-index.json', tileIndex);

    const data = buildDataTileFixture(5);
    mock.registerJSON(data.manifestUrl, data.manifest);
    mock.registerBinary(data.int8Url, data.int8Buffer);
    mock.registerBinary(data.int16Url, data.int16Buffer);

    const [a, b] = await Promise.all([loadTileData(5), loadTileData(5)]);
    const c = await loadTileData(5);

    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(mock.callsFor(data.manifestUrl)).toBe(1);
    expect(mock.callsFor(data.int8Url)).toBe(1);
    expect(mock.callsFor(data.int16Url)).toBe(1);
  });

  it('only fetches buffer dtypes actually present in the manifest', async () => {
    const tileIndex = buildTileIndexFixture([
      { id: 7, latMin: 0, latMax: 10, lonMin: 0, lonMax: 10, nCells: 2 }
    ]);
    mock.registerJSON(DATA_BASE_PATH + 'tile-index.json', tileIndex);

    const int16Only = new Int16Array([1, 2, 3]);
    const manifest = {
      tileId: 7,
      nCells: 2,
      gridFile: 'climate-grid-index.tile07.i16.bin',
      gridManifest: 'climate-grid-index.tile07.manifest.json',
      nodata: { int8: NODATA_I8, int16: NODATA_I16 },
      buffers: { int16: 'data.tile07.i16.bin' }, // no int8 entry
      bases: {}
    };
    mock.registerJSON(DATA_BASE_PATH + 'data.tile07.manifest.json', manifest);
    mock.registerBinary(DATA_BASE_PATH + 'data.tile07.i16.bin', int16Only);

    const entry = await loadTileData(7);

    expect(entry.buffers.int16).toBeInstanceOf(Int16Array);
    expect(entry.buffers.int8).toBeUndefined();
    expect(mock.callsFor(DATA_BASE_PATH + 'data.tile07.i8.bin')).toBe(0);
  });
});

// decodeCellField / listAvailableBases
describe('decodeCellField', () => {
  let entry;

  beforeEach(async () => {
    const tileIndex = buildTileIndexFixture([
      { id: 9, latMin: 0, latMax: 10, lonMin: 0, lonMax: 10, nCells: 3 }
    ]);
    mock.registerJSON(DATA_BASE_PATH + 'tile-index.json', tileIndex);

    const data = buildDataTileFixture(9);
    mock.registerJSON(data.manifestUrl, data.manifest);
    mock.registerBinary(data.int8Url, data.int8Buffer);
    mock.registerBinary(data.int16Url, data.int16Buffer);

    entry = await loadTileData(9);
  });

  it('decodes a monthly (monthsPerCell: 12) field into a 12-value array', () => {
    const cell0 = decodeCellField(entry, 'climate-temp-ssp245-2050', 'tas', 'mean', 0);
    expect(cell0).toHaveLength(12);
    [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1].forEach((expected, i) => {
      expect(cell0[i]).toBeCloseTo(expected, 5);
    });

    const cell1 = decodeCellField(entry, 'climate-temp-ssp245-2050', 'tas', 'mean', 1);
    cell1.forEach(v => expect(v).toBeCloseTo(0.5, 5));
  });

  it('decodes nodata months within a monthly field as null, keeping the rest', () => {
    const cell2 = decodeCellField(entry, 'climate-temp-ssp245-2050', 'tas', 'mean', 2);
    expect(cell2).toHaveLength(12);
    expect(cell2[5]).toBeNull();
    [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11].forEach(i => expect(cell2[i]).toBeCloseTo(2.0, 5));
  });

  it('decodes a scalar (monthsPerCell absent) field as a single number', () => {
    expect(decodeCellField(entry, 'climate-indices-ssp245-2050', 'cdd', 'mean', 0)).toBeCloseTo(12.3, 5);
    expect(decodeCellField(entry, 'climate-indices-ssp245-2050', 'cdd', 'std', 1)).toBeCloseTo(2.5, 5);
  });

  it('decodes a nodata scalar field as null', () => {
    expect(decodeCellField(entry, 'climate-indices-ssp245-2050', 'cdd', 'mean', 2)).toBeNull();
  });

  it('returns null for an unknown base', () => {
    expect(decodeCellField(entry, 'climate-temp-ssp999-2050', 'tas', 'mean', 0)).toBeNull();
  });

  it('returns null for a known base but unknown variable', () => {
    expect(decodeCellField(entry, 'climate-temp-ssp245-2050', 'tasmax', 'mean', 0)).toBeNull();
  });

  it('returns null for a known base/variable but unknown stat', () => {
    expect(decodeCellField(entry, 'climate-temp-ssp245-2050', 'tas', 'median', 0)).toBeNull();
  });
});

describe('listAvailableBases', () => {
  it('lists every base key present in the tile manifest', async () => {
    const tileIndex = buildTileIndexFixture([
      { id: 9, latMin: 0, latMax: 10, lonMin: 0, lonMax: 10, nCells: 3 }
    ]);
    mock.registerJSON(DATA_BASE_PATH + 'tile-index.json', tileIndex);

    const data = buildDataTileFixture(9);
    mock.registerJSON(data.manifestUrl, data.manifest);
    mock.registerBinary(data.int8Url, data.int8Buffer);
    mock.registerBinary(data.int16Url, data.int16Buffer);

    const entry = await loadTileData(9);
    expect(listAvailableBases(entry).sort()).toEqual(
      ['climate-indices-ssp245-2050', 'climate-temp-ssp245-2050'].sort()
    );
  });
});
