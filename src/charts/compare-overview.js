/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import {
  formatSimpleLocation,
  formatCityNameOnly,
  formatStationDetail,
  countryNameMap,
  countryCodeMap
} from '../core/location-formatter.js';
import { addExportButton, addInfoButton } from '../core/svg-exporter.js';
import { isTabDataMissing } from '../core/data-quality-notice.js';

const CACHE_VERSION = 'v1';

function readCache(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function writeCache(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
  }
}

const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const flagMemoryCache = new Map();

async function fetchAsDataURL(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(response.statusText);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function getFlagDataURL(countryCode2) {
  const code = (countryCode2 || '').toLowerCase();
  if (!code) return TRANSPARENT_PIXEL;

  if (flagMemoryCache.has(code)) return flagMemoryCache.get(code);

  const storageKey = `epwi_flag_${CACHE_VERSION}_${code}`;
  const cached = readCache(storageKey);
  if (cached) {
    const cachedPromise = Promise.resolve(cached);
    flagMemoryCache.set(code, cachedPromise);
    return cachedPromise;
  }

  const promise = fetchAsDataURL(`https://flagcdn.com/h80/${code}.png`)
    .then(dataUrl => {
      writeCache(storageKey, dataUrl);
      return dataUrl;
    })
    .catch(() => TRANSPARENT_PIXEL);

  flagMemoryCache.set(code, promise);
  return promise;
}

const GEO_SOURCES = [
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson'
];

let worldGeoPromise = null;

function getWorldGeoData() {
  if (worldGeoPromise) return worldGeoPromise;

  worldGeoPromise = (async () => {
    const storageKey = `epwi_worldgeo_${CACHE_VERSION}`;
    const cachedRaw = readCache(storageKey);
    if (cachedRaw) {
      try {
        return JSON.parse(cachedRaw);
      } catch (e) {
      }
    }

    for (const source of GEO_SOURCES) {
      try {
        const data = await d3.json(source);
        let features;
        if (data.type === 'Topology') {
          if (typeof window.topojson === 'undefined') throw new Error('topojson runtime not loaded');
          features = window.topojson.feature(data, data.objects.countries);
        } else {
          features = data;
        }
        writeCache(storageKey, JSON.stringify(features));
        return features;
      } catch (error) {
        console.warn('World map source failed, trying next.', error);
      }
    }
    return null;
  })();

  return worldGeoPromise;
}

function formatCoordinates(lat, lon) {
  const latHemi = lat >= 0 ? 'N' : 'S';
  const lonHemi = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${latHemi}, ${Math.abs(lon).toFixed(2)}°${lonHemi}`;
}

function extractPeriodOfRecord(metadata) {
  const comments1 = metadata['COMMENTS 1'] || metadata.comments1 || '';
  if (comments1) {
    const match = comments1.match(/Period of Record=([\d]{4}-[\d]{4})/);
    if (match && match[1]) return match[1];
  }
  return 'N/A';
}

function formatWmo(wmoStationNumber) {
  const wmo = (wmoStationNumber || '').trim();
  if (!wmo || /^9+$/.test(wmo)) return 'N/A';
  return wmo;
}

function calcPrevailingWind(dataList) {
  if (!dataList || dataList.length === 0) return 'N/A';
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const binSize = 360 / 16;
  const directionCounts = new Array(16).fill(0);
  dataList.forEach(h => {
    if (h.windSpeed > 0.5) {
      const bin = Math.floor(h.windDirection / binSize) % 16;
      directionCounts[bin]++;
    }
  });
  if (d3.sum(directionCounts) === 0) return "Calm";
  return directions[d3.maxIndex(directionCounts)];
}

function processData(epwData, fileType) {
  const data = epwData.data;
  const location = epwData.metadata.location;
  const metadata = epwData.metadata;
  const n = data.length;

  const elevationRaw = Number.isFinite(location.elevation) ? location.elevation : null;
  const avgTempRaw = d3.sum(data, d => d.dryBulbTemperature) / n;
  const avgHumidityRaw = d3.sum(data, d => d.relativeHumidity) / n;
  const avgSkyCoverRaw = d3.sum(data, d => d.totalSkyCover) / n;
  const annualSolarRaw = d3.sum(data, d => d.globalHorizontalRadiation) / 1000;
  const avgWindRaw = d3.sum(data, d => d.windSpeed) / n;

  return {
    city: formatCityNameOnly(location.city, fileType),
    station: formatStationDetail(location.city, fileType),
    country: countryNameMap[location.country] || location.country,
    countryCode2: countryCodeMap[location.country],
    countryCode3: location.country,
    wmo: formatWmo(location.wmoStationNumber),
    period: extractPeriodOfRecord(metadata),
    lat: location.latitude,
    lon: location.longitude,
    coordinates: formatCoordinates(location.latitude, location.longitude),
    elevationRaw,
    elevation: elevationRaw !== null ? `${elevationRaw.toFixed(0)} m` : 'N/A',
    avgTempRaw,
    avgTemp: avgTempRaw.toFixed(1) + ' °C',
    avgHumidityRaw,
    avgHumidity: avgHumidityRaw.toFixed(0) + ' %',
    avgSkyCoverRaw,
    avgSkyCover: avgSkyCoverRaw.toFixed(0) + '/10',
    annualSolarRaw,
    annualSolar: annualSolarRaw.toFixed(0) + ' kWh/m²',
    avgWindRaw,
    avgWind: avgWindRaw.toFixed(1) + ' m/s',
    windDirection: calcPrevailingWind(data)
  };
}

const ICON_PATHS = {
  coordinates: '<path d="M8 1.3c-2.6 0-4.7 2.1-4.7 4.7 0 3.5 4.7 8.1 4.7 8.1s4.7-4.6 4.7-8.1c0-2.6-2.1-4.7-4.7-4.7z" fill="{c}"/><circle cx="8" cy="5.9" r="1.7" fill="#ffffff"/>',
  elevation: '<path d="M1.4 13.2l3.7-6.1 2.3 3.3 1.7-2.6 4.5 5.4H1.4z" fill="{c}"/>',
  avgTemp: '<rect x="6.6" y="1.6" width="2.8" height="8.3" rx="1.4" fill="{c}"/><circle cx="8" cy="12.3" r="2.3" fill="{c}"/>',
  avgHumidity: '<path d="M8 1.6C5.6 4.7 3.6 7.4 3.6 9.7A4.4 4.4 0 008 14.1a4.4 4.4 0 004.4-4.4c0-2.3-2-5-4.4-8.1z" fill="{c}"/>',
  avgSkyCover: '<path d="M4.6 12a2.8 2.8 0 01-.3-5.6 3.4 3.4 0 016.5-1 2.8 2.8 0 01-.5 6.6H4.6z" fill="{c}"/>',
  annualSolar: '<circle cx="8" cy="8" r="2.6" fill="{c}"/><g stroke="{c}" stroke-width="1.3" stroke-linecap="round"><line x1="8" y1="1" x2="8" y2="2.6"/><line x1="8" y1="13.4" x2="8" y2="15"/><line x1="1" y1="8" x2="2.6" y2="8"/><line x1="13.4" y1="8" x2="15" y2="8"/><line x1="3.1" y1="3.1" x2="4.2" y2="4.2"/><line x1="11.8" y1="11.8" x2="12.9" y2="12.9"/><line x1="3.1" y1="12.9" x2="4.2" y2="11.8"/><line x1="11.8" y1="4.2" x2="12.9" y2="3.1"/></g>',
  avgWind: '<g fill="none" stroke="{c}" stroke-width="1.4" stroke-linecap="round"><path d="M1.4 5.4h7.9a1.7 1.7 0 10-1.3-2.8"/><path d="M1.4 8.6h10a1.7 1.7 0 11-1.4 2.8"/><path d="M1.4 11.8h5.7"/></g>',
  windDirection: '<circle cx="8" cy="8" r="6.2" fill="none" stroke="{c}" stroke-width="1.3"/><path d="M10.4 5.6L8.9 8.9 5.6 10.4 7.1 7.1z" fill="{c}"/>'
};

const WARNING_ICON = '<path d="M8 2.2l6.4 11H1.6L8 2.2z" fill="none" stroke="#b45309" stroke-width="1.3" stroke-linejoin="round"/><line x1="8" y1="6.6" x2="8" y2="9.5" stroke="#b45309" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="11.6" r="0.9" fill="#b45309"/>';
const ARROW_UP_ICON = '<path d="M8 2.5l5.5 9h-11z" fill="{c}"/>';
const ARROW_DOWN_ICON = '<path d="M8 13.5l-5.5-9h11z" fill="{c}"/>';

function appendIcon(parent, pathTemplate, cx, cy, size, color) {
  const markup = pathTemplate.replace(/\{c\}/g, color);
  const iconSvg = parent.append('svg')
    .attr('x', cx - size / 2).attr('y', cy - size / 2)
    .attr('width', size).attr('height', size)
    .attr('viewBox', '0 0 16 16');
  iconSvg.node().innerHTML = markup;
  return iconSvg;
}

let measureCtx = null;
function measureText(text, font) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}
function truncateToWidth(text, font, maxWidth) {
  if (measureText(text, font) <= maxWidth) return text;
  const ellipsis = '…';
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, mid).trimEnd() + ellipsis;
    if (measureText(candidate, font) <= maxWidth) lo = mid; else hi = mid - 1;
  }
  return lo <= 0 ? ellipsis : text.slice(0, lo).trimEnd() + ellipsis;
}

const METRICS = [
  { key: 'coordinates', title: 'Geographic Coordinates', compare: 'none' },
  { key: 'elevation', title: 'Elevation Above Sea Level', compare: 'numeric', rawKey: 'elevationRaw', unit: ' m', decimals: 0 },
  { key: 'avgTemp', title: 'Average Temperature', compare: 'numeric', rawKey: 'avgTempRaw', unit: ' °C', decimals: 1, qualityFields: ['dryBulbTemperature'] },
  { key: 'avgHumidity', title: 'Relative Humidity', compare: 'numeric', rawKey: 'avgHumidityRaw', unit: ' %', decimals: 0, qualityFields: ['relativeHumidity'] },
  { key: 'avgSkyCover', title: 'Sky Cover', compare: 'numeric', rawKey: 'avgSkyCoverRaw', unit: '/10', decimals: 0, qualityFields: ['totalSkyCover'] },
  { key: 'annualSolar', title: 'Annual Solar Energy', compare: 'numeric', rawKey: 'annualSolarRaw', unit: ' kWh/m²', decimals: 0, qualityFields: ['globalHorizontalRadiation'] },
  { key: 'avgWind', title: 'Wind Speed', compare: 'numeric', rawKey: 'avgWindRaw', unit: ' m/s', decimals: 1, qualityFields: ['windSpeed'] },
  { key: 'windDirection', title: 'Prevailing Wind', compare: 'none', qualityFields: ['windDirection', 'windSpeed'] }
];

const CARD_TOP_Y = 90;
const HEADER_INSET = 40;
const FLAG_HEIGHT = 48;
const FLAG_Y = 26;
const MAP_HEIGHT = 90;
const METRICS_OFFSET_IN_HEADER = 270;
const ROW_HEIGHT = 52;
const ROW_PILL_HEIGHT = 42;
const CARD_WIDTH = 420;
const CARD_HEIGHT = HEADER_INSET + METRICS_OFFSET_IN_HEADER + METRICS.length * ROW_HEIGHT + 40;

const RANK_UP_COLOR = '#2f9e44';
const RANK_DOWN_COLOR = '#e03131';

export async function renderOverviewCompare(epwDataA, epwDataB) {
  const container = d3.select("#compare-content-area").html('');
  const loaderDiv = container.append('div').attr('id', 'overview-loader-wrapper');
  showEnhancedLoadingIndicator(loaderDiv);

  try {
    const locNameA = formatSimpleLocation(epwDataA.metadata.location.city, epwDataA.metadata.location.country, 'primary');
    const locNameB = formatSimpleLocation(epwDataB.metadata.location.city, epwDataB.metadata.location.country, 'comparison');

    const mainTitle = 'Climate Comparison Overview';
    const locationText = `${locNameA} vs. ${locNameB}`;

    const chartWrapper = container.append('div')
      .attr('class', 'chart-container climate-overview-container')
      .style('display', 'none');

    addExportButton(chartWrapper.node(), `overview-${locNameA}-vs-${locNameB}`, locationText);
    addInfoButton(chartWrapper.node(), 'compareOverview');
    chartWrapper.append('h5').attr('class', 'chart-title-main').style('display', 'none').text(mainTitle);

    const margin = { top: 40, right: 40, bottom: 60, left: 40 };
    const width = 1200 - margin.left - margin.right;
    const height = CARD_TOP_Y + CARD_HEIGHT + 30;

    const svg = chartWrapper.append("svg")
      .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .classed("comparison-overview-svg", true)
      .attr("font-family", "'Inter', 'Poppins', sans-serif");

    svg.append('rect')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .attr('fill', '#f8f9fa');

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const dataA = processData(epwDataA, 'primary');
    const dataB = processData(epwDataB, 'comparison');

    const comparisons = {};
    METRICS.forEach(metric => {
      if (metric.compare !== 'numeric') return;
      const flaggedA = metric.qualityFields && isTabDataMissing(epwDataA, metric.qualityFields);
      const flaggedB = metric.qualityFields && isTabDataMissing(epwDataB, metric.qualityFields);
      let winner = null;
      if (!flaggedA && !flaggedB) {
        const rawA = dataA[metric.rawKey], rawB = dataB[metric.rawKey];
        if (rawA > rawB) winner = 'A';
        else if (rawB > rawA) winner = 'B';
        else winner = 'tie';
      }
      comparisons[metric.key] = { flaggedA, flaggedB, winner };
    });

    g.append('text').attr('x', width / 2).attr('y', 30).attr('text-anchor', 'middle').attr('font-size', '30px')
      .attr('font-weight', '700').attr('fill', '#212529').text('Climate Comparison');
    g.append('text').attr('x', width / 2).attr('y', 54).attr('text-anchor', 'middle').attr('font-size', '15px')
      .attr('font-weight', '400').attr('fill', '#6c757d').text(`${dataA.city} vs. ${dataB.city}`);

    const cardSpacing = 40;
    const centerWidth = width - (2 * CARD_WIDTH);
    const leftCardX = 0;
    const rightCardX = width - CARD_WIDTH;
    const centerX = leftCardX + CARD_WIDTH + (centerWidth / 2);

    const ACCENT_A = { solid: '#3b82f6', tint: 'rgba(59, 130, 246, 0.06)', border: 'rgba(59, 130, 246, 0.25)' };
    const ACCENT_B = { solid: '#9333ea', tint: 'rgba(168, 85, 247, 0.06)', border: 'rgba(168, 85, 247, 0.25)' };

    let anyMetricFlagged = false;

    function renderMetricRow(headerGroup, metric, value, flagged, i, rowInnerWidth, side) {
      const rowY = METRICS_OFFSET_IN_HEADER + i * ROW_HEIGHT;
      const rowGroup = headerGroup.append('g').attr('transform', `translate(0, ${rowY})`);

      rowGroup.append('rect').attr('width', rowInnerWidth).attr('height', ROW_PILL_HEIGHT).attr('rx', 8)
        .attr('fill', 'rgba(15, 23, 42, 0.035)');

      const iconCy = ROW_PILL_HEIGHT / 2;
      appendIcon(rowGroup, ICON_PATHS[metric.key], 21, iconCy, 16, '#868e96');

      const titleX = 38;
      const titleFont = '400 13.5px Inter, sans-serif';
      const valueFont = '600 14.5px Inter, sans-serif';

      const cmp = metric.compare === 'numeric' ? comparisons[metric.key] : null;
      const showArrow = cmp && cmp.winner && cmp.winner !== 'tie';
      const arrowSlot = metric.compare === 'numeric' ? 20 : 0;
      const rightPadding = 14;
      const valueRightEdge = rowInnerWidth - rightPadding - arrowSlot;

      if (flagged) {
        anyMetricFlagged = true;
        const label = 'Constant';
        const labelWidth = 76;
        const groupX = valueRightEdge - labelWidth;

        const titleMaxWidth = groupX - titleX - 10;
        rowGroup.append('text').text(truncateToWidth(metric.title, titleFont, titleMaxWidth))
          .attr('x', titleX).attr('y', iconCy).attr('dominant-baseline', 'middle')
          .attr('font-size', '13.5px').attr('fill', '#495057');

        const flagGroup = rowGroup.append('g').attr('transform', `translate(${groupX}, 0)`);
        appendIcon(flagGroup, WARNING_ICON, 7, iconCy, 14, '#b45309');
        flagGroup.append('text').text(label).attr('x', 16).attr('y', iconCy).attr('dominant-baseline', 'middle')
          .attr('font-size', '12.5px').attr('font-weight', '700').attr('fill', '#b45309');
      } else {
        const valueWidth = measureText(value, valueFont);
        const titleMaxWidth = (valueRightEdge - valueWidth - 16) - titleX;
        rowGroup.append('text').text(truncateToWidth(metric.title, titleFont, titleMaxWidth))
          .attr('x', titleX).attr('y', iconCy).attr('dominant-baseline', 'middle')
          .attr('font-size', '13.5px').attr('fill', '#495057');

        rowGroup.append('text').text(value).attr('x', valueRightEdge).attr('y', iconCy).attr('text-anchor', 'end')
          .attr('dominant-baseline', 'middle').attr('font-size', '14.5px').attr('font-weight', '600').attr('fill', '#212529');

        if (showArrow) {
          const isWinner = cmp.winner === side;
          const icon = isWinner ? ARROW_UP_ICON : ARROW_DOWN_ICON;
          const color = isWinner ? RANK_UP_COLOR : RANK_DOWN_COLOR;
          appendIcon(rowGroup, icon, rowInnerWidth - rightPadding - 7, iconCy, 13, color);
        }
      }
    }

    async function renderModernCard(svgGroup, xPosVal, data, epwData, label, accent, side) {
      const cardGroup = svgGroup.append('g').attr('transform', `translate(${xPosVal}, ${CARD_TOP_Y})`);

      cardGroup.append('rect').attr('width', CARD_WIDTH).attr('height', CARD_HEIGHT).attr('rx', 16)
        .attr('fill', '#ffffff').attr('stroke', accent.border).attr('stroke-width', 1)
        .style('filter', 'drop-shadow(0 6px 16px rgba(15, 23, 42, 0.08))');

      cardGroup.append('rect').attr('width', CARD_WIDTH).attr('height', 5).attr('rx', 2.5)
        .attr('fill', accent.solid);

      const headerGroup = cardGroup.append('g').attr('transform', `translate(${HEADER_INSET}, ${HEADER_INSET})`);
      const contentCenterX = (CARD_WIDTH - 80) / 2;

      const badgeText = label.toUpperCase();
      const badgeWidth = badgeText.length * 7 + 24;
      const badge = headerGroup.append('g');
      badge.append('rect').attr('x', contentCenterX - badgeWidth / 2).attr('y', -6).attr('width', badgeWidth).attr('height', 22)
        .attr('rx', 11).attr('fill', accent.tint).attr('stroke', accent.border);
      badge.append('text').text(badgeText).attr('x', contentCenterX).attr('y', 5).attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '11px').attr('font-weight', '700').attr('letter-spacing', '0.6px').attr('fill', accent.solid);

      const flagWidth = 60;
      const embeddedFlagUrl = await getFlagDataURL(data.countryCode2);

      headerGroup.append('rect').attr('x', contentCenterX - (flagWidth + 6) / 2).attr('y', FLAG_Y - 3).attr('width', flagWidth + 6)
        .attr('height', FLAG_HEIGHT + 6).attr('rx', 6).attr('fill', '#f1f3f5').attr('stroke', '#e9ecef');
      headerGroup.append('image').attr('href', embeddedFlagUrl).attr('x', contentCenterX - flagWidth / 2).attr('y', FLAG_Y)
        .attr('width', flagWidth).attr('height', FLAG_HEIGHT);

      headerGroup.append('text').text(data.city).attr('x', contentCenterX).attr('y', FLAG_Y + FLAG_HEIGHT + 30).attr('text-anchor', 'middle')
        .attr('font-size', '22px').attr('font-weight', '700').attr('fill', '#212529');
      headerGroup.append('text').text(data.country).attr('x', contentCenterX).attr('y', FLAG_Y + FLAG_HEIGHT + 50).attr('text-anchor', 'middle')
        .attr('font-size', '13px').attr('font-weight', '400').attr('fill', '#868e96');

      const mapGroup = headerGroup.append('g').attr('transform', `translate(${contentCenterX - 60}, ${FLAG_Y + FLAG_HEIGHT + 66})`);
      await renderModernCountryMap(mapGroup, data.countryCode3, data.lat, data.lon, accent.solid);

      const rowInnerWidth = CARD_WIDTH - 80;
      METRICS.forEach((metric, i) => {
        const flagged = metric.qualityFields && isTabDataMissing(epwData, metric.qualityFields);
        renderMetricRow(headerGroup, metric, data[metric.key], flagged, i, rowInnerWidth, side);
      });
    }

    function renderCenterColumn(centerGroup) {
      const vsGroup = centerGroup.append('g').attr('transform', `translate(0, ${HEADER_INSET + 6})`);
      vsGroup.append('circle').attr('r', 24).attr('fill', '#ffffff').attr('stroke', '#dee2e6').attr('stroke-width', 1.5);
      vsGroup.append('text').text('VS').attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('font-size', '12px').attr('font-weight', '700').attr('letter-spacing', '1px').attr('fill', '#868e96');

      const metricsBaseY = HEADER_INSET + METRICS_OFFSET_IN_HEADER;
      const lineWidth = centerWidth - cardSpacing;
      const deltaFont = '600 12px Inter, sans-serif';

      METRICS.forEach((metric, i) => {
        const yCoord = metricsBaseY + i * ROW_HEIGHT + ROW_PILL_HEIGHT / 2;
        const lineGroup = centerGroup.append('g');

        if (metric.compare !== 'numeric') {
          lineGroup.append('line').attr('x1', -lineWidth / 2).attr('y1', yCoord).attr('x2', lineWidth / 2).attr('y2', yCoord)
            .attr('stroke', '#e9ecef').attr('stroke-width', 1).attr('stroke-dasharray', '4,4');
          lineGroup.append('circle').attr('cx', 0).attr('cy', yCoord).attr('r', 3).attr('fill', '#ced4da');
          return;
        }

        const cmp = comparisons[metric.key];
        let chipLabel, chipColor, chipBg;

        if (!cmp.winner) {
          chipLabel = 'N/A';
          chipColor = '#adb5bd';
          chipBg = '#f8f9fa';
        } else if (cmp.winner === 'tie') {
          chipLabel = 'Equal';
          chipColor = '#868e96';
          chipBg = '#f8f9fa';
        } else {
          const rawA = dataA[metric.rawKey], rawB = dataB[metric.rawKey];
          const diff = Math.abs(rawA - rawB);
          chipLabel = `Δ ${diff.toFixed(metric.decimals)}${metric.unit}`;
          chipColor = '#495057';
          chipBg = '#ffffff';
        }

        const textWidth = measureText(chipLabel, deltaFont);
        const chipHalfWidth = Math.max(46, textWidth / 2 + 16);

        lineGroup.append('line').attr('x1', -lineWidth / 2).attr('y1', yCoord).attr('x2', -chipHalfWidth).attr('y2', yCoord)
          .attr('stroke', '#e9ecef').attr('stroke-width', 1).attr('stroke-dasharray', '4,4');
        lineGroup.append('line').attr('x1', chipHalfWidth).attr('y1', yCoord).attr('x2', lineWidth / 2).attr('y2', yCoord)
          .attr('stroke', '#e9ecef').attr('stroke-width', 1).attr('stroke-dasharray', '4,4');
        lineGroup.append('rect').attr('x', -chipHalfWidth).attr('y', yCoord - 12).attr('width', chipHalfWidth * 2).attr('height', 24)
          .attr('rx', 12).attr('fill', chipBg).attr('stroke', '#e9ecef');
        lineGroup.append('text').text(chipLabel).attr('x', 0).attr('y', yCoord + 1).attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle').attr('font-size', '14px').attr('font-weight', '600').attr('fill', chipColor);
      });
    }

    async function renderAllComponents() {
      const centerGroup = g.append('g').attr('transform', `translate(${centerX}, ${CARD_TOP_Y})`);
      renderCenterColumn(centerGroup);

      await Promise.all([
        renderModernCard(g, leftCardX, dataA, epwDataA, 'Primary', ACCENT_A, 'A'),
        renderModernCard(g, rightCardX, dataB, epwDataB, 'Comparison', ACCENT_B, 'B')
      ]);
    }

    await renderAllComponents();
    loaderDiv.remove();
    chartWrapper.style('display', 'block');

    const footerY = height + 6;
    const footer = g.append('foreignObject')
      .attr('x', 0).attr('y', footerY).attr('width', width).attr('height', 50);

    const formatLocationDetail = (data) => {
      const wmo = data.wmo !== 'N/A' ? `WMO: ${data.wmo}` : '';
      const period = data.period !== 'N/A' ? `Period of Record: ${data.period}` : '';
      const details = [wmo, period].filter(Boolean).join(' - ');
      const detailString = details ? ` (${details})` : '';
      const station = (data.station && data.station !== data.city) ? `the <strong>${data.station}</strong> station in ` : '';
      return `${station}<strong>${data.city}</strong>${detailString}`;
    };

    const textA = formatLocationDetail(dataA);
    const textB = formatLocationDetail(dataB);
    const qualityCaveat = anyMetricFlagged
      ? ' Metrics marked "Constant" report a fixed/default value in the source EPW file and are excluded from the difference shown above.'
      : '';

    footer.append('xhtml:div')
      .style('font-size', '13px').style('color', '#6c757d')
      .style('text-align', 'center').style('line-height', '1.5')
      .html(`Based on typical annual conditions from the EPW files for ${textA} and ${textB}. All averages are calculated over the full year.${qualityCaveat}`);

  } catch (error) {
    console.error(error);
    loaderDiv.remove();
    renderErrorState(container);
  }
}

function showEnhancedLoadingIndicator(container) {
  container.html('');
  container.append('div')
    .attr('class', 'w-100 d-flex flex-column justify-content-center align-items-center')
    .style('height', '60vh')
    .html(`
            <div class="modern-spinner mb-3" style="width: 3.5rem; height: 3.5rem; border-width: 4px;"></div>
            <div class="text-muted fw-medium mt-2" style="font-size: 0.95rem;">Processing Comparison...</div>
        `);
}

async function renderModernCountryMap(container, countryCode3, lat, lon, accentColor) {
  const width = 120, height = MAP_HEIGHT;
  container.append('rect').attr('width', width).attr('height', height).attr('rx', 10)
    .attr('fill', '#f8f9fa').attr('stroke', '#e9ecef');

  const worldData = await getWorldGeoData();

  if (!worldData) {
    renderModernFallbackMap(container, width, height, lat, lon, accentColor);
    return;
  }

  try {
    const countryGeo = worldData.features.find(d =>
      d.properties.ISO_A3 === countryCode3 ||
      d.properties.ADM0_A3 === countryCode3 ||
      d.properties.iso_a3 === countryCode3 ||
      d.properties.sovereignt === countryCode3 ||
      d.properties.gu_a3 === countryCode3
    );

    if (!countryGeo) {
      renderModernFallbackMap(container, width, height, lat, lon, accentColor);
      return;
    }

    let geometryForFitting = countryGeo;
    let geometryForDrawing = countryGeo;

    if (countryGeo.geometry.type === 'MultiPolygon' && countryGeo.geometry.coordinates.length > 1) {
      const largestPolygonIndex = d3.maxIndex(countryGeo.geometry.coordinates, p => d3.geoArea({ type: 'Polygon', coordinates: p }));
      const mainlandFeature = {
        type: 'Polygon',
        coordinates: countryGeo.geometry.coordinates[largestPolygonIndex]
      };

      const point = [lon, lat];
      const isPointInMainland = d3.geoContains(mainlandFeature, point);

      if (isPointInMainland) {
        geometryForFitting = mainlandFeature;
        geometryForDrawing = mainlandFeature;
      }
    }
    const projection = d3.geoMercator().fitSize([width - 4, height - 4], geometryForFitting);
    const path = d3.geoPath().projection(projection);

    container.append('g')
      .attr('transform', 'translate(2, 2)')
      .append('path')
      .datum(geometryForDrawing)
      .attr('d', path)
      .attr('fill', '#e9ecef')
      .attr('stroke', '#ced4da')
      .attr('stroke-width', 1);

    const [x, y] = projection([lon, lat]);
    if (x && y && x > 0 && y > 0 && x < width - 4 && y < height - 4) {
      const markerGroup = container.append('g').attr('transform', `translate(${x + 2}, ${y + 2})`);
      markerGroup.append('circle').attr('r', 6).attr('fill', accentColor).attr('fill-opacity', 0.18);
      markerGroup.append('circle').attr('r', 3).attr('fill', accentColor).attr('stroke', 'white').attr('stroke-width', 1);
    }

  } catch (error) {
    console.error(error);
    renderModernFallbackMap(container, width, height, lat, lon, accentColor);
  }
}

function renderModernFallbackMap(container, width, height, lat, lon, accentColor) {
  const markerGroup = container.append('g').attr('transform', `translate(${width / 2}, ${height / 2 - 8})`);
  markerGroup.append('circle').attr('r', 6).attr('fill', accentColor).attr('fill-opacity', 0.18);
  markerGroup.append('circle').attr('r', 3).attr('fill', accentColor).attr('stroke', 'white').attr('stroke-width', 1);
  container.append('text').attr('x', width / 2).attr('y', height / 2 + 16).attr('text-anchor', 'middle')
    .attr('font-size', '10px').attr('fill', '#868e96').text(`${lat.toFixed(1)}°, ${lon.toFixed(1)}°`);
}

function renderErrorState(container) {
  container.html('').append('div')
    .style('display', 'flex').style('flex-direction', 'column').style('align-items', 'center')
    .style('justify-content', 'center').style('height', '400px').style('text-align', 'center')
    .style('background', '#fff5f5').style('border', '1px solid #ffc9c9')
    .style('border-radius', '16px').style('color', '#c92a2a').style('padding', '40px')
    .html(`<i class="bi bi-exclamation-triangle-fill" style="font-size: 40px; margin-bottom: 16px;"></i>
               <h3 style="margin: 0 0 10px 0; font-size: 22px; font-weight: 600;">Unable to Load Comparison</h3>
               <p style="margin: 0; font-size: 15px; opacity: 0.85;">Please check the data files and try again.</p>`);
}