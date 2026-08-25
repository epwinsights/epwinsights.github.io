/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import { formatSimpleLocation, formatCityNameOnly, formatStationDetail } from '../core/location-formatter.js';
import { addExportButton, addInfoButton } from '../core/svg-exporter.js';
import { CHART_DESIGN_WIDTH } from '../core/chart-defaults.js';
import { resolveColorInterpolator, EPW_TEMPERATURE_INTERPOLATOR, EPW_SIGNATURE_PALETTES } from '../core/color-palettes.js';

function estimateWetBulbTemperature(tempC, rh) {
  // Stull (2011) empirical approximation — valid for RH 5-99%, T -20 to 50°C
  return tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659))
    + Math.atan(tempC + rh)
    - Math.atan(rh - 1.676331)
    + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh)
    - 4.686035;
}

export function renderAirTemperatureCharts(epwData, chartRefs) {
  renderAirTempControls('.tab-pane.active .left-panel', chartRefs);
  renderTempHeatmap('#temp-heatmap-chart', epwData, chartRefs);
  renderTempBoxplot('#temp-boxplot-chart', epwData, chartRefs);
  renderTempDiurnalAverages('#temp-diurnal-chart', epwData);
}

export function renderAirTempControls(panelSelector, chartRefs) {
  const panel = d3.select(panelSelector).html('');
  const palettes = {
    "EPW Insights": ['epwTemperature'],
    "Diverging": ['interpolateRdYlBu', 'interpolateRdBu', 'interpolateBrBG', 'interpolatePiYG', 'interpolatePRGn', 'interpolateSpectral'],
    "Sequential (Single Hue)": ['interpolateReds', 'interpolateBlues', 'interpolateGreens', 'interpolateGreys', 'interpolateOranges', 'interpolatePurples'],
    "Sequential (Multi-Hue)": ['interpolateViridis', 'interpolateInferno', 'interpolateMagma', 'interpolatePlasma', 'interpolateCividis', 'interpolateTurbo', 'interpolateWarm', 'interpolateCool']
  };

  const tempControls = panel.append('div').attr('class', 'chart-controls-group');
  tempControls.append('h6').text('Annual Temperature Options');
  const paletteGroup = tempControls.append('div').attr('class', 'control-item');
  paletteGroup.append('label').attr('for', 'temp-palette-select').text('Color Palette:');
  const paletteSelect = paletteGroup.append('select').attr('id', 'temp-palette-select').attr('class', 'form-select form-select-sm');
  for (const group in palettes) {
    const optgroup = paletteSelect.append('optgroup').attr('label', group);
    palettes[group].forEach(p => optgroup.append('option').attr('value', p).text(EPW_SIGNATURE_PALETTES[p] ? 'Signature' : p.replace('interpolate', '')));
  }
  paletteSelect.property('value', 'epwTemperature');

  const reversePaletteGroup = paletteGroup.append('div').attr('class', 'form-check form-check-sm mt-1');
  reversePaletteGroup.append('input').attr('class', 'form-check-input').attr('type', 'checkbox').attr('id', 'temp-reverse-palette');
  reversePaletteGroup.append('label').attr('class', 'form-check-label').attr('for', 'temp-reverse-palette').text('Reverse Color Palette');

  const minMaxGroup = tempControls.append('div').attr('class', 'control-item');
  minMaxGroup.append('label').text('Scale Domain (°C):');
  const minMaxInputs = minMaxGroup.append('div').attr('class', 'input-group input-group-sm');
  const minInput = minMaxInputs.append('input').attr('id', 'temp-min-input').attr('type', 'number').attr('class', 'form-control').attr('placeholder', 'Min');
  const maxInput = minMaxInputs.append('input').attr('id', 'temp-max-input').attr('type', 'number').attr('class', 'form-control').attr('placeholder', 'Max');

  const tempButtons = tempControls.append('div').attr('class', 'control-item d-grid gap-2');
  tempButtons.append('button').attr('class', 'btn btn-primary btn-sm').text('Fit to Data').on('click', () => chartRefs.heatmap.update({ fit: true }));
  tempButtons.append('button').attr('class', 'btn btn-outline-secondary btn-sm').text('Reset').on('click', () => {
    paletteSelect.property('value', 'epwTemperature');
    d3.select('#temp-reverse-palette').property('checked', false);
    chartRefs.heatmap.update({ reset: true });
  });

  const boxplotControls = panel.append('div').attr('class', 'chart-controls-group');
  boxplotControls.append('h6').text('Distribution Options');
  const boxplotButtons = boxplotControls.append('div').attr('class', 'control-item d-grid gap-2');
  boxplotButtons.append('button').attr('class', 'btn btn-primary btn-sm').text('Toggle Jitters').on('click', () => chartRefs.boxplot.toggleJitters());
  boxplotButtons.append('button').attr('class', 'btn btn-primary btn-sm').text('Toggle Wet Bulb Mean').on('click', () => chartRefs.boxplot.toggleWetBulbMean());
  boxplotButtons.append('button').attr('class', 'btn btn-outline-secondary btn-sm').text('Reset').on('click', () => chartRefs.boxplot.update({ reset: true }));
  boxplotControls.append('p').attr('class', 'info-note').text('Hourly data in the tails is shown as dots, which can be toggled.');
  boxplotControls.append('p').attr('class', 'info-note').text('Wet Bulb Mean is estimated using the Stull (2011) empirical approximation from dry-bulb temperature and relative humidity.');

  const updateHeatmap = () => {
    if (chartRefs.heatmap && typeof chartRefs.heatmap.update === 'function') {
      chartRefs.heatmap.update({
        interpolator: resolveColorInterpolator(d3.select('#temp-palette-select').property('value')),
        domain: [parseFloat(minInput.property('value')), parseFloat(maxInput.property('value'))]
      });
    }
  };

  paletteSelect.on('change', updateHeatmap);
  d3.select('#temp-reverse-palette').on('change', updateHeatmap);
  minInput.on('change', updateHeatmap);
  maxInput.on('change', updateHeatmap);
}

