// -----------------------------------------------------------------------------
// Scene triggers (SDK v0.14+, Gladys 5.1+).
//
// A trigger says "this happened, with these details": it is fired once per
// transition the integration OBSERVES between two reads of the hub. The
// values themselves (window, away mode, battery) stay device features; the
// events add what a feature cannot carry — which room, which device, why the
// hub was lost — in one card instead of one per device.
//
// Rules that matter here:
//   - no event at the first read: a transition needs a "before";
//   - no event for a change the integration made itself (a scene that turns
//     away mode on when away mode changes would loop): the service tells
//     `detectEvents` what it is waiting for;
//   - `data` is flat and only carries the keys the manifest declares.
// -----------------------------------------------------------------------------

import { LOW_BATTERY_LEVELS } from '../wiser/domain.js';
import { batteryDevice, batteryDeviceName } from '../devices/batteryDevice.js';
import { roomExternalId } from '../devices/index.js';

export const SCENE_TRIGGERS = {
  WINDOW_CHANGED: 'window_changed',
  AWAY_MODE_CHANGED: 'away_mode_changed',
  BATTERY_LOW: 'battery_low',
  HUB_CONNECTION_CHANGED: 'hub_connection_changed',
};

export const SCENE_TRIGGER_KEYS = Object.values(SCENE_TRIGGERS);

const isLow = (device) => LOW_BATTERY_LEVELS.includes(device.batteryLevel);

/**
 * The scene events between two reads of the hub.
 * @param {object} gladys the SDK client (external ids)
 * @param {object | null} previous the model of the previous read
 * @param {object} next the model just read
 * @param {(key: string, value: unknown) => boolean} [isExpected] true for a change the integration asked for
 * @returns {{ key: string, data: Record<string, unknown> }[]}
 */
export function detectEvents(gladys, previous, next, isExpected = () => false) {
  if (!previous) {
    return [];
  }
  const events = [];

  const previousRooms = new Map(previous.rooms.map((room) => [room.id, room]));
  for (const room of next.rooms) {
    const before = previousRooms.get(room.id);
    if (
      before &&
      before.windowOpen !== null &&
      room.windowOpen !== null &&
      before.windowOpen !== room.windowOpen
    ) {
      events.push({
        key: SCENE_TRIGGERS.WINDOW_CHANGED,
        data: {
          device: roomExternalId(gladys, room),
          room: room.name,
          state: room.windowOpen ? 'open' : 'closed',
        },
      });
    }
  }

  if (previous.system.awayMode !== next.system.awayMode) {
    if (!isExpected(SCENE_TRIGGERS.AWAY_MODE_CHANGED, next.system.awayMode)) {
      events.push({
        key: SCENE_TRIGGERS.AWAY_MODE_CHANGED,
        data: { state: next.system.awayMode ? 'on' : 'off' },
      });
    }
  }

  const previousDevices = new Map(previous.batteryDevices.map((device) => [device.id, device]));
  for (const device of next.batteryDevices) {
    const before = previousDevices.get(device.id);
    if (before && !isLow(before) && isLow(device)) {
      events.push({
        key: SCENE_TRIGGERS.BATTERY_LOW,
        data: {
          device: batteryDevice.externalIds(gladys, device).device,
          device_name: batteryDeviceName(device, next),
          room: device.roomName,
          level: device.batteryLevel,
          battery: device.batteryPercent,
        },
      });
    }
  }

  return events;
}

/** The event of the hub lost (`reason`: a HUB_ERRORS code) or found again. */
export function connectionEvent(connected, reason = null) {
  return {
    key: SCENE_TRIGGERS.HUB_CONNECTION_CHANGED,
    data: { state: connected ? 'restored' : 'lost', reason: connected ? null : reason },
  };
}
