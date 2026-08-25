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

export function renderSkyCoverCharts(epwData, chartRefs) {
  d3.select('.tab-pane.active .left-panel').html('');
  renderCloudCoverBands('#sky-cover-bands-chart', epwData, chartRefs);
  renderSkyCoverBarChart('#sky-cover-bar-chart', epwData, chartRefs);
  renderSkyCoverControls('.tab-pane.active .left-panel', chartRefs);
}

export function renderSkyCoverControls(panelSelector, chartRefs) {
  const panel = d3.select(panelSelector);
  const bandsControls = panel.append('div').attr('class', 'chart-controls-group');
  bandsControls.append('h6').text('Cloud Cover Conditions');
  const toggleLabelsCheck = bandsControls.append('div').attr('class', 'form-check');
  toggleLabelsCheck.append('input').attr('class', 'form-check-input').attr('type', 'checkbox').attr('id', 'sky-labels-toggle').property('checked', true);
  toggleLabelsCheck.append('label').attr('class', 'form-check-label').attr('for', 'sky-labels-toggle').text('Show Percentage Labels');

  d3.select('#sky-labels-toggle').on('change', () => {
    const isChecked = d3.select('#sky-labels-toggle').property('checked');
    if (chartRefs.bands && chartRefs.bands.toggleLabels) {
      chartRefs.bands.toggleLabels(isChecked);
    }
  });

  const infoNote = bandsControls.append('p').attr('class', 'info-note');
  infoNote.html('Categories are based on the sky cover definitions from the U.S. National Oceanic and Atmospheric Administration (NOAA), approximated from the 8-okta NOAA scale to the EPW 10-tenths scale. ');
  infoNote.append('a')
    .attr('href', 'https://www.noaa.gov/jetstream/clouds/nws-cloud-chart')
    .attr('target', '_blank')
    .text('Learn more');

  const barChartControls = panel.append('div').attr('class', 'chart-controls-group');
  barChartControls.append('h6').text('Frequency Chart Customization');

  const paletteDiv = barChartControls.append('div').attr('class', 'control-item mb-3');
  paletteDiv.append('label').attr('for', 'sky-bar-color-palette').attr('class', 'form-label').text('Color Palette');
  const paletteSelect = paletteDiv.append('select').attr('class', 'form-select form-select-sm').attr('id', 'sky-bar-color-palette');

  if (chartRefs.barChart && chartRefs.barChart.getPalettes) {
    const palettes = chartRefs.barChart.getPalettes();
    paletteSelect.selectAll('option')
      .data(Object.keys(palettes))
      .join('option')
      .attr('value', d => d)
      .text(d => d);
  }

  paletteSelect.on('change', function () {
    if (chartRefs.barChart && chartRefs.barChart.updateColorPalette) {
      chartRefs.barChart.updateColorPalette(this.value);
    }
  });

  const monthsDiv = barChartControls.append('div').attr('class', 'control-item');
  monthsDiv.append('label').attr('class', 'form-label mb-2').text('Visible Months');

  const annualCheckDiv = monthsDiv.append('div').attr('class', 'form-check');
  annualCheckDiv.append('input')
    .attr('class', 'form-check-input')
    .attr('type', 'checkbox')
    .attr('id', 'annual-check')
    .property('checked', true);
  annualCheckDiv.append('label')
    .attr('class', 'form-check-label')
    .attr('for', 'annual-check')
    .text('Annual');

  monthsDiv.append('hr').attr('class', 'my-2');

  const checkboxesContainer = monthsDiv.append('div')
    .attr('id', 'month-checkboxes-container')
    .style('display', 'flex')
    .style('flex-wrap', 'wrap')
    .style('justify-content', 'center')
    .style('gap', '0.5rem');

  const months = d3.range(1, 13).map(m => new Date(2000, m - 1, 1));

  checkboxesContainer.selectAll('.form-check')
    .data(months)
    .join('div')
    .attr('class', 'form-check form-check-inline m-0')
    .call(div => {
      div.append('input')
        .attr('class', 'form-check-input month-check')
        .attr('type', 'checkbox')
        .attr('checked', true)
        .attr('value', (d, i) => i + 1)
        .attr('id', (d, i) => `month-check-${i + 1}`);
      div.append('label')
        .attr('class', 'form-check-label')
        .attr('for', (d, i) => `month-check-${i + 1}`)
        .text(d => d3.timeFormat('%b')(d));
    });

  monthsDiv.on('change', (event) => {
    const isAnnual = d3.select('#annual-check').property('checked');
    const monthChecks = d3.selectAll('.month-check');

    if (isAnnual) {
      monthChecks.property('checked', true);
      monthChecks.property('disabled', true);
    } else {
      monthChecks.property('disabled', false);

      if (event && event.target.id === 'annual-check') {
        monthChecks.property('checked', true);
      }
    }

    const visibleMonths = new Set();
    if (isAnnual) {
      d3.range(1, 13).forEach(m => visibleMonths.add(m));
    } else {
      d3.selectAll('.month-check:checked').each(function () {
        visibleMonths.add(+this.value);
      });
    }

    if (chartRefs.barChart && chartRefs.barChart.updateMonthVisibility) {
      chartRefs.barChart.updateMonthVisibility(visibleMonths);
    }
  });

  monthsDiv.dispatch('change');
}

