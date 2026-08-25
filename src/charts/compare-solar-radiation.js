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
import { getMissingSources, renderCompareUnavailableNotice } from '../core/data-quality-notice.js';

const RADIATION_FIELDS = ['globalHorizontalRadiation', 'directNormalRadiation', 'diffuseHorizontalRadiation'];
const ILLUMINANCE_FIELDS = ['globalHorizontalIlluminance', 'directNormalIlluminance', 'diffuseHorizontalIlluminance', 'zenithLuminance'];

export function renderSolarRadiationCompareCharts(epwDataA, epwDataB) {
  const chartRefs = {};
  const contentArea = d3.select("#compare-content-area").html('');
  contentArea.append('div').attr('id', 'compare-solar-rad-chart').attr('class', 'chart-container mb-5');
  contentArea.append('div').attr('id', 'compare-sun-hours-chart').attr('class', 'chart-container mb-5');
  contentArea.append('div').attr('id', 'compare-illuminance-chart').attr('class', 'chart-container');

  renderSolarRadiationCompareControls('#compare-pane .left-panel', chartRefs);

  const radMissing = getMissingSources(epwDataA, epwDataB, RADIATION_FIELDS);
  if (radMissing.length) {
    renderCompareUnavailableNotice('#compare-solar-rad-chart', 'Solar Radiation', radMissing);
    d3.select('#compare-sun-hours-chart').remove();
  } else {
    renderSolarRadiationComparison('#compare-solar-rad-chart', epwDataA, epwDataB, chartRefs);
    renderSunHoursComparison('#compare-sun-hours-chart', epwDataA, epwDataB);
  }

  const illMissing = getMissingSources(epwDataA, epwDataB, ILLUMINANCE_FIELDS);
  if (illMissing.length) {
    renderCompareUnavailableNotice('#compare-illuminance-chart', 'Daylight Illuminance', illMissing);
  } else {
    renderIlluminanceComparison('#compare-illuminance-chart', epwDataA, epwDataB, chartRefs);
  }
}

export function renderSolarRadiationCompareControls(panelSelector, chartRefs) {
  const panel = d3.select(panelSelector);

  const solarRadControls = panel.append('div').attr('class', 'chart-controls-group');
  solarRadControls.append('h6').text('Avg. Monthly Radiation');
  const radiationTypes = ['Global Horizontal Irradiance (GHI)', 'Direct Normal Irradiance (DNI)', 'Diffuse horizontal irradiance (DHI)'];
  const radiationCheckboxes = solarRadControls.append('div').attr('class', 'control-item').attr('id', 'compare-radiation-type-checkboxes');

  radiationTypes.forEach(type => {
    const checkboxGroup = radiationCheckboxes.append('div').attr('class', 'form-check form-check-sm');
    const safeId = type.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
    checkboxGroup.append('input')
      .attr('class', 'form-check-input')
      .attr('type', 'checkbox')
      .attr('value', type)
      .attr('id', `compare-rad-${safeId}`)
      .property('checked', true)
      .on('change', function () {
        if (chartRefs.solarRad && typeof chartRefs.solarRad.update === 'function') {
          chartRefs.solarRad.update();
        }
      });
    checkboxGroup.append('label')
      .attr('class', 'form-check-label')
      .attr('for', `compare-rad-${safeId}`)
      .text(type);
  });

  const illuminanceControls = panel.append('div').attr('class', 'chart-controls-group mt-4');
  illuminanceControls.append('h6').text('Avg. Monthly Illuminance');
  const illuminanceTypes = ['Global Horizontal Illuminance', 'Direct Normal Illuminance', 'Diffuse Horizontal Illuminance'];
  const illuminanceCheckboxes = illuminanceControls.append('div').attr('class', 'control-item').attr('id', 'compare-illuminance-type-checkboxes');

  illuminanceTypes.forEach(type => {
    const checkboxGroup = illuminanceCheckboxes.append('div').attr('class', 'form-check form-check-sm');
    const safeId = type.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
    checkboxGroup.append('input')
      .attr('class', 'form-check-input')
      .attr('type', 'checkbox')
      .attr('value', type)
      .attr('id', `compare-ill-${safeId}`)
      .property('checked', true)
      .on('change', function () {
        if (chartRefs.illuminance && typeof chartRefs.illuminance.update === 'function') {
          chartRefs.illuminance.update();
        }
      });
    checkboxGroup.append('label')
      .attr('class', 'form-check-label')
      .attr('for', `compare-ill-${safeId}`)
      .text(type);
  });
}

