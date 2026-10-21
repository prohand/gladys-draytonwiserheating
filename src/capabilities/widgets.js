// -----------------------------------------------------------------------------
// Dashboard widgets (SDK v0.14+, Gladys 5.1+).
//
// Two widgets, declared in the manifest `widgets` field:
//   - `heating_overview`: every room at a glance (temperature, target, what it
//     is doing), the home-wide state (hub, away, eco, boiler, hot water,
//     batteries) and the home-wide buttons;
//   - `room`: one room picked in the widget settings, with LIVE tiles bound to
//     its features and its own buttons (boost with a form, cancel, schedule).
//
// The content is declarative — the core renders it with its theme, dark mode
// and translations. Computed parts are cached by the core until
// `ttl_seconds`; the service nudges the widgets when a read changed something
// (see index.js). Check a content with `validateWidgetContent` (tests).
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { findRoom, roomExternalId } from '../devices/index.js';
import { ROOM_FEATURES, room as roomType } from '../devices/room.js';
import { LOW_BATTERY_LEVELS } from '../wiser/domain.js';
import * as commands from '../wiser/commands.js';
import { localize, pick } from '../i18n.js';
import { MESSAGES, hotWaterBoostMessage, roomBoostMessage } from '../messages.js';

const logger = createLogger({ name: 'widgets' });

export const HEATING_OVERVIEW_WIDGET = 'heating_overview';
export const ROOM_WIDGET = 'room';

export const OVERVIEW_ACTIONS = {
  SET_AWAY: 'set_away',
  CANCEL_OVERRIDES: 'cancel_overrides',
  BOOST_HOT_WATER: 'boost_hot_water',
};

export const ROOM_ACTIONS = {
  BOOST: 'boost',
  CANCEL: 'cancel',
  SCHEDULE: 'schedule',
};

// A card-list in `list` display shows 8 rows at most.
const MAX_ROOM_ROWS = 8;

const T = {
  hub: { en: 'HeatHub', fr: 'HeatHub', de: 'HeatHub', es: 'HeatHub' },
  connected: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  unreachable: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
  notConfigured: {
    en: 'Not configured',
    fr: 'Non configuré',
    de: 'Nicht eingerichtet',
    es: 'Sin configurar',
  },
  away: { en: 'Away mode', fr: 'Mode absence', de: 'Abwesenheit', es: 'Modo ausente' },
  eco: { en: 'Eco mode', fr: 'Mode éco', de: 'Eco-Modus', es: 'Modo eco' },
  boiler: { en: 'Boiler', fr: 'Chaudière', de: 'Heizkessel', es: 'Caldera' },
  hotWater: { en: 'Hot water', fr: 'Eau chaude', de: 'Warmwasser', es: 'Agua caliente' },
  batteries: { en: 'Batteries', fr: 'Piles', de: 'Batterien', es: 'Pilas' },
  on: { en: 'On', fr: 'Activé', de: 'An', es: 'Activado' },
  off: { en: 'Off', fr: 'Désactivé', de: 'Aus', es: 'Desactivado' },
  heating: { en: 'Heating', fr: 'Chauffe', de: 'Heizt', es: 'Calentando' },
  idle: { en: 'Idle', fr: 'Au repos', de: 'Ruhend', es: 'En reposo' },
  boost: { en: 'Boost', fr: 'Boost', de: 'Boost', es: 'Boost' },
  allOk: { en: 'All OK', fr: 'Toutes OK', de: 'Alle OK', es: 'Todas OK' },
  window: { en: 'Window', fr: 'Fenêtre', de: 'Fenster', es: 'Ventana' },
  open: { en: 'Open', fr: 'Ouverte', de: 'Offen', es: 'Abierta' },
  closed: { en: 'Closed', fr: 'Fermée', de: 'Geschlossen', es: 'Cerrada' },
  mode: { en: 'Mode', fr: 'Mode', de: 'Modus', es: 'Modo' },
  schedule: { en: 'Schedule', fr: 'Programme', de: 'Zeitplan', es: 'Programa' },
  manual: { en: 'Manual', fr: 'Manuel', de: 'Manuell', es: 'Manual' },
  roomOff: { en: 'Off', fr: 'Arrêt', de: 'Aus', es: 'Apagado' },
  temperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  target: { en: 'Target', fr: 'Consigne', de: 'Sollwert', es: 'Consigna' },
  humidity: { en: 'Humidity', fr: 'Humidité', de: 'Feuchtigkeit', es: 'Humedad' },
  awayOnButton: {
    en: 'Away mode on',
    fr: 'Activer absence',
    de: 'Abwesenheit an',
    es: 'Activar ausente',
  },
  awayOffButton: {
    en: 'Back home',
    fr: 'De retour',
    de: 'Wieder zu Hause',
    es: 'De vuelta',
  },
  cancelButton: {
    en: 'Back to schedule',
    fr: 'Retour au programme',
    de: 'Zurück zum Zeitplan',
    es: 'Volver al programa',
  },
  hotWaterBoostButton: {
    en: 'Boost hot water',
    fr: 'Boost eau chaude',
    de: 'Warmwasser-Boost',
    es: 'Boost agua caliente',
  },
  boostButton: { en: 'Boost', fr: 'Boost', de: 'Boost', es: 'Boost' },
  cancelRoomButton: {
    en: 'Cancel override',
    fr: 'Annuler dérogation',
    de: 'Übersteuerung weg',
    es: 'Anular cambio',
  },
  scheduleButton: {
    en: 'Follow schedule',
    fr: 'Suivre programme',
    de: 'Zeitplan folgen',
    es: 'Seguir programa',
  },
  delta: {
    en: 'Degrees to add (°C)',
    fr: 'Degrés à ajouter (°C)',
    de: 'Zusätzliche Grad (°C)',
    es: 'Grados a añadir (°C)',
  },
  duration: {
    en: 'Duration (minutes)',
    fr: 'Durée (minutes)',
    de: 'Dauer (Minuten)',
    es: 'Duración (minutos)',
  },
  noRooms: {
    en: 'The HeatHub has not been read yet: check the integration configuration.',
    fr: "Le HeatHub n'a pas encore été lu : vérifiez la configuration de l'intégration.",
    de: 'Der HeatHub wurde noch nicht gelesen: Prüfe die Konfiguration der Integration.',
    es: 'El HeatHub aún no se ha leído: compruebe la configuración de la integración.',
  },
  pickRoom: {
    en: 'Pick a room of the HeatHub in the widget settings.',
    fr: 'Choisissez une pièce du HeatHub dans les réglages du widget.',
    de: 'Wähle in den Widget-Einstellungen einen Raum des HeatHub.',
    es: 'Elija una habitación del HeatHub en los ajustes del widget.',
  },
};

