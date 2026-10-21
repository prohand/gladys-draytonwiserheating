import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  batteryPercent,
  fromWiserTemperature,
  parseDomain,
  signalQuality,
  toWiserSetpoint,
} from '../src/wiser/domain.js';
import { loadDomain } from './helpers/fakeHub.js';

const byName = (model, name) => model.rooms.find((room) => room.name === name);

test('hub temperatures are tenths of a degree, and the lost values are unknown', () => {
  assert.equal(fromWiserTemperature(195), 19.5);
  assert.equal(fromWiserTemperature(-15), -1.5);
  assert.equal(fromWiserTemperature(-32768), null, 'a room the hub lost sight of');
  assert.equal(fromWiserTemperature(2000), null, 'a valve the hub lost sight of');
  assert.equal(fromWiserTemperature(undefined), null);
  assert.equal(fromWiserTemperature('abc'), null);
});

test('set points go out in tenths, rounded to the half degree, within 5-30 °C', () => {
  assert.equal(toWiserSetpoint(21), 210);
  assert.equal(toWiserSetpoint(21.3), 215);
  assert.equal(toWiserSetpoint(21.2), 210);
  assert.equal(toWiserSetpoint(2), 50);
  assert.equal(toWiserSetpoint(35), 300);
});

test('the battery percent follows each product curve, or the level word', () => {
  assert.equal(batteryPercent({ ProductType: 'iTRV', BatteryVoltage: 30 }), 100);
  assert.equal(batteryPercent({ ProductType: 'iTRV', BatteryVoltage: 28 }), 60);
  assert.equal(batteryPercent({ ProductType: 'iTRV', BatteryVoltage: 22 }), 0);
  assert.equal(batteryPercent({ ProductType: 'RoomStat', BatteryVoltage: 27 }), 100);
  assert.equal(batteryPercent({ ProductType: 'RoomStat', BatteryVoltage: 22 }), 50);
  assert.equal(batteryPercent({ ProductType: 'ButtonPanel', BatteryLevel: 'OneThird' }), 33);
  assert.equal(batteryPercent({ ProductType: 'SmartPlug' }), null, 'mains powered');
});

test('the signal word maps to the 0-5 scale', () => {
  assert.equal(signalQuality({ DisplayedSignalStrength: 'VeryGood' }), 5);
  assert.equal(signalQuality({ DisplayedSignalStrength: 'NoSignal' }), 0);
  assert.equal(signalQuality({}), null);
});

test('rooms: temperature, set point, mode, heating, window and humidity', () => {
  const model = parseDomain(loadDomain());
  assert.equal(model.rooms.length, 3);

  const living = byName(model, 'Living room');
  assert.equal(living.temperature, 19.5);
  assert.equal(living.targetTemperature, 21);
  assert.equal(living.mode, 'auto');
  assert.equal(living.heating, true);
  assert.equal(living.hasHumidity, true);
  assert.equal(living.humidity, 52);
  assert.equal(living.hasWindow, true);
  assert.equal(living.windowOpen, false);
  assert.equal(living.boosted, false);

  const bedroom = byName(model, 'Bedroom');
  assert.equal(bedroom.mode, 'manual');
  assert.equal(bedroom.hasHumidity, false, 'no Room Thermostat in the bedroom');

  const office = byName(model, 'Office');
  assert.equal(office.mode, 'off', 'Manual at -20 °C is Off');
  assert.equal(office.off, true);
  assert.equal(office.targetTemperature, null);
  assert.equal(office.temperature, null);
  assert.equal(office.hasWindow, false);
});

test('a boost and the away mode are read from the set point origin', () => {
  const domain = loadDomain();
  domain.Room[0].SetpointOrigin = 'FromBoost';
  domain.Room[0].OverrideType = 'Manual';
  domain.Room[1].SetpointOrigin = 'FromAwayMode';
  domain.System.OverrideType = 'Away';
  const model = parseDomain(domain);
  assert.equal(model.rooms[0].boosted, true);
  assert.equal(model.rooms[0].overridden, true);
  assert.equal(model.rooms[1].away, true);
  assert.equal(model.system.awayMode, true);
});

test('battery devices are joined to their room', () => {
  const model = parseDomain(loadDomain());
  assert.deepEqual(
    model.batteryDevices.map((device) => [device.serial, device.roomName]),
    [
      ['RS000010', 'Living room'],
      ['TRV00020', 'Living room'],
      ['TRV00021', 'Living room'],
      ['TRV00022', 'Bedroom'],
    ],
  );
  const valve = model.batteryDevices.find((device) => device.serial === 'TRV00020');
  assert.equal(valve.temperature, 24.1, 'the temperature next to the radiator');
  assert.equal(valve.signal, 4);
  const lost = model.batteryDevices.find((device) => device.serial === 'TRV00022');
  assert.equal(lost.temperature, null, '2000 is a lost reading');
});

test('smart plugs, hot water and the system', () => {
  const model = parseDomain(loadDomain());
  assert.deepEqual(model.smartPlugs[0], {
    id: 30,
    deviceId: 30,
    name: 'Towel rail',
    serial: 'PLUG0030',
    on: true,
    auto: false,
    power: 450,
    energy: 123.456,
    signal: 4,
  });
  assert.deepEqual(model.hotWater, {
    id: 2,
    mode: 'auto',
    heating: false,
    boosted: false,
    overrideEndsAt: null,
  });
  assert.equal(model.system.ecoMode, true);
  assert.equal(model.system.heating, true);
  assert.equal(model.system.serial, 'HUB0001');
});

test('hot water in manual mode reads on or off', () => {
  const domain = loadDomain();
  domain.HotWater[0].Mode = 'Manual';
  domain.HotWater[0].WaterHeatingState = 'On';
  assert.equal(parseDomain(domain).hotWater.mode, 'on');
  domain.HotWater[0].WaterHeatingState = 'Off';
  assert.equal(parseDomain(domain).hotWater.mode, 'off');
  // A boost heats the water of a cylinder left off: still off once it ends.
  domain.HotWater[0].WaterHeatingState = 'On';
  domain.HotWater[0].OverrideType = 'Manual';
  domain.HotWater[0].OverrideTimeoutUnixTime = 1_900_000_000;
  const hotWater = parseDomain(domain).hotWater;
  assert.equal(hotWater.boosted, true);
  assert.equal(hotWater.mode, 'off');
});

test('a hub without hot water, plugs or valves still parses', () => {
  const model = parseDomain({ System: {}, Room: [{ id: 1, Name: 'Hall', Mode: 'Auto' }] });
  assert.equal(model.hotWater, null);
  assert.deepEqual(model.smartPlugs, []);
  assert.deepEqual(model.batteryDevices, []);
  assert.equal(model.rooms[0].temperature, null);
});
