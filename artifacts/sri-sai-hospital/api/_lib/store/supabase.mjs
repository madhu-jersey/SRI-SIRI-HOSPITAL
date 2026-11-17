import { createClient } from '@supabase/supabase-js';
import { ACTIVE, StoreConflict } from './errors.mjs';

// Postgres (Supabase) store, used through the secret key on the server only.
// Overlap and hold rules are enforced by the database itself (see the migration).

const CONSULTATION_COLUMNS = 'id, ref_code, doctor_id, patient_name, patient_phone, starts_at, ends_at, status, consent_at, reject_reason, meeting_provider, meeting_id, join_url, meeting_passcode, accepted_at, confirmation_sent_at, link_reminder_sent_at, feedback_request_sent_at, created_at, updated_at';

function fail(error, context) {
  const known = ['slot_taken', 'hold_expired'].find((code) => error.message?.includes(code));
  if (known) throw new StoreConflict(known);
  if (error.code === '23P01') throw new StoreConflict('slot_taken');
  const wrapped = new Error(`${context}: ${error.message}`);
  wrapped.cause = error;
  throw wrapped;
}

const flattenFeedback = (row) => (row ? { ...row, feedback: Array.isArray(row.feedback) ? row.feedback[0] ?? null : row.feedback ?? null } : row);

