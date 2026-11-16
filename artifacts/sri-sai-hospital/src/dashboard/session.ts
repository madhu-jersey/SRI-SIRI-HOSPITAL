import type { SupabaseClient } from '@supabase/supabase-js';
import { api, type PublicConfig } from '../consult/api';

// Sign-in for the dashboard. On the live site it uses Supabase Auth (email and
// password); in local demo mode (in-memory store) it uses a demo account.

const DEMO_KEY = 'sri-siri-dashboard-demo-token';
let client: SupabaseClient | null = null;

export const supabaseConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

export async function supabase() {
  if (!supabaseConfigured) throw new Error('Dashboard sign-in is not set up yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'sri-siri-dashboard-auth' },
    });
  }
  return client;
}

export type AuthMode = PublicConfig['auth'];

export async function currentToken(mode: AuthMode): Promise<string | null> {
  if (mode === 'demo') {
    try { return window.sessionStorage.getItem(DEMO_KEY); } catch { return null; }
  }
  if (!supabaseConfigured) return null;
  const { data } = await (await supabase()).auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signIn(mode: AuthMode, email: string, password: string) {
  if (mode === 'demo') {
    const { accessToken } = await api<{ accessToken: string }>('auth/demo', { method: 'POST', body: { email, password } });
    try { window.sessionStorage.setItem(DEMO_KEY, accessToken); } catch { /* private mode */ }
    return;
  }
  const { error } = await (await supabase()).auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email or password is wrong.' : error.message);
}

export async function signOut(mode: AuthMode) {
  if (mode === 'demo') {
    try { window.sessionStorage.removeItem(DEMO_KEY); } catch { /* ignore */ }
    return;
  }
  await (await supabase()).auth.signOut();
}

// Calls a staff route with the current sign-in.
export async function staffApi<T>(mode: AuthMode, route: string, init: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}) {
  const token = await currentToken(mode);
  if (!token) throw Object.assign(new Error('Please sign in.'), { status: 401 });
  return api<T>(route, { ...init, token });
}

// Live "something changed" pings from the server (Supabase Realtime broadcast).
export async function subscribeToChanges(mode: AuthMode, onChange: () => void) {
  if (mode === 'demo' || !supabaseConfigured) return () => {};
  const db = await supabase();
  const channel = db.channel('consult-dashboard').on('broadcast', { event: 'changed' }, onChange).subscribe();
  return () => { db.removeChannel(channel); };
}
