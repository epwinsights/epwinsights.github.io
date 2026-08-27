/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

let cachedStylePromise = null;

function forceEnglishLabels(style) {
  const englishFieldExpression = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];

  (style.layers || []).forEach((layer) => {
    const textField = layer.layout && layer.layout['text-field'];
    if (!textField) return;

    const referencesName = JSON.stringify(textField).includes('name');
    if (referencesName) {
      layer.layout['text-field'] = englishFieldExpression;
    }
  });

  return style;
}

export function getEnglishLabeledStyle() {
  if (!cachedStylePromise) {
    cachedStylePromise = fetch(BASE_STYLE_URL)
      .then((response) => {
        if (!response.ok) throw new Error('Could not load the map style.');
        return response.json();
      })
      .then(forceEnglishLabels)
      .catch((error) => {
        cachedStylePromise = null;
        throw error;
      });
  }
  return cachedStylePromise;
}

export const FALLBACK_STYLE_URL = BASE_STYLE_URL;
