import { createAvailabilityHandler } from './_lib/handlers.mjs';
import { getSupabaseClient } from './_lib/supabase.mjs';

export default createAvailabilityHandler({ createClient: getSupabaseClient });
