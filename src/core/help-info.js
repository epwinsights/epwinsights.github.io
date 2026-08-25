/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

export const HELP_TABS = [
  {
    id: "help-tab-getting-started",
    icon: "bi-rocket-takeoff",
    title: "Getting Started & UI",
    sections: [
      {
        title: "1. Uploading & Parsing Weather Data",
        badges: [
          { text: "EPW Input", color: "primary", icon: "bi-upload" },
          { text: "Auto-Parsing", color: "success", icon: "bi-check-circle" },
          { text: "Example Climates", color: "secondary", icon: "bi-file-earmark" }
        ],
        content: `
                    <p>Begin your analysis by dragging and dropping a valid <code>.epw</code> (EnergyPlus Weather) file into the Primary Drop Zone. The application runs entirely in your browser, parsing geographic headers and hourly climate readings locally without server uploads.</p>
                    <p>No file on hand? Open <strong>Explore Example Climates</strong> from the upload zone to pick from 14 curated cities spanning a wide range of Koppen climate classifications. Select a single city to load it on its own, or pick a second one to load both at once in Comparison mode.</p>
                `
      },
      {
        title: "2. Interface & Customization",
        badges: [
          { text: "Location Editor", color: "dark", icon: "bi-pencil-square" },
          { text: "Collapsible Panels", color: "info text-dark", icon: "bi-layout-sidebar" },
          { text: "Image Export", color: "light border text-dark", icon: "bi-camera-fill" }
        ],
        content: `
                    <p><strong>Location Summary:</strong> EPW Insights automatically identifies location details. If the parsed city or station name is inaccurate, click the <strong>Customize Names</strong> button (or the pencil icon) to edit them for export purposes.</p>
                    <p><strong>Responsive Layout:</strong> The interface uses collapsible mega-containers for the top sections and sticky control panels on the left side of every chart tab. You can collapse the left panel to maximize chart viewing space.</p>
                    <p><strong>Exporting Assets:</strong> Every chart features a floating camera icon in the top right corner. Clicking this will instantly download a high-resolution, production-ready PNG of the active visualization.</p>
                `
      },
      {
        title: "3. Data Quality Guards",
        badges: [
          { text: "Non-Standard File Detection", color: "danger", icon: "bi-exclamation-triangle" },
          { text: "Pressure Validation", color: "secondary", icon: "bi-speedometer2" }
        ],
        content: `
                    <p>Not every <code>.epw</code> file in the wild fully populates every field. EPW Insights checks each parameter for suspicious patterns, such as a value that stays constant across all 8,760 hours, and flags the affected tab with a clear notice instead of rendering a chart from meaningless data.</p>
                    <p>Station pressure gets a dedicated plausibility check: if the file's own readings are missing or outside a physically realistic range, the app falls back to the ASHRAE standard-atmosphere estimate based on the site's elevation, so downstream psychrometric calculations stay reliable.</p>
                `
      }
    ]
  },
  {
    id: "help-tab-core-climate",
    icon: "bi-cloud-sun",
    title: "Core Climate",
    sections: [
      {
        title: "1. Temperature & Humidity",
        badges: [
          { text: "Annual Heatmaps", color: "primary", icon: "bi-grid-3x3" },
          { text: "Diurnal Cycles", color: "warning text-dark", icon: "bi-clock-history" },
          { text: "Boxplots", color: "danger", icon: "bi-bar-chart" }
        ],
        content: `
                    <p><strong>Heatmaps:</strong> Visualize 8,760 hours of dry-bulb temperature and relative humidity continuously to easily spot extended heatwaves, prolonged freezing periods, and daily cooling patterns.</p>
                    <p><strong>Distributions:</strong> Monthly boxplots evaluate the statistical spread, highlighting extreme outliers, medians, and central tendencies to quantify local climate volatility.</p>
                    <p><strong>Diurnal Curves:</strong> Compare the mean 24-hour cycle of dry-bulb vs. dew-point temperatures to reveal changing humidity relationships and condensation risks.</p>
                `
      },
      {
        title: "2. Sky Cover & Wind",
        badges: [
          { text: "Annual Heatmaps", color: "primary", icon: "bi-grid-3x3" },
          { text: "Interactive Wind Rose", color: "info text-dark", icon: "bi-wind" }
        ],
        content: `
                    <p><strong>Sky Cover:</strong> Categorizes hourly data into meteorological cloud density bands (Clear to Overcast). Detailed frequency bins help estimate daylight autonomy and solar array viability.</p>
                    <p><strong>Wind Analysis:</strong> The dynamic wind rose embeds temperature or humidity data directly into directional petals. This pinpoints the source of specific thermal loads (e.g., distinguishing dry winter breezes from humid summer storms). A monthly grid view breaks down seasonal shifts.</p>
                `
      },
      {
        title: "3. Solar Radiation, Daylight & Sun Path",
        badges: [
          { text: "Direct/Diffuse Splitting", color: "warning text-dark", icon: "bi-brightness-high" },
          { text: "Daylight Lux & Cd/m²", color: "info", icon: "bi-eye" },
          { text: "WMO Sun Hours", color: "success", icon: "bi-stopwatch" },
          { text: "Analemmas", color: "dark", icon: "bi-globe" }
        ],
        content: `
          <p><strong>Radiation Components:</strong> Isolates Global Horizontal (GHI), Direct Normal (DNI), and Diffuse Horizontal (DHI) irradiance to determine optimal solar strategies (concentrated collectors vs. standard PV).</p>
          <p><strong>Daylight & Illuminance:</strong> Analyzes visual daylight availability by processing Global, Direct, and Diffuse Illuminance (measured in <strong>lux</strong>) along with Sky Brightness overhead (Zenith Luminance in <strong>Cd/m²</strong>). Synthesized via Luminous Efficacy models, these metrics provide essential baselines for Daylight Autonomy (DA) and interior glare analysis.</p>
          <p><strong>Sun Path:</strong> Maps the geometric trajectory of the sun across a stereographic projection over a full year, overlaying actual irradiance data to correlate geometry with real atmospheric energy potential.</p>
        `
      }
    ]
  },
  {
    id: "help-tab-advanced",
    icon: "bi-cpu",
    title: "Advanced Analytics",
    sections: [
      {
        title: "1. Psychrometric & Bioclimatic Strategies",
        badges: [
          { text: "ASHRAE 55", color: "primary", icon: "bi-graph-up" },
          { text: "Passive Boundaries", color: "success", icon: "bi-shield-check" }
        ],
        content: `
                    <p>Plots hourly data on a thermodynamically accurate moist air chart. You can overlay distinct passive design boundaries (Natural Ventilation, Evaporative Cooling, Thermal Mass) and adjust metabolic rates or clothing levels.</p>
                    <p>The companion frequency bar charts and temporal matrices automatically calculate exactly how many hours per year each specific bioclimatic strategy is effective.</p>
                `
      },
      {
        title: "2. Outdoor Comfort (UTCI, MRT & SET)",
        badges: [
          { text: "UTCI Stress", color: "danger", icon: "bi-thermometer-high" },
          { text: "SET Model", color: "dark", icon: "bi-person-arms-up" },
          { text: "Radiant Load (MRT)", color: "warning text-dark", icon: "bi-brightness-alt-high" }
        ],
        content: `
                    <p><strong>UTCI:</strong> Evaluates localized environmental stress by combining air temperature, mean radiant interactions, wind, and humidity to categorize comfort from Extreme Cold to Extreme Heat Stress.</p>
                    <p><strong>Standard Effective Temperature (SET):</strong> Utilizes the Gagge Two-Node physiological model to track heat exchange between the human core, skin, and the environment, adjusting for metabolic rates and clothing insulation.</p>
                    <p><strong>Mean Radiant Temperature (MRT):</strong> Quantifies the total radiant heat exchange by applying street canyon aspect ratios, sky view factors (SVF), and direct shortwave/longwave radiation limitations.</p>
                `
      },
      {
        title: "3. Peak Conditions",
        badges: [
          { text: "Event Calendar", color: "warning text-dark", icon: "bi-calendar3" },
          { text: "Duration Curves", color: "secondary", icon: "bi-graph-down" }
        ],
        content: `
                    <p>Identifies multi-variable weather extremes. The interactive calendar matrix pinpoints peak thermal stress days, while the Temperature Duration Curve orders annual data to quantify cumulative exposure hours for precise HVAC sizing.</p>
                `
      },
      {
        title: "4. Material Analysis & Thermal Mass",
        badges: [
          { text: "Surface Heat Balance", color: "info text-dark", icon: "bi-sun" },
          { text: "Finite-Difference 1D", color: "primary", icon: "bi-layers" }
        ],
        content: `
                    <p><strong>Material Surfaces:</strong> Computes a steady-state heat balance using user-defined albedo, emissivity, and geometry to estimate exterior surface temperatures and urban heat island contributions.</p>
                    <p><strong>Thermal Mass Sketch:</strong> A 1D explicit finite-difference solver visualizes transient heat flow through a 10-node cross-section over 24 hours, exposing vital metrics like Time Lag, Decrement Factor, and Diurnal Heat Flux.</p>
                `
      }
    ]
  },
  {
    id: "help-tab-climate-morphing",
    icon: "bi-cloud-lightning-rain",
    title: "Future Climate Projection",
    sections: [
      {
        title: "1. Grid Cell Matching & Scenario Selection",
        badges: [
          { text: "CMIP6 1x1° Grid", color: "danger", icon: "bi-grid-3x3-gap" },
          { text: "Nearest Land Cell", color: "dark", icon: "bi-pin-map" },
          { text: "4 SSP Pathways", color: "warning text-dark", icon: "bi-signpost-split" }
        ],
        content: `
          <p>The uploaded EPW file's coordinates are automatically matched to their nearest 1x1 degree CMIP6 land grid cell, so the projection is based on the closest available data point to the station itself rather than an average across a much larger region. The corresponding IPCC AR6 region name is still shown alongside it for geographic context, but it is descriptive only and plays no role in the calculation.</p>
          <p>Select one of the four SSP scenarios (SSP1-2.6 through SSP5-8.5) and a target year, <strong>2030</strong>, <strong>2050</strong>, or <strong>2080</strong>, each backed by its own CMIP6 ensemble computed over the corresponding AR6 reference period.</p>
        `
      },
      {
        title: "2. Shift+Stretch Morphing & Results",
        badges: [
          { text: "Shift+Stretch Method", color: "primary", icon: "bi-graph-up-arrow" },
          { text: "Baseline vs. Morphed", color: "info text-dark", icon: "bi-layers-half" },
          { text: "CMIP6 Benchmark Check", color: "success", icon: "bi-thermometer-half" }
        ],
        content: `
          <p>Each day's mean dry-bulb temperature is shifted by the ensemble-mean monthly delta for the resolved grid cell, scenario, and target year. The diurnal swing around that mean is then separately stretched or compressed to reflect the projected change in the daily temperature range, rather than shifting every hour by the same fixed amount. This keeps hour-by-hour metrics elsewhere in the app, such as UTCI and SET, more representative of the projected climate.</p>
          <p>Results include baseline vs. projected temperature curves, monthly heating/cooling degree-day shifts, and headline KPIs like extreme heat day counts, alongside an independent benchmark comparing the EPW-derived shifts against the official CMIP6 index deltas for the same grid cell.</p>
          <p>Export the full projected hourly dataset, including baseline, morphed, and delta values, as a CSV file for further analysis.</p>
        `
      }
    ]
  },
  {
    id: "help-tab-data",
    icon: "bi-table",
    title: "Data & Compare",
    sections: [
      {
        title: "1. Data Tables",
        badges: [
          { text: "Hourly Explorer", color: "primary", icon: "bi-search" },
          { text: "CSV Export", color: "success", icon: "bi-filetype-csv" }
        ],
        content: `
                    <p>Extract highly specific data ranges using the dynamic tables. Select custom variables (e.g., DBT, DPT, Illuminance) from the left accordion panel, set your time frames (Monthly, Daily, or Hourly), and directly copy the grid or download a structured <code>.csv</code> file.</p>
                `
      },
      {
        title: "2. Climate Comparison Mode",
        badges: [
          { text: "Side-by-Side Analysis", color: "dark", icon: "bi-signpost-split" },
          { text: "Mirrored UI", color: "info text-dark", icon: "bi-symmetry-vertical" }
        ],
        content: `
                    <p>By activating the <strong>Compare</strong> toggle in the initial upload zone, you can load a secondary EPW file. This unlocks the dedicated Comparison tab, which renders synchronized, dual-layered visualizations.</p>
                    <p>Compare absolute variables, statistical distributions, wind roses, and sun paths simultaneously to easily contrast two distinct geographic locations or evaluate future climate shift scenarios.</p>
                `
      }
    ]
  },
  {
    id: "help-tab-license",
    icon: "bi-shield-check",
    title: "License & Citations",
    sections: [
      {
        title: "1. Copyleft Provisions",
        badges: [
          { text: "AGPL-3.0 License", color: "primary", icon: "bi-shield-lock" },
          { text: "Open Source", color: "success", icon: "bi-github" }
        ],
        content: `
                    <p>EPW Insights is deployed under the <strong>GNU Affero General Public License v3.0 (AGPL-3.0)</strong>. Any hosted network variant, modification, or code reuse must provide public source access under matching licensing frameworks.</p>
                `
      },
      {
        title: "2. Academic Citations",
        badges: [
          { text: "Research Attribution", color: "dark", icon: "bi-journal-bookmark-fill" }
        ],
        content: `
                    <p>A peer-reviewed article describing the methodology and validation of this platform is currently in preparation. Until publication, please cite the software directly using the DOI available via the <strong>Cite (DOI)</strong> link in the footer, or the metadata provided in <code>CITATION.cff</code>.</p>
                    <p>This section will be updated with the full article citation upon publication.</p>
                `
      }
    ]
  }
];

