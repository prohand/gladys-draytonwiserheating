// -----------------------------------------------------------------------------
// Entry point of the Drayton Wiser Heating integration for Gladys.
//
// Role of this file: wire the SDK to the Wiser service (src/service.js). It
// holds NO hub logic. It only:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. connects, then starts reading the hub.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { WiserService } from './src/service.js';
import { ACTIONS } from './src/actions.js';
import { buildDiscoveredDevices, findDevice } from './src/devices/index.js';
import { SCENE_ACTIONS } from './src/capabilities/scenes.js';
import { WIDGETS, refreshWidgets } from './src/capabilities/widgets.js';

const gladys = new GladysIntegration();

// Current configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();

const service = new WiserService(gladys, {
  // A read that changed something: open dashboards re-pull the widgets.
  onChange: () => refreshWidgets(gladys),
});
service.configure(config);

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> reading the HeatHub');
  const model = await service.refresh({ publishDevices: true });
  if (!model && service.model) {
    // The hub did not answer: still offer what it served last time.
    await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, service.model));
  }
});

// --- Command: the user acts on a controllable feature ------------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
  const found = findDevice(gladys, service.model, device.external_id);
  if (!found || typeof found.type.commandsFor !== 'function') {
    // Throw: the SDK sends a success:false acknowledgement to Gladys.
    throw new Error(
      service.model
        ? `No command handler for ${device.external_id}`
        : 'The HeatHub has not been read yet',
    );
  }
  await service.run(
    found.type.commandsFor(gladys, {
      entity: found.entity,
      featureExternalId: feature.external_id,
      value,
      config,
    }),
  );
});

// --- A device created or updated in Gladys: send its states right away -------
// The SDK forgets the states it published for that device; reading the hub
// again publishes them all, instead of waiting for the next tick.
gladys.onDeviceCreated(() => service.refresh());
gladys.onDeviceUpdated(() => service.refresh());

// --- Manifest actions: buttons in the Configuration screen -------------------
for (const [actionKey, handler] of Object.entries(ACTIONS)) {
  gladys.onAction(actionKey, (fields) => handler(service, { fields, config }));
}

// --- Scene actions: operations a scene author placed in a scene -------------
// Scene TRIGGERS need no handler: the service fires them when a read of the
// hub shows a transition (see src/capabilities/triggers.js).
for (const [actionKey, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(actionKey, (fields) => handler(service, { fields, config }));
}

// --- Dashboard widgets -------------------------------------------------------
for (const [widgetKey, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(widgetKey, (request) => widget.get(service, { ...request, config }));
  gladys.onWidgetAction(widgetKey, (actionKey, params, { settings, values } = {}) =>
    widget.action(service, { actionKey, params, settings, values, config }),
  );
}

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  service.configure(config);
  await service.refresh({ publishDevices: true });
  service.scheduleRefresh(config.poll_frequency * 1000);
  refreshWidgets(gladys);
});

// --- Connection lifecycle ----------------------------------------------------
// The SDK itself logs the WebSocket lifecycle under the `gladys-sdk` name:
// these handlers only run the integration's own (re)initialization.
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    service.configure(config);
    // Gladys may have restarted: the next read publishes everything again.
    service.resync();
    service.start();
    refreshWidgets(gladys);
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
        de: 'Die Initialisierung ist fehlgeschlagen, sieh in den Logs der Integration nach.',
        es: 'La inicialización falló, consulte los registros de la integración.',
      })
      .catch(() => {});
  }
});

gladys.on('disconnected', () => {
  service.stop();
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  service.stop();
});

// Never let a stray rejection end the integration: log it.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Drayton Wiser Heating integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
