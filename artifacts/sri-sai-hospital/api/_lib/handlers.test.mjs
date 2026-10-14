import test from 'node:test';
import assert from 'node:assert/strict';
import { slotsForDate } from './appointments.mjs';
import { createAvailabilityHandler, createBookingHandler, createCleanupHandler } from './handlers.mjs';
import { InMemoryRateLimiter } from './rate-limit.mjs';

const now = new Date('2026-10-14T10:00:00.000Z');
const date = '2026-10-14';
const testEmail = ['patient', 'example.test'].join(String.fromCharCode(64));

function createDatabase() {
  const appointments = [];
  let nextId = 1;
  const client = {
    from(table) {
      assert.equal(table, 'appointments');
      const query = {
        operation: '',
        conditions: [],
        delete() {
          this.operation = 'delete';
          return this;
        },
        insert(row) {
          this.operation = 'insert';
          this.row = row;
          return this;
        },
        select() {
          if (!this.operation) this.operation = 'select';
          return this;
        },
        single() {
          const duplicate = appointments.some((item) => item.slot_start === this.row.slot_start);
          if (duplicate) return Promise.resolve({ data: null, error: { code: '23505' } });
          const inserted = { id: nextId++, ...this.row };
          appointments.push(inserted);
          return Promise.resolve({ data: { id: inserted.id }, error: null });
        },
        gte(column, value) {
          this.conditions.push((row) => row[column] >= value);
          return this;
        },
        gt(column, value) {
          this.conditions.push((row) => row[column] > value);
          return this;
        },
        lt(column, value) {
          this.conditions.push((row) => row[column] < value);
          return this;
        },
        eq(column, value) {
          this.conditions.push((row) => row[column] === value);
          return this;
        },
        then(resolve, reject) {
          if (this.operation === 'delete') {
            const removed = appointments.filter((row) => this.conditions.every((condition) => condition(row)));
            for (const row of removed) appointments.splice(appointments.indexOf(row), 1);
            return Promise.resolve({ error: null, count: removed.length }).then(resolve, reject);
          }
          const data = appointments.filter((row) => this.conditions.every((condition) => condition(row)));
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { client, appointments };
}

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function bookingBody(slotIndex = 0, overrides = {}) {
  return {
    patientName: 'Test Patient',
    email: testEmail,
    phone: '9876543210',
    date,
    slotStart: slotsForDate(date)[slotIndex].start,
    reason: '',
    consent: true,
    ...overrides,
  };
}

function bookingRequest(body, ip = '192.0.2.10') {
  return { method: 'POST', body, headers: { 'x-forwarded-for': ip } };
}

test('a valid booking persists with +91 phone and sends both confirmation emails', async () => {
  const { client, appointments } = createDatabase();
  let emailCalls = 0;
  const handler = createBookingHandler({
    createClient: () => client,
    sendEmails: async () => { emailCalls += 1; },
    now: () => now,
  });
  const response = responseRecorder();

  await handler(bookingRequest(bookingBody()), response);

  assert.equal(response.statusCode, 201);
  assert.equal(appointments.length, 1);
  assert.equal(appointments[0].phone, '+919876543210');
  assert.equal(appointments[0].expires_at, appointments[0].slot_end);
  assert.equal(emailCalls, 1);
});

test('availability omits booked and expired slots and provides ISO times', async () => {
  const { client, appointments } = createDatabase();
  const [bookedSlot] = slotsForDate(date);
  appointments.push({
    id: 1,
    slot_start: bookedSlot.start,
    slot_end: bookedSlot.end,
    expires_at: bookedSlot.end,
  });
  appointments.push({
    id: 2,
    slot_start: '2026-10-14T08:00:00.000Z',
    slot_end: '2026-10-14T08:30:00.000Z',
    expires_at: '2026-10-14T08:30:00.000Z',
  });
  const handler = createAvailabilityHandler({ createClient: () => client, now: () => now });
  const response = responseRecorder();

  await handler({ method: 'GET', query: { date } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.slots.length, 5);
  assert.ok(response.body.slots.every((slot) => Number.isFinite(Date.parse(slot.start)) && Number.isFinite(Date.parse(slot.end))));
  assert.ok(response.body.slots.every((slot) => slot.start !== bookedSlot.start && Date.parse(slot.start) > now.getTime()));
  assert.equal(appointments.length, 1);
});

test('the same slot cannot be booked twice', async () => {
  const { client, appointments } = createDatabase();
  const handler = createBookingHandler({ createClient: () => client, sendEmails: async () => {}, now: () => now });
  await handler(bookingRequest(bookingBody()), responseRecorder());
  const response = responseRecorder();

  await handler(bookingRequest(bookingBody(0), '192.0.2.11'), response);

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.message, 'This slot was just booked. Please choose another time.');
  assert.equal(appointments.length, 1);
});

test('past appointments and invalid mobile numbers are rejected', async () => {
  const { client } = createDatabase();
  const handler = createBookingHandler({ createClient: () => client, sendEmails: async () => {}, now: () => now });
  const pastResponse = responseRecorder();
  await handler(bookingRequest(bookingBody(0, { date: '2026-10-13', slotStart: slotsForDate('2026-10-13')[0].start })), pastResponse);
  const phoneResponse = responseRecorder();
  await handler(bookingRequest(bookingBody(0, { phone: '12345' })), phoneResponse);

  assert.equal(pastResponse.statusCode, 400);
  assert.ok(pastResponse.body.errors.date);
  assert.equal(phoneResponse.statusCode, 400);
  assert.ok(phoneResponse.body.errors.phone);
});

test('a time slot that has already started today is rejected', async () => {
  const { client } = createDatabase();
  const handler = createBookingHandler({
    createClient: () => client,
    sendEmails: async () => {},
    now: () => new Date('2026-10-14T14:00:00.000Z'),
  });
  const response = responseRecorder();

  await handler(bookingRequest(bookingBody()), response);

  assert.equal(response.statusCode, 400);
  assert.ok(response.body.errors.slotStart);
});

test('a filled honeypot is rejected without an error response', async () => {
  const { client, appointments } = createDatabase();
  const handler = createBookingHandler({ createClient: () => client, sendEmails: async () => {}, now: () => now });
  const response = responseRecorder();

  await handler(bookingRequest(bookingBody(0, { website: 'spam' })), response);

  assert.equal(response.statusCode, 204);
  assert.equal(response.body, undefined);
  assert.equal(appointments.length, 0);
});

test('more than three bookings per IP in an hour are blocked', async () => {
  const { client, appointments } = createDatabase();
  const handler = createBookingHandler({
    createClient: () => client,
    sendEmails: async () => {},
    now: () => now,
    rateLimiter: new InMemoryRateLimiter(),
  });
  for (let index = 0; index < 3; index += 1) {
    await handler(bookingRequest(bookingBody(index), '192.0.2.12'), responseRecorder());
  }
  const response = responseRecorder();

  await handler(bookingRequest(bookingBody(3), '192.0.2.12'), response);

  assert.equal(response.statusCode, 429);
  assert.equal(appointments.length, 3);
});

test('expired appointments are removed by the authorized cleanup endpoint', async () => {
  const { client, appointments } = createDatabase();
  appointments.push({ id: 9, expires_at: '2026-10-14T09:00:00.000Z' });
  const handler = createCleanupHandler({
    createClient: () => client,
    now: () => now,
    getSecret: () => 'test-secret',
  });
  const response = responseRecorder();

  await handler({ method: 'GET', headers: { authorization: 'Bearer test-secret' } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(appointments.length, 0);
});

test('an email failure rolls back the inserted appointment', async () => {
  const { client, appointments } = createDatabase();
  const handler = createBookingHandler({
    createClient: () => client,
    sendEmails: async () => { throw new Error('SMTP failure'); },
    now: () => now,
  });
  const response = responseRecorder();

  await handler(bookingRequest(bookingBody()), response);

  assert.equal(response.statusCode, 502);
  assert.equal(appointments.length, 0);
});

test('cleanup without the exact secret returns 401', async () => {
  const { client } = createDatabase();
  const handler = createCleanupHandler({
    createClient: () => client,
    now: () => now,
    getSecret: () => 'test-secret',
  });
  const response = responseRecorder();

  await handler({ method: 'GET', headers: { authorization: 'Bearer wrong' } }, response);

  assert.equal(response.statusCode, 401);
});
