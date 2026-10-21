// -----------------------------------------------------------------------------
// A fake HeatHub client for the tests: no network, a domain the test edits.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { HubError, HUB_ERRORS } from '../../src/wiser/client.js';

const FIXTURE = readFileSync(new URL('../fixtures/domain.json', import.meta.url), 'utf8');

/** A fresh copy of the fixture domain (3 rooms, 4 battery devices, a plug, hot water). */
export function loadDomain() {
  return JSON.parse(FIXTURE);
}

/**
 * A client with the shape of createHubClient's.
 *   - `hub.domain`: what getDomain answers (edit it between two reads);
 *   - `hub.patches`: every PATCH received, `{ path, body }`;
 *   - `hub.fail(code)`: the next reads fail with that HUB_ERRORS code, until `hub.fail(null)`.
 */
export function createFakeHub(domain = loadDomain()) {
  const hub = {
    domain,
    patches: [],
    reads: 0,
    failure: null,
    scheme: 'http',
    options: null,
    fail(code) {
      hub.failure = code;
    },
    async getDomain() {
      hub.reads += 1;
      if (hub.failure) {
        throw new HubError(hub.failure, `fake failure (${hub.failure})`);
      }
      return structuredClone(hub.domain);
    },
    async patch(path, body) {
      if (hub.failure) {
        throw new HubError(hub.failure, `fake failure (${hub.failure})`);
      }
      hub.patches.push({ path, body });
      return {};
    },
  };
  return hub;
}

/** A `createClient` option for WiserService that hands out this fake hub. */
export function clientFactory(hub) {
  return (options) => {
    hub.options = options;
    return hub;
  };
}

export { HUB_ERRORS };
