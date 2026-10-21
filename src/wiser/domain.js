// -----------------------------------------------------------------------------
// Read the hub's domain (GET /data/v2/domain/) into a plain model.
//
// The raw domain is the hub's own vocabulary: temperatures in tenths of a
// degree, "On"/"Off" strings, devices split between a `Device` list (radio
// details, battery) and one list per product (`SmartValve`, `RoomStat`,
// `SmartPlug`...) joined by id. Everything else in the integration works on
// the model built here, so the quirks of the hub stay in one file:
//   - a room or a valve the hub lost sight of reports -32768 (or 2000 and more)
//     as its temperature: that is "unknown", never a reading;
//   - a set point of -200 (-20 °C) is how the hub writes "off";
//   - the mode the app shows is not a field: Manual with an "off" set point is
//     Off, Manual otherwise is Manual, Auto follows the schedule.
// -----------------------------------------------------------------------------

/** The set point the hub uses for "off", in tenths of a degree. */
export const WISER_OFF_SETPOINT = -200;
/** The set point that turns hot water on in an override. */
export const WISER_HOT_WATER_ON = 1100;
/** Room set point range of the hub, in °C. */
export const SETPOINT_MIN = 5;
export const SETPOINT_MAX = 30;

const TEMP_ERROR = 2000;

// Battery percent from the voltage, the curves of the reference library: a
// RoomStat runs on 2 AAA (1.7 V empty, 2.7 V full), an iTRV on 2 AA whose
// usable range is short.
const ROOMSTAT_EMPTY_VOLTAGE = 1.7;
const ROOMSTAT_FULL_VOLTAGE = 2.7;
const TRV_BATTERY_CURVE = [
  [3.0, 100],
  [2.9, 80],
  [2.8, 60],
  [2.7, 40],
  [2.6, 20],
  [2.5, 10],
  [2.4, 5],
];
const BATTERY_LEVEL_PERCENT = { normal: 100, twothirds: 66, onethird: 33, low: 10, critical: 0 };

/** Battery levels the hub reports for a battery that needs changing soon. */
export const LOW_BATTERY_LEVELS = ['Low', 'Critical'];

// The hub reports the radio link as a word; Gladys shows a 0-5 scale.
const SIGNAL_QUALITY = { NoSignal: 0, Poor: 2, Medium: 3, Good: 4, VeryGood: 5 };

/** The product types this integration publishes as devices of their own. */
export const PRODUCT_TYPES = {
  ITRV: 'iTRV',
  ROOMSTAT: 'RoomStat',
  SMARTPLUG: 'SmartPlug',
  CONTROLLER: 'Controller',
};

/**
 * Tenths of a degree from the hub -> °C, `null` when the hub has no reading.
 * @param {unknown} value
 * @returns {number | null}
 */
export function fromWiserTemperature(value) {
  const number = Number(value);
  if (value === null || value === undefined || !Number.isFinite(number)) {
    return null;
  }
  if (Math.abs(number) >= TEMP_ERROR) {
    return null;
  }
  return Math.round(number) / 10;
}

/** °C -> tenths of a degree, rounded to the half degree the hub works with. */
export function toWiserSetpoint(celsius) {
  const bounded = Math.min(SETPOINT_MAX, Math.max(SETPOINT_MIN, Number(celsius)));
  return Math.round(bounded * 2) * 5;
}

/** Battery percent of a device, `null` when it has no battery. */
export function batteryPercent(device) {
  const voltage = Number(device.BatteryVoltage) / 10;
  if (Number.isFinite(voltage) && voltage > 0) {
    if (device.ProductType === PRODUCT_TYPES.ROOMSTAT) {
      const ratio =
        (voltage - ROOMSTAT_EMPTY_VOLTAGE) / (ROOMSTAT_FULL_VOLTAGE - ROOMSTAT_EMPTY_VOLTAGE);
      return Math.min(100, Math.max(0, Math.round(ratio * 100)));
    }
    if (device.ProductType === PRODUCT_TYPES.ITRV) {
      const point = TRV_BATTERY_CURVE.find(([threshold]) => voltage >= threshold - 0.001);
      return point ? point[1] : 0;
    }
  }
  if (typeof device.BatteryLevel === 'string') {
    return BATTERY_LEVEL_PERCENT[device.BatteryLevel.toLowerCase()] ?? null;
  }
  return null;
}

/** Radio link quality on Gladys' 0-5 scale, `null` when unknown. */
export function signalQuality(device) {
  return SIGNAL_QUALITY[device.DisplayedSignalStrength] ?? null;
}

const list = (value) => (Array.isArray(value) ? value : []);
const isOn = (value) => value === 'On';
const hasOverride = (overrideType) =>
  typeof overrideType === 'string' && overrideType !== '' && overrideType !== 'None';

function roomMode(room, setpoint) {
  if (room.Mode === 'Auto') {
    return 'auto';
  }
  return setpoint === WISER_OFF_SETPOINT ? 'off' : 'manual';
}

