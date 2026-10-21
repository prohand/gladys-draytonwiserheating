import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { WiserService } from '../src/service.js';
import { normalizeConfig } from '../src/config.js';
import { SCENE_TRIGGERS } from '../src/capabilities/triggers.js';
import * as commands from '../src/wiser/commands.js';
import { HUB_ERRORS, clientFactory, createFakeHub } from './helpers/fakeHub.js';

const CONFIG = normalizeConfig({ hub_host: '192.168.1.40', hub_secret: 's3cr3t' });

function setup({ config = CONFIG } = {}) {
  const gladys = createFakeGladys();
  const hub = createFakeHub();
  let changes = 0;
  const service = new WiserService(gladys, {
    createClient: clientFactory(hub),
    onChange: () => {
      changes += 1;
    },
  });
  service.configure(config);
  return { gladys, hub, service, changes: () => changes };
}

test('the first read publishes the devices, the states, the badges and the status', async () => {
  const { gladys, hub, service } = setup();
  const model = await service.refresh();
  assert.ok(model);
  assert.deepEqual(hub.options, { host: '192.168.1.40', secret: 's3cr3t', protocol: 'auto' });
  assert.equal(gladys.fake.discoveredDevices.length, 10);
  assert.ok(gladys.fake.states.length > 20);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  const transports = gladys.fake.transports;
  assert.ok(transports.length > 0);
  assert.ok(transports.every((entry) => entry.transport === DEVICE_TRANSPORTS.LOCAL));
  assert.deepEqual(gladys.fake.sceneEvents, [], 'no event at the first read');
});

test('a read with nothing new publishes nothing, a change publishes only that', async () => {
  const { gladys, hub, service } = setup();
  await service.refresh();
  const published = gladys.fake.states.length;
  const discovered = gladys.fake.bodies('POST', '/discovered_device').length;

  await service.refresh();
  assert.equal(gladys.fake.states.length, published, 'nothing changed');

  hub.domain.Room[0].CalculatedTemperature = 201;
  await service.refresh();
  assert.equal(gladys.fake.states.length, published + 1);
  assert.equal(gladys.fake.states.at(-1).state, 20.1);
  assert.equal(
    gladys.fake.bodies('POST', '/discovered_device').length,
    discovered,
    'same devices: the list is not sent again',
  );
});

test('a new room on the hub publishes the device list again', async () => {
  const { gladys, hub, service } = setup();
  await service.refresh();
  hub.domain.Room.push({ id: 4, Name: 'Kitchen', Mode: 'Auto', CalculatedTemperature: 200 });
  await service.refresh();
  assert.equal(gladys.fake.discoveredDevices.length, 11);
});

test('one failed read is not an outage, two are', async () => {
  const { gladys, hub, service } = setup();
  await service.refresh();
  hub.fail(HUB_ERRORS.UNREACHABLE);

  assert.equal(await service.refresh(), null);
  assert.equal(service.reachable, true, 'one timeout while the hub is busy');
  assert.deepEqual(gladys.fake.sceneEvents, []);

  await service.refresh();
  assert.equal(service.reachable, false);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /192\.168\.1\.40/);
  assert.ok(
    gladys.fake.transports.slice(-3).every((e) => e.transport === DEVICE_TRANSPORTS.UNREACHABLE),
  );
  assert.deepEqual(gladys.fake.sceneEvents.at(-1), {
    key: SCENE_TRIGGERS.HUB_CONNECTION_CHANGED,
    data: { state: 'lost', reason: HUB_ERRORS.UNREACHABLE },
  });

  await service.refresh();
  assert.equal(gladys.fake.sceneEvents.length, 1, 'lost once, not at every failed read');

  hub.fail(null);
  await service.refresh();
  assert.equal(service.reachable, true);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.sceneEvents.at(-1).data.state, 'restored');
  assert.equal(gladys.fake.transports.at(-1).transport, DEVICE_TRANSPORTS.LOCAL);
});

test('a refused secret is reported at once, with what to do', async () => {
  const { gladys, hub, service } = setup();
  hub.fail(HUB_ERRORS.UNAUTHORIZED);
  await service.refresh();
  assert.equal(service.reachable, false);
  assert.match(gladys.fake.connectionStatus.message.en, /secret/);
  assert.deepEqual(gladys.fake.sceneEvents, [], 'never reachable, never lost');
});

test('without an address or a secret, the status says what to enter', async () => {
  const { gladys, service } = setup({ config: normalizeConfig({}) });
  assert.equal(await service.refresh(), null);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /address and the secret/);
  await assert.rejects(service.run(commands.setAwayMode(true)), /not configured/);
});

