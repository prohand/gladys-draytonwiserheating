# Drayton Wiser Heating for Gladys

[![CI](https://github.com/prohand/gladys-draytonwiserheating/actions/workflows/ci.yml/badge.svg)](https://github.com/prohand/gladys-draytonwiserheating/actions/workflows/ci.yml)
![Transport: local](https://img.shields.io/badge/transport-local-2ea44f)
![Gladys ≥ 5.1.0](https://img.shields.io/badge/Gladys-%E2%89%A5%205.1.0-blue)

External integration for [Gladys Assistant](https://gladysassistant.com) that drives a
**Drayton Wiser** heating system through the **local API of the Wiser HeatHub**. No Wiser cloud
account: everything stays on your network, and keeps working when the internet is down.

Built on the [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
started from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js).

User documentation: [English](docs/en.md) · [Français](docs/fr.md) · [Deutsch](docs/de.md) ·
[Español](docs/es.md).

## Transport: local

The manifest declares `"transports": ["local"]`: the integration only talks to the HeatHub on the
LAN (`/data/v2/domain/`, with the hub `SECRET` header). Every device shows a **local** badge in
Gladys, or **unreachable** when the hub stops answering. There is no cloud channel: the Wiser
cloud API is not public.

## Devices

| Gladys device             | Features                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| Wiser HeatHub             | away mode (switch), eco mode (switch), boiler (thermostat operating state)                          |
| Room (one per Wiser room) | temperature, humidity\*, target temperature, mode Off / Manual / Schedule, heating, boost, window\* |
| Hot water\*               | mode Off / On / Schedule, heating, boost                                                            |
| Smart plug                | on/off, power (W), energy (kWh), signal                                                             |
| Radiator valve (iTRV)     | battery (%), signal, radiator temperature                                                           |
| Room thermostat           | battery (%), signal                                                                                 |

\* when the hardware provides it (a Room Thermostat for humidity, valves for the window, a cylinder
for hot water).

## Scene triggers, scene actions and widgets (Gladys 5.1+)

| Kind          | Key                      | What                                                              |
| ------------- | ------------------------ | ----------------------------------------------------------------- |
| Scene trigger | `window_changed`         | a valve detected a window opened or closed                        |
| Scene trigger | `away_mode_changed`      | away mode changed **outside Gladys** (Wiser app, hub button)      |
| Scene trigger | `battery_low`            | a valve or thermostat needs new batteries soon                    |
| Scene trigger | `hub_connection_changed` | the hub was lost or answers again                                 |
| Scene action  | `boost_room`             | boost one room, or every room                                     |
| Scene action  | `set_room_temperature`   | a target temperature, until the next schedule slot or for a while |
| Scene action  | `cancel_overrides`       | back to the schedule, one room or every room                      |
| Scene action  | `set_away_mode`          | away mode on / off                                                |
| Scene action  | `boost_hot_water`        | heat the water now for a while                                    |
| Widget        | `heating_overview`       | every room, home-wide state, away / schedule / hot water buttons  |
| Widget        | `room`                   | one room: live tiles, boost form, cancel, schedule                |

Configuration screen actions: **Test the connection** and **Identify a device**.

## Project structure

```
.
├─ index.js                          # SDK bootstrap + wiring (no hub logic)
├─ src/
│  ├─ service.js                     # timer, refresh, publication, commands
│  ├─ wiser/                         # the hub: client, domain parser, command bodies
│  ├─ devices/                       # one file per device type
│  ├─ capabilities/                  # scene triggers, scene actions, widgets
│  ├─ actions.js                     # Configuration screen actions
│  ├─ messages.js / i18n.js          # user-facing texts (en, fr, de, es)
│  └─ config.js                      # config defaults + normalization
├─ docs/                             # user documentation, en / fr / de / es
├─ test/                             # node --test, SDK fake Gladys + fake hub
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md · CLAUDE.md · SECURITY.md
└─ .github/                          # CI, Release, build, GitHub releases, Dependabot
```

## Development

```bash
npm install
npm test               # unit tests (node --test), no network
npm run lint           # ESLint
npm run format:check   # Prettier (npm run format to fix)
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run it against a real hub:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="drayton-wiser-heating" \
LOG_LEVEL=debug \
npm start
```

## Workflows

The same workflows as [prohand/gladys-devmel](https://github.com/prohand/gladys-devmel):

- **CI** (`ci.yml`) — Prettier, ESLint and tests on Node 22 and 24 on every push to `main` and
  every pull request; on pull requests, the store admission checks and a Docker build too.
- **Release** (`release.yml`) — Actions → Release → Run workflow → `patch` / `minor` / `major`:
  bumps `package.json`, the manifest `version` and `docker_image`, rolls `CHANGELOG.md`, tags
  `vX.Y.Z`, builds the image and publishes the GitHub Release.
- **Build** (`build.yml`) — multi-arch image (`linux/amd64` + `linux/arm64`) to `ghcr.io`, from a
  tag, a manual run or the Release workflow.
- **GitHub releases** (`github-release.yml`) — one GitHub Release per `vX.Y.Z` tag, notes from
  the changelog.
- **Dependabot** — npm weekly, GitHub Actions and the Docker base image monthly.

## Publish

1. Add the GitHub topic `gladys-assistant-integration` to the repository.
2. Turn on **Private vulnerability reporting** (Settings → Security): `SECURITY.md` sends
   reporters there.
3. Make the `ghcr.io` package public once the first image is built.
4. Run **Actions → Release** with `major` for the first release (`0.0.0` → `1.0.0`).

## License

Apache-2.0
