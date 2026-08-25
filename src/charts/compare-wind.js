/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import { formatSimpleLocation, formatCityNameOnly } from '../core/location-formatter.js';
import { addExportButton, addInfoButton } from '../core/svg-exporter.js';
import { renderUnifiedFilterControls, filterUnifiedHourlyData, buildUnifiedChartTitleSuffix } from '../core/date-filter.js';
import { CHART_DESIGN_WIDTH } from '../core/chart-defaults.js';

function degToRad(degrees) {
  return degrees * (Math.PI / 180);
}

const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export function renderWindCompareCharts(epwDataA, epwDataB) {
  const chartRefs = {};
  const contentArea = d3.select("#compare-content-area").html('');
  contentArea.append('div').attr('id', 'compare-wind-rose-chart').attr('class', 'chart-container mb-5');
  contentArea.append('div').attr('id', 'compare-wind-speed-chart').attr('class', 'chart-container');
  renderWindCompareControls('#compare-pane .left-panel', epwDataA, epwDataB, chartRefs);
  renderWindSpeedComparison('#compare-wind-speed-chart', epwDataA, epwDataB);
}

export function renderWindCompareControls(panelSelector, epwDataA, epwDataB, chartRefs) {
  const panel = d3.select(panelSelector).html('');

  const compareWindFilters = {
    timePreset: 'all',
    customStart: 8,
    customEnd: 20,
    monthPreset: 'all',
    customStartMonth: 1,
    customEndMonth: 12
  };

  const windRoseControls = panel.append('div').attr('class', 'chart-controls-group');
  windRoseControls.append('h6').text('Interactive Wind Rose Options');

  const filterContainerId = 'compare-wind-date-filter-container';
  windRoseControls.append('div').attr('id', filterContainerId);

  const displayOptions = windRoseControls.append('div').attr('class', 'control-item mt-3 border-top pt-3');
  displayOptions.append('label').text('Display Options').attr('class', 'fw-bold mb-2 d-block');
  displayOptions.append('div').attr('class', 'form-check form-switch').html(`<input class="form-check-input wind-rose-control" type="checkbox" id="wind-rose-directions-toggle-compare" checked><label class="form-check-label" for="wind-rose-directions-toggle-compare">Show Directions</label>`);
  displayOptions.append('div').attr('class', 'form-check form-switch').html(`<input class="form-check-input wind-rose-control" type="checkbox" id="wind-rose-speed-toggle-compare" checked><label class="form-check-label" for="wind-rose-speed-toggle-compare">Show Freq. Labels</label>`);
  displayOptions.append('div').attr('class', 'form-check form-switch').html(`<input class="form-check-input wind-rose-control" type="checkbox" id="wind-rose-time-toggle-compare" checked><label class="form-check-label" for="wind-rose-time-toggle-compare">Show Selected Time Panel</label>`);
  displayOptions.append('div').attr('class', 'form-check form-switch').html(`<input class="form-check-input wind-rose-control" type="checkbox" id="wind-rose-legend-toggle-compare" checked><label class="form-check-label" for="wind-rose-legend-toggle-compare">Show Legend</label>`);

  const colorByGroup = windRoseControls.append('div').attr('class', 'control-item mt-3');
  colorByGroup.append('label').text('Color By:').attr('class', 'fw-bold mb-1');
  colorByGroup.append('div').attr('class', 'form-check').html(`<input class="form-check-input wind-rose-control" type="radio" name="colorBy-compare" value="temperature" id="colorByTemp-compare" checked><label class="form-check-label" for="colorByTemp-compare">Temperature</label>`);
  colorByGroup.append('div').attr('class', 'form-check').html(`<input class="form-check-input wind-rose-control" type="radio" name="colorBy-compare" value="humidity" id="colorByRH-compare"><label class="form-check-label" for="colorByRH-compare">Relative Humidity</label>`);

  renderWindRoseComparison('#compare-wind-rose-chart', epwDataA, epwDataB, chartRefs);

  const updateWindRoseComparison = () => {
    const settings = {
      rawFilters: compareWindFilters,
      display: {
        showDirections: d3.select('#wind-rose-directions-toggle-compare').property('checked'),
        showSpeedLabels: d3.select('#wind-rose-speed-toggle-compare').property('checked'),
        showTime: d3.select('#wind-rose-time-toggle-compare').property('checked'),
        showLegend: d3.select('#wind-rose-legend-toggle-compare').property('checked'),
        colorBy: d3.select('input[name="colorBy-compare"]:checked').property('value'),
      }
    };
    if (chartRefs && chartRefs.updateWindRose && typeof chartRefs.updateWindRose === 'function') {
      chartRefs.updateWindRose(settings);
    }
  };

  renderUnifiedFilterControls('#' + filterContainerId, compareWindFilters, updateWindRoseComparison, { asSubsection: true });

  d3.selectAll('#wind-rose-directions-toggle-compare, #wind-rose-speed-toggle-compare, #wind-rose-time-toggle-compare, #wind-rose-legend-toggle-compare, input[name="colorBy-compare"]')
    .on('change', updateWindRoseComparison);

  updateWindRoseComparison();
}

