# Nova Forma server

A small Cloudflare Worker with a D1 (SQLite) database. It does two jobs:

1. **Sync** for the app: the app pushes the workouts, templates and custom exercises it has changed, and pulls everything changed elsewhere since its last sync.
2. **MCP server** for Claude, ChatGPT and other chat apps: they can read your training history and write workout templates, which the app picks up on its next sync.

The sync wire format lives in [`../shared/sync-protocol.ts`](../shared/sync-protocol.ts) so the app and the server share one definition.

## How sync works

- Each workout, template and custom exercise is one document. When the same document changes on two devices, the copy with the later `updatedAt` wins.
- A deleted document is kept as a tombstone (`deletedAt` set) so the deletion reaches other devices.
- Every accepted change gets an increasing sequence number. The app sends the last number it has seen (`cursor`) and gets back everything after it, plus the new cursor.

## MCP tools

| Tool | What it does |
|---|---|
| `list_exercises` | Search the built-in library plus your custom exercises by name or muscle |
| `get_recent_workouts` | Workouts from the last N days, with every set |
| `get_exercise_progress` | One exercise over time: sets, estimated 1RM per session, best set |
| `list_templates` | Your templates with targets |
| `save_template` | Create a template, or replace one by id |
| `delete_template` | Delete a template |

Weights are in kg. The built-in library is bundled from `../src/data/exercises.json`, so ids match the app. The MCP server only sees what the phone has synced.

## Endpoints

| Path | Auth | |
|---|---|---|
| `GET /health` | none | `{ "ok": true }` |
| `POST /v1/sync` | `Authorization: Bearer <SYNC_TOKEN>` | App sync: `SyncRequest` in, `SyncResponse` out |
| `/mcp` | OAuth access token | MCP (streamable HTTP, stateless) |
| `/authorize` | Sync token, typed on the page | Sign-in page chat apps send you to |
| `/oauth/token`, `/oauth/register`, `/.well-known/*` | | Handled by `@cloudflare/workers-oauth-provider` |

It's a single-user server. The one secret, `SYNC_TOKEN`, is the app's bearer token and also what you type on the sign-in page when connecting a chat app. Chat apps never see it: they get their own OAuth tokens, stored hashed in the `OAUTH_KV` namespace.

## Develop

```sh
npm install
npm run db:migrate:local
echo 'SYNC_TOKEN=dev-token' > .dev.vars   # git-ignored
npm run dev                                # http://localhost:8787
npm test                                   # vitest: sync, auth and MCP tools against in-memory SQLite
npm run typecheck
```

## Deploy (one-time setup)

You need a Cloudflare account (the free plan is enough).

```sh
npx wrangler login
npx wrangler d1 create nova-forma            # copy the database_id into wrangler.jsonc
npx wrangler kv namespace create OAUTH_KV    # copy the id into wrangler.jsonc
npm run db:migrate:remote
openssl rand -base64 32                      # generate a token, keep it in your password manager
npx wrangler secret put SYNC_TOKEN           # paste the token
npm run deploy                               # prints https://nova-forma-api.<you>.workers.dev
```

Then:

- **App:** Settings → Sync, enter the URL and token.
- **Claude:** Settings → Connectors → Add custom connector, with the URL `https://nova-forma-api.<you>.workers.dev/mcp`. Claude opens the sign-in page; enter your token and Allow.
- **ChatGPT:** add a custom connector (MCP server) with the same `/mcp` URL and OAuth authentication, then sign in the same way. Where this lives in ChatGPT's settings depends on your plan.

Never commit the token. To cut off a chat app, remove the connector there; to cut off everything, change `SYNC_TOKEN` (and update the app).
