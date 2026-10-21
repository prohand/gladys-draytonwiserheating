// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches it
// (`gladys.getConfig()`) and notifies every change (`gladys.onConfigUpdated()`).
//
// This module only provides the defaults and normalizes the received object, so
// the rest of the code never has to deal with `undefined`, strings typed in a
// form, or values out of the range the hub accepts.
// -----------------------------------------------------------------------------

/** How the integration reaches the hub: `auto` follows the hub generation. */
export const HUB_PROTOCOLS = ['auto', 'http', 'https'];

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // IP address or host name of the HeatHub on the local network.
  hub_host: '',
  // The hub secret (SECRET header of the local API). Never logged.
  hub_secret: '',
  hub_protocol: 'auto',
  // Seconds between two reads of the hub. One read covers every room and
  // device: the hub is a small box, a minute keeps it responsive.
  poll_frequency: 60,
  // Room boost: degrees added to the current temperature, for how long.
  boost_delta: 2,
  boost_duration: 60,
  // Hot water boost duration, in minutes.
  hot_water_boost_duration: 30,
};

// Bounds of the numeric settings, the same as the manifest `min` / `max`.
const BOUNDS = {
  poll_frequency: [30, 900],
  boost_delta: [0.5, 5],
  boost_duration: [15, 240],
  hot_water_boost_duration: [15, 180],
};

function boundedNumber(raw, key) {
  const value = Number(raw ?? DEFAULT_CONFIG[key]);
  if (!Number.isFinite(value)) {
    return DEFAULT_CONFIG[key];
  }
  const [min, max] = BOUNDS[key];
  return Math.min(max, Math.max(min, value));
}

/**
 * Merge the user config with the defaults and force the types.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const host = String(raw.hub_host ?? '')
    .trim()
    // Tolerate a pasted URL: keep the host (and port) only.
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '');
  const protocol = String(raw.hub_protocol ?? DEFAULT_CONFIG.hub_protocol).toLowerCase();
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    hub_host: host,
    hub_secret: String(raw.hub_secret ?? '').trim(),
    hub_protocol: HUB_PROTOCOLS.includes(protocol) ? protocol : DEFAULT_CONFIG.hub_protocol,
    poll_frequency: boundedNumber(raw.poll_frequency, 'poll_frequency'),
    boost_delta: boundedNumber(raw.boost_delta, 'boost_delta'),
    boost_duration: Math.round(boundedNumber(raw.boost_duration, 'boost_duration')),
    hot_water_boost_duration: Math.round(
      boundedNumber(raw.hot_water_boost_duration, 'hot_water_boost_duration'),
    ),
  };
}

/** True when the hub can be reached: an address and a secret are set. */
export function isConfigured(config) {
  return config.hub_host !== '' && config.hub_secret !== '';
}
