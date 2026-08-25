/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import SunCalc from '../core/suncalc.js';
import PsychroLib from '../core/psychrolib.js';
import BioclimaticStrategies from '../core/bioclimatic-strategies.js';
import { formatSimpleLocation } from '../core/location-formatter.js';
import { addExportButton, addInfoButton } from '../core/svg-exporter.js';
import { renderUnifiedFilterControls, filterUnifiedHourlyData, buildUnifiedChartTitleSuffix } from '../core/date-filter.js';
import { CHART_DESIGN_WIDTH } from '../core/chart-defaults.js';
import state from '../state.js';

function degToRad(degrees) {
  return degrees * (Math.PI / 180);
}

const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export function renderWindCharts(epwData, chartRefs) {
  renderMonthlyWindRoses('#monthly-wind-roses-chart', epwData, chartRefs);
  renderAvgWindSpeedBarChart('#avg-wind-speed-chart', epwData, chartRefs);
  renderWindControls('.tab-pane.active .left-panel', epwData, chartRefs);
}

export function renderWindControls(panelSelector, epwData, chartRefs) {
  const panel = d3.select(panelSelector).html('');

  if (!state.windFilters) {
    state.windFilters = {
      timePreset: 'all',
      customStart: 8,
      customEnd: 20,
      monthPreset: 'all',
      customStartMonth: 1,
      customEndMonth: 12
    };
  }

  const dynamicControls = panel.append('div').attr('class', 'chart-controls-group');
  dynamicControls.append('h6').text('Interactive Wind Rose Options');

  const filterContainerId = 'wind-date-filter-container';
  dynamicControls.append('div').attr('id', filterContainerId);

  const displayOptions = dynamicControls.append('div').attr('class', 'control-item mt-3 border-top pt-3');
  displayOptions.append('label').text('Display Options').attr('class', 'fw-bold mb-2 d-block');
  displayOptions.append('div').attr('class', 'form-check form-switch').html(`<input class="form-check-input wind-rose-control" type="checkbox" id="wind-rose-directions-toggle" checked><label class="form-check-label" for="wind-rose-directions-toggle">Show Directions</label>`);
  displayOptions.append('div').attr('class', 'form-check form-switch').html(`<input class="form-check-input wind-rose-control" type="checkbox" id="wind-rose-speed-toggle" checked><label class="form-check-label" for="wind-rose-speed-toggle">Show Freq. Labels</label>`);
  displayOptions.append('div').attr('class', 'form-check form-switch').html(`<input class="form-check-input wind-rose-control" type="checkbox" id="wind-rose-time-toggle" checked><label class="form-check-label" for="wind-rose-time-toggle">Show Selected Time Panel</label>`);
  displayOptions.append('div').attr('class', 'form-check form-switch').html(`<input class="form-check-input wind-rose-control" type="checkbox" id="wind-rose-legend-toggle" checked><label class="form-check-label" for="wind-rose-legend-toggle">Show Legend</label>`);

  const colorByGroup = dynamicControls.append('div').attr('class', 'control-item mt-3');
  colorByGroup.append('label').text('Color By:').attr('class', 'fw-bold mb-1');
  colorByGroup.append('div').attr('class', 'form-check').html(`<input class="form-check-input wind-rose-control" type="radio" name="colorBy" value="temperature" id="colorByTemp" checked><label class="form-check-label" for="colorByTemp">Temperature</label>`);
  colorByGroup.append('div').attr('class', 'form-check').html(`<input class="form-check-input wind-rose-control" type="radio" name="colorBy" value="humidity" id="colorByRH"><label class="form-check-label" for="colorByRH">Relative Humidity</label>`);

  const monthlyRoseControls = panel.append('div').attr('class', 'chart-controls-group mt-3');
  monthlyRoseControls.append('h6').text('Monthly Wind Roses Options');
  const monthlyDisplayOptions = monthlyRoseControls.append('div').attr('class', 'control-item');
  monthlyDisplayOptions.append('div').attr('class', 'form-check form-switch').html(`<input class="form-check-input" type="checkbox" id="monthly-rose-directions-toggle" checked><label class="form-check-label" for="monthly-rose-directions-toggle">Show Directions</label>`);
  monthlyDisplayOptions.append('div').attr('class', 'form-check form-switch').html(`<input class="form-check-input" type="checkbox" id="monthly-rose-freq-toggle" checked><label class="form-check-label" for="monthly-rose-freq-toggle">Show Freq. Labels</label>`);

  const updateWindRoseComparison = () => {
    const filteredData = filterUnifiedHourlyData(epwData.data, state.windFilters, epwData.metadata.location);

    const settings = {
      rawFilters: state.windFilters,
      display: {
        showDirections: d3.select('#wind-rose-directions-toggle').property('checked'),
        showSpeedLabels: d3.select('#wind-rose-speed-toggle').property('checked'),
        showTime: d3.select('#wind-rose-time-toggle').property('checked'),
        showLegend: d3.select('#wind-rose-legend-toggle').property('checked'),
        colorBy: d3.select('input[name="colorBy"]:checked').property('value'),
      }
    };

    const filteredEpwData = { ...epwData, data: filteredData };
    renderDynamicWindRose('#dynamic-wind-rose-chart', filteredEpwData, settings);
  };

  renderUnifiedFilterControls('#' + filterContainerId, state.windFilters, () => {
    updateWindRoseComparison();
   }, { asSubsection: true });

  d3.selectAll('#wind-rose-directions-toggle, #wind-rose-speed-toggle, #wind-rose-time-toggle, #wind-rose-legend-toggle, input[name="colorBy"]')
    .on('change', updateWindRoseComparison);

  d3.select('#monthly-rose-directions-toggle').on('change', () => chartRefs.monthlyRose.toggleDirections(d3.select('#monthly-rose-directions-toggle').property('checked')));
  d3.select('#monthly-rose-freq-toggle').on('change', () => chartRefs.monthlyRose.toggleFreq(d3.select('#monthly-rose-freq-toggle').property('checked')));

  updateWindRoseComparison();
}

