/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

export const RELEASES = [
  {
    version: "1.0.0",
    date: "August 2026",
    badge: "Major Release",
    badgeColor: "primary",
    description: "v1.0.0 introduces comprehensive new analytical modules, major simulation enhancements, and a complete modernization of the user interface architecture.",
    categories: [
      {
        title: "New Modules & Advanced Analysis",
        icon: "bi-plus-circle",
        color: "success",
        items: [
          "Introduced the **Future Climate Projection** module: apply the CMIP6/IPCC AR6 morphing method to project any EPW file to 2030, 2050, or 2080 under all four SSP scenarios, with baseline-vs-morphed comparisons, HDD/CDD shift analysis, and CSV export.",
          "Integrated new specialized modules: **Outdoor Comfort**, **Peak Conditions**, and **Material Analysis**.",
          "Significantly upgraded the **Psychrometric Chart** with enhanced bioclimatic strategy calculations.",
          "Added contextual **Chart Info overlays** across all visualization panels for enhanced data interpretation."
        ]
      },
      {
        title: "Interface & Workflow Improvements",
        icon: "bi-palette",
        color: "info text-dark",
        items: [
          "Every chart tab received a pass of graphical and functional refinements, from panel layout and control grouping to rendering and interaction fixes, some minor and some more substantial.",
          "Replaced the old example toggle with the **Explore Example Climates** picker: choose from 14 cities spanning a wide range of Koppen climate classifications, and load any one of them alone or side by side with another for comparison.",
          "Refined the overall layout with collapsible mega-containers, and a reworked file drop-zone experience.",
          "Added custom location naming, high-resolution chart image export, and a range of smaller rendering and stability fixes across the map and chart components."
        ]
      },
      {
        title: "Data Quality & Reliability",
        icon: "bi-shield-check",
        color: "dark",
        items: [
          "Added guards that detect non-standard EPW files, such as files reporting a constant or default value for a given parameter throughout the year, and show a clear notice on the affected tab instead of rendering a chart built on meaningless data.",
          "Added a plausibility check on station pressure readings, falling back to the ASHRAE standard-atmosphere estimate from the file's elevation when the reported values are missing or physically implausible.",
          "Files with more hourly records than a single calendar year are now detected and truncated with a warning, rather than silently analyzed only in part or left to produce undefined behavior downstream."
        ]
      }
    ]
  },
  {
    version: "0.9.0",
    date: "August 2025",
    badge: "Initial Release",
    badgeColor: "secondary text-dark",
    description: "Initial beta release and official public introduction of the EPW Insights platform for advanced weather data visualization.",
    categories: []
  }
];

export function initReleaseNotes() {
  const releaseModalBody = document.getElementById("release-notes-modal-body");
  if (!releaseModalBody) return;

  let contentHtml = `<div class="timeline-container">`;

  RELEASES.forEach((release, index) => {
    contentHtml += `
            <div class="release-block mb-5">
                <div class="d-flex align-items-center mb-3 pb-2 border-bottom">
                    <h4 class="mb-0 fw-bold me-3">v${release.version}</h4>
                    <span class="text-muted small me-3"><i class="bi bi-calendar-event me-1"></i>${release.date}</span>
                    ${release.badge ? `<span class="badge bg-${release.badgeColor}">${release.badge}</span>` : ''}
                </div>
                
                ${release.description ? `<p class="text-secondary mb-4">${release.description}</p>` : ''}
                
                <div class="release-categories">
        `;

    release.categories.forEach(category => {
      contentHtml += `
                <div class="mb-4">
                    <h6 class="fw-semibold text-dark mb-3">
                        <i class="bi ${category.icon} text-${category.color.split(' ')[0]} me-2"></i>${category.title}
                    </h6>
                    <ul class="list-group list-group-flush border-0">
            `;

      category.items.forEach(item => {
        const formattedItem = item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        contentHtml += `
                    <li class="list-group-item bg-transparent border-0 py-1 ps-4 position-relative text-secondary" style="font-size: 0.9rem;">
                        <i class="bi bi-check2 position-absolute start-0 top-0 mt-1 text-muted"></i>
                        ${formattedItem}
                    </li>
                `;
      });

      contentHtml += `
                    </ul>
                </div>
            `;
    });

    contentHtml += `
                </div>
            </div>
        `;
  });

  contentHtml += `</div>`;
  releaseModalBody.innerHTML = contentHtml;
}