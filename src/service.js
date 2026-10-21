// -----------------------------------------------------------------------------
// The Wiser service: one hub, read on a timer, driven by commands.
//
// Everything Gladys sees goes through here:
//   - `refresh()` reads the whole domain in one request, publishes the states
//     that changed, the device list when its shape changed, the transport
//     badges, the connection status and the scene events;
//   - `run(commands)` sends PATCH requests one after the other, then reads the
//     hub again shortly after, so Gladys shows the state the hub CONFIRMS
//     (`has_feedback` features), not the value asked for;
//   - one timer, re-armed after each read: reads never overlap, and a slow
//     hub delays the next read instead of piling them up.
//
// The hub is declared lost after two failed reads in a row (one for a refused
// secret): a single timeout while it is busy with its radio is not an outage.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { createHubClient, HUB_ERRORS } from './wiser/client.js';
import { parseDomain } from './wiser/domain.js';
import { isConfigured } from './config.js';
import { buildDiscoveredDevices, buildStates, deviceExternalIds } from './devices/index.js';
import { SCENE_TRIGGERS, connectionEvent, detectEvents } from './capabilities/triggers.js';
import { hubErrorMessage } from './messages.js';

const logger = createLogger({ name: 'wiser' });

const FAILURES_BEFORE_LOST = 2;
// Read again this long after a command: the hub applies it within a second.
const CONFIRM_DELAY_MS = 1_500;
// An unchanged value is still re-sent this often, so a Gladys restart or a
// missed state never leaves a stale value for long.
const STATE_HEARTBEAT_MS = 30 * 60 * 1000;
// How long a change the integration asked for is not reported as a scene event.
const EXPECTATION_TTL_MS = 5 * 60 * 1000;

export class WiserService {
  /**
   * @param {object} gladys the SDK client
   * @param {object} [options]
   * @param {typeof createHubClient} [options.createClient] injected by the tests
   * @param {() => void} [options.onChange] called when the model or the reachability changed (widgets)
   */
  constructor(gladys, { createClient = createHubClient, onChange = () => {} } = {}) {
    this.gladys = gladys;
    this.createClient = createClient;
    this.onChange = onChange;
    this.config = null;
    this.client = null;
    this.model = null;
    // null until the first read, then true / false.
    this.reachable = null;
    this.lastError = null;
    this.lastReadAt = null;
    this.failures = 0;
    this.lostAnnounced = false;
    this.publishedDeviceIds = null;
    this.expectations = new Map();
    this.timer = null;
    this.running = false;
    this.refreshing = null;
  }

  /** Apply a (new) configuration. A new hub address or secret starts from scratch. */
  configure(config) {
    const previous = this.config;
    this.config = config;
    const hubChanged =
      !previous ||
      previous.hub_host !== config.hub_host ||
      previous.hub_secret !== config.hub_secret ||
      previous.hub_protocol !== config.hub_protocol;
    if (hubChanged) {
      this.client = isConfigured(config)
        ? this.createClient({
            host: config.hub_host,
            secret: config.hub_secret,
            protocol: config.hub_protocol,
          })
        : null;
      this.model = null;
      this.reachable = null;
      this.failures = 0;
      this.lostAnnounced = false;
      this.publishedDeviceIds = null;
    }
  }

  /**
   * After a (re)connection to Gladys: the next read publishes the device list,
   * the badges and the connection status again, whatever it sent before.
   */
  resync() {
    this.publishedDeviceIds = null;
    this.reachable = null;
  }

  /** The scheme the client uses ('http' | 'https'), for the messages. */
  get scheme() {
    return this.client?.scheme ?? 'http';
  }