/** "20.5 °C", or °F for a user in imperial units. */
export function formatTemperature(celsius, units) {
  if (celsius === null || celsius === undefined) {
    return '–';
  }
  if (units === 'imperial') {
    return `${(Math.round(((celsius * 9) / 5) * 10 + 320) / 10).toFixed(1)} °F`;
  }
  return `${celsius.toFixed(1)} °C`;
}

function roomModeText(room) {
  if (room.mode === 'off') {
    return T.roomOff;
  }
  return room.mode === 'auto' ? T.schedule : T.manual;
}

// The badge of a room row: the one thing worth seeing first.
function roomBadge(room) {
  if (room.windowOpen) {
    return { text: T.window, color: WIDGET_COLORS.INFO };
  }
  if (room.boosted) {
    return { text: T.boost, color: WIDGET_COLORS.DANGER };
  }
  if (room.mode === 'off') {
    return { text: T.roomOff, color: WIDGET_COLORS.NEUTRAL };
  }
  if (room.heating) {
    return { text: T.heating, color: WIDGET_COLORS.WARNING };
  }
  return { text: T.idle, color: WIDGET_COLORS.SUCCESS };
}

function roomSubtitle(room, units) {
  const current = formatTemperature(room.temperature, units);
  if (room.mode === 'off' || room.targetTemperature === null) {
    return localize((language) => `${current} · ${pick(language, T.roomOff)}`);
  }
  const target = formatTemperature(room.targetTemperature, units);
  return localize((language) => `${current} → ${target} · ${pick(language, roomModeText(room))}`);
}

function hubStatusItem(service) {
  if (!service.client) {
    return { label: T.hub, icon: 'wifi-off', value: T.notConfigured, color: WIDGET_COLORS.WARNING };
  }
  if (service.reachable === false) {
    return { label: T.hub, icon: 'wifi-off', value: T.unreachable, color: WIDGET_COLORS.DANGER };
  }
  return { label: T.hub, icon: 'wifi', value: T.connected, color: WIDGET_COLORS.SUCCESS };
}

