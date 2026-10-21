// -----------------------------------------------------------------------------
// The commands of the hub, as data.
//
// Each builder returns the list of PATCH requests (`{ path, body }`) that does
// one thing, in the order the hub needs them. They are pure: the tests check
// the bodies without a hub, and the service sends them one after the other.
//
// The bodies are the ones the Wiser app sends, as documented by the reference
// Python library (aioWiserHeatAPI). A few things that look odd:
//   - "off" is not a mode: it is Manual with a set point of -20 °C;
//   - a temperature set while the room follows its schedule is an override
//     that lasts until the next slot of the schedule — the Wiser app does the
//     same;
//   - the away mode of the system is a numeric override type (2 on, 0 off).
// -----------------------------------------------------------------------------

import { WISER_HOT_WATER_ON, WISER_OFF_SETPOINT, toWiserSetpoint } from './domain.js';

const CANCEL_OVERRIDE = { RequestOverride: { Type: 'None' } };

const roomPath = (roomId) => `Room/${roomId}`;
const hotWaterPath = (hotWaterId) => `HotWater/${hotWaterId}`;

/** Set a room's target temperature (°C), optionally for a number of minutes. */
export function setRoomTemperature(roomId, celsius, durationMinutes = 0) {
  const override = { Type: 'Manual', SetPoint: toWiserSetpoint(celsius) };
  if (durationMinutes > 0) {
    override.DurationMinutes = Math.round(durationMinutes);
  }
  return [{ path: roomPath(roomId), body: { RequestOverride: override } }];
}

/** Follow the schedule again: drop the override, then the Auto mode. */
export function setRoomAuto(roomId) {
  return [
    { path: roomPath(roomId), body: CANCEL_OVERRIDE },
    { path: roomPath(roomId), body: { Mode: 'Auto' } },
  ];
}

/**
 * Fixed set point (Manual mode). The hub keeps the room's own manual set
 * point: `celsius` is sent along when the room was off, or it would stay off.
 */
export function setRoomManual(roomId, celsius) {
  const commands = [
    { path: roomPath(roomId), body: CANCEL_OVERRIDE },
    { path: roomPath(roomId), body: { Mode: 'Manual' } },
  ];
  if (celsius !== undefined && celsius !== null) {
    commands.push(...setRoomTemperature(roomId, celsius));
  }
  return commands;
}

/** Turn a room's heating off (Manual at -20 °C, what the Wiser app does). */
export function setRoomOff(roomId) {
  return [
    { path: roomPath(roomId), body: { Mode: 'Manual' } },
    {
      path: roomPath(roomId),
      body: { RequestOverride: { Type: 'Manual', SetPoint: WISER_OFF_SETPOINT } },
    },
  ];
}

/** Boost a room: `deltaCelsius` above its current temperature for `durationMinutes`. */
export function boostRoom(roomId, deltaCelsius, durationMinutes) {
  return [
    {
      path: roomPath(roomId),
      body: {
        RequestOverride: {
          Type: 'Boost',
          DurationMinutes: Math.round(durationMinutes),
          IncreaseSetPointBy: Math.round(Number(deltaCelsius) * 10),
        },
      },
    },
  ];
}

/** Drop a room's override (boost, temporary temperature): back to its schedule or manual set point. */
export function cancelRoomOverride(roomId) {
  return [{ path: roomPath(roomId), body: CANCEL_OVERRIDE }];
}

/** Boost every room at once (one request to the system). */
export function boostAllRooms(deltaCelsius, durationMinutes) {
  return [
    {
      path: 'System',
      body: {
        RequestOverride: {
          Type: 'Boost',
          DurationMinutes: Math.round(durationMinutes),
          IncreaseSetPointBy: Math.round(Number(deltaCelsius) * 10),
        },
      },
    },
  ];
}

/** Cancel the overrides of every room (boosts and temporary temperatures). */
export function cancelAllOverrides() {
  return [{ path: 'System', body: { RequestOverride: { Type: 'CancelUserOverrides' } } }];
}

/** Away mode of the whole home. */
export function setAwayMode(enabled) {
  return [{ path: 'System', body: { RequestOverride: { Type: enabled ? 2 : 0 } } }];
}

/** Eco mode of the whole home (the hub's own optimisation of the start times). */
export function setEcoMode(enabled) {
  return [{ path: 'System', body: { EcoModeEnabled: Boolean(enabled) } }];
}

/** Hot water follows its schedule. */
export function setHotWaterAuto(hotWaterId) {
  return [{ path: hotWaterPath(hotWaterId), body: { Mode: 'Auto', ...CANCEL_OVERRIDE } }];
}

/** Hot water stays on until told otherwise. */
export function setHotWaterOn(hotWaterId) {
  return [
    { path: hotWaterPath(hotWaterId), body: { Mode: 'Manual' } },
    {
      path: hotWaterPath(hotWaterId),
      body: { RequestOverride: { Type: 'Manual', SetPoint: WISER_HOT_WATER_ON } },
    },
  ];
}

/** Hot water stays off until told otherwise. */
export function setHotWaterOff(hotWaterId) {
  return [
    {
      path: hotWaterPath(hotWaterId),
      body: { Mode: 'Manual', ManualWaterHeatingState: 'Off', ...CANCEL_OVERRIDE },
    },
  ];
}

/** Heat the water now for `durationMinutes`, whatever the mode. */
export function boostHotWater(hotWaterId, durationMinutes) {
  return [
    {
      path: hotWaterPath(hotWaterId),
      body: {
        RequestOverride: {
          Type: 'Manual',
          DurationMinutes: Math.round(durationMinutes),
          SetPoint: WISER_HOT_WATER_ON,
        },
      },
    },
  ];
}

/** End a hot water boost. */
export function cancelHotWaterBoost(hotWaterId) {
  return [{ path: hotWaterPath(hotWaterId), body: CANCEL_OVERRIDE }];
}

/** Switch a smart plug on or off. */
export function setSmartPlug(plugId, on) {
  return [{ path: `SmartPlug/${plugId}`, body: { RequestOutput: on ? 'On' : 'Off' } }];
}

/** Make a device signal itself (LEDs blink on a valve or a thermostat). */
export function identifyDevice(deviceId) {
  return [{ path: `Device/${deviceId}`, body: { Identify: true } }];
}
