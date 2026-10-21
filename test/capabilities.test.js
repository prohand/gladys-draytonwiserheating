// -----------------------------------------------------------------------------
// Scene actions, scene triggers, dashboard widgets and Configuration actions.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { WiserService } from '../src/service.js';
import { normalizeConfig } from '../src/config.js';
import { SCENE_ACTIONS } from '../src/capabilities/scenes.js';
import { SCENE_TRIGGERS, connectionEvent, detectEvents } from '../src/capabilities/triggers.js';
import {
  HEATING_OVERVIEW_WIDGET,
  ROOM_WIDGET,
  WIDGETS,
  formatTemperature,
  refreshWidgets,
} from '../src/capabilities/widgets.js';
import { ACTIONS } from '../src/actions.js';
import { parseDomain } from '../src/wiser/domain.js';
import { buildDiscoveredDevices } from '../src/devices/index.js';
import { LANGUAGES } from '../src/i18n.js';
import { clientFactory, createFakeHub, HUB_ERRORS, loadDomain } from './helpers/fakeHub.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const config = normalizeConfig({ hub_host: '192.168.1.40', hub_secret: 's3cr3t' });

const declarationOf = (list, key) => manifest[list].find((entry) => entry.key === key);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

async function setup(domain) {
  const gladys = createFakeGladys();
  const hub = createFakeHub(domain);
  const service = new WiserService(gladys, { createClient: clientFactory(hub) });
  service.configure(config);
  await service.refresh();
  const roomId = (id) => gladys.externalId(`room:${id}`);
  return { gladys, hub, service, roomId };
}

const hasEveryLanguage = (text) =>
  typeof text === 'string' || LANGUAGES.every((language) => typeof text?.[language] === 'string');

// --- Scene actions -----------------------------------------------------------

test('every scene action returns only its declared outputs', async () => {
  const { service, roomId } = await setup();
  const fieldsOf = {
    boost_room: { device: roomId(1), delta: 2, duration: 30 },
    set_room_temperature: { device: roomId(1), temperature: 22, duration: 0 },
    cancel_overrides: { device: roomId(1) },
    set_away_mode: { enabled: true },
    boost_hot_water: { duration: 30 },
  };
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    const outputs = await handler(service, { fields: fieldsOf[key], config });
    const declared = keysOf(declarationOf('scene_actions', key).outputs);
    assert.deepEqual(Object.keys(outputs), declared, `${key} outputs`);
    for (const value of Object.values(outputs)) {
      assert.notEqual(typeof value, 'object', `${key}: outputs are scalars`);
    }
  }
  service.stop();
});

test('boost_room boosts one room, or every room without one', async () => {
  const { hub, service, roomId } = await setup();
  await SCENE_ACTIONS.boost_room(service, {
    fields: { device: roomId(2), delta: 1.5, duration: 45 },
    config,
  });
  assert.deepEqual(hub.patches.at(-1), {
    path: 'Room/2',
    body: { RequestOverride: { Type: 'Boost', DurationMinutes: 45, IncreaseSetPointBy: 15 } },
  });
  await SCENE_ACTIONS.boost_room(service, { fields: {}, config });
  assert.equal(hub.patches.at(-1).path, 'System');
  assert.equal(hub.patches.at(-1).body.RequestOverride.DurationMinutes, config.boost_duration);
});

test('a scene action on something that is not a room says so in its output', async () => {
  const { gladys, hub, service } = await setup();
  const plug = gladys.externalId('smartplug:PLUG0030');
  assert.deepEqual(
    await SCENE_ACTIONS.set_room_temperature(service, {
      fields: { device: plug, temperature: 20 },
      config,
    }),
    { applied: false },
  );
  assert.deepEqual(await SCENE_ACTIONS.boost_room(service, { fields: { device: plug }, config }), {
    boosted: false,
  });
  assert.equal(hub.patches.length, 0, 'nothing sent to the hub');
});

test('set_room_temperature: duration 0 lasts until the next schedule slot', async () => {
  const { hub, service, roomId } = await setup();
  await SCENE_ACTIONS.set_room_temperature(service, {
    fields: { device: roomId(1), temperature: 18.5, duration: 0 },
    config,
  });
  assert.deepEqual(hub.patches.at(-1).body, {
    RequestOverride: { Type: 'Manual', SetPoint: 185 },
  });
});

