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

export function renderSkyCoverCompareCharts(epwDataA, epwDataB) {
  const contentArea = d3.select("#compare-content-area").html('');
  contentArea.append('div').attr('id', 'compare-sky-cover-chart').attr('class', 'chart-container');
  renderSkyCoverCompareControls('#compare-pane .left-panel');
  renderCloudCoverComparison('#compare-sky-cover-chart', epwDataA, epwDataB);
}

export function renderSkyCoverCompareControls(panelSelector) {
  const panel = d3.select(panelSelector);
  const cloudCoverControls = panel.append('div').attr('class', 'chart-controls-group');
  cloudCoverControls.append('h6').text('Cloud Cover Options');

  const toggleLabelsCheck = cloudCoverControls.append('div').attr('class', 'form-check form-switch');
  toggleLabelsCheck.html(`<input class="form-check-input" type="checkbox" id="sky-labels-toggle-compare" checked>
                            <label class="form-check-label" for="sky-labels-toggle-compare">Show Percentage Labels</label>`);

  d3.select('#sky-labels-toggle-compare').on('change', function () {
    const event = new CustomEvent('toggleCloudCoverLabels', {
      detail: { isVisible: this.checked }
    });
    const chartContainer = d3.select('#compare-sky-cover-chart').node();
    if (chartContainer) {
      chartContainer.dispatchEvent(event);
    }
  });
}

function renderWrappingLegend(parentGroup, items, { width, renderItem, itemGap = 30, rowGap = 22 }) {
  const measureGroup = parentGroup.append('g').style('visibility', 'hidden');
  const measured = items.map(d => {
    const g = measureGroup.append('g');
    renderItem(g, d);
    return { d, w: g.node().getBBox().width };
  });
  measureGroup.remove();

  const rows = [];
  let current = [], currentWidth = 0;
  measured.forEach(m => {
    const addedWidth = m.w + (current.length ? itemGap : 0);
    if (currentWidth + addedWidth > width && current.length > 0) {
      rows.push(current);
      current = [];
      currentWidth = 0;
    }
    current.push(m);
    currentWidth += m.w + (current.length > 1 ? itemGap : 0);
  });
  if (current.length) rows.push(current);

  rows.forEach((row, rowIndex) => {
    const rowWidth = row.reduce((sum, m) => sum + m.w, 0) + itemGap * (row.length - 1);
    let x = (width - rowWidth) / 2;
    row.forEach(m => {
      parentGroup.append('g')
        .attr('transform', `translate(${x}, ${rowIndex * rowGap})`)
        .call(g => renderItem(g, m.d));
      x += m.w + itemGap;
    });
  });

  return rows.length * rowGap;
}

