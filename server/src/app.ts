import { Hono } from 'hono';

import { applyChanges, changesSince } from './sync';
import type { Store } from './store';
import { syncRequest } from './validate';

export interface AppEnv {
  /** Bearer token the app must send. Set with `wrangler secret put SYNC_TOKEN`. */
  SYNC_TOKEN?: string;
}

/** Constant-time string comparison, so the token can't be guessed byte by byte from timings. */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/** Builds the HTTP app. `getStore` is injected so tests can run against a local SQLite. */
export function createApp<E extends AppEnv>(getStore: (env: E) => Store) {
  const app = new Hono<{ Bindings: E }>();

  app.get('/health', (c) => c.json({ ok: true }));

  app.use('/v1/*', async (c, next) => {
    const expected = c.env.SYNC_TOKEN;
    if (!expected) return c.json({ error: 'Server is not configured: SYNC_TOKEN secret is missing' }, 500);
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !safeEqual(token, expected)) return c.json({ error: 'Unauthorized' }, 401);
    await next();
  });

  app.post('/v1/sync', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Body must be JSON' }, 400);
    }
    const parsed = syncRequest.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Invalid sync request', issues: parsed.error.issues.slice(0, 10) }, 400);

    const store = getStore(c.env);
    await applyChanges(store, parsed.data);
    return c.json(await changesSince(store, parsed.data.cursor));
  });

  return app;
}
