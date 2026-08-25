/*
 * EPW Insights - Computational Performance Benchmark
 *
 * Measures, using the project's actual core modules (not a re-implementation):
 *   1. EPW parsing time (core/epw-parser.js -> parseEPW)
 *   2. Outdoor Comfort full-year computation time (MRT + UTCI + SET per hour,
 *      the same loop used in charts/outdoor-comfort-charts.js)
 *   3. Material Analysis computation time (steady-state surface temperature
 *      + 1D transient thermal mass, core/material-physics.js)
 *
 * Runs across all 14 sample cities already used throughout the manuscript's
 * validation work (Table A.2), so the reported figures are a mean and range
 * across cities/climates rather than a single arbitrary file.
 *
 * This measures pure Node.js computation only: no browser, no DOM, no chart
 * rendering, no network. It is a lower bound on real in-browser time, not a
 * replacement for it.
 *
 * Usage (from inside the validation/ folder):
 *   node measure_performance.mjs
 *   node --expose-gc measure_performance.mjs   (recommended: cleaner memory
 *                                                isolation between stages)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { performance } from 'perf_hooks';
import path from 'path';
import { fileURLToPath } from 'url';

import { parseEPW } from './core/epw-parser.js';
import { calculateAdvancedMRT, calculateUTCI, calculateSET } from './core/outdoor-comfort.js';
import { computeMaterialTemperatures, computeThermalMass1D } from './core/material-physics.js';
import state from './state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Adjust this if your public/epw folder lives somewhere else relative
// to the validation/ folder. As shipped, validation/ and public/ are both
// direct children of the repo root, so '..' from validation/ reaches it.
const EPW_DIR = path.resolve(__dirname, '..', 'public', 'epw');

const CITIES = [
  'Cairo', 'Chicago', 'London', 'Moscow', 'Mumbai', 'Nairobi', 'Phoenix',
  'RioDeJaneiro', 'Rome', 'Santiago', 'Singapore', 'Sydney', 'Tehran', 'Ulaanbataar'
];

function mb(bytes) {
  return bytes / (1024 * 1024);
}

function gcIfAvailable() {
  if (global.gc) global.gc();
}

// Mirrors the exact production loop in charts/outdoor-comfort-charts.js
function runOutdoorComfort(epwData) {
  epwData.data.forEach(d => {
    d.mrt = calculateAdvancedMRT(d, epwData.metadata.location, state.humanParams);
    d.utci = calculateUTCI(d.dryBulbTemperature, d.mrt, d.windSpeed, d.relativeHumidity);
    d.set = calculateSET(d.dryBulbTemperature, d.mrt, d.windSpeed, d.relativeHumidity);
  });
}

// Mirrors the exact production call sequence in charts/material-analysis.js
function runMaterialAnalysis(epwData) {
  computeMaterialTemperatures(epwData);
  computeThermalMass1D(epwData);
}

const results = [];
let peakHeapUsedBytes = 0;

function trackPeakHeap() {
  const current = process.memoryUsage().heapUsed;
  if (current > peakHeapUsedBytes) peakHeapUsedBytes = current;
  return current;
}

// --- Warm-up pass ---
// Runs the full pipeline twice on the first available city before any timed
// measurement starts, so V8's JIT has already optimized the hot functions
// (the 8,760-iteration comfort loop especially) before we start recording.
// Without this, the first one or two cities in the timed loop can show
// inflated times that reflect interpreter/baseline execution rather than
// the platform's steady-state speed, which is what the paper actually cites.
{
  const warmupCity = CITIES.find(c => existsSync(path.join(EPW_DIR, `${c}.epw`)));
  if (warmupCity) {
    const warmupString = readFileSync(path.join(EPW_DIR, `${warmupCity}.epw`), 'utf-8');
    for (let i = 0; i < 2; i++) {
      const warmupData = parseEPW(warmupString);
      runOutdoorComfort(warmupData);
      runMaterialAnalysis(warmupData);
    }
    console.log(`Warm-up complete (2 passes on ${warmupCity}). Starting timed measurements.\n`);
  }
  gcIfAvailable();
  peakHeapUsedBytes = process.memoryUsage().heapUsed;
}

for (const city of CITIES) {
  const filePath = path.join(EPW_DIR, `${city}.epw`);
  if (!existsSync(filePath)) {
    console.warn(`[skip] ${city}: file not found at ${filePath}`);
    continue;
  }

  const epwString = readFileSync(filePath, 'utf-8');

  // --- Parse ---
  gcIfAvailable();
  const memBeforeParse = trackPeakHeap();
  const t0 = performance.now();
  const epwData = parseEPW(epwString);
  const t1 = performance.now();
  const memAfterParse = trackPeakHeap();

  // --- Outdoor Comfort (MRT + UTCI + SET, full year) ---
  gcIfAvailable();
  const memBeforeComfort = trackPeakHeap();
  const t2 = performance.now();
  runOutdoorComfort(epwData);
  const t3 = performance.now();
  const memAfterComfort = trackPeakHeap();

  // --- Material Analysis (steady-state surface temp + 1D thermal mass) ---
  gcIfAvailable();
  const memBeforeMaterial = trackPeakHeap();
  const t4 = performance.now();
  runMaterialAnalysis(epwData);
  const t5 = performance.now();
  const memAfterMaterial = trackPeakHeap();

  results.push({
    city,
    records: epwData.data.length,
    parseMs: t1 - t0,
    comfortMs: t3 - t2,
    materialMs: t5 - t4,
    totalMs: (t1 - t0) + (t3 - t2) + (t5 - t4),
    parseMemMB: mb(memAfterParse - memBeforeParse),
    comfortMemMB: mb(memAfterComfort - memBeforeComfort),
    materialMemMB: mb(memAfterMaterial - memBeforeMaterial)
  });

  console.log(
    `${city}: parse ${(t1 - t0).toFixed(1)} ms, comfort ${(t3 - t2).toFixed(1)} ms, ` +
    `material ${(t5 - t4).toFixed(1)} ms`
  );
}

if (results.length === 0) {
  console.error('No EPW files were found. Check EPW_DIR at the top of this script.');
  process.exit(1);
}

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function min(arr) { return Math.min(...arr); }
function max(arr) { return Math.max(...arr); }

const parseTimes = results.map(r => r.parseMs);
const comfortTimes = results.map(r => r.comfortMs);
const materialTimes = results.map(r => r.materialMs);
const totalTimes = results.map(r => r.totalMs);
const peakHeapMB = mb(peakHeapUsedBytes);

const timestamp = new Date().toISOString();
const nodeVersion = process.version;
const platformInfo = `${process.platform} ${process.arch}`;

let report = '';
report += 'EPW Insights - Computational Performance Benchmark\n';
report += `Generated: ${timestamp}\n`;
report += `Node.js: ${nodeVersion} (${platformInfo})\n`;
report += `Sample: ${results.length} of 14 cities used throughout the manuscript (Table A.2)\n`;
report += 'Note: these are pure Node.js computation times for the core modules only ';
report += '(no browser, no DOM/chart rendering, no network fetch of climate-morphing tiles). ';
report += 'They are a lower bound on real in-browser time, not a substitute for it.\n\n';

report += 'Per-city results\n';
report += 'City\tRecords\tParse (ms)\tComfort (ms)\tMaterial (ms)\tTotal (ms)\n';
results.forEach(r => {
  report += `${r.city}\t${r.records}\t${r.parseMs.toFixed(1)}\t${r.comfortMs.toFixed(1)}\t` +
    `${r.materialMs.toFixed(1)}\t${r.totalMs.toFixed(1)}\n`;
});

report += `\nSummary across ${results.length} cities\n`;
report += `Parse time (ms): mean ${mean(parseTimes).toFixed(1)}, range ${min(parseTimes).toFixed(1)}-${max(parseTimes).toFixed(1)}\n`;
report += `Outdoor Comfort time (ms): mean ${mean(comfortTimes).toFixed(1)}, range ${min(comfortTimes).toFixed(1)}-${max(comfortTimes).toFixed(1)}\n`;
report += `Material Analysis time (ms): mean ${mean(materialTimes).toFixed(1)}, range ${min(materialTimes).toFixed(1)}-${max(materialTimes).toFixed(1)}\n`;
report += `Total time (ms): mean ${mean(totalTimes).toFixed(1)}, range ${min(totalTimes).toFixed(1)}-${max(totalTimes).toFixed(1)}\n`;
report += `Peak Node.js heap observed at any point across all ${results.length} cities in this run: ${peakHeapMB.toFixed(1)} MB\n`;
report += '\nThis Node.js heap figure reflects only the computation modules under Node, ';
report += 'not full in-browser memory (which also includes the DOM, D3 rendering, and the ';
report += 'browser runtime itself). See the accompanying browser measurement, if recorded, ';
report += 'for the in-browser figure actually cited in the paper.\n';

const outDir = path.resolve(__dirname, 'results');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const txtPath = path.join(outDir, 'epwinsights_performance_benchmark.txt');
writeFileSync(txtPath, report, 'utf-8');

let csv = 'city,records,parse_ms,comfort_ms,material_ms,total_ms,parse_mem_mb,comfort_mem_mb,material_mem_mb\n';
results.forEach(r => {
  csv += `${r.city},${r.records},${r.parseMs.toFixed(2)},${r.comfortMs.toFixed(2)},` +
    `${r.materialMs.toFixed(2)},${r.totalMs.toFixed(2)},${r.parseMemMB.toFixed(2)},` +
    `${r.comfortMemMB.toFixed(2)},${r.materialMemMB.toFixed(2)}\n`;
});
const csvPath = path.join(outDir, 'epwinsights_performance_benchmark.csv');
writeFileSync(csvPath, csv, 'utf-8');

console.log(`\nReport written to ${txtPath}`);
console.log(`CSV written to ${csvPath}`);
