// -----------------------------------------------------------------------------
// Device registry.
//
// Every device type lives in its own file and exposes the same shape:
//   - key                                  : short identifier (logs)
//   - entities(model)                      : the entities of this type in the hub model
//   - externalIds(gladys, entity)          : `{ device, feature(key) }`
//   - buildDevice(gladys, entity, model)   : the discovery payload
//   - states(gladys, entity, model)        : the states to publish
//   - commandsFor(gladys, {...})           (optional): the hub PATCH requests of a command
//   - identifyTargets(entity, model)       (optional): the hub device ids that blink
//
// Unlike a fixed device list, the devices come from the hub: one read of the
// domain gives the rooms, valves, thermostats, plugs and hot water at once.
// -----------------------------------------------------------------------------

import { room } from './room.js';
import { hub } from './hub.js';
import { hotWater } from './hotWater.js';
import { smartPlug } from './smartPlug.js';
import { batteryDevice } from './batteryDevice.js';

export const DEVICE_TYPES = [hub, room, hotWater, smartPlug, batteryDevice];

/** Every `{ type, entity }` of the model, in publication order. */
function entries(model) {
  return DEVICE_TYPES.flatMap((type) => type.entities(model).map((entity) => ({ type, entity })));
}

/** The discovery payload: every device of the hub. */
export function buildDiscoveredDevices(gladys, model) {
  return entries(model).map(({ type, entity }) => type.buildDevice(gladys, entity, model));
}

/** Every state the model gives, for `publishChangedStates`. */
export function buildStates(gladys, model) {
  return entries(model).flatMap(({ type, entity }) => type.states(gladys, entity, model));
}

/** Every device external id of the model. */
export function deviceExternalIds(gladys, model) {
  return entries(model).map(({ type, entity }) => type.externalIds(gladys, entity).device);
}

/**
 * Find the type and entity behind a device external id.
 * @returns {{ type: object, entity: object } | undefined}
 */
export function findDevice(gladys, model, externalId) {
  if (!model) {
    return undefined;
  }
  return entries(model).find(
    ({ type, entity }) => type.externalIds(gladys, entity).device === externalId,
  );
}

/** The room behind a device external id, or undefined. */
export function findRoom(gladys, model, externalId) {
  const found = findDevice(gladys, model, externalId);
  return found?.type === room ? found.entity : undefined;
}

/** A room's device external id (for scene event data, widget tiles). */
export function roomExternalId(gladys, entity) {
  return room.externalIds(gladys, entity).device;
}
