// -----------------------------------------------------------------------------
// Manifest actions: the buttons of the Configuration screen.
//
// Each handler is keyed by the action `key` of the manifest `actions` field;
// index.js registers them with `gladys.onAction`. The resolved message is
// shown under the button; a thrown error is shown too.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { findDevice } from './devices/index.js';
import { identifyDevice } from './wiser/commands.js';
import { MESSAGES, connectionOkMessage, hubErrorMessage } from './messages.js';

const logger = createLogger({ name: 'actions' });

/**
 * Make a device (or every device of a room) signal itself.
 * Written once, reached from the Configuration screen and from a scene.
 * @returns {Promise<boolean>} false when the device has nothing that blinks
 */
export async function signalDevice(service, externalId) {
  const found = findDevice(service.gladys, service.model, externalId);
  const targets = found?.type.identifyTargets?.(found.entity, service.model) ?? [];
  if (targets.length === 0) {
    return false;
  }
  await service.run(targets.flatMap((id) => identifyDevice(id)));
  return true;
}

export const ACTIONS = {
  // A live read of the hub, whatever the timer: the answer under the button
  // says what the hub runs and what it serves, or what to fix.
  async test_connection(service) {
    logger.info('Action test_connection -> live read of the HeatHub');
    const model = await service.refresh({ publishDevices: true });
    if (!model) {
      return hubErrorMessage(service.lastError, service.config?.hub_host);
    }
    return connectionOkMessage(model, service.scheme);
  },

  async identify(service, { fields }) {
    logger.info(`Action identify <- ${fields.device}`);
    if (!service.model) {
      return MESSAGES.notReadYet;
    }
    return (await signalDevice(service, fields.device))
      ? MESSAGES.identifying
      : MESSAGES.cannotIdentify;
  },
};
