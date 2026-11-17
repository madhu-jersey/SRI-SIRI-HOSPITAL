import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../app.mjs';
import { createMemoryStore } from './store/memory.mjs';

const ENV = { CONSULT_STORE: 'memory', APP_SECRET: 'test-secret-value', HOSPITAL_WHATSAPP: '917075009876', CRON_SECRET: 'cron', SITE_URL: 'https://example.test' };
// Monday 16 Nov 2026, 10:00 IST.
const START = Date.parse('2026-11-16T04:30:00Z');

async function setup() {
  const clock = { t: START };
  const now = () => clock.t;
  const store = createMemoryStore({ now, demoPassword: 'pw' });
  const app = await buildApp({ env: ENV, store, now });
  let ip = 0;
  async function call(method, route, { body, token } = {}) {
    const request = { method, url: `/api/app/${route}`, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-forwarded-for': `198.51.100.${(ip += 1)}` }, body, socket: {} };
    if (body === undefined) request[Symbol.asyncIterator] = async function* () {};
    const response = { statusCode: 0, setHeader() {}, end(text) { this.text = text; } };
    await app.handle(request, response);
    return { status: response.statusCode, body: JSON.parse(response.text) };
  }
  const { body: { accessToken: token } } = await call('POST', 'auth/demo', { body: { email: 'doctor@demo.local', password: 'pw' } });
  async function book(start, name = 'Ravi Kumar', phone = '9876543210') {
    const hold = await call('POST', 'holds', { body: { start } });
    return call('POST', 'requests', { body: { holdToken: hold.body.holdToken, name, phone, confirmPhone: phone, consent: true } });
  }
  return { call, token, book, clock };
}

test('calendar shows booked, free and blocked slots and needs sign-in', async () => {
  const { call, token, book } = await setup();
  assert.equal((await call('GET', 'calendar?from=2026-11-16&days=7')).status, 401);
  await book('2026-11-16T12:00:00.000Z');
  await call('POST', 'time-off', { token, body: { start: '2026-11-16T13:00:00Z', end: '2026-11-16T14:00:00Z', reason: 'Ward round' } });
  const { status, body } = await call('GET', 'calendar?from=2026-11-16&days=7', { token });
  assert.equal(status, 200);
  assert.equal(body.days.length, 7);
  assert.deepEqual(body.days[0].slots.map((slot) => slot.state), ['booked', 'free', 'blocked', 'blocked', 'free', 'free']);
  assert.equal(body.timeOff[0].reason, 'Ward round');
  assert.equal(body.days.find((day) => day.weekday === 0).open, false);
});

test('time off removes those times from the patient booking page', async () => {
  const { call, token } = await setup();
  const added = await call('POST', 'time-off', { token, body: { start: '2026-11-17T00:00:00+05:30', end: '2026-11-18T00:00:00+05:30', reason: 'Leave' } });
  assert.equal(added.status, 200);
  const slots = await call('GET', 'slots');
  assert.equal(slots.body.days.find((day) => day.date === '2026-11-17').slots.length, 0);
  assert.equal((await call('POST', 'holds', { body: { start: '2026-11-17T12:00:00.000Z' } })).status, 409);
  await call('POST', 'time-off/remove', { token, body: { id: added.body.timeOff.id } });
  const after = await call('GET', 'slots');
  assert.equal(after.body.days.find((day) => day.date === '2026-11-17').slots.length, 6);
});

test('time off over an existing booking reports it instead of moving it', async () => {
  const { call, token, book } = await setup();
  await book('2026-11-17T12:30:00.000Z', 'Lakshmi Devi', '9123456780');
  const added = await call('POST', 'time-off', { token, body: { start: '2026-11-17T00:00:00+05:30', end: '2026-11-18T00:00:00+05:30', reason: 'Leave' } });
  assert.equal(added.body.affected.length, 1);
  assert.equal(added.body.affected[0].patient_name, 'Lakshmi Devi');
});

test('clinic hours can be changed and are validated', async () => {
  const { call, token } = await setup();
  assert.equal((await call('PUT', 'hours', { token, body: { rules: [{ weekday: 1, start_minute: 600, end_minute: 610, slot_minutes: 30 }] } })).status, 400);
  assert.equal((await call('PUT', 'hours', { token, body: { rules: [{ weekday: 1, start_minute: 600, end_minute: 720, slot_minutes: 30 }, { weekday: 1, start_minute: 700, end_minute: 760, slot_minutes: 30 }] } })).status, 400);
  const saved = await call('PUT', 'hours', { token, body: { rules: [{ weekday: 2, start_minute: 600, end_minute: 720, slot_minutes: 20 }] } });
  assert.equal(saved.status, 200);
  const slots = await call('GET', 'slots');
  const tuesday = slots.body.days.find((day) => day.date === '2026-11-17');
  assert.equal(tuesday.slots.length, 6);
  assert.equal(tuesday.slots[0].start, '2026-11-17T04:30:00.000Z');
  assert.equal(slots.body.days.find((day) => day.date === '2026-11-16').open, false);
});

test('reschedule moves the booking, makes a new Zoom meeting and prefills a message', async () => {
  const { call, token, book } = await setup();
  await book('2026-11-16T12:00:00.000Z');
  const dash = await call('GET', 'dashboard', { token });
  const id = dash.body.consultations[0].id;
  const accepted = await call('POST', 'consultations/accept', { token, body: { id } });
  await call('POST', 'consultations/mark-sent', { token, body: { id, kind: 'confirmation' } });
  const oldLink = accepted.body.consultation.meeting.join_url;
  assert.equal((await call('POST', 'consultations/reschedule', { token, body: { id, start: '2026-11-16T12:00:00.000Z' } })).status, 409);
  const moved = await call('POST', 'consultations/reschedule', { token, body: { id, start: '2026-11-18T13:00:00.000Z', reason: 'Doctor called for an emergency' } });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.equal(moved.body.consultation.starts_at, '2026-11-18T13:00:00.000Z');
  assert.notEqual(moved.body.consultation.meeting.join_url, oldLink);
  assert.equal(moved.body.consultation.confirmation_sent_at, null);
  const text = new URL(moved.body.message.url).searchParams.get('text');
  assert.ok(text.includes('moved to Wed, 18 Nov 2026 at 6:30 PM'));
  assert.ok(text.includes('Reason: Doctor called for an emergency'));
  assert.ok(text.includes(moved.body.consultation.meeting.join_url));
  // The old time is free again.
  assert.equal((await call('POST', 'holds', { body: { start: '2026-11-16T12:00:00.000Z' } })).status, 200);
});

test('cancel needs a reason, frees the time and prefills a message', async () => {
  const { call, token, book } = await setup();
  await book('2026-11-16T12:30:00.000Z');
  const id = (await call('GET', 'dashboard', { token })).body.consultations[0].id;
  assert.equal((await call('POST', 'consultations/cancel', { token, body: { id, reason: '' } })).status, 400);
  const cancelled = await call('POST', 'consultations/cancel', { token, body: { id, reason: 'The doctor is on leave.' } });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.consultation.status, 'cancelled');
  assert.ok(new URL(cancelled.body.message.url).searchParams.get('text').includes('has been cancelled'));
  assert.equal((await call('POST', 'consultations/cancel', { token, body: { id, reason: 'Again' } })).status, 409);
  assert.equal((await call('POST', 'holds', { body: { start: '2026-11-16T12:30:00.000Z' } })).status, 200);
});

