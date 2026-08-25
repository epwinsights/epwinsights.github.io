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
import { resolveColorInterpolator, EPW_SOLAR_DNI_INTERPOLATOR, EPW_SIGNATURE_PALETTES } from '../core/color-palettes.js';

export function renderSolarRadiationCharts(epwData, chartRefs) {
  renderSolarRadControls('.tab-pane.active .left-panel', chartRefs);
  renderDNIHeatmap('#dni-heatmap-chart', epwData, chartRefs);
  renderRadiationMultiBar('#radiation-multibar-chart', epwData, chartRefs);
  renderSunHoursBarChart('#sun-hours-chart', epwData);
}

export function renderSolarRadControls(panelSelector, chartRefs) {
  const panel = d3.select(panelSelector).html('');
  const palettes = {
    "EPW Insights": ['epwSolarDNI'],
    "Sequential": ['interpolatePlasma', 'interpolateInferno', 'interpolateMagma', 'interpolateViridis', 'interpolateTurbo']
  };

  const heatmapControls = panel.append('div').attr('class', 'chart-controls-group');
  heatmapControls.append('h6').text('Annual Radiation Options');
  const paletteGroup = heatmapControls.append('div').attr('class', 'control-item mt-2');
  paletteGroup.append('label').attr('for', 'rad-palette-select').text('Color Palette:');
  const paletteSelect = paletteGroup.append('select').attr('id', 'rad-palette-select').attr('class', 'form-select form-select-sm');
  for (const group in palettes) {
    const optgroup = paletteSelect.append('optgroup').attr('label', group);
    palettes[group].forEach(p => optgroup.append('option').attr('value', p).text(EPW_SIGNATURE_PALETTES[p] ? 'Signature' : p.replace('interpolate', '')));
  }
  paletteSelect.property('value', 'epwSolarDNI');
  const reversePaletteGroup = paletteGroup.append('div').attr('class', 'form-check form-check-sm mt-1');
  reversePaletteGroup.append('input').attr('class', 'form-check-input').attr('type', 'checkbox').attr('id', 'rad-reverse-palette');
  reversePaletteGroup.append('label').attr('class', 'form-check-label').attr('for', 'rad-reverse-palette').text('Reverse Color Palette');
  const minMaxGroup = heatmapControls.append('div').attr('class', 'control-item');
  minMaxGroup.append('label').text('DNI Scale Domain (Wh/m²):');
  const minMaxInputs = minMaxGroup.append('div').attr('class', 'input-group input-group-sm');
  const minInput = minMaxInputs.append('input').attr('id', 'rad-min-input').attr('type', 'number').attr('class', 'form-control').attr('placeholder', 'Min');
  const maxInput = minMaxInputs.append('input').attr('id', 'rad-max-input').attr('type', 'number').attr('class', 'form-control').attr('placeholder', 'Max');
  const heatmapButtons = heatmapControls.append('div').attr('class', 'control-item d-grid gap-2');
  heatmapButtons.append('button').attr('class', 'btn btn-primary btn-sm').text('Fit to Data').on('click', () => chartRefs.heatmap.update({ fit: true }));
  heatmapButtons.append('button').attr('class', 'btn btn-outline-secondary btn-sm').text('Reset').on('click', () => {
    paletteSelect.property('value', 'epwSolarDNI');
    d3.select('#rad-reverse-palette').property('checked', false);
    chartRefs.heatmap.update({ reset: true });
  });
  heatmapControls.append('p').attr('class', 'info-note').text('Hover on the heatmap to view hourly DNI, GHI, and DHI values.');

  const multiBarControls = panel.append('div').attr('class', 'chart-controls-group');
  multiBarControls.append('h6').text('Average Monthly Radiation');
  const radiationTypes = ['Global Horizontal Irradiance (GHI)', 'Direct Normal Irradiance (DNI)', 'Diffuse horizontal irradiance (DHI)'];
  const radiationCheckboxes = multiBarControls.append('div').attr('class', 'control-item').attr('id', 'radiation-type-checkboxes');
  radiationTypes.forEach(type => {
    const checkboxGroup = radiationCheckboxes.append('div').attr('class', 'form-check form-check-sm');
    checkboxGroup.append('input').attr('class', 'form-check-input').attr('type', 'checkbox').attr('value', type).attr('id', `check-${type}`).property('checked', true);
    checkboxGroup.append('label').attr('class', 'form-check-label').attr('for', `check-${type}`).text(type);
  });

  const updateHeatmap = () => {
    if (chartRefs.heatmap && typeof chartRefs.heatmap.update === 'function') {
      chartRefs.heatmap.update({
        interpolator: resolveColorInterpolator(paletteSelect.property('value')),
        domain: [parseFloat(minInput.property('value')), parseFloat(maxInput.property('value'))]
      });
    }
  };
  paletteSelect.on('change', updateHeatmap);
  d3.select('#rad-reverse-palette').on('change', updateHeatmap);
  minInput.on('change', updateHeatmap);
  maxInput.on('change', updateHeatmap);

  radiationCheckboxes.on('change', () => {
    const visibleTypes = new Set();
    radiationCheckboxes.selectAll('input:checked').each(function () { visibleTypes.add(this.value); });
    if (chartRefs.multibar && chartRefs.multibar.update) { chartRefs.multibar.update({ visibleTypes }); }
  });
}

