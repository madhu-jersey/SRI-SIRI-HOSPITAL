import { createHmac } from 'node:crypto';
import {
  DEFAULT_TEMPLATES, TEMPLATE_KEYS, formatDate, formatIndianPhone, formatTime, messageValues, normalizeIndianMobile, renderTemplate, waLink,
} from '../../shared/messages.mjs';
import { STATUS_LABELS } from '../../shared/status.mjs';
import { HttpError } from './http.mjs';
import { buildSlotDays, findSlot } from './slots.mjs';
import { StoreConflict } from './store/errors.mjs';
import { hashToken, isHoldToken, newHoldToken, newRefCode, signLink, verifyLink } from './tokens.mjs';

export const HOLD_SECONDS = 5 * 60;
const LINK_DAYS_AFTER_END = 7;
const DAY = 24 * 60 * 60 * 1000;

const CONFLICT_MESSAGES = {
  slot_taken: [409, 'Someone has just taken this time. Please pick another one.'],
  hold_expired: [410, 'Your 5-minute hold ran out. Please pick the time again.'],
  feedback_exists: [409, 'Thank you, we already have your feedback for this consultation.'],
};

function conflict(error) {
  if (error instanceof StoreConflict && CONFLICT_MESSAGES[error.code]) {
    const [status, message] = CONFLICT_MESSAGES[error.code];
    return new HttpError(status, message, { code: error.code });
  }
  return error;
}