export function initHelpGuide() {
  const helpModalBody = document.getElementById("help-modal-body");
  if (!helpModalBody) return;

  let navHtml = `<ul class="nav nav-tabs mb-4" id="help-tabs" role="tablist">`;
  HELP_TABS.forEach((tab, index) => {
    const isActive = index === 0 ? 'active' : '';
    navHtml += `
            <li class="nav-item" role="presentation">
                <button class="nav-link ${isActive}" id="${tab.id}-btn" data-bs-toggle="tab" data-bs-target="#${tab.id}-pane" type="button" role="tab">
                    <i class="bi ${tab.icon} me-2"></i>${tab.title}
                </button>
            </li>
        `;
  });
  navHtml += `</ul>`;

  let contentHtml = `<div class="tab-content" id="help-tabs-content">`;
  HELP_TABS.forEach((tab, index) => {
    const isActive = index === 0 ? 'show active' : '';
    contentHtml += `<div class="tab-pane fade ${isActive}" id="${tab.id}-pane" role="tabpanel" tabindex="0">`;

    tab.sections.forEach((section, sIndex) => {
      const isLast = sIndex === tab.sections.length - 1;

      let badgesHtml = `<div class="mb-2">`;
      section.badges.forEach(badge => {
        badgesHtml += `<span class="badge bg-${badge.color} me-1"><i class="bi ${badge.icon} me-1"></i>${badge.text}</span>`;
      });
      badgesHtml += `</div>`;

      contentHtml += `
                <section class="${isLast ? '' : 'mb-4 pb-3 border-bottom'}">
                    <h6 class="fw-bold text-dark mb-2">${section.title}</h6>
                    ${badgesHtml}
                    <div class="text-secondary small lh-base mt-2">${section.content}</div>
                </section>
            `;
    });

    contentHtml += `</div>`;
  });
  contentHtml += `</div>`;

  helpModalBody.innerHTML = navHtml + contentHtml;
}