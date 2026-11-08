# Nova Forma

A personal strength-training log for the gym: fast one-handed set logging that works without signal, with AI planning to come later.

Native iOS and Android app built with [Expo](https://expo.dev) (SDK 58, React Native, TypeScript, Expo Router). All data lives in an on-device SQLite database.

- Scope and decisions: [docs/v1-scope.md](docs/v1-scope.md)
- Brand: dark "Carbon" base with a "Thermal Tangerine" accent (`#FF5C00`); see `src/constants/theme.ts`.

## Run it

```bash
npm install
npx expo start
```

Then open it on your phone, or press `w` for a quick preview in a web browser (menus that use native alerts don't work there). `expo-sqlite` ships inside Expo Go, so Expo Go works for now. Once the app needs native modules Expo Go lacks, use a development build (`npx eas-cli build --profile development`).

## Checks

```bash
npm test           # jest: domain logic plus repository tests against a real SQLite (node:sqlite)
npm run typecheck
npm run lint
```

## Layout

```
src/
  app/          screens (Expo Router): (tabs)/ for Workout, History, Exercises, Settings; session/[id] for a live workout; template/[id] to edit a template
  components/   shared UI
  data/         bundled exercise library (exercises.json)
  db/           Db interface, expo-sqlite adapter, migrations, library seeding
  domain/       pure logic: types, units, 1RM, records, set pre-fill, rest timer, formatting
  repo/         data access, written against the Db interface
  lib/          platform glue: rest-over notifications, confirm prompts, CSV export
  sync/         sync with the server: change tracking, push/pull engine, settings, background provider
  test/         node:sqlite Db for tests
server/         Cloudflare Worker: sync API and MCP server (separate package, see server/README.md)
shared/         sync wire format used by both app and server
scripts/
  port-smart-fitness-seed.js   regenerates src/data/exercises.json from the old smart-fitness seed
```

### Data rules

- Weights are stored in kg; the display unit is a setting.
- IDs are UUIDs, so rows from different phones never clash.
- Sync change tracking is done by SQLite triggers (migration 3): any change to a custom exercise, template or finished workout bumps `updated_at` and lands in `sync_dirty`. Repositories don't need to know about sync, but a new synced table needs triggers too.
- Schema changes go in a **new** entry in `src/db/migrations.ts`; never edit one that has shipped.
- Editing `src/data/exercises.json` requires bumping `LIBRARY_VERSION` in `src/db/seed.ts`.
