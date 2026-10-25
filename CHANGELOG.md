# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [0.1.0] - 2026-10-25

### Added

- Store search keywords (HeatHub, iTRV, RoomStat, Schneider, boiler, radiator valve…), so the
  integration is found by what users type.

### Changed

- Gladys 5.3.0 or later is now required (the store search keywords need it).
- `@gladysassistant/integration-sdk` updated to 0.16.0.
- The pull request CI runs the store checks without the image check, and the Release workflow
  re-runs them in full once the image is published.

## [0.0.2] - 2026-10-23

- Maintenance release, no functional change.

## [0.0.1] - 2026-10-21

### Added

- Drayton Wiser Heating integration, on the local API of the HeatHub (no Wiser
  cloud account): HTTP, or HTTPS for second-generation hubs on a recent
  firmware, chosen automatically.
- One Gladys device per Wiser room: temperature, humidity (with a Room
  Thermostat), target temperature, mode (Off / Manual / Schedule), heating
  state, boost and window detection.
- The HeatHub as a device: away mode, eco mode and boiler state.
- Hot water (mode, heating, boost), smart plugs (on/off, power, energy),
  radiator valves and room thermostats (battery, signal, radiator temperature).
- Scene triggers: window opened or closed, away mode changed outside Gladys,
  battery low, HeatHub connection lost or restored.
- Scene actions: boost a room (or every room), set a room temperature, back to
  the schedule, set away mode, boost hot water.
- Dashboard widgets: "Wiser heating" (every room, home-wide state and buttons)
  and "Wiser room" (one room, live tiles, boost form).
- Configuration screen actions: Test the connection, Identify a device.
- English, French, German and Spanish everywhere: configuration screen,
  messages, widgets and documentation.
- CI (Prettier, ESLint, tests on Node 22 and 24, store checks and Docker build
  on pull requests), UI-driven Release workflow, multi-arch image build, GitHub
  Releases from this changelog, Dependabot.
- `SECURITY.md` and `CLAUDE.md`.

[Unreleased]: https://github.com/prohand/gladys-draytonwiserheating/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/prohand/gladys-draytonwiserheating/compare/v0.0.2...v0.1.0
[0.0.2]: https://github.com/prohand/gladys-draytonwiserheating/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/prohand/gladys-draytonwiserheating/releases/tag/v0.0.1
