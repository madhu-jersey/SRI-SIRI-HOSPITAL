import {
  dateBounds,
  formatSlotTime,
  isDateInBookingWindow,
  slotsForDate,
  validateBooking,
} from './appointments.mjs';
import { clientIp, InMemoryRateLimiter } from './rate-limit.mjs';
import { deleteExpiredAppointments } from './supabase.mjs';

const bookingFailureMessage = 'We could not confirm your booking. Please try again or call +91 76749 61013.';
const slotTakenMessage = 'This slot was just booked. Please choose another time.';

function reply(response, status, body) {
  return response.status(status).json(body);
}

function silentReply(response) {
  return response.status(204).end();
}

function serverError(response, message) {
  return reply(response, 500, { message });
}

export function createAvailabilityHandler({ createClient, now = () => new Date() }) {
  return async function availabilityHandler(request, response) {
    try {
      const currentTime = now();
      const client = createClient();
      await deleteExpiredAppointments(client, currentTime);
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        return reply(response, 405, { message: 'Method not allowed.' });
      }
      const date = request.query?.date;
      if (!isDateInBookingWindow(date, currentTime)) {
        return reply(response, 400, { message: 'Choose a date from today through the next 30 days.' });
      }
      const slots = slotsForDate(date);
      if (!slots.length) return reply(response, 200, { date, timeZone: 'Asia/Kolkata', slots: [] });

      const { start, end } = dateBounds(date);
      const { data, error } = await client
        .from('appointments')
        .select('slot_start,slot_end')
        .gte('slot_start', start)
        .lt('slot_start', end)
        .gt('expires_at', currentTime.toISOString());
      if (error) throw new Error('Could not load appointment availability.');

      const bookedStarts = new Set((data ?? []).map((row) => new Date(row.slot_start).toISOString()));
      const availableSlots = slots.filter(
        (slot) => Date.parse(slot.start) > currentTime.getTime() && !bookedStarts.has(slot.start),
      );
      return reply(response, 200, { date, timeZone: 'Asia/Kolkata', slots: availableSlots });
    } catch {
      return serverError(response, 'Availability is temporarily unavailable. Please try again.');
    }
  };
}

export function createBookingHandler({
  createClient,
  sendEmails,
  now = () => new Date(),
  rateLimiter = new InMemoryRateLimiter(),
}) {
  return async function bookingHandler(request, response) {
    const currentTime = now();
    let client;
    try {
      client = createClient();
      await deleteExpiredAppointments(client, currentTime);
    } catch {
      return serverError(response, bookingFailureMessage);
    }

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return reply(response, 405, { message: 'Method not allowed.' });
    }
    if (typeof request.body?.website === 'string' && request.body.website.trim()) {
      return silentReply(response);
    }

    const { errors, value } = validateBooking(request.body, currentTime);
    if (errors) {
      return reply(response, 400, { message: 'Please review the highlighted fields.', errors });
    }
    if (!rateLimiter.consume(clientIp(request), currentTime.getTime())) {
      return reply(response, 429, { message: 'You have reached the booking limit. Please try again in an hour.' });
    }

    const { start, end } = dateBounds(value.date);
    try {
      const { data: bookedRows, error: lookupError } = await client
        .from('appointments')
        .select('slot_start')
        .gte('slot_start', start)
        .lt('slot_start', end)
        .gt('expires_at', currentTime.toISOString());
      if (lookupError) throw new Error('Could not check whether the requested time is available.');
      if ((bookedRows ?? []).some((row) => new Date(row.slot_start).toISOString() === value.slot.start)) {
        return reply(response, 409, { message: slotTakenMessage });
      }
    } catch {
      return serverError(response, bookingFailureMessage);
    }

    let insertedId;
    try {
      const { data, error } = await client
        .from('appointments')
        .insert({
          slot_start: value.slot.start,
          slot_end: value.slot.end,
          patient_name: value.patientName,
          email: value.email,
          phone: value.phone,
          reason: value.reason,
          created_at: currentTime.toISOString(),
          expires_at: value.slot.end,
        })
        .select('id')
        .single();
      if (error) {
        if (error.code === '23505') return reply(response, 409, { message: slotTakenMessage });
        throw new Error('Could not save the appointment.');
      }
      insertedId = data?.id;
      if (insertedId === undefined || insertedId === null) throw new Error('Appointment id was not returned.');
    } catch {
      return serverError(response, bookingFailureMessage);
    }

    try {
      await sendEmails(value);
    } catch {
      try {
        const { error } = await client.from('appointments').delete().eq('id', insertedId);
        if (error) throw new Error('Could not remove the unconfirmed appointment.');
      } catch {
        return serverError(response, bookingFailureMessage);
      }
      return reply(response, 502, { message: bookingFailureMessage });
    }

    return reply(response, 201, {
      date: value.date,
      time: formatSlotTime(value.slot.start),
      message: 'Your appointment is confirmed.',
    });
  };
}

function exactBearerAuthorization(header, secret) {
  if (typeof header !== 'string' || typeof secret !== 'string' || !secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

import { timingSafeEqual } from 'node:crypto';

export function createCleanupHandler({ createClient, now = () => new Date(), getSecret = () => process.env.CRON_SECRET }) {
  return async function cleanupHandler(request, response) {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return reply(response, 405, { message: 'Method not allowed.' });
    }
    if (!exactBearerAuthorization(request.headers?.authorization, getSecret())) {
      return reply(response, 401, { message: 'Unauthorized.' });
    }
    try {
      const client = createClient();
      await deleteExpiredAppointments(client, now());
      return reply(response, 200, { success: true });
    } catch {
      return serverError(response, 'Expired appointments could not be deleted.');
    }
  };
}
