import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { ACTIVE, StoreConflict } from './errors.mjs';

// In-memory store for local demos and automated tests. It follows the same
// rules as the Postgres migration (no overlaps, holds, append-only history)
// but forgets everything when the process restarts. Never used on Vercel.

const overlaps = (aStart, aEnd, bStart, bEnd) => Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);
const clone = (value) => (value == null ? value : structuredClone(value));

export function createMemoryStore({ now = () => Date.now(), demoPassword = 'demo' } = {}) {
  const iso = () => new Date(now()).toISOString();
  const doctor = {
    id: randomUUID(),
    slug: 'sritha',
    display_name: 'Dr. Sritha',
    qualification: 'MBBS, MD (Neuro-Psychiatry)',
    registration_no: 'APMC Reg. No. 85598',
    consult_minutes: 30,
    zoom_user: null,
  };
  const rules = [1, 2, 3, 4, 5, 6].map((weekday) => ({ doctor_id: doctor.id, weekday, start_minute: 17 * 60 + 30, end_minute: 20 * 60 + 30, slot_minutes: 30 }));
  const consultations = new Map();
  const holds = new Map();
  const events = [];
  const feedback = new Map();
  const settings = new Map();
  const rateLimits = new Map();
  const sessions = new Map();
  const timeOff = [];
  const pushDevices = new Map();
  const reminderPushes = new Set();
  const demoUser = { id: randomUUID(), email: 'doctor@demo.local' };
  const staff = { user_id: demoUser.id, doctor_id: doctor.id, role: 'doctor', display_name: 'Dr. Sritha' };

  function purgeHolds() {
    for (const [hash, hold] of holds) if (Date.parse(hold.expires_at) <= now()) holds.delete(hash);
  }

  function addEvent(consultationId, fromStatus, toStatus, actor, note, actorId = null) {
    events.push({ id: events.length + 1, consultation_id: consultationId, from_status: fromStatus, to_status: toStatus, actor, actor_id: actorId, note, created_at: iso() });
  }

  return {
    kind: 'memory',

    async getDoctor(slug = 'sritha') {
      return slug === doctor.slug ? clone(doctor) : null;
    },
    async getDoctorById(id) {
      return id === doctor.id ? clone(doctor) : null;
    },
    async listRules(doctorId) {
      return clone(rules.filter((rule) => rule.doctor_id === doctorId));
    },
    async listBusy(doctorId, fromIso, toIso, exceptTokenHash) {
      purgeHolds();
      const busy = [];
      for (const row of consultations.values()) {
        if (row.doctor_id === doctorId && ACTIVE.includes(row.status) && overlaps(row.starts_at, row.ends_at, fromIso, toIso)) busy.push({ starts_at: row.starts_at, ends_at: row.ends_at });
      }
      for (const [hash, hold] of holds) {
        if (hash !== exceptTokenHash && hold.doctor_id === doctorId && overlaps(hold.starts_at, hold.ends_at, fromIso, toIso)) busy.push({ starts_at: hold.starts_at, ends_at: hold.ends_at });
      }
      return busy;
    },
    async holdSlot(doctorId, startsAt, endsAt, tokenHash, ttlSeconds) {
      purgeHolds();
      holds.delete(tokenHash);
      const takenByBooking = [...consultations.values()].some((row) => row.doctor_id === doctorId && ACTIVE.includes(row.status) && overlaps(row.starts_at, row.ends_at, startsAt, endsAt));
      const takenByHold = [...holds.values()].some((hold) => hold.doctor_id === doctorId && overlaps(hold.starts_at, hold.ends_at, startsAt, endsAt));
      if (takenByBooking || takenByHold) throw new StoreConflict('slot_taken');
      const expiresAt = new Date(now() + ttlSeconds * 1000).toISOString();
      holds.set(tokenHash, { doctor_id: doctorId, starts_at: startsAt, ends_at: endsAt, expires_at: expiresAt });
      return expiresAt;
    },
    async getHold(tokenHash) {
      purgeHolds();
      return clone(holds.get(tokenHash) ?? null);
    },
    async releaseHold(tokenHash) {
      holds.delete(tokenHash);
    },
    async createRequestFromHold(tokenHash, refCode, name, phone, consentAt) {
      const hold = holds.get(tokenHash);
      if (!hold || Date.parse(hold.expires_at) <= now()) throw new StoreConflict('hold_expired');
      if ([...consultations.values()].some((row) => row.ref_code === refCode)) throw new StoreConflict('ref_taken');
      if ([...consultations.values()].some((row) => row.doctor_id === hold.doctor_id && ACTIVE.includes(row.status) && overlaps(row.starts_at, row.ends_at, hold.starts_at, hold.ends_at))) {
        throw new StoreConflict('slot_taken');
      }
      const id = randomUUID();
      consultations.set(id, {
        id, ref_code: refCode, doctor_id: hold.doctor_id, patient_name: name, patient_phone: phone,
        starts_at: hold.starts_at, ends_at: hold.ends_at, status: 'requested', consent_at: consentAt,
        reject_reason: null, meeting_provider: null, meeting_id: null, join_url: null, start_url: null, meeting_passcode: null,
        accepted_at: null, confirmation_sent_at: null, link_reminder_sent_at: null, feedback_request_sent_at: null,
        created_at: iso(), updated_at: iso(),
      });
      holds.delete(tokenHash);
      addEvent(id, null, 'requested', 'patient', 'Consultation requested');
      return id;
    },
    async getConsultation(id) {
      const row = consultations.get(id);
      if (!row) return null;
      return { ...clone(row), feedback: clone(feedback.get(id) ?? null) };
    },
    async listDashboard(sinceIso) {
      return [...consultations.values()]
        .filter((row) => row.status === 'requested' || row.ends_at >= sinceIso)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .map((row) => ({ ...clone(row), feedback: clone(feedback.get(row.id) ?? null) }));
    },
    // Changes status only if it is still `fromStatus` (two tabs cannot both accept).
    async transition(id, fromStatus, toStatus, patch, event) {
      const row = consultations.get(id);
      if (!row || row.status !== fromStatus) return null;
      if (ACTIVE.includes(toStatus) && !ACTIVE.includes(fromStatus)) {
        const clash = [...consultations.values()].some((other) => other.id !== id && other.doctor_id === row.doctor_id && ACTIVE.includes(other.status) && overlaps(other.starts_at, other.ends_at, row.starts_at, row.ends_at));
        if (clash) throw new StoreConflict('slot_taken');
      }
      Object.assign(row, patch, { status: toStatus, updated_at: iso() });
      addEvent(id, fromStatus, toStatus, event.actor, event.note, event.actorId);
      return clone(row);
    },
    async updateMeeting(id, meeting) {
      const row = consultations.get(id);
      if (!row || row.status !== 'requested') return null;
      Object.assign(row, meeting, { updated_at: iso() });
      return clone(row);
    },
    async markSent(id, field, event) {
      const row = consultations.get(id);
      if (!row) return null;
      if (!row[field]) {
        row[field] = iso();
        row.updated_at = iso();
        addEvent(id, null, null, event.actor, event.note, event.actorId);
      }
      return clone(row);
    },
    async listEvents(id) {
      return clone(events.filter((item) => item.consultation_id === id));
    },
    async addEvent(id, event) {
      addEvent(id, null, null, event.actor, event.note, event.actorId);
    },
    // Devices that get notifications (web push subscriptions).
    async savePushDevice(key, value) {
      pushDevices.set(key, clone(value));
    },
    async listPushDevices() {
      return [...pushDevices].map(([key, value]) => ({ key, ...clone(value) }));
    },
    async removePushDevice(key) {
      pushDevices.delete(key);
    },
    // True the first time a reminder stage is claimed, so each is notified once.
    async claimReminderPush(consultationId, kind, stage) {
      const key = `${consultationId}:${kind}:${stage}`;
      if (reminderPushes.has(key)) return false;
      reminderPushes.add(key);
      return true;
    },
    async getSettings() {
      return Object.fromEntries([...settings].map(([key, row]) => [key, clone(row.value)]));
    },
    async putSettings(entries, userId) {
      for (const [key, value] of Object.entries(entries)) settings.set(key, { value: clone(value), updated_by: userId, updated_at: iso() });
    },
    async saveFeedback(consultationId, rating, comment, allowPublic) {
      if (feedback.has(consultationId)) throw new StoreConflict('feedback_exists');
      feedback.set(consultationId, { rating, comment, allow_public: allowPublic, created_at: iso() });
    },
    async rateLimitHit(key, windowSeconds, limit) {
      const windowStart = Math.floor(now() / 1000 / windowSeconds);
      const mapKey = `${key}|${windowSeconds}|${windowStart}`;
      const hits = (rateLimits.get(mapKey) ?? 0) + 1;
      rateLimits.set(mapKey, hits);
      return hits <= limit;
    },
    async expireStale() {
      let count = 0;
      for (const row of consultations.values()) {
        if (row.status === 'requested' && Date.parse(row.starts_at) <= now()) {
          row.status = 'expired';
          addEvent(row.id, 'requested', 'expired', 'system', 'Not answered before the appointment time');
          count += 1;
        }
      }
      purgeHolds();
      return count;
    },
    async completePast() {
      let count = 0;
      for (const row of consultations.values()) {
        if (row.status === 'scheduled' && Date.parse(row.ends_at) <= now()) {
          row.status = 'completed';
          addEvent(row.id, 'scheduled', 'completed', 'system', 'Appointment time has passed');
          count += 1;
        }
      }
      return count;
    },
    async sweepLegacy() {
      return 0;
    },

    // ----- Calendar control -----
    async replaceRules(doctorId, nextRules) {
      for (let index = rules.length - 1; index >= 0; index -= 1) if (rules[index].doctor_id === doctorId) rules.splice(index, 1);
      for (const rule of nextRules) rules.push({ doctor_id: doctorId, ...rule });
      return nextRules.length;
    },
    async listTimeOff(doctorId, fromIso, toIso) {
      return clone(timeOff.filter((item) => item.doctor_id === doctorId && overlaps(item.starts_at, item.ends_at, fromIso, toIso)).sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
    },
    async addTimeOff(doctorId, startsAt, endsAt, reason, userId) {
      const row = { id: randomUUID(), doctor_id: doctorId, starts_at: startsAt, ends_at: endsAt, reason, created_by: userId, created_at: iso() };
      timeOff.push(row);
      return clone(row);
    },
    async removeTimeOff(id) {
      const index = timeOff.findIndex((item) => item.id === id);
      if (index >= 0) timeOff.splice(index, 1);
      return index >= 0;
    },
    async listConsultationsBetween(doctorId, fromIso, toIso) {
      return [...consultations.values()]
        .filter((row) => row.doctor_id === doctorId && overlaps(row.starts_at, row.ends_at, fromIso, toIso))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .map((row) => ({ ...clone(row), feedback: clone(feedback.get(row.id) ?? null) }));
    },
    async search(text) {
      const needle = text.toLowerCase();
      const digits = text.replace(/\D/g, '');
      return [...consultations.values()]
        .filter((row) => row.patient_name.toLowerCase().includes(needle) || row.ref_code.toLowerCase().includes(needle) || (digits.length >= 4 && row.patient_phone.includes(digits)))
        .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
        .slice(0, 50)
        .map((row) => ({ ...clone(row), feedback: clone(feedback.get(row.id) ?? null) }));
    },
    // Moves an active consultation to a new time if nothing else is there.
    async reschedule(id, startsAt, endsAt, patch, event) {
      const row = consultations.get(id);
      if (!row || !ACTIVE.includes(row.status)) return null;
      const clash = [...consultations.values()].some((other) => other.id !== id && other.doctor_id === row.doctor_id && ACTIVE.includes(other.status) && overlaps(other.starts_at, other.ends_at, startsAt, endsAt));
      if (clash) throw new StoreConflict('slot_taken');
      Object.assign(row, patch, { starts_at: startsAt, ends_at: endsAt, updated_at: iso() });
      addEvent(id, null, null, event.actor, event.note, event.actorId);
      return clone(row);
    },

    // Demo sign-in, only for the local in-memory store.
    async demoSignIn(email, password) {
      const expected = Buffer.from(demoPassword);
      const actual = Buffer.from(String(password ?? ''));
      if (String(email ?? '').trim().toLowerCase() !== demoUser.email || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
      const token = `demo.${randomBytes(24).toString('base64url')}`;
      sessions.set(token, demoUser.id);
      return token;
    },
    async getUserFromToken(token) {
      const userId = sessions.get(token);
      return userId ? { id: userId, email: demoUser.email } : null;
    },
    async getStaff(userId) {
      return userId === staff.user_id ? clone(staff) : null;
    },

    // Test helper.
    _debug: { consultations, holds, events, demoUser },
  };
}
