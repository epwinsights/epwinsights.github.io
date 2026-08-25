/**
 * Stub SunCalc dependency used by all three validation scripts
 * (validate_utci.mjs, validate_set.mjs, validate_mrt.mjs).
 *
 * This allows core/outdoor-comfort.js to be imported without requiring
 * the real SunCalc package.
 *
 * Behavior notes:
 *
 * - calculateUTCI() and calculateSET() never call SunCalc at all.
 *   For these two scripts, this stub's implementation is irrelevant.
 *   It only needs to exist and export a default object with `getPosition()`.
 *
 * - calculateAdvancedMRT() reads `sunPos.altitude`. This project treats
 *   the altitude in degrees (it converts `alt * Math.PI / 180` for
 *   `altRad` and uses the raw `alt` value (0–90) for the FP table lookup).
 *
 *   The function `__setAltitude()` is called before each test row to
 *   make this mock return the exact altitude specified in the CSV.
 *   This allows testing across any solar altitude without needing
 *   real datetime/latitude/longitude.
 *
 * When left at its default value (0), it behaves as a simple always-zero
 * stub, which is why it is safe to share across all validation scripts.
 */
let currentAltitudeDeg = 0;

export function __setAltitude(deg) {
  currentAltitudeDeg = deg;
}

export default {
  getPosition: () => ({ altitude: currentAltitudeDeg, azimuth: 0 })
};