export function renderDynamicWindRose(selector, epwData, settings) {
  const container = d3.select(selector).html('');
  const hourlyData = epwData.data;
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country);
  addExportButton(selector, 'interactive-wind-rose', formattedLocation);
  addInfoButton(selector, 'interactiveWindRose');

  container.append('h5').text('Interactive Wind Rose').attr('class', 'chart-title-main');

  const wrapper = container.append('div')
    .style('margin', '0 auto')
    .style('max-width', '500px')
    .style('position', 'relative');

  const exportScaleFactor = 2.5;
  const filteredData = hourlyData.filter(d => Number.isFinite(d.windDirection));

  const margin = {
    top: 10 * exportScaleFactor,
    right: 25 * exportScaleFactor,
    bottom: 55 * exportScaleFactor,
    left: 25 * exportScaleFactor
  };
  const diameter = 160 * exportScaleFactor;
  const radius = diameter / 2;
  const innerRadius = radius * 0.15;

  const svg = wrapper.append("svg")
    .attr("viewBox", `0 0 ${diameter + margin.left + margin.right} ${diameter + margin.top + margin.bottom}`);

  const defs = svg.append('defs');
  defs.append('radialGradient')
    .attr('id', 'wind-rose-bg-grad')
    .attr('cx', '50%').attr('cy', '50%').attr('r', '65%')
    .call(g => {
      g.append('stop').attr('offset', '0%').attr('stop-color', '#ffffff');
      g.append('stop').attr('offset', '100%').attr('stop-color', '#eef1f4');
    });
  const petalShadow = defs.append('filter')
    .attr('id', 'wind-rose-petal-shadow')
    .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
  petalShadow.append('feDropShadow')
    .attr('dx', 0).attr('dy', `${0.5 * exportScaleFactor}`)
    .attr('stdDeviation', `${1 * exportScaleFactor}`)
    .attr('flood-color', '#1a1a1a').attr('flood-opacity', 0.35);

  const chartGroup = svg.append("g").attr("transform", `translate(${margin.left + radius}, ${margin.top + radius})`);

  const tooltip = d3.select('body').selectAll('.wind-rose-tooltip').data([null]).join('div')
    .attr('class', 'wind-rose-tooltip')
    .style('position', 'fixed')
    .style('pointer-events', 'none')
    .style('opacity', 0)
    .style('background', 'rgba(33, 37, 41, 0.94)')
    .style('color', '#fff')
    .style('padding', '8px 11px')
    .style('border-radius', '6px')
    .style('font-family', FONT_STACK)
    .style('font-size', '12px')
    .style('line-height', '1.5')
    .style('box-shadow', '0 4px 14px rgba(0,0,0,0.25)')
    .style('z-index', 3000)
    .style('transition', 'opacity 0.12s ease');

  const nDirections = 16, directionStep = 360 / nDirections;
  const directionNames = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const getDirectionBin = (d) => Math.round(d / directionStep) % nDirections;
  const speedBins = [0, 2, 4, 6, 8, 10, 12, 14, 100];

  const dataByDirection = d3.group(filteredData.filter(d => d.windSpeed > 0), d => getDirectionBin(d.windDirection));
  let maxFreq = d3.max(Array.from(dataByDirection.values()), d => d.length) || 0;
  const totalHours = filteredData.length;
  if (totalHours === 0) { chartGroup.append("text").attr("text-anchor", "middle").text("No data for this period."); return; }

  const maxPercent = (maxFreq / totalHours) * 100;
  const rScale = d3.scaleLinear().domain([0, Math.ceil(maxPercent / 5) * 5 || 5]).range([innerRadius, radius]);

  chartGroup.append("circle").attr("r", radius).attr("fill", "url(#wind-rose-bg-grad)").attr("stroke", "#a9adb1").attr("stroke-width", `${0.5 * exportScaleFactor}px`);
  chartGroup.selectAll(".grid-circle").data(rScale.ticks(5).filter(d => rScale(d) < radius)).join("g").attr("class", "grid-circle")
    .call(g => g.append("circle")
      .attr("r", d => rScale(d))
      .style("fill", "none")
      .style("stroke", "#bcc1c6")
      .style("stroke-dasharray", `${1 * exportScaleFactor},${2 * exportScaleFactor}`)
      .style("stroke-width", `${0.3 * exportScaleFactor}px`))
    .call(g => settings.display.showSpeedLabels ? g.append("text")
      .attr("class", "wind-rose-freq-label")
      .attr("y", d => -rScale(d) - (1 * exportScaleFactor))
      .style("font-size", `${0.2 * exportScaleFactor}rem`)
      .style("font-family", FONT_STACK)
      .attr("text-anchor", "middle")
      .attr("fill", "#555")
      .text(d => `${d}%`) : null);

  const getTempColor = (t) => { if (t === undefined) return '#a3a3a3'; if (t < 0) return '#053061'; if (t < 21) return '#92c5de'; if (t < 27) return '#f4a582'; if (t < 38) return '#d6604d'; return '#67001f'; };
  const getRHColor = (rh) => { if (rh === undefined) return '#a3a3a3'; if (rh < 30) return '#ffffb2'; if (rh < 70) return '#74c476'; return '#006d2c'; };
  const colorFunc = settings.display.colorBy === 'temperature' ? (data) => getTempColor(d3.mean(data, d => d.dryBulbTemperature)) : (data) => getRHColor(d3.mean(data, d => d.relativeHumidity));

  const directionLabelFor = (deg) => directionNames[getDirectionBin(deg)];
  const cornerRadius = 1.3 * exportScaleFactor;

  for (let i = 0; i < nDirections; i++) {
    const directionData = dataByDirection.get(i) || [];
    const petal = chartGroup.append('g').attr('class', 'wind-rose-petal').attr('transform', `rotate(${i * directionStep})`);
    const hist = d3.bin().value(d => d.windSpeed).domain([0, 100]).thresholds(speedBins)(directionData);
    let cumulativeFreq = 0;
    hist.forEach(bin => {
      const freqPercent = (bin.length / totalHours) * 100;
      if (freqPercent === 0) return;
      const startRadius = rScale(cumulativeFreq);
      cumulativeFreq += freqPercent;
      const endRadius = rScale(cumulativeFreq);
      const zeroArc = d3.arc().innerRadius(startRadius).outerRadius(startRadius)
        .startAngle(degToRad(-directionStep / 2 * 0.9)).endAngle(degToRad(directionStep / 2 * 0.9))
        .cornerRadius(cornerRadius);
      const fillColor = colorFunc(bin);
      const path = petal.append("path")
        .attr("d", zeroArc)
        .attr("fill", fillColor)
        .style("stroke", "#ffffff")
        .style("stroke-width", `${0.5 * exportScaleFactor}px`)
        .style("stroke-opacity", 0.9)
        .style("cursor", "default");

      path.transition().duration(650).delay(i * 14).ease(d3.easeCubicOut).attrTween("d", () => {
        const rInterp = d3.interpolate(startRadius, endRadius);
        return t => d3.arc().innerRadius(startRadius).outerRadius(rInterp(t))
          .startAngle(degToRad(-directionStep / 2 * 0.9)).endAngle(degToRad(directionStep / 2 * 0.9))
          .cornerRadius(cornerRadius)();
      });

      path.on('mouseenter', function (event) {
        d3.select(this).style('filter', 'url(#wind-rose-petal-shadow)').attr('fill', d3.color(fillColor).brighter(0.35));
        const hours = bin.length;
        const pct = freqPercent.toFixed(1);
        const speedLabel = bin.x1 >= 100 ? `${bin.x0}+ m/s` : `${bin.x0} – ${bin.x1} m/s`;
        const metricLabel = settings.display.colorBy === 'temperature'
          ? `Avg. Temp: ${(d3.mean(bin, d => d.dryBulbTemperature) ?? 0).toFixed(1)} °C`
          : `Avg. RH: ${(d3.mean(bin, d => d.relativeHumidity) ?? 0).toFixed(0)} %`;
        tooltip.html(
          `<strong>${directionLabelFor(i * directionStep)}</strong> · ${speedLabel}<br>` +
          `${hours} hrs (${pct}% of period)<br>${metricLabel}`
        ).style('opacity', 1);
      })
      .on('mousemove', (event) => {
        tooltip.style('left', `${event.clientX + 14}px`).style('top', `${event.clientY - 10}px`);
      })
      .on('mouseleave', function () {
        d3.select(this).style('filter', null).attr('fill', fillColor);
        tooltip.style('opacity', 0);
      });
    });
  }

  if (settings.display.showDirections) {
    const directions = directionNames;
    const labelRadius = radius + (6 * exportScaleFactor);
    chartGroup.selectAll(".dir-label").data(directions).join("text").attr("class", "wind-rose-direction-label")
      .attr("transform", (d, i) => {
        const angle = i * directionStep;
        return `translate(${labelRadius * Math.sin(degToRad(angle))}, ${-labelRadius * Math.cos(degToRad(angle))})`
      })
      .attr("dy", "0.33em")
      .style("font-size", `${4 * exportScaleFactor}px`)
      .style("font-family", FONT_STACK)
      .style("font-weight", 500)
      .attr("text-anchor", "middle")
      .attr("fill", "#333")
      .text(d => d);
  }

  if (settings.display.showLegend) {
    const legendData = {
      temperature: { title: 'Temperature (°C)', bins: [{ color: '#67001f', label: '> 38' }, { color: '#d6604d', label: '27 - 38' }, { color: '#f4a582', label: '21 - 27' }, { color: '#92c5de', label: '0 - 21' }, { color: '#053061', label: '< 0' }] },
      humidity: { title: 'Relative humidity (%)', bins: [{ color: '#006d2c', label: '> 70' }, { color: '#74c476', label: '30-70' }, { color: '#ffffb2', label: '< 30' }] }
    };
    const activeLegendData = legendData[settings.display.colorBy];
    const legendGroup = chartGroup.append("g").attr("class", "wind-rose-bottom-legend");
    legendGroup.append("text")
      .attr("class", "legend-title").attr("text-anchor", "middle").attr("y", -5 * exportScaleFactor)
      .style("font-size", `${4 * exportScaleFactor}px`)
      .style("font-family", FONT_STACK).style("font-weight", "bold").style("fill", "#333").text(activeLegendData.title);
    const legendItems = legendGroup.selectAll("g").data(activeLegendData.bins).enter().append("g").attr("class", "legend-item");

    const boxSize = 4 * exportScaleFactor, textPadding = 3 * exportScaleFactor, itemPadding = 10 * exportScaleFactor, fontSize = `${4 * exportScaleFactor}px`;
    const verticalOffset = 22 * exportScaleFactor;

    let totalWidth = 0;
    const itemWidths = [];
    legendItems.each(function (d) {
      const item = d3.select(this);
      const text = item.append("text").style("font-size", fontSize).style("font-family", FONT_STACK).text(d.label);
      const textWidth = text.node().getBBox().width;
      text.remove();
      const currentItemWidth = boxSize + textPadding + textWidth;
      itemWidths.push(currentItemWidth);
      totalWidth += currentItemWidth;
    });
    totalWidth += (activeLegendData.bins.length - 1) * itemPadding;
    let currentX = -totalWidth / 2;
    legendItems.each(function (d, i) {
      const item = d3.select(this);
      item.attr("transform", `translate(${currentX}, 0)`);
      item.append("circle").attr("cx", boxSize / 2).attr("cy", boxSize / 2).attr("r", boxSize / 2)
        .style("fill", d.color).style("stroke", "#ffffff").style("stroke-width", `${0.6 * exportScaleFactor}px`);
      item.append("text").attr("x", boxSize + textPadding).attr("y", boxSize / 2).attr("dy", "0.3em").style("font-size", fontSize).style("font-family", FONT_STACK).style("fill", "#212529").text(d.label);
      currentX += itemWidths[i] + itemPadding;
    });
    legendGroup.attr("transform", `translate(0, ${radius + verticalOffset})`);
  }

  if (settings.display.showTime) {
    const totalHoursInYear = 8760;
    const selectedHours = filteredData.length;
    const percentage = (selectedHours / totalHoursInYear) * 100;
    const timeInfoGroup = chartGroup.append("g")
      .attr("class", "time-info")
      .attr("transform", `translate(0, ${radius + 45 * exportScaleFactor})`);
    
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const rf = settings.rawFilters;
    let mStart = 1, mEnd = 12;
    if (rf.monthPreset === 'custom') { mStart = rf.customStartMonth || 1; mEnd = rf.customEndMonth || 12; }
    else if (rf.monthPreset === 'summer') { mStart = epwData.metadata.location.latitude >= 0 ? 6 : 12; mEnd = epwData.metadata.location.latitude >= 0 ? 8 : 2; }
    else if (rf.monthPreset === 'winter') { mStart = epwData.metadata.location.latitude >= 0 ? 12 : 6; mEnd = epwData.metadata.location.latitude >= 0 ? 2 : 8; }
    
    let monthStr = "January 01 — December 31";
    if (rf.monthPreset === 'transition') {
      monthStr = "March 01 — May 31, September 01 — November 30";
    } else if (rf.monthPreset !== 'all') {
      const lastDay = new Date(2000, mEnd, 0).getDate();
      monthStr = `${monthNames[mStart - 1]} 01 — ${monthNames[mEnd - 1]} ${lastDay}`;
    }

    let timeStr = "(00:00 - 23:00)";
    if (rf.timePreset === 'daylight') timeStr = "(Daylight Hours)";
    else if (rf.timePreset === 'active') timeStr = "(08:00 - 20:00)";
    else if (rf.timePreset === 'custom') {
      const pad = n => String(n).padStart(2, '0');
      timeStr = `(${pad(rf.customStart)}:00 - ${pad(rf.customEnd)}:00)`;
    }

    const timeSpanText = timeInfoGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0em')
      .style('font-family', FONT_STACK)
      .style('font-size', `${5 * exportScaleFactor}px`)
      .style('fill', '#333');
    timeSpanText.append('tspan')
      .style('font-weight', 'bold')
      .style('font-size', `${6 * exportScaleFactor}px`)
      .text('Time Span: ');
    timeSpanText.append('tspan').text(`${monthStr} ${timeStr}`);

    const summaryText = timeInfoGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.3em')
      .style('font-family', FONT_STACK)
      .style('font-size', `${5 * exportScaleFactor}px`)
      .style('font-weight', '500')
      .style('fill', '#333');
    if (percentage >= 99.9) {
      summaryText.text(`Annual (${totalHoursInYear} hours)`);
    } else {
      summaryText.append('tspan').style('fill', '#D22B2B').style('font-weight', 'bold').text(`${percentage.toFixed(2)}%`);
      summaryText.append('tspan').text(` of annual hours (`);
      summaryText.append('tspan').style('fill', '#D22B2B').style('font-weight', 'bold').text(`${selectedHours}`);
      summaryText.append('tspan').text(` hours)`);
    }
  }
}