// Everything the routes need, built once per process.
export function createService({ config, store, zoom, messaging, realtime, now = () => Date.now() }) {
  let doctorCache = null;

  async function doctor() {
    doctorCache ??= await store.getDoctor('sritha');
    if (!doctorCache) throw new Error('Doctor record is missing. Run the database migration.');
    return doctorCache;
  }

  async function settings() {
    const saved = await store.getSettings();
    const templates = { ...DEFAULT_TEMPLATES };
    for (const key of TEMPLATE_KEYS) {
      if (typeof saved.templates?.[key] === 'string' && saved.templates[key].trim()) templates[key] = saved.templates[key];
    }
    const savedNumber = normalizeIndianMobile(String(saved.hospital_whatsapp ?? ''));
    const hospitalWhatsapp = savedNumber ? savedNumber.slice(1) : config.hospitalWhatsapp;
    return { hospitalWhatsapp, hospitalWhatsappDisplay: hospitalWhatsapp ? formatIndianPhone(hospitalWhatsapp) : '', templates };
  }

  async function limit(key, windowSeconds, max) {
    if (!(await store.rateLimitHit(key, windowSeconds, max))) {
      throw new HttpError(429, 'Too many attempts. Please wait a little and try again.');
    }
  }

  // Rate-limit keys never hold a raw IP address or phone number.
  const blind = (value) => createHmac('sha256', config.appSecret || 'rate').update(String(value)).digest('base64url').slice(0, 22);

  function links(row, siteUrl) {
    const expires = Date.parse(row.ends_at) + LINK_DAYS_AFTER_END * DAY;
    return {
      tracker_url: `${siteUrl}/a/${signLink(config.appSecret, 'track', row.id, expires)}`,
      feedback_url: `${siteUrl}/f/${signLink(config.appSecret, 'feedback', row.id, expires)}`,
      booking_url: `${siteUrl}/consult`,
    };
  }

  async function prepare(kind, row, doc, siteUrl, templates, extra = {}) {
    const values = messageValues({ ...row, doctor_name: doc.display_name, ...links(row, siteUrl) }, extra);
    return messaging.prepare({ to: row.patient_phone, text: renderTemplate(templates[kind], values) });
  }

  // What the dashboard sees for one consultation. The doctor's Zoom host link
  // is never included; it is fetched fresh when the doctor taps Start.
  async function present(row, doc, siteUrl, templates) {
    const messages = {};
    if (['scheduled', 'completed', 'feedback_received'].includes(row.status) && row.join_url) {
      messages.confirmation = await prepare('confirmation', row, doc, siteUrl, templates);
      messages.link_reminder = await prepare('link_reminder', row, doc, siteUrl, templates);
      messages.feedback = await prepare('feedback', row, doc, siteUrl, templates);
    }
    if (row.status === 'rejected') {
      messages.rejection = await prepare('rejection', row, doc, siteUrl, templates, { reason: row.reject_reason ?? '' });
    }
    return {
      id: row.id,
      ref_code: row.ref_code,
      patient_name: row.patient_name,
      patient_phone: row.patient_phone,
      patient_phone_display: formatIndianPhone(row.patient_phone),
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      status: row.status,
      status_label: STATUS_LABELS[row.status],
      reject_reason: row.reject_reason,
      meeting: row.join_url ? { provider: row.meeting_provider, join_url: row.join_url, passcode: row.meeting_passcode } : null,
      accepted_at: row.accepted_at,
      confirmation_sent_at: row.confirmation_sent_at,
      link_reminder_sent_at: row.link_reminder_sent_at,
      feedback_request_sent_at: row.feedback_request_sent_at,
      created_at: row.created_at,
      tracker_url: links(row, siteUrl).tracker_url,
      feedback: row.feedback ?? null,
      messages,
    };
  }

  async function housekeeping() {
    await store.expireStale();
    await store.completePast();
  }

  const service = {
    settings,

    async publicConfig() {
      const [doc, current] = await Promise.all([doctor(), settings()]);
      return {
        hospitalWhatsapp: current.hospitalWhatsapp,
        hospitalWhatsappDisplay: current.hospitalWhatsappDisplay,
        holdMinutes: HOLD_SECONDS / 60,
        auth: store.kind === 'memory' ? 'demo' : 'supabase',
        doctor: { name: doc.display_name, qualification: doc.qualification, registration: doc.registration_no, minutes: doc.consult_minutes },
      };
    },

    async slots(holdToken) {
      const doc = await doctor();
      const from = now();
      const busy = await store.listBusy(doc.id, new Date(from).toISOString(), new Date(from + 15 * DAY).toISOString(), isHoldToken(holdToken) ? hashToken(holdToken) : undefined);
      const rules = await store.listRules(doc.id);
      return { days: buildSlotDays(rules, busy, from), generatedAt: new Date(from).toISOString() };
    },

    async hold({ start, holdToken }, ip) {
      await limit(`hold:${blind(ip)}`, 600, 40);
      if (typeof start !== 'string' || Number.isNaN(Date.parse(start))) throw new HttpError(400, 'Please pick a time.');
      const token = isHoldToken(holdToken) ? holdToken : newHoldToken();
      const doc = await doctor();
      const { days } = await service.slots(token);
      const slot = findSlot(days, new Date(start).toISOString());
      if (!slot) throw new HttpError(409, 'This time is no longer available. Please pick another one.', { code: 'slot_taken' });
      try {
        const expiresAt = await store.holdSlot(doc.id, slot.start, slot.end, hashToken(token), HOLD_SECONDS);
        return { holdToken: token, start: slot.start, end: slot.end, expiresAt };
      } catch (error) {
        throw conflict(error);
      }
    },

    async release({ holdToken }) {
      if (isHoldToken(holdToken)) await store.releaseHold(hashToken(holdToken));
      return { released: true };
    },

    async request(body, ip, siteUrl) {
      if (typeof body.website === 'string' && body.website.trim()) {
        // Hidden field that only bots fill in.
        throw new HttpError(400, 'We could not send your request. Please try again.');
      }
      const fields = {};
      const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
      if (name.length < 2 || name.length > 80 || !/^[\p{L}\p{M} .'-]+$/u.test(name)) fields.name = 'Please enter the patient’s full name (letters only).';
      const phone = normalizeIndianMobile(String(body.phone ?? ''));
      const confirmPhone = normalizeIndianMobile(String(body.confirmPhone ?? ''));
      if (!phone) fields.phone = 'Please enter a 10-digit Indian mobile number.';
      else if (phone !== confirmPhone) fields.confirmPhone = 'The two mobile numbers do not match.';
      if (body.consent !== true) fields.consent = 'Please agree so the hospital can contact you on WhatsApp.';
      if (!isHoldToken(body.holdToken)) throw new HttpError(410, CONFLICT_MESSAGES.hold_expired[1], { code: 'hold_expired' });
      if (Object.keys(fields).length) throw new HttpError(400, 'Please check the highlighted details.', fields);

      await limit(`request:${blind(ip)}`, 3600, 6);
      await limit(`request-phone:${blind(phone)}`, 86400, 3);

      const tokenHash = hashToken(body.holdToken);
      let id;
      let ref;
      for (let attempt = 0; attempt < 5 && !id; attempt += 1) {
        ref = newRefCode();
        try {
          id = await store.createRequestFromHold(tokenHash, ref, name, phone, new Date(now()).toISOString());
        } catch (error) {
          if (error instanceof StoreConflict && error.code === 'ref_taken') continue;
          throw conflict(error);
        }
      }
      if (!id) throw new Error('Could not create a unique reference.');
      const row = await store.getConsultation(id);
      const current = await settings();
      if (!current.hospitalWhatsapp) throw new Error('HOSPITAL_WHATSAPP is not set.');
      const text = renderTemplate(current.templates.request, messageValues(row));
      await realtime.ping('requested');
      return {
        ref,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        whatsappUrl: waLink(current.hospitalWhatsapp, text),
        hospitalWhatsappDisplay: current.hospitalWhatsappDisplay,
        trackerUrl: links(row, siteUrl).tracker_url,
      };
    },

    async track(token, siteUrl) {
      const id = verifyLink(config.appSecret, 'track', token, now());
      const row = id && (await store.getConsultation(id));
      if (!row) throw new HttpError(404, 'This link is not valid or has expired.');
      const [doc, current] = await Promise.all([store.getDoctorById(row.doctor_id), settings()]);
      const ended = Date.parse(row.ends_at) <= now();
      const showJoin = row.status === 'scheduled' && !ended && row.join_url;
      return {
        ref: row.ref_code,
        name: row.patient_name,
        doctor: doc?.display_name ?? 'the doctor',
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        date: formatDate(row.starts_at),
        time: formatTime(row.starts_at),
        status: row.status,
        statusLabel: STATUS_LABELS[row.status],
        rejectReason: row.status === 'rejected' ? row.reject_reason : null,
        joinUrl: showJoin ? row.join_url : null,
        passcode: showJoin ? row.meeting_passcode : null,
        feedbackUrl: ended && ['scheduled', 'completed'].includes(row.status) && !row.feedback ? links(row, siteUrl).feedback_url : null,
        hospitalWhatsapp: current.hospitalWhatsapp,
        hospitalWhatsappDisplay: current.hospitalWhatsappDisplay,
      };
    },

    async feedbackInfo(token) {
      const id = verifyLink(config.appSecret, 'feedback', token, now());
      const row = id && (await store.getConsultation(id));
      if (!row) throw new HttpError(404, 'This link is not valid or has expired.');
      const doc = await store.getDoctorById(row.doctor_id);
      const ended = Date.parse(row.ends_at) <= now();
      return {
        ref: row.ref_code,
        name: row.patient_name,
        doctor: doc?.display_name ?? 'the doctor',
        date: formatDate(row.starts_at),
        alreadySent: Boolean(row.feedback),
        open: ended && ['scheduled', 'completed'].includes(row.status) && !row.feedback,
        notYet: !ended && row.status === 'scheduled',
      };
    },

    async submitFeedback(body, ip) {
      await limit(`feedback:${blind(ip)}`, 3600, 10);
      const id = verifyLink(config.appSecret, 'feedback', body.token, now());
      const row = id && (await store.getConsultation(id));
      if (!row) throw new HttpError(404, 'This link is not valid or has expired.');
      const rating = Number(body.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'Please choose a rating from 1 to 5.', { rating: 'Please choose a rating.' });
      const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 1000) : '';
      if (Date.parse(row.ends_at) > now() || !['scheduled', 'completed'].includes(row.status)) {
        throw new HttpError(409, 'Feedback opens after the consultation.');
      }
      try {
        await store.saveFeedback(row.id, rating, comment, body.allowPublic === true);
      } catch (error) {
        throw conflict(error);
      }
      let status = row.status;
      if (status === 'scheduled') {
        await store.transition(row.id, 'scheduled', 'completed', {}, { actor: 'system', note: 'Appointment time has passed' });
        status = 'completed';
      }
      await store.transition(row.id, status, 'feedback_received', {}, { actor: 'patient', note: `Feedback: ${rating} of 5` });
      await realtime.ping('feedback');
      return { saved: true };
    },

    async cleanup() {
      const expired = await store.expireStale();
      const completed = await store.completePast();
      const legacy = await store.sweepLegacy();
      return { expired, completed, legacyDeleted: legacy };
    },

    // ----- Staff -----

    async dashboard(siteUrl) {
      await housekeeping();
      const [doc, current] = await Promise.all([doctor(), settings()]);
      const rows = await store.listDashboard(new Date(now() - 4 * DAY).toISOString());
      const consultations = [];
      for (const row of rows) consultations.push(await present(row, doc, siteUrl, current.templates));
      return {
        now: new Date(now()).toISOString(),
        doctor: { name: doc.display_name },
        zoomMode: zoom.mode,
        messagingMode: messaging.mode,
        consultations,
        settings: current,
      };
    },

    async accept({ id }, staff, siteUrl) {
      const row = typeof id === 'string' ? await store.getConsultation(id) : null;
      if (!row) throw new HttpError(404, 'Consultation not found.');
      if (row.status !== 'requested') throw new HttpError(409, `This request is already ${STATUS_LABELS[row.status].toLowerCase()}.`);
      if (Date.parse(row.starts_at) <= now()) throw new HttpError(409, 'This time has already passed.');
      const doc = await store.getDoctorById(row.doctor_id);
      let withMeeting = row;
      if (!row.join_url) {
        let meeting;
        try {
          meeting = await zoom.createMeeting({ topic: `Video consultation ${row.ref_code}`, startsAt: row.starts_at, minutes: Math.round((Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60000), zoomUser: doc?.zoom_user });
        } catch (error) {
          console.error('Zoom meeting failed', error.message);
          throw new HttpError(502, 'Zoom did not create the meeting. The request is still waiting; please try Accept again.');
        }
        withMeeting = await store.updateMeeting(row.id, { meeting_provider: meeting.provider, meeting_id: meeting.meetingId, join_url: meeting.joinUrl, meeting_passcode: meeting.passcode });
        if (!withMeeting) {
          await zoom.deleteMeeting(meeting.meetingId).catch(() => {});
          throw new HttpError(409, 'This request was answered in another window.');
        }
      }
      const updated = await store.transition(row.id, 'requested', 'scheduled', { accepted_at: new Date(now()).toISOString() }, { actor: staff.role === 'doctor' ? 'doctor' : 'staff', actorId: staff.user_id, note: 'Accepted; Zoom meeting created' });
      if (!updated) throw new HttpError(409, 'This request was answered in another window.');
      const current = await settings();
      const fresh = await store.getConsultation(row.id);
      await realtime.ping('accepted');
      const consultation = await present(fresh, doc, siteUrl, current.templates);
      return { consultation, message: consultation.messages.confirmation };
    },

    async reject({ id, reason }, staff, siteUrl) {
      const text = typeof reason === 'string' ? reason.trim().replace(/\s+/g, ' ') : '';
      if (text.length < 3 || text.length > 300) throw new HttpError(400, 'Please give a short reason (3 to 300 characters).', { reason: 'Please give a short reason.' });
      const row = typeof id === 'string' ? await store.getConsultation(id) : null;
      if (!row) throw new HttpError(404, 'Consultation not found.');
      const updated = await store.transition(row.id, 'requested', 'rejected', { reject_reason: text }, { actor: staff.role === 'doctor' ? 'doctor' : 'staff', actorId: staff.user_id, note: 'Rejected' });
      if (!updated) throw new HttpError(409, `This request is already ${STATUS_LABELS[row.status].toLowerCase()}.`);
      const [doc, current] = await Promise.all([store.getDoctorById(row.doctor_id), settings()]);
      await realtime.ping('rejected');
      const consultation = await present({ ...updated, feedback: null }, doc, siteUrl, current.templates);
      return { consultation, message: consultation.messages.rejection };
    },

    async markSent({ id, kind }, staff) {
      const fields = { confirmation: 'confirmation_sent_at', link: 'link_reminder_sent_at', feedback: 'feedback_request_sent_at' };
      const notes = { confirmation: 'Confirmation sent on WhatsApp', link: 'Zoom link sent on WhatsApp', feedback: 'Feedback request sent on WhatsApp' };
      if (!fields[kind]) throw new HttpError(400, 'Unknown message.');
      const row = typeof id === 'string' ? await store.getConsultation(id) : null;
      if (!row) throw new HttpError(404, 'Consultation not found.');
      const updated = await store.markSent(row.id, fields[kind], { actor: staff.role === 'doctor' ? 'doctor' : 'staff', actorId: staff.user_id, note: notes[kind] });
      await realtime.ping('sent');
      return { id: row.id, [fields[kind]]: updated?.[fields[kind]] ?? new Date(now()).toISOString() };
    },

    async startLink({ id }) {
      const row = typeof id === 'string' ? await store.getConsultation(id) : null;
      if (!row?.meeting_id || row.status !== 'scheduled') throw new HttpError(404, 'No meeting for this consultation.');
      try {
        return { url: await zoom.startUrl(row.meeting_id) };
      } catch (error) {
        console.error('Zoom start link failed', error.message);
        throw new HttpError(502, 'Zoom did not answer. Please try again.');
      }
    },

    async events(id) {
      if (typeof id !== 'string') throw new HttpError(400, 'Missing consultation.');
      return { events: (await store.listEvents(id)).map(({ from_status, to_status, actor, note, created_at }) => ({ from_status, to_status, actor, note, created_at })) };
    },

    async saveSettings(body, staff) {
      const entries = {};
      const fields = {};
      if (body.hospitalWhatsapp !== undefined) {
        const phone = normalizeIndianMobile(String(body.hospitalWhatsapp));
        if (!phone) fields.hospitalWhatsapp = 'Enter a 10-digit Indian WhatsApp number.';
        else entries.hospital_whatsapp = phone.slice(1);
      }
      if (body.templates !== undefined) {
        const required = { request: ['ref'], confirmation: ['zoom_link'], link_reminder: ['zoom_link'], feedback: ['feedback_link'], rejection: [] };
        const templates = {};
        for (const key of TEMPLATE_KEYS) {
          const value = body.templates?.[key];
          if (typeof value !== 'string' || !value.trim() || value.length > 1000) {
            fields[`templates.${key}`] = 'Write a message of up to 1000 characters.';
            continue;
          }
          const missing = required[key].filter((placeholder) => !value.includes(`{${placeholder}}`));
          if (missing.length) fields[`templates.${key}`] = `This message must include ${missing.map((item) => `{${item}}`).join(', ')}.`;
          templates[key] = value.replace(/\r\n/g, '\n');
        }
        entries.templates = templates;
      }
      if (Object.keys(fields).length) throw new HttpError(400, 'Please fix the highlighted settings.', fields);
      if (!Object.keys(entries).length) throw new HttpError(400, 'Nothing to save.');
      await store.putSettings(entries, staff.user_id);
      await realtime.ping('settings');
      return { settings: await settings() };
    },
  };
  return service;
}