test('boost_hot_water without hot water is an output, not a failure', async () => {
  const domain = loadDomain();
  delete domain.HotWater;
  const { hub, service } = await setup(domain);
  assert.deepEqual(await SCENE_ACTIONS.boost_hot_water(service, { fields: {}, config }), {
    boosted: false,
  });
  assert.equal(hub.patches.length, 0);
});

test('a hub that refuses the command fails the scene action', async () => {
  const { hub, service } = await setup();
  hub.fail(HUB_ERRORS.UNREACHABLE);
  await assert.rejects(
    SCENE_ACTIONS.set_away_mode(service, { fields: { enabled: true }, config }),
    /fake failure/,
  );
});

// --- Scene triggers ----------------------------------------------------------

test('every trigger event only carries keys its declaration lists', () => {
  const gladys = createFakeGladys();
  const before = parseDomain(loadDomain());
  const domain = loadDomain();
  domain.Room[0].WindowState = 'Open';
  domain.System.OverrideType = 'Away';
  domain.Device.find((device) => device.id === 20).BatteryLevel = 'Critical';
  const events = [
    ...detectEvents(gladys, before, parseDomain(domain)),
    connectionEvent(false, HUB_ERRORS.UNREACHABLE),
  ];
  assert.deepEqual(
    events.map((event) => event.key),
    [
      SCENE_TRIGGERS.WINDOW_CHANGED,
      SCENE_TRIGGERS.AWAY_MODE_CHANGED,
      SCENE_TRIGGERS.BATTERY_LOW,
      SCENE_TRIGGERS.HUB_CONNECTION_CHANGED,
    ],
  );
  for (const { key, data } of events) {
    const trigger = declarationOf('scene_triggers', key);
    const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
    for (const [dataKey, value] of Object.entries(data)) {
      assert.ok(declared.includes(dataKey), `${key}: data.${dataKey} is not declared`);
      assert.ok(value === null || typeof value !== 'object', `${key}: data.${dataKey} is flat`);
    }
    // A multi_select filter only matches the values it offers.
    for (const field of trigger.fields.filter((f) => f.type === 'multi_select')) {
      assert.ok(
        field.options.some((option) => option.value === data[field.key]),
        `${key}: data.${field.key} "${data[field.key]}" is one of the filter options`,
      );
    }
  }
});

test('no trigger fires at the first read', () => {
  assert.deepEqual(detectEvents(createFakeGladys(), null, parseDomain(loadDomain())), []);
});

// --- Widgets -----------------------------------------------------------------

const request = (settings = {}, units = 'metric') => ({
  settings,
  language: 'en',
  units,
  config,
});

test('the overview content is rendered exactly as sent', async () => {
  const { service } = await setup();
  const content = await WIDGETS[HEATING_OVERVIEW_WIDGET].get(service, request());
  assert.deepEqual(validateWidgetContent(content), []);
  const list = content.components.find((c) => c.type === 'card-list');
  assert.deepEqual(
    list.items.map((item) => item.title),
    ['Living room', 'Bedroom', 'Office'],
  );
  assert.equal(list.items[0].subtitle.en, '19.5 °C → 21.0 °C · Schedule');
  assert.equal(list.items[2].subtitle.fr, '– · Arrêt');
});

test('the overview without a hub read is valid too, and says why it is empty', async () => {
  const gladys = createFakeGladys();
  const service = new WiserService(gladys);
  service.configure(normalizeConfig({}));
  const content = await WIDGETS[HEATING_OVERVIEW_WIDGET].get(service, request());
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].type, 'text');
});

test('the room widget binds live tiles to features the integration publishes', async () => {
  const { gladys, service, roomId } = await setup();
  const content = await WIDGETS[ROOM_WIDGET].get(service, request({ room: roomId(1) }));
  assert.deepEqual(validateWidgetContent(content), []);
  const featureIds = new Set(
    buildDiscoveredDevices(gladys, service.model).flatMap((d) =>
      d.features.map((f) => f.external_id),
    ),
  );
  const tiles = content.components.filter((c) => c.device_feature);
  assert.equal(tiles.length, 3, 'temperature, target, humidity');
  for (const tile of tiles) {
    assert.ok(featureIds.has(tile.device_feature), `unknown feature ${tile.device_feature}`);
  }
});

