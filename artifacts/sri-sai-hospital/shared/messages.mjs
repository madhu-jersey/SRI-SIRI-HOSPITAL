// WhatsApp message templates, phone formatting and wa.me links.
// Nothing here sends anything: every message is a prefilled link a person taps.

export const TIME_ZONE = 'Asia/Kolkata';

export const TEMPLATE_FIELDS = Object.freeze({
  request: { label: 'Patient’s request to the hospital', placeholders: ['ref', 'name', 'date', 'time'] },
  confirmation: { label: 'Confirmation to the patient', placeholders: ['name', 'doctor', 'date', 'time', 'ref', 'tracker_link'] },
  rejection: { label: 'Rejection to the patient', placeholders: ['name', 'doctor', 'date', 'time', 'ref', 'reason', 'booking_link'] },
  link_reminder: { label: 'Zoom link, 30 minutes before', placeholders: ['name', 'doctor', 'date', 'time', 'ref', 'zoom_link', 'tracker_link'] },
  feedback: { label: 'Feedback request, after the consultation', placeholders: ['name', 'doctor', 'ref', 'feedback_link'] },
  reschedule: { label: 'Consultation moved to a new time', placeholders: ['name', 'doctor', 'date', 'time', 'ref', 'tracker_link', 'reason'] },
  cancellation: { label: 'Consultation cancelled', placeholders: ['name', 'doctor', 'date', 'time', 'ref', 'reason', 'booking_link'] },
});

export const DEFAULT_TEMPLATES = Object.freeze({
  request: 'Consultation request | Ref {ref} | {name} | {date}, {time}',
  confirmation: 'Hello {name}, your video consultation with {doctor} is confirmed for {date} at {time} (Ref {ref}).\n\nWe will send you the Zoom link on WhatsApp 30 minutes before your consultation. The doctor will let you in at {time}.\n\nYou can see your appointment here: {tracker_link}\n\nSri Siri Hospital, Tanuku',
  rejection: 'Hello {name}, we are sorry, but {doctor} cannot take your consultation request for {date} at {time} (Ref {ref}).\n\nReason: {reason}\n\nYou can choose another time here: {booking_link}\n\nSri Siri Hospital, Tanuku',
  link_reminder: 'Hello {name}, your video consultation with {doctor} starts at {time} today (Ref {ref}).\n\nJoin here: {zoom_link}\n\nSri Siri Hospital, Tanuku',
  feedback: 'Hello {name}, thank you for your consultation with {doctor} (Ref {ref}). Please tell us how it went: {feedback_link}\n\nSri Siri Hospital, Tanuku',
  reschedule: 'Hello {name}, your video consultation with {doctor} has been moved to {date} at {time} (Ref {ref}).\n\nReason: {reason}\n\nWe will send you the Zoom link on WhatsApp 30 minutes before your consultation.\n\nYou can see your appointment here: {tracker_link}\n\nSri Siri Hospital, Tanuku',
  cancellation: 'Hello {name}, we are sorry, your video consultation with {doctor} on {date} at {time} (Ref {ref}) has been cancelled.\n\nReason: {reason}\n\nYou can book another time here: {booking_link}\n\nSri Siri Hospital, Tanuku',
});

export const TEMPLATE_KEYS = Object.freeze(Object.keys(DEFAULT_TEMPLATES));

// Fills {placeholder}s it knows about and leaves anything else untouched.
export function renderTemplate(template, values) {
  return String(template).replace(/\{([a-z_]+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) && values[key] !== undefined && values[key] !== null
      ? String(values[key])
      : match
  ));
}

// Accepts "98765 43210", "+91 98765 43210", "09876543210", "919876543210".
// Returns "+919876543210" or null.
export function normalizeIndianMobile(input) {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

// "+917075009876" or "917075009876" -> "+91 70750 09876".
export function formatIndianPhone(value) {
  const normalized = normalizeIndianMobile(String(value ?? ''));
  if (!normalized) return String(value ?? '');
  const digits = normalized.slice(3);
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

// wa.me wants the number as digits with country code and no plus sign.
export function waLink(phone, text) {
  const normalized = normalizeIndianMobile(String(phone ?? ''));
  if (!normalized) throw new Error('A valid Indian mobile number is needed for a WhatsApp link.');
  return `https://wa.me/${normalized.slice(1)}?text=${encodeURIComponent(text)}`;
}

// "Fri, 20 Nov 2026" in India time.
export function formatDate(iso) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).formatToParts(new Date(iso));
  const part = (type) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('weekday')}, ${part('day')} ${part('month')} ${part('year')}`;
}

export function formatTime(iso) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)).replace(/\s?(am|pm)$/i, (suffix) => suffix.toUpperCase());
}

// Everything a template can mention, for one consultation.
export function messageValues(consultation, extra = {}) {
  return {
    ref: consultation.ref_code,
    name: consultation.patient_name,
    doctor: consultation.doctor_name ?? 'the doctor',
    date: formatDate(consultation.starts_at),
    time: formatTime(consultation.starts_at),
    zoom_link: consultation.join_url ?? '',
    tracker_link: consultation.tracker_url ?? '',
    feedback_link: consultation.feedback_url ?? '',
    booking_link: consultation.booking_url ?? '',
    ...extra,
  };
}
