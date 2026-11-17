import { readConfig, missingSettings } from './_lib/config.mjs';
import { sendJson } from './_lib/http.mjs';
import { createMessagingProvider } from './_lib/providers/messaging.mjs';
import { createRealtime } from './_lib/providers/realtime.mjs';
import { createZoomProvider } from './_lib/providers/zoom.mjs';
import { createPushProvider } from './_lib/providers/push.mjs';
import { createRouter } from './_lib/router.mjs';
import { createService } from './_lib/service.mjs';

// Builds the whole API from settings. Tests pass their own store and clock.
export async function buildApp({ env = process.env, store, now, fetchImpl, push } = {}) {
  const config = readConfig(env);
  const missing = missingSettings(config);
  if (!store) {
    if (config.store === 'memory') {
      const { createMemoryStore } = await import('./_lib/store/memory.mjs');
      store = createMemoryStore({ demoPassword: env.DEMO_PASSWORD || 'demo' });
    } else {
      const { createSupabaseStore } = await import('./_lib/store/supabase.mjs');
      store = createSupabaseStore(config);
    }
  }
  const service = createService({
    config,
    store,
    zoom: createZoomProvider(config, fetchImpl),
    messaging: createMessagingProvider(config),
    push: push ?? createPushProvider(config),
    realtime: createRealtime(config, fetchImpl),
    now,
  });
  return { config, missing, store, service, handle: createRouter({ config, store, service }) };
}

let appPromise;

export default async function handler(request, response) {
  appPromise ??= buildApp().catch((error) => {
    appPromise = undefined;
    throw error;
  });
  let app;
  try {
    app = await appPromise;
  } catch (error) {
    console.error('API could not start:', error);
    sendJson(response, 500, { error: 'Online consultations are not available right now. Please call the hospital.' });
    return;
  }
  if (app.missing.length) {
    console.error(`Missing settings: ${app.missing.join(', ')}`);
    sendJson(response, 503, { error: 'Online consultations are not set up yet. Please call the hospital.' });
    return;
  }
  return app.handle(request, response);
}