function overviewStatus(service, model) {
  const items = [hubStatusItem(service)];
  if (!model) {
    return items;
  }
  const { system, hotWater, batteryDevices } = model;
  items.push(
    {
      label: T.away,
      icon: 'briefcase',
      value: system.awayMode ? T.on : T.off,
      color: system.awayMode ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
    {
      label: T.eco,
      icon: 'feather',
      value: system.ecoMode ? T.on : T.off,
      color: system.ecoMode ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    },
    {
      label: T.boiler,
      icon: 'thermometer',
      value: system.heating ? T.heating : T.idle,
      color: system.heating ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
  );
  if (hotWater) {
    let value = hotWater.heating ? T.heating : T.off;
    if (hotWater.boosted) {
      value = localize((language) => `${pick(language, value)} (${pick(language, T.boost)})`);
    }
    items.push({
      label: T.hotWater,
      icon: 'droplet',
      value,
      color: hotWater.heating ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    });
  }
  const low = batteryDevices.filter((device) => LOW_BATTERY_LEVELS.includes(device.batteryLevel));
  if (batteryDevices.length > 0) {
    items.push({
      label: T.batteries,
      icon: 'battery',
      value:
        low.length === 0
          ? T.allOk
          : localize((language) =>
              pick(language, {
                en: `${low.length} low`,
                fr: `${low.length} faible(s)`,
                de: `${low.length} schwach`,
                es: `${low.length} baja(s)`,
              }),
            ),
      color: low.length === 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
    });
  }
  return items;
}

function overviewContent(service, { units }) {
  const { model } = service;
  const components = [];
  if (model && model.rooms.length > 0) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: model.rooms.slice(0, MAX_ROOM_ROWS).map((room) => ({
        title: room.name,
        subtitle: roomSubtitle(room, units),
        badge: roomBadge(room),
      })),
    });
  } else {
    components.push({ type: 'text', text: T.noRooms, variant: 'body' });
  }
  components.push({ type: 'status', items: overviewStatus(service, model) });
  if (model) {
    const away = model.system.awayMode;
    components.push(
      {
        type: 'button',
        label: away ? T.awayOffButton : T.awayOnButton,
        icon: away ? 'home' : 'briefcase',
        style: 'secondary',
        action: { key: OVERVIEW_ACTIONS.SET_AWAY, params: { enabled: !away }, confirm: true },
      },
      {
        type: 'button',
        label: T.cancelButton,
        icon: 'rotate-ccw',
        style: 'secondary',
        action: { key: OVERVIEW_ACTIONS.CANCEL_OVERRIDES, confirm: true },
      },
    );
    if (model.hotWater) {
      components.push({
        type: 'button',
        label: T.hotWaterBoostButton,
        icon: 'droplet',
        style: 'primary',
        action: { key: OVERVIEW_ACTIONS.BOOST_HOT_WATER },
      });
    }
  }
  return { ttl_seconds: 60, components };
}

