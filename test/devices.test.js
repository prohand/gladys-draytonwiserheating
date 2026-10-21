import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { parseDomain } from '../src/wiser/domain.js';
import { normalizeConfig } from '../src/config.js';
import {
  DEVICE_TYPES,
  buildDiscoveredDevices,
  buildStates,
  findDevice,
  findRoom,
} from '../src/devices/index.js';
import { ROOM_FEATURES, THERMOSTAT_MODE } from '../src/devices/room.js';
import { HUB_FEATURES } from '../src/devices/hub.js';
import { HOT_WATER_FEATURES, WATER_HEATER_MODE } from '../src/devices/hotWater.js';
import { PLUG_FEATURES } from '../src/devices/smartPlug.js';
import { loadDomain } from './helpers/fakeHub.js';

const gladys = createFakeGladys();
const config = normalizeConfig({ hub_host: 'hub', hub_secret: 'x' });
const model = parseDomain(loadDomain());
const devices = buildDiscoveredDevices(gladys, model);
const byName = (name) => devices.find((device) => device.name === name);

// The PATCH requests a command on a feature of a device turns into.
function commandsOf(device, featureKey, value, onModel = model) {
  const found = findDevice(gladys, onModel, device.external_id);
  return found.type.commandsFor(gladys, {
    entity: found.entity,
    featureExternalId: `${device.external_id}:${featureKey}`,
    value,
    config,
  });
}

test('every device type exposes the required shape', () => {
  for (const type of DEVICE_TYPES) {
    assert.equal(typeof type.key, 'string');
    for (const name of ['entities', 'externalIds', 'buildDevice', 'states']) {
      assert.equal(typeof type[name], 'function', `${type.key}.${name}`);
    }
  }
});

test('Gladys accepts the discovery payload', async () => {
  // The SDK fake checks the payload like the host API: external_id prefix,
  // known category / type / unit. A refusal is a 400 for the WHOLE list.
  const fresh = createFakeGladys();
  await fresh.publishDiscoveredDevices(buildDiscoveredDevices(fresh, model));
  assert.equal(fresh.fake.discoveredDevices.length, devices.length);
});

test('one device per hub, room, hot water, plug, valve and thermostat', () => {
  assert.deepEqual(
    devices.map((device) => device.name),
    [
      'Wiser HeatHub',
      'Living room',
      'Bedroom',
      'Office',
      'Hot water',
      'Towel rail',
      'Room thermostat - Living room',
      'Radiator valve - Living room 1',
      'Radiator valve - Living room 2',
      'Radiator valve - Bedroom',
    ],
  );
});

test('external ids come from the hub ids and serial numbers, never from names', () => {
  assert.equal(byName('Living room').external_id, gladys.externalId('room:1'));
  assert.equal(byName('Towel rail').external_id, gladys.externalId('smartplug:PLUG0030'));
  assert.equal(byName('Radiator valve - Bedroom').external_id, gladys.externalId('itrv:TRV00022'));
  const ids = devices.flatMap((device) => [
    device.external_id,
    ...device.features.map((f) => f.external_id),
  ]);
  assert.equal(new Set(ids).size, ids.length, 'every external id is unique');
});

test('every feature declares min and max', () => {
  for (const device of devices) {
    for (const feature of device.features) {
      assert.equal(typeof feature.min, 'number', `${feature.external_id} min`);
      assert.equal(typeof feature.max, 'number', `${feature.external_id} max`);
    }
  }
});

test('a room only gets humidity and window features its devices provide', () => {
  const keys = (name) => byName(name).features.map((f) => f.external_id.split(':').at(-1));
  assert.ok(keys('Living room').includes(ROOM_FEATURES.HUMIDITY));
  assert.ok(keys('Living room').includes(ROOM_FEATURES.WINDOW));
  assert.ok(!keys('Bedroom').includes(ROOM_FEATURES.HUMIDITY));
  assert.ok(!keys('Office').includes(ROOM_FEATURES.WINDOW));
});

