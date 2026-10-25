# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) for **Drayton Wiser** heating. It talks to the
Wiser **HeatHub** over its **local** REST API (`/data/v2/domain/`, `SECRET` header) — never the
Wiser cloud — and publishes rooms, hot water, smart plugs, radiator valves and room thermostats as
Gladys devices. Gladys 5.1+ adds scene triggers, scene actions and two dashboard widgets; the
manifest floor is `>=5.3.0` for the store search `keywords` (no `countries`: not regional). It
started from the official JavaScript template (`GladysAssistant/integration-template-js`); the
workflows are the ones of `prohand/gladys-devmel`.

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/service.test.js            # one file
node --test --test-name-pattern "window"    # tests whose name matches
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

CI (`.github/workflows/ci.yml`) runs `format:check`, `lint`, `test` on Node 22 and 24, plus the
store checks and a Docker build on pull requests: run the three commands before pushing.

## Architecture

```
index.js                     SDK wiring only: handlers registered before connect()
src/config.js                DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/i18n.js                  LANGUAGES (en, fr, de, es), pick, localize
src/messages.js              user-facing messages (connection status, action answers, toasts)
src/service.js               WiserService: timer, refresh (states, devices, badges, events), run(commands)
src/actions.js               Configuration screen actions (test_connection, identify)
src/wiser/client.js          HTTP(S) client of the hub: queue, SECRET header, auto HTTPS, HubError
src/wiser/domain.js          raw domain -> model (rooms, battery devices, plugs, hot water, system)
src/wiser/commands.js        command bodies as data: [{ path, body }]
src/devices/index.js         registry of the device types + lookups
src/devices/<type>.js        hub, room, hotWater, smartPlug, batteryDevice (iTRV + RoomStat)
src/capabilities/triggers.js scene triggers: transitions between two reads
src/capabilities/scenes.js   scene actions (manifest `scene_actions`)
src/capabilities/widgets.js  dashboard widgets (manifest `widgets`)
gladys-assistant-integration.json  manifest
docs/{en,fr,de,es}.md        user documentation, re-hosted by Gladys
test/                        node --test, SDK fake Gladys + test/helpers/fakeHub.js
.github/scripts/changelog-release.mjs  changelog roll of the Release workflow
```

### Invariants worth knowing

- **One read covers everything.** `GET /data/v2/domain/` returns every room and device: the
  service reads it on its own timer (`poll_frequency`, seconds, 30-900) and publishes with
  `publishChangedStates`. Devices are NOT published with `should_poll` — Gladys' `onPoll` would
  read the hub once per device.
- **One request at a time.** The hub is a small box: `client.js` queues every request, and the
  timer is re-armed after each read (reads never overlap).
- **Temperatures are tenths of a degree.** `-200` is "off"; `-32768` and `|value| >= 2000` mean
  the hub lost the sensor: `null`, never published. Set points are rounded to 0.5 °C, 5-30 °C.
- **Modes**: the hub has `Auto` / `Manual` only; Off is Manual at -20 °C. Gladys
  `THERMOSTAT_MODE`: OFF 0, HEATING 1 (= Manual), AUTO 3 (= Schedule). Hot water uses
  `WATER_HEATER_MODE`: OFF 0, MANUAL 4 (on), PROGRAM 6 (schedule).
- **Commands are confirmed by a read.** `has_feedback` features show what the hub reports
  1.5 s after the PATCH, not the value asked for.
- **HTTPS**: second-generation hubs on firmware 4.42.22+ only answer HTTPS (self-signed
  certificate). `auto` follows `System.HardwareGeneration` / `ActiveSystemVersion`, or falls back
  to HTTPS when HTTP is refused.
- **Lost hub**: two failed reads in a row (one for a refused secret) set the connection status,
  the `unreachable` badges and fire `hub_connection_changed`.
- **No scene loops**: a change Gladys asked for (away mode) is expected by the service and fires
  no event. Never fire a scene event because of a received action.
- **Transport**: `"transports": ["local"]` — badges are `local` or `unreachable`.
- **Every feature declares `min`/`max`** (NOT NULL in Gladys), binary ones included.

## Rules

- **External ids are forever.** Built with `gladys.externalIds(type, platformId)`: rooms by hub
  room id, valves / thermostats / plugs by serial number (survives a re-pairing), the hub by a
  constant. Feature, config, action, trigger, scene action and widget keys are stored by users:
  never rename them.
- **The container rootfs is read-only.** Write only under `/data`. Never log the hub secret.
- **Versions belong to the Release workflow** (Actions → Release). Never edit `version` in
  `package.json` or the manifest, nor the `docker_image` tag, by hand. `test/manifest.test.js`
  checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md`
  (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a version heading.
- **Manifest.** Texts are `{ en, fr, de, es }` objects (`label`, `description`, `placeholder`),
  never plain strings; the catalog `description` holds 10 to 100 characters per language.
  `test/manifest.test.js` ties the manifest to the code (defaults, actions, triggers, scene
  actions, widgets) and pins the store rules (catalog vocabulary, search `keywords`, the
  `>=5.3.0` floor, no `countries`): change both sides together.
- **User-facing text** is in English, French, German and Spanish: messages (`src/messages.js`,
  widgets), manifest, and `docs/en.md`, `docs/fr.md`, `docs/de.md`, `docs/es.md`, kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in English. Tests
  never touch the network (the client tests use a loopback server).
