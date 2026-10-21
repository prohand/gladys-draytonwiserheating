// -----------------------------------------------------------------------------
// Local REST client of the Drayton Wiser HeatHub.
//
// The hub serves its whole state on the LAN at `/data/v2/domain/` and takes
// commands as PATCH requests on the same tree (`/data/v2/domain/Room/3`...).
// Every request carries the hub secret in a `SECRET` header: the secret is
// read once from the hub in setup mode (see docs/en.md) and never logged here.
//
// Things the hub is picky about, and why the code looks like this:
//   - it is a small box that answers one request at a time: requests are
//     queued, never sent in parallel;
//   - second-generation hubs on firmware 4.42.22 or later only answer HTTPS,
//     with a self-signed certificate: `auto` starts on HTTP, then follows what
//     the hub says about itself (or switches when HTTP is refused);
//   - a lost device makes the hub report temperatures of -32768 or 2000+: the
//     parser (domain.js) turns them into "unknown", not this file.
//
// No dependency: node:http / node:https only.
// -----------------------------------------------------------------------------

import http from 'node:http';
import https from 'node:https';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'wiser-client' });

export const DOMAIN_PATH = '/data/v2/domain/';

// 20 s, like the reference Python library: a hub busy with its radio network
// can take several seconds to answer.
const DEFAULT_TIMEOUT_MS = 20_000;

// First firmware on which a second-generation hub serves HTTPS only.
const HTTPS_MIN_FIRMWARE = [4, 42, 22];

/** Why a request to the hub failed, so the messages can tell the user what to fix. */
export const HUB_ERRORS = {
  NOT_CONFIGURED: 'not_configured',
  UNAUTHORIZED: 'unauthorized',
  UNREACHABLE: 'unreachable',
  HTTP: 'http',
  INVALID: 'invalid',
};

export class HubError extends Error {
  /**
   * @param {string} code one of HUB_ERRORS
   * @param {string} message technical detail, for the logs (never the secret)
   * @param {{ status?: number }} [details]
   */
  constructor(code, message, { status } = {}) {
    super(message);
    this.name = 'HubError';
    this.code = code;
    this.status = status;
  }
}

/** "4.42.22-abc" -> [4, 42, 22]. */
export function parseFirmware(version) {
  return String(version ?? '')
    .split(/[^0-9]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    const part = version[i] ?? 0;
    if (part !== required[i]) {
      return part > required[i];
    }
  }
  return true;
}

/** True when the hub announces it only serves HTTPS (`System` of the domain). */
export function hubRequiresHttps(system = {}) {
  return (
    Number(system.HardwareGeneration) === 2 &&
    isAtLeast(parseFirmware(system.ActiveSystemVersion), HTTPS_MIN_FIRMWARE)
  );
}

/** "192.168.1.20:8080" -> { hostname, port }. */
export function splitHost(host) {
  const match = /^\[?([^\]]+?)\]?(?::(\d+))?$/.exec(host);
  return match ? { hostname: match[1], port: match[2] ? Number(match[2]) : undefined } : {};
}

/**
 * Default transport: one HTTP(S) request with node's own modules.
 * Resolves `{ status, body }`, rejects on a network error or the timeout.
 */
export function nodeTransport({ protocol, host, method, path, headers, body, timeoutMs }) {
  const { hostname, port } = splitHost(host);
  const module = protocol === 'https' ? https : http;
  return new Promise((resolve, reject) => {
    const request = module.request(
      {
        hostname,
        port: port ?? (protocol === 'https' ? 443 : 80),
        method,
        path,
        headers,
        // The hub serves a self-signed certificate it generates itself: there
        // is no authority to check it against. The traffic stays on the LAN.
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }),
        );
        response.on('error', reject);
      },
    );
    request.on('timeout', () => request.destroy(new Error(`timeout after ${timeoutMs} ms`)));
    request.on('error', reject);
    if (body !== undefined) {
      request.write(body);
    }
    request.end();
  });
}

/**
 * Create the client of one hub.
 *
 * @param {object} options
 * @param {string} options.host IP or host name (optionally `:port`)
 * @param {string} options.secret hub secret
 * @param {'auto'|'http'|'https'} [options.protocol]
 * @param {number} [options.timeoutMs]
 * @param {typeof nodeTransport} [options.transport] injected by the tests
 */
export function createHubClient({
  host,
  secret,
  protocol = 'auto',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  transport = nodeTransport,
}) {
  let scheme = protocol === 'https' ? 'https' : 'http';
  // One request at a time: each request waits for the previous one.
  let queue = Promise.resolve();

  async function send(method, path, payload) {
    if (!host || !secret) {
      throw new HubError(HUB_ERRORS.NOT_CONFIGURED, 'hub address or secret missing');
    }
    const headers = { SECRET: secret, Accept: 'application/json' };
    let body;
    if (payload !== undefined) {
      body = JSON.stringify(payload);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const attempt = (currentScheme) =>
      transport({ protocol: currentScheme, host, method, path, headers, body, timeoutMs });

    let response;
    try {
      response = await attempt(scheme);
    } catch (err) {
      // `auto` on a hub that stopped serving HTTP: the connection is refused or
      // reset. Try HTTPS once, and stay on it when it answers.
      if (protocol === 'auto' && scheme === 'http') {
        try {
          response = await attempt('https');
          logger.info('The hub answers over HTTPS: switching to it');
          scheme = 'https';
        } catch {
          throw new HubError(HUB_ERRORS.UNREACHABLE, `${method} ${path}: ${err.message}`);
        }
      } else {
        throw new HubError(HUB_ERRORS.UNREACHABLE, `${method} ${path}: ${err.message}`);
      }
    }

    if (response.status === 401 || response.status === 403) {
      throw new HubError(HUB_ERRORS.UNAUTHORIZED, `${method} ${path}: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    if (response.status < 200 || response.status >= 300) {
      throw new HubError(HUB_ERRORS.HTTP, `${method} ${path}: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    if (!response.body) {
      return null;
    }
    try {
      return JSON.parse(response.body);
    } catch {
      throw new HubError(HUB_ERRORS.INVALID, `${method} ${path}: the answer is not JSON`);
    }
  }

  function enqueue(method, path, payload) {
    const run = queue.then(() => send(method, path, payload));
    // Keep the chain alive whatever this request gives.
    queue = run.catch(() => {});
    return run;
  }

  return {
    /** The scheme the next request will use ('http' | 'https'). */
    get scheme() {
      return scheme;
    },

    /** Read the whole state of the hub. */
    async getDomain() {
      const domain = await enqueue('GET', DOMAIN_PATH);
      if (domain === null || typeof domain !== 'object' || Array.isArray(domain)) {
        throw new HubError(HUB_ERRORS.INVALID, 'the domain is not an object');
      }
      // `auto`: the hub says which generation and firmware it runs.
      if (protocol === 'auto' && scheme === 'http' && hubRequiresHttps(domain.System)) {
        logger.info('Second-generation hub on a recent firmware: switching to HTTPS');
        scheme = 'https';
      }
      return domain;
    },

    /**
     * Send one command: PATCH `/data/v2/domain/<path>` with a JSON body.
     * @param {string} path e.g. `Room/3`, `System`, `SmartPlug/12`
     * @param {object} payload the command body
     */
    patch(path, payload) {
      logger.debug(`PATCH ${path} ${JSON.stringify(payload)}`);
      return enqueue('PATCH', `${DOMAIN_PATH}${path}`, payload);
    },
  };
}
