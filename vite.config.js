/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  test: {
    globals: true,
    environment: 'node',
  },
});