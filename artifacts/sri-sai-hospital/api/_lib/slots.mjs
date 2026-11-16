// Turns weekly working hours into bookable slots for the next 14 days.
// India has no daylight saving, so IST is always UTC+5:30.

const IST_OFFSET_MINUTES = 330;
const MINUTE = 60_000;
export const BOOKING_DAYS = 14;
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
