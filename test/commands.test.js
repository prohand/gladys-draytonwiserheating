import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as commands from '../src/wiser/commands.js';

test('a room temperature is a Manual override, with an optional duration', () => {
  assert.deepEqual(commands.setRoomTemperature(3, 21.5), [
    { path: 'Room/3', body: { RequestOverride: { Type: 'Manual', SetPoint: 215 } } },
  ]);
  assert.deepEqual(commands.setRoomTemperature(3, 19, 90), [
    {
      path: 'Room/3',
      body: { RequestOverride: { Type: 'Manual', SetPoint: 190, DurationMinutes: 90 } },
    },
  ]);
});

test('Off is Manual at -20 °C, sent mode first', () => {
  assert.deepEqual(commands.setRoomOff(1), [
    { path: 'Room/1', body: { Mode: 'Manual' } },
    { path: 'Room/1', body: { RequestOverride: { Type: 'Manual', SetPoint: -200 } } },
  ]);
});

test('Schedule drops the override before switching to Auto', () => {
  assert.deepEqual(commands.setRoomAuto(1), [
    { path: 'Room/1', body: { RequestOverride: { Type: 'None' } } },
    { path: 'Room/1', body: { Mode: 'Auto' } },
  ]);
});

test('Manual sends a set point only when the room needs one', () => {
  assert.equal(commands.setRoomManual(1).length, 2);
  assert.deepEqual(commands.setRoomManual(1, 20).at(-1), {
    path: 'Room/1',
    body: { RequestOverride: { Type: 'Manual', SetPoint: 200 } },
  });
});

test('a boost raises the set point by tenths of a degree', () => {
  assert.deepEqual(commands.boostRoom(2, 2, 60), [
    {
      path: 'Room/2',
      body: { RequestOverride: { Type: 'Boost', DurationMinutes: 60, IncreaseSetPointBy: 20 } },
    },
  ]);
  assert.equal(commands.boostAllRooms(1.5, 30)[0].path, 'System');
  assert.equal(commands.boostAllRooms(1.5, 30)[0].body.RequestOverride.IncreaseSetPointBy, 15);
});

test('system commands: away mode, eco mode, cancel every override', () => {
  assert.deepEqual(commands.setAwayMode(true)[0].body, { RequestOverride: { Type: 2 } });
  assert.deepEqual(commands.setAwayMode(false)[0].body, { RequestOverride: { Type: 0 } });
  assert.deepEqual(commands.setEcoMode(1)[0].body, { EcoModeEnabled: true });
  assert.deepEqual(commands.cancelAllOverrides()[0].body, {
    RequestOverride: { Type: 'CancelUserOverrides' },
  });
});

test('hot water: schedule, on, off and boost', () => {
  assert.deepEqual(commands.setHotWaterAuto(2), [
    { path: 'HotWater/2', body: { Mode: 'Auto', RequestOverride: { Type: 'None' } } },
  ]);
  assert.deepEqual(commands.setHotWaterOn(2).at(-1).body, {
    RequestOverride: { Type: 'Manual', SetPoint: 1100 },
  });
  assert.deepEqual(commands.setHotWaterOff(2)[0].body, {
    Mode: 'Manual',
    ManualWaterHeatingState: 'Off',
    RequestOverride: { Type: 'None' },
  });
  assert.deepEqual(commands.boostHotWater(2, 30)[0].body, {
    RequestOverride: { Type: 'Manual', DurationMinutes: 30, SetPoint: 1100 },
  });
});

test('smart plug and identify', () => {
  assert.deepEqual(commands.setSmartPlug(30, false), [
    { path: 'SmartPlug/30', body: { RequestOutput: 'Off' } },
  ]);
  assert.deepEqual(commands.identifyDevice(20), [{ path: 'Device/20', body: { Identify: true } }]);
});
