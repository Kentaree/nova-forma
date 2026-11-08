# Nova Forma sync server

A small Cloudflare Worker with a D1 (SQLite) database. The app pushes the workouts, templates and custom exercises it has changed, and pulls everything changed elsewhere since its last sync. Later it will also host the MCP server that lets Claude or ChatGPT read your history and write templates.

The wire format lives in [`../shared/sync-protocol.ts`](../shared/sync-protocol.ts) so the app and the server share one definition.

## How sync works

- Each workout, template and custom exercise is one document. When the same document changes on two devices, the copy with the later `updatedAt` wins.
- A deleted document is kept as a tombstone (`deletedAt` set) so the deletion reaches other devices.
- Every accepted change gets an increasing sequence number. The app sends the last number it has seen (`cursor`) and gets back everything after it, plus the new cursor.

## API

| Method | Path | Auth | |
|---|---|---|---|
| GET | `/health` | none | `{ "ok": true }` |
| POST | `/v1/sync` | `Authorization: Bearer <SYNC_TOKEN>` | Body is a `SyncRequest`, response is a `SyncResponse` |

This is a single-user server: one shared secret guards it. Multi-user sign-in arrives with the MCP server (OAuth).

## Develop

```sh
npm install
npm run db:migrate:local
echo 'SYNC_TOKEN=dev-token' > .dev.vars   # git-ignored
npm run dev                                # http://localhost:8787
npm test                                   # vitest, against in-memory SQLite
npm run typecheck
```

## Deploy (one-time setup)

You need a Cloudflare account (the free plan is enough).

```sh
npx wrangler login
npx wrangler d1 create nova-forma          # copy the database_id it prints into wrangler.jsonc
npm run db:migrate:remote
openssl rand -base64 32                    # generate a token, keep it in your password manager
npx wrangler secret put SYNC_TOKEN         # paste the token
npm run deploy                             # prints https://nova-forma-api.<you>.workers.dev
```

Then enter the URL and token in the app's settings. Never commit the token.