test('the states carry the hub values, and skip the unknown ones', () => {
  const states = new Map(
    buildStates(gladys, model).map((s) => [s.device_feature_external_id, s.state]),
  );
  const living = byName('Living room').external_id;
  assert.equal(states.get(`${living}:${ROOM_FEATURES.TEMPERATURE}`), 19.5);
  assert.equal(states.get(`${living}:${ROOM_FEATURES.TARGET_TEMPERATURE}`), 21);
  assert.equal(states.get(`${living}:${ROOM_FEATURES.MODE}`), THERMOSTAT_MODE.AUTO);
  assert.equal(states.get(`${living}:${ROOM_FEATURES.WINDOW}`), 1, 'closed');

  const office = byName('Office').external_id;
  assert.equal(states.get(`${office}:${ROOM_FEATURES.MODE}`), THERMOSTAT_MODE.OFF);
  assert.equal(states.has(`${office}:${ROOM_FEATURES.TEMPERATURE}`), false, 'lost sensor');
  assert.equal(states.has(`${office}:${ROOM_FEATURES.TARGET_TEMPERATURE}`), false, 'off');

  const plug = byName('Towel rail').external_id;
  assert.equal(states.get(`${plug}:${PLUG_FEATURES.ENERGY}`), 123.456);

  const hub = byName('Wiser HeatHub').external_id;
  assert.equal(states.get(`${hub}:${HUB_FEATURES.ECO_MODE}`), 1);
});

test('Gladys accepts every state', async () => {
  const fresh = createFakeGladys();
  await fresh.publishStates(buildStates(fresh, model));
  assert.ok(fresh.fake.states.length > 20);
});

test('room commands: target temperature, modes and boost', () => {
  const living = byName('Living room');
  assert.deepEqual(commandsOf(living, ROOM_FEATURES.TARGET_TEMPERATURE, 22), [
    { path: 'Room/1', body: { RequestOverride: { Type: 'Manual', SetPoint: 220 } } },
  ]);
  assert.equal(
    commandsOf(living, ROOM_FEATURES.MODE, THERMOSTAT_MODE.AUTO).at(-1).body.Mode,
    'Auto',
  );
  assert.equal(commandsOf(living, ROOM_FEATURES.MODE, THERMOSTAT_MODE.OFF).length, 2);
  assert.deepEqual(commandsOf(living, ROOM_FEATURES.BOOST, 1)[0].body.RequestOverride, {
    Type: 'Boost',
    DurationMinutes: 60,
    IncreaseSetPointBy: 20,
  });
  assert.deepEqual(commandsOf(living, ROOM_FEATURES.BOOST, 0)[0].body, {
    RequestOverride: { Type: 'None' },
  });
  assert.throws(() => commandsOf(living, ROOM_FEATURES.TEMPERATURE, 20), /cannot be controlled/);
  assert.throws(() => commandsOf(living, ROOM_FEATURES.MODE, 7), /Unsupported/);
});

test('an Off room switched to Manual gets a set point back', () => {
  const office = byName('Office');
  // The office has no manual set point (-20 °C): its scheduled one is used.
  assert.deepEqual(commandsOf(office, ROOM_FEATURES.MODE, THERMOSTAT_MODE.HEATING).at(-1), {
    path: 'Room/3',
    body: { RequestOverride: { Type: 'Manual', SetPoint: 190 } },
  });
  // A Manual room keeps its own: no set point sent.
  const bedroom = byName('Bedroom');
  assert.equal(commandsOf(bedroom, ROOM_FEATURES.MODE, THERMOSTAT_MODE.HEATING).length, 2);
});

test('hub, hot water and plug commands', () => {
  const hub = byName('Wiser HeatHub');
  assert.deepEqual(commandsOf(hub, HUB_FEATURES.AWAY_MODE, 1)[0].body, {
    RequestOverride: { Type: 2 },
  });
  assert.throws(() => commandsOf(hub, HUB_FEATURES.AWAY_MODE, 3), /Expected 0 or 1/);

  const hotWater = byName('Hot water');
  assert.equal(
    commandsOf(hotWater, HOT_WATER_FEATURES.MODE, WATER_HEATER_MODE.PROGRAM)[0].body.Mode,
    'Auto',
  );
  assert.equal(
    commandsOf(hotWater, HOT_WATER_FEATURES.BOOST, 1)[0].body.RequestOverride.DurationMinutes,
    30,
  );

  const plug = byName('Towel rail');
  assert.deepEqual(commandsOf(plug, PLUG_FEATURES.ON_OFF, 0), [
    { path: 'SmartPlug/30', body: { RequestOutput: 'Off' } },
  ]);
  assert.throws(() => commandsOf(plug, PLUG_FEATURES.POWER, 10), /cannot be controlled/);
});

test('findRoom only returns rooms', () => {
  assert.equal(findRoom(gladys, model, byName('Bedroom').external_id).name, 'Bedroom');
  assert.equal(findRoom(gladys, model, byName('Towel rail').external_id), undefined);
  assert.equal(findRoom(gladys, null, byName('Bedroom').external_id), undefined);
});
