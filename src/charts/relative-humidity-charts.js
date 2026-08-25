/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import { formatSimpleLocation } from '../core/location-formatter.js';
import { addExportButton, addInfoButton } from '../core/svg-exporter.js';
import { CHART_DESIGN_WIDTH } from '../core/chart-defaults.js';
import { resolveColorInterpolator, EPW_HUMIDITY_INTERPOLATOR, EPW_SIGNATURE_PALETTES } from '../core/color-palettes.js';

export function renderRelativeHumidityCharts(epwData, chartRefs) {
  renderRHControls('.tab-pane.active .left-panel', chartRefs);
  renderRHHeatmap('#rh-heatmap-chart', epwData, chartRefs);
  renderRHBoxplot('#rh-boxplot-chart', epwData, chartRefs);
  renderDiurnalAverages('#rh-diurnal-chart', epwData);
}

export function renderRHControls(panelSelector, chartRefs) {
  const panel = d3.select(panelSelector).html('');
  const palettes = {
    "EPW Insights": ['epwHumidity'],
    "Sequential (Single Hue)": ['interpolateBlues', 'interpolateGreens', 'interpolateGreys', 'interpolateOranges', 'interpolatePurples', 'interpolateReds'],
    "Sequential (Multi-Hue)": ['interpolateViridis', 'interpolateInferno', 'interpolateMagma', 'interpolatePlasma', 'interpolateCividis', 'interpolateTurbo', 'interpolateWarm', 'interpolateCool'],
    "Diverging": ['interpolateRdYlBu', 'interpolateRdBu', 'interpolateBrBG', 'interpolatePiYG', 'interpolatePRGn', 'interpolateSpectral']
  };

  const rhControls = panel.append('div').attr('class', 'chart-controls-group');
  rhControls.append('h6').text('Humidity Chart Options');
  const paletteGroup = rhControls.append('div').attr('class', 'control-item');
  paletteGroup.append('label').attr('for', 'rh-palette-select').text('Color Palette:');
  const paletteSelect = paletteGroup.append('select').attr('id', 'rh-palette-select').attr('class', 'form-select form-select-sm');
  for (const group in palettes) {
    const optgroup = paletteSelect.append('optgroup').attr('label', group);
    palettes[group].forEach(p => optgroup.append('option').attr('value', p).text(EPW_SIGNATURE_PALETTES[p] ? 'Signature' : p.replace('interpolate', '')));
  }
  paletteSelect.property('value', 'epwHumidity');

  const reversePaletteGroup = paletteGroup.append('div').attr('class', 'form-check form-check-sm mt-1');
  reversePaletteGroup.append('input').attr('class', 'form-check-input').attr('type', 'checkbox').attr('id', 'rh-reverse-palette');
  reversePaletteGroup.append('label').attr('class', 'form-check-label').attr('for', 'rh-reverse-palette').text('Reverse Color Palette');

  const minMaxGroup = rhControls.append('div').attr('class', 'control-item');
  minMaxGroup.append('label').text('Scale Domain (%):');
  const minMaxInputs = minMaxGroup.append('div').attr('class', 'input-group input-group-sm');
  const minInput = minMaxInputs.append('input').attr('id', 'rh-min-input').attr('type', 'number').attr('class', 'form-control').attr('placeholder', 'Min');
  const maxInput = minMaxInputs.append('input').attr('id', 'rh-max-input').attr('type', 'number').attr('class', 'form-control').attr('placeholder', 'Max');

  const heatmapButtons = rhControls.append('div').attr('class', 'control-item d-grid gap-2');
  heatmapButtons.append('button').attr('class', 'btn btn-primary btn-sm').text('Fit to Data').on('click', () => chartRefs.heatmap.update({ fit: true }));
  heatmapButtons.append('button').attr('class', 'btn btn-outline-secondary btn-sm').text('Reset').on('click', () => {
    paletteSelect.property('value', 'epwHumidity');
    d3.select('#rh-reverse-palette').property('checked', false);
    chartRefs.heatmap.update({ reset: true });
  });

  const boxplotControls = panel.append('div').attr('class', 'chart-controls-group');
  boxplotControls.append('h6').text('Distribution Options');
  const boxplotButtons = boxplotControls.append('div').attr('class', 'control-item d-grid gap-2');
  boxplotButtons.append('button').attr('class', 'btn btn-primary btn-sm').text('Toggle Jitters').on('click', () => chartRefs.boxplot.toggleJitters());
  boxplotButtons.append('button').attr('class', 'btn btn-outline-secondary btn-sm').text('Reset').on('click', () => chartRefs.boxplot.update({ reset: true }));
  boxplotControls.append('p').attr('class', 'info-note').text('Hourly data in the tails is shown as dots, which can be toggled.');

  const updateHeatmap = () => {
    if (chartRefs.heatmap && typeof chartRefs.heatmap.update === 'function') {
      chartRefs.heatmap.update({
        interpolator: resolveColorInterpolator(d3.select('#rh-palette-select').property('value')),
        domain: [parseFloat(minInput.property('value')), parseFloat(maxInput.property('value'))]
      });
    }
  };

  paletteSelect.on('change', updateHeatmap);
  d3.select('#rh-reverse-palette').on('change', updateHeatmap);
  minInput.on('change', updateHeatmap);
  maxInput.on('change', updateHeatmap);
}

