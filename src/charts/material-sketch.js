import * as d3 from 'd3';

export const MaterialSketch = {
    svg: null,
    width: 760,
    height: 290,
    
    matImageMap: {
        "White EPDM Membrane": "/img/material_01.png",
        "Highly Reflective Cool Roof Coating": "/img/material_02.png",
        "Aged Asphalt Shingles": "/img/material_03.png",
        "Galvanized Steel Roof (Unpainted)": "/img/material_04.png",
        "Gravel Ballasted Roof System": "/img/material_05.png",
        "Standard Red Clay Brick": "/img/material_06.png",
        "Dark Brown/Charcoal Brick": "/img/material_07.png",
        "Light Concrete / Off-white Stucco": "/img/material_08.png",
        "Spandrel Glass (Dark Backing)": "/img/material_09.png",
        "Polished Aluminum Composite Panel": "/img/material_10.png",
        "Dark Stained / Painted Wood Cladding": "/img/material_11.png",
        "New Dark Asphalt Paving": "/img/material_12.png",
        "Aged Concrete Paving": "/img/material_13.png",
        "Light Granite Paving Slabs": "/img/material_14.png",
        "Natural Grass / Exposed Soil Base": "/img/material_15.png"
    },

    init: function(containerId) {
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
        
        defs.append("marker").attr("id", "arrow-sun").attr("viewBox", "0 0 10 10").attr("refX", "8").attr("refY", "5")
            .attr("markerWidth", "6").attr("markerHeight", "6").attr("orient", "auto-start-reverse")
            .append("path").attr("d", "M 0 1 L 10 5 L 0 9 z").attr("fill", "#ffb300");

        defs.append("marker").attr("id", "arrow-reflect").attr("viewBox", "0 0 10 10").attr("refX", "0").attr("refY", "5")
            .attr("markerWidth", "6").attr("markerHeight", "6").attr("orient", "auto-start-reverse")
            .append("path").attr("d", "M 0 1 L 10 5 L 0 9 z").attr("fill", "#ffd54f");

        defs.append("clipPath").attr("id", "texture-clip")
            .append("rect").attr("width", 171).attr("height", 220).attr("rx", 8);

        this._buildStaticLayout();
    },

    _buildStaticLayout: function() {
        this.legendG = this.svg.append("g").attr("transform", "translate(200, 40)");

        const texW = 171;
        const texH = 220;
        const textureG = this.svg.append("g").attr("transform", "translate(10, 20)");
        
        textureG.append("rect").attr("width", texW).attr("height", texH).attr("rx", 8)
            .attr("fill", "#e9ecef").attr("stroke", "#dee2e6").attr("stroke-width", 2);
            
        textureG.append("image").attr("id", "mat-texture-image")
            .attr("width", texW).attr("height", texH).attr("clip-path", "url(#texture-clip)")
            .attr("preserveAspectRatio", "xMidYMid slice")
            .style("display", "none");
            
        textureG.append("text").attr("id", "mat-texture-fallback")
            .attr("x", texW / 2).attr("y", texH / 2 + 5).attr("text-anchor", "middle")
            .attr("fill", "#adb5bd").attr("font-size", "14px").attr("font-weight", "500").text("Custom");

        const mainG = this.svg.append("g").attr("id", "physics-group");
        
        mainG.append("line").attr("x1", 430).attr("y1", 230).attr("x2", 750).attr("y2", 230)
            .attr("stroke", "#ccc").attr("stroke-width", 2).attr("stroke-dasharray", "4,4");

        mainG.append("path").attr("id", "sky-dome")
            .attr("d", "M 450 230 A 140 140 0 0 1 730 230")
            .attr("fill", "#e3f2fd").attr("opacity", 0.6).attr("stroke", "#90caf9").attr("stroke-width", 2);

        mainG.append("rect").attr("id", "svf-block-left").attr("x", 450).attr("y", 230)
            .attr("width", 10).attr("height", 0).attr("fill", "#78909c").attr("opacity", 0.85);
        mainG.append("rect").attr("id", "svf-block-right").attr("x", 720).attr("y", 230)
            .attr("width", 10).attr("height", 0).attr("fill", "#78909c").attr("opacity", 0.85);

        mainG.append("line").attr("id", "material-surface-bg").attr("stroke-width", 10).attr("stroke-linecap", "round").attr("stroke", "#d1d5db");
        mainG.append("line").attr("id", "material-surface").attr("stroke-width", 8).attr("stroke-linecap", "round");
        
        mainG.append("g").attr("id", "thermal-waves");
        mainG.append("line").attr("id", "sun-ray-in").attr("stroke", "#ffb300").attr("stroke-width", 4).attr("marker-end", "url(#arrow-sun)");
        mainG.append("line").attr("id", "sun-ray-out").attr("stroke", "#ffd54f").attr("marker-end", "url(#arrow-reflect)");
        mainG.append("g").attr("id", "emissivity-waves");

        const orientG = this.svg.append("g").attr("transform", "translate(730, 60)");
        
        orientG.append("text").attr("x", 0).attr("y", -35).attr("text-anchor", "middle")
            .attr("font-size", "10px").attr("fill", "#78909c").text("PLAN VIEW");
        orientG.append("circle").attr("r", 20).attr("fill", "white").attr("stroke", "#eceff1").attr("stroke-width", 2);
        orientG.append("text").attr("x", 0).attr("y", -24).attr("text-anchor", "middle")
            .attr("font-size", "9px").attr("font-weight", "bold").attr("fill", "#d32f2f").text("N");

        const surfaceIndicator = orientG.append("g").attr("id", "plan-surface-indicator");
        surfaceIndicator.append("line").attr("x1", -15).attr("y1", 0).attr("x2", 15).attr("y2", 0)
            .attr("stroke", "#37474f").attr("stroke-width", 3).attr("stroke-linecap", "round");
        surfaceIndicator.append("path").attr("d", "M -3 0 L 3 0 L 0 -12 z").attr("fill", "#1976d2");
    },

    update: function(alpha, eps, tilt, azimuth, svf, presetName) {
        if (!this.svg) return;
        
        const pX = 590; 
        const pY = 230;

        const imgSrc = this.matImageMap[presetName];
        if (imgSrc) {
            this.svg.select("#mat-texture-image").attr("href", imgSrc).style("display", "block");
            this.svg.select("#mat-texture-fallback").style("display", "none");
        } else {
            this.svg.select("#mat-texture-image").style("display", "none");
            this.svg.select("#mat-texture-fallback").style("display", "block");
        }

        const rad = (tilt * Math.PI) / 180;
        const length = 110;
        const x2 = pX + length * Math.cos(rad);
        const y2 = pY - length * Math.sin(rad);

        let surfaceColor = "#37474f"; 
        if (alpha < 0.25) surfaceColor = "#ffffff";
        else if (alpha < 0.5) surfaceColor = "#b0bec5"; 
        else if (alpha < 0.7) surfaceColor = "#8d6e63"; 
        
        if (presetName && presetName.toLowerCase().includes("brick")) surfaceColor = "#b22222";
        if (presetName && presetName.toLowerCase().includes("grass")) surfaceColor = "#4caf50";
        if (presetName && presetName.toLowerCase().includes("galv")) surfaceColor = "#90a4ae";

        this.svg.select("#material-surface-bg").attr("x1", pX).attr("y1", pY).attr("x2", x2).attr("y2", y2);
        this.svg.select("#material-surface").attr("x1", pX).attr("y1", pY).attr("x2", x2).attr("y2", y2).attr("stroke", surfaceColor);

        const midX = pX + (x2 - pX) / 2;
        const midY = pY + (y2 - pY) / 2;

        const thermalGroup = this.svg.select("#thermal-waves");
        thermalGroup.html("").attr("transform", `translate(${midX}, ${midY}) rotate(${-tilt})`);
        
        const numHeatWaves = Math.max(1, Math.round(alpha * 5)); 
        for (let i = 1; i <= numHeatWaves; i++) {
            const r = i * 8;
            thermalGroup.append("path")
                .attr("d", `M ${-r} 0 A ${r} ${r} 0 0 0 ${r} 0`)
                .attr("fill", "none").attr("stroke", "#e53935").attr("stroke-width", 2)
                .attr("opacity", (alpha * 0.9) / Math.sqrt(i));
        }

        this.svg.select("#sun-ray-in")
            .attr("x1", midX - 65).attr("y1", midY - 70).attr("x2", midX).attr("y2", midY);

        const reflectionFactor = 1 - alpha;
        if (reflectionFactor > 0.05) {
            this.svg.select("#sun-ray-out").style("display", "block")
                .attr("x1", midX).attr("y1", midY).attr("x2", midX + 60).attr("y2", midY - 70)
                .attr("stroke-width", reflectionFactor * 5).attr("opacity", reflectionFactor);
        } else {
            this.svg.select("#sun-ray-out").style("display", "none");
        }

        const waveGroup = this.svg.select("#emissivity-waves");
        waveGroup.html("").attr("transform", `translate(${midX}, ${midY}) rotate(${-tilt})`);

        const numWaves = Math.max(1, Math.round(eps * 5));
        for (let i = 0; i < numWaves; i++) {
            const r = 14 + i * 11;
            waveGroup.append("path")
                .attr("d", `M ${-r * 0.7} ${r * 0.71} A ${r} ${r} 0 0 0 ${r * 0.7} ${r * 0.71}`)
                .attr("fill", "none")
                .attr("stroke", "#8b1a1a")
                .attr("stroke-width", 2)
                .attr("stroke-linecap", "round")
                .attr("opacity", eps * 0.7 * (1 - i / (numWaves + 1)));
        }

        const blockHeight = (1 - svf) * 120; 
        this.svg.select("#svf-block-left").attr("y", pY - blockHeight).attr("width", 10).attr("height", blockHeight);
        this.svg.select("#svf-block-right").attr("y", pY - blockHeight).attr("width", 10).attr("height", blockHeight);

        const domeStroke = d3.interpolateRgb("#9e9e9e", "#90caf9")(svf);
        const domeFill = d3.interpolateRgb("#f5f5f5", "#e3f2fd")(svf);
        this.svg.select("#sky-dome").attr("stroke", domeStroke).attr("fill", domeFill);

        this.svg.select("#plan-surface-indicator").attr("transform", `rotate(${azimuth})`);

        this._updateLegendText(alpha, eps, tilt, azimuth, svf, presetName);
    },

    _updateLegendText: function(alpha, eps, tilt, azimuth, svf, presetName) {
        this.legendG.html(""); 

        this.legendG.append("text")
            .attr("x", 0).attr("y", 0).attr("text-anchor", "start")
            .attr("font-size", "15px").attr("font-weight", "600").attr("fill", "#1a237e")
            .text(presetName || "Custom Material");

        this.legendG.append("line")
            .attr("x1", 0).attr("y1", 14).attr("x2", 250).attr("y2", 14).attr("stroke", "#e0e0e0");

        const alphaDesc = alpha < 0.2 ? "Very Low (Reflective)" : 
                          alpha < 0.5 ? "Medium (Moderate)" : 
                          alpha < 0.75 ? "High (Absorbs most heat)" : "Very High (Max absorption)";

        const epsDesc = eps < 0.3 ? "Low (Metallic behavior)" :
                        eps < 0.7 ? "Medium (Typical cooling)" : "High (Excellent night cooling)";

        const svfDesc = svf > 0.85 ? "Open (Unobstructed)" :
                        svf > 0.5 ? "Partially Obstructed" : "Restricted (Urban canyon)";

        const infoRows = [
            { label: "Solar Absorptance (α):", val: `${alpha.toFixed(2)} → ${alphaDesc}`, color: "#e65100" },
            { label: "Thermal Emissivity (ε):", val: `${eps.toFixed(2)} → ${epsDesc}`, color: "#8b1a1a" },
            { label: "Sky View Factor (SVF):", val: `${svf.toFixed(2)} → ${svfDesc}`, color: "#0d47a1" },
            { label: "Geometry Configuration:", val: `Tilt: ${tilt}° | Azimuth: ${azimuth}°`, color: "#263238" }
        ];

        infoRows.forEach((row, idx) => {
            const rowG = this.legendG.append("g").attr("transform", `translate(0, ${40 + idx * 45})`);

            rowG.append("text")
                .attr("x", 0).attr("y", 0).attr("text-anchor", "start")
                .attr("font-size", "12px").attr("font-weight", "bold").attr("fill", row.color)
                .text(row.label);

            rowG.append("text")
                .attr("x", 0).attr("y", 18).attr("text-anchor", "start")
                .attr("font-size", "11.5px").attr("fill", "#555")
                .text(row.val);
        });
    }
};