test('the room widget on a device that is not a room asks for a room', async () => {
  const { gladys, service } = await setup();
  const content = await WIDGETS[ROOM_WIDGET].get(
    service,
    request({ room: gladys.externalId('smartplug:PLUG0030') }),
  );
  assert.deepEqual(validateWidgetContent(content), []);
  assert.match(content.components[0].text.en, /Pick a room/);
});

test('every widget button is handled and answers a short toast in every language', async () => {
  const { hub, service, roomId } = await setup();
  for (const [key, settings] of [
    [HEATING_OVERVIEW_WIDGET, {}],
    [ROOM_WIDGET, { room: roomId(3) }],
  ]) {
    const content = await WIDGETS[key].get(service, request(settings));
    const buttons = content.components.filter((c) => c.type === 'button' && c.action);
    assert.ok(buttons.length > 0);
    for (const { action } of buttons) {
      const values = Object.fromEntries((action.fields ?? []).map((f) => [f.key, f.default]));
      const toast = await WIDGETS[key].action(service, {
        actionKey: action.key,
        params: action.params ?? {},
        settings,
        values,
        config,
      });
      assert.ok(hasEveryLanguage(toast), `${key}.${action.key}: toast in every language`);
      assert.ok(toast.en.length <= 200, 'toasts are capped at 200 characters');
    }
  }
  assert.ok(hub.patches.length >= 5);
  service.stop();
});

test('the room boost button takes the values typed in its form', async () => {
  const { hub, service, roomId } = await setup();
  await WIDGETS[ROOM_WIDGET].action(service, {
    actionKey: 'boost',
    params: { room: roomId(2) },
    settings: { room: roomId(2) },
    values: { delta: 3, duration: 90 },
    config,
  });
  assert.deepEqual(hub.patches.at(-1).body.RequestOverride, {
    Type: 'Boost',
    DurationMinutes: 90,
    IncreaseSetPointBy: 30,
  });
});

test('an unknown widget action fails, so the user sees the error', async () => {
  const { service, roomId } = await setup();
  await assert.rejects(
    WIDGETS[HEATING_OVERVIEW_WIDGET].action(service, { actionKey: 'nope', params: {}, config }),
    /Unknown widget action/,
  );
  await assert.rejects(
    WIDGETS[ROOM_WIDGET].action(service, {
      actionKey: 'nope',
      params: { room: roomId(1) },
      config,
    }),
    /Unknown widget action/,
  );
});

test('temperatures follow the units of the viewer', () => {
  assert.equal(formatTemperature(20, 'metric'), '20.0 °C');
  assert.equal(formatTemperature(20, 'imperial'), '68.0 °F');
  assert.equal(formatTemperature(null, 'metric'), '–');
});

test('refreshWidgets nudges every widget', () => {
  const gladys = createFakeGladys();
  refreshWidgets(gladys);
  assert.deepEqual(gladys.fake.widgetRefreshes, Object.keys(WIDGETS));
});

// --- Configuration screen actions -------------------------------------------

test('Test the connection says what the hub serves, or what to fix', async () => {
  const { hub, service } = await setup();
  const ok = await ACTIONS.test_connection(service, { fields: {}, config });
  assert.ok(hasEveryLanguage(ok));
  assert.match(ok.en, /HeatHub OK \(HTTP, firmware 3\.14\.0\): 3 room\(s\), 5 device\(s\)/);

  hub.fail(HUB_ERRORS.UNAUTHORIZED);
  const refused = await ACTIONS.test_connection(service, { fields: {}, config });
  assert.match(refused.en, /refused the secret/);
  assert.ok(hasEveryLanguage(refused));
});

test('identify makes the devices of a room blink, and says when nothing can', async () => {
  const { gladys, hub, service, roomId } = await setup();
  const answer = await ACTIONS.identify(service, { fields: { device: roomId(1) }, config });
  assert.match(answer.en, /blinking/);
  assert.deepEqual(
    hub.patches.map((patch) => patch.path),
    ['Device/20', 'Device/21', 'Device/10'],
  );
  const hubDevice = gladys.externalId('hub:heathub');
  const none = await ACTIONS.identify(service, { fields: { device: hubDevice }, config });
  assert.match(none.en, /no way to signal/);
  service.stop();
});