export function renderRHHeatmap(selector, epwData, chartRefs) {
  const container = d3.select(selector).html('');
  const hourlyData = epwData.data;
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, 'annual-humidity-heatmap', formattedLocation);
  addInfoButton(selector, 'annualHumidityHeatmap');
  if (container.node().getBoundingClientRect().width === 0) return;

  container.append('h5').text('Annual Relative Humidity').attr('class', 'chart-title-main');
  const margin = { top: 20, right: 90, bottom: 60, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;
  const svg = container.append("svg").attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const legend = svg.append("g");
  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");

  chartRefs.heatmap = {
    update: (options = {}) => {
      const allValues = hourlyData.map(d => d.relativeHumidity);
      let { interpolator, domain, fit, reset } = options;
      const isReversed = d3.select('#rh-reverse-palette').property('checked');

      if (reset) {
        domain = [0, 100];
        interpolator = EPW_HUMIDITY_INTERPOLATOR;
      } else if (fit) {
        domain = [d3.quantile(allValues.sort(d3.ascending), 0.01), d3.quantile(allValues, 0.99)];
      } else if (!domain || domain.some(d => d === null || isNaN(d))) {
        domain = [0, 100];
      }

      interpolator = interpolator || resolveColorInterpolator(d3.select('#rh-palette-select').property('value'));
      d3.select('#rh-min-input').property('value', domain[0].toFixed(0));
      d3.select('#rh-max-input').property('value', domain[1].toFixed(0));

      const finalDomain = isReversed ? [domain[1], domain[0]] : domain;
      const colorScale = d3.scaleSequential(interpolator).domain(finalDomain);

      const year = hourlyData[0].year;
      const x = d3.scaleLinear().range([0, width]);
      const y = d3.scaleLinear().domain([0, 24]).range([height, 0]);
      const daysInYear = d3.timeDays(new Date(year, 0, 1), new Date(year + 1, 0, 1)).length;
      x.domain([1, daysInYear + 1]);

      svg.selectAll(".axis").remove();
      svg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).tickValues(d3.range(0, 12).map(m => d3.timeDay.count(new Date(year, 0, 1), new Date(year, m, 15)))).tickFormat(d => d3.timeFormat("%b")(d3.timeParse("%j")(d))));
      svg.append("g").attr("class", "axis y-axis").call(d3.axisLeft(y).tickValues([0, 6, 12, 18, 24]));
      svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 22).attr("x", -height / 2).style("text-anchor", "middle").text("Hour of Day").style("font-family", "sans-serif").style("font-size", "12px");
      svg.append("text").attr("class", "x-axis-label axis-title").attr("x", width / 2).attr("y", height + 40).style("text-anchor", "middle").text("Month").style("font-family", "sans-serif").style("font-size", "12px");

      const rectWidth = Math.max(0.1, width / daysInYear);
      svg.selectAll(".hour-rect").data(hourlyData).join("rect").attr("class", "hour-rect")
        .attr("x", d => x(+d3.timeFormat("%j")(d.datetime) + 0.6)).attr("y", d => y(d.hour))
        .attr("width", rectWidth).attr("height", height / 24)
        .style("fill", d => colorScale(d.relativeHumidity))
        .on("mouseover", (event, d) => tooltip.style("opacity", 1).html(`<strong>${d3.timeFormat('%b %d, %H:%M')(d.datetime)}</strong><br>Humidity: ${d.relativeHumidity.toFixed(0)} %`))
        .on("mousemove", (event) => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
        .on("mouseout", () => tooltip.style("opacity", 0));

      legend.html('').attr("transform", `translate(${width + 20}, 0)`);
      legend.append("text").attr("x", -7.5).attr("y", -8).attr("class", "axis-title").style("text-anchor", "middle").text("%").style("font-family", "sans-serif").style("font-size", "11px");
      const legendScale = d3.scaleLinear().domain(domain).range([height, 0]);
      legend.append("g").call(d3.axisRight(legendScale).ticks(8).tickFormat(d => d.toFixed(0)));
      const gradient = legend.append("defs").append("linearGradient").attr("id", "rh-grad").attr("x1", "0%").attr("y1", "100%").attr("x2", "0%").attr("y2", "0%");
      gradient.selectAll("stop")
        .data(d3.range(0, 1.01, 0.05))
        .join("stop")
        .attr("offset", d => `${d * 100}%`)
        .attr("stop-color", t => isReversed ? interpolator(1 - t) : interpolator(t));
      legend.append("rect").attr("x", -15).attr("y", 0).attr("width", 15).attr("height", height).style("fill", "url(#rh-grad)");
    }
  };
  chartRefs.heatmap.update({ reset: true });
}

