import { availabilityConfig } from './availability-config.mjs';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[6-9]\d{9}$/;

export function dateInTimeZone(date, timeZone = availabilityConfig.timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function addDays(date, days) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function isValidDateString(value) {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isDateInBookingWindow(value, now = new Date()) {
  if (!isValidDateString(value)) return false;
  const today = dateInTimeZone(now);
  return value >= today && value <= addDays(today, availabilityConfig.maximumDaysAhead);
}

export function slotsForDate(date) {
  if (!isValidDateString(date)) return [];
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  if (!availabilityConfig.weekdays.includes(weekday)) return [];

  const slots = [];
  for (
    let minute = availabilityConfig.startMinute;
    minute < availabilityConfig.endMinute;
    minute += availabilityConfig.slotMinutes
  ) {
    const hourText = String(Math.floor(minute / 60)).padStart(2, '0');
    const minuteText = String(minute % 60).padStart(2, '0');
    const nextMinute = minute + availabilityConfig.slotMinutes;
    const endHourText = String(Math.floor(nextMinute / 60)).padStart(2, '0');
    const endMinuteText = String(nextMinute % 60).padStart(2, '0');
    slots.push({
      start: new Date(`${date}T${hourText}:${minuteText}:00+05:30`).toISOString(),
      end: new Date(`${date}T${endHourText}:${endMinuteText}:00+05:30`).toISOString(),
    });
  }
  return slots;
}

export function dateBounds(date) {
  return {
    start: new Date(`${date}T00:00:00+05:30`).toISOString(),
    end: new Date(`${addDays(date, 1)}T00:00:00+05:30`).toISOString(),
  };
}

export function formatSlotTime(isoString) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: availabilityConfig.timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoString));
}

export function validateBooking(body, now = new Date()) {
  const errors = {};
  if (typeof body?.patientName !== 'string' || body.patientName.trim().length < 2 || body.patientName.trim().length > 60) {
    errors.patientName = 'Enter your full name (2 to 60 characters).';
  }
  if (typeof body?.email !== 'string' || !emailPattern.test(body.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }
  if (typeof body?.phone !== 'string' || !phonePattern.test(body.phone.trim())) {
    errors.phone = 'Enter a 10-digit Indian mobile number starting with 6 to 9.';
  }
  if (!isDateInBookingWindow(body?.date, now)) {
    errors.date = 'Choose a date from today through the next 30 days.';
  }
  if (typeof body?.reason !== 'undefined' && (typeof body.reason !== 'string' || body.reason.length > 200)) {
    errors.reason = 'Reason for visit must be 200 characters or fewer.';
  }
  if (body?.consent !== true) {
    errors.consent = 'Please agree before booking.';
  }

  const slot = typeof body?.slotStart === 'string'
    ? slotsForDate(body.date).find((candidate) => candidate.start === body.slotStart)
    : undefined;
  if (!slot || Date.parse(slot.start) <= now.getTime()) {
    errors.slotStart = 'Choose an available future time slot.';
  }

  if (Object.keys(errors).length) return { errors };
  return {
    value: {
      patientName: body.patientName.trim(),
      email: body.email.trim(),
      phone: `+91${body.phone.trim()}`,
      date: body.date,
      reason: (body.reason ?? '').trim(),
      slot,
    },
  };
}
