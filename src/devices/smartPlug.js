// -----------------------------------------------------------------------------
// Device type: SMART PLUG
//
// Wiser smart plugs: on/off, instant power (W) and delivered energy (kWh).
// Keyed by their serial number, which survives a re-pairing (the hub id does
// not).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import * as commands from '../wiser/commands.js';
import { binaryValue, feature, featureKeyOf, state } from './helpers.js';

const DEVICE_TYPE = 'smartplug';

export const PLUG_FEATURES = {
  ON_OFF: 'on-off',
  POWER: 'power',
  ENERGY: 'energy',
  SIGNAL: 'signal',
};

function ids(gladys, plug) {
  return gladys.externalIds(DEVICE_TYPE, plug.serial ?? `plug-${plug.id}`);
}

export const smartPlug = {
  key: DEVICE_TYPE,

  entities(model) {
    return model.smartPlugs;
  },

  externalIds: ids,

  buildDevice(gladys, entity) {
    const plugIds = ids(gladys, entity);
    return {
      name: entity.name,
      external_id: plugIds.device,
      model: 'Wiser smart plug',
      features: [
        feature(plugIds, PLUG_FEATURES.ON_OFF, {
          name: 'On/Off',
          category: CATEGORIES.SWITCH,
          type: TYPES.SWITCH.BINARY,
          min: 0,
          max: 1,
          read_only: false,
          has_feedback: true,
        }),
        feature(plugIds, PLUG_FEATURES.POWER, {
          name: 'Power',
          category: CATEGORIES.SWITCH,
          type: TYPES.SWITCH.POWER,
          unit: UNITS.WATT,
          min: 0,
          // 16 A on 230 V: the plug's rating.
          max: 3680,
        }),
        feature(plugIds, PLUG_FEATURES.ENERGY, {
          name: 'Energy',
          category: CATEGORIES.SWITCH,
          type: TYPES.SWITCH.ENERGY,
          unit: UNITS.KILOWATT_HOUR,
          min: 0,
          max: 1_000_000,
        }),
        feature(plugIds, PLUG_FEATURES.SIGNAL, {
          name: 'Signal',
          category: CATEGORIES.SIGNAL,
          type: TYPES.SIGNAL.QUALITY,
          min: 0,
          max: 5,
          keep_history: false,
        }),
      ],
    };
  },

  states(gladys, entity) {
    const plugIds = ids(gladys, entity);
    return [
      ...state(plugIds, PLUG_FEATURES.ON_OFF, entity.on ? 1 : 0),
      ...state(plugIds, PLUG_FEATURES.POWER, entity.power),
      ...state(plugIds, PLUG_FEATURES.ENERGY, entity.energy),
      ...state(plugIds, PLUG_FEATURES.SIGNAL, entity.signal),
    ];
  },

  commandsFor(gladys, { entity, featureExternalId, value }) {
    const key = featureKeyOf(ids(gladys, entity), featureExternalId, PLUG_FEATURES);
    if (key !== PLUG_FEATURES.ON_OFF) {
      throw new Error(`The feature ${featureExternalId} cannot be controlled`);
    }
    return commands.setSmartPlug(entity.id, binaryValue(value));
  },

  identifyTargets(entity) {
    return [entity.deviceId];
  },
};
