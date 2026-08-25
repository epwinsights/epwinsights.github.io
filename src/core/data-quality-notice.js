import * as d3 from 'd3';

const NOTICE_ICON = `
<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
</svg>`;

function noticeHTML(label) {
  return `
    ${NOTICE_ICON}
    <h5>${label} data not available</h5>
    <p>This EPW file reports a constant or default value for this parameter throughout the year, so no meaningful chart can be generated. This is a limitation of the source weather file, not an issue with EPW Insights.</p>
  `;
}

export function setSidePanelAvailable(paneSelector, available) {
  const root = d3.select(paneSelector);
  if (root.empty()) return;
  root.select('.row').classed('no-side-panel', !available);
  if (!available) root.select('.left-panel').html('');
}

export function renderDataUnavailableNotice(selector, label) {
  const root = d3.select(selector);
  if (root.empty()) return;

  setSidePanelAvailable(selector, false);

  root.selectAll('.chart-container').each(function (d, i) {
    const container = d3.select(this).html('');
    if (i > 0) return;
    container.append('div').attr('class', 'data-unavailable-notice').html(noticeHTML(label));
  });
}

export function restoreDataPanel(selector) {
  setSidePanelAvailable(selector, true);
}

export function renderSectionUnavailableNotice(containerSelector, label) {
  const container = d3.select(containerSelector);
  if (container.empty()) return;
  container.html('').append('div').attr('class', 'data-unavailable-notice').html(noticeHTML(label));
}

export function isTabDataMissing(epwData, fields) {
  const quality = epwData && epwData.dataQuality;
  if (!quality) return false;
  return fields.some(field => quality[field] && quality[field].isConstant);
}

export function renderDependencyBanner(mainAreaSelector, triggeredDeps) {
  const mainArea = d3.select(mainAreaSelector);
  if (mainArea.empty()) return;
  mainArea.select('.dependency-warning-banner').remove();
  if (!triggeredDeps.length) return;

  const labels = triggeredDeps.map(d => d.label).join(', ');
  mainArea.insert('div', ':first-child')
    .attr('class', 'dependency-warning-banner alert alert-warning d-flex align-items-center gap-2 mb-4')
    .html(`<i class="bi bi-exclamation-triangle"></i>
      <span>This EPW file reports constant/default values for: <strong>${labels}</strong>.
      Charts on this tab that rely on ${labels.toLowerCase()} may not be meaningful.</span>`);
}

export function getMissingSources(epwDataA, epwDataB, fields, nameA = 'Primary', nameB = 'Comparison') {
  const missing = [];
  if (isTabDataMissing(epwDataA, fields)) missing.push(nameA);
  if (isTabDataMissing(epwDataB, fields)) missing.push(nameB);
  return missing;
}

export function renderCompareUnavailableNotice(containerSelector, label, missingSources) {
  const container = d3.select(containerSelector);
  if (container.empty()) return;
  const who = missingSources.length === 2 ? 'both the Primary and Comparison files' : `the ${missingSources[0]} file`;
  container.html('').append('div')
    .attr('class', 'data-unavailable-notice')
    .html(`
      ${NOTICE_ICON}
      <h5>${label} data not available</h5>
      <p>${who[0].toUpperCase() + who.slice(1)} report${missingSources.length === 2 ? '' : 's'} a constant or default value for this parameter throughout the year, so no meaningful comparison can be generated.</p>
    `);
}

export function renderCompareDependencyBanner(mainAreaSelector, triggeredDeps) {
  const mainArea = d3.select(mainAreaSelector);
  if (mainArea.empty()) return;
  mainArea.select('.dependency-warning-banner').remove();
  if (!triggeredDeps.length) return;

  const lines = triggeredDeps.map(d => {
    const who = d.missingSources.length === 2 ? 'both files' : `the ${d.missingSources[0]} file`;
    return `<strong>${d.label}</strong> (constant in ${who})`;
  }).join(', ');

  mainArea.insert('div', ':first-child')
    .attr('class', 'dependency-warning-banner alert alert-warning d-flex align-items-center gap-2 mb-4')
    .html(`<i class="bi bi-exclamation-triangle"></i><span>This comparison includes: ${lines}. Related charts may not be meaningful.</span>`);
}