test('a window opening fires one window_changed event', async () => {
  const { gladys, hub, service } = setup();
  await service.refresh();
  hub.domain.Room[0].WindowState = 'Open';
  await service.refresh();
  await service.refresh();
  assert.deepEqual(gladys.fake.sceneEvents, [
    {
      key: SCENE_TRIGGERS.WINDOW_CHANGED,
      data: { device: gladys.externalId('room:1'), room: 'Living room', state: 'open' },
    },
  ]);
});

test('away mode changed from the Wiser app fires an event, from Gladys it does not', async () => {
  const { gladys, hub, service } = setup();
  await service.refresh();

  hub.domain.System.OverrideType = 'Away';
  await service.refresh();
  assert.deepEqual(gladys.fake.sceneEvents.at(-1), {
    key: SCENE_TRIGGERS.AWAY_MODE_CHANGED,
    data: { state: 'on' },
  });

  // Gladys turns it off: the change it asked for is no event (no scene loop).
  await service.run(commands.setAwayMode(false));
  hub.domain.System.OverrideType = 'None';
  await service.refresh();
  assert.equal(gladys.fake.sceneEvents.length, 1);
  assert.deepEqual(hub.patches.at(-1), { path: 'System', body: { RequestOverride: { Type: 0 } } });
});

test('a battery going low fires battery_low once', async () => {
  const { gladys, hub, service } = setup();
  await service.refresh();
  const valve = hub.domain.Device.find((device) => device.SerialNumber === 'TRV00022');
  valve.BatteryLevel = 'Low';
  valve.BatteryVoltage = 24;
  await service.refresh();
  await service.refresh();
  assert.deepEqual(gladys.fake.sceneEvents, [
    {
      key: SCENE_TRIGGERS.BATTERY_LOW,
      data: {
        device: gladys.externalId('itrv:TRV00022'),
        device_name: 'Radiator valve - Bedroom',
        room: 'Bedroom',
        level: 'Low',
        battery: 5,
      },
    },
  ]);
});

test('commands go out in order, then the hub is read again to confirm', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { hub, service } = setup();
  service.start();
  t.mock.timers.tick(0);
  await new Promise((resolve) => setImmediate(resolve));
  const readsBefore = hub.reads;

  await service.run(commands.setRoomAuto(1));
  assert.deepEqual(
    hub.patches.map((patch) => patch.body),
    [{ RequestOverride: { Type: 'None' } }, { Mode: 'Auto' }],
  );
  t.mock.timers.tick(1_500);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(hub.reads, readsBefore + 1, 'confirmation read');
  service.stop();
});

test('the timer reads the hub every poll_frequency seconds, never two at once', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { hub, service } = setup({
    config: normalizeConfig({ hub_host: 'h', hub_secret: 's', poll_frequency: 120 }),
  });
  service.start();
  t.mock.timers.tick(0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(hub.reads, 1);
  t.mock.timers.tick(119_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(hub.reads, 1);
  t.mock.timers.tick(1_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(hub.reads, 2);
  service.stop();
  t.mock.timers.tick(600_000);
  assert.equal(hub.reads, 2, 'stopped');
});

test('a new hub address starts from scratch', async () => {
  const { service } = setup();
  await service.refresh();
  assert.ok(service.model);
  service.configure(normalizeConfig({ hub_host: '192.168.1.41', hub_secret: 's3cr3t' }));
  assert.equal(service.model, null);
  // Another setting only: the model stays.
  await service.refresh();
  service.configure(
    normalizeConfig({ hub_host: '192.168.1.41', hub_secret: 's3cr3t', boost_delta: 3 }),
  );
  assert.ok(service.model);
});

test('concurrent refreshes share one read', async () => {
  const { hub, service } = setup();
  await Promise.all([service.refresh(), service.refresh(), service.refresh()]);
  assert.equal(hub.reads, 1);
});

test('a read that changed something nudges the widgets', async () => {
  const { hub, service, changes } = setup();
  await service.refresh();
  assert.equal(changes(), 1);
  await service.refresh();
  assert.equal(changes(), 1, 'nothing changed');
  hub.domain.Room[1].ControlOutputState = 'On';
  await service.refresh();
  assert.equal(changes(), 2);
});

test('after a reconnection to Gladys, everything is published again', async () => {
  const { gladys, hub, service } = setup();
  await service.refresh();
  const lists = gladys.fake.bodies('POST', '/discovered_device').length;
  service.resync();
  await service.refresh();
  assert.equal(gladys.fake.bodies('POST', '/discovered_device').length, lists + 1);
  // A hub already lost is reported again to a Gladys that restarted.
  hub.fail(HUB_ERRORS.UNREACHABLE);
  await service.refresh();
  await service.refresh();
  const statuses = gladys.fake.connectionStatuses.length;
  service.resync();
  await service.refresh();
  assert.equal(gladys.fake.connectionStatuses.length, statuses + 1);
  assert.equal(gladys.fake.connectionStatus.connected, false);
});
