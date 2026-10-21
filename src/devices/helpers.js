// -----------------------------------------------------------------------------
// Small helpers shared by the device modules.
// -----------------------------------------------------------------------------

/**
 * One feature of a discovery payload. Every feature declares `min` / `max`:
 * Gladys stores them NOT NULL, binary features included.
 */
export function feature(ids, key, { name, category, type, unit, min, max, ...rest }) {
  return {
    name,
    external_id: ids.feature(key),
    category,
    type,
    ...(unit ? { unit } : {}),
    min,
    max,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    ...rest,
  };
}

/** A state of the `publishChangedStates` batch, or nothing when the value is unknown. */
export function state(ids, key, value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return [];
  }
  return [{ device_feature_external_id: ids.feature(key), state: Number(value) }];
}

/** The key of a feature external id, among the keys of a device. */
export function featureKeyOf(ids, featureExternalId, keys) {
  return Object.values(keys).find((key) => ids.feature(key) === featureExternalId);
}

/** 0/1 as a boolean, refusing anything else (a command value from Gladys). */
export function binaryValue(value) {
  const number = Number(value);
  if (number !== 0 && number !== 1) {
    throw new Error(`Expected 0 or 1, got ${value}`);
  }
  return number === 1;
}