export function renderSolarRadiationComparison(selector, dataA, dataB, chartRefs) {
  const container = d3.select(selector).html('');
  const locNameA = formatSimpleLocation(dataA.metadata.location.city, dataA.metadata.location.country, 'primary');
  const locNameB = formatSimpleLocation(dataB.metadata.location.city, dataB.metadata.location.country, 'comparison');
  const legendNameA = formatCityNameOnly(dataA.metadata.location.city, 'primary');
  const legendNameB = formatCityNameOnly(dataB.metadata.location.city, 'comparison');

  const bodyFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  addExportButton(selector, `solar-rad-${locNameA}-vs-${locNameB}`, `${locNameA} vs. ${locNameB}`);
  addInfoButton(selector, 'compareSolarRadiation');
  container.append('h5').text('Average Monthly Solar Radiation Comparison').attr('class', 'chart-title-main');

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  const margin = { top: 20, right: 20, bottom: 120, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const svgContainer = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);

  const defs = svgContainer.append('defs');
  defs.append('pattern')
    .attr('id', 'diagonal-stripe-pattern-solar-local')
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 4)
    .attr('height', 4)
    .append('path')
    .attr('d', 'M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2')
    .attr('stroke', '#666666')
    .attr('stroke-width', 0.5);

  const svg = svgContainer.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const processRadData = (data) => d3.groups(data, d => d.month).map(([month, values]) => ({
    month: d3.timeFormat("%b")(new Date(2000, month - 1)),
    'Global Horizontal Irradiance (GHI)': d3.mean(values, v => v.globalHorizontalRadiation),
    'Direct Normal Irradiance (DNI)': d3.mean(values, v => v.directNormalRadiation),
    'Diffuse horizontal irradiance (DHI)': d3.mean(values, v => v.diffuseHorizontalRadiation)
  })).sort((a, b) => new Date(`1 ${a.month} 2000`) - new Date(`1 ${b.month} 2000`));

  const monthlyA = processRadData(dataA.data);
  const monthlyB = processRadData(dataB.data);

  const annualA = {
    month: 'Annual',
    'Global Horizontal Irradiance (GHI)': d3.mean(dataA.data, d => d.globalHorizontalRadiation),
    'Direct Normal Irradiance (DNI)': d3.mean(dataA.data, d => d.directNormalRadiation),
    'Diffuse horizontal irradiance (DHI)': d3.mean(dataA.data, d => d.diffuseHorizontalRadiation)
  };
  const annualB = {
    month: 'Annual',
    'Global Horizontal Irradiance (GHI)': d3.mean(dataB.data, d => d.globalHorizontalRadiation),
    'Direct Normal Irradiance (DNI)': d3.mean(dataB.data, d => d.directNormalRadiation),
    'Diffuse horizontal irradiance (DHI)': d3.mean(dataB.data, d => d.diffuseHorizontalRadiation)
  };

  const plotDataA = [...monthlyA, annualA];
  const plotDataB = [...monthlyB, annualB];

  const allTypes = ['Global Horizontal Irradiance (GHI)', 'Direct Normal Irradiance (DNI)', 'Diffuse horizontal irradiance (DHI)'];
  const monthLabels = [...monthlyA.map(d => d.month), "", "Annual"];

  const x0 = d3.scaleBand().domain(monthLabels).range([0, width]).padding(0.2);
  const x1 = d3.scaleBand().domain(['A', 'B']).range([0, x0.bandwidth()]).padding(0.1);
  const x2 = d3.scaleBand().padding(0.05);
  const y = d3.scaleLinear().range([height, 0]);
  const color = d3.scaleOrdinal().domain(allTypes).range(['#e66101', '#fdb863', '#b2abd2']);

  svg.append("rect").attr("class", "chart-background").attr("x", 0).attr("y", 0).attr("width", width).attr("height", height).attr("fill", "#f8f9fa").style("transition", "fill 0.3s ease-in-out")
    .on("mouseover", function () { d3.select(this).attr("fill", "#f7fafc"); })
    .on("mouseout", function () { d3.select(this).attr("fill", "#f8f9fa"); });

  svg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0, ${height})`);
  svg.append("g").attr("class", "grid-line");
  svg.append("g").attr("class", "axis y-axis");
  svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 20).attr("x", -height / 2).text("Wh/m²").style("font-family", "sans-serif").style("font-size", "12px");

  const update = () => {
    const visibleTypes = Array.from(d3.selectAll('#compare-radiation-type-checkboxes input[type="checkbox"]:checked').nodes(), cb => cb.value);
    if (visibleTypes.length === 0) return;

    const maxValA = d3.max(plotDataA, d => d3.max(visibleTypes, type => d[type]));
    const maxValB = d3.max(plotDataB, d => d3.max(visibleTypes, type => d[type]));
    y.domain([0, Math.max(maxValA, maxValB) || 10]).nice();
    x2.domain(visibleTypes).range([0, x1.bandwidth()]);

    const yTicks = y.ticks().slice(1);
    svg.select(".grid-line").call(d3.axisLeft(y).tickValues(yTicks).tickSize(-width).tickFormat("")).selectAll("line").attr("stroke", "#e0e0e0").attr("stroke-dasharray", "3,3");
    svg.select(".grid-line .domain").remove();
    svg.select(".x-axis").call(d3.axisBottom(x0).tickValues(x0.domain().filter(d => d !== "")));
    svg.select(".y-axis").transition().duration(300).call(d3.axisLeft(y));

    const monthGroup = svg.selectAll(".month-group").data(monthLabels).join("g").attr("class", "month-group").attr("transform", d => `translate(${x0(d)}, 0)`);
    const dataMapA = new Map(plotDataA.map(d => [d.month, d]));
    const dataMapB = new Map(plotDataB.map(d => [d.month, d]));

    const barsA = monthGroup.selectAll("rect.bar-a").data(month => visibleTypes.map(type => ({ month, type, value: dataMapA.get(month)?.[type] || 0 }))).join("rect").attr("class", "bar-a").attr("transform", `translate(${x1('A')}, 0)`).attr("fill", d => color(d.type));
    barsA.transition().duration(500).attr("x", d => x2(d.type)).attr("y", d => y(d.value)).attr("width", x2.bandwidth()).attr("height", d => height - y(d.value));

    const barsB = monthGroup.selectAll("rect.bar-b").data(month => visibleTypes.map(type => ({ month, type, value: dataMapB.get(month)?.[type] || 0 }))).join("rect").attr("class", "bar-b").attr("transform", `translate(${x1('B')}, 0)`).attr("fill", d => color(d.type));
    barsB.transition().duration(500).attr("x", d => x2(d.type)).attr("y", d => y(d.value)).attr("width", x2.bandwidth()).attr("height", d => height - y(d.value));

    const patternsB = monthGroup.selectAll("rect.pattern-b").data(month => visibleTypes.map(type => ({ month, type, value: dataMapB.get(month)?.[type] || 0 }))).join("rect").attr("class", "pattern-b").attr("transform", `translate(${x1('B')}, 0)`).attr("fill", "url(#diagonal-stripe-pattern-solar-local)").style("pointer-events", "none");
    patternsB.transition().duration(500).attr("x", d => x2(d.type)).attr("y", d => y(d.value)).attr("width", x2.bandwidth()).attr("height", d => height - y(d.value));

    svg.selectAll(".bar-a, .bar-b").on("mouseover", function (event, d) {
      const isA = d3.select(this).classed('bar-a');
      const locName = isA ? legendNameA : legendNameB;
      d3.select(this).attr('fill', d3.color(color(d.type)).darker(0.4));
      tooltip.style("opacity", 1).html(`<strong>${locName} - ${d.month}</strong><br>${d.type.split('(')[0].trim()}: ${d.value.toFixed(1)} Wh/m²`);
    }).on("mousemove", event => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`)).on("mouseout", function (event, d) {
      d3.select(this).attr('fill', color(d.type));
      tooltip.style("opacity", 0);
    });

    svg.select(".legends-container").remove();
    const legendContainer = svg.append("g").attr("class", "legends-container").attr("transform", `translate(0, ${height + 40})`);
    const typeLegendHTML = `<div xmlns="http://www.w3.org/1999/xhtml" style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 1rem; width: 100%; font-family: ${bodyFont};">${allTypes.map(type => `<div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem;"><div style="width: 12px; height: 12px; background-color: ${color(type)};"></div><span>${type.split('(')[0].trim()}</span></div>`).join('')}</div>`;
    legendContainer.append('foreignObject').attr('x', 0).attr('y', 0).attr('width', width).attr('height', 30).html(typeLegendHTML);

    const locationLegendData = [
      { name: legendNameA, pattern: false },
      { name: legendNameB, pattern: true }
    ];

    const locationLegend = legendContainer.append("g").attr("transform", `translate(0, 40)`);
    const locationLegendItem = locationLegend.selectAll("g")
      .data(locationLegendData)
      .join("g");

    locationLegendItem.each(function (d) {
      const gNode = d3.select(this);
      if (d.pattern) {
        gNode.append("rect")
          .attr("width", 12)
          .attr("height", 12)
          .attr("fill", "#f0f0f0")
          .attr("stroke", "#555")
          .attr("stroke-width", 1);
        gNode.append("rect")
          .attr("width", 12)
          .attr("height", 12)
          .attr("fill", "url(#diagonal-stripe-pattern-solar-local)");
      } else {
        gNode.append("rect")
          .attr("width", 12)
          .attr("height", 12)
          .attr("fill", "#f0f0f0")
          .attr("stroke", "#555")
          .attr("stroke-width", 1);
      }
      gNode.append("text")
        .attr("x", 16)
        .attr("y", 9)
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
      const xPosVal = currentX;
      currentX += itemWidths[i] + 30;
      return `translate(${xPosVal}, 0)`;
    });
  };

  if (chartRefs) { chartRefs.solarRad = { update }; }
  update();
}