function roomContent(service, { settings, config }) {
  const room = findRoom(service.gladys, service.model, settings?.room);
  if (!room) {
    return {
      ttl_seconds: 60,
      components: [{ type: 'text', text: service.model ? T.pickRoom : T.noRooms, variant: 'body' }],
    };
  }
  const ids = roomType.externalIds(service.gladys, room);
  const externalId = roomExternalId(service.gladys, room);
  const components = [
    // Live tiles: they follow the published states, nothing to refresh.
    {
      type: 'value',
      label: T.temperature,
      icon: 'thermometer',
      device_feature: ids.feature(ROOM_FEATURES.TEMPERATURE),
    },
    {
      type: 'value',
      label: T.target,
      icon: 'target',
      device_feature: ids.feature(ROOM_FEATURES.TARGET_TEMPERATURE),
    },
  ];
  if (room.hasHumidity) {
    components.push({
      type: 'value',
      label: T.humidity,
      icon: 'droplet',
      device_feature: ids.feature(ROOM_FEATURES.HUMIDITY),
    });
  }
  const statusItems = [
    { label: T.mode, icon: 'sliders', value: roomModeText(room), color: WIDGET_COLORS.NEUTRAL },
    {
      label: T.heating,
      icon: 'thermometer',
      value:
        room.heating && room.demand !== null
          ? localize((language) => `${pick(language, T.heating)} (${room.demand} %)`)
          : room.heating
            ? T.heating
            : T.idle,
      color: room.heating ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
    {
      label: T.boost,
      icon: 'zap',
      value: room.boosted ? T.on : T.off,
      color: room.boosted ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (room.hasWindow && room.windowOpen !== null) {
    statusItems.push({
      label: T.window,
      icon: 'wind',
      value: room.windowOpen ? T.open : T.closed,
      color: room.windowOpen ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
    });
  }
  components.push(
    { type: 'status', items: statusItems },
    {
      type: 'button',
      label: T.boostButton,
      icon: 'zap',
      style: 'primary',
      action: {
        key: ROOM_ACTIONS.BOOST,
        params: { room: externalId },
        // A form behind the tap: the defaults are the configured boost.
        fields: [
          {
            key: 'delta',
            type: 'number',
            label: T.delta,
            required: true,
            min: 0.5,
            max: 5,
            default: config.boost_delta,
          },
          {
            key: 'duration',
            type: 'number',
            label: T.duration,
            required: true,
            min: 15,
            max: 240,
            default: config.boost_duration,
          },
        ],
      },
    },
    {
      type: 'button',
      label: T.cancelRoomButton,
      icon: 'x-circle',
      style: 'secondary',
      action: { key: ROOM_ACTIONS.CANCEL, params: { room: externalId } },
    },
  );
  if (room.mode !== 'auto') {
    components.push({
      type: 'button',
      label: T.scheduleButton,
      icon: 'calendar',
      style: 'secondary',
      action: { key: ROOM_ACTIONS.SCHEDULE, params: { room: externalId } },
    });
  }
  return { ttl_seconds: 60, components };
}

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

export const WIDGETS = {
  [HEATING_OVERVIEW_WIDGET]: {
    async get(service, request) {
      logger.debug(`onWidgetGet <- ${HEATING_OVERVIEW_WIDGET}`);
      return overviewContent(service, request);
    },

    // `params` are the ones the content declared, never user input.
    async action(service, { actionKey, params, config }) {
      logger.info(`onWidgetAction <- ${HEATING_OVERVIEW_WIDGET}.${actionKey}`);
      switch (actionKey) {
        case OVERVIEW_ACTIONS.SET_AWAY: {
          const enabled = params?.enabled === true;
          await service.run(commands.setAwayMode(enabled));
          return enabled ? MESSAGES.awayOn : MESSAGES.awayOff;
        }
        case OVERVIEW_ACTIONS.CANCEL_OVERRIDES:
          await service.run(commands.cancelAllOverrides());
          return MESSAGES.overridesCancelled;
        case OVERVIEW_ACTIONS.BOOST_HOT_WATER: {
          const hotWater = service.model?.hotWater;
          if (!hotWater) {
            return MESSAGES.noHotWater;
          }
          await service.run(commands.boostHotWater(hotWater.id, config.hot_water_boost_duration));
          return hotWaterBoostMessage(config.hot_water_boost_duration);
        }
        default:
          throw new Error(`Unknown widget action: ${actionKey}`);
      }
    },
  },

  [ROOM_WIDGET]: {
    async get(service, request) {
      logger.debug(`onWidgetGet <- ${ROOM_WIDGET}`);
      return roomContent(service, request);
    },

    async action(service, { actionKey, params, settings, values, config }) {
      logger.info(`onWidgetAction <- ${ROOM_WIDGET}.${actionKey}`);
      const room = findRoom(service.gladys, service.model, params?.room ?? settings?.room);
      if (!room) {
        return MESSAGES.notARoom;
      }
      switch (actionKey) {
        case ROOM_ACTIONS.BOOST: {
          // Values typed in the form; a core too old to send them gets the
          // configured boost.
          const delta = clamp(values?.delta, 0.5, 5, config.boost_delta);
          const duration = Math.round(clamp(values?.duration, 15, 240, config.boost_duration));
          await service.run(commands.boostRoom(room.id, delta, duration));
          return roomBoostMessage(delta, duration);
        }
        case ROOM_ACTIONS.CANCEL:
          await service.run(commands.cancelRoomOverride(room.id));
          return MESSAGES.overridesCancelled;
        case ROOM_ACTIONS.SCHEDULE:
          await service.run(commands.setRoomAuto(room.id));
          return MESSAGES.roomOnSchedule;
        default:
          throw new Error(`Unknown widget action: ${actionKey}`);
      }
    },
  },
};

/**
 * Ask the core to re-pull every widget now. Fire-and-forget: rate-limited
 * core-side (1 per 10 s per widget), dropped while disconnected.
 */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
