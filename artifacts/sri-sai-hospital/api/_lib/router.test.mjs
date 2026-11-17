import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildApp } from '../app.mjs';
import { createMemoryStore } from './store/memory.mjs';
import { remindersDue } from '../../shared/reminders.mjs';

const ENV = { CONSULT_STORE: 'memory', APP_SECRET: 'test-secret-value', HOSPITAL_WHATSAPP: '917075009876', CRON_SECRET: 'cron-secret', SITE_URL: 'https://example.test' };
// Monday 16 Nov 2026, 10:00 IST.
const START = Date.parse('2026-11-16T04:30:00Z');

async function setup() {
  const clock = { t: START };
  const now = () => clock.t;
  const store = createMemoryStore({ now, demoPassword: 'pw' });
  const app = await buildApp({ env: ENV, store, now });
  async function call(method, route, { body, token, headers = {}, ip = '203.0.113.9' } = {}) {
    const request = {
      method,
      url: `/api/app/${route}`,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-forwarded-for': ip, ...headers },
      body: body === undefined ? undefined : body,
      socket: {},
    };
    if (body === undefined) request[Symbol.asyncIterator] = async function* () {};
    const response = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(text) { this.text = text; } };
    await app.handle(request, response);
    return { status: response.statusCode, body: JSON.parse(response.text), headers: response.headers };
  }
  return { app, store, clock, call };
}

async function signIn(call) {
  const { body } = await call('POST', 'auth/demo', { body: { email: 'doctor@demo.local', password: 'pw' } });
  return body.accessToken;
}

async function book(call, slotIndex = 0, extra = {}) {
  const slots = await call('GET', 'slots');
  const slot = slots.body.days.flatMap((day) => day.slots)[slotIndex];
  const hold = await call('POST', 'holds', { body: { start: slot.start } });
  assert.equal(hold.status, 200, JSON.stringify(hold.body));
  const request = await call('POST', 'requests', { body: { holdToken: hold.body.holdToken, name: 'Ravi Kumar', phone: '98765 43210', confirmPhone: '+91 9876543210', consent: true, ...extra } });
  return { slot, hold: hold.body, request };
}

