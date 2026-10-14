import { createCleanupHandler } from './_lib/handlers.mjs';
import { getSupabaseClient } from './_lib/supabase.mjs';

export default createCleanupHandler({ createClient: getSupabaseClient });