export function renderTempHeatmap(selector, epwData, chartRefs) {
  const container = d3.select(selector).html('');
  const hourlyData = epwData.data;
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, 'annual-temperature-heatmap', formattedLocation);
  addInfoButton(selector, 'annualTemperatureHeatmap');

  if (container.node().getBoundingClientRect().width === 0) return;

  container.append('h5').text('Annual Dry Bulb Temperature').attr('class', 'chart-title-main');
  const margin = { top: 20, right: 90, bottom: 60, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;
  const svg = container.append("svg").attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const legend = svg.append("g");
  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");

  chartRefs.heatmap = {
    update: (options = {}) => {
      const allTemps = hourlyData.map(d => d.dryBulbTemperature);
      let { interpolator, domain, fit, reset } = options;
      const isReversed = d3.select('#temp-reverse-palette').property('checked');

      if (reset) {
        domain = d3.extent(allTemps);
        interpolator = EPW_TEMPERATURE_INTERPOLATOR;
      } else if (fit) {
        domain = [d3.quantile(allTemps.sort(d3.ascending), 0.01), d3.quantile(allTemps, 0.99)];
      } else if (!domain || domain.some(d => d === null || isNaN(d))) {
        domain = d3.extent(allTemps);
      }

      interpolator = interpolator || resolveColorInterpolator(d3.select('#temp-palette-select').property('value'));
      d3.select('#temp-min-input').property('value', domain[0].toFixed(1));
      d3.select('#temp-max-input').property('value', domain[1].toFixed(1));

      const finalDomain = isReversed ? domain : [domain[1], domain[0]];
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
        .style("fill", d => colorScale(d.dryBulbTemperature))
        .on("mouseover", (event, d) => tooltip.style("opacity", 1).html(`<strong>${d3.timeFormat('%b %d, %H:%M')(d.datetime)}</strong><br>Temp: ${d.dryBulbTemperature.toFixed(1)} °C`))
        .on("mousemove", (event) => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
        .on("mouseout", () => tooltip.style("opacity", 0));

      legend.html('').attr("transform", `translate(${width + 20}, 0)`);
      legend.append("text").attr("x", -7.5).attr("y", -8).attr("class", "axis-title").style("text-anchor", "middle").text("°C").style("font-family", "sans-serif").style("font-size", "11px");
      const legendScale = d3.scaleLinear().domain(domain).range([height, 0]);
      legend.append("g").call(d3.axisRight(legendScale).ticks(8).tickFormat(d => d.toFixed(0)));
      const gradient = legend.append("defs").append("linearGradient").attr("id", "temp-grad").attr("x1", "0%").attr("y1", "100%").attr("x2", "0%").attr("y2", "0%");
      gradient.selectAll("stop")
        .data(d3.range(0, 1.01, 0.05))
        .join("stop")
        .attr("offset", d => `${d * 100}%`)
        .attr("stop-color", t => isReversed ? interpolator(t) : interpolator(1 - t));
      legend.append("rect").attr("x", -15).attr("y", 0).attr("width", 15).attr("height", height).style("fill", "url(#temp-grad)");
    }
  };
  chartRefs.heatmap.update({ reset: true });
}

export function renderTempBoxplot(selector, epwData, chartRefs) {
  const container = d3.select(selector).html('');
  const hourlyData = epwData.data;
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, 'monthly-temperature-distribution', formattedLocation);
  addInfoButton(selector, 'monthlyTemperatureDistribution');

  if (container.node().getBoundingClientRect().width === 0) return;

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  container.append('h5').text('Monthly Temperature Distribution').attr('class', 'chart-title-main');

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
    const dryTemps = d.value.map(h => h.dryBulbTemperature).sort(d3.ascending);
    const min = d3.min(dryTemps), max = d3.max(dryTemps);
    const q1 = d3.quantile(dryTemps, 0.25), median = d3.quantile(dryTemps, 0.5), q3 = d3.quantile(dryTemps, 0.75);
    const iqr = q3 - q1;
    d.stats = { min, max, q1, median, q3, lower: Math.max(min, q1 - 1.5 * iqr), upper: Math.min(max, q3 + 1.5 * iqr) };
    d.wetBulbMean = d3.mean(d.value, h => estimateWetBulbTemperature(h.dryBulbTemperature, h.relativeHumidity));
    d.mean = d3.mean(d.value, h => h.dryBulbTemperature);
  });

  const x = d3.scaleBand().domain([...monthlyData.map(d => d3.timeFormat("%b")(new Date(2000, d.key - 1))), "", "Annual"]).range([0, width]).paddingInner(0.6).paddingOuter(0.3);
  const y = d3.scaleLinear().range([height, 0]);

  svg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0, ${height})`);
  svg.append("g").attr("class", "axis y-axis");
  svg.append("g").attr("class", "grid-line");
  svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 20).attr("x", -height / 2).text("°C");

  let showJitters = false;
  let showWetBulbMean = true;

  function updateLegend() {
    svg.select(".legend-foreign-object").remove();

    const legendItemsData = [
      { icon: `<svg viewBox="0 0 12 12"><rect width="11" height="11" x="0.5" y="0.5" fill="#fdae6b" stroke="black" stroke-width="1"></rect></svg>`, text: 'Interquartile Range (IQR)' },
      { icon: `<svg viewBox="0 0 12 12"><path d="M6 1 V 11 M 3 1 H 9 M 3 11 H 9" stroke="black" stroke-width="1.5" fill="none"></path></svg>`, text: '1.5 * IQR' },
      { icon: `<svg viewBox="0 0 12 12"><rect x="0" y="0" width="12" height="12" fill="#fdae6b" stroke="black" stroke-width="0.5"></rect><line x1="0" y1="6" x2="12" y2="6" stroke="black" stroke-width="2"></line></svg>`, text: 'Median' },
      { icon: `<svg viewBox="0 0 12 12"><rect x="0" y="0" width="12" height="12" fill="#fdae6b" stroke="black" stroke-width="0.5"></rect><circle cx="6" cy="6" r="2.5" fill="black"></circle></svg>`, text: 'Mean' }
    ];

    if (showWetBulbMean) {
      legendItemsData.push({ icon: `<svg viewBox="0 0 12 12"><path d="M6,1 L11,10 L1,10 Z" fill="#e41a1c"></path></svg>`, text: 'Wet Bulb Mean' });
    }

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
    toggleWetBulbMean: () => {
      showWetBulbMean = !showWetBulbMean;
      svg.selectAll(".wb-marker").style("display", showWetBulbMean ? "block" : "none");
      updateLegend();
    },
    update: (options = {}) => {
      if (options.reset) {
        showJitters = false;
        showWetBulbMean = true;
      }
      y.domain(d3.extent(hourlyData, d => d.dryBulbTemperature)).nice();

      svg.select(".grid-line").call(d3.axisLeft(y).tickSize(-width).tickFormat(""))
        .selectAll("line")
        .attr("stroke", "#b0b0b0")
        .attr("stroke-opacity", 0.6)
        .attr("stroke-dasharray", "3,3");
      svg.select(".grid-line").selectAll(".tick").filter(d => d === y.domain()[0]).remove();
      svg.select(".grid-line .domain").remove();

      svg.select(".x-axis").call(d3.axisBottom(x));
      svg.select(".x-axis").selectAll(".tick").filter(d => d === "").style("display", "none");
      svg.select(".y-axis").transition().call(d3.axisLeft(y).tickFormat(d => `${d}°`));

      const boxGroup = svg.selectAll(".box-group").data(allPlotData).join("g").attr("class", "box-group")
        .attr("transform", d => `translate(${x(d.key === 'Annual' ? 'Annual' : d3.timeFormat("%b")(new Date(2000, d.key - 1)))}, 0)`);

      boxGroup.selectAll(".box-part, .jitter-point, .wb-marker").remove();

      const jitterWidth = x.bandwidth();
      boxGroup.selectAll(".jitter-point")
        .data(d => d.key === 'Annual' ? [] : d.value.filter(p => p.dryBulbTemperature > d.stats.q3 || p.dryBulbTemperature < d.stats.q1))
        .join("circle").attr("class", "jitter-point")
        .attr("cx", d => (x.bandwidth() / 2) + (Math.random() - 0.5) * jitterWidth)
        .attr("cy", d => y(d.dryBulbTemperature))
        .attr("r", 0.2)
        .style("fill", "black")
        .style("stroke", "black")
        .style("opacity", 0.4)
        .style("display", showJitters ? "block" : "none");

      boxGroup.append("line").attr("class", "box-part").attr("x1", x.bandwidth() / 2).attr("x2", x.bandwidth() / 2).attr("y1", d => y(d.stats.upper)).attr("y2", d => y(d.stats.q3)).attr("stroke", "black").attr("stroke-width", 0.5);
      boxGroup.append("line").attr("class", "box-part").attr("x1", x.bandwidth() / 2).attr("x2", x.bandwidth() / 2).attr("y1", d => y(d.stats.q1)).attr("y2", d => y(d.stats.lower)).attr("stroke", "black").attr("stroke-width", 0.5);
      boxGroup.append("line").attr("class", "box-part").attr("x1", x.bandwidth() * 0.25).attr("x2", x.bandwidth() * 0.75).attr("y1", d => y(d.stats.upper)).attr("y2", d => y(d.stats.upper)).attr("stroke", "black");
      boxGroup.append("line").attr("class", "box-part").attr("x1", x.bandwidth() * 0.25).attr("x2", x.bandwidth() * 0.75).attr("y1", d => y(d.stats.lower)).attr("y2", d => y(d.stats.lower)).attr("stroke", "black");

      boxGroup.append("rect").attr("class", "box-part").attr("x", 0).attr("y", d => y(d.stats.q3)).attr("width", x.bandwidth()).attr("height", d => y(d.stats.q1) - y(d.stats.q3))
        .attr("fill", "#fdae6b").attr("stroke", "black").attr("stroke-width", 0.5).style("transition", "fill 0.2s ease-in-out")
        .on("mouseover", function (event, d) {
          d3.select(this).attr("fill", "#fd8d3c");
          tooltip.style("opacity", 1);
          const monthName = d.key === 'Annual' ? 'Annual' : d3.timeFormat("%B")(new Date(2000, d.key - 1));
          tooltip.html(`<strong>${monthName}</strong><br>Max: ${d.stats.max.toFixed(1)} °C<br>Median: ${d.stats.median.toFixed(1)} °C<br>Mean: ${d.mean.toFixed(1)} °C<br>Min: ${d.stats.min.toFixed(1)} °C`);
        })
        .on("mousemove", event => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
        .on("mouseout", function () { d3.select(this).attr("fill", "#fdae6b"); tooltip.style("opacity", 0); });

      boxGroup.append("line").attr("class", "box-part").attr("x1", 0).attr("x2", x.bandwidth()).attr("y1", d => y(d.stats.median)).attr("y2", d => y(d.stats.median)).attr("stroke", "black").attr("stroke-width", 1.5);
      boxGroup.append("circle").attr("class", "box-part").attr("cx", x.bandwidth() / 2).attr("cy", d => y(d.mean)).attr("r", 2.5).attr("fill", "black");

      const triangle = d3.symbol().type(d3.symbolTriangle).size(80);
      boxGroup.selectAll(".wb-marker").data(d => d.wetBulbMean !== undefined ? [d] : []).join("path").attr("class", "wb-marker").attr("d", triangle).attr("transform", d => `translate(${x.bandwidth() / 2}, ${y(d.wetBulbMean)})`).attr("fill", "#e41a1c").style("display", showWetBulbMean ? "block" : "none")
        .on("mouseover", function (event, d) {
          d3.select(this).attr("fill", "#b3161a");
          const monthName = d.key === 'Annual' ? 'Annual' : d3.timeFormat("%B")(new Date(2000, d.key - 1));
          tooltip.style("opacity", 1).html(`<strong>${monthName}</strong><br>Wet Bulb Mean: ${d.wetBulbMean.toFixed(1)} °C`);
        })
        .on("mousemove", (event) => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
        .on("mouseout", function () { d3.select(this).attr("fill", "#e41a1c"); tooltip.style("opacity", 0); })
        .raise();

      updateLegend();
    }
  };
  chartRefs.boxplot.update({ reset: true });
}

export function renderTempDiurnalAverages(selector, epwData) {
  const container = d3.select(selector).html('');
  const hourlyData = epwData.data;
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, 'hourly-temperature-averages', formattedLocation);
  addInfoButton(selector, 'hourlyTemperatureAverages');

  container.append('h5').text('Hourly Averages: Dry Bulb vs. Dew Point').attr('class', 'chart-title-main');

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  const bodyFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  const monthlyGroups = d3.group(hourlyData, d => d.month);
  const plotData = [];
  for (let m = 1; m <= 12; m++) {
    const monthData = monthlyGroups.get(m) || [];
    const hourlyAvg = d3.rollups(monthData,
      v => ({
        dryBulb: d3.mean(v, d => d.dryBulbTemperature),
        dewPoint: d3.mean(v, d => d.dewPointTemperature)
      }),
      d => d.hour
    ).sort((a, b) => a[0] - b[0]);
    plotData.push({
      key: d3.timeFormat("%B")(new Date(2000, m - 1)),
      values: hourlyAvg,
      meanDryBulb: d3.mean(monthData, d => d.dryBulbTemperature),
      meanDewPoint: d3.mean(monthData, d => d.dewPointTemperature)
    });
  }

  const tempExtent = d3.extent(hourlyData, d => d.dryBulbTemperature);

  const numCols = 4;
  const numRows = 3;
  const legendHeight = 50;

  const chartMargin = { top: 30, right: 20, bottom: 40, left: 45 };
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
      .attr("fill", "#f8f9fa");

    g.append('text').attr('x', chartWidth / 2).attr('y', -10).attr('text-anchor', 'middle').style('font-weight', 'bold').style('font-size', '14px').style("font-family", bodyFont).text(d.key);

    const x = d3.scaleLinear().domain([0, 24]).range([0, chartWidth]);
    const y = d3.scaleLinear().domain(tempExtent).range([chartHeight, 0]).nice();

    g.append("g").attr("transform", `translate(0,${chartHeight})`).call(d3.axisBottom(x).tickValues([0, 6, 12, 18, 24])).style("font-family", bodyFont);
    g.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d}°`)).style("font-family", bodyFont);

    g.append("text").attr("class", "axis-title").attr("x", chartWidth / 2).attr("y", chartHeight + 35).style("text-anchor", "middle").text("Hour").style("font-family", bodyFont).style("font-size", "12px");
    g.append("text").attr("class", "axis-title").attr("transform", "rotate(-90)").attr("y", -chartMargin.left + 15).attr("x", -chartHeight / 2).style("text-anchor", "middle").text("°C").style("font-family", bodyFont).style("font-size", "12px");

    const lineDryBulb = d3.line().x(p => x(p[0])).y(p => y(p[1].dryBulb));
    g.append("path").datum(d.values).attr("fill", "none").attr("stroke", "#e41a1c").attr("stroke-width", 2.5).attr("d", lineDryBulb);

    const lineDewPoint = d3.line().x(p => x(p[0])).y(p => y(p[1].dewPoint));
    g.append("path").datum(d.values).attr("fill", "none").attr("stroke", "#377eb8").attr("stroke-width", 2.5).attr("d", lineDewPoint);

    g.append('rect')
      .attr('width', chartWidth)
      .attr('height', chartHeight)
      .attr('fill', 'none')
      .style('pointer-events', 'all')
      .on('mouseover', function () {
        d3.select(this.parentNode).select('.chart-background').attr("fill", "#f7fafc");
        tooltip.style("opacity", 1)
          .html(`<strong>${d.key} Average:</strong><br>
                           Dry Bulb: ${d.meanDryBulb.toFixed(1)} °C<br>
                           Dew Point: ${d.meanDewPoint.toFixed(1)} °C`);
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
                <span style="white-space: nowrap;">Dry Bulb Temperature</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <svg width="30" height="15"><line x1="0" y1="7.5" x2="30" y2="7.5" style="stroke: #377eb8; stroke-width: 3;"></line></svg>
                <span style="white-space: nowrap;">Dew Point Temperature</span>
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