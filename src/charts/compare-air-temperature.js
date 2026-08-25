/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import { formatSimpleLocation, formatCityNameOnly } from '../core/location-formatter.js';
import { addExportButton, addInfoButton } from '../core/svg-exporter.js';
import { CHART_DESIGN_WIDTH } from '../core/chart-defaults.js';

function estimateWetBulbTemperature(tempC, rh) {
  return tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659))
    + Math.atan(tempC + rh)
    - Math.atan(rh - 1.676331)
    + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh)
    - 4.686035;
}

export function renderAirTemperatureCompareCharts(epwDataA, epwDataB) {
  const chartRefs = {};
  const contentArea = d3.select("#compare-content-area").html('');
  contentArea.append('div').attr('id', 'compare-temp-dist-chart').attr('class', 'chart-container mb-5');
  contentArea.append('div').attr('id', 'compare-temp-diurnal-chart').attr('class', 'chart-container');
  renderTempCompareControls('#compare-pane .left-panel', chartRefs);
  renderTempDistributionComparison('#compare-temp-dist-chart', epwDataA, epwDataB, chartRefs);
  renderTempDiurnalComparison('#compare-temp-diurnal-chart', epwDataA, epwDataB);
}

export function renderTempCompareControls(panelSelector, chartRefs) {
  const panel = d3.select(panelSelector);
  const tempDistControls = panel.append('div').attr('class', 'chart-controls-group');
  tempDistControls.append('h6').text('Temp. Distribution Options');

  const tempDistSwitch = tempDistControls.append('div').attr('class', 'form-check form-switch');
  tempDistSwitch.html(`<input class="form-check-input" type="checkbox" id="toggle-wet-bulb-mean-compare" checked>
                         <label class="form-check-label" for="toggle-wet-bulb-mean-compare">Toggle Wet Bulb Mean</label>`);

  d3.select('#toggle-wet-bulb-mean-compare').on('change', function () {
    if (chartRefs.tempDist && typeof chartRefs.tempDist.toggleWetBulbMean === 'function') {
      chartRefs.tempDist.toggleWetBulbMean(this.checked);
    }
  });

  tempDistControls.append('p').attr('class', 'info-note').text('Wet Bulb Mean is estimated using the Stull (2011) empirical approximation from dry-bulb temperature and relative humidity.');
}

