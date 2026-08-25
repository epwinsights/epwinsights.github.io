/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';
import { formatLocationName } from '../core/location-formatter.js';
import { countryCodeMap } from '../core/location-formatter.js';

export function displayLocationSummary(epwData, toggleEditorVisibility) {
  const summarySection = document.getElementById('summary-content');
  if (!summarySection || !epwData || !epwData.metadata || !epwData.metadata.location) {
    console.error('Could not find summary section or location data.');
    return;
  }

  const location = epwData.metadata.location;
  const data = epwData.data;
  if (data.length === 0) {
    summarySection.innerHTML = '<p class="text-danger">No hourly data found to calculate summary.</p>';
    return;
  }

  const countryCode = countryCodeMap[location.country];
  let flagHtml = '';
  if (countryCode) {
    flagHtml = `<img src="https://flagcdn.com/48x36/${countryCode}.png" alt="${location.country} flag" style="margin-right: 10px; height: 24px;">`;
  }

  const formattedLocation = formatLocationName(location.city, location.country, 'primary');

  const tempSum = d3.sum(data, d => d.dryBulbTemperature);
  const humiditySum = d3.sum(data, d => d.relativeHumidity);
  const radiationSum = d3.sum(data, d => d.globalHorizontalRadiation);
  const windSpeedSum = d3.sum(data, d => d.windSpeed);

  const avgTemp = (tempSum / data.length).toFixed(1);
  const avgHumidity = (humiditySum / data.length).toFixed(0);
  const totalRadiationKWh = (radiationSum / 1000).toFixed(0);
  const avgWindSpeed = (windSpeedSum / data.length).toFixed(1);

  summarySection.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
             <div class="d-flex align-items-center">
                ${flagHtml}
                <div class="summary-title">${formattedLocation}</div>
                <button id="inline-edit-location-btn" class="btn btn-link p-0 ms-2 text-secondary" title="Customize Location Names" style="line-height: 0; transition: color 0.2s;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-pencil-square" viewBox="0 0 16 16">
                        <path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z"/>
                        <path fill-rule="evenodd" d="M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a1.5 1.5 0 0 0-1.5-1.5z"/>
                    </svg>
                </button>
             </div>
             <div class="summary-wmo">WMO: ${location.wmoStationNumber}</div>
        </div>
        <div class="summary-grid">
            <div class="summary-item">
                <img src="/img/coordinates.png" alt="Coordinates" class="summary-icon">
                <div>
                    <span class="label">Coordinates</span>
                    <span class="value">${location.latitude.toFixed(2)}°, ${location.longitude.toFixed(2)}°</span>
                </div>
            </div>
            <div class="summary-item">
                <img src="/img/elevation.png" alt="Elevation" class="summary-icon">
                <div>
                    <span class="label">Elevation</span>
                    <span class="value">${location.elevation.toFixed(0)} m</span>
                </div>
            </div>
             <div class="summary-item">
                <img src="/img/temperature.png" alt="Temperature" class="summary-icon">
                <div>
                    <span class="label">Average Dry Bulb Temperature</span>
                    <span class="value">${avgTemp} °C</span>
                </div>
            </div>
            <div class="summary-item">
                <img src="/img/humidity.png" alt="Humidity" class="summary-icon">
                <div>
                    <span class="label">Average Relative Humidity</span>
                    <span class="value">${avgHumidity} %</span>
                </div>
            </div>
            <div class="summary-item">
                <img src="/img/radiation.png" alt="Radiation" class="summary-icon">
                <div>
                    <span class="label">Annual Solar Energy</span>
                    <span class="value">${totalRadiationKWh} kWh/m²</span>
                </div>
            </div>
            <div class="summary-item">
                <img src="/img/wind.png" alt="Wind" class="summary-icon">
                <div>
                    <span class="label">Average Wind Speed</span>
                    <span class="value">${avgWindSpeed} m/s</span>
                </div>
            </div>
        </div>
    `;

  const editBtn = document.getElementById('inline-edit-location-btn');
  if (editBtn) {
    editBtn.addEventListener('click', toggleEditorVisibility);
    editBtn.addEventListener('mouseenter', () => editBtn.classList.replace('text-secondary', 'text-primary'));
    editBtn.addEventListener('mouseleave', () => editBtn.classList.replace('text-primary', 'text-secondary'));
  }
}