/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import * as d3 from 'd3';

export const ThermalMassSketch = {
  svg: null,
  width: 760,
  height: 320,
  animationIntervals: [],

  groupStyles: {
    "Masonry/Brick": { fill: "#d84315", pattern: "url(#pattern-brick)" },
    "Masonry/Concrete Block": { fill: "#b0bec5", pattern: "url(#pattern-dots)" },
    "Concrete": { fill: "#90a4ae", pattern: "url(#pattern-dots)" },
    "Plaster/Gypsum": { fill: "#f5f5f5", pattern: "none" },
    "Metals": { fill: "url(#grad-metal)", pattern: "none" },
    "Glass": { fill: "#e3f2fd", pattern: "none", opacity: 0.7 },
    "Stone/Tile": { fill: "#a1887f", pattern: "url(#pattern-stone)" },
    "Wood": { fill: "#8d6e63", pattern: "url(#pattern-wood)" },
    "Roofing Membrane": { fill: "#424242", pattern: "none" },
    "Acoustic/Ceiling Tile": { fill: "#fafafa", pattern: "url(#pattern-dots)" },
    "Textile/Carpet": { fill: "#00796b", pattern: "url(#pattern-weave)" },
    "Insulation": { fill: "#fff9c4", pattern: "url(#pattern-wave)" },
    "Cement Board": { fill: "#bdbdbd", pattern: "none" },
    "default": { fill: "#cccccc", pattern: "none" }
  },

  init: function (containerId) {
    const container = d3.select(containerId);
    if (container.empty()) return;
    container.html("");

    this.svg = container.append("svg")
      .attr("viewBox", `0 0 ${this.width} ${this.height}`)
      .attr("width", "100%")
      .attr("height", "100%")
      .style("background-color", "#ffffff")
      .style("border-radius", "8px");

    const defs = this.svg.append("defs");
    this._buildDefs(defs);
    this._buildStaticLayout();
  },

  _buildDefs: function (defs) {
    defs.append("marker").attr("id", "arrow-sun-mass").attr("viewBox", "0 0 10 10").attr("refX", "8").attr("refY", "5")
      .attr("markerWidth", "6").attr("markerHeight", "6").attr("orient", "auto-start-reverse")
      .append("path").attr("d", "M 0 1 L 10 5 L 0 9 z").attr("fill", "#ffb300");

    defs.append("marker").attr("id", "arrow-reflect-mass").attr("viewBox", "0 0 10 10").attr("refX", "0").attr("refY", "5")
      .attr("markerWidth", "6").attr("markerHeight", "6").attr("orient", "auto-start-reverse")
      .append("path").attr("d", "M 0 1 L 10 5 L 0 9 z").attr("fill", "#ffd54f");

    defs.append("marker").attr("id", "arrow-cond-bg").attr("viewBox", "0 0 12 12").attr("refX", "9").attr("refY", "6")
      .attr("markerWidth", "5").attr("markerHeight", "5").attr("orient", "auto")
      .append("path").attr("d", "M 0 1 L 12 6 L 0 11 z").attr("fill", "#ffffff");

    defs.append("marker").attr("id", "arrow-cond").attr("viewBox", "0 0 10 10").attr("refX", "8").attr("refY", "5")
      .attr("markerWidth", "4").attr("markerHeight", "4").attr("orient", "auto")
      .append("path").attr("d", "M 0 1 L 10 5 L 0 9 z").attr("fill", "#d32f2f");

    const wave = defs.append("pattern").attr("id", "pattern-wave").attr("width", "20").attr("height", "20").attr("patternUnits", "userSpaceOnUse");
    wave.append("path").attr("d", "M 0 10 Q 5 0 10 10 T 20 10").attr("fill", "none").attr("stroke", "#fbc02d").attr("stroke-width", "2");

    const dots = defs.append("pattern").attr("id", "pattern-dots").attr("width", "10").attr("height", "10").attr("patternUnits", "userSpaceOnUse");
    dots.append("circle").attr("cx", "2").attr("cy", "2").attr("r", "1").attr("fill", "rgba(0,0,0,0.1)");
    dots.append("circle").attr("cx", "7").attr("cy", "7").attr("r", "1.5").attr("fill", "rgba(0,0,0,0.15)");

    const brick = defs.append("pattern").attr("id", "pattern-brick").attr("width", "20").attr("height", "20").attr("patternUnits", "userSpaceOnUse");
    brick.append("rect").attr("width", "20").attr("height", "20").attr("fill", "none");
    brick.append("path").attr("d", "M 0 10 L 20 10 M 10 0 L 10 10 M 0 10 L 0 20 M 20 10 L 20 20").attr("stroke", "rgba(255,255,255,0.3)").attr("stroke-width", "1");

    const wood = defs.append("pattern").attr("id", "pattern-wood").attr("width", "10").attr("height", "40").attr("patternUnits", "userSpaceOnUse");
    wood.append("path").attr("d", "M 3 0 L 3 40 M 7 0 L 7 40").attr("stroke", "rgba(0,0,0,0.1)").attr("stroke-width", "0.5");

    const metalGrad = defs.append("linearGradient").attr("id", "grad-metal").attr("x1", "0%").attr("y1", "0%").attr("x2", "100%").attr("y2", "100%");
    metalGrad.append("stop").attr("offset", "0%").attr("stop-color", "#eceff1");
    metalGrad.append("stop").attr("offset", "50%").attr("stop-color", "#b0bec5");
    metalGrad.append("stop").attr("offset", "100%").attr("stop-color", "#eceff1");

    const heatGrad = defs.append("linearGradient").attr("id", "grad-heat-wave").attr("x1", "0%").attr("y1", "0%").attr("x2", "100%").attr("y2", "0%");
    heatGrad.append("stop").attr("offset", "0%").attr("stop-color", "rgba(244, 67, 54, 0.6)");
    heatGrad.append("stop").attr("id", "heat-mid-stop").attr("offset", "30%").attr("stop-color", "rgba(255, 193, 7, 0.4)");
    heatGrad.append("stop").attr("offset", "100%").attr("stop-color", "rgba(33, 150, 243, 0.1)");
  },

  _buildStaticLayout: function () {
    this.legendG = this.svg.append("g").attr("transform", "translate(30, 30)");

    const mainG = this.svg.append("g").attr("id", "mass-physics-group").attr("transform", "translate(460, 160)");

    mainG.append("line").attr("x1", -120).attr("y1", 0).attr("x2", 250).attr("y2", 0)
      .attr("stroke", "#eceff1").attr("stroke-width", 2).attr("stroke-dasharray", "4,4");

    this.sysPivot = mainG.append("g").attr("id", "system-pivot");

    this.extEnv = this.sysPivot.append("g").attr("id", "ext-env");
    this.extEnv.append("line").attr("id", "sun-ray-in-mass").attr("stroke", "#ffb300").attr("stroke-width", 4).attr("marker-end", "url(#arrow-sun-mass)");
    this.extEnv.append("line").attr("id", "sun-ray-out-mass").attr("stroke", "#ffd54f").attr("marker-end", "url(#arrow-reflect-mass)");
    this.extEnv.append("g").attr("id", "emissivity-waves-mass");

    this.wallGroup = this.sysPivot.append("g").attr("id", "wall-group");
    this.wallGroup.append("rect").attr("id", "wall-base").attr("y", -100).attr("height", 200).attr("stroke", "#37474f").attr("stroke-width", 2);
    this.wallGroup.append("rect").attr("id", "wall-pattern").attr("y", -100).attr("height", 200).style("pointer-events", "none");
    this.wallGroup.append("rect").attr("id", "wall-heat-wave").attr("y", -100).attr("height", 200).attr("fill", "url(#grad-heat-wave)").style("pointer-events", "none").style("mix-blend-mode", "multiply");
    this.wallGroup.append("g").attr("id", "wall-dots");
    this.wallGroup.append("g").attr("id", "wall-arrows");

    this.intEnv = this.sysPivot.append("g").attr("id", "int-env");
    this.intEnv.append("line").attr("id", "int-boundary").attr("y1", -110).attr("y2", 110).attr("stroke", "#90caf9").attr("stroke-width", 3).attr("stroke-dasharray", "5,5");

    this.intText = this.intEnv.append("g").attr("transform", "translate(40, 0)");
    this.intText.append("circle").attr("r", 25).attr("fill", "#e3f2fd").attr("stroke", "#2196f3").attr("stroke-width", 2);
    this.intText.append("text").attr("text-anchor", "middle").attr("y", 1).attr("font-size", "12px").attr("font-weight", "bold").attr("fill", "#1565c0").text("22°C");
    this.intText.append("text").attr("text-anchor", "middle").attr("y", 12).attr("font-size", "9px").attr("fill", "#5c6bc0").text("Indoor");

    const orientG = this.svg.append("g").attr("transform", "translate(720, 50)");
    orientG.append("text").attr("x", 0).attr("y", -35).attr("text-anchor", "middle").attr("font-size", "10px").attr("fill", "#78909c").text("PLAN VIEW");
    orientG.append("circle").attr("r", 20).attr("fill", "white").attr("stroke", "#eceff1").attr("stroke-width", 2);
    orientG.append("text").attr("x", 0).attr("y", -24).attr("text-anchor", "middle").attr("font-size", "9px").attr("font-weight", "bold").attr("fill", "#d32f2f").text("N");

    this.surfaceIndicator = orientG.append("g").attr("id", "mass-plan-surface-indicator");
    this.surfaceIndicator.append("line").attr("x1", -15).attr("y1", 0).attr("x2", 15).attr("y2", 0).attr("stroke", "#37474f").attr("stroke-width", 3).attr("stroke-linecap", "round");
    this.surfaceIndicator.append("path").attr("d", "M -3 0 L 3 0 L 0 -12 z").attr("fill", "#1976d2");
  },

  update: function (thickness, density, specificHeat, conductivity, alpha, eps, tilt, azimuth, groupName, presetName) {
    if (!this.svg) return;

    this.animationIntervals.forEach(clearInterval);
    this.animationIntervals = [];

    const tMin = 0.01, tMax = 0.5;
    const pxMin = 40, pxMax = 220;
    const boundedT = Math.max(tMin, Math.min(thickness, tMax));
    const widthPx = pxMin + ((boundedT - tMin) / (tMax - tMin)) * (pxMax - pxMin);

    this.sysPivot.transition().duration(500).attr("transform", `rotate(${90 - tilt})`);
    this.intText.transition().duration(500).attr("transform", `translate(40, 0) rotate(${-(90 - tilt)})`);

    const style = this.groupStyles[groupName] || this.groupStyles["default"];
    this.wallGroup.select("#wall-base").transition().duration(500).attr("width", widthPx).attr("fill", style.fill).attr("opacity", style.opacity || 1);
    this.wallGroup.select("#wall-pattern").transition().duration(500).attr("width", widthPx).attr("fill", style.pattern);
    this.wallGroup.select("#wall-heat-wave").transition().duration(500).attr("width", widthPx);

    this.intEnv.transition().duration(500).attr("transform", `translate(${widthPx}, 0)`);

    const heatCapacity = density * specificHeat;

    const rhoMin = 15, rhoMax = 8000;
    const normRho = Math.max(0, Math.min((density - rhoMin) / (rhoMax - rhoMin), 1));
    const dotRadius = 0.8 + normRho * 1.8;

    const cpMin = 400, cpMax = 2200;
    const normCp = Math.max(0, Math.min((specificHeat - cpMin) / (cpMax - cpMin), 1));
    const numDots = Math.floor(15 + normCp * 280);

    const dotsGroup = this.wallGroup.select("#wall-dots");
    dotsGroup.html("");
    for (let i = 0; i < numDots; i++) {
      dotsGroup.append("circle")
        .attr("cx", Math.random() * widthPx)
        .attr("cy", (Math.random() * 190) - 95)
        .attr("r", dotRadius)
        .attr("fill", "rgba(0,0,0,0.3)")
        .attr("opacity", 0)
        .transition().duration(800).delay(Math.random() * 500).attr("opacity", 1);
    }

    const alphaDiff = conductivity / heatCapacity;
    const adMin = 1e-7, adMax = 1e-5;
    const normAd = Math.max(0, Math.min((alphaDiff - adMin) / (adMax - adMin), 1));

    const midStopPos = 15 + (normAd * 70);
    this.svg.select("#heat-mid-stop").transition().duration(500).attr("offset", `${midStopPos}%`);

    const arrowsGroup = this.wallGroup.select("#wall-arrows");
    arrowsGroup.html("");

    const kMin = 0.02, kMax = 45;
    const normK = Math.max(0, Math.min((conductivity - kMin) / (kMax - kMin), 1));
    const duration = 4000 - (normK * 3200);
    const strokeW = 1.5 + (normK * 4);
    const bgStrokeW = strokeW + 3;

    const numArrows = 4;

    for (let i = 0; i < numArrows; i++) {
      const yPos = (i - (numArrows - 1) / 2) * (140 / (numArrows - 1 || 1));
      const arrowLength = Math.min(25, widthPx * 0.4);

      const group = arrowsGroup.append("g");

      group.append("line")
        .attr("x1", 0).attr("y1", yPos).attr("x2", arrowLength).attr("y2", yPos)
        .attr("stroke", "#ffffff").attr("stroke-width", bgStrokeW)
        .attr("stroke-linecap", "round").attr("marker-end", "url(#arrow-cond-bg)");

      group.append("line")
        .attr("x1", 0).attr("y1", yPos).attr("x2", arrowLength).attr("y2", yPos)
        .attr("stroke", "#d32f2f").attr("stroke-width", strokeW)
        .attr("stroke-linecap", "round").attr("marker-end", "url(#arrow-cond)");

      const animate = () => {
        group.attr("transform", "translate(0,0)").attr("opacity", 0)
          .transition().duration(300).attr("opacity", 1)
          .transition().duration(duration).ease(d3.easeLinear).attr("transform", `translate(${widthPx - (arrowLength + 10)},0)`)
          .transition().duration(300).attr("opacity", 0)
          .on("end", animate);
      };

      const timerId = setInterval(() => {
        if (!document.body.contains(group.node())) {
          clearInterval(timerId);
          return;
        }
        animate();
      }, duration + 500);

      this.animationIntervals.push(timerId);
      animate();
    }

    this.extEnv.select("#sun-ray-in-mass").attr("x1", -80).attr("y1", -60).attr("x2", 0).attr("y2", 0);
    const reflectionFactor = 1 - alpha;
    if (reflectionFactor > 0.05) {
      this.extEnv.select("#sun-ray-out-mass").style("display", "block")
        .attr("x1", 0).attr("y1", 0).attr("x2", -60).attr("y2", -80)
        .attr("stroke-width", reflectionFactor * 5).attr("opacity", reflectionFactor);
    } else {
      this.extEnv.select("#sun-ray-out-mass").style("display", "none");
    }

    const waveGroup = this.extEnv.select("#emissivity-waves-mass");
    waveGroup.html("");
    const numWaves = Math.max(1, Math.round(eps * 5));
    for (let i = 0; i < numWaves; i++) {
      const rVal = 18 + i * 14;
      waveGroup.append("path")
        .attr("d", `M ${-rVal * 0.3} ${-rVal * 0.95} A ${rVal} ${rVal} 0 0 1 ${-rVal * 0.3} ${rVal * 0.95}`)
        .attr("fill", "none")
        .attr("stroke", "#8b1a1a")
        .attr("stroke-width", 2)
        .attr("stroke-linecap", "round")
        .attr("opacity", eps * 0.65 * (1 - i / (numWaves + 1)));
    }

    this.surfaceIndicator.transition().duration(500).attr("transform", `rotate(${azimuth})`);
    this._updateLegendText(thickness, heatCapacity, conductivity, alphaDiff, alpha, eps, presetName, tilt, azimuth);
  },

  _updateLegendText: function (thickness, hc, k, alphaDiff, alpha, eps, presetName, tilt, azimuth) {
    this.legendG.html("");

    this.legendG.append("text").attr("x", 0).attr("y", 0).attr("font-size", "15px").attr("font-weight", "600").attr("fill", "#1a237e")
      .text(presetName || "Custom Configuration");

    this.legendG.append("line").attr("x1", 0).attr("y1", 12).attr("x2", 280).attr("y2", 12).attr("stroke", "#e0e0e0");

    const infoRows = [
      { label: "Thickness (Δx):", val: `${thickness.toFixed(3)} m`, color: "#263238" },
      { label: "Heat Capacity (Size×Count):", val: `${(hc / 1000).toFixed(1)} kJ/m³K`, color: "#2e7d32" },
      { label: "Conductivity (k):", val: `${k.toFixed(3)} W/m·K`, color: "#c62828" },
      { label: "Thermal Diffusivity (α_diff):", val: `${(alphaDiff * 1e6).toFixed(2)} ×10⁻⁶ m²/s`, color: "#8b1a1a" },
      { label: "Solar Absorptance (α):", val: `${alpha.toFixed(2)}`, color: "#e65100" },
      { label: "Thermal Emissivity (ε):", val: `${eps.toFixed(2)}`, color: "#4a148c" },
      { label: "Surface Tilt:", val: `${Math.round(tilt)}°`, color: "#37474f" },
      { label: "Surface Azimuth:", val: `${Math.round(azimuth)}°`, color: "#455a64" }
    ];

    infoRows.forEach((row, idx) => {
      const rowG = this.legendG.append("g").attr("transform", `translate(0, ${30 + idx * 26})`);
      rowG.append("text").attr("y", 0).attr("font-size", "11.5px").attr("font-weight", "bold").attr("fill", row.color).text(row.label);
      rowG.append("text").attr("x", 175).attr("y", 0).attr("font-size", "11.5px").attr("fill", "#555").text(row.val);
    });
  }
};