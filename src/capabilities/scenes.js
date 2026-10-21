// -----------------------------------------------------------------------------
// Scene actions (SDK v0.14+, Gladys 5.1+).
//
// Operations a scene author places in a scene, declared in the manifest
// `scene_actions` field and handled here under the same `key`; index.js
// registers each one with `gladys.onSceneAction`.
//
//   - `fields` arrive RESOLVED (variables substituted, defaults applied); a
//     `"source": "devices"` field is the chosen device external_id;
//   - the handler returns the declared scalar `outputs`;
//   - a target that cannot do it (a plug picked as a room, no hot water) is
//     an output (`false`), not a failure: a scene action is never a
//     condition, the scene author gates on the output. A hub that refuses or
//     does not answer IS a failure: the error reaches the scene log.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { findRoom } from '../devices/index.js';
import * as commands from '../wiser/commands.js';

const logger = createLogger({ name: 'scenes' });

const numberOr = (value, fallback) =>
  value === undefined || value === null || value === '' || !Number.isFinite(Number(value))
    ? fallback
    : Number(value);

const isEmpty = (value) => value === undefined || value === null || value === '';

export const SCENE_ACTIONS = {
  // No room: every room, in one request to the hub.
  async boost_room(service, { fields, config }) {
    const delta = numberOr(fields.delta, config.boost_delta);
    const duration = numberOr(fields.duration, config.boost_duration);
    logger.info(`Scene action boost_room <- ${fields.device ?? 'all rooms'}`);
    if (isEmpty(fields.device)) {
      await service.run(commands.boostAllRooms(delta, duration));
      return { boosted: true };
    }
    const room = findRoom(service.gladys, service.model, fields.device);
    if (!room) {
      return { boosted: false };
    }
    await service.run(commands.boostRoom(room.id, delta, duration));
    return { boosted: true };
  },

  // A duration of 0 lasts until the next slot of the schedule (Schedule
  // mode), or until changed (Manual mode).
  async set_room_temperature(service, { fields }) {
    logger.info(`Scene action set_room_temperature <- ${fields.device}`);
    const room = findRoom(service.gladys, service.model, fields.device);
    const temperature = Number(fields.temperature);
    if (!room || !Number.isFinite(temperature)) {
      return { applied: false };
    }
    await service.run(
      commands.setRoomTemperature(room.id, temperature, numberOr(fields.duration, 0)),
    );
    return { applied: true };
  },

  // No room: the overrides of every room.
  async cancel_overrides(service, { fields }) {
    logger.info(`Scene action cancel_overrides <- ${fields.device ?? 'all rooms'}`);
    if (isEmpty(fields.device)) {
      await service.run(commands.cancelAllOverrides());
      return { cancelled: true };
    }
    const room = findRoom(service.gladys, service.model, fields.device);
    if (!room) {
      return { cancelled: false };
    }
    await service.run(commands.cancelRoomOverride(room.id));
    return { cancelled: true };
  },

  async set_away_mode(service, { fields }) {
    const enabled = fields.enabled === true || fields.enabled === 'true' || fields.enabled === 1;
    logger.info(`Scene action set_away_mode <- ${enabled}`);
    await service.run(commands.setAwayMode(enabled));
    return { away: enabled };
  },

  async boost_hot_water(service, { fields, config }) {
    const hotWater = service.model?.hotWater;
    logger.info('Scene action boost_hot_water');
    if (!hotWater) {
      return { boosted: false };
    }
    const duration = numberOr(fields.duration, config.hot_water_boost_duration);
    await service.run(commands.boostHotWater(hotWater.id, duration));
    return { boosted: true };
  },
};