export function renderMonthlyWindRoses(selector, epwData, chartRefs) {
  const container = d3.select(selector).html('');
  const hourlyData = epwData.data;
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country);
  addExportButton(selector, 'monthly-wind-roses', formattedLocation);
  addInfoButton(selector, 'monthlyWindRoses');

  container.append('h5').text('Monthly Wind Roses').attr('class', 'chart-title-main');

  const N_COLS = 4;
  const N_ROWS = 3;
  const CHART_DIAMETER = 120;
  const CHART_PADDING = 20;
  const LEGEND_HEIGHT = 50;
  const TITLE_OFFSET = 20;
  const totalWidth = N_COLS * CHART_DIAMETER + (N_COLS - 1) * CHART_PADDING;
  const totalHeight = N_ROWS * (CHART_DIAMETER + TITLE_OFFSET) + (N_ROWS - 1) * CHART_PADDING + LEGEND_HEIGHT;
  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${totalWidth} ${totalHeight}`)
    .style("width", "100%")
    .style("height", "auto");
  const defs = svg.append('defs');
  defs.append('radialGradient')
    .attr('id', 'monthly-rose-bg-grad')
    .attr('cx', '50%').attr('cy', '50%').attr('r', '65%')
    .call(g => {
      g.append('stop').attr('offset', '0%').attr('stop-color', '#ffffff');
      g.append('stop').attr('offset', '100%').attr('stop-color', '#eef1f4');
    });
  defs.append('style').text(`
        .monthly-rose-title, .monthly-rose-direction-label, .monthly-rose-freq-label-text, .monthly-rose-legend-title, .legend-tick-label {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        .monthly-rose-title {
            font-size: 9px;
            font-weight: bold;
            fill: #333;
            text-anchor: middle;
        }
        .monthly-outer-ring {
            fill: url(#monthly-rose-bg-grad);
            stroke: #a9adb1;
            stroke-width: 0.5px;
            transition: filter 0.25s ease;
        }
        .monthly-outer-ring:hover {
            filter: brightness(1.02);
        }
       .monthly-rose-grid-circle {
            fill: none;
            stroke: #bcc1c6;
            stroke-dasharray: 1,2;
            stroke-width: 0.5px;
        }
        .monthly-rose-freq-label-text {
            font-size: 5px;
            fill: #343a40;
            text-anchor: middle;
        }
       .monthly-rose-direction-label {
            font-size: 7px;
            fill: #343a40;
            font-weight: 500;
            text-anchor: middle;
        }
        .wind-rose-petal path {
            stroke: #ffffff;
            stroke-width: 0.5px;
            stroke-opacity: 0.9;
            cursor: default;
        }
        .monthly-rose-legend-title {
            font-size: 9px;
            font-weight: bold;
            fill: #333;
            text-anchor: middle;
        }
        .legend-tick-label {
            font-size: 8px;
            fill: #343a40;
            text-anchor: middle;
        }
    `);
  const speedBins = [0, 2, 4, 6, 8, 10, 100];
  const speedColor = d3.scaleSequential(d3.interpolateTurbo).domain([0, 12]);
  const nDirections = 16,
    directionStep = 360 / nDirections;
  const directionNames = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const getDirectionBin = (d) => Math.round(d / directionStep) % nDirections;
  const cornerRadius = 0.8;
  const svgs = [];

  const tooltip = d3.select('body').selectAll('.wind-rose-tooltip').data([null]).join('div')
    .attr('class', 'wind-rose-tooltip')
    .style('position', 'fixed')
    .style('pointer-events', 'none')
    .style('opacity', 0)
    .style('background', 'rgba(33, 37, 41, 0.94)')
    .style('color', '#fff')
    .style('padding', '8px 11px')
    .style('border-radius', '6px')
    .style('font-family', FONT_STACK)
    .style('font-size', '12px')
    .style('line-height', '1.5')
    .style('box-shadow', '0 4px 14px rgba(0,0,0,0.25)')
    .style('z-index', 3000)
    .style('transition', 'opacity 0.12s ease');

  for (let m = 1; m <= 12; m++) {
    const monthAllData = hourlyData.filter(d => d.month === m);
    const monthData = monthAllData.filter(d => d.windSpeed > 0 && Number.isFinite(d.windDirection));
    const totalMonthHours = monthAllData.length;
    const row = Math.floor((m - 1) / N_COLS);
    const col = (m - 1) % N_COLS;
    const translateX = col * (CHART_DIAMETER + CHART_PADDING) + CHART_DIAMETER / 2;
    const translateY = row * (CHART_DIAMETER + CHART_PADDING + TITLE_OFFSET) + CHART_DIAMETER / 2 + TITLE_OFFSET;
    const monthGroup = svg.append('g')
      .attr('class', 'monthly-rose-group')
      .attr('transform', `translate(${translateX}, ${translateY})`);
    svgs.push(monthGroup);
    
    monthGroup.append('text')
      .attr('class', 'monthly-rose-title')
      .attr('y', -CHART_DIAMETER / 2 - TITLE_OFFSET / 2)
      .text(d3.timeFormat('%B')(new Date(2000, m - 1)));
      
    const radius = CHART_DIAMETER / 2.6;
    const innerRadius = radius * 0.08;
    const dataByDirection = d3.group(monthData, d => getDirectionBin(d.windDirection));
    const maxMonthFrequency = d3.max(Array.from(dataByDirection.values()), dirData => dirData.length) || 0;
    const maxMonthPercent = totalMonthHours > 0 ? (maxMonthFrequency / totalMonthHours) * 100 : 0;
    const rScaleDomainMax = Math.ceil(maxMonthPercent / 5) * 5 || 5;
    const rScale = d3.scaleLinear().domain([0, rScaleDomainMax]).range([innerRadius, radius]);
    
    monthGroup.append("circle")
      .attr("class", "monthly-outer-ring")
      .attr("r", radius);
      
    const freqLabelsGroup = monthGroup.append('g').attr('class', 'freq-labels');
    const rTicks = rScale.ticks(4).filter(d => rScale(d) < radius);
    freqLabelsGroup.selectAll(".grid-circle")
      .data(rTicks)
      .join("circle")
      .attr("r", d => rScale(d))
      .attr("class", "monthly-rose-grid-circle");
      
    const labelAngle = degToRad(45);
    const labelRadiusOffset = 5;
    
    freqLabelsGroup.selectAll(".freq-label-text")
      .data(rTicks.filter(d => d > 0))
      .join("text")
      .attr("class", "monthly-rose-freq-label-text")
      .attr("x", d => (rScale(d) + labelRadiusOffset) * Math.sin(labelAngle))
      .attr("y", d => -rScale(d) - 2)
      .attr("text-anchor", "middle")
      .style("font-size", "5px")
      .text(d => `${d}%`);

    for (let i = 0; i < nDirections; i++) {
        const directionData = dataByDirection.get(i) || [];
        if (directionData.length === 0) continue;
        const petal = monthGroup.append('g')
            .attr('class', 'wind-rose-petal')
            .attr('transform', `rotate(${i * directionStep})`);
        const hist = d3.bin().value(d => d.windSpeed).domain([0, 100]).thresholds(speedBins)(directionData);
        let cumulativePercent = 0;
        hist.forEach(bin => {
            if (bin.length === 0) return;
            const binPercent = totalMonthHours > 0 ? (bin.length / totalMonthHours) * 100 : 0;
            const startR = rScale(cumulativePercent);
            cumulativePercent += binPercent;
            const endR = rScale(cumulativePercent);
            const zeroArc = d3.arc().innerRadius(startR).outerRadius(startR)
              .startAngle(degToRad(-directionStep / 2 * 0.9)).endAngle(degToRad(directionStep / 2 * 0.9))
              .cornerRadius(cornerRadius);
            const fillColor = speedColor(bin.x0);
            const path = petal.append("path").attr("d", zeroArc).attr("fill", fillColor);

            path.transition().duration(450).delay(m * 25 + i * 3).ease(d3.easeCubicOut).attrTween("d", () => {
              const rInterp = d3.interpolate(startR, endR);
              return t => d3.arc().innerRadius(startR).outerRadius(rInterp(t))
                .startAngle(degToRad(-directionStep / 2 * 0.9)).endAngle(degToRad(directionStep / 2 * 0.9))
                .cornerRadius(cornerRadius)();
            });

            path.on('mouseenter', function () {
                d3.select(this).attr('fill', d3.color(fillColor).brighter(0.35));
                const speedLabel = bin.x1 >= 100 ? `${bin.x0}+ m/s` : `${bin.x0} – ${bin.x1} m/s`;
                tooltip.html(
                  `<strong>${d3.timeFormat('%B')(new Date(2000, m - 1))} · ${directionNames[i]}</strong> · ${speedLabel}<br>` +
                  `${bin.length} hrs (${binPercent.toFixed(1)}% of month)`
                ).style('opacity', 1);
            })
            .on('mousemove', (event) => {
                tooltip.style('left', `${event.clientX + 14}px`).style('top', `${event.clientY - 10}px`);
            })
            .on('mouseleave', function () {
                d3.select(this).attr('fill', fillColor);
                tooltip.style('opacity', 0);
            });
        });
    }

    const dirLabelsGroup = monthGroup.append('g').attr('class', 'dir-labels');
    const directions = [{ l: "N", a: 0 }, { l: "E", a: 90 }, { l: "S", a: 180 }, { l: "W", a: 270 }];
    const labelOffset = 7;
    dirLabelsGroup.selectAll(".dir-label")
        .data(directions)
        .join("text")
        .attr("class", "monthly-rose-direction-label")
        .attr("transform", d => `translate(${(radius + labelOffset) * Math.sin(degToRad(d.a))}, ${-(radius + labelOffset) * Math.cos(degToRad(d.a))})`)
        .attr("dy", "0.35em")
        .text(d => d.l);
  }

  const legendY = totalHeight - LEGEND_HEIGHT + 10;
  const legendWidth = totalWidth * 0.4;
  const legendX = (totalWidth - legendWidth) / 2;
  const legendGroup = svg.append('g').attr('transform', `translate(0, ${legendY})`);
  
  legendGroup.append('text')
    .attr('class', 'monthly-rose-legend-title')
    .attr('x', totalWidth / 2) 
    .attr('y', -5)
    .attr('text-anchor', 'middle')
    .style('font-size', '9px')
    .style('font-weight', 'bold')
    .style('fill', '#333')
    .text('Wind Speed (m/s)');

  const linearGradient = defs.append('linearGradient')
    .attr('id', 'wind-speed-legend-grad')
    .attr('x1', '0%').attr('y1', '0%').attr('x2', '100%').attr('y2', '0%');
  linearGradient.selectAll('stop')
    .data(speedColor.ticks().map((t, i, n) => ({ offset: `${100 * i / (n.length - 1)}%`, color: speedColor(t) })))
    .join('stop').attr('offset', d => d.offset).attr('stop-color', d => d.color);
  legendGroup.append('rect')
    .attr('x', legendX)
    .attr('y', 8)
    .attr('width', legendWidth)
    .attr('height', 12)
    .attr('rx', 2)
    .style('fill', 'url(#wind-speed-legend-grad)');
  const legendScale = d3.scaleLinear().domain(speedColor.domain()).range([0, legendWidth]);
  const legendTicks = legendGroup.append('g')
    .attr('transform', `translate(${legendX}, 25)`);
  legendTicks.selectAll('.legend-tick-label')
    .data(speedColor.ticks(7).sort(d3.ascending))
    .join('text')
    .attr('class', 'legend-tick-label')
    .attr('x', d => legendScale(d))
    .attr('y', 5)
    .text(d => d);
    
  chartRefs.monthlyRose = {
    toggleDirections: (show) => svgs.forEach(g => g.select('.dir-labels').style('display', show ? null : 'none')),
    toggleFreq: (show) => svgs.forEach(g => g.select('.freq-labels').style('display', show ? null : 'none')),
  };
}

export function renderAvgWindSpeedBarChart(selector, epwData, chartRefs) {
  const container = d3.select(selector).html('');
  const hourlyData = epwData.data;
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country);
  addExportButton(selector, 'average-monthly-wind-speed', formattedLocation);
  addInfoButton(selector, 'averageMonthlyWindSpeed');

  container.append('h5').text('Average Monthly Wind Speed').attr('class', 'chart-title-main');

  const margin = { top: 20, right: 20, bottom: 50, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 300 - margin.top - margin.bottom;
  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  svg.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "#f8f9fa")
    .style("transition", "fill 0.3s ease-in-out")
    .on("mouseover", function () {
      d3.select(this).attr("fill", "#f7fafc");
    })
    .on("mouseout", function () {
      d3.select(this).attr("fill", "#f8f9fa");
    });
  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  const monthlyData = Array.from(d3.group(hourlyData, d => d.month), ([month, data]) => ({
    month: d3.timeFormat("%b")(new Date(2000, month - 1)),
    mean: d3.mean(data, d => d.windSpeed),
    max: d3.max(data, d => d.windSpeed)
  })).sort((a, b) => new Date('1 ' + a.month + ' 2000') - new Date('1 ' + b.month + ' 2000'));
  const annualData = { month: 'Annual', mean: d3.mean(hourlyData, d => d.windSpeed), max: d3.max(hourlyData, d => d.windSpeed) };
  const plotData = [...monthlyData, annualData];
  const x = d3.scaleBand().domain([...monthlyData.map(d => d.month), "", "Annual"]).range([0, width]).padding(0.2);
  const y = d3.scaleLinear().range([height, 0]);
  const barColor = "#a6cee3";
  svg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0, ${height})`);
  svg.append("g").attr("class", "axis y-axis");
  svg.append("g").attr("class", "grid-line");
  svg.append("text")
    .attr("class", "axis-title")
    .attr("transform", "rotate(-90)")
    .attr("y", -margin.left + 20)
    .attr("x", -height / 2)
    .attr("text-anchor", "middle")
    .style('font-family', FONT_STACK)
    .style('font-size', '11px')
    .text("m/s");
  chartRefs.windBar = {
    update: (options = {}) => {
      const { fit } = options;
      let yDomain;
      const maxMean = d3.max(plotData, d => d.mean);
      if (fit) {
        const q99 = d3.quantile(plotData.map(d => d.mean).filter(d => d), 0.99);
        yDomain = [0, (q99 > 0 ? q99 * 1.1 : maxMean * 1.1) || 5];
      } else {
        yDomain = [0, (maxMean * 1.2) || 5];
      }
      const minDisplayMax = 5;
      yDomain[1] = Math.max(yDomain[1], minDisplayMax);
      y.domain(yDomain).nice();
      const grid = svg.select(".grid-line").call(d3.axisLeft(y).tickSize(-width).tickFormat(""));
      grid.selectAll(".tick")
        .filter(d => d === y.domain()[0])
        .remove();
      grid.selectAll("line")
        .attr("stroke", "#b0b0b0")
        .attr("stroke-opacity", 0.6)
        .attr("stroke-dasharray", "3,3");
      grid.select(".domain").remove();
      const xAxis = svg.select(".x-axis").call(d3.axisBottom(x).tickValues(x.domain().filter(d => d !== "")));
      const yAxis = svg.select(".y-axis").transition().duration(500).call(d3.axisLeft(y));
      yAxis.selectAll('text').style('font-family', FONT_STACK).style('font-size', '10px');
      xAxis.selectAll('text').style('font-family', FONT_STACK).style('font-size', '10px');
      svg.selectAll(".avg-wind-speed-bar")
        .data(plotData.filter(d => d.month))
        .join("rect")
        .attr("class", "avg-wind-speed-bar")
        .attr("x", d => x(d.month))
        .attr("width", x.bandwidth())
        .attr("y", y(0))
        .attr("height", 0)
        .attr("stroke", "black")
        .attr("stroke-width", 0.7)
        .attr("stroke-opacity", 0.8)
        .style("transition", "fill 0.3s ease-in-out, stroke-width 0.3s, stroke-opacity 0.3s")
        .on("mouseover", (event, d) => {
          const target = d3.select(event.currentTarget);
          target.style('fill', d3.color(barColor).darker(0.2))
            .style('stroke-width', '1px')
            .style('stroke-opacity', 1);
          tooltip.style("opacity", 1).html(`<strong>${d.month}</strong><br>Mean: ${d.mean.toFixed(1)} m/s<br>Max: ${d.max.toFixed(1)} m/s`);
        })
        .on("mousemove", (event) => {
          tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`);
        })
        .on("mouseout", function (event, d) {
          const target = d3.select(event.currentTarget);
          target.style('fill', barColor)
            .style('stroke-width', '0.7px')
            .style('stroke-opacity', 0.8);
          tooltip.style("opacity", 0);
        })
        .transition().duration(500)
        .attr("y", d => y(d.mean > 0 ? d.mean : 0))
        .attr("height", d => height - y(d.mean > 0 ? d.mean : 0))
        .attr("fill", barColor);
    }
  };
  chartRefs.windBar.update({ reset: true });
}