export function renderDNIHeatmap(selector, epwData, chartRefs) {
  const container = d3.select(selector).html('');
  const hourlyData = epwData.data;
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, 'annual-dni-heatmap', formattedLocation);
  addInfoButton(selector, 'annualDniHeatmap');

  container.append('h5').text('Annual Direct Normal Radiation (DNI)').attr('class', 'chart-title-main');

  const margin = { top: 20, right: 90, bottom: 60, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;
  const svg = container.append("svg").attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const legend = svg.append("g");
  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  chartRefs.heatmap = {
    update: (options = {}) => {
      let { interpolator, domain, fit, reset } = options;
      const allValues = hourlyData.map(d => d.directNormalRadiation);
      const isReversed = d3.select('#rad-reverse-palette').property('checked');
      if (reset) {
        domain = [0, d3.max(allValues)];
        interpolator = EPW_SOLAR_DNI_INTERPOLATOR;
      } else if (fit) {
        domain = [0, d3.quantile(allValues.filter(d => d > 0), 0.99) || d3.max(allValues)];
      } else if (!domain || domain.some(d => isNaN(d))) {
        domain = [0, d3.max(allValues)];
      }
      interpolator = interpolator || resolveColorInterpolator(d3.select('#rad-palette-select').property('value'));
      d3.select('#rad-min-input').property('value', domain[0].toFixed(0));
      d3.select('#rad-max-input').property('value', domain[1].toFixed(0));
      const finalDomain = isReversed ? [domain[1], domain[0]] : domain;
      const colorScale = d3.scaleSequential(interpolator).domain(finalDomain);
      const year = hourlyData[0].year;
      const daysInYear = d3.timeDays(new Date(year, 0, 1), new Date(year + 1, 0, 1)).length;
      const x = d3.scaleLinear().domain([1, daysInYear + 1]).range([0, width]);
      const y = d3.scaleLinear().domain([0, 24]).range([height, 0]);
      svg.selectAll(".hour-rect").remove();
      svg.selectAll("g.axis").remove();
      svg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).tickValues(d3.range(0, 12).map(m => d3.timeDay.count(new Date(year, 0, 1), new Date(year, m, 15)))).tickFormat(d => d3.timeFormat("%b")(d3.timeParse("%j")(d))));
      svg.append("g").attr("class", "axis y-axis").call(d3.axisLeft(y).tickValues([0, 6, 12, 18, 24]));
      svg.append("text").attr("class", "y-axis-label axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 22).attr("x", -height / 2).style("text-anchor", "middle").text("Hour of Day").style("font-family", "sans-serif").style("font-size", "12px");
      svg.append("text").attr("class", "x-axis-label axis-title").attr("x", width / 2).attr("y", height + 40).style("text-anchor", "middle").text("Month").style("font-family", "sans-serif").style("font-size", "12px");
      svg.selectAll(".hour-rect").data(hourlyData).join("rect").attr("class", "hour-rect")
        .attr("x", d => x(+d3.timeFormat("%j")(d.datetime) + 0.6))
        .attr("y", d => y(d.hour))
        .attr("width", Math.max(0.1, width / daysInYear))
        .attr("height", height / 24)
        .style("fill", d => d.directNormalRadiation > 0 ? colorScale(d.directNormalRadiation) : '#f8f9fa')
        .on("mouseover", (event, d) => tooltip.style("opacity", 1).html(
          `<strong>${d3.timeFormat('%b %d, %H:%M')(d.datetime)}</strong><br>` +
          `DNI: ${d.directNormalRadiation.toFixed(0)} Wh/m²<br>` +
          `GHI: ${d.globalHorizontalRadiation.toFixed(0)} Wh/m²<br>` +
          `DHI: ${d.diffuseHorizontalRadiation.toFixed(0)} Wh/m²`
        ))
        .on("mousemove", (event) => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`)).on("mouseout", () => tooltip.style("opacity", 0));
      legend.html('').attr("transform", `translate(${width + 20}, 0)`);
      legend.append("text").attr("x", -7.5).attr("y", -8).attr("class", "axis-title").style("text-anchor", "middle").text("Wh/m²").style("font-family", "sans-serif").style("font-size", "11px");
      const legendScale = d3.scaleLinear().domain(domain).range([height, 0]);
      legend.append("g").call(d3.axisRight(legendScale).ticks(8).tickFormat(d => d.toFixed(0)));
      const gradient = legend.append("defs").append("linearGradient").attr("id", "rad-grad").attr("x1", "0%").attr("y1", "100%").attr("x2", "0%").attr("y2", "0%");
      gradient.selectAll("stop").data(d3.range(0, 1.01, 0.05)).join("stop")
        .attr("offset", d => `${d * 100}%`)
        .attr("stop-color", t => isReversed ? interpolator(1 - t) : interpolator(t));
      legend.append("rect").attr("x", -15).attr("width", 15).attr("height", height).style("fill", "url(#rad-grad)");
    }
  };
  chartRefs.heatmap.update({ reset: true });
}

export function renderRadiationMultiBar(selector, epwData, chartRefs) {
  const container = d3.select(selector).html('');
  const hourlyData = epwData.data;
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, 'monthly-radiation-distribution', formattedLocation);
  addInfoButton(selector, 'monthlyRadiationDistribution');

  container.append('h5').text('Average Monthly Solar Radiation').attr('class', 'chart-title-main');

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

  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");

  const processData = (data) => d3.groups(data, d => d.month).map(([month, values]) => ({
    month: d3.timeFormat("%b")(new Date(2000, month - 1)),
    'Global Horizontal Irradiance (GHI)': d3.mean(values, v => v.globalHorizontalRadiation),
    'Direct Normal Irradiance (DNI)': d3.mean(values, v => v.directNormalRadiation),
    'Diffuse horizontal irradiance (DHI)': d3.mean(values, v => v.diffuseHorizontalRadiation)
  })).sort((a, b) => new Date(`1 ${a.month} 2000`) - new Date(`1 ${b.month} 2000`));

  const monthlyAvg = processData(hourlyData);
  const annualAvg = {
    month: 'Annual',
    'Global Horizontal Irradiance (GHI)': d3.mean(hourlyData, d => d.globalHorizontalRadiation),
    'Direct Normal Irradiance (DNI)': d3.mean(hourlyData, d => d.directNormalRadiation),
    'Diffuse horizontal irradiance (DHI)': d3.mean(hourlyData, d => d.diffuseHorizontalRadiation)
  };
  const plotData = [...monthlyAvg, annualAvg];

  const allTypes = ['Global Horizontal Irradiance (GHI)', 'Direct Normal Irradiance (DNI)', 'Diffuse horizontal irradiance (DHI)'];

  const x0 = d3.scaleBand().domain([...monthlyAvg.map(d => d.month), "", "Annual"]).range([0, width]).padding(0.2);
  const x1 = d3.scaleBand().padding(0.05);
  const y = d3.scaleLinear().range([height, 0]);
  const color = d3.scaleOrdinal().domain(allTypes).range(['#e66101', '#fdb863', '#b2abd2']);
  const xAxisTickValues = [...monthlyAvg.map(d => d.month), "Annual"];

  svg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0, ${height})`);
  svg.append("g").attr("class", "grid-line");
  svg.append("g").attr("class", "axis y-axis");
  svg.append("text")
    .attr("class", "y-axis-label axis-title")
    .attr("transform", "rotate(-90)")
    .attr("y", -margin.left + 20)
    .attr("x", -height / 2)
    .style("text-anchor", "middle")
    .style("font-family", "sans-serif")
    .style("font-size", "12px")
    .text("Wh/m²");

  const monthGroup = svg.selectAll(".multi-bar-group")
    .data(plotData)
    .join("g")
    .attr("class", "multi-bar-group")
    .attr("transform", d => `translate(${x0(d.month)}, 0)`);

  function update() {
    const visibleTypes = new Set();
    d3.selectAll('#radiation-type-checkboxes input:checked').each(function () {
      visibleTypes.add(this.value);
    });

    const activeTypes = allTypes.filter(type => visibleTypes.has(type));
    const maxVisibleValue = d3.max(plotData, d => {
      return d3.max(activeTypes, type => d[type]);
    });
    y.domain([0, maxVisibleValue || 10]).nice();
    x1.domain(activeTypes).range([0, x0.bandwidth()]);

    const grid = svg.select(".grid-line").call(d3.axisLeft(y).tickSize(-width).tickFormat(""));
    grid.selectAll(".tick").filter(d => d === 0).remove();
    grid.selectAll("line").attr("stroke", "#b0b0b0").attr("stroke-opacity", 0.6).attr("stroke-dasharray", "3,3");
    grid.select(".domain").remove();

    svg.select(".x-axis").call(d3.axisBottom(x0).tickValues(xAxisTickValues));
    svg.select(".y-axis").transition().duration(300).call(d3.axisLeft(y));

    const bars = monthGroup.selectAll("rect")
      .data(d => activeTypes.map(key => ({ month: d.month, key, value: d[key] })), d => d.key);

    bars.exit().transition().duration(300).attr("y", y(0)).attr("height", 0).remove();

    bars.enter().append("rect")
      .attr("fill", d => color(d.key))
      .attr("y", y(0))
      .attr("height", 0)
      .attr("x", d => x1(d.key))
      .attr("width", x1.bandwidth())
      .merge(bars)
      .on("mouseover", function (event, d) {
        d3.select(this).attr('fill', d3.color(color(d.key)).darker(0.4));
        tooltip.style("opacity", 1).html(`<strong>${d.key.split('(')[0].trim()}:</strong> ${d.value.toFixed(1)} Wh/m²`);
      })
      .on("mousemove", (event) => {
        tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`);
      })
      .on("mouseout", function (event, d) {
        d3.select(this).attr('fill', color(d.key));
        tooltip.style("opacity", 0);
      })
      .transition().duration(500)
      .attr("x", d => x1(d.key))
      .attr("y", d => y(d.value))
      .attr("width", x1.bandwidth())
      .attr("height", d => height - y(d.value));

    svg.select(".legend-foreign-object").remove();
    const legendItemsData = allTypes.map(type => ({
      color: color(type),
      text: type,
      visible: visibleTypes.has(type)
    }));

    let legendHTML = `<div xmlns="http://www.w3.org/1999/xhtml" style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 1rem 1.5rem; padding: 0.5rem; width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: transparent;">`;
    legendItemsData.forEach(itemData => {
      const textDecoration = itemData.visible ? 'none' : 'line-through';
      const opacity = itemData.visible ? '1' : '0.5';
      legendHTML += `<div class="legend-item" data-type="${itemData.text}" style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; opacity: ${opacity}; cursor: pointer;">
                <div style="width: 12px; height: 12px; background-color: ${itemData.color}; margin-right: 5px; flex-shrink: 0;"></div>
                <span style="white-space: nowrap; text-decoration: ${textDecoration};">${itemData.text.split('(')[0].trim()}</span>
            </div>`;
    });
    legendHTML += `</div>`;

    const foreignObject = svg.append('foreignObject')
      .attr('class', 'legend-foreign-object')
      .attr('x', 0)
      .attr('y', height + margin.bottom - 15)
      .attr('width', width)
      .attr('height', legendHeight);

    foreignObject.html(legendHTML);

    foreignObject.selectAll('.legend-item').on('click', function () {
      const type = d3.select(this).attr('data-type');
      const checkbox = d3.select(`#check-${type}`);
      checkbox.property('checked', !checkbox.property('checked'));
      update();
    });
  }

  chartRefs.multibar.update = update;
  d3.select('#radiation-type-checkboxes').on('change', () => {
    chartRefs.multibar.update();
  });
  update();
}

export function renderSunHoursBarChart(selector, epwData) {
  const container = d3.select(selector).html('');
  const hourlyData = epwData.data;
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country);
  addExportButton(selector, 'average-daily-sun-hours', formattedLocation);
  addInfoButton(selector, 'averageDailySunHours');

  container.append('h5').text('Average Daily Sun Hours').attr('class', 'chart-title-main');

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
    .on("mouseover", function () { d3.select(this).attr("fill", "#f7fafc"); })
    .on("mouseout", function () { d3.select(this).attr("fill", "#f8f9fa"); });
  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  const sunHoursMonthly = d3.groups(hourlyData, d => d.month).map(([month, data]) => {
    const daysInMonth = new Set(data.map(d => d.day)).size;
    const totalSunHours = data.filter(d => d.directNormalRadiation > 120).length;
    return {
      month: d3.timeFormat("%b")(new Date(2000, month - 1)),
      avgDaily: totalSunHours / daysInMonth,
      totalMonthly: totalSunHours
    };
  }).sort((a, b) => new Date(`1 ${a.month} 2012`) - new Date(`1 ${b.month} 2012`));
  const totalDays = new Set(hourlyData.map(d => `${d.day}-${d.month}`)).size;
  const annualData = {
    month: 'Annual',
    avgDaily: hourlyData.filter(d => d.directNormalRadiation > 120).length / totalDays,
    totalMonthly: hourlyData.filter(d => d.directNormalRadiation > 120).length
  };
  const plotData = [...sunHoursMonthly, annualData];
  const barColor = "#fd8d3c";
  const x = d3.scaleBand().domain([...sunHoursMonthly.map(d => d.month), "", "Annual"]).range([0, width]).padding(0.2);
  const y = d3.scaleLinear().domain([0, d3.max(plotData, d => d.avgDaily)]).nice().range([height, 0]);
  svg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0, ${height})`);
  svg.append("g").attr("class", "axis y-axis");
  svg.append("g").attr("class", "grid-line");
  svg.append("text")
    .attr("class", "axis-title")
    .attr("transform", "rotate(-90)")
    .attr("y", -margin.left + 20)
    .attr("x", -height / 2)
    .attr("text-anchor", "middle")
    .style('font-family', 'sans-serif')
    .style('font-size', '11px')
    .text("Hours");
  const grid = svg.select(".grid-line").call(d3.axisLeft(y).tickSize(-width).tickFormat(""));
  grid.selectAll(".tick").filter(d => d === y.domain()[0]).remove();
  grid.selectAll("line").attr("stroke", "#b0b0b0").attr("stroke-opacity", 0.6).attr("stroke-dasharray", "3,3");
  grid.select(".domain").remove();
  const xAxis = svg.select(".x-axis").call(d3.axisBottom(x).tickValues(x.domain().filter(d => d !== "")));
  const yAxis = svg.select(".y-axis").call(d3.axisLeft(y));
  yAxis.selectAll('text').style('font-family', 'sans-serif').style('font-size', '10px');
  xAxis.selectAll('text').style('font-family', 'sans-serif').style('font-size', '10px');
  svg.selectAll(".sun-hours-bar")
    .data(plotData.filter(d => d.month))
    .join("rect")
    .attr("class", "sun-hours-bar")
    .attr("x", d => x(d.month))
    .attr("y", d => y(d.avgDaily))
    .attr("width", x.bandwidth())
    .attr("height", d => height - y(d.avgDaily))
    .attr("fill", barColor)
    .attr("stroke", "black")
    .attr("stroke-width", 0.5)
    .style("transition", "fill 0.2s ease-in-out")
    .on("mouseover", function (event, d) {
      d3.select(this).style('fill', '#e6550d');
      tooltip.style("opacity", 1).html(`<strong>${d.month}</strong><br>Total Sun Hours: ${d.totalMonthly.toFixed(0)}<br>Avg Daily: ${d.avgDaily.toFixed(1)} hrs`);
    })
    .on("mousemove", (event) => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
    .on("mouseout", function () {
      d3.select(this).style('fill', barColor);
      tooltip.style("opacity", 0);
    });
}