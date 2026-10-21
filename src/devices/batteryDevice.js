// -----------------------------------------------------------------------------
// Device types: RADIATOR VALVE (iTRV) and ROOM THERMOSTAT (RoomStat)
//
// The room device already carries the temperature, humidity and set point
// the hub computes from these devices. What only the device itself knows is
// published here: its battery, its radio link and, for a valve, the
// temperature next to the radiator (a device temperature, kept out of the
// room's average).
// Keyed by serial number, which survives a re-pairing (the hub id does not).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { PRODUCT_TYPES } from '../wiser/domain.js';
import { feature, state } from './helpers.js';

const DEVICE_TYPES = {
  [PRODUCT_TYPES.ITRV]: 'itrv',
  [PRODUCT_TYPES.ROOMSTAT]: 'roomstat',
};

const LABELS = {
  [PRODUCT_TYPES.ITRV]: 'Radiator valve',
  [PRODUCT_TYPES.ROOMSTAT]: 'Room thermostat',
};

export const BATTERY_DEVICE_FEATURES = {
  BATTERY: 'battery',
  SIGNAL: 'signal',
  TEMPERATURE: 'temperature',
};

function ids(gladys, device) {
  return gladys.externalIds(
    DEVICE_TYPES[device.productType],
    device.serial ?? `device-${device.id}`,
  );
}

/** "Radiator valve - Living room", numbered when a room has several. */
export function batteryDeviceName(device, model) {
  const label = LABELS[device.productType];
  if (!device.roomName) {
    return `${label} ${device.serial ?? device.id}`;
  }
  const siblings = model.batteryDevices.filter(
    (other) => other.productType === device.productType && other.roomId === device.roomId,
  );
  const rank = siblings.findIndex((other) => other.id === device.id) + 1;
  return siblings.length > 1
    ? `${label} - ${device.roomName} ${rank}`
    : `${label} - ${device.roomName}`;
}

export const batteryDevice = {
  key: 'battery-device',

  entities(model) {
    return model.batteryDevices;
  },

  externalIds: ids,

  buildDevice(gladys, entity, model) {
    const deviceIds = ids(gladys, entity);
    const features = [
      feature(deviceIds, BATTERY_DEVICE_FEATURES.BATTERY, {
        name: 'Battery',
        category: CATEGORIES.BATTERY,
        type: TYPES.BATTERY.INTEGER,
        unit: UNITS.PERCENT,
        min: 0,
        max: 100,
      }),
      feature(deviceIds, BATTERY_DEVICE_FEATURES.SIGNAL, {
        name: 'Signal',
        category: CATEGORIES.SIGNAL,
        type: TYPES.SIGNAL.QUALITY,
        min: 0,
        max: 5,
        keep_history: false,
      }),
    ];
    if (entity.productType === PRODUCT_TYPES.ITRV) {
      features.push(
        feature(deviceIds, BATTERY_DEVICE_FEATURES.TEMPERATURE, {
          name: 'Radiator temperature',
          category: CATEGORIES.DEVICE_TEMPERATURE_SENSOR,
          type: TYPES.SENSOR.DECIMAL,
          unit: UNITS.CELSIUS,
          min: -20,
          max: 100,
        }),
      );
    }
    return {
      name: batteryDeviceName(entity, model),
      external_id: deviceIds.device,
      model: entity.model,
      features,
    };
  },

  states(gladys, entity) {
    const deviceIds = ids(gladys, entity);
    return [
      ...state(deviceIds, BATTERY_DEVICE_FEATURES.BATTERY, entity.batteryPercent),
      ...state(deviceIds, BATTERY_DEVICE_FEATURES.SIGNAL, entity.signal),
      ...(entity.productType === PRODUCT_TYPES.ITRV
        ? state(deviceIds, BATTERY_DEVICE_FEATURES.TEMPERATURE, entity.temperature)
        : []),
    ];
  },

  identifyTargets(entity) {
    return [entity.id];
  },
};
