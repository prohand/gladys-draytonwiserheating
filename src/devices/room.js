// -----------------------------------------------------------------------------
// Device type: ROOM
//
// A Wiser room is what the app shows as a tile: a temperature, a set point,
// a mode, and the valves / thermostat that serve it. Gladys gets it as a
// thermostat device:
//   - temperature (calculated by the hub from the room's sensors), humidity
//     when a Room Thermostat serves it;
//   - target temperature: in Schedule mode, setting it lasts until the next
//     slot of the schedule (like the Wiser app); in Manual mode it stays;
//   - mode: Off / Manual / Schedule (the Wiser app's Off / Manual / Auto);
//   - operating state: heating or idle;
//   - boost: on = +`boost_delta` °C for `boost_duration` minutes;
//   - window: open / closed, when a valve detects it.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { SETPOINT_MAX, SETPOINT_MIN } from '../wiser/domain.js';
import * as commands from '../wiser/commands.js';
import { binaryValue, feature, featureKeyOf, state } from './helpers.js';

const DEVICE_TYPE = 'room';

export const ROOM_FEATURES = {
  TEMPERATURE: 'temperature',
  HUMIDITY: 'humidity',
  TARGET_TEMPERATURE: 'target-temperature',
  MODE: 'mode',
  OPERATING_STATE: 'operating-state',
  BOOST: 'boost',
  WINDOW: 'window',
};

// Gladys' THERMOSTAT_MODE values (not exported by the SDK): the hvac_mode of
// Home Assistant, where AUTO means "follows a schedule".
export const THERMOSTAT_MODE = { OFF: 0, HEATING: 1, AUTO: 3 };
const THERMOSTAT_OPERATING_STATE = { IDLE: 0, HEATING: 1 };
// Gladys' OPENING_SENSOR_STATE.
const OPENING = { OPEN: 0, CLOSED: 1 };

const MODE_VALUE = {
  off: THERMOSTAT_MODE.OFF,
  manual: THERMOSTAT_MODE.HEATING,
  auto: THERMOSTAT_MODE.AUTO,
};

// Set point used when a room switched off goes back to Manual and the hub has
// no manual set point of its own to resume.
const FALLBACK_MANUAL_SETPOINT = 20;

function ids(gladys, room) {
  return gladys.externalIds(DEVICE_TYPE, String(room.id));
}