export function renderWindRoseComparison(selector, dataA, dataB, chartRefs) {
  const mainContainer = d3.select(selector);
  const locNameA = formatSimpleLocation(dataA.metadata.location.city, dataA.metadata.location.country, 'primary');
  const locNameB = formatSimpleLocation(dataB.metadata.location.city, dataB.metadata.location.country, 'comparison');
  const legendNameA = formatCityNameOnly(dataA.metadata.location.city, 'primary');
  const legendNameB = formatCityNameOnly(dataB.metadata.location.city, 'comparison');
  const colorA = '#377eb8', colorB = '#4daf4a';

  const drawSingleWindRose = (svgGroup, hourlyData, settings, locationName, dims, tooltip) => {
    const { diameter, scale: exportScaleFactor } = dims;
    const radius = diameter / 2;
    const innerRadius = radius * 0.15;

    const filteredData = hourlyData.filter(d => Number.isFinite(d.windDirection));

    svgGroup.append('text').attr('class', 'chart-title-main').attr('x', 0).attr('y', -radius - (15 * exportScaleFactor)).attr('text-anchor', 'middle').style("font-family", FONT_STACK).style('font-size', `${8 * exportScaleFactor}px`).style('font-weight', 'bold').text(locationName);

    const nDirections = 16;
    const directionStep = 360 / nDirections;
    const directionNames = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const getDirectionBin = (d) => Math.round(d / directionStep) % nDirections;
    const speedBins = [0, 2, 4, 6, 8, 10, 12, 14, 100];

    const dataByDirection = d3.group(filteredData.filter(d => d.windSpeed > 0), d => getDirectionBin(d.windDirection));
    const maxFreq = d3.max(Array.from(dataByDirection.values()), d => d.length) || 0;
    const totalHours = filteredData.length;

    if (totalHours === 0) {
      svgGroup.append("text").attr("text-anchor", "middle").style("font-family", FONT_STACK).text("No data for this period.");
      return { totalHoursInYear: 8760, filteredHours: 0 };
    }

    const maxPercent = (maxFreq / totalHours) * 100;
    const rScale = d3.scaleLinear().domain([0, Math.ceil(maxPercent / 5) * 5 || 5]).range([innerRadius, radius]);

    svgGroup.append("circle").attr("r", radius).attr("fill", "url(#wind-rose-bg-grad)").attr("stroke", "#a9adb1").attr("stroke-width", `${0.5 * exportScaleFactor}px`);
    const gridCircles = svgGroup.selectAll(".grid-circle").data(rScale.ticks(5).filter(d => rScale(d) < radius)).join("g").attr("class", "grid-circle");

    gridCircles.append("circle").attr("r", d => rScale(d)).style("fill", "none").style("stroke", "#bcc1c6").style("stroke-dasharray", `${1 * exportScaleFactor},${2 * exportScaleFactor}`).style("stroke-width", `${0.3 * exportScaleFactor}px`);

    if (settings.display.showSpeedLabels) {
      gridCircles.append("text").attr("class", "wind-rose-freq-label").attr("y", d => -rScale(d) - (2 * exportScaleFactor)).style("font-size", `${4.5 * exportScaleFactor}px`).style("font-family", FONT_STACK).attr("text-anchor", "middle").attr("fill", "#555").text(d => `${d}%`);
    }

    const getTempColor = (t) => { if (t === undefined) return '#a3a3a3'; if (t < 0) return '#053061'; if (t < 21) return '#92c5de'; if (t < 27) return '#f4a582'; if (t < 38) return '#d6604d'; return '#67001f'; };
    const getRHColor = (rh) => { if (rh === undefined) return '#a3a3a3'; if (rh < 30) return '#ffffb2'; if (rh < 70) return '#74c476'; return '#006d2c'; };
    const colorFunc = settings.display.colorBy === 'temperature' ? (data) => getTempColor(d3.mean(data, d => d.dryBulbTemperature)) : (data) => getRHColor(d3.mean(data, d => d.relativeHumidity));
    const directionLabelFor = (deg) => directionNames[getDirectionBin(deg)];
    const cornerRadius = 1 * exportScaleFactor;

    for (let i = 0; i < nDirections; i++) {
      const directionData = dataByDirection.get(i) || [];
      const petal = svgGroup.append('g').attr('class', 'wind-rose-petal').attr('transform', `rotate(${i * directionStep})`);
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
          .style("stroke-width", `${0.4 * exportScaleFactor}px`)
          .style("stroke-opacity", 0.9)
          .style("cursor", "default");

        path.transition().duration(600).delay(i * 12).ease(d3.easeCubicOut).attrTween("d", () => {
          const rInterp = d3.interpolate(startRadius, endRadius);
          return t => d3.arc().innerRadius(startRadius).outerRadius(rInterp(t))
            .startAngle(degToRad(-directionStep / 2 * 0.9)).endAngle(degToRad(directionStep / 2 * 0.9))
            .cornerRadius(cornerRadius)();
        });

        path.on('mouseenter', function () {
          d3.select(this).style('filter', 'url(#wind-rose-petal-shadow)').attr('fill', d3.color(fillColor).brighter(0.35));
          const speedLabel = bin.x1 >= 100 ? `${bin.x0}+ m/s` : `${bin.x0} – ${bin.x1} m/s`;
          const metricLabel = settings.display.colorBy === 'temperature'
            ? `Avg. Temp: ${(d3.mean(bin, d => d.dryBulbTemperature) ?? 0).toFixed(1)} °C`
            : `Avg. RH: ${(d3.mean(bin, d => d.relativeHumidity) ?? 0).toFixed(0)} %`;
          tooltip.html(
            `<strong>${locationName} · ${directionLabelFor(i * directionStep)}</strong> · ${speedLabel}<br>` +
            `${bin.length} hrs (${freqPercent.toFixed(1)}% of period)<br>${metricLabel}`
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
      const labelRadius = radius + (6 * exportScaleFactor);
      svgGroup.selectAll(".dir-label").data(directionNames).join("text").attr("class", "wind-rose-direction-label")
        .attr("transform", (d, i) => `translate(${labelRadius * Math.sin(degToRad(i * directionStep))}, ${-labelRadius * Math.cos(degToRad(i * directionStep))})`)
        .attr("dy", "0.33em")
        .style("font-size", `${5.5 * exportScaleFactor}px`)
        .style("font-family", FONT_STACK)
        .style("font-weight", 500)
        .attr("text-anchor", "middle")
        .attr("fill", "#333")
        .text(d => d);
    }

    return { totalHoursInYear: 8760, filteredHours: filteredData.length };
  };

  function update(settings) {
    mainContainer.html('');
    addExportButton(selector, `wind-rose-${locNameA}-vs-${locNameB}`, `${locNameA} vs. ${locNameB}`);
    addInfoButton(selector, 'compareWindRose');
    mainContainer.append('h5').text('Interactive Wind Rose Comparison').attr('class', 'chart-title-main');

    const exportScaleFactor = 2.0;
    const chartDiameter = 320;
    const chartRadius = chartDiameter / 2;
    const gap = 60 * exportScaleFactor;
    const bottomSectionHeight = 90 * exportScaleFactor;
    const totalWidth = (chartDiameter * 2) + gap;
    const totalHeight = chartDiameter + bottomSectionHeight;
    const margin = { top: 45 * exportScaleFactor, right: 25 * exportScaleFactor, bottom: 5 * exportScaleFactor, left: 25 * exportScaleFactor };

    const svgRoot = mainContainer.append("svg").attr("viewBox", `0 0 ${totalWidth + margin.left + margin.right} ${totalHeight + margin.top + margin.bottom}`);

    const defs = svgRoot.append('defs');
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

    const svg = svgRoot.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);
    const groupA = svg.append("g").attr("transform", `translate(${chartRadius}, ${chartRadius})`);
    const groupB = svg.append("g").attr("transform", `translate(${chartDiameter + gap + chartRadius}, ${chartRadius})`);

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

    const filteredDataA = filterUnifiedHourlyData(dataA.data, settings.rawFilters, dataA.metadata.location);
    const filteredDataB = filterUnifiedHourlyData(dataB.data, settings.rawFilters, dataB.metadata.location);

    const dims = { diameter: chartDiameter, scale: exportScaleFactor };
    const statsA = drawSingleWindRose(groupA, filteredDataA, settings, legendNameA, dims, tooltip);
    const statsB = drawSingleWindRose(groupB, filteredDataB, settings, legendNameB, dims, tooltip);

    const bottomGroup = svg.append("g").attr("transform", `translate(${totalWidth / 2}, ${chartDiameter + 40 * exportScaleFactor})`);

    if (settings.display.showLegend) {
      const legendData = {
        temperature: { title: 'Temperature (°C)', bins: [{ color: '#053061', label: '< 0' }, { color: '#92c5de', label: '0 - 21' }, { color: '#f4a582', label: '21 - 27' }, { color: '#d6604d', label: '27 - 38' }, { color: '#67001f', label: '> 38' }] },
        humidity: { title: 'Relative humidity (%)', bins: [{ color: '#ffffb2', label: '< 30' }, { color: '#74c476', label: '30-70' }, { color: '#006d2c', label: '> 70' }] }
      };
      const activeLegendData = legendData[settings.display.colorBy];
      const legendGroup = bottomGroup.append("g").attr("class", "wind-rose-bottom-legend");
      legendGroup.append("text").attr("class", "legend-title").attr("text-anchor", "middle").attr("y", -5 * exportScaleFactor).style("font-size", `${7 * exportScaleFactor}px`).style("font-family", FONT_STACK).style("font-weight", "bold").style("fill", "#333").text(activeLegendData.title);
      const legendItems = legendGroup.selectAll("g.legend-item").data(activeLegendData.bins).enter().append("g").attr("class", "legend-item");
      const boxSize = 5 * exportScaleFactor, textPadding = 3 * exportScaleFactor, itemPadding = 12 * exportScaleFactor, fontSize = `${6 * exportScaleFactor}px`;
      const itemWidths = [];
      legendItems.each(function (d) {
        const text = d3.select(this).append("text").style("font-size", fontSize).style("font-family", FONT_STACK).text(d.label);
        itemWidths.push(text.node().getBBox().width);
        text.remove();
      });
      const totalLegendWidth = d3.sum(itemWidths) + (activeLegendData.bins.length * (boxSize + textPadding)) + ((activeLegendData.bins.length - 1) * itemPadding);
      let currentX = -totalLegendWidth / 2;
      legendItems.each(function (d, i) {
        const item = d3.select(this).attr("transform", `translate(${currentX}, 0)`);
        item.append("circle").attr("cx", boxSize / 2).attr("cy", boxSize / 2).attr("r", boxSize / 2).style("fill", d.color).style("stroke", "#ffffff").style("stroke-width", `${0.6 * exportScaleFactor}px`);
        item.append("text").attr("x", boxSize + textPadding).attr("y", boxSize / 2).attr("dy", "0.3em").style("font-size", fontSize).style("font-family", FONT_STACK).style("fill", "#212529").text(d.label);
        currentX += itemWidths[i] + boxSize + textPadding + itemPadding;
      });
    }

    if (settings.display.showTime) {
      const timeInfoGroup = bottomGroup.append("g").attr("class", "time-info").attr("transform", `translate(0, ${25 * exportScaleFactor})`);
      const rf = settings.rawFilters;
      const stripParens = s => s.trim().replace(/^\(|\)$/g, '');
      const suffixA = stripParens(buildUnifiedChartTitleSuffix(rf, dataA.metadata.location.latitude || 0));
      const suffixB = stripParens(buildUnifiedChartTitleSuffix(rf, dataB.metadata.location.latitude || 0));

      const timeSpanText = timeInfoGroup.append('text').attr('text-anchor', 'middle').attr('dy', '0em').style('font-family', FONT_STACK).style('font-size', `${6 * exportScaleFactor}px`).style('fill', '#333');
      timeSpanText.append('tspan').style('font-weight', 'bold').text('Time Span: ');
      timeSpanText.append('tspan').text(suffixA === suffixB ? suffixA : `${legendNameA}: ${suffixA}   |   ${legendNameB}: ${suffixB}`);

      const summaryText = timeInfoGroup.append('text').attr('text-anchor', 'middle').attr('dy', '1.3em').style('font-family', FONT_STACK).style('font-size', `${6 * exportScaleFactor}px`).style('font-weight', '500').style('fill', '#333');

      const appendSummary = (name, color, stats, isLast) => {
        const pct = (stats.filteredHours / stats.totalHoursInYear) * 100;
        summaryText.append('tspan').style('fill', color).style('font-weight', 'bold').text(`${name}: `);
        if (pct >= 99.9) {
          summaryText.append('tspan').text(`Annual (${stats.filteredHours} h)`);
        } else {
          summaryText.append('tspan').style('fill', '#D22B2B').style('font-weight', 'bold').text(`${pct.toFixed(1)}%`);
          summaryText.append('tspan').text(` (${stats.filteredHours} h)`);
        }
        if (!isLast) summaryText.append('tspan').text('     ');
      };
      appendSummary(legendNameA, colorA, statsA, false);
      appendSummary(legendNameB, colorB, statsB, true);
    }
  }

  if (chartRefs) {
    chartRefs.updateWindRose = update;
  }
}

export function renderWindSpeedComparison(selector, dataA, dataB) {
  const container = d3.select(selector).html('');
  const locNameA = formatSimpleLocation(dataA.metadata.location.city, dataA.metadata.location.country, 'primary');
  const locNameB = formatSimpleLocation(dataB.metadata.location.city, dataB.metadata.location.country, 'comparison');
  const legendNameA = formatCityNameOnly(dataA.metadata.location.city, 'primary');
  const legendNameB = formatCityNameOnly(dataB.metadata.location.city, 'comparison');

  addExportButton(selector, `avg-wind-speed-${locNameA}-vs-${locNameB}`, `${locNameA} vs. ${locNameB}`);
  addInfoButton(selector, 'compareWindSpeed');
  container.append('h5').text('Average Monthly Wind Speed Comparison').attr('class', 'chart-title-main');

  const margin = { top: 20, right: 20, bottom: 80, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 300 - margin.top - margin.bottom;
  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  svg.append("rect").attr("width", width).attr("height", height).attr("fill", "#f8f9fa").style("transition", "fill 0.3s ease-in-out")
    .on("mouseover", function () { d3.select(this).attr("fill", "#f7fafc"); })
    .on("mouseout", function () { d3.select(this).attr("fill", "#f8f9fa"); });

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");

  const processData = (hourlyData) => {
    const monthlyData = Array.from(d3.group(hourlyData, d => d.month), ([month, dataList]) => ({
      month: d3.timeFormat("%b")(new Date(2000, month - 1)),
      mean: d3.mean(dataList, d => d.windSpeed),
      max: d3.max(dataList, d => d.windSpeed)
    })).sort((a, b) => new Date('1 ' + a.month + ' 2000') - new Date('1 ' + b.month + ' 2000'));
    const annualData = { month: 'Annual', mean: d3.mean(hourlyData, d => d.windSpeed), max: d3.max(hourlyData, d => d.windSpeed) };
    return [...monthlyData, annualData];
  };

  const plotDataA = processData(dataA.data);
  const plotDataB = processData(dataB.data);
  const dataMapA = new Map(plotDataA.map(d => [d.month, d]));
  const dataMapB = new Map(plotDataB.map(d => [d.month, d]));

  const monthLabels = [...plotDataA.map(d => d.month).slice(0, 12), "", "Annual"];
  const colorA = '#377eb8', colorB = '#4daf4a';

  const x0 = d3.scaleBand().domain(monthLabels).rangeRound([0, width]).paddingInner(0.2);
  const x1 = d3.scaleBand().domain(['A', 'B']).rangeRound([0, x0.bandwidth()]).padding(0.05);

  const maxMean = d3.max([d3.max(plotDataA, d => d.mean), d3.max(plotDataB, d => d.mean)]);
  const y = d3.scaleLinear().domain([0, maxMean * 1.2 || 5]).nice().range([height, 0]);

  svg.append("g").attr("class", "grid-line").call(d3.axisLeft(y).tickSize(-width).tickFormat("")).selectAll("line").attr("stroke", "#b0b0b0").attr("stroke-opacity", 0.6).attr("stroke-dasharray", "3,3");
  svg.select(".grid-line .domain").remove();

  const xAxis = svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x0));
  xAxis.selectAll(".tick").filter(d => d === "").remove();
  svg.append("g").call(d3.axisLeft(y));
  svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 20).attr("x", -height / 2).attr("text-anchor", "middle").style('font-family', FONT_STACK).style('font-size', '11px').text("m/s");

  const monthGroup = svg.selectAll(".month-group").data(monthLabels).join("g").attr("class", "month-group").attr("transform", d => `translate(${x0(d)},0)`);

  monthGroup.selectAll("rect.bar-a").data(d => d ? [dataMapA.get(d)] : []).join("rect").attr("class", "bar-a").attr("x", x1('A')).attr("y", d => y(d.mean)).attr("width", x1.bandwidth()).attr("height", d => height - y(d.mean)).attr("fill", colorA).style("transition", "fill 0.3s ease-in-out")
    .on("mouseover", function (event, d) {
      d3.select(this).attr("fill", d3.color(colorA).darker(0.3));
      tooltip.style("opacity", 1).html(`<strong>${legendNameA} - ${d.month}</strong><br>Mean: ${d.mean.toFixed(1)} m/s<br>Max: ${d.max.toFixed(1)} m/s`);
    })
    .on("mousemove", event => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
    .on("mouseout", function () {
      d3.select(this).attr("fill", colorA);
      tooltip.style("opacity", 0);
    });

  monthGroup.selectAll("rect.bar-b").data(d => d ? [dataMapB.get(d)] : []).join("rect").attr("class", "bar-b").attr("x", x1('B')).attr("y", d => y(d.mean)).attr("width", x1.bandwidth()).attr("height", d => height - y(d.mean)).attr("fill", colorB).style("transition", "fill 0.3s ease-in-out")
    .on("mouseover", function (event, d) {
      d3.select(this).attr("fill", d3.color(colorB).darker(0.3));
      tooltip.style("opacity", 1).html(`<strong>${legendNameB} - ${d.month}</strong><br>Mean: ${d.mean.toFixed(1)} m/s<br>Max: ${d.max.toFixed(1)} m/s`);
    })
    .on("mousemove", event => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
    .on("mouseout", function () {
      d3.select(this).attr("fill", colorB);
      tooltip.style("opacity", 0);
    });

  let locationHTML = `<div xmlns="http://www.w3.org/1999/xhtml" style="display: flex; justify-content: center; align-items: center; gap: 1.5rem; width: 100%; height: 100%; font-family: sans-serif; font-size: 0.8rem;">`;
  locationHTML += `<div style="display: flex; align-items: center; gap: 0.5rem;"><div style="width: 14px; height: 14px; background-color: ${colorA}; border: 1px solid #555;"></div><span>${legendNameA}</span></div>`;
  locationHTML += `<div style="display: flex; align-items: center; gap: 0.5rem;"><div style="width: 14px; height: 14px; background-color: ${colorB}; border: 1px solid #555;"></div><span>${legendNameB}</span></div>`;
  locationHTML += `</div>`;

  svg.append('foreignObject').attr('x', 0).attr('y', height + 40).attr('width', width).attr('height', 30).html(locationHTML);
}