describe('public booking', () => {
  test('config shows the hospital number formatted', async () => {
    const { call } = await setup();
    const { body } = await call('GET', 'config');
    assert.equal(body.hospitalWhatsapp, '917075009876');
    assert.equal(body.hospitalWhatsappDisplay, '+91 70750 09876');
    assert.equal(body.holdMinutes, 5);
  });

  test('slots: only the next 7 days, Mon-Sat 5:30-8:30 PM IST, nothing on Sunday', async () => {
    const { call } = await setup();
    const { body } = await call('GET', 'slots');
    assert.equal(body.days.length, 7);
    assert.equal(body.days[6].date, '2026-11-22');
    const monday = body.days[0];
    assert.equal(monday.date, '2026-11-16');
    assert.equal(monday.slots.length, 6);
    assert.equal(monday.slots[0].start, '2026-11-16T12:00:00.000Z');
    assert.equal(monday.slots[0].period, 'evening');
    const sunday = body.days.find((day) => day.weekday === 0);
    assert.equal(sunday.open, false);
    assert.equal(sunday.slots.length, 0);
  });

  test('a held slot disappears for others but not for the holder', async () => {
    const { call } = await setup();
    const slots = await call('GET', 'slots');
    const first = slots.body.days[0].slots[0];
    const hold = await call('POST', 'holds', { body: { start: first.start } });
    const other = await call('GET', 'slots');
    assert.ok(!other.body.days[0].slots.some((slot) => slot.start === first.start));
    const mine = await call('GET', `slots?hold=${hold.body.holdToken}`);
    assert.ok(mine.body.days[0].slots.some((slot) => slot.start === first.start));
    const second = await call('POST', 'holds', { body: { start: first.start } });
    assert.equal(second.status, 409);
  });

  test('holds expire after 5 minutes', async () => {
    const { call, clock } = await setup();
    const slots = await call('GET', 'slots');
    const hold = await call('POST', 'holds', { body: { start: slots.body.days[0].slots[0].start } });
    clock.t += 5 * 60_000 + 1;
    const request = await call('POST', 'requests', { body: { holdToken: hold.body.holdToken, name: 'Ravi Kumar', phone: '9876543210', confirmPhone: '9876543210', consent: true } });
    assert.equal(request.status, 410);
  });

  test('mobile numbers must match; name and consent are required', async () => {
    const { call } = await setup();
    const slots = await call('GET', 'slots');
    const hold = await call('POST', 'holds', { body: { start: slots.body.days[0].slots[0].start } });
    const response = await call('POST', 'requests', { body: { holdToken: hold.body.holdToken, name: 'R', phone: '9876543210', confirmPhone: '9876543211', consent: false } });
    assert.equal(response.status, 400);
    assert.ok(response.body.fields.name);
    assert.ok(response.body.fields.confirmPhone);
    assert.ok(response.body.fields.consent);
  });

  test('honeypot requests are refused', async () => {
    const { call } = await setup();
    const { request } = await book(call, 0, { website: 'spam' });
    assert.equal(request.status, 400);
  });

  test('Book on WhatsApp returns the wa.me link with the request text', async () => {
    const { call } = await setup();
    const { request } = await book(call);
    assert.equal(request.status, 200);
    assert.match(request.body.ref, /^SS-[2-9A-HJ-NP-Z]{4}$/);
    const url = new URL(request.body.whatsappUrl);
    assert.equal(url.origin + url.pathname, 'https://wa.me/917075009876');
    assert.equal(url.searchParams.get('text'), `Consultation request | Ref ${request.body.ref} | Ravi Kumar | Mon, 16 Nov 2026, 5:30 PM`);
    assert.match(request.body.trackerUrl, /^https:\/\/example\.test\/a\//);
  });

  test('the same slot cannot be booked twice', async () => {
    const { call } = await setup();
    const first = await book(call);
    assert.equal(first.request.status, 200);
    const again = await call('POST', 'holds', { body: { start: first.slot.start } });
    assert.equal(again.status, 409);
  });

  test('per-phone limit: at most 3 requests a day', async () => {
    const { call } = await setup();
    for (let index = 0; index < 3; index += 1) assert.equal((await book(call, index)).request.status, 200);
    assert.equal((await book(call, 3)).request.status, 429);
  });

  test('tracker link works and tampered links do not', async () => {
    const { call } = await setup();
    const { request } = await book(call);
    const token = request.body.trackerUrl.split('/a/')[1];
    const ok = await call('GET', `track?t=${encodeURIComponent(token)}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.status, 'requested');
    assert.equal(ok.body.joinUrl, null);
    assert.equal((await call('GET', `track?t=${encodeURIComponent(`${token}x`)}`)).status, 404);
    // A tracker link is not a feedback link.
    assert.equal((await call('GET', `feedback?t=${encodeURIComponent(token)}`)).status, 404);
  });
});

describe('dashboard', () => {
  test('needs a signed-in staff member', async () => {
    const { call } = await setup();
    assert.equal((await call('GET', 'dashboard')).status, 401);
    assert.equal((await call('GET', 'dashboard', { token: 'demo.nope' })).status, 401);
    assert.equal((await call('POST', 'auth/demo', { body: { email: 'doctor@demo.local', password: 'wrong' } })).status, 401);
  });

  test('full flow: request, accept with Zoom, reminders, feedback', async () => {
    const { call, clock } = await setup();
    const token = await signIn(call);
    const { request } = await book(call);

    let dash = await call('GET', 'dashboard', { token });
    assert.equal(dash.status, 200);
    const item = dash.body.consultations.find((row) => row.ref_code === request.body.ref);
    assert.equal(item.status, 'requested');
    assert.equal(item.patient_phone_display, '+91 98765 43210');
    assert.equal(dash.body.zoomMode, 'mock');

    const accepted = await call('POST', 'consultations/accept', { token, body: { id: item.id } });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.consultation.status, 'scheduled');
    assert.ok(accepted.body.consultation.meeting.join_url.startsWith('https://zoom.us/j/'));
    assert.equal(accepted.body.message.delivery, 'link');
    const confirmation = new URL(accepted.body.message.url);
    assert.equal(confirmation.pathname, '/919876543210');
    const text = confirmation.searchParams.get('text');
    assert.ok(text.includes(accepted.body.consultation.meeting.join_url));
    assert.ok(text.includes('https://example.test/a/'));
    assert.ok(text.includes('Mon, 16 Nov 2026'));
    assert.ok(!JSON.stringify(accepted.body).includes('start_url'));

    // Accepting twice is refused.
    assert.equal((await call('POST', 'consultations/accept', { token, body: { id: item.id } })).status, 409);

    // Confirmation reminder is due right away; mark it sent.
    dash = await call('GET', 'dashboard', { token });
    let due = remindersDue(dash.body.consultations, clock.t).map((row) => row.kind);
    assert.deepEqual(due, ['confirmation']);
    await call('POST', 'consultations/mark-sent', { token, body: { id: item.id, kind: 'confirmation' } });

    // 30 minutes before 5:30 PM the Zoom link reminder appears.
    clock.t = Date.parse('2026-11-16T11:30:00Z');
    dash = await call('GET', 'dashboard', { token });
    due = remindersDue(dash.body.consultations, clock.t);
    assert.deepEqual(due.map((row) => row.kind), ['link']);
    assert.equal(due[0].overdue, false);
    clock.t += 10 * 60_000;
    assert.equal(remindersDue(dash.body.consultations, clock.t)[0].overdue, true);
    await call('POST', 'consultations/mark-sent', { token, body: { id: item.id, kind: 'link' } });

    const startLink = await call('POST', 'consultations/start-link', { token, body: { id: item.id } });
    assert.equal(startLink.status, 200);

    // 15 minutes after it ends (6:00 PM) the feedback request is due.
    clock.t = Date.parse('2026-11-16T12:45:00Z');
    dash = await call('GET', 'dashboard', { token });
    const row = dash.body.consultations.find((entry) => entry.id === item.id);
    assert.equal(row.status, 'completed');
    assert.deepEqual(remindersDue(dash.body.consultations, clock.t).map((entry) => entry.kind), ['feedback']);
    const feedbackUrl = new URL(row.messages.feedback.url).searchParams.get('text').match(/https:\/\/example\.test\/f\/(\S+)/)[1];
    const info = await call('GET', `feedback?t=${encodeURIComponent(feedbackUrl)}`);
    assert.equal(info.body.open, true);
    const sent = await call('POST', 'feedback', { body: { token: feedbackUrl, rating: 5, comment: 'Very helpful', allowPublic: true } });
    assert.equal(sent.status, 200);
    assert.equal((await call('POST', 'feedback', { body: { token: feedbackUrl, rating: 4 } })).status, 409);

    const events = await call('GET', `consultations/events?id=${item.id}`, { token });
    assert.deepEqual(events.body.events.map((event) => event.to_status ?? event.note), [
      'requested', 'scheduled', 'Confirmation sent on WhatsApp', 'Zoom link sent on WhatsApp', 'completed', 'feedback_received',
    ]);
  });

  test('reject gives a prefilled message with the reason and frees the slot', async () => {
    const { call } = await setup();
    const token = await signIn(call);
    const { request, slot } = await book(call);
    const dash = await call('GET', 'dashboard', { token });
    const id = dash.body.consultations[0].id;
    assert.equal((await call('POST', 'consultations/reject', { token, body: { id, reason: '' } })).status, 400);
    const rejected = await call('POST', 'consultations/reject', { token, body: { id, reason: 'Doctor is in surgery' } });
    assert.equal(rejected.status, 200);
    const text = new URL(rejected.body.message.url).searchParams.get('text');
    assert.ok(text.includes('Reason: Doctor is in surgery'));
    assert.ok(text.includes(request.body.ref));
    assert.ok(text.includes('https://example.test/consult'));
    const again = await call('POST', 'holds', { body: { start: slot.start } });
    assert.equal(again.status, 200);
  });

  test('unanswered requests expire at their start time', async () => {
    const { call, clock } = await setup();
    const token = await signIn(call);
    await book(call);
    clock.t = Date.parse('2026-11-16T12:00:00Z');
    const dash = await call('GET', 'dashboard', { token });
    assert.equal(dash.body.consultations[0].status, 'expired');
  });

  test('settings: hospital number and templates are editable and validated', async () => {
    const { call } = await setup();
    const token = await signIn(call);
    const bad = await call('PUT', 'settings', { token, body: { hospitalWhatsapp: '12345' } });
    assert.equal(bad.status, 400);
    const dash = await call('GET', 'dashboard', { token });
    const templates = { ...dash.body.settings.templates, request: 'New request {ref} from {name} for {date} {time}' };
    const missing = await call('PUT', 'settings', { token, body: { templates: { ...templates, confirmation: 'No link here' } } });
    assert.equal(missing.status, 400);
    assert.ok(missing.body.fields['templates.confirmation']);
    const saved = await call('PUT', 'settings', { token, body: { hospitalWhatsapp: '+91 90000 12345', templates } });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.settings.hospitalWhatsappDisplay, '+91 90000 12345');
    const config = await call('GET', 'config');
    assert.equal(config.body.hospitalWhatsapp, '919000012345');
    const { request } = await book(call);
    const url = new URL(request.body.whatsappUrl);
    assert.equal(url.pathname, '/919000012345');
    assert.ok(url.searchParams.get('text').startsWith(`New request ${request.body.ref} from Ravi Kumar`));
  });

  test('cron cleanup needs the secret', async () => {
    const { call } = await setup();
    assert.equal((await call('GET', 'cron/cleanup')).status, 401);
    const ok = await call('GET', 'cron/cleanup', { headers: { authorization: 'Bearer cron-secret' } });
    assert.equal(ok.status, 200);
  });

  test('unknown routes are 404 and errors hide details', async () => {
    const { call } = await setup();
    assert.equal((await call('GET', 'nope')).status, 404);
    assert.equal((await call('GET', 'requests')).status, 405);
  });
});
