// -----------------------------------------------------------------------------
// Device type: HEATHUB
//
// The hub itself carries what concerns the whole home:
//   - away mode (every room drops to the away temperature set in the app);
//   - eco mode (the hub's own optimisation of the start times);
//   - boiler: whether the heating relay is calling for heat.
// One hub per integration: its id is a constant, so a hub replaced under the
// same configuration keeps the same Gladys device.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
} from '@gladysassistant/integration-sdk';
import * as commands from '../wiser/commands.js';
import { binaryValue, feature, featureKeyOf, state } from './helpers.js';

const DEVICE_TYPE = 'hub';
const PLATFORM_ID = 'heathub';

export const HUB_FEATURES = {
  AWAY_MODE: 'away-mode',
  ECO_MODE: 'eco-mode',
  BOILER: 'boiler',
};

function ids(gladys) {
  return gladys.externalIds(DEVICE_TYPE, PLATFORM_ID);
}

export const hub = {
  key: DEVICE_TYPE,

  // Always one entity: the system part of the model.
  entities(model) {
    return [model.system];
  },

  externalIds: ids,

  buildDevice(gladys) {
    const hubIds = ids(gladys);
    return {
      name: 'Wiser HeatHub',
      external_id: hubIds.device,
      model: 'Drayton Wiser HeatHub',
      features: [
        feature(hubIds, HUB_FEATURES.AWAY_MODE, {
          name: 'Away mode',
          category: CATEGORIES.SWITCH,
          type: TYPES.SWITCH.BINARY,
          min: 0,
          max: 1,
          read_only: false,
          has_feedback: true,
        }),
        feature(hubIds, HUB_FEATURES.ECO_MODE, {
          name: 'Eco mode',
          category: CATEGORIES.SWITCH,
          type: TYPES.SWITCH.BINARY,
          min: 0,
          max: 1,
          read_only: false,
          has_feedback: true,
        }),
        feature(hubIds, HUB_FEATURES.BOILER, {
          name: 'Boiler',
          category: CATEGORIES.THERMOSTAT,
          type: TYPES.THERMOSTAT.OPERATING_STATE,
          min: 0,
          max: 2,
        }),
      ],
    };
  },

  states(gladys, system) {
    const hubIds = ids(gladys);
    return [
      ...state(hubIds, HUB_FEATURES.AWAY_MODE, system.awayMode ? 1 : 0),
      ...state(hubIds, HUB_FEATURES.ECO_MODE, system.ecoMode ? 1 : 0),
      ...state(hubIds, HUB_FEATURES.BOILER, system.heating ? 1 : 0),
    ];
  },

  commandsFor(gladys, { featureExternalId, value }) {
    const key = featureKeyOf(ids(gladys), featureExternalId, HUB_FEATURES);
    switch (key) {
      case HUB_FEATURES.AWAY_MODE:
        return commands.setAwayMode(binaryValue(value));
      case HUB_FEATURES.ECO_MODE:
        return commands.setEcoMode(binaryValue(value));
      default:
        throw new Error(`The feature ${featureExternalId} cannot be controlled`);
    }
  },
};
