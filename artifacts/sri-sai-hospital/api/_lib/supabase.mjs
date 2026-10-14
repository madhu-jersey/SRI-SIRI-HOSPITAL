import { createClient } from '@supabase/supabase-js';

export function getSupabaseClient() {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error('Appointment storage is not configured.');
  }
  return createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function deleteExpiredAppointments(client, now) {
  const { error } = await client
    .from('appointments')
    .delete({ count: 'exact' })
    .lt('expires_at', now.toISOString());
  if (error) throw new Error('Could not clean up expired appointments.');
}