export function renderSunHoursComparison(selector, dataA, dataB) {
  const container = d3.select(selector).html('');
  const locNameA = formatSimpleLocation(dataA.metadata.location.city, dataA.metadata.location.country, 'primary');
  const locNameB = formatSimpleLocation(dataB.metadata.location.city, dataB.metadata.location.country, 'comparison');
  const legendNameA = formatCityNameOnly(dataA.metadata.location.city, 'primary');
  const legendNameB = formatCityNameOnly(dataB.metadata.location.city, 'comparison');

  const bodyFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  addExportButton(selector, `sun-hours-${locNameA}-vs-${locNameB}`, `${locNameA} vs. ${locNameB}`);
  addInfoButton(selector, 'compareSolarRadiation');
  container.append('h5').text('Average Daily Sun Hours Comparison').attr('class', 'chart-title-main');

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

  const processSunHours = (hourlyData) => {
    const monthlyData = d3.groups(hourlyData, d => d.month).map(([month, dataList]) => {
      const daysInMonth = new Set(dataList.map(d => d.day)).size;
      const totalSunHours = dataList.filter(d => d.directNormalRadiation > 120).length;
      return {
        month: d3.timeFormat("%b")(new Date(2000, month - 1)),
        avgDaily: totalSunHours / daysInMonth,
        totalMonthly: totalSunHours
      };
    }).sort((a, b) => new Date('1 ' + a.month + ' 2000') - new Date('1 ' + b.month + ' 2000'));

    const totalDays = new Set(hourlyData.map(d => `${d.day}-${d.month}`)).size;
    const annualData = {
      month: 'Annual',
      avgDaily: hourlyData.filter(d => d.directNormalRadiation > 120).length / totalDays,
      totalMonthly: hourlyData.filter(d => d.directNormalRadiation > 120).length
    };
    return [...monthlyData, annualData];
  };

  const plotDataA = processSunHours(dataA.data);
  const plotDataB = processSunHours(dataB.data);
  const dataMapA = new Map(plotDataA.map(d => [d.month, d]));
  const dataMapB = new Map(plotDataB.map(d => [d.month, d]));

  const monthLabels = [...plotDataA.map(d => d.month).slice(0, 12), "", "Annual"];
  const colorA = '#fdae6b', colorB = '#93ccea';

  const x0 = d3.scaleBand().domain(monthLabels).rangeRound([0, width]).paddingInner(0.4);
  const x1 = d3.scaleBand().domain(['A', 'B']).rangeRound([0, x0.bandwidth()]).padding(0.1);

  const maxAvg = d3.max([d3.max(plotDataA, d => d.avgDaily), d3.max(plotDataB, d => d.avgDaily)]);
  const y = d3.scaleLinear().domain([0, maxAvg * 1.1 || 10]).nice().range([height, 0]);

  svg.append("g").attr("class", "grid-line").call(d3.axisLeft(y).tickSize(-width).tickFormat("")).selectAll("line").attr("stroke", "#b0b0b0").attr("stroke-opacity", 0.6).attr("stroke-dasharray", "3,3");
  svg.select(".grid-line .domain").remove();

  const xAxis = svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x0));
  xAxis.selectAll(".tick").filter(d => d === "").remove();
  svg.append("g").call(d3.axisLeft(y));
  svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 30).attr("x", -height / 2).text("Hours").style("text-anchor", "middle").style("font-family", "sans-serif").style("font-size", "12px");

  const monthGroup = svg.selectAll(".month-group").data(monthLabels).join("g").attr("class", "month-group").attr("transform", d => `translate(${x0(d)},0)`);

  monthGroup.selectAll("rect.bar-a").data(d => d ? [dataMapA.get(d)] : []).join("rect").attr("class", "bar-a").attr("x", x1('A')).attr("y", d => y(d.avgDaily)).attr("width", x1.bandwidth()).attr("height", d => height - y(d.avgDaily)).attr("fill", colorA).style("transition", "fill 0.2s ease-in-out")
    .on("mouseover", function (event, d) {
      d3.select(this).attr("fill", d3.color(colorA).darker(0.3));
      tooltip.style("opacity", 1).html(`<strong>${legendNameA} - ${d.month}</strong><br>Avg Daily: ${d.avgDaily.toFixed(1)} hrs<br>Total Monthly: ${d.totalMonthly.toFixed(0)} hrs`);
    })
    .on("mousemove", event => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
    .on("mouseout", function () {
      d3.select(this).attr("fill", colorA);
      tooltip.style("opacity", 0);
    });

  monthGroup.selectAll("rect.bar-b").data(d => d ? [dataMapB.get(d)] : []).join("rect").attr("class", "bar-b").attr("x", x1('B')).attr("y", d => y(d.avgDaily)).attr("width", x1.bandwidth()).attr("height", d => height - y(d.avgDaily)).attr("fill", colorB).style("transition", "fill 0.2s ease-in-out")
    .on("mouseover", function (event, d) {
      d3.select(this).attr("fill", d3.color(colorB).darker(0.3));
      tooltip.style("opacity", 1).html(`<strong>${legendNameB} - ${d.month}</strong><br>Avg Daily: ${d.avgDaily.toFixed(1)} hrs<br>Total Monthly: ${d.totalMonthly.toFixed(0)} hrs`);
    })
    .on("mousemove", event => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
    .on("mouseout", function () {
      d3.select(this).attr("fill", colorB);
      tooltip.style("opacity", 0);
    });

  let locationHTML = `<div xmlns="http://www.w3.org/1999/xhtml" style="display: flex; justify-content: center; align-items: center; gap: 1.5rem; width: 100%; height: 100%; font-family: ${bodyFont}; font-size: 0.8rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;"><div style="width: 14px; height: 14px; background-color: ${colorA}; border: 1px solid #555;"></div><span>${legendNameA}</span></div>
        <div style="display: flex; align-items: center; gap: 0.5rem;"><div style="width: 14px; height: 14px; background-color: ${colorB}; border: 1px solid #555;"></div><span>${legendNameB}</span></div>
    </div>`;

  svg.append('foreignObject').attr('x', 0).attr('y', height + 40).attr('width', width).attr('height', 30).html(locationHTML);
}

export function renderIlluminanceComparison(selector, dataA, dataB, chartRefs) {
  const container = d3.select(selector).html('');
  const locNameA = formatSimpleLocation(dataA.metadata.location.city, dataA.metadata.location.country, 'primary');
  const locNameB = formatSimpleLocation(dataB.metadata.location.city, dataB.metadata.location.country, 'comparison');
  const legendNameA = formatCityNameOnly(dataA.metadata.location.city, 'primary');
  const legendNameB = formatCityNameOnly(dataB.metadata.location.city, 'comparison');

  const bodyFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  addExportButton(selector, `illuminance-${locNameA}-vs-${locNameB}`, `${locNameA} vs. ${locNameB}`);
  addInfoButton(selector, 'compareIlluminance');
  container.append('h5').text('Average Monthly Illuminance Comparison').attr('class', 'chart-title-main');

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  const margin = { top: 20, right: 20, bottom: 120, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const svgContainer = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);

  const defs = svgContainer.append('defs');
  defs.append('pattern')
    .attr('id', 'diagonal-stripe-pattern-illuminance-local')
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 4)
    .attr('height', 4)
    .append('path')
    .attr('d', 'M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2')
    .attr('stroke', '#666666')
    .attr('stroke-width', 0.5);

  const svg = svgContainer.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const processIllData = (data) => d3.groups(data, d => d.month).map(([month, values]) => ({
    month: d3.timeFormat("%b")(new Date(2000, month - 1)),
    'Global Horizontal Illuminance': d3.mean(values, v => v.globalHorizontalIlluminance),
    'Direct Normal Illuminance': d3.mean(values, v => v.directNormalIlluminance),
    'Diffuse Horizontal Illuminance': d3.mean(values, v => v.diffuseHorizontalIlluminance)
  })).sort((a, b) => new Date(`1 ${a.month} 2000`) - new Date(`1 ${b.month} 2000`));

  const monthlyA = processIllData(dataA.data);
  const monthlyB = processIllData(dataB.data);

  const annualA = {
    month: 'Annual',
    'Global Horizontal Illuminance': d3.mean(dataA.data, d => d.globalHorizontalIlluminance),
    'Direct Normal Illuminance': d3.mean(dataA.data, d => d.directNormalIlluminance),
    'Diffuse Horizontal Illuminance': d3.mean(dataA.data, d => d.diffuseHorizontalIlluminance)
  };
  const annualB = {
    month: 'Annual',
    'Global Horizontal Illuminance': d3.mean(dataB.data, d => d.globalHorizontalIlluminance),
    'Direct Normal Illuminance': d3.mean(dataB.data, d => d.directNormalIlluminance),
    'Diffuse Horizontal Illuminance': d3.mean(dataB.data, d => d.diffuseHorizontalIlluminance)
  };

  const plotDataA = [...monthlyA, annualA];
  const plotDataB = [...monthlyB, annualB];

  const allTypes = ['Global Horizontal Illuminance', 'Direct Normal Illuminance', 'Diffuse Horizontal Illuminance'];
  const monthLabels = [...monthlyA.map(d => d.month), "", "Annual"];

  const x0 = d3.scaleBand().domain(monthLabels).range([0, width]).padding(0.2);
  const x1 = d3.scaleBand().domain(['A', 'B']).range([0, x0.bandwidth()]).padding(0.1);
  const x2 = d3.scaleBand().padding(0.05);
  const y = d3.scaleLinear().range([height, 0]);
  const color = d3.scaleOrdinal().domain(allTypes).range(['#f0a202', '#f7d060', '#8ecae6']);

  svg.append("rect").attr("class", "chart-background").attr("x", 0).attr("y", 0).attr("width", width).attr("height", height).attr("fill", "#f8f9fa").style("transition", "fill 0.3s ease-in-out")
    .on("mouseover", function () { d3.select(this).attr("fill", "#f7fafc"); })
    .on("mouseout", function () { d3.select(this).attr("fill", "#f8f9fa"); });

  svg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0, ${height})`);
  svg.append("g").attr("class", "grid-line");
  svg.append("g").attr("class", "axis y-axis");
  svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 20).attr("x", -height / 2).text("lux").style("font-family", "sans-serif").style("font-size", "12px");

  const update = () => {
    const visibleTypes = Array.from(d3.selectAll('#compare-illuminance-type-checkboxes input[type="checkbox"]:checked').nodes(), cb => cb.value);
    if (visibleTypes.length === 0) return;

    const maxValA = d3.max(plotDataA, d => d3.max(visibleTypes, type => d[type]));
    const maxValB = d3.max(plotDataB, d => d3.max(visibleTypes, type => d[type]));
    y.domain([0, Math.max(maxValA, maxValB) || 10]).nice();
    x2.domain(visibleTypes).range([0, x1.bandwidth()]);

    const yTicks = y.ticks().slice(1);
    svg.select(".grid-line").call(d3.axisLeft(y).tickValues(yTicks).tickSize(-width).tickFormat("")).selectAll("line").attr("stroke", "#e0e0e0").attr("stroke-dasharray", "3,3");
    svg.select(".grid-line .domain").remove();
    svg.select(".x-axis").call(d3.axisBottom(x0).tickValues(x0.domain().filter(d => d !== "")));
    svg.select(".y-axis").transition().duration(300).call(d3.axisLeft(y).tickFormat(d => d3.format(".2s")(d)));

    const monthGroup = svg.selectAll(".month-group").data(monthLabels).join("g").attr("class", "month-group").attr("transform", d => `translate(${x0(d)}, 0)`);
    const dataMapA = new Map(plotDataA.map(d => [d.month, d]));
    const dataMapB = new Map(plotDataB.map(d => [d.month, d]));

    const barsA = monthGroup.selectAll("rect.bar-a").data(month => visibleTypes.map(type => ({ month, type, value: dataMapA.get(month)?.[type] || 0 }))).join("rect").attr("class", "bar-a").attr("transform", `translate(${x1('A')}, 0)`).attr("fill", d => color(d.type));
    barsA.transition().duration(500).attr("x", d => x2(d.type)).attr("y", d => y(d.value)).attr("width", x2.bandwidth()).attr("height", d => height - y(d.value));

    const barsB = monthGroup.selectAll("rect.bar-b").data(month => visibleTypes.map(type => ({ month, type, value: dataMapB.get(month)?.[type] || 0 }))).join("rect").attr("class", "bar-b").attr("transform", `translate(${x1('B')}, 0)`).attr("fill", d => color(d.type));
    barsB.transition().duration(500).attr("x", d => x2(d.type)).attr("y", d => y(d.value)).attr("width", x2.bandwidth()).attr("height", d => height - y(d.value));

    const patternsB = monthGroup.selectAll("rect.pattern-b").data(month => visibleTypes.map(type => ({ month, type, value: dataMapB.get(month)?.[type] || 0 }))).join("rect").attr("class", "pattern-b").attr("transform", `translate(${x1('B')}, 0)`).attr("fill", "url(#diagonal-stripe-pattern-illuminance-local)").style("pointer-events", "none");
    patternsB.transition().duration(500).attr("x", d => x2(d.type)).attr("y", d => y(d.value)).attr("width", x2.bandwidth()).attr("height", d => height - y(d.value));

    svg.selectAll(".bar-a, .bar-b").on("mouseover", function (event, d) {
      const isA = d3.select(this).classed('bar-a');
      const locName = isA ? legendNameA : legendNameB;
      d3.select(this).attr('fill', d3.color(color(d.type)).darker(0.4));
      tooltip.style("opacity", 1).html(`<strong>${locName} - ${d.month}</strong><br>${d.type}: ${d.value.toFixed(0)} lux`);
    }).on("mousemove", event => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`)).on("mouseout", function (event, d) {
      d3.select(this).attr('fill', color(d.type));
      tooltip.style("opacity", 0);
    });

    svg.select(".legends-container").remove();
    const legendContainer = svg.append("g").attr("class", "legends-container").attr("transform", `translate(0, ${height + 40})`);
    const typeLegendHTML = `<div xmlns="http://www.w3.org/1999/xhtml" style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 1rem; width: 100%; font-family: ${bodyFont};">${allTypes.map(type => `<div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem;"><div style="width: 12px; height: 12px; background-color: ${color(type)};"></div><span>${type}</span></div>`).join('')}</div>`;
    legendContainer.append('foreignObject').attr('x', 0).attr('y', 0).attr('width', width).attr('height', 30).html(typeLegendHTML);

    const locationLegendData = [
      { name: legendNameA, pattern: false },
      { name: legendNameB, pattern: true }
    ];

    const locationLegend = legendContainer.append("g").attr("transform", `translate(0, 40)`);
    const locationLegendItem = locationLegend.selectAll("g")
      .data(locationLegendData)
      .join("g");

    locationLegendItem.each(function (d) {
      const gNode = d3.select(this);
      if (d.pattern) {
        gNode.append("rect")
          .attr("width", 12)
          .attr("height", 12)
          .attr("fill", "#f0f0f0")
          .attr("stroke", "#555")
          .attr("stroke-width", 1);
        gNode.append("rect")
          .attr("width", 12)
          .attr("height", 12)
          .attr("fill", "url(#diagonal-stripe-pattern-illuminance-local)");
      } else {
        gNode.append("rect")
          .attr("width", 12)
          .attr("height", 12)
          .attr("fill", "#f0f0f0")
          .attr("stroke", "#555")
          .attr("stroke-width", 1);
      }
      gNode.append("text")
        .attr("x", 16)
        .attr("y", 9)
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
      const xPosVal = currentX;
      currentX += itemWidths[i] + 30;
      return `translate(${xPosVal}, 0)`;
    });
  };

  if (chartRefs) { chartRefs.illuminance = { update }; }
  update();
}