export function renderRHBoxplot(selector, epwData, chartRefs) {
  const container = d3.select(selector).html('');
  const hourlyData = epwData.data;
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, 'monthly-humidity-distribution', formattedLocation);
  addInfoButton(selector, 'monthlyHumidityDistribution');

  if (container.node().getBoundingClientRect().width === 0) return;

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  container.append('h5').text('Monthly Humidity Distribution').attr('class', 'chart-title-main');
  const margin = { top: 20, right: 20, bottom: 50, left: 60 };
  const legendHeight = 50;
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;
  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom + legendHeight}`)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  svg.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "#f8f9fa")
    .style("transition", "fill 0.3s ease-in-out")
    .on("mouseover", function () { d3.select(this).attr("fill", "#f7fafc"); })
    .on("mouseout", function () { d3.select(this).attr("fill", "#f8f9fa"); });
  const monthlyData = Array.from(d3.group(hourlyData, d => d.month), ([key, value]) => ({ key, value })).sort((a, b) => a.key - b.key);
  const allPlotData = [...monthlyData, { key: "Annual", value: hourlyData }];
  allPlotData.forEach(d => {
    const rhValues = d.value.map(h => h.relativeHumidity).sort(d3.ascending);
    const min = d3.min(rhValues), max = d3.max(rhValues);
    const q1 = d3.quantile(rhValues, 0.25), median = d3.quantile(rhValues, 0.5), q3 = d3.quantile(rhValues, 0.75);
    const iqr = q3 - q1;
    d.stats = { min, max, q1, median, q3, lower: Math.max(min, q1 - 1.5 * iqr), upper: Math.min(max, q3 + 1.5 * iqr) };
    d.mean = d3.mean(d.value, h => h.relativeHumidity);
  });
  const x = d3.scaleBand().domain([...monthlyData.map(d => d3.timeFormat("%b")(new Date(2000, d.key - 1))), "", "Annual"]).range([0, width]).paddingInner(0.6).paddingOuter(0.3);
  const y = d3.scaleLinear().range([height, 0]);
  svg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0, ${height})`);
  svg.append("g").attr("class", "axis y-axis");
  svg.append("g").attr("class", "grid-line");
  svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 20).attr("x", -height / 2).text("%");
  let showJitters = false;
  function updateLegend() {
    svg.select(".legend-foreign-object").remove();
    const legendItemsData = [
      { icon: `<svg viewBox="0 0 12 12"><rect width="11" height="11" x="0.5" y="0.5" fill="#75aadb" stroke="black" stroke-width="1"></rect></svg>`, text: 'Interquartile Range (IQR)' },
      { icon: `<svg viewBox="0 0 12 12"><path d="M6 1 V 11 M 3 1 H 9 M 3 11 H 9" stroke="black" stroke-width="1.5" fill="none"></path></svg>`, text: '1.5 * IQR' },
      { icon: `<svg viewBox="0 0 12 12"><rect x="0" y="0" width="12" height="12" fill="#75aadb" stroke="black" stroke-width="0.5"></rect><line x1="0" y1="6" x2="12" y2="6" stroke="black" stroke-width="2"></line></svg>`, text: 'Median' },
      { icon: `<svg viewBox="0 0 12 12"><rect x="0" y="0" width="12" height="12" fill="#75aadb" stroke="black" stroke-width="0.5"></rect><circle cx="6" cy="6" r="2.5" fill="black"></circle></svg>`, text: 'Mean' }
    ];
    let legendHTML = `<div xmlns="http://www.w3.org/1999/xhtml" style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 1rem 1.5rem; padding: 0.5rem; width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: transparent;">`;
    legendItemsData.forEach(itemData => {
      legendHTML += `<div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem;">
                <div style="width: 14px; height: 14px; flex-shrink: 0;">${itemData.icon}</div>
                <span style="white-space: nowrap;">${itemData.text}</span>
            </div>`;
    });
    legendHTML += `</div>`;
    const foreignObject = svg.append('foreignObject')
      .attr('class', 'legend-foreign-object')
      .attr('x', 0)
      .attr('y', height + margin.bottom - 10)
      .attr('width', width)
      .attr('height', legendHeight);
    foreignObject.html(legendHTML);
  }
  chartRefs.boxplot = {
    toggleJitters: () => {
      showJitters = !showJitters;
      svg.selectAll(".jitter-point").style("display", showJitters ? "block" : "none");
    },
    update: (options = {}) => {
      if (options.reset) {
        showJitters = false;
      }
      y.domain([0, 100]).nice();
      svg.select(".grid-line").call(d3.axisLeft(y).tickSize(-width).tickFormat(""))
        .selectAll("line")
        .attr("stroke", "#b0b0b0")
        .attr("stroke-opacity", 0.6)
        .attr("stroke-dasharray", "3,3");
      svg.select(".grid-line").selectAll(".tick").filter(d => d === y.domain()[0]).remove();
      svg.select(".grid-line .domain").remove();
      svg.select(".x-axis").call(d3.axisBottom(x));
      svg.select(".x-axis").selectAll(".tick").filter(d => d === "").style("display", "none");
      svg.select(".y-axis").transition().call(d3.axisLeft(y).tickFormat(d => `${d}%`));
      const boxGroup = svg.selectAll(".box-group").data(allPlotData).join("g").attr("class", "box-group")
        .attr("transform", d => `translate(${x(d.key === 'Annual' ? 'Annual' : d3.timeFormat("%b")(new Date(2000, d.key - 1)))}, 0)`);
      boxGroup.selectAll(".box-part, .jitter-point").remove();
      const jitterWidth = x.bandwidth();
      boxGroup.selectAll(".jitter-point")
        .data(d => d.key === 'Annual' ? [] : d.value.filter(p => p.relativeHumidity > d.stats.q3 || p.relativeHumidity < d.stats.q1))
        .join("circle")
        .attr("class", "jitter-point")
        .attr("cx", d => (x.bandwidth() / 2) + (Math.random() - 0.5) * jitterWidth)
        .attr("cy", d => y(d.relativeHumidity))
        .attr("r", 0.2).style("fill", "black").style("stroke", "black").style("opacity", 0.4).style("display", showJitters ? "block" : "none");
      boxGroup.append("line").attr("class", "box-part").attr("x1", x.bandwidth() / 2).attr("x2", x.bandwidth() / 2).attr("y1", d => y(d.stats.upper)).attr("y2", d => y(d.stats.q3)).attr("stroke", "black").attr("stroke-width", 0.5);
      boxGroup.append("line").attr("class", "box-part").attr("x1", x.bandwidth() / 2).attr("x2", x.bandwidth() / 2).attr("y1", d => y(d.stats.q1)).attr("y2", d => y(d.stats.lower)).attr("stroke", "black").attr("stroke-width", 0.5);
      boxGroup.append("line").attr("class", "box-part").attr("x1", x.bandwidth() * 0.25).attr("x2", x.bandwidth() * 0.75).attr("y1", d => y(d.stats.upper)).attr("y2", d => y(d.stats.upper)).attr("stroke", "black");
      boxGroup.append("line").attr("class", "box-part").attr("x1", x.bandwidth() * 0.25).attr("x2", x.bandwidth() * 0.75).attr("y1", d => y(d.stats.lower)).attr("y2", d => y(d.stats.lower)).attr("stroke", "black");
      boxGroup.append("rect").attr("class", "box-part").attr("x", 0).attr("y", d => y(d.stats.q3)).attr("width", x.bandwidth()).attr("height", d => y(d.stats.q1) - y(d.stats.q3))
        .attr("fill", "#75aadb").attr("stroke", "black").attr("stroke-width", 0.5).style("transition", "fill 0.2s ease-in-out")
        .on("mouseover", function (event, d) {
          d3.select(this).attr("fill", "#4a90e2");
          tooltip.style("opacity", 1);
          const monthName = d.key === 'Annual' ? 'Annual' : d3.timeFormat("%B")(new Date(2000, d.key - 1));
          tooltip.html(`<strong>${monthName}</strong><br>Max: ${d.stats.max.toFixed(0)} %<br>Median: ${d.stats.median.toFixed(0)} %<br>Mean: ${d.mean.toFixed(0)} %<br>Min: ${d.stats.min.toFixed(0)} %`);
        })
        .on("mousemove", function (event) { tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`); })
        .on("mouseout", function () { d3.select(this).attr("fill", "#75aadb"); tooltip.style("opacity", 0); });
      boxGroup.append("line").attr("class", "box-part").attr("x1", 0).attr("x2", x.bandwidth()).attr("y1", d => y(d.stats.median)).attr("y2", d => y(d.stats.median)).attr("stroke", "black").attr("stroke-width", 1.5);
      boxGroup.append("circle").attr("class", "box-part").attr("cx", x.bandwidth() / 2).attr("cy", d => y(d.mean)).attr("r", 2.5).attr("fill", "black");
      updateLegend();
    }
  };
  chartRefs.boxplot.update({ reset: true });
}

export function renderDiurnalAverages(selector, epwData) {
  const container = d3.select(selector).html('');
  const hourlyData = epwData.data;
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, 'hourly-humidity-averages', formattedLocation);
  addInfoButton(selector, 'hourlyHumidityAverages');

  container.append('h5').text('Hourly Averages: Temp & Humidity by Month').attr('class', 'chart-title-main');

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  const bodyFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  const monthlyGroups = d3.group(hourlyData, d => d.month);
  const plotData = [];
  for (let m = 1; m <= 12; m++) {
    const monthData = monthlyGroups.get(m) || [];
    const hourlyAvg = d3.rollups(monthData,
      v => ({
        temp: d3.mean(v, d => d.dryBulbTemperature),
        rh: d3.mean(v, d => d.relativeHumidity)
      }),
      d => d.hour
    ).sort((a, b) => a[0] - b[0]);
    plotData.push({
      key: d3.timeFormat("%B")(new Date(2000, m - 1)),
      values: hourlyAvg,
      meanTemp: d3.mean(monthData, d => d.dryBulbTemperature),
      meanRh: d3.mean(monthData, d => d.relativeHumidity)
    });
  }
  const tempExtent = d3.extent(hourlyData, d => d.dryBulbTemperature);
  const numCols = 4;
  const numRows = 3;
  const legendHeight = 50;
  const chartMargin = { top: 30, right: 45, bottom: 40, left: 45 };
  const chartWidth = 250 - chartMargin.left - chartMargin.right;
  const chartHeight = 200 - chartMargin.top - chartMargin.bottom;
  const totalWidth = numCols * (chartWidth + chartMargin.left + chartMargin.right);
  const totalHeight = numRows * (chartHeight + chartMargin.top + chartMargin.bottom) + legendHeight;
  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
  plotData.forEach((d, i) => {
    const col = i % numCols;
    const row = Math.floor(i / numCols);
    const xPos = col * (chartWidth + chartMargin.left + chartMargin.right);
    const yPos = row * (chartHeight + chartMargin.top + chartMargin.bottom);
    const g = svg.append("g")
      .attr("transform", `translate(${xPos + chartMargin.left}, ${yPos + chartMargin.top})`);
    g.append('rect')
      .attr('class', 'chart-background')
      .attr('width', chartWidth)
      .attr('height', chartHeight)
      .attr("fill", "#f8f9fa")
      .style("transition", "fill 0.3s ease-in-out");
    g.append('text').attr('x', chartWidth / 2).attr('y', -10).attr('text-anchor', 'middle').style('font-weight', 'bold').style("font-family", bodyFont).style('font-size', '14px').text(d.key);
    const x = d3.scaleLinear().domain([0, 24]).range([0, chartWidth]);
    const yTemp = d3.scaleLinear().domain(tempExtent).range([chartHeight, 0]).nice();
    const yRH = d3.scaleLinear().domain([0, 100]).range([chartHeight, 0]);
    g.append("g").attr("transform", `translate(0,${chartHeight})`).call(d3.axisBottom(x).tickValues([0, 6, 12, 18, 24])).style("font-family", bodyFont);
    g.append("g").call(d3.axisLeft(yTemp).ticks(5).tickFormat(d => `${d}°`)).style("font-family", bodyFont);
    g.append("g").attr("transform", `translate(${chartWidth}, 0)`).call(d3.axisRight(yRH).ticks(5).tickFormat(d => `${d}%`)).style("font-family", bodyFont);
    g.append("text").attr("class", "axis-title").attr("x", chartWidth / 2).attr("y", chartHeight + 35).style("text-anchor", "middle").text("Hour").style("font-family", bodyFont).style("font-size", "13px");
    g.append("text").attr("class", "axis-title").attr("transform", "rotate(-90)").attr("y", -chartMargin.left + 15).attr("x", -chartHeight / 2).style("text-anchor", "middle").text("Temp (°C)").style("font-family", bodyFont).style("font-size", "11px");
    g.append("text").attr("class", "axis-title").attr("transform", "rotate(-90)").attr("y", chartWidth + chartMargin.right - 5).attr("x", -chartHeight / 2).style("text-anchor", "middle").text("RH (%)").style("font-family", bodyFont).style("font-size", "11px");
    const lineTemp = d3.line().x(p => x(p[0])).y(p => yTemp(p[1].temp));
    g.append("path").datum(d.values).attr("fill", "none").attr("stroke", "#e41a1c").attr("stroke-width", 2.5).attr("d", lineTemp);
    g.selectAll('.rh-dot').data(d.values).join('circle').attr('class', 'rh-dot')
      .attr('cx', p => x(p[0])).attr('cy', p => yRH(p[1].rh)).attr('r', 2.5).attr('fill', '#377eb8');
    g.append('rect')
      .attr('width', chartWidth)
      .attr('height', chartHeight)
      .attr('fill', 'none')
      .style('pointer-events', 'all')
      .on('mouseover', function () {
        d3.select(this.parentNode).select('.chart-background').attr("fill", "#f7fafc");
        tooltip.style("opacity", 1)
          .html(`<strong>${d.key} Average:</strong><br>
                           Temp: ${d.meanTemp.toFixed(1)} °C<br>
                           Humidity: ${d.meanRh.toFixed(0)} %`);
      })
      .on('mousemove', (event) => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
      .on('mouseout', function () {
        d3.select(this.parentNode).select('.chart-background').attr("fill", "#f8f9fa");
        tooltip.style("opacity", 0);
      });
  });
  const legendHTML = `
        <div xmlns="http://www.w3.org/1999/xhtml" style="display: flex; justify-content: center; align-items: center; gap: 2rem; width: 100%; height: 100%; font-family: ${bodyFont}; font-size: 0.9em;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <svg width="30" height="15"><line x1="0" y1="7.5" x2="30" y2="7.5" style="stroke: #e41a1c; stroke-width: 3;"></line></svg>
                <span style="white-space: nowrap;">Temperature</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <svg width="30" height="15"><circle cx="15" cy="7.5" r="4" style="fill: #377eb8;"></circle></svg>
                <span style="white-space: nowrap;">Relative Humidity</span>
            </div>
        </div>
    `;
  const foreignObject = svg.append('foreignObject')
    .attr('x', 0)
    .attr('y', totalHeight - legendHeight)
    .attr('width', totalWidth)
    .attr('height', legendHeight);
  foreignObject.html(legendHTML);
}