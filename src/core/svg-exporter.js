/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';

export { addInfoButton } from './chart-info.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const MIN_EXPORT_WIDTH = 1200;
const MAX_EXPORT_WIDTH = 3200;

export function getSvgStyles(svgNode) {
  let styles = '';
  const sheets = document.styleSheets;
  for (let i = 0; i < sheets.length; i++) {
    let rules;
    try {
      rules = sheets[i].cssRules;
    } catch (e) {
      continue;
    }
    if (!rules) continue;
    for (let j = 0; j < rules.length; j++) {
      const rule = rules[j];
      if (typeof (rule.style) != "undefined") {
        const selectorText = rule.selectorText;
        try {
          if (selectorText && svgNode.querySelector(selectorText)) {
            styles += `${selectorText} { ${rule.style.cssText} }\n`;
          }
        } catch (e) {
          continue;
        }
      }
    }
  }
  return styles;
}

function injectStyles(svgClone, styles) {
  const styleElement = document.createElementNS(SVG_NS, 'style');
  styleElement.setAttribute('type', 'text/css');
  styleElement.textContent = styles;

  const defsElement = document.createElementNS(SVG_NS, 'defs');
  defsElement.appendChild(styleElement);
  svgClone.insertBefore(defsElement, svgClone.firstChild);
}

function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, mid).trimEnd() + ellipsis;
    if (ctx.measureText(candidate).width <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo <= 0 ? ellipsis : text.slice(0, lo).trimEnd() + ellipsis;
}

export function exportChartAsPNG(svgNode, filename, chartTitle = '', epwLocation = '', scale = 2.5, onComplete = null, onError = null) {
  if (!svgNode) {
    console.error("SVG node not provided for export.");
    if (typeof onError === 'function') onError(new Error('SVG node not provided for export.'));
    return;
  }

  const viewBox = svgNode.viewBox.baseVal;
  const svgWidth = viewBox && viewBox.width ? viewBox.width : svgNode.getBoundingClientRect().width;
  const svgHeight = viewBox && viewBox.height ? viewBox.height : svgNode.getBoundingClientRect().height;

  if (!svgWidth || !svgHeight) {
    console.error("SVG has no measurable dimensions to export.");
    if (typeof onError === 'function') onError(new Error('SVG has no measurable dimensions to export.'));
    return;
  }

  const neededScale = MIN_EXPORT_WIDTH / svgWidth;
  const effectiveScale = Math.min(Math.max(scale, neededScale), MAX_EXPORT_WIDTH / svgWidth);

  const headerHeight = 22;
  const signatureHeight = 15;
  const signatureFontSize = 7;
  const padding = 15;

  let styles = '';
  try {
    styles = getSvgStyles(svgNode);
  } catch (e) {
    console.warn('Could not collect stylesheet rules for export; continuing without them.', e);
  }

  const svgClone = svgNode.cloneNode(true);
  injectStyles(svgClone, styles);

  const svgData = new XMLSerializer().serializeToString(svgClone);
  const canvas = document.createElement("canvas");

  canvas.width = svgWidth * effectiveScale;
  canvas.height = (headerHeight * effectiveScale) + (svgHeight * effectiveScale) + (signatureHeight * effectiveScale);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const img = new Image();

  img.onerror = () => {
    console.error("Failed to rasterize chart SVG for export (the image failed to load).");
    if (typeof onError === 'function') onError(new Error('Failed to rasterize chart SVG for export.'));
  };

  img.onload = () => {
    try {
      ctx.fillStyle = '#f8f9fa';
      ctx.fillRect(0, 0, canvas.width, headerHeight * effectiveScale);

      const headerMidY = headerHeight * effectiveScale / 2;
      const headerPad = padding * effectiveScale;
      const gap = 20 * effectiveScale;
      const availableWidth = canvas.width - (headerPad * 2) - gap;
      const titleMaxWidth = availableWidth * 0.6;
      const locationMaxWidth = availableWidth * 0.4;

      ctx.fillStyle = '#212529';
      ctx.font = `bold ${11 * effectiveScale}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(fitText(ctx, chartTitle, titleMaxWidth), headerPad, headerMidY);

      ctx.fillStyle = '#6c757d';
      ctx.font = `italic ${10 * effectiveScale}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(fitText(ctx, epwLocation, locationMaxWidth), canvas.width - headerPad, headerMidY);

      ctx.drawImage(img, 0, headerHeight * effectiveScale, svgWidth * effectiveScale, svgHeight * effectiveScale);

      const signatureY = headerHeight * effectiveScale + svgHeight * effectiveScale;
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, signatureY, canvas.width, signatureHeight * effectiveScale);
      ctx.fillStyle = '#555';
      ctx.font = `bold ${signatureFontSize * effectiveScale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const signatureText = "EPW Insights | epwinsights.github.io";
      ctx.fillText(signatureText, canvas.width / 2, signatureY + (signatureHeight * effectiveScale / 2));

      const locationSlug = slugify(epwLocation);
      const finalFilename = locationSlug ? `${filename}-${locationSlug}` : filename;

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.setAttribute("download", `${finalFilename}.png`);
      a.dispatchEvent(new MouseEvent("click"));

      if (typeof onComplete === 'function') onComplete();
    } catch (e) {
      console.error("Error while composing the export canvas.", e);
      if (typeof onError === 'function') onError(e);
    }
  };

  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
}

function showExportSuccess(buttonNode) {
  const button = d3.select(buttonNode);
  const icon = button.select('i');
  icon.attr('class', 'bi bi-check2');
  button.classed('success', true);
  button.classed('error', false);

  clearTimeout(buttonNode.__feedbackTimeout);
  buttonNode.__feedbackTimeout = setTimeout(() => {
    icon.attr('class', 'bi bi-camera-fill');
    button.classed('success', false);
  }, 1500);
}

function showExportError(buttonNode) {
  const button = d3.select(buttonNode);
  const icon = button.select('i');
  icon.attr('class', 'bi bi-exclamation-triangle-fill');
  button.classed('error', true);
  button.classed('success', false);
  button.attr('title', 'Export failed — please try again.');

  clearTimeout(buttonNode.__feedbackTimeout);
  buttonNode.__feedbackTimeout = setTimeout(() => {
    icon.attr('class', 'bi bi-camera-fill');
    button.classed('error', false);
    button.attr('title', 'Download chart as image');
  }, 2500);
}

export function addExportButton(containerSelector, filename, epwLocation = '') {
  const container = d3.select(containerSelector);
  if (container.empty() || container.select('.export-button').size() > 0) return;

  container.classed('has-chart-actions', true);

  const button = container.append('button')
    .attr('type', 'button')
    .attr('class', 'export-button')
    .attr('aria-label', 'Download chart as image')
    .attr('title', 'Download chart as image')
    .attr('data-bs-toggle', 'tooltip')
    .attr('data-bs-placement', 'bottom')
    .on('click', function () {
      const svgNode = container.select('svg').node();
      const chartTitle = container.select('h5.chart-title-main').text();
      exportChartAsPNG(
        svgNode,
        filename,
        chartTitle,
        epwLocation,
        2.5,
        () => showExportSuccess(this),
        () => showExportError(this)
      );
    });

  button.append('i')
    .attr('class', 'bi bi-camera-fill')
    .attr('aria-hidden', 'true');

  if (window.bootstrap && window.bootstrap.Tooltip) {
    new window.bootstrap.Tooltip(button.node());
  }
}