/*
 * EPW Insights - build-time helper
 * Converts the official NREL/EnergyPlus master.geojson weather-station index
 * into a trimmed, presentation-ready station-index.json used by the
 * "Pick from Map" station picker.
 *
 * Usage:
 *   node build-station-index.mjs [path-to-master.geojson] [path-to-output.json]
 *
 * Defaults:
 *   input:  ./master.geojson
 *   output: ../public/data/station-index.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const inputPath = process.argv[2] || path.join(__dirname, 'master.geojson');
const outputPath = process.argv[3] || path.join(__dirname, '../public/data/station-index.json');

function extractHref(anchorHtml) {
  if (!anchorHtml) return null;
  const match = anchorHtml.match(/href=([^\s>]+)/i);
  return match ? match[1].replace(/["']/g, '') : null;
}

function main() {
  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const features = raw.features || [];

  const stations = [];
  let skipped = 0;

  for (const feature of features) {
    const props = feature.properties || {};
    const coords = feature.geometry && feature.geometry.coordinates;

    const epwUrl = extractHref(props.epw);
    if (!props.title || !epwUrl || !Array.isArray(coords) || coords.length < 2) {
      skipped++;
      continue;
    }

    stations.push({
      t: props.title,
      lon: Number(coords[0].toFixed(4)),
      lat: Number(coords[1].toFixed(4)),
      u: epwUrl
    });
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(stations));

  const inputSize = fs.statSync(inputPath).size;
  const outputSize = fs.statSync(outputPath).size;

  console.log(`Read ${features.length} features (${skipped} skipped, missing epw/coords).`);
  console.log(`Wrote ${stations.length} stations to ${outputPath}`);
  console.log(`Size: ${(inputSize / 1024 / 1024).toFixed(2)} MB -> ${(outputSize / 1024).toFixed(1)} KB`);
}

main();
