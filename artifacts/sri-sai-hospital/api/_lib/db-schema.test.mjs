// Runs the real migration against an in-process Postgres (PGlite) and checks
// the guarantees the app relies on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

// Every migration, in order, as Supabase runs them.
const migrationsDir = fileURLToPath(new URL('../../../../supabase/migrations/', import.meta.url));
const migration = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  .map((name) => readFileSync(migrationsDir + name, 'utf8')).join('\n');

async function freshDatabase(before = '') {
  const db = new PGlite({ extensions: { btree_gist } });
  // Supabase provides auth.users; PGlite needs a stand-in.
  await db.exec(`create schema auth; create table auth.users (id uuid primary key default gen_random_uuid()); ${before}`);
  await db.exec(migration);
  const { rows: [doctor] } = await db.query(`select id from doctors where slug = 'sritha'`);
  return { db, doctorId: doctor.id };
}

let refCounter = 0;
function insertConsultation(db, doctorId, starts, ends, status = 'requested') {
  refCounter += 1;
  return db.query(
    `insert into consultations (ref_code, doctor_id, patient_name, patient_phone, starts_at, ends_at, status, consent_at)
     values ($1, $2, 'Asha', '+919876543210', $3, $4, $5, now()) returning id`,
    [`SS-T${refCounter}`, doctorId, starts, ends, status],
  );
}

test('seed data matches the old booking hours', async () => {
  const { db } = await freshDatabase();
  const { rows } = await db.query(`select weekday, start_minute, end_minute, slot_minutes from availability_rules order by weekday`);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[0], { weekday: 1, start_minute: 1050, end_minute: 1230, slot_minutes: 30 });
});

test('the database refuses two overlapping active consultations', async () => {
  const { db, doctorId } = await freshDatabase();
  await insertConsultation(db, doctorId, '2026-11-20T12:00:00Z', '2026-11-20T12:30:00Z');
  await assert.rejects(
    insertConsultation(db, doctorId, '2026-11-20T12:15:00Z', '2026-11-20T12:45:00Z', 'scheduled'),
    /consultations_no_overlap/,
  );
});

test('back-to-back slots are fine, and rejected or expired ones free the slot', async () => {
  const { db, doctorId } = await freshDatabase();
  await insertConsultation(db, doctorId, '2026-11-20T12:00:00Z', '2026-11-20T12:30:00Z', 'rejected');
  await insertConsultation(db, doctorId, '2026-11-20T12:00:00Z', '2026-11-20T12:30:00Z', 'expired');
  await insertConsultation(db, doctorId, '2026-11-20T12:00:00Z', '2026-11-20T12:30:00Z');
  await insertConsultation(db, doctorId, '2026-11-20T12:30:00Z', '2026-11-20T13:00:00Z');
});

