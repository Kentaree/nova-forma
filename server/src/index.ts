import { createApp, type AppEnv } from './app';
import { d1Store } from './store';

export interface Env extends AppEnv {
  DB: D1Database;
}

export default createApp<Env>((env) => d1Store(env.DB));