  /**
   * Read the hub and publish what changed. Concurrent calls share one read.
   * @param {{ publishDevices?: boolean }} [options] force the device list out (connection, config saved)
   * @returns {Promise<object | null>} the model, or null when the read failed
   */
  refresh(options = {}) {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh(options).finally(() => {
        this.refreshing = null;
      });
    } else if (options.publishDevices) {
      // A read is under way: make the next one publish the devices.
      this.publishedDeviceIds = null;
    }
    return this.refreshing;
  }

  async doRefresh({ publishDevices = false } = {}) {
    if (!this.client) {
      await this.markUnreachable({ code: HUB_ERRORS.NOT_CONFIGURED }, { immediately: true });
      return null;
    }
    let model;
    try {
      model = parseDomain(await this.client.getDomain());
    } catch (err) {
      logger.warn(`HeatHub read failed: ${err.message}`);
      await this.markUnreachable(err, {
        immediately: err.code === HUB_ERRORS.UNAUTHORIZED,
      });
      return null;
    }

    const previous = this.model;
    this.model = model;
    this.lastReadAt = new Date();
    this.failures = 0;
    this.lastError = null;
    const wasReachable = this.reachable;
    this.reachable = true;

    // 1) The device list, when it changed shape (a room or a plug added) or
    // when asked: publishDiscoveredDevices is an upsert by external_id.
    const ids = deviceExternalIds(this.gladys, model).sort().join('\n');
    if (publishDevices || ids !== this.publishedDeviceIds) {
      await this.gladys.publishDiscoveredDevices(buildDiscoveredDevices(this.gladys, model));
      this.publishedDeviceIds = ids;
      await this.publishTransports(DEVICE_TRANSPORTS.LOCAL);
    } else if (wasReachable !== true) {
      await this.publishTransports(DEVICE_TRANSPORTS.LOCAL);
    }

    // 2) The states that changed.
    const { count } = await this.gladys.publishChangedStates(buildStates(this.gladys, model), {
      heartbeat: STATE_HEARTBEAT_MS,
    });

    // 3) The connection status and the scene events.
    if (wasReachable !== true) {
      await this.gladys.setConnectionStatus(true);
    }
    if (this.lostAnnounced) {
      logger.info('HeatHub reachable again');
      this.lostAnnounced = false;
      await this.publishEvent(connectionEvent(true));
    }
    for (const event of detectEvents(this.gladys, previous, model, (key, value) =>
      this.consumeExpectation(key, value),
    )) {
      await this.publishEvent(event);
    }

    if (count > 0 || wasReachable !== true) {
      this.onChange();
    }
    return model;
  }

  async markUnreachable(err, { immediately = false } = {}) {
    this.failures += 1;
    this.lastError = err;
    if (this.reachable === false || (!immediately && this.failures < FAILURES_BEFORE_LOST)) {
      return;
    }
    const wasReachable = this.reachable;
    this.reachable = false;
    await this.gladys
      .setConnectionStatus(false, hubErrorMessage(err, this.config?.hub_host))
      .catch((statusErr) => logger.warn(`Connection status not sent: ${statusErr.message}`));
    if (this.model) {
      await this.publishTransports(DEVICE_TRANSPORTS.UNREACHABLE);
    }
    // Only a hub that WAS reachable can be lost: no event for a hub never read.
    if (wasReachable === true) {
      this.lostAnnounced = true;
      await this.publishEvent(connectionEvent(false, err.code ?? HUB_ERRORS.UNREACHABLE));
    }
    this.onChange();
  }

  async publishTransports(transport) {
    if (!this.model) {
      return;
    }
    const entries = deviceExternalIds(this.gladys, this.model).map((externalId) => ({
      external_id: externalId,
      transport,
    }));
    try {
      // The host API takes 100 entries per call.
      for (let i = 0; i < entries.length; i += 100) {
        await this.gladys.publishTransports(entries.slice(i, i + 100));
      }
    } catch (err) {
      logger.warn(`Transport badges not sent: ${err.message}`);
    }
  }

  async publishEvent({ key, data }) {
    try {
      await this.gladys.publishSceneEvent(key, data);
    } catch (err) {
      // A refused event must not stop the publication of the states.
      logger.warn(`Scene event ${key} not sent: ${err.message}`);
    }
  }

  /** Remember a change the integration asked for, so its echo fires no event. */
  expect(key, value) {
    this.expectations.set(key, { value, until: Date.now() + EXPECTATION_TTL_MS });
  }

  consumeExpectation(key, value) {
    const expectation = this.expectations.get(key);
    if (!expectation) {
      return false;
    }
    this.expectations.delete(key);
    return expectation.value === value && Date.now() <= expectation.until;
  }

  /**
   * Send commands to the hub, in order, then confirm with a read.
   * @param {{ path: string, body: object }[]} commands
   */
  async run(commands) {
    if (!this.client) {
      const error = new Error('The HeatHub is not configured');
      error.code = HUB_ERRORS.NOT_CONFIGURED;
      throw error;
    }
    for (const { path, body } of commands) {
      if (path === 'System' && typeof body.RequestOverride?.Type === 'number') {
        this.expect(SCENE_TRIGGERS.AWAY_MODE_CHANGED, body.RequestOverride.Type !== 0);
      }
      await this.client.patch(path, body);
    }
    this.scheduleRefresh(CONFIRM_DELAY_MS);
  }

  /** Start reading the hub every `poll_frequency` seconds. */
  start() {
    this.running = true;
    this.scheduleRefresh(0);
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = null;
  }

  /** (Re)arm the timer: the next read in `delayMs`, then every poll_frequency. */
  scheduleRefresh(delayMs) {
    if (!this.running) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      this.timer = null;
      try {
        await this.refresh();
      } catch (err) {
        logger.error('HeatHub refresh failed', err);
      }
      if (this.running && this.timer === null) {
        this.scheduleRefresh((this.config?.poll_frequency ?? 60) * 1000);
      }
    }, delayMs);
  }
}
