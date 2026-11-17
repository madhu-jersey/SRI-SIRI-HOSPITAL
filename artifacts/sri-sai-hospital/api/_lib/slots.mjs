// Turns weekly working hours into bookable slots. Patients can book from
// today up to 7 days (today and the next six).
// India has no daylight saving, so IST is always UTC+5:30.

const IST_OFFSET_MINUTES = 330;
const MINUTE = 60_000;
export const BOOKING_DAYS = 7;
export const LEAD_MINUTES = 30;

function istDateParts(time) {
  const shifted = new Date(time + IST_OFFSET_MINUTES * MINUTE);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

function istMidnightUtc({ year, month, day }) {
  return Date.UTC(year, month, day) - IST_OFFSET_MINUTES * MINUTE;
}

export function periodOf(startIso) {
  const minutes = (new Date(startIso).getTime() / MINUTE + IST_OFFSET_MINUTES) % (24 * 60);
  if (minutes < 12 * 60) return 'morning';
  if (minutes < 17 * 60) return 'afternoon';
  return 'evening';
}

// rules: [{ weekday, start_minute, end_minute, slot_minutes }]
// busy: [{ starts_at, ends_at }] from active consultations and other people's holds.
export function buildSlotDays(rules, busy, now = Date.now(), { days = BOOKING_DAYS, leadMinutes = LEAD_MINUTES } = {}) {
  const busyRanges = busy.map((item) => [Date.parse(item.starts_at), Date.parse(item.ends_at)]);
  const earliest = now + leadMinutes * MINUTE;
  const today = istDateParts(now);
  const result = [];
  for (let offset = 0; offset < days; offset += 1) {
    const midnight = istMidnightUtc(today) + offset * 24 * 60 * MINUTE;
    const parts = istDateParts(midnight + 12 * 60 * MINUTE);
    const weekday = new Date(Date.UTC(parts.year, parts.month, parts.day)).getUTCDay();
    const date = `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    const slots = [];
    for (const rule of rules.filter((item) => item.weekday === weekday)) {
      for (let minute = rule.start_minute; minute + rule.slot_minutes <= rule.end_minute; minute += rule.slot_minutes) {
        const start = midnight + minute * MINUTE;
        const end = start + rule.slot_minutes * MINUTE;
        if (start < earliest) continue;
        if (busyRanges.some(([busyStart, busyEnd]) => start < busyEnd && busyStart < end)) continue;
        const startIso = new Date(start).toISOString();
        slots.push({ start: startIso, end: new Date(end).toISOString(), period: periodOf(startIso) });
      }
    }
    slots.sort((a, b) => a.start.localeCompare(b.start));
    result.push({ date, weekday, open: rules.some((item) => item.weekday === weekday), slots });
  }
  return result;
}

export function findSlot(days, startIso) {
  for (const day of days) {
    const slot = day.slots.find((item) => item.start === startIso);
    if (slot) return slot;
  }
  return null;
}

// "2026-11-30" -> UTC time of midnight in India on that day.
export function istMidnightOf(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return istMidnightUtc({ year, month: month - 1, day });
}

export function istDateKey(time) {
  const { year, month, day } = istDateParts(time);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// The doctor's calendar: every clinic slot for each day, marked as free,
// booked, blocked (time off) or past, plus bookings and time off on that day.
export function calendarDays(rules, consultations, timeOff, fromKey, days, now = Date.now()) {
  const active = consultations.filter((item) => item.status === 'requested' || item.status === 'scheduled');
  const result = [];
  const start = istMidnightOf(fromKey);
  for (let offset = 0; offset < days; offset += 1) {
    const midnight = start + offset * 24 * 60 * MINUTE;
    const next = midnight + 24 * 60 * MINUTE;
    const date = istDateKey(midnight + 12 * 60 * MINUTE);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const dayRules = rules.filter((rule) => rule.weekday === weekday);
    const overlapping = (list, from, to) => list.filter((item) => Date.parse(item.starts_at) < to && from < Date.parse(item.ends_at));
    const slots = [];
    for (const rule of dayRules) {
      for (let minute = rule.start_minute; minute + rule.slot_minutes <= rule.end_minute; minute += rule.slot_minutes) {
        const from = midnight + minute * MINUTE;
        const to = from + rule.slot_minutes * MINUTE;
        const booking = overlapping(active, from, to)[0];
        const block = overlapping(timeOff, from, to)[0];
        slots.push({
          start: new Date(from).toISOString(),
          end: new Date(to).toISOString(),
          state: booking ? 'booked' : block ? 'blocked' : from < now ? 'past' : 'free',
          ...(booking ? { consultationId: booking.id } : {}),
          ...(block ? { timeOffId: block.id } : {}),
        });
      }
    }
    slots.sort((a, b) => a.start.localeCompare(b.start));
    result.push({
      date,
      weekday,
      open: dayRules.length > 0,
      slots,
      consultationIds: overlapping(consultations, midnight, next).map((item) => item.id),
      timeOffIds: overlapping(timeOff, midnight, next).map((item) => item.id),
    });
  }
  return result;
}
