// -----------------------------------------------------------------------------
// The user-facing messages: connection status, action answers, toasts.
//
// Every message is a `{ en, fr, de, es }` object (see src/i18n.js): Gladys
// shows it in the reader's language. Fixed texts are written as objects;
// texts with values are built per language with `localize`.
// -----------------------------------------------------------------------------

import { HUB_ERRORS } from './wiser/client.js';
import { localize, pick } from './i18n.js';

export const MESSAGES = {
  notConfigured: {
    en: 'Enter the address and the secret of your HeatHub in the configuration.',
    fr: "Saisissez l'adresse et le secret de votre HeatHub dans la configuration.",
    de: 'Gib die Adresse und das Secret deines HeatHub in der Konfiguration ein.',
    es: 'Introduzca la dirección y el secreto de su HeatHub en la configuración.',
  },
  unauthorized: {
    en: 'The HeatHub refused the secret: read it again from the hub (see the documentation).',
    fr: 'Le HeatHub a refusé le secret : relisez-le depuis le hub (voir la documentation).',
    de: 'Der HeatHub hat das Secret abgelehnt: Lies es erneut vom Hub aus (siehe Dokumentation).',
    es: 'El HeatHub rechazó el secreto: vuelva a leerlo desde el hub (consulte la documentación).',
  },
  hubError: {
    en: 'The HeatHub answered with an error: check the integration logs.',
    fr: "Le HeatHub a répondu par une erreur : consultez les logs de l'intégration.",
    de: 'Der HeatHub hat mit einem Fehler geantwortet: Sieh in den Logs der Integration nach.',
    es: 'El HeatHub respondió con un error: consulte los registros de la integración.',
  },
  notReadYet: {
    en: 'The HeatHub has not been read yet: try again in a minute.',
    fr: "Le HeatHub n'a pas encore été lu : réessayez dans une minute.",
    de: 'Der HeatHub wurde noch nicht gelesen: Versuche es in einer Minute erneut.',
    es: 'El HeatHub aún no se ha leído: inténtelo de nuevo en un minuto.',
  },
  notARoom: {
    en: 'Pick a room of the HeatHub.',
    fr: 'Choisissez une pièce du HeatHub.',
    de: 'Wähle einen Raum des HeatHub.',
    es: 'Elija una habitación del HeatHub.',
  },
  cannotIdentify: {
    en: 'This device has no way to signal itself.',
    fr: 'Cet appareil ne peut pas se signaler.',
    de: 'Dieses Gerät kann sich nicht bemerkbar machen.',
    es: 'Este dispositivo no puede señalizarse.',
  },
  identifying: {
    en: 'Look around: the device LEDs are blinking.',
    fr: "Regardez autour de vous : les voyants de l'appareil clignotent.",
    de: 'Schau dich um: Die LEDs des Geräts blinken.',
    es: 'Mire a su alrededor: los LED del dispositivo parpadean.',
  },
  awayOn: {
    en: 'Away mode on.',
    fr: 'Mode absence activé.',
    de: 'Abwesenheitsmodus an.',
    es: 'Modo ausente activado.',
  },
  awayOff: {
    en: 'Away mode off.',
    fr: 'Mode absence désactivé.',
    de: 'Abwesenheitsmodus aus.',
    es: 'Modo ausente desactivado.',
  },
  overridesCancelled: {
    en: 'Overrides cancelled: back to the schedule.',
    fr: 'Dérogations annulées : retour au programme.',
    de: 'Übersteuerungen aufgehoben: zurück zum Zeitplan.',
    es: 'Anulaciones canceladas: vuelta a la programación.',
  },
  roomOnSchedule: {
    en: 'The room follows its schedule again.',
    fr: 'La pièce suit de nouveau son programme.',
    de: 'Der Raum folgt wieder seinem Zeitplan.',
    es: 'La habitación vuelve a seguir su programación.',
  },
  noHotWater: {
    en: 'This HeatHub drives no hot water.',
    fr: "Ce HeatHub ne pilote pas d'eau chaude.",
    de: 'Dieser HeatHub steuert kein Warmwasser.',
    es: 'Este HeatHub no controla agua caliente.',
  },
};

/** "Boost: +2 °C for 60 min." */
export function roomBoostMessage(delta, minutes) {
  return localize((language) =>
    pick(language, {
      en: `Boost: +${delta} °C for ${minutes} min.`,
      fr: `Boost : +${delta} °C pendant ${minutes} min.`,
      de: `Boost: +${delta} °C für ${minutes} Min.`,
      es: `Boost: +${delta} °C durante ${minutes} min.`,
    }),
  );
}

/** "Hot water boost for 30 min." */
export function hotWaterBoostMessage(minutes) {
  return localize((language) =>
    pick(language, {
      en: `Hot water boost for ${minutes} min.`,
      fr: `Boost de l'eau chaude pendant ${minutes} min.`,
      de: `Warmwasser-Boost für ${minutes} Min.`,
      es: `Boost de agua caliente durante ${minutes} min.`,
    }),
  );
}

/** The connection status message of a failed hub request. */
export function hubErrorMessage(error, host) {
  switch (error?.code) {
    case HUB_ERRORS.NOT_CONFIGURED:
      return MESSAGES.notConfigured;
    case HUB_ERRORS.UNAUTHORIZED:
      return MESSAGES.unauthorized;
    case HUB_ERRORS.UNREACHABLE:
      return localize((language) =>
        pick(language, {
          en: `The HeatHub does not answer at ${host}: check its address and that it is on.`,
          fr: `Le HeatHub ne répond pas à l'adresse ${host} : vérifiez l'adresse et qu'il est allumé.`,
          de: `Der HeatHub antwortet nicht unter ${host}: Prüfe die Adresse und ob er eingeschaltet ist.`,
          es: `El HeatHub no responde en ${host}: compruebe la dirección y que esté encendido.`,
        }),
      );
    default:
      return MESSAGES.hubError;
  }
}

/** Answer of "Test the connection": what the hub runs and what it serves. */
export function connectionOkMessage(model, scheme) {
  const { firmware } = model.system;
  const rooms = model.rooms.length;
  const devices = model.batteryDevices.length + model.smartPlugs.length;
  const protocol = scheme.toUpperCase();
  return localize((language) =>
    pick(language, {
      en: `HeatHub OK (${protocol}, firmware ${firmware ?? '?'}): ${rooms} room(s), ${devices} device(s).`,
      fr: `HeatHub OK (${protocol}, firmware ${firmware ?? '?'}) : ${rooms} pièce(s), ${devices} appareil(s).`,
      de: `HeatHub OK (${protocol}, Firmware ${firmware ?? '?'}): ${rooms} Raum/Räume, ${devices} Gerät(e).`,
      es: `HeatHub OK (${protocol}, firmware ${firmware ?? '?'}): ${rooms} habitación(es), ${devices} dispositivo(s).`,
    }),
  );
}
