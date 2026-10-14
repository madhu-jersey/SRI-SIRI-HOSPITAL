import { createBookingHandler } from './_lib/handlers.mjs';
import { sendAppointmentEmails } from './_lib/email.mjs';
import { getSupabaseClient } from './_lib/supabase.mjs';

export default createBookingHandler({
  createClient: getSupabaseClient,
  sendEmails: sendAppointmentEmails,
});