export function renderCloudCoverComparison(selector, dataA, dataB) {
  const container = d3.select(selector).html('');
  const locNameA = formatSimpleLocation(dataA.metadata.location.city, dataA.metadata.location.country, 'primary');
  const locNameB = formatSimpleLocation(dataB.metadata.location.city, dataB.metadata.location.country, 'comparison');
  const legendNameA = formatCityNameOnly(dataA.metadata.location.city, 'primary');
  const legendNameB = formatCityNameOnly(dataB.metadata.location.city, 'comparison');

  const bodyFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  addExportButton(selector, `cloud-cover-${locNameA}-vs-${locNameB}`, `${locNameA} vs. ${locNameB}`);
  addInfoButton(selector, 'compareCloudCover');
  container.append('h5').text('Monthly Total Cloud Cover Comparison').attr('class', 'chart-title-main');

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  const margin = { top: 20, right: 20, bottom: 120, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const defs = svg.append('defs');
  defs.append('pattern')
    .attr('id', 'diagonal-stripe-pattern-compare')
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 4)
    .attr('height', 4)
    .append('path')
    .attr('d', 'M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2')
    .attr('stroke', '#000000')
    .attr('stroke-width', 0.4)
    .attr('opacity', 0.6);

  const processCloudData = (data, key) => {
    const totalHours = data.length;
    if (totalHours === 0) return { month: key, skyClear: 0, few: 0, scattered: 0, broken: 0, overcast: 0 };
    const skyClear = data.filter(d => d.totalSkyCover === 0).length;
    const few = data.filter(d => d.totalSkyCover > 0 && d.totalSkyCover <= 2.5).length;
    const scattered = data.filter(d => d.totalSkyCover > 2.5 && d.totalSkyCover <= 5).length;
    const broken = data.filter(d => d.totalSkyCover > 5 && d.totalSkyCover < 10).length;
    const overcast = data.filter(d => d.totalSkyCover === 10).length;
    return {
      month: key,
      skyClear: (skyClear / totalHours) * 100,
      few: (few / totalHours) * 100,
      scattered: (scattered / totalHours) * 100,
      broken: (broken / totalHours) * 100,
      overcast: (overcast / totalHours) * 100
    };
  };

  const createPlotData = (hourlyData) => {
    const monthlyData = d3.groups(hourlyData, d => d.month).map(([month, dataList]) => {
      return processCloudData(dataList, d3.timeFormat("%b")(new Date(2000, month - 1)));
    }).sort((a, b) => new Date(`1 ${a.month} 2000`) - new Date(`1 ${b.month} 2000`));
    const annualData = processCloudData(hourlyData, "Annual");
    return [...monthlyData, annualData];
  };

  const plotDataA = createPlotData(dataA.data);
  const plotDataB = createPlotData(dataB.data);

  const monthLabels = [...plotDataA.map(d => d.month).slice(0, 12), "", "Annual"];
  const keys = ['skyClear', 'few', 'scattered', 'broken', 'overcast'];
  const color = d3.scaleOrdinal().domain(keys).range(['#6495ED', '#87CEEB', '#A9A9A9', '#778899', '#696969']);

  const x0 = d3.scaleBand().domain(monthLabels).range([0, width]).paddingInner(0.2);
  const x1 = d3.scaleBand().domain(['A', 'B']).range([0, x0.bandwidth()]).padding(0.1);
  const y = d3.scaleLinear().domain([0, 100]).range([height, 0]);

  const stack = d3.stack().keys(keys);
  const seriesA = stack(plotDataA);
  const seriesB = stack(plotDataB);

  const xAxis = svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x0));
  xAxis.selectAll(".tick").filter(d => d === "").remove();
  svg.append("g").call(d3.axisLeft(y).tickFormat(d => `${d}%`));
  svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 20).attr("x", -height / 2).text("%").style("font-family", bodyFont).style("font-size", 11);

  const handleMouseOver = function (event, d) {
    const initialFill = d3.select(this).style('fill');
    d3.select(this).style('fill', d3.color(initialFill).darker(0.2));
    tooltip.style("opacity", 1)
      .html(`<strong>${d.locationName} - ${d.data.month}</strong><br>
                   Condition: ${d.key.replace(/([A-Z])/g, ' $1').trim()}<br>
                   Hours: ${Math.round(d[1] - d[0])}%`);
  };

  const handleMouseOut = function () {
    d3.select(this).style('fill', null);
    tooltip.style("opacity", 0);
  };

  const conditionGroups = svg.append("g")
    .selectAll("g")
    .data(seriesA)
    .join("g")
    .attr("fill", d => color(d.key));

  conditionGroups.selectAll("rect.bar-a")
    .data(d => d.map(p => ({ ...p, key: d.key, locationName: legendNameA })))
    .join("rect")
    .attr("class", "bar-a")
    .attr("x", d => x0(d.data.month) + x1('A'))
    .attr("y", d => y(d[1]))
    .attr("width", x1.bandwidth())
    .attr("height", d => y(d[0]) - y(d[1]))
    .style("transition", "fill 0.3s ease-in-out")
    .on('mouseover', handleMouseOver)
    .on("mousemove", event => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
    .on('mouseout', handleMouseOut);

  conditionGroups.selectAll("rect.bar-b")
    .data((d, i) => seriesB[i].map(p => ({ ...p, key: d.key, locationName: legendNameB })))
    .join("rect")
    .attr("class", "bar-b")
    .attr("x", d => x0(d.data.month) + x1('B'))
    .attr("y", d => y(d[1]))
    .attr("width", x1.bandwidth())
    .attr("height", d => y(d[0]) - y(d[1]))
    .style("transition", "fill 0.3s ease-in-out")
    .on('mouseover', handleMouseOver)
    .on("mousemove", event => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
    .on('mouseout', handleMouseOut);

  conditionGroups.selectAll("rect.bar-b-pattern")
    .data((d, i) => seriesB[i])
    .join("rect")
    .attr("class", "bar-b-pattern")
    .attr("x", d => x0(d.data.month) + x1('B'))
    .attr("y", d => y(d[1]))
    .attr("width", x1.bandwidth())
    .attr("height", d => y(d[0]) - y(d[1]))
    .attr("fill", "url(#diagonal-stripe-pattern-compare)")
    .style("pointer-events", "none");

  const labelsGroup = svg.append('g').attr('class', 'bar-labels-group');
  const drawLabels = (series, band) => {
    labelsGroup.append("g").selectAll("g").data(series).join("g")
      .selectAll(".bar-label").data(d => d).join("text")
      .attr("class", "bar-label")
      .attr("x", d => x0(d.data.month) + x1(band) + x1.bandwidth() / 2)
      .attr("y", d => y(d[1]) + (y(d[0]) - y(d[1])) / 2 + 4)
      .attr("text-anchor", "middle").style("font-size", "8px").style("fill", "white").style("font-weight", "300").style("font-family", bodyFont)
      .text(d => (d[1] - d[0]) > 7 ? `${Math.round(d[1] - d[0])}%` : "");
  };

  drawLabels(seriesA, 'A');
  drawLabels(seriesB, 'B');

  const legendContainer = svg.append("g").attr("transform", `translate(0, ${height + 40})`);
  const conditionLegendData = [
    { text: 'Sky Clear (0 tenths)', color: color('skyClear') },
    { text: 'Few (1-2 tenths, ~10-20%)', color: color('few') },
    { text: 'Scattered (3-5 tenths, ~30-50%)', color: color('scattered') },
    { text: 'Broken (6-9 tenths, ~60-90%)', color: color('broken') },
    { text: 'Overcast (10 tenths, 100%)', color: color('overcast') }
  ];

  const conditionLegend = legendContainer.append("g");
  const conditionLegendHeight = renderWrappingLegend(conditionLegend, conditionLegendData, {
    width,
    itemGap: 30,
    rowGap: 22,
    renderItem: (g, d) => {
      g.append("rect").attr("width", 18).attr("height", 18).attr("fill", d.color);
      g.append("text").attr("x", 22).attr("y", 14).style("font-size", "11px").style("font-family", bodyFont).text(d.text);
    }
  });

  const locationLegendData = [
    { name: legendNameA, pattern: false },
    { name: legendNameB, pattern: true }
  ];

  const locationLegend = legendContainer.append("g").attr("transform", `translate(0, ${conditionLegendHeight + 18})`);
  const locationLegendItem = locationLegend.selectAll("g")
    .data(locationLegendData)
    .join("g");

  locationLegendItem.each(function (d) {
    const g = d3.select(this);
    if (d.pattern) {
      g.append("rect")
        .attr("width", 14)
        .attr("height", 14)
        .attr("fill", "#f0f0f0")
        .attr("stroke", "#555")
        .attr("stroke-width", 1);
      g.append("rect")
        .attr("width", 14)
        .attr("height", 14)
        .attr("fill", "url(#diagonal-stripe-pattern-compare)");
    } else {
      g.append("rect")
        .attr("width", 14)
        .attr("height", 14)
        .attr("fill", "#f0f0f0")
        .attr("stroke", "#555")
        .attr("stroke-width", 1);
    }
    g.append("text")
      .attr("x", 18)
      .attr("y", 10)
      .style("font-family", bodyFont)
      .style("font-size", "11px")
      .text(d.name);
  });

  let cumulativeWidth = 0;
  const itemWidths = [];
  locationLegendItem.each(function () {
    const bbox = this.getBBox();
    itemWidths.push(bbox.width);
    cumulativeWidth += bbox.width;
  });

  const totalWidth = cumulativeWidth + (itemWidths.length - 1) * 30;
  let currentX = (width - totalWidth) / 2;

  locationLegendItem.attr("transform", (d, i) => {
    const xPos = currentX;
    currentX += itemWidths[i] + 30;
    return `translate(${xPos}, 0)`;
  });

  const containerNode = d3.select(selector).node();
  if (containerNode) {
    containerNode.addEventListener('toggleCloudCoverLabels', (e) => {
      svg.select('.bar-labels-group').style('display', e.detail.isVisible ? 'block' : 'none');
    });
  }
}