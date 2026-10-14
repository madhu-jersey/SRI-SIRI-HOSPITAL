import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, CalendarDays, Check, Clock3, LoaderCircle, MapPin, ShieldCheck } from 'lucide-react';

type FieldName = 'patientName' | 'email' | 'phone' | 'date' | 'slotStart' | 'reason' | 'consent';
type BookingFields = {
  patientName: string;
  email: string;
  phone: string;
  date: string;
  slotStart: string;
  reason: string;
  consent: boolean;
};
type TimeSlot = { start: string; end: string };
type FieldErrors = Partial<Record<FieldName, string>>;

const consentText = 'I agree that my details are used only to arrange this appointment, and are deleted after the appointment ends.';

function todayInIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function validateField(field: FieldName, fields: BookingFields, today: string): string | undefined {
  if (field === 'patientName') {
    const name = fields.patientName.trim();
    if (name.length < 2 || name.length > 60) return 'Enter your full name (2 to 60 characters).';
  }
  if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) {
    return 'Enter a valid email address.';
  }
  if (field === 'phone' && !/^[6-9]\d{9}$/.test(fields.phone.trim())) {
    return 'Enter a 10-digit Indian mobile number starting with 6 to 9.';
  }
  if (field === 'date' && (!fields.date || fields.date < today || fields.date > addDays(today, 30))) {
    return 'Choose a date from today through the next 30 days.';
  }
  if (field === 'slotStart' && !fields.slotStart) return 'Choose an available time slot.';
  if (field === 'reason' && fields.reason.length > 200) return 'Use 200 characters or fewer.';
  if (field === 'consent' && !fields.consent) return 'Please agree before booking.';
  return undefined;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00+05:30`));
}

function formatTime(isoString: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoString));
}

function BookingSuccess({ date, time, onReset }: { date: string; time: string; onReset: () => void }) {
  return (
    <div className="booking-success" role="status" aria-live="polite">
      <div className="booking-success-mark" aria-hidden="true">
        <svg viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="25" />
          <path d="m16 29 8 8 17-18" />
        </svg>
      </div>
      <span className="booking-success-label">Appointment confirmed</span>
      <h3>You’re all booked.</h3>
      <p>Your appointment with Dr. Sritha is set for:</p>
      <div className="booking-success-time">
        <strong>{formatDate(date)}</strong>
        <span>{time}</span>
      </div>
      <p className="booking-success-note">A confirmation email has been sent to you.</p>
      <button className="booking-reset" type="button" onClick={onReset}>Book another appointment</button>
    </div>
  );
}

export function BookingSection() {
  const today = useMemo(todayInIndia, []);
  const [fields, setFields] = useState<BookingFields>({
    patientName: '',
    email: '',
    phone: '',
    date: today,
    slotStart: '',
    reason: '',
    consent: false,
  });
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [sending, setSending] = useState(false);
  const [availabilityRequest, setAvailabilityRequest] = useState(0);
  const [serverMessage, setServerMessage] = useState('');
  const [confirmation, setConfirmation] = useState<{ date: string; time: string } | null>(null);
  const maxDate = useMemo(() => addDays(today, 30), [today]);
  const errors = useMemo(() => {
    const next: FieldErrors = {};
    (Object.keys(touched) as FieldName[]).forEach((field) => {
      if (!touched[field]) return;
      next[field] = validateField(field, fields, today);
    });
    return { ...next, ...serverErrors };
  }, [fields, serverErrors, today, touched]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingSlots(true);
    setSlots([]);
    setServerMessage('');
    setFields((current) => ({ ...current, slotStart: '' }));
    setTouched((current) => ({ ...current, slotStart: false }));

    fetch(`/api/availability?date=${encodeURIComponent(fields.date)}`, { signal: controller.signal })
      .then(async (response) => {
        let result: { message?: string; slots?: TimeSlot[] };
        try {
          result = await response.json();
        } catch {
          throw new Error('Appointment times are temporarily unavailable. Please try again.');
        }
        if (!response.ok) throw new Error(result.message || 'We could not load appointment times.');
        setSlots(Array.isArray(result.slots) ? result.slots : []);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setServerMessage(error instanceof Error ? error.message : 'We could not load appointment times.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSlots(false);
      });
    return () => controller.abort();
  }, [availabilityRequest, fields.date]);

  function updateField(field: FieldName, value: string | boolean) {
    setFields((current) => ({ ...current, [field]: value }));
    setServerErrors((current) => ({ ...current, [field]: undefined }));
    setServerMessage('');
  }

  function blurField(field: FieldName) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function describedBy(field: FieldName, helperId?: string) {
    const ids = [errors[field] ? `${field}-error` : undefined, helperId].filter(Boolean);
    return ids.length ? ids.join(' ') : undefined;
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const website = String(new FormData(event.currentTarget).get('website') ?? '');
    const fieldsToValidate: FieldName[] = ['patientName', 'email', 'phone', 'date', 'slotStart', 'reason', 'consent'];
    setTouched(Object.fromEntries(fieldsToValidate.map((field) => [field, true])));
    const nextErrors = fieldsToValidate.reduce<FieldErrors>((result, field) => {
      const error = validateField(field, fields, today);
      if (error) result[field] = error;
      return result;
    }, {});
    setServerErrors({});
    setServerMessage('');
    if (Object.keys(nextErrors).length) return;

    setSending(true);
    try {
      const response = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: fields.patientName,
          email: fields.email,
          phone: fields.phone,
          date: fields.date,
          slotStart: fields.slotStart,
          reason: fields.reason,
          consent: fields.consent,
          website,
        }),
      });
      let result: { message?: string; date?: string; time?: string; errors?: FieldErrors } = {};
      if (response.status !== 204) {
        try {
          result = await response.json();
        } catch {
          throw new Error('We could not confirm your booking. Please try again or call +91 76749 61013.');
        }
      }
      if (!response.ok) {
        if (result.errors) setServerErrors(result.errors);
        throw new Error(result.message || 'We could not confirm your booking. Please try again.');
      }
      const selected = slots.find((slot) => slot.start === fields.slotStart);
      setConfirmation({
        date: result.date || fields.date,
        time: result.time || (selected ? formatTime(selected.start) : ''),
      });
    } catch (error) {
      setServerMessage(error instanceof Error ? error.message : 'We could not confirm your booking. Please try again.');
    } finally {
      setSending(false);
    }
  }

  function resetForm() {
    setConfirmation(null);
    setFields({
      patientName: '',
      email: '',
      phone: '',
      date: today,
      slotStart: '',
      reason: '',
      consent: false,
    });
    setTouched({});
    setServerErrors({});
    setServerMessage('');
    setAvailabilityRequest((request) => request + 1);
  }

  return (
    <section className="section booking-section" id="book-appointment" aria-labelledby="booking-heading">
      <div className="container">
        <div className="section-heading booking-section-heading">
          <span className="eyebrow">A little time for you</span>
          <h2 id="booking-heading">Book with <em>Dr. Sritha</em></h2>
          <p>Choose a time that works for you. We’ll take care of the rest.</p>
        </div>

        <div className="booking-card">
          <aside className="booking-summary" aria-label="Appointment information">
            <div className="booking-summary-top">
              <span className="booking-avatar" aria-hidden="true">S</span>
              <span className="booking-doctor-role">Neuro-Psychiatry</span>
              <h3>Dr. Sritha</h3>
              <p>Thoughtful care starts with a conversation. Reserve a private consultation at a time that suits you.</p>
            </div>
            <div className="booking-info-row">
              <Clock3 size={19} aria-hidden="true" />
              <div><strong>Monday – Saturday</strong><span>5:30 PM – 8:30 PM</span></div>
            </div>
            <div className="booking-info-row">
              <CalendarDays size={19} aria-hidden="true" />
              <div><strong>30-minute appointments</strong><span>Book up to 30 days ahead</span></div>
            </div>
            <div className="booking-info-row">
              <MapPin size={19} aria-hidden="true" />
              <div><strong>Sri Siri Hospital</strong><span>Tanuku, Andhra Pradesh</span></div>
            </div>
            <div className="booking-privacy">
              <ShieldCheck size={18} aria-hidden="true" />
              <p>Your details are used only to arrange this appointment and are deleted after it ends.</p>
            </div>
          </aside>

          <div className="booking-form-panel">
            {confirmation ? (
              <BookingSuccess date={confirmation.date} time={confirmation.time} onReset={resetForm} />
            ) : (
              <>
                <div className="booking-form-heading">
                  <span>01 <i /></span>
                  <h3>Your appointment</h3>
                  <p>Share a few details to reserve your time.</p>
                </div>
                {serverMessage && (
                  <div className="booking-server-error" role="alert">
                    <span aria-hidden="true">!</span>
                    <p>{serverMessage}</p>
                  </div>
                )}
                <form className="booking-form" onSubmit={submitBooking} noValidate>
                  <div className="booking-fields-grid">
                    <div className={`booking-field${fields.patientName ? ' has-value' : ''}${errors.patientName ? ' has-error' : ''}`}>
                      <input
                        id="patientName"
                        name="patientName"
                        type="text"
                        autoComplete="name"
                        value={fields.patientName}
                        onChange={(event) => updateField('patientName', event.target.value)}
                        onBlur={() => blurField('patientName')}
                        maxLength={60}
                        required
                        aria-invalid={Boolean(errors.patientName)}
                        aria-describedby={describedBy('patientName')}
                        placeholder=" "
                      />
                      <label htmlFor="patientName">Full name <span>*</span></label>
                      {errors.patientName && <span className="booking-field-error" id="patientName-error">{errors.patientName}</span>}
                    </div>
                    <div className={`booking-field${fields.email ? ' has-value' : ''}${errors.email ? ' has-error' : ''}`}>
                      <input
                        id="bookingEmail"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={fields.email}
                        onChange={(event) => updateField('email', event.target.value)}
                        onBlur={() => blurField('email')}
                        required
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={describedBy('email')}
                        placeholder=" "
                      />
                      <label htmlFor="bookingEmail">Email address <span>*</span></label>
                      {errors.email && <span className="booking-field-error" id="email-error">{errors.email}</span>}
                    </div>
                    <div className={`booking-field${fields.phone ? ' has-value' : ''}${errors.phone ? ' has-error' : ''}`}>
                      <span className="booking-phone-prefix" aria-hidden="true">+91</span>
                      <input
                        id="bookingPhone"
                        name="phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        value={fields.phone}
                        onChange={(event) => updateField('phone', event.target.value.replace(/\D/g, '').slice(0, 10))}
                        onBlur={() => blurField('phone')}
                        maxLength={10}
                        required
                        aria-invalid={Boolean(errors.phone)}
                        aria-describedby={describedBy('phone')}
                        placeholder=" "
                      />
                      <label htmlFor="bookingPhone">Mobile number <span>*</span></label>
                      {errors.phone && <span className="booking-field-error" id="phone-error">{errors.phone}</span>}
                    </div>
                    <div className={`booking-field booking-date-field${fields.date ? ' has-value' : ''}${errors.date ? ' has-error' : ''}`}>
                      <input
                        id="bookingDate"
                        name="date"
                        type="date"
                        value={fields.date}
                        min={today}
                        max={maxDate}
                        onChange={(event) => updateField('date', event.target.value)}
                        onBlur={() => blurField('date')}
                        required
                        aria-invalid={Boolean(errors.date)}
                        aria-describedby={describedBy('date')}
                        placeholder=" "
                      />
                      <label htmlFor="bookingDate">Preferred date <span>*</span></label>
                      {errors.date && <span className="booking-field-error" id="date-error">{errors.date}</span>}
                    </div>
                  </div>

                  <fieldset className={`booking-slots${errors.slotStart ? ' has-error' : ''}`}>
                    <legend>Choose a time <span>*</span></legend>
                    {loadingSlots ? (
                      <div className="booking-slot-skeleton" aria-label="Loading available appointment times" aria-busy="true">
                        {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
                      </div>
                    ) : slots.length ? (
                      <div className="booking-slot-grid" role="radiogroup" aria-describedby={describedBy('slotStart')}>
                        {slots.map((slot) => (
                          <label className={`booking-slot${fields.slotStart === slot.start ? ' is-selected' : ''}`} key={slot.start}>
                            <input
                              type="radio"
                              name="slotStart"
                              value={slot.start}
                              checked={fields.slotStart === slot.start}
                              onChange={() => updateField('slotStart', slot.start)}
                              onBlur={() => blurField('slotStart')}
                              aria-invalid={Boolean(errors.slotStart)}
                            />
                            <span>{formatTime(slot.start)}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="booking-no-slots">{serverMessage ? 'Times are temporarily unavailable.' : 'No appointments are available on this date. Please choose another.'}</p>
                    )}
                    {errors.slotStart && <span className="booking-field-error" id="slotStart-error">{errors.slotStart}</span>}
                  </fieldset>

                  <div className={`booking-field booking-reason-field${fields.reason ? ' has-value' : ''}${errors.reason ? ' has-error' : ''}`}>
                    <textarea
                      id="bookingReason"
                      name="reason"
                      value={fields.reason}
                      onChange={(event) => updateField('reason', event.target.value)}
                      onBlur={() => blurField('reason')}
                      maxLength={200}
                      aria-invalid={Boolean(errors.reason)}
                      aria-describedby={describedBy('reason', 'bookingReasonHint')}
                      placeholder=" "
                      rows={3}
                    />
                    <label htmlFor="bookingReason">Reason for visit <span className="booking-optional">(optional)</span></label>
                    <span className="booking-field-hint" id="bookingReasonHint">Please do not enter medical history <i>{fields.reason.length}/200</i></span>
                    {errors.reason && <span className="booking-field-error" id="reason-error">{errors.reason}</span>}
                  </div>

                  <div className={`booking-consent${errors.consent ? ' has-error' : ''}`}>
                    <label htmlFor="bookingConsent">
                      <input
                        id="bookingConsent"
                        name="consent"
                        type="checkbox"
                        checked={fields.consent}
                        onChange={(event) => updateField('consent', event.target.checked)}
                        onBlur={() => blurField('consent')}
                        required
                        aria-invalid={Boolean(errors.consent)}
                        aria-describedby={describedBy('consent')}
                      />
                      <span className="booking-checkbox-art" aria-hidden="true"><Check size={15} /></span>
                      <span>{consentText}</span>
                    </label>
                    {errors.consent && <span className="booking-field-error" id="consent-error">{errors.consent}</span>}
                  </div>

                  <div className="booking-honeypot" aria-hidden="true">
                    <label htmlFor="bookingWebsite">Website</label>
                    <input id="bookingWebsite" name="website" type="text" tabIndex={-1} autoComplete="off" />
                  </div>

                  <button className={`button button-primary booking-submit${sending ? ' is-sending' : ''}`} type="submit" disabled={sending}>
                    {sending ? <><LoaderCircle className="booking-spinner" size={18} aria-hidden="true" /> Confirming your appointment</> : <>Confirm appointment <ArrowRight size={18} aria-hidden="true" /></>}
                  </button>
                  <p className="booking-secure-note"><ShieldCheck size={14} aria-hidden="true" /> Your information is private and secure.</p>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
