/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';

export const CHART_INFO_REGISTRY = {
  annualTemperatureHeatmap: {
    title: "Annual Dry Bulb Temperature Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart models the hourly variation of dry-bulb air temperature across a full 365-day calendar year. It visualizes continuous thermal patterns and seasonal shifts using a high-density matrix format.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis tracks the months of the year from January to December. The vertical axis represents the 24 hours of the day. Each rectangular cell corresponds to a single hour of weather data. The cell color maps to the exact temperature value according to the adjacent gradient legend.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>The control panel allows users to change the color palette or reverse its direction to suit different visual preferences. Users can manually adjust the temperature scale domain to highlight specific thermal bands. A dedicated button automatically fits the color scale to the dataset statistical bounds. Hovering over any cell reveals the precise date, time, and temperature value.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Traditional line graphs obscure the daily timing of extreme weather events over a full year. This matrix instantly reveals diurnal temperature swings and seasonal lag. Analysts can easily spot extended heatwaves, prolonged freezing periods, and daily cooling patterns required for sizing mechanical systems or planning natural ventilation.</p>
            </div>
        `
  },

  monthlyTemperatureDistribution: {
    title: "Monthly Temperature Distribution Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart evaluates the statistical spread and variability of hourly dry-bulb temperatures grouped by month and summarized annually. It highlights extreme outliers and central tendencies to quantify local climate volatility.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis divides the data into twelve individual months alongside a final annual summary column. The vertical axis measures temperature in degrees Celsius. Each box illustrates the interquartile range with a horizontal line marking the median and a solid dot indicating the mean. Vertical lines extend to the normal data limits. A triangular marker plots the monthly wet-bulb temperature average.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Users can toggle the visibility of the wet-bulb mean markers and individual scatter points representing outlier hours. Hovering over any monthly box displays a detailed tooltip. This popup lists exact maximum, minimum, median, and mean temperature values for that specific period.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Simple monthly averages mask the severity of local temperature swings. This distribution view exposes the full range of climate behavior. Designers can assess whether a month requires constant mechanical conditioning or if the spread of temperatures allows for natural thermal balancing through mass and passive cooling.</p>
            </div>
        `
  },

  hourlyTemperatureAverages: {
    title: "Hourly Temperature Averages Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart compares the mean diurnal cycle of both dry-bulb and dew-point temperatures across all twelve months. It provides a baseline profile of daily thermal and moisture variations.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The interface organizes the data into a grid of twelve separate charts representing each month. Each individual chart plots the 24-hour day along the horizontal axis and temperature on the vertical axis. A red line traces the average dry-bulb temperature. A blue line tracks the corresponding average dew-point temperature.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Hovering over a specific month highlights the panel and triggers a tooltip. This tooltip displays the overall monthly mean values for both atmospheric metrics. The vertical axes remain fixed to the absolute dataset extremes to allow accurate visual comparison between different seasons.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Observing dry-bulb and dew-point trends simultaneously reveals changing humidity relationships. A tight gap between the two lines indicates high relative humidity and potential condensation risks. A wide gap suggests dry conditions where evaporative cooling strategies might yield high performance.</p>
            </div>
        `
  },
  annualHumidityHeatmap: {
    title: "Annual Relative Humidity Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart models the hourly variation of relative humidity across a full calendar year. It visualizes continuous atmospheric moisture patterns using a high-density matrix format.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis tracks the months of the year. The vertical axis represents the 24 hours of the day. Each rectangular cell corresponds to a single hour of weather data. The cell color maps to the exact humidity percentage according to the adjacent gradient legend.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>The control panel allows users to change the color palette or reverse its direction to suit visual preferences. Users can manually adjust the percentage scale domain to highlight specific moisture bands. A dedicated button automatically fits the color scale to the dataset bounds. Hovering over any cell reveals the precise date, time, and humidity value.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Standard line graphs obscure the daily timing of moisture events over a full year. This matrix instantly reveals diurnal humidity swings and seasonal trends. Analysts can easily spot extended dry spells or prolonged periods of saturation required for sizing mechanical dehumidification systems.</p>
            </div>
        `
  },

  monthlyHumidityDistribution: {
    title: "Monthly Humidity Distribution Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart evaluates the statistical spread and variability of hourly relative humidity grouped by month and summarized annually. It highlights extreme moisture outliers and central tendencies to quantify local climate volatility.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis divides the data into twelve individual months alongside a final annual summary column. The vertical axis measures relative humidity from 0 to 100 percent. Each box illustrates the interquartile range with a horizontal line marking the median and a solid dot indicating the mean. Vertical lines extend to the normal data limits.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Users can toggle the visibility of individual scatter points representing outlier hours in the data tails. Hovering over any monthly box displays a detailed tooltip. This popup lists exact maximum, minimum, median, and mean humidity percentages for that specific period.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Simple monthly averages mask the severity of local humidity swings. This distribution view exposes the full range of moisture behavior. Designers can assess whether a month requires constant mechanical dehumidification or if the spread allows for natural ventilation strategies.</p>
            </div>
        `
  },

  hourlyHumidityAverages: {
    title: "Hourly Averages: Temp & Humidity by Month Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart compares the mean diurnal cycle of dry-bulb temperature against relative humidity across all twelve months. It provides a baseline profile of daily thermal and moisture interactions.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The interface organizes the data into a grid of twelve separate charts representing each month. Each individual chart plots the 24-hour day along the horizontal axis. Dual vertical axes track temperature on the left and humidity percentage on the right. A red line traces the average temperature. A blue line with circular markers tracks the corresponding average relative humidity.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Hovering over a specific month highlights the panel and triggers a tooltip. This tooltip displays the overall monthly mean values for both atmospheric metrics. The vertical axes remain fixed to the absolute dataset extremes to allow accurate visual comparison between different seasons.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Observing temperature and humidity trends simultaneously reveals their inverse relationship. A tight synchronization indicates high condensation risks during nighttime cooling. A wide separation suggests dry conditions where evaporative cooling strategies might yield high performance.</p>
            </div>
        `
  },

  monthlyCloudCoverBands: {
    title: "Monthly Total Cloud Cover Conditions Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart quantifies the percentage of time each month falls into standard meteorological cloud cover categories. It summarizes general sky conditions to evaluate regional solar availability.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis represents the twelve months and a combined annual column. The vertical axis measures total time as a percentage. Stacked color bands construct each column. Each color corresponds to a specific cloud cover classification ranging from completely clear to fully overcast.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Users can toggle the numerical percentage labels inside the colored bands on or off for cleaner visuals. Hovering over a specific segment darkens the active category to isolate it from the surrounding data.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Aggregated solar radiation data does not describe the visual nature of the sky. This categorical breakdown uncovers seasonal cloudiness patterns. Researchers can use it to anticipate the frequency of diffuse sky conditions versus direct sunlight for passive heating and daylighting analysis.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-secondary"><i class="bi bi-bookmark-check me-2"></i>Scientific Basis & Assumptions</h6>
                <p>Please refer directly to the global 'Scientific Basis & Assumptions' section in the application settings panel to review the U.S. National Oceanic and Atmospheric Administration (NOAA) cloud cover categorization standards applied to this dataset calculation.</p>
            </div>
        `
  },

  hourlySkyCoverDistribution: {
    title: "Frequency of Sky Cover by Month Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart breaks down the total annual hours of specific sky cover conditions into detailed 10-percent increments. It provides a high-resolution frequency analysis of localized cloud density.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis defines total sky cover bins in increments of ten percent. The vertical axis tracks the absolute total number of hours. Grouped color bars within each bin represent individual months. The active legend matches specific colors to corresponding months based on the selected seasonal hemisphere.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Users can select specific visible months via checkboxes or toggle a complete annual view. A dropdown menu changes the seasonal color palette applied to the bars to match different geographic hemispheres or visual preferences. Hovering over a bar reveals a tooltip detailing the exact hour counts for that bin and month.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Broad categories often hide the nuanced reality of partial cloud cover. This detailed frequency distribution reveals exact hour counts for specific sky conditions. It helps analysts precisely size photovoltaic arrays and calculate expected daylight autonomy.</p>
            </div>
        `
  },
  annualDniHeatmap: {
    title: "Annual Direct Normal Irradiance Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart maps the hourly intensity of Direct Normal Irradiance (DNI) over a full year. It tracks solar availability by visualizing the raw energy received directly from the sun without atmospheric scattering.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis tracks the calendar months. The vertical axis tracks the 24 hours of the day. Each color-coded cell represents a single hour of radiation data. Darker or cooler colors indicate low or zero solar intensity, while warmer or brighter colors signify peak energy delivery in Watt-hours per square meter (Wh/m²).</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>The left panel provides options to change the color palette or reverse the gradient direction. You can manually type specific minimum and maximum values to narrow the data scale, or use the auto-fit button to match the dataset limits. Hovering over a specific cell reveals the exact DNI, Global Horizontal Irradiance (GHI), and Diffuse Horizontal Irradiance (DHI) values for that hour.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Annual averages obscure the daily timing of solar access. This matrix highlights exact seasonal shifts in direct sunlight. Designers and engineers use this pattern recognition to identify critical solar heating windows and size shading devices effectively.</p>
            </div>
        `
  },

  monthlyRadiationDistribution: {
    title: "Average Monthly Solar Radiation Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart isolates and compares the monthly averages of three primary solar radiation components. It breaks down total solar energy into its direct and diffuse atmospheric states.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The chart displays grouped vertical bars corresponding to each month and a final annual average. Each color represents a distinct irradiance type: Global Horizontal Irradiance (GHI), Direct Normal Irradiance (DNI), and Diffuse Horizontal Irradiance (DHI). The vertical axis measures intensity in Wh/m².</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Checkboxes in the control panel toggle the visibility of individual radiation types. The chart automatically rescales based on your active selections. Hovering over a specific bar triggers a tooltip showing the precise numerical average for that component.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Observing temperature and radiation trends simultaneously uncovers structural characteristics of local solar resources. Understanding this ratio dictates whether direct beam concentration or diffuse horizontal performance is of higher engineering benefit.</p>
            </div>
        `
  },

  averageDailySunHours: {
    title: "Average Daily Sun Hours Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart translates raw solar intensity into practical time metrics. It calculates the average number of viable sunshine hours per day for each month.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis displays individual months followed by an annual summary. The vertical axis measures time in hours. Taller bars indicate months with longer sustained periods of clear, direct sunlight.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Hovering over any individual bar activates a tooltip. This overlay displays both the total accumulated sun hours for that specific month and the exact daily average calculation.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Peak radiation intensity does not always correlate with extended solar availability. This metric establishes a realistic baseline for daylight autonomy. It provides a direct input for estimating the operational hours of active solar thermal and photovoltaic systems.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-secondary"><i class="bi bi-bookmark-check me-2"></i>Scientific Basis & Assumptions</h6>
                <p>This chart filters and counts hours based on the World Meteorological Organization (WMO) standard. It defines a "sun hour" as any period where Direct Normal Irradiance (DNI) exceeds the threshold of 120 Wh/m².</p>
            </div>
        `
  },
  illuminanceHeatmap: {
    title: "Annual Direct Normal Illuminance Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart maps the hourly intensity of <strong>Direct Normal Illuminance (DNI)</strong>, measured in <strong>lux</strong>, across a full 365-day calendar year. DNI represents the amount of visible daylight received per unit area by a surface held perpendicular to the sun's rays. It is a critical metric for daylighting design, calculating Daylight Autonomy (DA), evaluating glare probability, and designing dynamic shading systems.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis displays the months from January to December, and the vertical axis tracks the 24 hours of the day. Each cell represents a specific hour. Brighter or deeper colors indicate higher illuminance levels, typically peaking during clear summer middays. Overcast conditions or winter periods will show significantly muted colors, while nighttime hours remain blank.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>You can customize the visualization using the side panel:
                    <ul>
                        <li><strong>Color Palette:</strong> Switch between sequential scientific interpolators to highlight specific illuminance thresholds.</li>
                        <li><strong>DNI Scale Domain:</strong> Manually cap the minimum and maximum lux values to clip extreme solar peaks and examine low-light performance.</li>
                        <li><strong>Fit to Data:</strong> Automatically optimizes the scale using statistical quantiles (99th percentile) to mitigate the visual distortion of extreme, rare spikes.</li>
                    </ul>
                </p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-secondary"><i class="bi bi-exclamation-triangle me-2"></i>Note on EPW Data Synthesis</h6>
                <p>In the vast majority of international EnergyPlus Weather (EPW) stations, illuminance is not directly measured by physical sensors. Instead, it is mathematically synthesized from measured solar radiation data (watts per square meter) using empirical <strong>Luminous Efficacy Models</strong> (such as the Perez All-Weather Sky model). This calculation factors in atmospheric moisture and solar zenith angles, making it highly reliable and the industry standard for architectural microclimate analysis.</p>
            </div>
        `
  },
  monthlyIlluminanceDistribution: {
    title: "Average Monthly Illuminance Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart provides a macro-level seasonal comparison of daylight availability by averaging hourly illumination data into distinct monthly profiles. It splits visible light into three fundamental components:
                    <ul>
                        <li><strong>Global Horizontal Illuminance (GHI):</strong> The total light falling on a flat horizontal surface from the entire sky dome.</li>
                        <li><strong>Direct Normal Illuminance (DNI):</strong> The direct beam light from the sun's disk.</li>
                        <li><strong>Diffuse Horizontal Illuminance (DHI):</strong> The scattered light from the atmosphere, excluding the direct sun.</li>
                    </ul>
                </p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The chart uses a grouped bar format for each month, alongside a standalone "Annual" benchmark summary. The vertical axis represents illuminance in lux. High GHI relative to DHI suggests a clear sky environment, whereas months where DHI is nearly equal to GHI indicate predominantly cloudy or overcast sky conditions.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Use the control checkboxes or click directly on the interactive legend items below the chart to isolate or hide specific daylight components. The vertical Y-axis dynamically recalibrates its maximum range to prevent visual compression when components are toggled.</p>
            </div>
        `
  },
  zenithLuminanceHeatmap: {
    title: "Annual Zenith Luminance Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This heatmap visualizes the annual distribution of <strong>Zenith Luminance</strong>, measured in <strong>Candelas per square meter (Cd/m²)</strong>. Unlike illuminance (which measures light arriving at a surface), luminance measures the subjective brightness of the sky vault itself directly overhead (at the zenith point). It is an indispensable parameter for advanced lighting engines like Radiance to properly generate CIE standard sky distributions and calibrate interior glare calculations.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>Organized in a matrix of 12 months by 24 hours. This chart explicitly utilizes a strict monochrome/greyscale palette to representationally mirror the physical brightness of the sky dome. Darker cells represent deep, low-luminance clear skies or twilight, while white and bright grey cells represent highly luminous overcast clouds or intense solar positions near the zenith.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-cursor me-2"></i>Interactivity</h6>
                <p>This chart is designed as an analytical overview tool without extensive color modifications to preserve the realism of the sky vault representation. Hovering over any cell triggers an advanced tooltip that outputs the absolute luminance intensity for that specific hour of the year.</p>
            </div>
        `
  },
  interactiveWindRose: {
    title: "Interactive Wind Rose Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This diagram plots the frequency, speed, and direction of wind events over a customized time period. It maps concurrent environmental data to identify the climatic characteristics of prevailing winds.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The chart relies on a polar coordinate system with 16 compass directions. The length of each colored petal indicates the percentage of time the wind blows from that specific angle. Concentric grid rings mark frequency thresholds. The colors within the petals map to either ambient temperature or relative humidity states. Hover over any petal segment to see its exact hour count, percentage of the selected period, and average temperature or humidity.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Use the Season Type and Daily Hours dropdowns to define the analysis window, choosing a preset (Summer, Winter, Occupancy Hours, Daylight Hours, etc.) or a fully custom month and hour range. The Color By radio buttons swap the petal color coding between temperature bands and relative humidity thresholds, while the Display Options toggles control which chart elements (directions, frequency labels, legend, and time span summary) are shown.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Standard wind roses only show speed and direction. By embedding temperature or humidity data directly into the directional petals, this tool pinpoints the source of specific thermal loads.</p>
            </div>
        `
  },

  monthlyWindRoses: {
    title: "Monthly Wind Roses Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This layout visualizes localized wind behavior across all twelve months simultaneously. It breaks down annual wind data to expose seasonal shifts in prevailing directions and velocities.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The interface presents a grid of twelve individual wind roses. Each rose maps 16 compass directions. Petal length represents the percentage of that month's hours falling within each speed and direction bin (not a raw hour count) so months of different lengths remain directly comparable. Color segments within the petals denote different wind speed bins. Hover over any segment to see its exact hour count and percentage of that month.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Global toggle switches located in the side panel allow you to clean up the dense grid layout. You can turn off the repetitive compass direction markers and numerical frequency labels across all twelve charts at once.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Annual wind summaries often mask contradictory seasonal patterns. This side-by-side comparison uncovers critical transitions, validating spatial planning of buildings relative to seasonal wind directions.</p>
            </div>
        `
  },

  averageMonthlyWindSpeed: {
    title: "Average Monthly Wind Speed Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart establishes a baseline statistical summary of wind velocity across the year. It tracks overall air movement intensity to evaluate natural ventilation viability and structural loading.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis lists the twelve months alongside an annual summary. The vertical axis measures wind speed in meters per second (m/s). The height of each bar represents the average wind speed for that specific period.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Hovering over any individual bar activates a data tooltip. This popup reveals the exact calculated mean wind speed and the absolute maximum hourly wind speed recorded during that month.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>While wind roses provide directional context, this chart delivers a clear picture of raw force. Contrasting the mean monthly speed against the maximum tooltip value highlights months prone to severe gusting.</p>
            </div>
        `
  },
  psychrometric: {
    title: "Psychrometric Chart Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart visualizes the thermodynamic properties of moist air by plotting dry-bulb temperature against the humidity ratio. It maps hourly weather data to evaluate thermal comfort and define passive design boundaries.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis tracks dry-bulb temperature in degrees Celsius. The right vertical axis measures the humidity ratio in grams per kilogram. Curved lines represent constant relative humidity limits. Data points or colored heatmaps show the distribution of hourly weather conditions.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Users can toggle between individual data points and density heatmaps. Checkboxes allow the display of specific psychrometric lines like wet-bulb temperature or enthalpy. A radio menu switches between comfort models.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Static weather averages fail to capture extreme thermal variations. This live plotting exposes the exact concentration of hourly conditions. Designers can instantly see what fraction of the year falls within natural comfort thresholds.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-secondary"><i class="bi bi-bookmark-check me-2"></i>Scientific Basis & Assumptions</h6>
                <p>All psychrometric calculations assume a constant sea-level pressure of 101,325 Pa. Comfort indices utilize algorithms specified in ASHRAE 55 and ISO 7730 standards.</p>
            </div>
        `
  },

  bioclimaticFrequency: {
    title: "Bioclimatic Strategies Frequency Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This bar chart quantifies the total annual or seasonal hours where specific passive architectural strategies are effective at achieving thermal comfort.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis represents absolute hour counts. The vertical axis lists specific passive design categories like natural ventilation or thermal mass. Bar lengths visualize the total hours of effectiveness.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Users can apply custom seasonal filters to isolate warm months, cold months, or specific hour blocks. Toggles allow the user to show or hide the raw hour counts.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Translating complex psychrometric geometry into a prioritized list makes the data immediately actionable. It tells engineers exactly which passive systems yield the highest return on investment.</p>
            </div>
        `
  },

  bioclimaticTemporalDistribution: {
    title: "Temporal Distribution Matrix Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This matrix maps the precise chronological occurrence of a selected bioclimatic strategy or data range across a 24-hour cycle and a 12-month calendar.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis tracks the months of the year. The vertical axis tracks the 24 hours of the day. A colored heatmap scale dictates the frequency of occurrence. Darker cells indicate a higher number of days in that month where the selected condition is met.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Clicking on a specific strategy polygon or highlighting an area on the main psychrometric chart instantly regenerates this matrix. Hovering over an individual cell opens a tooltip detailing the exact hour count.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Annual percentage summaries hide operational schedules. This matrix uncovers diurnal applicability window of passive strategies.</p>
            </div>
        `
  },

  sunPath: {
    title: "Annual Sun Path Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This diagram maps the geometric trajectory of the sun across the sky for a specific geographic location over a full year. It overlays localized solar radiation data to correlate geometry with actual energy intensity.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The chart uses a polar coordinate system. The outer perimeter measures the azimuth compass angle. Concentric inner rings measure the altitude above the horizon. Figure-eight analemmas track the sun position at a specific hour across the year, drawn by default as neutral gray curves. Optionally, each analemma can instead be rendered as a continuous color gradient — from the same color scale used for the current-sun marker — so the curve itself encodes irradiance intensity at every point along the year, with a dedicated color-scale legend shown below the chart.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Date and time sliders manipulate the exact position of the interactive sun icon. The "Color Analemmas by Irradiance" toggle switches the hourly analemma curves between the default gray lines and the irradiance-colored variant. Radio buttons switch the irradiance data mapping between direct normal, global horizontal, and diffuse horizontal radiation — this selection drives both the current-sun marker's color and, when enabled, the analemma color-coding.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Connecting raw atmospheric weather data directly to solar geometry exposes the actual energy potential of specific building orientations. Designers can differentiate between a sun position that delivers harsh direct heat and one blocked by typical local cloud cover. With irradiance-colored analemmas enabled, high- and low-intensity stretches along each hourly path become visually apparent at a glance, making it easier to spot seasonal irradiance peaks and troughs without having to step through the sliders hour by hour.</p>
            </div>
        `
  },
  mrtHeatmap: {
    title: "Mean Radiant Temperature (MRT) Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart maps the hourly Mean Radiant Temperature over a full calendar year. It quantifies the total heat exchange between a human body and the surrounding thermal environment, accounting for both shortwave solar exposure and longwave sky radiation.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis tracks the months of the year. The vertical axis represents the 24 hours of the day. Each rectangular cell corresponds to a single hour. Cell colors indicate the exact radiant temperature mapped to the adjacent numeric gradient legend.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Users can activate urban context settings to apply street canyon aspect ratios, sky view factors, and direct shading limitations. Adjusting these parameters forces the matrix to recalculate.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Air temperature alone poorly predicts outdoor comfort under direct sun. This heatmap exposes extreme radiant load periods. Analysts use these patterns to pinpoint the exact times of year when shade structures or trees offer the highest benefit.</p>
            </div>
        `
  },

  mrtDistribution: {
    title: "Monthly MRT Distribution Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart evaluates the statistical spread of hourly Mean Radiant Temperature grouped by month. It summarizes radiation extremes and central tendencies to help users understand seasonal thermal volatility.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis divides data into individual months and provides a final annual summary. Each boxplot indicates the interquartile range with its median line and mean dot, showing thermal variance.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Hovering your cursor over a specific boxplot triggers a tooltip. This overlay reveals the exact maximum, minimum, median, and mean temperatures calculated for that month.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Monthly averages often mask the severity of peak radiant loads. Boxplots reveal the true frequency and intensity of extreme radiation events. Designers rely on this distribution data to correctly size exterior shading devices.</p>
            </div>
        `
  },

  utciHeatmap: {
    title: "Universal Thermal Climate Index (UTCI) Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart visualizes outdoor thermal stress using the UTCI model. It maps the combined physiological effects of air temperature, radiant heat, wind speed, and humidity on the human body across the year.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>Based on the selected view, cell colors map either to standard UTCI stress categories ranging from Extreme Cold to Extreme Heat, or to a continuous numeric temperature scale.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Users can select the heatmap type (categorical vs numeric). Selecting custom hours or months immediately updates the complementary analytical frequencies.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>The chart evaluates the biological stress distribution, informing landscaping and architectural design of public open spaces.</p>
            </div>
        `
  },

  utciFrequency: {
    title: "UTCI Category Frequency Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart shows the total frequency and annual/seasonal percentage of different physiological thermal stress zones in the outdoor environment.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The columns display distinct stress levels. Height represents the number of hours. Emoticons represent physiological stress from freezing to extreme heat.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Filtering by month and daily hours automatically isolates specific occupancy times, immediately updating the cumulative comfort percentage.</p>
            </div>
        `
  },

  utciDistribution: {
    title: "Monthly UTCI Distribution Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart provides a statistical boxplot distribution of outdoor comfort stress (UTCI) grouped by month to evaluate climate volatility.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The vertical axis shows the temperature scale. Box heights represent the central 50% of the dataset. Caps represent the extrema.</p>
            </div>
        `
  },

  setHeatmap: {
    title: "Standard Effective Temperature (SET) Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart visualizes the Standard Effective Temperature (SET) using the Gagge Two-Node Model, accounting for human metabolism and clothing factors.</p>
            </div>
        `
  },

  setDistribution: {
    title: "Monthly SET Distribution Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart provides a statistical distribution of SET values across months, reflecting seasonal thermal comfort for specific clothing and metabolic rates.</p>
            </div>
        `
  },

  compareOverview: {
    title: "Climate Comparison Overview Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This infographic compares geography, elevation, solar radiation, temperature, and wind trends between two locations side-by-side.</p>
            </div>
        `
  },

  compareTempDistribution: {
    title: "Monthly Temp Distribution Comparison Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This boxplot compares the monthly temperature distributions of two locations side-by-side to highlight differences in thermal spread.</p>
            </div>
        `
  },

  compareTempDiurnal: {
    title: "Diurnal Temp Comparison Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart compares the average diurnal dry-bulb and dew-point temperature profiles of two locations by month.</p>
            </div>
        `
  },

  compareRHDistribution: {
    title: "Monthly Humidity Distribution Comparison Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This boxplot compares monthly relative humidity distributions between two locations side-by-side.</p>
            </div>
        `
  },

  compareRHDiurnal: {
    title: "Diurnal RH Comparison Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart compares the average diurnal relative humidity profiles of two locations month by month.</p>
            </div>
        `
  },

  compareCloudCover: {
    title: "Monthly Total Cloud Cover Comparison Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart compares monthly total sky cover categories side-by-side using stacked column distributions.</p>
            </div>
        `
  },

  compareWindRose: {
    title: "Wind Rose Comparison Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This diagram compares wind speed, direction, and meteorological frequency of two locations side-by-side for a specific timeframe.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>Each location is drawn as its own 16-direction polar rose, scaled independently to its own data, read the percentage labels on the grid rings, rather than raw petal length, when comparing the two sites directly. Petal color maps to average temperature or relative humidity. Hover over any petal segment to see its exact hour count, percentage of the period, and average temperature or humidity. Because the two locations can sit in different hemispheres, "Summer" and "Winter" presets are resolved independently for each site, and the summary line below the charts reports the covered hours and percentage for each location separately.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Use the Season Type and Daily Hours dropdowns to define a shared analysis window for both locations, choosing a preset (Summer, Winter, Occupancy Hours, Daylight Hours, etc.) or a fully custom month and hour range. The Color By radio buttons swap the petal color coding between temperature bands and relative humidity thresholds, while the Display Options toggles control which chart elements (directions, frequency labels, legend, and time span summary) are shown.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Placing both wind roses under the same filters exposes differences in prevailing direction, calm periods, and speed distribution that a purely numeric comparison would obscure, useful for evaluating natural ventilation potential or site-specific wind loading across candidate locations.</p>
            </div>
        `
  },

  compareWindSpeed: {
    title: "Monthly Wind Speed Comparison Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This bar chart compares average monthly and annual wind speeds of two locations side-by-side.</p>
            </div>
        `
  },

  compareSolarRadiation: {
    title: "Monthly Solar Radiation Comparison Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This bar chart compares average monthly GHI, DNI, and DHI solar component values of two locations side-by-side.</p>
            </div>
        `
  },
  compareIlluminance: {
    title: "Monthly Illuminance Comparison Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This bar chart compares average monthly Global Horizontal, Direct Normal, and Diffuse Horizontal illuminance values (lux) of two locations side-by-side, helping assess relative daylight availability between sites.</p>
            </div>
        `
  },

  compareSunPath: {
    title: "Sun Path Comparison Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart renders two full-year solar path diagrams side-by-side, one per location, so their sun geometry and irradiance profiles can be directly compared under the same time selection.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>Each polar diagram follows the same convention: azimuth around the perimeter, altitude on the concentric rings, and figure-eight hourly analemmas by default drawn as neutral gray curves. Optionally, both diagrams' analemmas can be switched to an irradiance-colored variant using a shared color scale, so the two locations' color intensities remain directly comparable; a single color-scale legend below the charts applies to both. A day/night bar under the sliders shows, for each location, which portion of the selected day is daylight versus night in its own local time. A comparison table below the diagrams lists sunrise, sunset, altitude, azimuth, hour angle, and DNI/DHI/GHI values for both locations side-by-side.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Date and time sliders apply the selected time as local time to both locations simultaneously. The "Color Analemmas by Irradiance" toggle switches both diagrams' analemmas together between gray and irradiance-colored lines. Radio buttons switch the irradiance data mapping between direct normal, global horizontal, and diffuse horizontal radiation, updating both diagrams and the comparison table at once.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Placing two locations' sun paths on a shared irradiance color scale makes it possible to see, at a single glance, which site receives more intense solar exposure at the same hour and season — useful for comparing shading strategies, façade orientations, or site selection between climates.</p>
            </div>
        `
  },

  extremePeakCalendar: {
    title: "Extreme and Peak Events Calendar Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This calendar grid translates raw hourly weather data into a full-year, day-by-day map of extreme and peak building conditioning events. It compresses 8,760 hours of climate data into a single glanceable view of when critical conditions occur.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>Twelve monthly grids are arranged in a four-column, three-row layout. Each cell represents a single day. A colored cell indicates the highest-priority active index for that day; small dots in the corner mark additional simultaneous events. Grey cells indicate no active index was recorded on that day.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>The sidebar checklist, grouped by category, toggles which indices appear on the calendar and in its legend. Clicking any day cell selects it as the active day for the Hourly Climate Profile, Thermal Demand Profile, and Duration Curve below, allowing immediate deeper inspection of that date.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Clustering patterns become immediately visible, such as heatwaves concentrated in a specific month or repeated cold snaps at season boundaries. Designers can quickly locate the exact day responsible for a peak design load and open it directly for detailed hourly analysis.</p>
            </div>
        `
    },

  hourlyClimateProfile: {
    title: "Hourly Environmental Climate Profile Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart plots two paired hourly climate variables across a single 24-hour day, letting users examine how they rise and fall together on a specific date of interest, typically a day flagged by the calendar above.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis tracks the 24 hours of the selected day. A solid line traces the primary variable against the left axis; a dashed line traces the secondary variable against the right axis. Each axis is independently scaled to its own variable's range.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>A dropdown menu switches between four variable pairings: Dry Bulb & Relative Humidity, Dew Point & Relative Humidity, Dry Bulb & Solar Radiation, and Solar Radiation & Relative Humidity. Selecting a different day on the calendar above automatically updates this chart to that date.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Pairing variables on a shared timeline exposes timing relationships that daily summaries hide, such as a lag between peak temperature and peak humidity, or the inverse relationship between solar radiation and cloud-driven humidity swings. This helps pinpoint the exact hours of greatest occupant discomfort on extreme days.</p>
            </div>
        `
    },

  hourlyThermalDemandComfort: {
    title: "Hourly Thermal Demand & Comfort Profile Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This profile overlays a single day's temperature trace against user-defined heating/cooling base temperatures and a comfort band, quantifying how far and how long conditions depart from a building's passive thermal balance point.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The black line traces hourly temperature (dry bulb or Sol-Air, per the selected method) across 24 hours. The shaded red area above the cooling base line and the shaded blue area below the heating base line represent cooling and heating demand intensity in degree-hours. The green band marks the user-defined comfort range.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Heating/cooling base temperatures and comfort min/max bounds are all directly editable. A calculation method toggle switches the underlying temperature trace between Simple (Dry Bulb) and Sol-Air. Individual show/hide toggles control the visibility of base temperature lines, demand surfaces, and the comfort band.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>This view quantifies the magnitude and duration of thermal stress on a building's worst day, directly informing HVAC sizing decisions. Toggling the calculation method or adjusting base temperatures lets designers test how sensitive demand estimates are to underlying assumptions.</p>
            </div>
        `
    },

  temperatureDurationCurve: {
    title: "Temperature Duration Curve Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This curve sorts every hourly temperature reading in a period from highest to lowest, showing the cumulative number of hours a given temperature threshold is met or exceeded. It reframes the annual or monthly climate record as a load-duration profile rather than a chronological timeline.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis represents cumulative hours exceeded; the vertical axis is temperature. Colored horizontal bands classify the temperature range into severity zones, from Extreme Cold through Heating Demand, Comfort/Transition, Cooling Demand, and Extreme Heat, based on the current base temperatures.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>A period selector switches the curve between the full annual record and any individual month. Heating/cooling base temperatures shift the band boundaries directly. The calculation method toggle (Simple or Sol-Air) in the settings panel above also determines which temperature trace feeds this curve.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Unlike peak-day charts that show instantaneous extremes, this curve quantifies how many hours per year fall into each demand band, directly supporting equipment capacity versus runtime trade-offs. A steep curve near the extremes indicates brief, intense loads; a flatter curve indicates sustained, moderate loads across many hours.</p>
            </div>
        `
    },

  materialSurfaceHeatmap: {
    title: "Material Surface Temperature Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart models the hourly exterior surface temperature of the selected building material across a full calendar year, using an instantaneous (zero thermal mass) sol-air heat balance between absorbed solar radiation, longwave radiative loss to the sky, and convective exchange with outdoor air. It highlights which materials, orientations, and seasons push a facade or roof surface toward overheating.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis tracks the months of the year. The vertical axis represents the 24 hours of the day. Each cell corresponds to a single hour and is colored according to either the absolute surface temperature or the temperature difference between surface and air, depending on the selected display mode. Cells outlined in magenta mark hours where the surface temperature meets or exceeds the configured critical threshold.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>The sidebar lets users pick a material preset (or enter custom absorptance and emissivity values), set the surface tilt, azimuth, sky view factor and ground albedo, and switch between absolute temperature and delta-T display modes. The critical threshold field controls which hours get the magenta overheating outline. Hovering over any cell reveals the exact date, time, surface temperature, air temperature, delta-T, incident solar radiation, and wind speed for that hour.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Because the underlying calculation has no thermal mass, this view represents the fastest-responding, worst-case surface temperature a material could reach at each hour, useful for comparing the relative passive performance of different claddings (for example, a dark asphalt paving against a light concrete finish) before any damping from mass is considered. Clusters of magenta-outlined cells reveal which months and times of day are most likely to cause overheating or thermal discomfort at the surface, and how sensitive that risk is to absorptance, emissivity, and orientation choices.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-bookmark-check me-2"></i>Scientific Basis & Assumptions</h6>
                <p>Please refer to the "Scientific Basis & Assumptions" section in this tab's settings panel for the heat balance formulation, the convective coefficient model, and the simplifications involved.</p>
            </div>
        `
  },

  materialSurfaceDistribution: {
    title: "Monthly Material Surface Temp Distribution Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This boxplot summarizes the statistical spread of the hourly surface temperature (or surface-to-air delta-T) calculated for the selected material, grouped by month with a final annual summary column. It condenses the same underlying hourly data as the heatmap above into a form better suited to comparing central tendency and variability across the year.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis lists the twelve months plus an annual summary box. The vertical axis is temperature (or delta-T) in degrees Celsius. Each box spans the interquartile range (25th to 75th percentile), with a horizontal line marking the median and a solid dot marking the mean. Whiskers extend to 1.5 times the interquartile range, clipped to the actual minimum and maximum values recorded that month.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>This chart follows the same material, mode, and geometry settings selected in the sidebar as the heatmap above; changing them and re-simulating updates both charts together. Hovering over any box reveals a tooltip with that month's maximum, median, mean, and minimum values.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>A tall box or long whisker in a given month signals a wide range of surface conditions, often driven by variable cloud cover or wind, while a narrow box indicates a consistently predictable surface temperature. Comparing the annual box against individual months quickly shows which season dominates the yearly extremes, which is useful when deciding whether a material choice needs to be evaluated primarily against summer peak conditions or against year-round variability.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-bookmark-check me-2"></i>Scientific Basis & Assumptions</h6>
                <p>Please refer to the "Scientific Basis & Assumptions" section in this tab's settings panel for the heat balance formulation, the convective coefficient model, and the simplifications involved.</p>
            </div>
        `
  },

  thermalMassEffect: {
    title: "Thermal Mass Effect Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart isolates the effect that thermal mass has on a material's temperature response by comparing the instantaneous, zero-mass sol-air temperature against the actual outer and inner surface temperatures produced by the transient finite-difference model. It visualizes how much a material's thickness, density, and conductivity delay and dampen the swing between outdoor air and the surfaces on either side of it.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis represents the hour of the day, from 1 to 24. The vertical axis is temperature in degrees Celsius. The blue line is the average outdoor air temperature, the dashed red line is the zero-mass sol-air temperature, the yellow line is the outer (exterior-facing) surface of the material as computed by the mass model, and the green line is the inner (room-facing) surface. The caption beneath the chart lists the thickness, density, specific heat, conductivity, absorptance, emissivity, tilt, and azimuth used to generate the curves.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>The month filter in the sidebar restricts all four curves to a single month or shows the full annual average; the thickness, density, specific heat, and conductivity fields (or a mass preset) redefine the material and require re-running the simulation to update the chart.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>The horizontal offset between the sol-air peak and the inner surface peak is the time lag reported in the KPI cards above the chart, and the shrinkage in amplitude between the two curves is the decrement factor. A material that flattens and delays the inner surface line well behind the outdoor swing is effectively buffering the space from outdoor extremes, which is the core justification for using thermal mass in passive design; a material whose inner line closely tracks the sol-air line offers little buffering benefit.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-bookmark-check me-2"></i>Scientific Basis & Assumptions</h6>
                <p>Please refer to the "Scientific Basis & Assumptions" section in this tab's settings panel for the finite-difference formulation, stability control, and boundary condition assumptions behind these curves.</p>
            </div>
        `
  },

  transientHeatTransfer: {
    title: "Transient Heat Transfer Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This heatmap exposes the inner workings of the finite-difference thermal mass model by tracking the temperature at each of its 10 discrete depth nodes across the material's thickness, hour by hour through the day. It shows how a thermal wave launched at the exterior surface travels inward, losing amplitude and gaining delay as it goes.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis is the hour of the day. The vertical axis is depth through the material, from the outer (exterior-facing) node at the top to the inner (room-facing) node at the bottom, labeled with their distance in meters. Each cell's color is the average temperature of that node at that hour, mapped through the gradient legend on the right.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>The month filter in the sidebar restricts the averaging to a single month or the full year. Hovering over any cell reveals the exact hour, depth, node index, and temperature at that point in the material.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Diagonal color bands moving from the top of the chart toward the bottom over the course of the day are a direct visualization of the time lag: the deeper the node, the later in the day it reaches its peak temperature. A thick or dense material stretches these bands out and reduces their color contrast between top and bottom, while a thin or lightweight material lets the surface temperature swing pass through with little delay or damping.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-bookmark-check me-2"></i>Scientific Basis & Assumptions</h6>
                <p>Please refer to the "Scientific Basis & Assumptions" section in this tab's settings panel for the finite-difference formulation, stability control, and boundary condition assumptions behind these node temperatures.</p>
            </div>
        `
  },

  diurnalHeatFlux: {
    title: "Diurnal Heat Flux Guide",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart converts the mass model's surface temperatures into actual heat flow rates, in watts per square meter, at both faces of the material. It translates the temperature curves seen elsewhere in this tab into the quantity that ultimately drives heating and cooling loads.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis is the hour of the day. The vertical axis is heat flux in W/m², with a dashed zero line for reference. The dashed red line is the external convective flux between the outdoor sol-air temperature and the material's outer node; the solid blue line is the internal convective flux between the material's inner node and the fixed indoor air temperature. Positive values above the zero line represent heat gain (a contribution to cooling load) and negative values below it represent heat loss (a contribution to heating load), as noted directly on the chart.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>The month filter in the sidebar restricts the averaging to a single month or the full year, and the caption beneath the chart lists the material properties used to generate the two curves.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>The gap between the external and internal flux lines, and the delay between when each one crosses zero, reflects how much of the day's solar gain is being stored and released by the material rather than passed straight through. A large midday external gain paired with a small, delayed internal gain in the evening indicates a material that is effectively shifting cooling load away from peak hours, which is often the practical goal of specifying thermal mass in a facade or roof assembly.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-bookmark-check me-2"></i>Scientific Basis & Assumptions</h6>
                <p>Please refer to the "Scientific Basis & Assumptions" section in this tab's settings panel for the convective coefficient model and boundary condition assumptions behind these flux values.</p>
            </div>
        `
  },

  monthlyMorphingComparison: {
    title: "Monthly Mean Temperature: Baseline vs. Projected",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart compares the recorded monthly mean dry-bulb temperature of the uploaded file against the projected value for the selected SSP scenario and target year, computed via the Shift+Stretch morphing method on the resolved CMIP6 grid cell.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis lists the twelve months of the year. The blue line is the baseline value taken directly from the uploaded file. The red line is the projected value after Shift+Stretch is applied. The shaded red band around the projected line reflects the inter-ensemble-member spread (standard deviation of Δtas) for this grid cell, not a formal confidence interval.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>The sidebar scenario selector and target year segmented control jointly determine the monthly delta applied; the CMIP6 grid cell is resolved automatically from the station's coordinates. Hovering over a baseline point shows its exact value; hovering over a projected point also shows the inter-ensemble-member spread for that month.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-bookmark-check me-2"></i>Scientific Basis & Assumptions</h6>
                <p>Please refer to the "Scientific Basis & Assumptions" section in this tab's settings panel for full detail on the Shift+Stretch method, data source, baseline period, and interpretation limits.</p>
            </div>
        `
  },

  temperatureDurationMorphing: {
    title: "Annual Temperature Duration Curve: Baseline vs. Projected",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart sorts every hourly dry-bulb temperature in the file in descending order, comparing the baseline recorded profile against the morphed projected profile as a whole-year duration curve.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The horizontal axis represents the number of hours in the year that a temperature is equalled or exceeded. The vertical axis is temperature. The gap between the blue baseline curve and the red projected curve at any point shows how many more, or fewer, hours are expected at that thermal severity under the selected scenario and year.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Hovering anywhere on the chart reveals the exact baseline and projected temperature at that duration. The curve updates automatically with the sidebar's scenario and target year selections.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-lightbulb me-2"></i>Analytical Insights</h6>
                <p>Because Shift+Stretch also scales the diurnal anomaly, the curve is not a simple upward translation of the baseline; its shape can change slightly with the diurnal-range delta. Use this view to gauge the change in the number of extreme hot or cold hours per year, not fine-grained day-to-day timing.</p>
            </div>
        `
  },

  hddCddMorphingComparison: {
    title: "Monthly Heating & Cooling Degree-Days: Baseline vs. Projected",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This chart quantifies the practical heating and cooling load impact of the projected temperature change by comparing monthly Heating Degree-Days (HDD) and Cooling Degree-Days (CDD) between the baseline file and the morphed projection.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>Each month shows four bars: baseline and projected CDD (warm tones), and baseline and projected HDD (cool tones). Degree-days are calculated against the heating and cooling base temperatures set in the sidebar. Larger projected CDD bars indicate greater expected cooling demand; smaller projected HDD bars indicate reduced heating demand.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>Adjusting the heating and cooling base temperatures in the sidebar recalculates all four series. Hovering over any bar shows its exact degree-day value for that month.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-bookmark-check me-2"></i>Scientific Basis & Assumptions</h6>
                <p>Degree-days are derived using the same daily mean-temperature method used in the Peak Conditions & Thermal Analysis tab. Please refer to this tab's "Scientific Basis & Assumptions" section for the Shift+Stretch method's data source and interpretation limits.</p>
            </div>
        `
  },

  cmip6BenchmarkComparison: {
    title: "Independent Benchmark: EPW-Derived vs. Official CMIP6 Indices",
    body: `
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-info-circle me-2"></i>Definition & Purpose</h6>
                <p>This panel cross-checks the EPW-derived deltas for four indices (Frost Days, Tropical Nights, Cooling Degree-Days, Heating Degree-Days) against the official CMIP6 index deltas for the same grid cell, as an independent sanity check on the Shift+Stretch morphing output. It also lists four CMIP6-only indices (TX35, TX40, TXx, TNn) that have no matching EPW-side calculation yet.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-eye me-2"></i>How to Read</h6>
                <p>The dumbbell chart shows one row per comparable index, each with its own independent horizontal scale since day counts and degree-days use different units. The blue dot is the EPW-derived delta; the purple dot is the official CMIP6 delta. The thin connecting line simply links the two independent estimates and is not an error bar. The table below repeats these values numerically and adds the four CMIP6-only reference rows.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-sliders me-2"></i>Interactive Controls</h6>
                <p>The chart and table update automatically with the sidebar's scenario, target year, and base temperature selections. Hovering over a dot shows its exact value and label.</p>
            </div>
            <div class="chart-info-section">
                <h6 class="info-section-title text-primary"><i class="bi bi-bookmark-check me-2"></i>Scientific Basis & Assumptions</h6>
                <p>Some spread between the EPW-derived and official CMIP6 values is expected and is not a sign of a calculation error: the EPW-derived values come from a single parametric transform applied to one synthetic/typical year, while the CMIP6 values are computed natively from the full daily-resolution model ensemble. The CDD/HDD comparison is order-of-magnitude only, since the official CMIP6 indices use their own fixed base temperature rather than the configurable one set in this tab.</p>
            </div>
        `
  }
};

export function getOrCreateGlobalModal() {
  let modalElem = document.getElementById('chart-info-modal');
  if (!modalElem) {
    const modalHtml = `
            <div class="modal fade" id="chart-info-modal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="chart-info-modal-title">Chart Information</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body" id="chart-info-modal-body"></div>
                    </div>
                </div>
            </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    modalElem = document.getElementById('chart-info-modal');
  }
  return new window.bootstrap.Modal(modalElem);
}

export function addInfoButton(containerSelector, chartKey) {
  const container = d3.select(containerSelector);
  if (container.empty() || container.select('.info-button').size() > 0) return;

  const infoData = CHART_INFO_REGISTRY[chartKey];
  if (!infoData) return;

  container.classed('has-chart-actions', true);

  const button = container.append('button')
    .attr('type', 'button')
    .attr('class', 'info-button')
    .attr('aria-label', `Chart info: ${infoData.title}`)
    .attr('title', `Chart info: ${infoData.title}`)
    .attr('data-bs-toggle', 'tooltip')
    .attr('data-bs-placement', 'bottom')
    .on('click', function () {
      const modalInstance = getOrCreateGlobalModal();
      document.getElementById('chart-info-modal-title').innerText = infoData.title;
      document.getElementById('chart-info-modal-body').innerHTML = infoData.body;
      modalInstance.show();
    });

  button.append('i')
    .attr('class', 'bi bi-info-circle-fill')
    .attr('aria-hidden', 'true');

  if (window.bootstrap && window.bootstrap.Tooltip) {
    new window.bootstrap.Tooltip(button.node());
  }
}