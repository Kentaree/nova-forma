# Nova Forma v1 scope

Agreed with Pete on 2026-11-06.

**Goal of v1:** replace a notes app or spreadsheet for logging gym sessions on your phone. It has to be fast with one hand between sets, and work with no signal. No AI yet.

## In v1

### 1. Exercise library
- 80 exercises ported from smart-fitness `seed.js`, plus 30 gym staples it was missing (cables, machines, RDL, hip thrust...), bundled in the app so they work offline.
- Search and filter by muscle group and equipment.
- Add your own custom exercises.
- Each exercise has a type: **reps + weight**, **reps only** (bodyweight), **time** (planks, holds) or **cardio** (distance, duration, optional calories and heart rate).

### 2. Templates (your own plans)
- Build a reusable workout, e.g. "Push A", as an ordered list of exercises with target sets × reps.
- Start a session from a template or from a blank session.
- Supersets and circuits: group exercises so you alternate between them.

### 3. Logging a session (the core of v1)
- One screen per session. Each exercise shows **what you did last time** inline.
- Log a set in 1–2 taps: weight and reps are pre-filled from your last set or last session, with +/- steppers.
- Mark a set as warm-up, working or failure. Add an optional RPE.
- A rest timer starts automatically when you log a set. It vibrates and plays a sound, and keeps running when the phone is locked or the app is in the background.
- Reorder, add, swap or skip exercises during the session.
- Quick cardio entry, e.g. "Rower 2000m, 8:12".
- The session is saved after every set, so a crash or a dead battery loses nothing.

### 4. History and progress
- A list of past sessions, with a detail view for each.
- Per exercise: full history, best set, estimated 1RM, and a simple chart over time.
- Personal-record badges when you beat a best.

### 5. Settings
- kg or lb, plate and dumbbell increments (from smart-fitness weight denominations), and default rest time.

### 6. Data
- On-device SQLite is the only store in v1, so everything above works fully offline.
- Export to CSV (also the backup route until sync exists).

## Not in v1 (later)
- Sign-in and backup/sync to a backend (v1.1). The schema already uses UUIDs so rows can sync later.
- AI plan generation, progression suggestions and the coach chat (step 4).
- Apple Health / Google Fit, watch apps, body weight and measurements.
- Sharing, social features, admin pages and invites.

## Decisions
- Native app via Expo (iOS and Android from one codebase).
- No backup/sync in v1, so data stays on the phone. Backup/sync comes in v1.1.
- No import of smart-fitness workout history. Start fresh.
- Supersets are in v1.
