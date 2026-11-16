// Tells open dashboards "something changed" so they refetch at once.
// Only a bare ping goes out: no names, numbers or times.

export const DASHBOARD_TOPIC = 'consult-dashboard';

export function createRealtime(config, fetchImpl = globalThis.fetch) {
  if (config.store !== 'supabase' || !config.supabaseUrl || !config.supabaseSecretKey) {
    return { async ping() {} };
  }
  return {
    async ping(reason) {
      try {
        const headers = { 'Content-Type': 'application/json', apikey: config.supabaseSecretKey };
        if (!config.supabaseSecretKey.startsWith('sb_')) headers.Authorization = `Bearer ${config.supabaseSecretKey}`;
        const response = await fetchImpl(`${config.supabaseUrl}/realtime/v1/api/broadcast`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ messages: [{ topic: DASHBOARD_TOPIC, event: 'changed', payload: { reason } }] }),
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) console.error('Realtime ping failed', response.status);
      } catch (error) {
        // Dashboards also poll, so a missed ping only delays the update.
        console.error('Realtime ping failed', error.message);
      }
    },
  };
}