test('two people holding the same slot at once: exactly one wins', async () => {
  const { db, doctorId } = await freshDatabase();
  const hold = (token) => db.query(
    `select hold_slot($1, '2026-11-20T12:00:00Z', '2026-11-20T12:30:00Z', $2, 300)`,
    [doctorId, token],
  );
  const results = await Promise.allSettled([hold('a'), hold('b')]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.match(String(results.find((result) => result.status === 'rejected').reason), /slot_taken/);
});

test('a hold becomes a request once, with a timeline entry', async () => {
  const { db, doctorId } = await freshDatabase();
  await db.query(`select hold_slot($1, '2026-11-20T12:00:00Z', '2026-11-20T12:30:00Z', 'tok', 300)`, [doctorId]);
  const create = (ref) => db.query(
    `select create_request_from_hold('tok', $1, 'Asha', '+919876543210', now()) as id`,
    [ref],
  );
  const { rows: [{ id }] } = await create('SS-AB12');
  const { rows: events } = await db.query(`select to_status, actor from consultation_events where consultation_id = $1`, [id]);
  assert.deepEqual(events, [{ to_status: 'requested', actor: 'patient' }]);
  await assert.rejects(create('SS-AB13'), /hold_expired/);
});

test('an expired hold frees the slot and cannot become a request', async () => {
  const { db, doctorId } = await freshDatabase();
  await db.query(
    `insert into slot_holds (doctor_id, starts_at, ends_at, hold_token_hash, expires_at)
     values ($1, '2026-11-20T12:00:00Z', '2026-11-20T12:30:00Z', 'old', now() - interval '1 second')`,
    [doctorId],
  );
  await assert.rejects(db.query(`select create_request_from_hold('old', 'SS-OLD1', 'Asha', '+919876543210', now())`), /hold_expired/);
  await db.query(`select hold_slot($1, '2026-11-20T12:00:00Z', '2026-11-20T12:30:00Z', 'new', 300)`, [doctorId]);
});

test('unanswered requests expire once their time passes', async () => {
  const { db, doctorId } = await freshDatabase();
  await insertConsultation(db, doctorId, new Date(Date.now() - 3600_000).toISOString(), new Date(Date.now() - 1800_000).toISOString());
  await insertConsultation(db, doctorId, new Date(Date.now() + 3600_000).toISOString(), new Date(Date.now() + 5400_000).toISOString());
  const { rows: [{ n }] } = await db.query(`select expire_stale_requests() as n`);
  assert.equal(n, 1);
  const { rows } = await db.query(`select status::text from consultations order by starts_at`);
  assert.deepEqual(rows.map((row) => row.status), ['expired', 'requested']);
});

test('the timeline is append-only', async () => {
  const { db, doctorId } = await freshDatabase();
  const { rows: [row] } = await insertConsultation(db, doctorId, '2026-11-20T12:00:00Z', '2026-11-20T12:30:00Z');
  await db.query(`insert into consultation_events (consultation_id, to_status, actor) values ($1, 'requested', 'patient')`, [row.id]);
  await assert.rejects(db.query(`update consultation_events set note = 'x'`), /append-only/);
  await assert.rejects(db.query(`delete from consultation_events`), /append-only/);
});

test('phone numbers must be Indian mobiles', async () => {
  const { db, doctorId } = await freshDatabase();
  await assert.rejects(
    db.query(`insert into consultations (ref_code, doctor_id, patient_name, patient_phone, starts_at, ends_at, consent_at)
              values ('SS-BAD1', $1, 'Asha', '12345', now(), now() + interval '30 minutes', now())`, [doctorId]),
    /patient_phone/,
  );
});

test('rate limits count hits in a window', async () => {
  const { db } = await freshDatabase();
  const hit = async () => (await db.query(`select rate_limit_hit('k', 3600, 2) as ok`)).rows[0].ok;
  assert.deepEqual([await hit(), await hit(), await hit()], [true, true, false]);
});

test('the old booking table is moved aside and past bookings are removed', async () => {
  const { db } = await freshDatabase(`
    create table public.appointments (id bigint generated always as identity primary key, expires_at timestamptz);
    insert into public.appointments (expires_at) values (now() - interval '1 day'), (now() + interval '2 days');
  `);
  const { rows: [{ n }] } = await db.query(`select count(*)::int as n from legacy_booking_appointments`);
  assert.equal(n, 1);
  await db.query(`update legacy_booking_appointments set expires_at = now() - interval '1 minute'`);
  const { rows: [swept] } = await db.query(`select sweep_legacy_bookings() as n`);
  assert.equal(swept.n, 1);
});

test('clinic hours can be replaced in one step', async () => {
  const { db, doctorId } = await freshDatabase();
  const rules = [{ weekday: 1, start_minute: 600, end_minute: 720, slot_minutes: 20 }, { weekday: 3, start_minute: 1050, end_minute: 1230, slot_minutes: 30 }];
  const { rows: [result] } = await db.query('select replace_availability($1, $2::jsonb) as count', [doctorId, JSON.stringify(rules)]);
  assert.equal(result.count, 2);
  const { rows } = await db.query('select weekday, slot_minutes from availability_rules order by weekday');
  assert.deepEqual(rows, [{ weekday: 1, slot_minutes: 20 }, { weekday: 3, slot_minutes: 30 }]);
});

test('time off needs an end after its start', async () => {
  const { db, doctorId } = await freshDatabase();
  await db.query(`insert into time_off (doctor_id, starts_at, ends_at, reason) values ($1, '2026-12-01T00:00Z', '2026-12-02T00:00Z', 'Leave')`, [doctorId]);
  await assert.rejects(db.query(`insert into time_off (doctor_id, starts_at, ends_at) values ($1, '2026-12-02T00:00Z', '2026-12-01T00:00Z')`, [doctorId]));
});