export function renderCloudCoverBands(selector, epwData, chartRefs) {
  const container = d3.select(selector).html('');
  const hourlyData = epwData.data;
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, 'monthly-cloud-cover-bands', formattedLocation);
  addInfoButton(selector, 'monthlyCloudCoverBands');

  container.append('h5').text('Monthly Total Cloud Cover Conditions').attr('class', 'chart-title-main');

  const margin = { top: 20, right: 20, bottom: 80, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;
  const svg = container.append("svg").attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  const processData = (data, key) => {
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
  const monthlyData = d3.groups(hourlyData, d => d.month).map(([month, data]) => {
    return processData(data, d3.timeFormat("%b")(new Date(2000, month - 1)));
  }).sort((a, b) => new Date(`1 ${a.month} 2000`) - new Date(`1 ${b.month} 2000`));
  const annualData = processData(hourlyData, "Annual");
  const plotData = [...monthlyData, annualData];
  const keys = ['skyClear', 'few', 'scattered', 'broken', 'overcast'];
  const stack = d3.stack().keys(keys);
  const series = stack(plotData);
  const x = d3.scaleBand().domain([...monthlyData.map(d => d.month), "", "Annual"]).range([0, width]).padding(0.2);
  const y = d3.scaleLinear().domain([0, 100]).range([height, 0]);
  const color = d3.scaleOrdinal().domain(keys).range(['#6495ED', '#87CEEB', '#A9A9A9', '#778899', '#696969']);
  const barGroups = svg.append("g").selectAll("g").data(series).join("g").attr("fill", d => color(d.key));
  barGroups.selectAll("rect").data(d => d).join("rect")
    .attr("x", d => x(d.data.month)).attr("y", d => y(d[1])).attr("height", d => y(d[0]) - y(d[1])).attr("width", x.bandwidth())
    .style("transition", "fill 0.3s ease-in-out")
    .on('mouseover', function () {
      const parentFill = d3.select(this.parentNode).attr('fill');
      d3.select(this).style('fill', d3.color(parentFill).darker(0.2));
    })
    .on('mouseout', function () {
      d3.select(this).style('fill', null);
    });
  const labels = svg.append("g").attr('class', 'bar-labels-group').selectAll("g").data(series).join("g")
    .selectAll(".bar-label").data(d => d).join("text")
    .attr("class", "bar-label")
    .attr("x", d => x(d.data.month) + x.bandwidth() / 2)
    .attr("y", d => y(d[1]) + (y(d[0]) - y(d[1])) / 2 + 5)
    .attr("text-anchor", "middle").style("font-size", "11px").style("fill", "white").style("font-weight", "400").style("font-family", "sans-serif")
    .text(d => (d[1] - d[0]) > 5 ? `${Math.round(d[1] - d[0])}%` : "");
  const tickValues = [...monthlyData.map(d => d.month), "Annual"];
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).tickValues(tickValues));
  svg.append("g").attr("class", "axis").call(d3.axisLeft(y).tickFormat(d => `${d}%`));
  const legend = svg.append("g").attr("transform", `translate(0, ${height + 50})`);
  const legendWidth = width / 5;
  const legendData = [
    { text: 'Sky Clear (0 tenths)', color: color('skyClear') },
    { text: 'Few (1-2 tenths, ~10-20%)', color: color('few') },
    { text: 'Scattered (3-5 tenths, ~30-50%)', color: color('scattered') },
    { text: 'Broken (6-9 tenths, ~60-90%)', color: color('broken') },
    { text: 'Overcast (10 tenths, 100%)', color: color('overcast') }
  ];
  legend.selectAll("g").data(legendData).join("g").attr("transform", (d, i) => `translate(${i * legendWidth}, 0)`)
    .call(g => {
      g.append("rect").attr("width", legendWidth - 10).attr("height", 20).attr("fill", d => d.color);
      g.append("text").attr("x", (legendWidth / 2) - 5).attr("y", 14).attr("text-anchor", "middle").style("font-size", "10px").style("fill", "black").style("font-family", "sans-serif").text(d => d.text);
    });
  chartRefs.bands = {
    toggleLabels: (show) => {
      svg.select('.bar-labels-group').style('display', show ? 'block' : 'none');
    }
  };
}

