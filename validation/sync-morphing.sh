#!/usr/bin/env bash
# Extends sync-core.sh: copies the current climate-morphing modules into
# validation/core/, then patches the tile loader's DATA_BASE_PATH so it
# reads tile files directly from disk (via a file:// URL, which Node's
# built-in fetch supports) instead of a browser-relative /data/ path.
#
# This script calls sync-core.sh itself before doing anything else, so the
# outdoor-comfort.js and state.js files it depends on are always in place.
# There is no manual ordering to remember. Just run:
#
#   bash sync-morphing.sh && node validate_morphing.mjs
#
# Cross-platform note: on Windows (Git Bash / MSYS), `pwd` returns POSIX-style
# paths like /d/XXX/... which Node's fetch() does NOT accept in a file://
# URL (it needs a drive letter, e.g. file:///D:/XXX/...). On Linux/macOS,
# POSIX paths are exactly what file:// URLs expect, so no conversion is
# needed there. We detect which situation we're in via `cygpath`, which
# only exists on Git Bash/MSYS/Cygwin.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Run the core sync first so the modules synced below, which depend on
# outdoor-comfort.js and state.js, always have something to import.
bash "$SCRIPT_DIR/sync-core.sh"

# TODO: adjust these five paths if your repo layout differs.
SRC_MORPHING="$PROJECT_ROOT/src/core/climate-morphing.js"
SRC_TILE_LOADER="$PROJECT_ROOT/src/core/climate-tile-loader.js"
SRC_PEAK_CONDITIONS="$PROJECT_ROOT/src/core/peak-conditions.js"
SRC_EPW_PARSER="$PROJECT_ROOT/src/core/epw-parser.js"
SRC_PSYCHROLIB="$PROJECT_ROOT/src/core/psychrolib.js"
SRC_POINT_IN_REGION="$PROJECT_ROOT/src/core/point-in-region.js"
TILES_DIR="$PROJECT_ROOT/public/data/climate/tiles"

for f in "$SRC_MORPHING" "$SRC_TILE_LOADER" "$SRC_PEAK_CONDITIONS" "$SRC_EPW_PARSER" "$SRC_PSYCHROLIB" "$SRC_POINT_IN_REGION"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: could not find $f" >&2
    echo "Edit the SRC_* paths in sync-morphing.sh to match your repo layout." >&2
    exit 1
  fi
done
if [ ! -d "$TILES_DIR" ]; then
  echo "ERROR: could not find tiles directory at $TILES_DIR" >&2
  echo "Edit TILES_DIR in sync-morphing.sh to match where your tile data actually lives." >&2
  exit 1
fi

cp "$SRC_MORPHING" "$SCRIPT_DIR/core/climate-morphing.js"
cp "$SRC_TILE_LOADER" "$SCRIPT_DIR/core/climate-tile-loader.js"
cp "$SRC_PEAK_CONDITIONS" "$SCRIPT_DIR/core/peak-conditions.js"
cp "$SRC_EPW_PARSER" "$SCRIPT_DIR/core/epw-parser.js"
cp "$SRC_PSYCHROLIB" "$SCRIPT_DIR/core/psychrolib.js"
cp "$SRC_POINT_IN_REGION" "$SCRIPT_DIR/core/point-in-region.js"

# Build a file:// URL for TILES_DIR that Node's fetch() will actually accept
# on the current platform.
if command -v cygpath >/dev/null 2>&1; then
  # Windows via Git Bash/MSYS/Cygwin: convert /d/XXX/... -> D:/XXX/...
  # so the final URL looks like file:///D:/XXX/.../tiles/
  TILES_DIR_FOR_URL="$(cygpath -m "$TILES_DIR")"
  TILES_URL="file:///${TILES_DIR_FOR_URL}/"
else
  # Linux/macOS: POSIX path is already what file:// expects.
  # $TILES_DIR already starts with /, so file://$TILES_DIR/ -> file:///...
  TILES_URL="file://${TILES_DIR}/"
fi

# Point the synced tile loader at the actual tile data on disk instead of
# a browser-relative URL. Node's fetch() supports file:// URLs for GET
# requests, so no local server is needed just to run this benchmark.
sed -i.bak "s|const DATA_BASE_PATH = '/data/climate/tiles/';|const DATA_BASE_PATH = '${TILES_URL}';|" "$SCRIPT_DIR/core/climate-tile-loader.js"
rm -f "$SCRIPT_DIR/core/climate-tile-loader.js.bak"

echo "Synced climate-morphing.js, climate-tile-loader.js, peak-conditions.js, epw-parser.js, psychrolib.js, point-in-region.js"
echo "climate-tile-loader.js was patched to read tiles from: ${TILES_URL}"
echo "(This is a test-only patch, same spirit as the existing core/suncalc.js stub.)"