test('staff booking for a phone request is confirmed with a Zoom meeting', async () => {
  const { call, token } = await setup();
  const bad = await call('POST', 'consultations/book', { token, body: { name: 'X', phone: '123', start: '2026-11-16T13:00:00.000Z' } });
  assert.equal(bad.status, 400);
  const booked = await call('POST', 'consultations/book', { token, body: { name: 'Padma Sri', phone: '93900 12345', start: '2026-11-16T13:00:00.000Z' } });
  assert.equal(booked.status, 200, JSON.stringify(booked.body));
  assert.equal(booked.body.consultation.status, 'scheduled');
  assert.ok(booked.body.consultation.meeting.join_url);
  assert.equal(new URL(booked.body.message.url).pathname, '/919390012345');
});

test('search finds patients by name, number or reference', async () => {
  const { call, token, book } = await setup();
  const first = await book('2026-11-16T12:00:00.000Z', 'Anitha Reddy', '9848012345');
  await book('2026-11-16T12:30:00.000Z', 'Venkata Rao', '9701234567');
  assert.equal((await call('GET', 'consultations/search?q=a', { token })).status, 400);
  assert.deepEqual((await call('GET', 'consultations/search?q=anitha', { token })).body.results.map((row) => row.patient_name), ['Anitha Reddy']);
  assert.deepEqual((await call('GET', 'consultations/search?q=97012', { token })).body.results.map((row) => row.patient_name), ['Venkata Rao']);
  assert.equal((await call('GET', `consultations/search?q=${first.body.ref}`, { token })).body.results.length, 1);
});