function parseRoom(room, { roomStats }) {
  const rawSetpoint = Number(room.CurrentSetPoint ?? room.DisplayedSetPoint);
  const origin = String(room.SetpointOrigin ?? room.SetPointOrigin ?? '');
  const roomStat = roomStats.get(room.RoomStatId);
  const humidity = Number(roomStat?.MeasuredHumidity);
  const demand = Number(room.PercentageDemand);
  return {
    id: room.id,
    name: room.Name || `Room ${room.id}`,
    temperature: fromWiserTemperature(room.CalculatedTemperature),
    hasHumidity: roomStat !== undefined,
    humidity: roomStat !== undefined && Number.isFinite(humidity) ? humidity : null,
    off: rawSetpoint === WISER_OFF_SETPOINT,
    targetTemperature:
      rawSetpoint === WISER_OFF_SETPOINT ? null : fromWiserTemperature(room.CurrentSetPoint),
    scheduledTemperature: fromWiserTemperature(room.ScheduledSetPoint),
    manualTemperature: fromWiserTemperature(room.ManualSetPoint),
    mode: roomMode(room, rawSetpoint),
    heating:
      room.ControlOutputState !== undefined
        ? isOn(room.ControlOutputState)
        : Number.isFinite(demand) && demand > 0,
    demand: Number.isFinite(demand) ? demand : null,
    hasWindow: room.WindowState !== undefined,
    windowOpen: room.WindowState === undefined ? null : room.WindowState === 'Open',
    boosted: origin.includes('Boost'),
    away: origin.includes('Away'),
    overridden: hasOverride(room.OverrideType),
    overrideEndsAt: Number(room.OverrideTimeoutUnixTime) > 0 ? room.OverrideTimeoutUnixTime : null,
    smartValveIds: list(room.SmartValveIds),
    roomStatId: room.RoomStatId ?? null,
  };
}

function parseBatteryDevice(device, { rooms, smartValves }) {
  const isTrv = device.ProductType === PRODUCT_TYPES.ITRV;
  const room = rooms.find((r) =>
    isTrv ? r.smartValveIds.includes(device.id) : r.roomStatId === device.id,
  );
  const valve = isTrv ? smartValves.get(device.id) : undefined;
  return {
    id: device.id,
    productType: device.ProductType,
    serial: device.SerialNumber || null,
    model: device.ModelIdentifier || device.ProductModel || device.ProductType,
    firmware: device.ActiveFirmwareVersion || null,
    roomId: room?.id ?? null,
    roomName: room?.name ?? null,
    batteryPercent: batteryPercent(device),
    batteryLevel: typeof device.BatteryLevel === 'string' ? device.BatteryLevel : null,
    signal: signalQuality(device),
    // The valve reads the temperature next to the radiator: a device
    // temperature, not the room's (the room has its own, calculated by the hub).
    temperature: valve ? fromWiserTemperature(valve.MeasuredTemperature) : null,
  };
}

function parseSmartPlug(plug, devicesById) {
  const deviceId = plug.DeviceId ?? plug.id;
  const device = devicesById.get(deviceId) ?? {};
  const power = Number(plug.InstantaneousDemand);
  const energy = Number(plug.CurrentSummationDelivered);
  return {
    id: plug.id,
    deviceId,
    name: plug.Name || `Smart plug ${plug.id}`,
    serial: device.SerialNumber || null,
    on: isOn(plug.OutputState),
    auto: plug.Mode === 'Auto',
    power: Number.isFinite(power) ? power : null,
    // Delivered energy comes in Wh: Gladys' energy features are in kWh.
    energy: Number.isFinite(energy) ? Math.round(energy) / 1000 : null,
    signal: signalQuality(device),
  };
}

function parseHotWater(hotWater) {
  if (!hotWater) {
    return null;
  }
  const boosted =
    hasOverride(hotWater.OverrideType) && Number(hotWater.OverrideTimeoutUnixTime) > 0;
  const heating = isOn(hotWater.WaterHeatingState);
  let mode = 'auto';
  if (hotWater.Mode !== 'Auto') {
    mode = heating && !boosted ? 'on' : 'off';
  }
  return {
    id: hotWater.id,
    mode,
    heating,
    boosted,
    overrideEndsAt: boosted ? hotWater.OverrideTimeoutUnixTime : null,
  };
}

/**
 * Build the model of the hub from its raw domain.
 * @param {Record<string, any>} domain
 */
export function parseDomain(domain) {
  const system = domain.System ?? {};
  const devices = list(domain.Device);
  const devicesById = new Map(devices.map((device) => [device.id, device]));
  const roomStats = new Map(list(domain.RoomStat).map((stat) => [stat.id, stat]));
  const smartValves = new Map(list(domain.SmartValve).map((valve) => [valve.id, valve]));

  const rooms = list(domain.Room)
    .filter((room) => room && room.id !== undefined)
    .map((room) => parseRoom(room, { roomStats }));

  const batteryDevices = devices
    .filter((d) => d.ProductType === PRODUCT_TYPES.ITRV || d.ProductType === PRODUCT_TYPES.ROOMSTAT)
    .map((device) => parseBatteryDevice(device, { rooms, smartValves }));

  const controller = devices.find((d) => d.ProductType === PRODUCT_TYPES.CONTROLLER);
  const heatingChannels = list(domain.HeatingChannel);

  return {
    system: {
      awayMode: system.OverrideType === 'Away',
      ecoMode: system.EcoModeEnabled === true,
      heating: heatingChannels.some(
        (channel) => isOn(channel.HeatingRelayState) || isOn(channel.DemandOnOffOutput),
      ),
      firmware: system.ActiveSystemVersion ?? null,
      hardwareGeneration: system.HardwareGeneration ?? null,
      cloudConnected:
        system.CloudConnectionStatus === undefined
          ? null
          : system.CloudConnectionStatus === 'Connected',
      serial: controller?.SerialNumber || null,
    },
    rooms,
    batteryDevices,
    smartPlugs: list(domain.SmartPlug).map((plug) => parseSmartPlug(plug, devicesById)),
    hotWater: parseHotWater(list(domain.HotWater)[0]),
  };
}
