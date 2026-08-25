/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersects =
      (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lon, lat, polygonCoords) {
  const [outer, ...holes] = polygonCoords;
  if (!pointInRing(lon, lat, outer)) return false;
  for (const hole of holes) {
    if (pointInRing(lon, lat, hole)) return false;
  }
  return true;
}

function normalizeRingForAntimeridian(ring) {
  const lons = ring.map(p => p[0]);
  const spansAntimeridian = Math.max(...lons) - Math.min(...lons) > 180;
  if (!spansAntimeridian) return { ring, shifted: false };
  const fixed = ring.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]);
  return { ring: fixed, shifted: true };
}

function pointInPolygonSafe(lon, lat, polygonCoords) {
  const rings = polygonCoords.map(normalizeRingForAntimeridian);
  const [outer, ...holes] = rings;

  const testLon = outer.shifted && lon < 0 ? lon + 360 : lon;
  if (!pointInRing(testLon, lat, outer.ring)) return false;

  for (const hole of holes) {
    const holeLon = hole.shifted && lon < 0 ? lon + 360 : lon;
    if (pointInRing(holeLon, lat, hole.ring)) return false;
  }
  return true;
}

export function findRegion(lat, lon, geojson) {
  for (const feature of geojson.features) {
    const { type, coordinates } = feature.geometry;

    if (type === "Polygon") {
      if (pointInPolygonSafe(lon, lat, coordinates)) {
        return feature.properties.acronym;
      }
    } else if (type === "MultiPolygon") {
      for (const polygon of coordinates) {
        if (pointInPolygonSafe(lon, lat, polygon)) {
          return feature.properties.acronym;
        }
      }
    }
  }
  return null;
}

export function findNearestRegion(lat, lon, geojson) {
  let best = null;
  let bestDist = Infinity;

  for (const feature of geojson.features) {
    const centroid = getRoughCentroid(feature.geometry);
    const d = haversine(lat, lon, centroid.lat, centroid.lon);
    if (d < bestDist) {
      bestDist = d;
      best = feature.properties.acronym;
    }
  }
  return best;
}

function getRoughCentroid(geometry) {
  const points = [];
  const collect = (ring) => ring.forEach(([lon, lat]) => points.push([lon, lat]));

  if (geometry.type === "Polygon") {
    collect(geometry.coordinates[0]);
  } else {
    geometry.coordinates.forEach(poly => collect(poly[0]));
  }

  const lon = points.reduce((s, p) => s + p[0], 0) / points.length;
  const lat = points.reduce((s, p) => s + p[1], 0) / points.length;
  return { lat, lon };
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