test('patients can book only the next 7 days', async () => {
  const { call } = await setup();
  const { body } = await call('GET', 'slots');
  assert.equal(body.days.length, 7);
  assert.equal(body.days.at(-1).date, '2026-11-22');
  // Monday 23 Nov is the 8th day: not offered and cannot be held.
  assert.equal((await call('POST', 'holds', { body: { start: '2026-11-23T12:00:00.000Z' } })).status, 409);
  assert.equal((await call('GET', 'config')).body.bookingDays, 7);
});

test('the doctor can stop and allow bookings for one date', async () => {
  const { call, token, book } = await setup();
  await book('2026-11-18T12:00:00.000Z', 'Lakshmi Devi', '9123456780');
  const stopped = await call('POST', 'days/set', { token, body: { date: '2026-11-18', open: false } });
  assert.equal(stopped.status, 200);
  assert.deepEqual(stopped.body.affected.map((row) => row.patient_name), ['Lakshmi Devi']);
  let slots = await call('GET', 'slots');
  assert.equal(slots.body.days.find((day) => day.date === '2026-11-18').slots.length, 0);
  // Stopping twice does not add a second block.
  await call('POST', 'days/set', { token, body: { date: '2026-11-18', open: false } });
  let calendar = await call('GET', 'calendar?from=2026-11-16&days=7', { token });
  assert.equal(calendar.body.timeOff.length, 1);
  assert.equal(calendar.body.lastBookable, '2026-11-22');
  await call('POST', 'days/set', { token, body: { date: '2026-11-18', open: true } });
  slots = await call('GET', 'slots');
  assert.equal(slots.body.days.find((day) => day.date === '2026-11-18').slots.length, 5);
  calendar = await call('GET', 'calendar?from=2026-11-16&days=7', { token });
  assert.equal(calendar.body.timeOff.length, 0);
  assert.equal((await call('POST', 'days/set', { token, body: { date: '2026-11-10', open: false } })).status, 400);
});

test('allowing one date keeps the rest of a longer time off', async () => {
  const { call, token } = await setup();
  await call('POST', 'time-off', { token, body: { start: '2026-11-17T00:00:00+05:30', end: '2026-11-20T00:00:00+05:30', reason: 'Leave' } });
  await call('POST', 'days/set', { token, body: { date: '2026-11-18', open: true } });
  const slots = await call('GET', 'slots');
  const free = (date) => slots.body.days.find((day) => day.date === date).slots.length;
  assert.deepEqual([free('2026-11-17'), free('2026-11-18'), free('2026-11-19')], [0, 6, 0]);
  const calendar = await call('GET', 'calendar?from=2026-11-16&days=7', { token });
  assert.deepEqual(calendar.body.timeOff.map((item) => item.reason), ['Leave', 'Leave']);
});