export function renderTempDistributionComparison(selector, dataA, dataB, chartRefs) {
  const container = d3.select(selector).html('');
  const locNameA = formatSimpleLocation(dataA.metadata.location.city, dataA.metadata.location.country, 'primary');
  const locNameB = formatSimpleLocation(dataB.metadata.location.city, dataB.metadata.location.country, 'comparison');
  const legendNameA = formatCityNameOnly(dataA.metadata.location.city, 'primary');
  const legendNameB = formatCityNameOnly(dataB.metadata.location.city, 'comparison');

  addExportButton(selector, `temp-dist-${locNameA}-vs-${locNameB}`, `${locNameA} vs. ${locNameB}`);
  addInfoButton(selector, 'compareTempDistribution');

  container.append('h5').text('Monthly Temperature Distribution Comparison').attr('class', 'chart-title-main');
  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");

  let showWetBulbMean = true;
  const margin = { top: 20, right: 20, bottom: 90, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  svg.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "#f8f9fa")
    .style("transition", "fill 0.3s ease-in-out")
    .on("mouseover", function () { d3.select(this).attr("fill", "#f7fafc"); })
    .on("mouseout", function () { d3.select(this).attr("fill", "#f8f9fa"); });

  const processData = (hourlyData) => {
    const monthlyData = Array.from(d3.group(hourlyData, d => d.month), ([key, value]) => ({ key, value }))
      .sort((a, b) => a.key - b.key);

    const allPlotData = [...monthlyData, { key: "Annual", value: hourlyData }];

    allPlotData.forEach(d => {
      const dryTemps = d.value.map(h => h.dryBulbTemperature).sort(d3.ascending);
      d.stats = {
        min: d3.min(dryTemps),
        max: d3.max(dryTemps),
        q1: d3.quantile(dryTemps, 0.25),
        median: d3.quantile(dryTemps, 0.5),
        q3: d3.quantile(dryTemps, 0.75)
      };
      const iqr = d.stats.q3 - d.stats.q1;
      d.stats.lower = Math.max(d.stats.min, d.stats.q1 - 1.5 * iqr);
      d.stats.upper = Math.min(d.stats.max, d.stats.q3 + 1.5 * iqr);
      d.mean = d3.mean(d.value, h => h.dryBulbTemperature);
      d.wetBulbMean = d3.mean(d.value, h => estimateWetBulbTemperature(h.dryBulbTemperature, h.relativeHumidity));
    });
    return allPlotData;
  };

  const plotDataA = processData(dataA.data);
  const plotDataB = processData(dataB.data);
  const dataMapA = new Map(plotDataA.map(d => [d.key, d]));
  const dataMapB = new Map(plotDataB.map(d => [d.key, d]));

  const monthLabels = [...d3.range(0, 12).map(i => d3.timeFormat("%b")(new Date(2000, i, 1))), "", "Annual"];
  const colorA = '#fdae6b', colorB = '#93ccea';
  const wbColorA = '#e41a1c', wbColorB = '#377eb8';

  const x0 = d3.scaleBand().domain(monthLabels).rangeRound([0, width]).paddingInner(0.4);
  const x1 = d3.scaleBand().domain(['A', 'B']).rangeRound([0, x0.bandwidth()]).padding(0.25);
  const y = d3.scaleLinear().domain(d3.extent([...dataA.data, ...dataB.data], d => d.dryBulbTemperature)).nice().range([height, 0]);

  svg.append("g").attr("class", "grid-line").call(d3.axisLeft(y).tickSize(-width).tickFormat("")).selectAll("line").attr("stroke", "#e0e0e0").attr("stroke-dasharray", "3,3");
  svg.select(".grid-line .domain").remove();

  const xAxis = svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x0));
  xAxis.selectAll(".tick").filter(d => d === "").remove();

  svg.append("g").call(d3.axisLeft(y).tickFormat(d => `${d}°`));
  svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 20).attr("x", -height / 2).text("°C");

  const legendsGroup = svg.append('g').attr('class', 'legends-container');
  const updateLegends = () => {
    legendsGroup.html('');
    const boxPlotLegendHeight = 30;
    const locationLegendHeight = 20;

    let legendItemsData = [
      { icon: `<svg viewBox="0 0 12 12"><rect width="11" height="11" x="0.5" y="0.5" fill="#ffffff" stroke="black" stroke-width="0.5"></rect></svg>`, text: 'Interquartile Range (IQR)' },
      { icon: `<svg viewBox="0 0 12 12"><path d="M6 1 V 11 M 3 1 H 9 M 3 11 H 9" stroke="black" stroke-width="1" fill="none"></path></svg>`, text: '1.5 * IQR' },
      { icon: `<svg viewBox="0 0 12 12"><rect x="0" y="0" width="12" height="12" fill="#ffffff" stroke="black" stroke-width="0.5"></rect><line x1="0" y1="6" x2="12" y2="6" stroke="black" stroke-width="1.5"></line></svg>`, text: 'Median' },
      { icon: `<svg viewBox="0 0 12 12"><rect x="0" y="0" width="12" height="12" fill="#ffffff" stroke="black" stroke-width="0.5"></rect><circle cx="6" cy="6" r="2.5" fill="black"></circle></svg>`, text: 'Mean' }
    ];
    if (showWetBulbMean) {
      legendItemsData.push({ icon: `<svg viewBox="0 0 12 12"><path d="M6,1 L11,10 L1,10 Z" fill="black"></path></svg>`, text: 'Wet Bulb Mean' });
    }

    let boxPlotHTML = `<div xmlns="http://www.w3.org/1999/xhtml" style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 0.5rem 1rem; width: 100%; height: 100%; font-family: sans-serif;">`;
    legendItemsData.forEach(item => { boxPlotHTML += `<div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem;"><div style="width: 12px; height: 12px; flex-shrink: 0;">${item.icon}</div><span>${item.text}</span></div>`; });
    boxPlotHTML += `</div>`;

    legendsGroup.append('foreignObject').attr('x', 0).attr('y', height + 35).attr('width', width).attr('height', boxPlotLegendHeight).html(boxPlotHTML);

    let locationHTML = `<div xmlns="http://www.w3.org/1999/xhtml" style="display: flex; justify-content: center; align-items: center; gap: 1.5rem; width: 100%; height: 100%; font-family: sans-serif; font-size: 0.75rem;">`;
    locationHTML += `<div style="display: flex; align-items: center; gap: 0.5rem;"><div style="width: 14px; height: 14px; background-color: ${colorA}; border: 1px solid #555;"></div><span>${legendNameA}</span></div>`;
    locationHTML += `<div style="display: flex; align-items: center; gap: 0.5rem;"><div style="width: 14px; height: 14px; background-color: ${colorB}; border: 1px solid #555;"></div><span>${legendNameB}</span></div>`;
    locationHTML += `</div>`;

    legendsGroup.append('foreignObject').attr('x', 0).attr('y', height + 35 + boxPlotLegendHeight).attr('width', width).attr('height', locationLegendHeight).html(locationHTML);
  };

  const drawBox = (selection, { stats, mean, wetBulbMean, color, wbColor, locationName, monthName }) => {
    const boxWidth = x1.bandwidth();
    selection.append("line").attr("x1", boxWidth / 2).attr("x2", boxWidth / 2).attr("y1", y(stats.upper)).attr("y2", y(stats.q3)).attr("stroke", "black").attr("stroke-width", 0.5);
    selection.append("line").attr("x1", boxWidth / 2).attr("x2", boxWidth / 2).attr("y1", y(stats.q1)).attr("y2", y(stats.lower)).attr("stroke", "black").attr("stroke-width", 0.5);
    selection.append("line").attr("x1", boxWidth * 0.25).attr("x2", boxWidth * 0.75).attr("y1", y(stats.upper)).attr("y2", y(stats.upper)).attr("stroke", "black").attr("stroke-width", 0.5);
    selection.append("line").attr("x1", boxWidth * 0.25).attr("x2", boxWidth * 0.75).attr("y1", y(stats.lower)).attr("y2", y(stats.lower)).attr("stroke", "black").attr("stroke-width", 0.5);
    selection.append("rect").attr("x", 0).attr("y", y(stats.q3)).attr("width", boxWidth).attr("height", d => Math.max(0, y(stats.q1) - y(stats.q3))).attr("fill", color).attr("stroke", "black").attr("stroke-width", 0.5).style('transition', 'fill 0.2s ease-in-out').on("mouseover", function (event) {
      d3.select(this).attr("fill", d3.color(color).darker(0.2));
      tooltip.style("opacity", 1).html(`<strong>${locationName} - ${monthName}</strong><br>Max: ${stats.max.toFixed(1)} °C<br>Median: ${stats.median.toFixed(1)} °C<br>Mean: ${mean.toFixed(1)} °C<br>Min: ${stats.min.toFixed(1)} °C`);
    }).on("mousemove", event => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`)).on("mouseout", function () {
      d3.select(this).attr("fill", color);
      tooltip.style("opacity", 0);
    });
    selection.append("line").attr("x1", 0).attr("x2", boxWidth).attr("y1", y(stats.median)).attr("y2", y(stats.median)).attr("stroke", "black").attr("stroke-width", 1.5);
    selection.append("circle").attr("cx", boxWidth / 2).attr("cy", y(mean)).attr("r", 2.5).attr("fill", "black");
    const triangle = d3.symbol().type(d3.symbolTriangle).size(50);
    selection.append("path").attr("class", "wb-marker").attr("d", triangle).attr("transform", `translate(${boxWidth / 2}, ${y(wetBulbMean)})`).attr("fill", wbColor).style("display", showWetBulbMean ? "block" : "none")
      .on("mouseover", function () {
        d3.select(this).attr("fill", d3.color(wbColor).darker(0.5));
        tooltip.style("opacity", 1).html(`<strong>${locationName} - ${monthName}</strong><br>Wet Bulb Mean: ${wetBulbMean.toFixed(1)} °C`);
      })
      .on("mousemove", event => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
      .on("mouseout", function () {
        d3.select(this).attr("fill", wbColor);
        tooltip.style("opacity", 0);
      })
      .raise();
  };

  const monthGroup = svg.selectAll(".month-group").data(monthLabels).join("g").attr("class", "month-group").attr("transform", (d) => `translate(${x0(d)},0)`);
  monthGroup.each(function (monthLabel, i) {
    const isAnnual = monthLabel === "Annual";
    const dataKey = isAnnual ? "Annual" : (monthLabel ? i + 1 : null);
    if (dataKey === null) return;
    const monthName = isAnnual ? "Annual" : d3.timeFormat("%B")(new Date(2000, i, 1));
    const d_a = dataMapA.get(dataKey);
    const d_b = dataMapB.get(dataKey);
    if (d_a) d3.select(this).append('g').attr('transform', `translate(${x1('A')}, 0)`).call(drawBox, { ...d_a, color: colorA, wbColor: wbColorA, locationName: legendNameA, monthName });
    if (d_b) d3.select(this).append('g').attr('transform', `translate(${x1('B')}, 0)`).call(drawBox, { ...d_b, color: colorB, wbColor: wbColorB, locationName: legendNameB, monthName });
  });

  if (chartRefs) {
    chartRefs.tempDist = {
      toggleWetBulbMean: (isVisible) => {
        showWetBulbMean = isVisible;
        svg.selectAll(".wb-marker").style("display", isVisible ? "block" : "none");
        updateLegends();
      }
    };
  }
  updateLegends();
}

export function renderTempDiurnalComparison(selector, dataA, dataB) {
  const container = d3.select(selector).html('');
  const locNameA = formatSimpleLocation(dataA.metadata.location.city, dataA.metadata.location.country, 'primary');
  const locNameB = formatSimpleLocation(dataB.metadata.location.city, dataB.metadata.location.country, 'comparison');
  const legendNameA = formatCityNameOnly(dataA.metadata.location.city, 'primary');
  const legendNameB = formatCityNameOnly(dataB.metadata.location.city, 'comparison');
  addExportButton(selector, `diurnal-temp-${locNameA}-vs-${locNameB}`, `${locNameA} vs. ${locNameB}`);
  addInfoButton(selector, 'compareTempDiurnal');
  container.append('h5').text('Hourly Averages Comparison: Dry Bulb vs. Dew Point').attr('class', 'chart-title-main');

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  const bodyFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  const processDiurnalData = (hourlyData) => {
    const monthlyGroups = d3.group(hourlyData, d => d.month);
    const result = new Map();
    for (let m = 1; m <= 12; m++) {
      const monthData = monthlyGroups.get(m) || [];
      const hourlyAvg = d3.rollups(monthData,
        v => ({
          dryBulb: d3.mean(v, d => d.dryBulbTemperature),
          dewPoint: d3.mean(v, d => d.dewPointTemperature)
        }),
        d => d.hour
      ).sort((a, b) => a[0] - b[0]);

      result.set(m, {
        values: hourlyAvg,
        meanDryBulb: d3.mean(monthData, d => d.dryBulbTemperature),
        meanDewPoint: d3.mean(monthData, d => d.dewPointTemperature)
      });
    }
    return result;
  };

  const plotDataA = processDiurnalData(dataA.data);
  const plotDataB = processDiurnalData(dataB.data);

  const plotData = [];
  for (let m = 1; m <= 12; m++) {
    plotData.push({
      key: d3.timeFormat("%B")(new Date(2000, m - 1)),
      dataA: plotDataA.get(m),
      dataB: plotDataB.get(m)
    });
  }

  const tempExtent = d3.extent([...dataA.data, ...dataB.data], d => d.dryBulbTemperature);

  const numCols = 4, numRows = 3;
  const legendHeight = 70;
  const chartMargin = { top: 30, right: 20, bottom: 40, left: 45 };
  const chartWidth = 250 - chartMargin.left - chartMargin.right;
  const chartHeight = 200 - chartMargin.top - chartMargin.bottom;
  const totalWidth = numCols * (chartWidth + chartMargin.left + chartMargin.right);
  const totalHeight = numRows * (chartHeight + chartMargin.top + chartMargin.bottom) + legendHeight;

  const svg = container.append('svg').attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`);

  plotData.forEach((d, i) => {
    const col = i % numCols, row = Math.floor(i / numCols);
    const xPos = col * (chartWidth + chartMargin.left + chartMargin.right);
    const yPos = row * (chartHeight + chartMargin.top + chartMargin.bottom);

    const g = svg.append("g").attr("transform", `translate(${xPos + chartMargin.left}, ${yPos + chartMargin.top})`);

    g.append('rect').attr('class', 'chart-background').attr('width', chartWidth).attr('height', chartHeight).attr("fill", "#f8f9fa").style("transition", "fill 0.3s ease-in-out");
    g.append('text').attr('x', chartWidth / 2).attr('y', -10).attr('text-anchor', 'middle').style('font-weight', 'bold').style('font-size', '14px').style("font-family", bodyFont).text(d.key);

    const x = d3.scaleLinear().domain([0, 24]).range([0, chartWidth]);
    const y = d3.scaleLinear().domain(tempExtent).range([chartHeight, 0]).nice();

    g.append("g").attr("transform", `translate(0,${chartHeight})`).call(d3.axisBottom(x).tickValues([0, 6, 12, 18, 24])).style("font-family", bodyFont);
    g.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(t => `${t}°`)).style("font-family", bodyFont);

    g.append("text").attr("class", "axis-title").attr("x", chartWidth / 2).attr("y", chartHeight + 35).style("text-anchor", "middle").text("Hour").style("font-family", bodyFont).style("font-size", "12px");
    g.append("text").attr("class", "axis-title").attr("transform", "rotate(-90)").attr("y", -chartMargin.left + 15).attr("x", -chartHeight / 2).style("text-anchor", "middle").text("°C").style("font-family", bodyFont).style("font-size", "12px");

    const lineADry = d3.line().x(p => x(p[0])).y(p => y(p[1].dryBulb));
    const lineADew = d3.line().x(p => x(p[0])).y(p => y(p[1].dewPoint));
    const lineBDry = d3.line().x(p => x(p[0])).y(p => y(p[1].dryBulb));
    const lineBDew = d3.line().x(p => x(p[0])).y(p => y(p[1].dewPoint));

    const colorA = '#e41a1c', colorB = '#377eb8';

    if (d.dataA && d.dataA.values) {
      g.append("path").datum(d.dataA.values).attr("fill", "none").attr("stroke", colorA).attr("stroke-width", 1.4).attr("d", lineADry);
      g.append("path").datum(d.dataA.values).attr("fill", "none").attr("stroke", colorA).attr("stroke-width", 1.4).attr("stroke-dasharray", "4,4").attr("d", lineADew);
    }
    if (d.dataB && d.dataB.values) {
      g.append("path").datum(d.dataB.values).attr("fill", "none").attr("stroke", colorB).attr("stroke-width", 1.4).attr("d", lineBDry);
      g.append("path").datum(d.dataB.values).attr("fill", "none").attr("stroke", colorB).attr("stroke-width", 1.4).attr("stroke-dasharray", "4,4").attr("d", lineBDew);
    }

    g.append('rect').attr('width', chartWidth).attr('height', chartHeight).attr('fill', 'none').style('pointer-events', 'all')
      .on('mouseover', function () {
        d3.select(this.parentNode).select('.chart-background').attr("fill", "#f7fafc");
        let tooltipHtml = `<strong>${d.key} Averages:</strong>`;
        if (d.dataA && d.dataA.meanDryBulb !== undefined) {
          tooltipHtml += `<br><span style="color:${colorA};">${legendNameA} Dry Bulb: ${d.dataA.meanDryBulb.toFixed(1)} °C</span>`;
          tooltipHtml += `<br><span style="color:${colorA};">${legendNameA} Dew Point: ${d.dataA.meanDewPoint.toFixed(1)} °C</span>`;
        }
        if (d.dataB && d.dataB.meanDryBulb !== undefined) {
          tooltipHtml += `<br><span style="color:${colorB};">${legendNameB} Dry Bulb: ${d.dataB.meanDryBulb.toFixed(1)} °C</span>`;
          tooltipHtml += `<br><span style="color:${colorB};">${legendNameB} Dew Point: ${d.dataB.meanDewPoint.toFixed(1)} °C</span>`;
        }
        tooltip.style("opacity", 1).html(tooltipHtml);
      })
      .on('mousemove', (event) => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
      .on('mouseout', function () {
        d3.select(this.parentNode).select('.chart-background').attr("fill", "#f8f9fa");
        tooltip.style("opacity", 0);
      });
  });

  const legendYPos = totalHeight - legendHeight;
  const colorA = '#e41a1c', colorB = '#377eb8';
  const legendHTML = `
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: ${bodyFont}; font-size: 0.9em; display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; gap: 2rem; flex-wrap: nowrap; white-space: nowrap;">
            <div style="display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
                <svg width="20" height="15"><line x1="0" y1="7.5" x2="20" y2="7.5" style="stroke: ${colorA}; stroke-width: 2;"></line></svg>
                <span>Dry bulb (${legendNameA})</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
                <svg width="20" height="15"><line x1="0" y1="7.5" x2="20" y2="7.5" style="stroke: ${colorA}; stroke-width: 2; stroke-dasharray: 4,4;"></line></svg>
                <span>Dew point (${legendNameA})</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
                <svg width="20" height="15"><line x1="0" y1="7.5" x2="20" y2="7.5" style="stroke: ${colorB}; stroke-width: 2;"></line></svg>
                <span>Dry bulb (${legendNameB})</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
                <svg width="20" height="15"><line x1="0" y1="7.5" x2="20" y2="7.5" style="stroke: ${colorB}; stroke-width: 2; stroke-dasharray: 4,4;"></line></svg>
                <span>Dew point (${legendNameB})</span>
            </div>
        </div>`;

  svg.append('foreignObject').attr('x', 0).attr('y', legendYPos).attr('width', totalWidth).attr('height', legendHeight).html(legendHTML);
}