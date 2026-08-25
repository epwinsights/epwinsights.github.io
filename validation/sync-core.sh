#!/usr/bin/env bash
# Copies the current project source files into validation/core/ so the
# validation scripts always run against the code that actually ships,
# not a stale hand-copied version. Run this before every validation pass:
#
#   npm run sync && npm run validate:all

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SRC_OUTDOOR_COMFORT="$PROJECT_ROOT/src/core/outdoor-comfort.js"
SRC_MATERIAL_PHYSICS="$PROJECT_ROOT/src/core/material-physics.js"
SRC_SKY_TEMPERATURE="$PROJECT_ROOT/src/core/sky-temperature.js"
SRC_STATE="$PROJECT_ROOT/src/state.js"
SRC_DATE_FILTER="$PROJECT_ROOT/src/core/date-filter.js"

for f in "$SRC_OUTDOOR_COMFORT" "$SRC_MATERIAL_PHYSICS" "$SRC_SKY_TEMPERATURE" "$SRC_STATE" "$SRC_DATE_FILTER"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: could not find $f" >&2
    echo "Edit PROJECT_ROOT / the SRC_* paths in sync-core.sh to match your repo layout." >&2
    exit 1
  fi
done

cp "$SRC_OUTDOOR_COMFORT"  "$SCRIPT_DIR/core/outdoor-comfort.js"
cp "$SRC_MATERIAL_PHYSICS" "$SCRIPT_DIR/core/material-physics.js"
cp "$SRC_SKY_TEMPERATURE"  "$SCRIPT_DIR/core/sky-temperature.js"
cp "$SRC_STATE"            "$SCRIPT_DIR/state.js"
cp "$SRC_DATE_FILTER"      "$SCRIPT_DIR/core/date-filter.js"

echo "Synced:"
echo "  $SRC_OUTDOOR_COMFORT -> validation/core/outdoor-comfort.js"
echo "  $SRC_MATERIAL_PHYSICS -> validation/core/material-physics.js"
echo "  $SRC_SKY_TEMPERATURE -> validation/core/sky-temperature.js"
echo "  $SRC_STATE -> validation/state.js"
echo "  $SRC_DATE_FILTER -> validation/core/date-filter.js"
echo "(core/suncalc.js was not touched. It stays a test-only stub.)"