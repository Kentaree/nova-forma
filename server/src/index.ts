import OAuthProvider, { type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import { createApp, type AppEnv } from './app';
import { registerAuthorize } from './authorize';
import { d1Store } from './d1-store';
import { createMcpServer } from './mcp/server';

export interface Env extends AppEnv {
  DB: D1Database;
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
}

/** Everything that isn't the MCP endpoint: health, the app's sync API and the sign-in page. */
const app = createApp<Env>((env) => d1Store(env.DB));
registerAuthorize(app);

/** The MCP endpoint. Stateless: a fresh server and transport per request, JSON responses. */
const mcpHandler = {
  async fetch(request: Request, env: Env) {
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    const server = createMcpServer(d1Store(env.DB));
    await server.connect(transport);
    return transport.handleRequest(request);
  },
} satisfies ExportedHandler<Env>;

const SCOPE = 'workouts';

/**
 * The OAuth provider needs the server's public URL as the token audience. That depends on
 * the account it's deployed to, so it's taken from the request and the provider is built
 * once per origin.
 */
const providers = new Map<string, OAuthProvider<Env>>();

function providerFor(origin: string): OAuthProvider<Env> {
  let provider = providers.get(origin);
  if (!provider) {
    provider = new OAuthProvider<Env>({
      apiRoute: '/mcp',
      apiHandler: mcpHandler,
      defaultHandler: { fetch: (request, env, ctx) => app.fetch(request, env, ctx) },
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/oauth/token',
      clientRegistrationEndpoint: '/oauth/register',
      clientIdMetadataDocumentEnabled: true,
      scopesSupported: [SCOPE, 'offline_access'],
      requiredScopes: [SCOPE],
      resourceMetadata: { resource: `${origin}/mcp`, authorization_servers: [origin] },
    });
    providers.set(origin, provider);
  }
  return provider;
}

export default {
  fetch(request, env, ctx) {
    return providerFor(new URL(request.url).origin).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
