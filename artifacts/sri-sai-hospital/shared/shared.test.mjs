import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ACTIVE_STATUSES, allowedFrom, canTransition, STATUSES, TRANSITIONS } from './status.mjs';
import {
  DEFAULT_TEMPLATES, formatDate, formatIndianPhone, formatTime, messageValues, normalizeIndianMobile, renderTemplate, waLink,
} from './messages.mjs';
import { remindersDue } from './reminders.mjs';

test('status rules: every status listed, happy path allowed, shortcuts refused', () => {
  assert.deepEqual(Object.keys(TRANSITIONS).sort(), [...STATUSES].sort());
  assert.ok(canTransition('requested', 'scheduled'));
  assert.ok(canTransition('scheduled', 'completed'));
  assert.ok(canTransition('completed', 'feedback_received'));
  assert.equal(canTransition('requested', 'completed'), false);
  assert.equal(canTransition('rejected', 'scheduled'), false);
  assert.deepEqual(allowedFrom('cancelled').sort(), ['requested', 'scheduled']);
});

test('ACTIVE_STATUSES matches the overlap constraint in the migration', () => {
  const sql = readFileSync(
    fileURLToPath(new URL('../../../supabase/migrations/20261116000100_whatsapp_consultations.sql', import.meta.url)),
    'utf8',
  );
  const clause = sql.match(/consultations_no_overlap[\s\S]*?where \(status in \(([^)]*)\)\)/);
  assert.ok(clause);
  assert.deepEqual(clause[1].split(',').map((value) => value.trim().replace(/'/g, '')).sort(), [...ACTIVE_STATUSES].sort());
});

test('Indian mobile numbers are normalised and formatted', () => {
  for (const input of ['7075009876', '70750 09876', '+91 70750 09876', '917075009876', '07075009876']) {
    assert.equal(normalizeIndianMobile(input), '+917075009876', input);
  }
  for (const input of ['12345', '5075009876', '+44 7075009876', '', null]) {
    assert.equal(normalizeIndianMobile(input), null, String(input));
  }
  assert.equal(formatIndianPhone('917075009876'), '+91 70750 09876');
});

test('wa.me links use digits only and encode the text', () => {
  assert.equal(waLink('917075009876', 'Hi | Ref SS-AB12'), 'https://wa.me/917075009876?text=Hi%20%7C%20Ref%20SS-AB12');
  assert.throws(() => waLink('123', 'x'), /valid Indian mobile/);
});

test('times show in India time whatever the server clock says', () => {
  // 12:00 UTC is 5:30 PM in India.
  assert.equal(formatTime('2026-11-20T12:00:00.000Z'), '5:30 PM');
  assert.match(formatDate('2026-11-20T12:00:00.000Z'), /20 Nov 2026/);
});

test('the default request message matches the agreed format', () => {
  const values = messageValues({ ref_code: 'SS-7K4Q', patient_name: 'Asha', starts_at: '2026-11-20T12:00:00.000Z' });
  assert.equal(renderTemplate(DEFAULT_TEMPLATES.request, values), `Consultation request | Ref SS-7K4Q | Asha | ${values.date}, 5:30 PM`);
});

test('templates fill known placeholders and leave unknown ones alone', () => {
  assert.equal(renderTemplate('Hi {name}, {unknown}', { name: 'Asha' }), 'Hi Asha, {unknown}');
});

const MINUTE = 60_000;
function consultation(overrides = {}) {
  return {
    id: 'c1', status: 'scheduled', starts_at: '2026-11-20T12:00:00.000Z', ends_at: '2026-11-20T12:30:00.000Z',
    accepted_at: '2026-11-19T10:00:00.000Z', confirmation_sent_at: '2026-11-19T10:01:00.000Z',
    link_reminder_sent_at: null, feedback_request_sent_at: null, ...overrides,
  };
}
const at = (iso, minutes = 0) => Date.parse(iso) + minutes * MINUTE;

test('the Zoom link reminder is due 30 minutes before, and turns overdue 10 minutes later', () => {
  assert.deepEqual(remindersDue([consultation()], at('2026-11-20T12:00:00.000Z', -31)), []);
  const due = remindersDue([consultation()], at('2026-11-20T12:00:00.000Z', -30));
  assert.equal(due.length, 1);
  assert.equal(due[0].kind, 'link');
  assert.equal(due[0].overdue, false);
  assert.equal(remindersDue([consultation()], at('2026-11-20T12:00:00.000Z', -20))[0].overdue, true);
  assert.deepEqual(remindersDue([consultation({ link_reminder_sent_at: '2026-11-20T11:31:00.000Z' })], at('2026-11-20T12:00:00.000Z', -20)), []);
});

test('the feedback reminder is due 15 minutes after the end', () => {
  assert.deepEqual(remindersDue([consultation({ link_reminder_sent_at: 'x' })], at('2026-11-20T12:30:00.000Z', 14)), []);
  const due = remindersDue([consultation({ link_reminder_sent_at: 'x' })], at('2026-11-20T12:30:00.000Z', 15));
  assert.deepEqual(due.map((item) => item.kind), ['feedback']);
});

test('an unsent confirmation shows straight after accepting', () => {
  const due = remindersDue([consultation({ confirmation_sent_at: null })], at('2026-11-19T10:00:00.000Z', 1));
  assert.deepEqual(due.map((item) => item.kind), ['confirmation']);
});

test('accepted less than 30 minutes before: confirmation and link are both due at once', () => {
  const late = consultation({ accepted_at: '2026-11-20T11:50:00.000Z', confirmation_sent_at: null });
  const due = remindersDue([late], at('2026-11-20T11:50:00.000Z'));
  assert.deepEqual(due.map((item) => item.kind).sort(), ['confirmation', 'link']);
});

test('requests, rejections and expired consultations never create reminders', () => {
  for (const status of ['requested', 'rejected', 'expired', 'cancelled']) {
    assert.deepEqual(remindersDue([consultation({ status, confirmation_sent_at: null })], at('2026-11-20T12:00:00.000Z', 20)), [], status);
  }
});