export function createSupabaseStore(config) {
  const db = createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  async function insertEvent(id, fromStatus, toStatus, event) {
    const { error } = await db.from('consultation_events').insert({
      consultation_id: id, from_status: fromStatus, to_status: toStatus,
      actor: event.actor, actor_id: event.actorId ?? null, note: event.note,
    });
    if (error) console.error('Could not record consultation event', error.message);
  }

  return {
    kind: 'supabase',

    async getDoctor(slug = 'sritha') {
      const { data, error } = await db.from('doctors').select('*').eq('slug', slug).maybeSingle();
      if (error) fail(error, 'doctor');
      return data;
    },
    async getDoctorById(id) {
      const { data, error } = await db.from('doctors').select('*').eq('id', id).maybeSingle();
      if (error) fail(error, 'doctor');
      return data;
    },
    async listRules(doctorId) {
      const { data, error } = await db.from('availability_rules').select('weekday, start_minute, end_minute, slot_minutes').eq('doctor_id', doctorId);
      if (error) fail(error, 'availability');
      return data;
    },
    async listBusy(doctorId, fromIso, toIso, exceptTokenHash) {
      const [booked, held] = await Promise.all([
        db.from('consultations').select('starts_at, ends_at').eq('doctor_id', doctorId).in('status', ACTIVE).lt('starts_at', toIso).gt('ends_at', fromIso),
        db.from('slot_holds').select('starts_at, ends_at, hold_token_hash').eq('doctor_id', doctorId).gt('expires_at', new Date().toISOString()).lt('starts_at', toIso).gt('ends_at', fromIso),
      ]);
      if (booked.error) fail(booked.error, 'busy slots');
      if (held.error) fail(held.error, 'held slots');
      return [
        ...booked.data,
        ...held.data.filter((hold) => hold.hold_token_hash !== exceptTokenHash).map(({ starts_at, ends_at }) => ({ starts_at, ends_at })),
      ];
    },
    async holdSlot(doctorId, startsAt, endsAt, tokenHash, ttlSeconds) {
      const { data, error } = await db.rpc('hold_slot', { p_doctor: doctorId, p_starts: startsAt, p_ends: endsAt, p_token_hash: tokenHash, p_ttl_seconds: ttlSeconds });
      if (error) fail(error, 'hold');
      return new Date(data).toISOString();
    },
    async getHold(tokenHash) {
      const { data, error } = await db.from('slot_holds').select('doctor_id, starts_at, ends_at, expires_at').eq('hold_token_hash', tokenHash).gt('expires_at', new Date().toISOString()).maybeSingle();
      if (error) fail(error, 'hold');
      return data;
    },
    async releaseHold(tokenHash) {
      const { error } = await db.from('slot_holds').delete().eq('hold_token_hash', tokenHash);
      if (error) fail(error, 'release hold');
    },
    async createRequestFromHold(tokenHash, refCode, name, phone, consentAt) {
      const { data, error } = await db.rpc('create_request_from_hold', { p_token_hash: tokenHash, p_ref_code: refCode, p_name: name, p_phone: phone, p_consent_at: consentAt });
      if (error?.code === '23505') throw new StoreConflict('ref_taken');
      if (error) fail(error, 'request');
      return data;
    },
    async getConsultation(id) {
      const { data, error } = await db.from('consultations').select(`${CONSULTATION_COLUMNS}, feedback(rating, comment, allow_public, created_at)`).eq('id', id).maybeSingle();
      if (error) fail(error, 'consultation');
      return flattenFeedback(data);
    },
    async listDashboard(sinceIso) {
      const { data, error } = await db.from('consultations')
        .select(`${CONSULTATION_COLUMNS}, feedback(rating, comment, allow_public, created_at)`)
        .or(`status.eq.requested,ends_at.gte."${sinceIso}"`)
        .order('starts_at', { ascending: true })
        .limit(300);
      if (error) fail(error, 'dashboard');
      return data.map(flattenFeedback);
    },
    async transition(id, fromStatus, toStatus, patch, event) {
      const { data, error } = await db.from('consultations').update({ ...patch, status: toStatus }).eq('id', id).eq('status', fromStatus).select(CONSULTATION_COLUMNS).maybeSingle();
      if (error) fail(error, 'status change');
      if (data) await insertEvent(id, fromStatus, toStatus, event);
      return data;
    },
    async updateMeeting(id, meeting) {
      const { data, error } = await db.from('consultations').update(meeting).eq('id', id).eq('status', 'requested').select(CONSULTATION_COLUMNS).maybeSingle();
      if (error) fail(error, 'meeting');
      return data;
    },
    async markSent(id, field, event) {
      const { data, error } = await db.from('consultations').update({ [field]: new Date().toISOString() }).eq('id', id).is(field, null).select(CONSULTATION_COLUMNS).maybeSingle();
      if (error) fail(error, 'mark sent');
      if (data) await insertEvent(id, null, null, event);
      return data ?? this.getConsultation(id);
    },
    async listEvents(id) {
      const { data, error } = await db.from('consultation_events').select('from_status, to_status, actor, note, created_at').eq('consultation_id', id).order('id');
      if (error) fail(error, 'events');
      return data;
    },
    async addEvent(id, event) {
      await insertEvent(id, null, null, event);
    },
    // Devices that get notifications are kept as settings rows named push:<id>,
    // so no extra table is needed.
    async savePushDevice(key, value, userId) {
      const { error } = await db.from('settings').upsert({ key, value, updated_by: userId ?? null, updated_at: new Date().toISOString() });
      if (error) fail(error, 'save device');
    },
    async listPushDevices() {
      const { data, error } = await db.from('settings').select('key, value').like('key', 'push:%');
      if (error) fail(error, 'devices');
      return data.map((row) => ({ key: row.key, ...row.value }));
    },
    async removePushDevice(key) {
      const { error } = await db.from('settings').delete().eq('key', key);
      if (error) fail(error, 'remove device');
    },
    async getSettings() {
      const { data, error } = await db.from('settings').select('key, value').not('key', 'like', 'push:%');
      if (error) fail(error, 'settings');
      return Object.fromEntries(data.map((row) => [row.key, row.value]));
    },
    async putSettings(entries, userId) {
      const rows = Object.entries(entries).map(([key, value]) => ({ key, value, updated_by: userId, updated_at: new Date().toISOString() }));
      const { error } = await db.from('settings').upsert(rows);
      if (error) fail(error, 'save settings');
    },
    async saveFeedback(consultationId, rating, comment, allowPublic) {
      const { error } = await db.from('feedback').insert({ consultation_id: consultationId, rating, comment, allow_public: allowPublic });
      if (error?.code === '23505') throw new StoreConflict('feedback_exists');
      if (error) fail(error, 'feedback');
    },
    async rateLimitHit(key, windowSeconds, limit) {
      const { data, error } = await db.rpc('rate_limit_hit', { p_key: key, p_window_seconds: windowSeconds, p_limit: limit });
      if (error) {
        // Do not lock patients out if the limiter itself fails.
        console.error('Rate limit check failed', error.message);
        return true;
      }
      return data === true;
    },
    async expireStale() {
      const { data, error } = await db.rpc('expire_stale_requests');
      if (error) fail(error, 'expire');
      return data;
    },
    async completePast() {
      const { data, error } = await db.from('consultations').update({ status: 'completed' }).eq('status', 'scheduled').lte('ends_at', new Date().toISOString()).select('id');
      if (error) fail(error, 'complete');
      for (const row of data) await insertEvent(row.id, 'scheduled', 'completed', { actor: 'system', note: 'Appointment time has passed' });
      return data.length;
    },
    async sweepLegacy() {
      const { data, error } = await db.rpc('sweep_legacy_bookings');
      if (error) fail(error, 'legacy sweep');
      return data;
    },

    // ----- Calendar control -----
    async replaceRules(doctorId, rules) {
      const { data, error } = await db.rpc('replace_availability', { p_doctor: doctorId, p_rules: rules });
      if (error) fail(error, 'clinic hours');
      return data;
    },
    async listTimeOff(doctorId, fromIso, toIso) {
      const { data, error } = await db.from('time_off').select('id, starts_at, ends_at, reason, created_at').eq('doctor_id', doctorId).lt('starts_at', toIso).gt('ends_at', fromIso).order('starts_at');
      if (error) fail(error, 'time off');
      return data;
    },
    async addTimeOff(doctorId, startsAt, endsAt, reason, userId) {
      const { data, error } = await db.from('time_off').insert({ doctor_id: doctorId, starts_at: startsAt, ends_at: endsAt, reason, created_by: userId }).select('id, starts_at, ends_at, reason, created_at').single();
      if (error) fail(error, 'add time off');
      return data;
    },
    async removeTimeOff(id) {
      const { data, error } = await db.from('time_off').delete().eq('id', id).select('id');
      if (error) fail(error, 'remove time off');
      return data.length > 0;
    },
    async listConsultationsBetween(doctorId, fromIso, toIso) {
      const { data, error } = await db.from('consultations').select(`${CONSULTATION_COLUMNS}, feedback(rating, comment, allow_public, created_at)`).eq('doctor_id', doctorId).lt('starts_at', toIso).gt('ends_at', fromIso).order('starts_at').limit(500);
      if (error) fail(error, 'calendar');
      return data.map(flattenFeedback);
    },
    async search(text) {
      const safe = text.replace(/[%_,()."\\]/g, ' ').trim();
      const digits = text.replace(/\D/g, '');
      const filters = [`patient_name.ilike.%${safe}%`, `ref_code.ilike.%${safe}%`];
      if (digits.length >= 4) filters.push(`patient_phone.like.%${digits}%`);
      const { data, error } = await db.from('consultations').select(`${CONSULTATION_COLUMNS}, feedback(rating, comment, allow_public, created_at)`).or(filters.join(',')).order('starts_at', { ascending: false }).limit(50);
      if (error) fail(error, 'search');
      return data.map(flattenFeedback);
    },
    async reschedule(id, startsAt, endsAt, patch, event) {
      const { data, error } = await db.from('consultations').update({ ...patch, starts_at: startsAt, ends_at: endsAt }).eq('id', id).in('status', ACTIVE).select(CONSULTATION_COLUMNS).maybeSingle();
      if (error) fail(error, 'reschedule');
      if (data) await insertEvent(id, null, null, event);
      return data;
    },

    async getUserFromToken(token) {
      const { data, error } = await db.auth.getUser(token);
      if (error || !data?.user) return null;
      return { id: data.user.id, email: data.user.email };
    },
    async getStaff(userId) {
      const { data, error } = await db.from('staff').select('user_id, doctor_id, role, display_name').eq('user_id', userId).maybeSingle();
      if (error) fail(error, 'staff');
      return data;
    },
  };
}
