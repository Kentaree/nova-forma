import {
  AuthorizationError,
  CimdFetchError,
  type ConsentDescription,
  type OAuthHelpers,
} from '@cloudflare/workers-oauth-provider';
import type { Hono } from 'hono';

import { safeEqual } from './auth';

/**
 * The OAuth sign-in page for MCP clients (Claude, ChatGPT…). This is a single-user server,
 * so "signing in" means typing the same SYNC_TOKEN the app uses, then approving the client.
 */

export const OWNER = 'owner';

interface AuthEnv {
  SYNC_TOKEN?: string;
  OAUTH_PROVIDER: OAuthHelpers;
}

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const STYLE = `
  :root { color-scheme: dark; --bg:#121212; --surface:#1e1e1e; --text:#f2f2f2; --muted:#a0a0a0; --accent:#FF5C00; --danger:#F87171; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--text);
    font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding:16px; }
  main { width:100%; max-width:420px; background:var(--surface); border-radius:16px; padding:24px; }
  h1 { font-size:22px; margin:0 0 8px; }
  p { color:var(--muted); margin:8px 0; }
  strong { color:var(--text); }
  .warn { color:var(--danger); }
  label { display:block; margin:16px 0 6px; font-weight:600; }
  input[type=password] { width:100%; padding:12px; border-radius:10px; border:1px solid #333; background:var(--bg); color:var(--text); font-size:16px; }
  .row { display:flex; gap:12px; margin-top:20px; }
  button { flex:1; padding:12px; border-radius:10px; border:0; font-size:16px; font-weight:700; cursor:pointer; }
  .allow { background:var(--accent); color:#fff; } .deny { background:#2a2a2a; color:var(--text); }
  a { color:var(--accent); }`;

function page(title: string, body: string, status = 200, headers = new Headers()): Response {
  headers.set('Content-Type', 'text/html; charset=utf-8');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title>
<style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, { status, headers });
}

function consentBody(d: ConsentDescription, handle: string): string {
  const name = escape(d.clientName);
  const origin = d.clientDomain
    ? `Published by <strong>${escape(d.clientDomain)}</strong>.`
    : 'This app registered itself, so its name is not verified.';
  return `
<h1>Connect ${name} to Nova Forma?</h1>
<p>${origin} Access will be sent to <strong>${escape(d.redirectHost)}</strong>.</p>
${d.redirectIsLoopback ? '<p class="warn">This sends access to an app on your computer. Continue only if you just started connecting from it.</p>' : ''}
<p>It will be able to read your workouts and exercise history, and create, change or delete your templates.</p>
<form method="post">
  <input type="hidden" name="handle" value="${escape(handle)}">
  <label for="token">Sync token</label>
  <input id="token" name="token" type="password" autocomplete="current-password" required>
  <p>The same token you entered in the app's Sync settings.</p>
  <div class="row">
    <button class="deny" name="decision" value="deny" formnovalidate>Deny</button>
    <button class="allow" name="decision" value="approve">Allow</button>
  </div>
</form>`;
}

function errorPage(message: string, status = 400): Response {
  return page('Nova Forma', `<h1>Couldn't connect</h1><p>${escape(message)}</p>`, status);
}

export function registerAuthorize<E extends AuthEnv>(app: Hono<{ Bindings: E }>): void {
  app.get('/authorize', async (c) => {
    const oauth = c.env.OAUTH_PROVIDER;
    try {
      const request = await oauth.parseAuthRequest(c.req.raw);
      const details = await oauth.describeConsent(request);
      const consent = await oauth.beginConsent(request);
      return page(`Connect ${details.clientName}`, consentBody(details, consent.handle), 200, consent.headers);
    } catch (e) {
      return handleError(e);
    }
  });

  app.post('/authorize', async (c) => {
    const oauth = c.env.OAUTH_PROVIDER;
    try {
      const form = await c.req.raw.formData();
      const handle = String(form.get('handle') ?? '');
      if (form.get('decision') !== 'approve') {
        const denied = await oauth.denyConsent(c.req.raw, handle);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      const expected = c.env.SYNC_TOKEN;
      if (!expected) return errorPage('The server is missing its SYNC_TOKEN secret.', 500);
      // Checked before approveConsent(), which would use up the handle: going back lets you retry.
      if (!safeEqual(String(form.get('token') ?? ''), expected)) {
        return page(
          'Wrong token',
          `<h1>That token didn't match</h1><p>Go back and try again.</p>`,
          401,
        );
      }
      const approved = await oauth.approveConsent(c.req.raw, handle);
      const { redirectTo } = await oauth.completeAuthorization({
        request: approved.request,
        userId: OWNER,
        metadata: {},
        scope: approved.request.scope,
        props: { userId: OWNER },
      });
      approved.headers.set('Location', redirectTo);
      return new Response(null, { status: 302, headers: approved.headers });
    } catch (e) {
      return handleError(e);
    }
  });
}

function handleError(e: unknown): Response {
  if (e instanceof AuthorizationError && e.redirectTo) return Response.redirect(e.redirectTo, 302);
  if (e instanceof AuthorizationError) return errorPage(e.description ?? 'This sign-in link expired or was already used. Start again from the app.');
  if (e instanceof CimdFetchError) return errorPage('This app could not be verified.');
  throw e;
}