export const room = {
  key: DEVICE_TYPE,

  entities(model) {
    return model.rooms;
  },

  externalIds: ids,

  buildDevice(gladys, entity) {
    const roomIds = ids(gladys, entity);
    const features = [
      feature(roomIds, ROOM_FEATURES.TEMPERATURE, {
        name: 'Temperature',
        category: CATEGORIES.TEMPERATURE_SENSOR,
        type: TYPES.SENSOR.DECIMAL,
        unit: UNITS.CELSIUS,
        min: -20,
        max: 50,
      }),
    ];
    if (entity.hasHumidity) {
      features.push(
        feature(roomIds, ROOM_FEATURES.HUMIDITY, {
          name: 'Humidity',
          category: CATEGORIES.HUMIDITY_SENSOR,
          type: TYPES.SENSOR.INTEGER,
          unit: UNITS.PERCENT,
          min: 0,
          max: 100,
        }),
      );
    }
    features.push(
      feature(roomIds, ROOM_FEATURES.TARGET_TEMPERATURE, {
        name: 'Target temperature',
        category: CATEGORIES.THERMOSTAT,
        type: TYPES.THERMOSTAT.TARGET_TEMPERATURE,
        unit: UNITS.CELSIUS,
        min: SETPOINT_MIN,
        max: SETPOINT_MAX,
        read_only: false,
        has_feedback: true,
      }),
      feature(roomIds, ROOM_FEATURES.MODE, {
        name: 'Mode',
        category: CATEGORIES.THERMOSTAT,
        type: TYPES.THERMOSTAT.MODE,
        min: 0,
        max: 3,
        read_only: false,
        has_feedback: true,
        supported_options: [
          { value: THERMOSTAT_MODE.OFF, label: 'Off', sort_order: 0 },
          { value: THERMOSTAT_MODE.HEATING, label: 'Manual', sort_order: 1 },
          { value: THERMOSTAT_MODE.AUTO, label: 'Schedule', sort_order: 2 },
        ],
      }),
      feature(roomIds, ROOM_FEATURES.OPERATING_STATE, {
        name: 'Heating',
        category: CATEGORIES.THERMOSTAT,
        type: TYPES.THERMOSTAT.OPERATING_STATE,
        min: 0,
        max: 2,
      }),
      feature(roomIds, ROOM_FEATURES.BOOST, {
        name: 'Boost',
        category: CATEGORIES.SWITCH,
        type: TYPES.SWITCH.BINARY,
        min: 0,
        max: 1,
        read_only: false,
        has_feedback: true,
        keep_history: false,
      }),
    );
    if (entity.hasWindow) {
      features.push(
        feature(roomIds, ROOM_FEATURES.WINDOW, {
          name: 'Window',
          category: CATEGORIES.OPENING_SENSOR,
          type: TYPES.SENSOR.BINARY,
          min: 0,
          max: 1,
        }),
      );
    }
    return {
      name: entity.name,
      external_id: roomIds.device,
      model: 'Wiser room',
      features,
    };
  },

  states(gladys, entity) {
    const roomIds = ids(gladys, entity);
    return [
      ...state(roomIds, ROOM_FEATURES.TEMPERATURE, entity.temperature),
      ...(entity.hasHumidity ? state(roomIds, ROOM_FEATURES.HUMIDITY, entity.humidity) : []),
      // "Off" has no set point to show: the mode says it.
      ...state(roomIds, ROOM_FEATURES.TARGET_TEMPERATURE, entity.targetTemperature),
      ...state(roomIds, ROOM_FEATURES.MODE, MODE_VALUE[entity.mode]),
      ...state(
        roomIds,
        ROOM_FEATURES.OPERATING_STATE,
        entity.heating ? THERMOSTAT_OPERATING_STATE.HEATING : THERMOSTAT_OPERATING_STATE.IDLE,
      ),
      ...state(roomIds, ROOM_FEATURES.BOOST, entity.boosted ? 1 : 0),
      ...(entity.hasWindow && entity.windowOpen !== null
        ? state(roomIds, ROOM_FEATURES.WINDOW, entity.windowOpen ? OPENING.OPEN : OPENING.CLOSED)
        : []),
    ];
  },

  /** The PATCH requests a Gladys command turns into. */
  commandsFor(gladys, { entity, featureExternalId, value, config }) {
    const key = featureKeyOf(ids(gladys, entity), featureExternalId, ROOM_FEATURES);
    switch (key) {
      case ROOM_FEATURES.TARGET_TEMPERATURE:
        if (!Number.isFinite(Number(value))) {
          throw new Error(`Invalid temperature: ${value}`);
        }
        return commands.setRoomTemperature(entity.id, Number(value));
      case ROOM_FEATURES.MODE:
        return modeCommands(entity, Number(value));
      case ROOM_FEATURES.BOOST:
        return binaryValue(value)
          ? commands.boostRoom(entity.id, config.boost_delta, config.boost_duration)
          : commands.cancelRoomOverride(entity.id);
      default:
        throw new Error(`The feature ${featureExternalId} cannot be controlled`);
    }
  },

  /** The devices that blink when the room is identified: its valves and thermostat. */
  identifyTargets(entity) {
    return [...entity.smartValveIds, ...(entity.roomStatId !== null ? [entity.roomStatId] : [])];
  },
};

function modeCommands(entity, mode) {
  switch (mode) {
    case THERMOSTAT_MODE.OFF:
      return commands.setRoomOff(entity.id);
    case THERMOSTAT_MODE.HEATING:
      // Resume the room's own manual set point; a room that was off has none
      // the hub would use, so send one along.
      return commands.setRoomManual(
        entity.id,
        entity.off
          ? (validSetpoint(entity.manualTemperature) ??
              validSetpoint(entity.scheduledTemperature) ??
              FALLBACK_MANUAL_SETPOINT)
          : undefined,
      );
    case THERMOSTAT_MODE.AUTO:
      return commands.setRoomAuto(entity.id);
    default:
      throw new Error(`Unsupported thermostat mode: ${mode}`);
  }
}

function validSetpoint(celsius) {
  return celsius !== null && celsius >= SETPOINT_MIN && celsius <= SETPOINT_MAX ? celsius : null;
}