export function renderSkyCoverBarChart(selector, epwData, chartRefs) {
  const container = d3.select(selector).html('');
  const hourlyData = epwData.data;
  const location = epwData.metadata.location;
  const formattedLocation = formatSimpleLocation(location.city, location.country, 'primary');
  addExportButton(selector, 'hourly-sky-cover-distribution', formattedLocation);
  addInfoButton(selector, 'hourlySkyCoverDistribution');

  container.append('h5').text('Frequency of Sky Cover by Month').attr('class', 'chart-title-main');

  const margin = { top: 20, right: 20, bottom: 100, left: 60 };
  const width = CHART_DESIGN_WIDTH - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;
  const svg = container.append("svg").attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  svg.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "#f8f9fa")
    .style("transition", "fill 0.3s ease-in-out")
    .on("mouseover", function () { d3.select(this).attr("fill", "#f7fafc"); })
    .on("mouseout", function () { d3.select(this).attr("fill", "#f8f9fa"); });
  const tooltip = d3.select("body").selectAll(".tooltip").data([null]).join("div").attr("class", "tooltip");
  const toPercentBin = (cover) => Math.floor(cover) * 10;
  const percentData = hourlyData.map(d => ({ ...d, percentBin: toPercentBin(d.totalSkyCover) }));
  const counts = d3.rollup(percentData, v => v.length, d => d.percentBin, d => d.month);
  const plotData = [];
  for (const [bin, monthMap] of counts.entries()) {
    for (const [month, count] of monthMap.entries()) {
      plotData.push({ bin, month, count });
    }
  }
  const binsDomain = d3.range(0, 101, 10);
  const monthsDomain = d3.range(1, 13);
  const x0 = d3.scaleBand().domain(binsDomain).range([0, width]).padding(0.2);
  const x1 = d3.scaleBand().padding(0.05);
  const y = d3.scaleLinear().domain([0, d3.max(plotData, d => d.count)]).nice().range([height, 0]);
  const seasonColors = { Winter: ['#bdd7e7', '#6baed6', '#2171b5'], Spring: ['#bae4b3', '#74c476', '#238b45'], Summer: ['#fdae6b', '#f16913', '#a63603'], Autumn: ['#fed976', '#feb24c', '#fd8d3c'] };
  const colorPalettes = {
    'Northern Hemisphere': d3.scaleOrdinal().domain(monthsDomain).range([seasonColors.Winter[2], seasonColors.Winter[1], seasonColors.Spring[0], seasonColors.Spring[1], seasonColors.Spring[2], seasonColors.Summer[0], seasonColors.Summer[1], seasonColors.Summer[2], seasonColors.Autumn[2], seasonColors.Autumn[1], seasonColors.Autumn[0], seasonColors.Winter[0]]),
    'Southern Hemisphere': d3.scaleOrdinal().domain(monthsDomain).range([seasonColors.Summer[2], seasonColors.Summer[1], seasonColors.Autumn[0], seasonColors.Autumn[1], seasonColors.Autumn[2], seasonColors.Winter[0], seasonColors.Winter[1], seasonColors.Winter[2], seasonColors.Spring[2], seasonColors.Spring[1], seasonColors.Spring[0], seasonColors.Summer[0]]),
    'Vivid': d3.scaleOrdinal(monthsDomain, ['#e6194B', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990', '#dcbeff']),
    'Pastel': d3.scaleOrdinal(monthsDomain, d3.schemeSet3),
    'Paired': d3.scaleOrdinal(monthsDomain, d3.schemePaired),
    'Earth Tones': d3.scaleOrdinal(monthsDomain, ['#8dd3c7', '#d9d9d9', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5', '#bc80bd', '#ccebc5', '#ffed6f', '#a65628']),
    'Fire & Ice': d3.scaleOrdinal(monthsDomain, d3.quantize(d3.interpolateHcl("#2171b5", "#ef3b2c"), 12)),
  };
  let activePalette = colorPalettes['Northern Hemisphere'];
  const grid = svg.append("g").attr("class", "grid-line");
  grid.call(d3.axisLeft(y).tickSize(-width).tickFormat(""))
    .selectAll("line")
    .attr("stroke", "#b0b0b0")
    .attr("stroke-opacity", 0.6)
    .attr("stroke-dasharray", "3,3");
  grid.select(".domain").remove();
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x0).tickFormat(d => `${d}%`));
  svg.append("g").attr("class", "axis").call(d3.axisLeft(y));
  svg.append("text").attr("class", "axis-title").attr("transform", "rotate(-90)").attr("y", -margin.left + 20).attr("x", -height / 2).style("text-anchor", "middle").text("Total Hours (h)").style("font-family", "sans-serif").style("font-size", "12px");
  svg.append("text").attr("class", "axis-title").attr("x", width / 2).attr("y", height + 40).style("text-anchor", "middle").text("Total Sky Cover (%)").style("font-family", "sans-serif").style("font-size", "12px");
  const binGroups = svg.append("g").selectAll(".bin-group").data(binsDomain).join("g").attr("class", "bin-group");
  const legendContainer = svg.append('foreignObject')
    .attr('x', 0)
    .attr('y', height + 50)
    .attr('width', width)
    .attr('height', 50);
  const legendDiv = legendContainer.append('xhtml:div')
    .style('display', 'flex')
    .style('flex-direction', 'column')
    .style('align-items', 'center')
    .style('width', '100%')
    .style('height', '100%')
    .style('gap', '8px');
  const row1 = legendDiv.append('div').attr('class', 'legend-row');
  const row2 = legendDiv.append('div').attr('class', 'legend-row');
  legendDiv.selectAll('.legend-row')
    .style('display', 'flex')
    .style('justify-content', 'center')
    .style('gap', '16px');
  const createLegendItems = (selection, data) => {
    selection.selectAll('.legend-item')
      .data(data)
      .join('div')
      .attr('class', 'legend-item')
      .style('display', 'flex')
      .style('align-items', 'center')
      .style('font-family', 'sans-serif')
      .style('font-size', '11px')
      .call(item => {
        item.append('div')
          .style('width', '12px')
          .style('height', '12px')
          .style('margin-right', '4px')
          .attr('class', 'legend-color-box');
        item.append('span')
          .text(d => d3.timeFormat("%B")(new Date(2000, d - 1)));
      });
  };
  createLegendItems(row1, monthsDomain.slice(0, 6));
  createLegendItems(row2, monthsDomain.slice(6, 12));
  function update(params) {
    const { visibleMonths, paletteName } = params;
    if (paletteName) { activePalette = colorPalettes[paletteName]; }
    const visibleMonthsArray = Array.from(visibleMonths).sort((a, b) => a - b);
    x1.domain(visibleMonthsArray).range([0, x0.bandwidth()]);
    binGroups.attr("transform", d => `translate(${x0(d)},0)`);
    const bars = binGroups.selectAll("rect.month-bar")
      .data(bin => plotData.filter(p => p.bin === bin && visibleMonths.has(p.month)), d => d.month);
    bars.exit()
      .transition().duration(250)
      .attr("y", height)
      .attr("height", 0)
      .remove();
    bars.enter().append("rect")
      .attr("class", d => `month-bar month-${d.month}`)
      .attr("y", height)
      .attr("height", 0)
      .merge(bars)
      .on("mouseover", (event, d) => {
        const rangeLabel = d.bin === 100 ? '100%' : `${d.bin}-${d.bin + 10}%`;
        tooltip.style("opacity", 1).html(`<strong>${d3.timeFormat("%B")(new Date(2000, d.month - 1))}</strong><br>Cover ${rangeLabel}: ${d.count} hours`);
      })
      .on("mousemove", (event) => tooltip.style("top", `${event.pageY - 10}px`).style("left", `${event.pageX + 10}px`))
      .on("mouseout", () => tooltip.style("opacity", 0))
      .transition().duration(500).delay(100)
      .attr("x", d => x1(d.month))
      .attr("y", d => y(d.count))
      .attr("width", x1.bandwidth())
      .attr("height", d => height - y(d.count))
      .attr("fill", d => activePalette(d.month));
    const legendItems = legendDiv.selectAll(".legend-item");
    legendItems.select(".legend-color-box")
      .transition().duration(500)
      .style('background-color', d => visibleMonths.has(d) ? activePalette(d) : '#ccc');
    legendItems.transition().duration(500)
      .style('opacity', d => visibleMonths.has(d) ? 1.0 : 0.5)
      .style("text-decoration", d => visibleMonths.has(d) ? "none" : "line-through");
  }
  update({ visibleMonths: new Set(monthsDomain), paletteName: 'Northern Hemisphere' });
  chartRefs.barChart = {
    updateColorPalette: (paletteName) => {
      const visibleMonths = new Set();
      d3.selectAll('#month-checkboxes-container input:checked').each(function () { visibleMonths.add(+this.value); });
      update({ visibleMonths, paletteName });
    },
    updateMonthVisibility: (visibleMonths) => {
      update({ visibleMonths });
    },
    getPalettes: () => colorPalettes,
  };
}