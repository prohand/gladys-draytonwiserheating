// -----------------------------------------------------------------------------
// Device type: HOT WATER
//
// Published only when the hub drives a hot water cylinder (a combi boiler has
// none). A water heater device in Gladys:
//   - mode: Off / On / Schedule (Wiser: Manual off, Manual on, Auto);
//   - heating: whether the water is being heated right now;
//   - boost: on = heat for `hot_water_boost_duration` minutes, whatever the mode.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
} from '@gladysassistant/integration-sdk';
import * as commands from '../wiser/commands.js';
import { binaryValue, feature, featureKeyOf, state } from './helpers.js';

const DEVICE_TYPE = 'hot-water';

export const HOT_WATER_FEATURES = {
  MODE: 'mode',
  HEATING: 'heating',
  BOOST: 'boost',
};

// Gladys' WATER_HEATER_MODE values (not exported by the SDK).
export const WATER_HEATER_MODE = { OFF: 0, MANUAL: 4, PROGRAM: 6 };

const MODE_VALUE = {
  off: WATER_HEATER_MODE.OFF,
  on: WATER_HEATER_MODE.MANUAL,
  auto: WATER_HEATER_MODE.PROGRAM,
};

function ids(gladys, hotWater) {
  return gladys.externalIds(DEVICE_TYPE, String(hotWater.id));
}

export const hotWater = {
  key: DEVICE_TYPE,

  entities(model) {
    return model.hotWater ? [model.hotWater] : [];
  },

  externalIds: ids,

  buildDevice(gladys, entity) {
    const hotWaterIds = ids(gladys, entity);
    return {
      name: 'Hot water',
      external_id: hotWaterIds.device,
      model: 'Wiser hot water',
      features: [
        feature(hotWaterIds, HOT_WATER_FEATURES.MODE, {
          name: 'Mode',
          category: CATEGORIES.WATER_HEATER,
          type: TYPES.WATER_HEATER.MODE,
          min: 0,
          max: 6,
          read_only: false,
          has_feedback: true,
          supported_options: [
            { value: WATER_HEATER_MODE.OFF, label: 'Off', sort_order: 0 },
            { value: WATER_HEATER_MODE.MANUAL, label: 'On', sort_order: 1 },
            { value: WATER_HEATER_MODE.PROGRAM, label: 'Schedule', sort_order: 2 },
          ],
        }),
        feature(hotWaterIds, HOT_WATER_FEATURES.HEATING, {
          name: 'Heating',
          category: CATEGORIES.WATER_HEATER,
          type: TYPES.WATER_HEATER.HEATING,
          min: 0,
          max: 1,
        }),
        feature(hotWaterIds, HOT_WATER_FEATURES.BOOST, {
          name: 'Boost',
          category: CATEGORIES.WATER_HEATER,
          type: TYPES.WATER_HEATER.BOOST,
          min: 0,
          max: 1,
          read_only: false,
          has_feedback: true,
          keep_history: false,
        }),
      ],
    };
  },

  states(gladys, entity) {
    const hotWaterIds = ids(gladys, entity);
    return [
      ...state(hotWaterIds, HOT_WATER_FEATURES.MODE, MODE_VALUE[entity.mode]),
      ...state(hotWaterIds, HOT_WATER_FEATURES.HEATING, entity.heating ? 1 : 0),
      ...state(hotWaterIds, HOT_WATER_FEATURES.BOOST, entity.boosted ? 1 : 0),
    ];
  },

  commandsFor(gladys, { entity, featureExternalId, value, config }) {
    const key = featureKeyOf(ids(gladys, entity), featureExternalId, HOT_WATER_FEATURES);
    switch (key) {
      case HOT_WATER_FEATURES.MODE:
        switch (Number(value)) {
          case WATER_HEATER_MODE.OFF:
            return commands.setHotWaterOff(entity.id);
          case WATER_HEATER_MODE.MANUAL:
            return commands.setHotWaterOn(entity.id);
          case WATER_HEATER_MODE.PROGRAM:
            return commands.setHotWaterAuto(entity.id);
          default:
            throw new Error(`Unsupported hot water mode: ${value}`);
        }
      case HOT_WATER_FEATURES.BOOST:
        return binaryValue(value)
          ? commands.boostHotWater(entity.id, config.hot_water_boost_duration)
          : commands.cancelHotWaterBoost(entity.id);
      default:
        throw new Error(`The feature ${featureExternalId} cannot be controlled`);
    }
  },
};
