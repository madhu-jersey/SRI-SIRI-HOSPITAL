import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, Clock3, LoaderCircle, MessageCircle, RefreshCw, ShieldCheck, Star, Video,
} from 'lucide-react';
import { formatDate, formatTime, normalizeIndianMobile } from '../../shared/messages.mjs';
import { ApiError, api, apiUrl, type PublicConfig, type SlotDay } from './api';
import './consult.css';

const SLOT_REFRESH_MS = 30_000;
const LAST_REQUEST_KEY = 'sri-siri-consult-request';

type Hold = { holdToken: string; start: string; end: string; expiresAt: string };
type RequestResult = { ref: string; startsAt: string; endsAt: string; whatsappUrl: string; hospitalWhatsappDisplay: string; trackerUrl: string };
type Fields = { name: string; phone: string; confirmPhone: string; consent: boolean; website: string };
type Errors = Partial<Record<'name' | 'phone' | 'confirmPhone' | 'consent' | 'slot', string>>;

const PERIOD_LABELS = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' } as const;

// "Monday – Saturday" and "5:30 PM – 8:30 PM" from the doctor's weekly hours.
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function hoursSummary(hours: PublicConfig['hours']) {
  const clock = (minutes: number) => formatTime(`2026-01-05T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00+05:30`);
  const order = [1, 2, 3, 4, 5, 6, 0].filter((day) => hours.some((rule) => rule.weekday === day));
  if (!order.length) return { days: 'Bookings are paused', times: 'Please call the hospital' };
  const runs: number[][] = [];
  for (const day of order) {
    const last = runs.at(-1);
    const position = [1, 2, 3, 4, 5, 6, 0].indexOf(day);
    if (last && [1, 2, 3, 4, 5, 6, 0].indexOf(last.at(-1)!) === position - 1) last.push(day);
    else runs.push([day]);
  }
  const days = runs.map((run) => (run.length > 2 ? `${DAY_NAMES[run[0]]} – ${DAY_NAMES[run.at(-1)!]}` : run.map((day) => DAY_NAMES[day]).join(', '))).join(', ');
  const sessions = [...new Set(hours.map((rule) => `${rule.start_minute}-${rule.end_minute}`))].map((key) => key.split('-').map(Number)).sort((a, b) => a[0] - b[0]);
  const times = sessions.length > 2 ? 'Times vary by day' : sessions.map(([start, end]) => `${clock(start)} – ${clock(end)}`).join(' and ');
  return { days, times };
}

function dayLabel(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(value);
  return { weekday: part({ weekday: 'short' }), day: part({ day: 'numeric' }), month: part({ month: 'short' }) };
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function readStoredRequest(): RequestResult | null {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(LAST_REQUEST_KEY) ?? 'null');
    return stored && typeof stored.ref === 'string' && Date.parse(stored.endsAt) > Date.now() ? stored : null;
  } catch {
    return null;
  }
}

function releaseHold(holdToken: string) {
  const payload = new Blob([JSON.stringify({ holdToken })], { type: 'application/json' });
  if (!navigator.sendBeacon?.(apiUrl('holds/release'), payload)) {
    fetch(apiUrl('holds/release'), { method: 'POST', body: payload, keepalive: true }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// /consult
// ---------------------------------------------------------------------------

export function ConsultPage() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [days, setDays] = useState<SlotDay[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [hold, setHold] = useState<Hold | null>(null);
  const [holding, setHolding] = useState('');
  const [fields, setFields] = useState<Fields>({ name: '', phone: '', confirmPhone: '', consent: false, website: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RequestResult | null>(readStoredRequest);
  const holdRef = useRef<Hold | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const now = useNow(1000);
  holdRef.current = hold;

  const loadSlots = useCallback(async () => {
    try {
      const token = holdRef.current?.holdToken;
      const data = await api<{ days: SlotDay[] }>(`slots${token ? `?hold=${encodeURIComponent(token)}` : ''}`);
      setDays(data.days);
      setLoadError('');
      setSelectedDate((current) => current && data.days.some((day) => day.date === current)
        ? current
        : data.days.find((day) => day.slots.length)?.date ?? data.days[0]?.date ?? '');
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, []);

  useEffect(() => {
    api<PublicConfig>('config').then(setConfig).catch((error: Error) => setLoadError(error.message));
    loadSlots();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') loadSlots(); }, SLOT_REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') loadSlots(); };
    document.addEventListener('visibilitychange', onVisible);
    const onLeave = () => { if (holdRef.current) releaseHold(holdRef.current.holdToken); };
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onLeave);
    };
  }, [loadSlots]);

  // Capped at the hold length so a small clock difference never shows 5:01.
  const secondsLeft = hold ? Math.min((config?.holdMinutes ?? 5) * 60, Math.max(0, Math.ceil((Date.parse(hold.expiresAt) - now) / 1000))) : 0;

  useEffect(() => {
    if (hold && secondsLeft === 0 && !submitting) {
      setHold(null);
      setNotice('Your 5-minute hold ran out, so the time was released. Please pick a time again.');
      loadSlots();
    }
  }, [hold, secondsLeft, submitting, loadSlots]);

  async function pickSlot(start: string) {
    if (holding || hold?.start === start) return;
    setHolding(start);
    setNotice('');
    setErrors((current) => ({ ...current, slot: undefined }));
    try {
      const data = await api<Hold>('holds', { method: 'POST', body: { start, holdToken: hold?.holdToken } });
      setHold(data);
      window.requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    } catch (error) {
      setNotice((error as Error).message);
      loadSlots();
    } finally {
      setHolding('');
    }
  }

  function update<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate(): Errors {
    const next: Errors = {};
    const name = fields.name.trim();
    if (name.length < 2) next.name = 'Please enter the patient’s full name.';
    else if (!/^[\p{L}\p{M} .'-]+$/u.test(name)) next.name = 'Please use letters only.';
    const phone = normalizeIndianMobile(fields.phone);
    if (!phone) next.phone = 'Enter a 10-digit mobile number.';
    else if (phone !== normalizeIndianMobile(fields.confirmPhone)) next.confirmPhone = 'The two numbers do not match.';
    if (!fields.consent) next.consent = 'Please tick this box to continue.';
    if (!hold) next.slot = 'Please pick a time first.';
    return next;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) {
      const first = Object.keys(next)[0];
      document.getElementById(first === 'slot' ? 'consult-dates' : `consult-${first}`)?.focus();
      return;
    }
    setSubmitting(true);
    setNotice('');
    try {
      const data = await api<RequestResult>('requests', {
        method: 'POST',
        body: { holdToken: hold!.holdToken, name: fields.name, phone: fields.phone, confirmPhone: fields.confirmPhone, consent: fields.consent, website: fields.website },
      });
      try { window.sessionStorage.setItem(LAST_REQUEST_KEY, JSON.stringify(data)); } catch { /* private mode */ }
      setHold(null);
      setResult(data);
      window.scrollTo({ top: 0 });
      window.location.href = data.whatsappUrl;
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields as Errors);
        if (error.status === 409 || error.status === 410) {
          setHold(null);
          loadSlots();
        }
      }
      setNotice((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    try { window.sessionStorage.removeItem(LAST_REQUEST_KEY); } catch { /* ignore */ }
    setResult(null);
    setFields({ name: '', phone: '', confirmPhone: '', consent: false, website: '' });
    loadSlots();
  }

  const selectedDay = days?.find((day) => day.date === selectedDate);
  const groups = useMemo(() => {
    const byPeriod = new Map<string, SlotDay['slots']>();
    for (const slot of selectedDay?.slots ?? []) byPeriod.set(slot.period, [...(byPeriod.get(slot.period) ?? []), slot]);
    return [...byPeriod];
  }, [selectedDay]);

  const doctor = config?.doctor;
  const minutes = String(Math.floor(secondsLeft / 60));
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return (
    <main className="consult-page" id="main">
      <div className="consult-container">
        <a className="info-back-link" href="/"><ArrowLeft size={17} aria-hidden="true" /> Back to home</a>
        <div className="consult-heading">
          <span className="eyebrow">Video consultation</span>
          <h1>Consult <em>{doctor?.name ?? 'Dr. Sritha'}</em> on Zoom</h1>
          <p>Pick a time, then send your request to the hospital on WhatsApp. The doctor confirms it and sends you the Zoom link.</p>
        </div>

        <div className="booking-card consult-card">
          <aside className="booking-summary" aria-label="About this consultation">
            <div className="booking-summary-top">
              <span className="booking-avatar" aria-hidden="true">S</span>
              <span className="booking-doctor-role">Neuro-Psychiatry</span>
              <h2>{doctor?.name ?? 'Dr. Sritha'}</h2>
              <p>{doctor ? `${doctor.qualification} · ${doctor.registration}` : 'MBBS, MD (Neuro-Psychiatry)'}</p>
            </div>
            <div className="booking-info-row">
              <Video size={19} aria-hidden="true" />
              <div><strong>{doctor?.minutes ?? 30}-minute Zoom call</strong><span>Join from your phone or computer</span></div>
            </div>
            <div className="booking-info-row">
              <Clock3 size={19} aria-hidden="true" />
              <div><strong>{config ? hoursSummary(config.hours).days : 'Monday – Saturday'}</strong><span>{config ? `${hoursSummary(config.hours).times}, India time · book up to ${config.bookingDays} days ahead` : '5:30 PM – 8:30 PM, India time'}</span></div>
            </div>
            <div className="booking-info-row">
              <MessageCircle size={19} aria-hidden="true" />
              <div><strong>Confirmed on WhatsApp</strong><span>{config?.hospitalWhatsappDisplay ? `From ${config.hospitalWhatsappDisplay}` : 'From the hospital’s number'}</span></div>
            </div>
            <div className="booking-privacy">
              <ShieldCheck size={18} aria-hidden="true" />
              <p>We only ask for a name and mobile number. Please do not send reports or medical details on WhatsApp; the doctor will ask during the call.</p>
            </div>
          </aside>

          <div className="booking-form-panel" ref={formRef}>
            {result ? (
              <RequestSent result={result} onStartOver={startOver} />
            ) : (
              <>
                {notice && (
                  <div className="booking-server-error" role="alert">
                    <span aria-hidden="true">!</span>
                    <p>{notice}</p>
                  </div>
                )}
                {loadError && !days ? (
                  <div className="consult-load-error" role="alert">
                    <p>{loadError}</p>
                    <button className="button button-outline" type="button" onClick={loadSlots}><RefreshCw size={16} aria-hidden="true" /> Try again</button>
                  </div>
                ) : (
                  <form className="booking-form" onSubmit={submit} noValidate>
                    <fieldset className={`consult-step${errors.slot ? ' has-error' : ''}`}>
                      <legend><span>1</span> Choose a day</legend>
                      {!days ? (
                        <div className="consult-date-strip is-loading" aria-busy="true" aria-label="Loading days">
                          {Array.from({ length: 7 }, (_, index) => <span key={index} />)}
                        </div>
                      ) : (
                        <div className="consult-date-strip" id="consult-dates" role="radiogroup" aria-label="Day" tabIndex={-1}>
                          {days.map((day) => {
                            const label = dayLabel(day.date);
                            const count = day.slots.length;
                            return (
                              <button
                                key={day.date}
                                type="button"
                                role="radio"
                                aria-checked={selectedDate === day.date}
                                className={`consult-date${selectedDate === day.date ? ' is-selected' : ''}`}
                                disabled={!count}
                                onClick={() => setSelectedDate(day.date)}
                              >
                                <small>{label.weekday}</small>
                                <strong>{label.day}</strong>
                                <small>{label.month}</small>
                                <i>{!day.open ? 'Closed' : count ? `${count} free` : 'Full'}</i>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </fieldset>

                    <fieldset className={`consult-step${errors.slot ? ' has-error' : ''}`}>
                      <legend><span>2</span> Choose a time <em>{selectedDay ? formatDate(`${selectedDay.date}T12:00:00+05:30`) : ''}</em></legend>
                      {!days ? (
                        <div className="booking-slot-skeleton" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div>
                      ) : groups.length ? (
                        groups.map(([period, slots]) => (
                          <div className="consult-period" key={period}>
                            <h3>{PERIOD_LABELS[period as keyof typeof PERIOD_LABELS]}</h3>
                            <div className="booking-slot-grid" role="radiogroup" aria-label={`${PERIOD_LABELS[period as keyof typeof PERIOD_LABELS]} times`}>
                              {slots.map((slot) => {
                                const selected = hold?.start === slot.start;
                                return (
                                  <button
                                    key={slot.start}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    className={`consult-slot${selected ? ' is-selected' : ''}`}
                                    onClick={() => pickSlot(slot.start)}
                                    disabled={Boolean(holding)}
                                  >
                                    {holding === slot.start ? <LoaderCircle className="booking-spinner" size={15} aria-label="Holding" /> : formatTime(slot.start)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="booking-no-slots">No times are free on this day. Please choose another day.</p>
                      )}
                      {errors.slot && <span className="booking-field-error">{errors.slot}</span>}
                      {hold && (
                        <div className={`consult-hold${secondsLeft <= 60 ? ' is-ending' : ''}`} role="status">
                          <Clock3 size={17} aria-hidden="true" />
                          <p><strong>{formatDate(hold.start)}, {formatTime(hold.start)}</strong> is held for you for <span className="consult-hold-timer" aria-live="off">{minutes}:{seconds}</span></p>
                        </div>
                      )}
                    </fieldset>

                    <fieldset className="consult-step">
                      <legend><span>3</span> Patient details</legend>
                      <div className="booking-fields-grid consult-fields">
                        <Field id="consult-name" className="consult-full" label="Full name of the patient" value={fields.name} error={errors.name} onChange={(value) => update('name', value)} autoComplete="name" maxLength={80} />
                        <Field id="consult-phone" label="Mobile number (WhatsApp)" prefix="+91" value={fields.phone} error={errors.phone} onChange={(value) => update('phone', value)} autoComplete="tel-national" inputMode="numeric" maxLength={14} />
                        <Field id="consult-confirmPhone" label="Confirm mobile number" prefix="+91" value={fields.confirmPhone} error={errors.confirmPhone} onChange={(value) => update('confirmPhone', value)} autoComplete="off" inputMode="numeric" maxLength={14} />
                      </div>
                      <div className="booking-honeypot" aria-hidden="true">
                        <label htmlFor="consult-website">Website</label>
                        <input id="consult-website" tabIndex={-1} autoComplete="off" value={fields.website} onChange={(event) => update('website', event.target.value)} />
                      </div>
                      <div className={`booking-consent${errors.consent ? ' has-error' : ''}`}>
                        <label htmlFor="consult-consent">
                          <input id="consult-consent" type="checkbox" checked={fields.consent} onChange={(event) => update('consent', event.target.checked)} aria-describedby={errors.consent ? 'consult-consent-error' : undefined} />
                          <span className="booking-checkbox-art" aria-hidden="true"><Check size={15} strokeWidth={3} /></span>
                          <span>I agree that Sri Siri Hospital may contact this number on WhatsApp about this consultation. This is not for emergencies: for an emergency, call 112.</span>
                        </label>
                        {errors.consent && <span className="booking-field-error" id="consult-consent-error">{errors.consent}</span>}
                      </div>
                    </fieldset>

                    <button className="button button-primary booking-submit consult-whatsapp-button" type="submit" disabled={submitting}>
                      <span className="consult-whatsapp-label"><WhatsAppIcon /> {submitting ? 'Sending request…' : 'Book on WhatsApp'}</span>
                      {submitting ? <LoaderCircle className="booking-spinner" size={18} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
                    </button>
                    <p className="consult-after-note">WhatsApp opens with your request already typed. Just press send.</p>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

type FieldProps = {
  id: string; label: string; value: string; error?: string; onChange: (value: string) => void; prefix?: string; className?: string;
  autoComplete?: string; inputMode?: 'numeric' | 'text'; maxLength?: number;
};

function Field({ id, label, value, error, onChange, prefix, className = '', ...rest }: FieldProps) {
  return (
    <div className={`booking-field ${className}${value ? ' has-value' : ''}${error ? ' has-error' : ''}`}>
      {prefix && <span className="booking-phone-prefix" aria-hidden="true">{prefix}</span>}
      <input id={id} placeholder={label} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} type={prefix ? 'tel' : 'text'} {...rest} />
      <label htmlFor={id}>{label}</label>
      {error && <span className="booking-field-error" id={`${id}-error`}>{error}</span>}
    </div>
  );
}

function RequestSent({ result, onStartOver }: { result: RequestResult; onStartOver: () => void }) {
  return (
    <div className="booking-success consult-sent" role="status" aria-live="polite">
      <span className="booking-success-label">Request saved</span>
      <h2>Now send it on WhatsApp</h2>
      <p>WhatsApp should have opened with your request typed in. Press <strong>send</strong> so the hospital receives it.</p>
      <div className="consult-ref">
        <span>Your reference</span>
        <strong>{result.ref}</strong>
        <small>{formatDate(result.startsAt)}, {formatTime(result.startsAt)}</small>
      </div>
      <a className="button button-primary consult-whatsapp-button" href={result.whatsappUrl}>
        <span className="consult-whatsapp-label"><WhatsAppIcon /> Open WhatsApp again</span>
        <ArrowRight size={18} aria-hidden="true" />
      </a>
      <p className="booking-success-note">
        If WhatsApp does not open, message <strong>{result.hospitalWhatsappDisplay}</strong> with your reference <strong>{result.ref}</strong>.
        The doctor will confirm and send the Zoom link on WhatsApp.
      </p>
      <p className="booking-success-note">
        Keep this link to check your appointment: <a href={result.trackerUrl}>View my appointment</a>
      </p>
      <button className="booking-reset" type="button" onClick={onStartOver}>Book for someone else</button>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="whatsapp-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5 5.1-1.3A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3 .8.8-2.95-.2-.31a8.2 8.2 0 1 1 6.9 3.8Zm4.5-6.15c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.55.12-.17.25-.64.8-.78.97-.14.16-.29.18-.53.06a6.7 6.7 0 0 1-3.37-2.94c-.25-.44.25-.41.72-1.36.08-.16.04-.3-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.3 2.74 2.74 0 0 0-.86 2.04 4.76 4.76 0 0 0 1 2.53c.12.16 1.7 2.6 4.12 3.64 1.53.66 2.13.72 2.9.6.46-.07 1.46-.6 1.67-1.18.2-.58.2-1.08.14-1.18-.06-.1-.22-.17-.47-.29Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// /a/:token  (appointment tracker)
// ---------------------------------------------------------------------------

type Track = {
  ref: string; name: string; doctor: string; startsAt: string; endsAt: string; date: string; time: string; status: string; statusLabel: string;
  rejectReason: string | null; joinUrl: string | null; passcode: string | null; feedbackUrl: string | null;
  hospitalWhatsapp: string; hospitalWhatsappDisplay: string;
};

export function TrackPage({ token }: { token: string }) {
  const [data, setData] = useState<Track | null>(null);
  const [error, setError] = useState('');
  const now = useNow(30_000);

  const load = useCallback(() => {
    api<Track>(`track?t=${encodeURIComponent(token)}`).then((value) => { setData(value); setError(''); }).catch((reason: Error) => setError(reason.message));
  }, [token]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const minutesToStart = data ? Math.round((Date.parse(data.startsAt) - now) / 60_000) : 0;
  const askUrl = data?.hospitalWhatsapp ? `https://wa.me/${data.hospitalWhatsapp}?text=${encodeURIComponent(`Question about my consultation | Ref ${data.ref}`)}` : '';

  return (
    <main className="consult-page consult-narrow" id="main">
      <div className="consult-container">
        <a className="info-back-link" href="/"><ArrowLeft size={17} aria-hidden="true" /> Sri Siri Hospital</a>
        <div className="consult-heading">
          <span className="eyebrow">Your appointment</span>
          <h1>Video <em>consultation</em></h1>
        </div>
        {error && !data ? (
          <div className="consult-panel"><p>{error}</p><p>If you need help, please call the hospital on <a href="tel:+918819224466">88192 24466</a>.</p></div>
        ) : !data ? (
          <div className="consult-panel" aria-busy="true"><LoaderCircle className="booking-spinner" size={22} aria-label="Loading" /></div>
        ) : (
          <div className="consult-panel">
            <div className="consult-track-top">
              <span className={`consult-status status-${data.status}`}>{data.statusLabel}</span>
              <span className="consult-track-ref">Ref {data.ref}</span>
            </div>
            <h2>{data.date}, {data.time}</h2>
            <p className="consult-track-who">{data.name} with {data.doctor}</p>

            {data.status === 'requested' && (
              <div className="consult-track-note">
                <p>Your request is with the hospital. When {data.doctor} confirms it, you will get the Zoom link on WhatsApp{data.hospitalWhatsappDisplay ? ` from ${data.hospitalWhatsappDisplay}` : ''}.</p>
                <p>Did not send the WhatsApp message yet? Send your reference <strong>{data.ref}</strong> to the hospital.</p>
              </div>
            )}
            {data.status === 'scheduled' && data.joinUrl && (
              <div className="consult-track-note">
                <p>{minutesToStart > 15 ? 'Please join a few minutes before your time. The doctor will let you in from the waiting room.' : 'You can join now. The doctor will let you in from the waiting room.'}</p>
                <a className="button button-primary consult-join" href={data.joinUrl} target="_blank" rel="noreferrer"><Video size={18} aria-hidden="true" /> Join on Zoom</a>
                {data.passcode && <p className="consult-passcode">Meeting passcode: <strong>{data.passcode}</strong></p>}
              </div>
            )}
            {(data.status === 'rejected' || data.status === 'cancelled') && (
              <div className="consult-track-note">
                {data.rejectReason && <p>Reason: {data.rejectReason}</p>}
                <a className="button button-primary" href="/consult">Choose another time <ArrowRight size={17} aria-hidden="true" /></a>
              </div>
            )}
            {data.status === 'expired' && (
              <div className="consult-track-note">
                <p>This request was not confirmed in time. Please choose another time.</p>
                <a className="button button-primary" href="/consult">Choose another time <ArrowRight size={17} aria-hidden="true" /></a>
              </div>
            )}
            {data.feedbackUrl && (
              <div className="consult-track-note">
                <p>How was your consultation?</p>
                <a className="button button-outline" href={data.feedbackUrl}><Star size={17} aria-hidden="true" /> Share feedback</a>
              </div>
            )}
            {data.status === 'feedback_received' && <p className="consult-track-note">Thank you for your feedback.</p>}
            {askUrl && (
              <p className="consult-track-help">
                Questions? <a href={askUrl} target="_blank" rel="noreferrer">Message the hospital on WhatsApp</a> ({data.hospitalWhatsappDisplay}) or call <a href="tel:+918819224466">88192 24466</a>.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// /f/:token  (feedback)
// ---------------------------------------------------------------------------

type FeedbackInfo = { ref: string; name: string; doctor: string; date: string; alreadySent: boolean; open: boolean; notYet: boolean };

export function FeedbackPage({ token }: { token: string }) {
  const [info, setInfo] = useState<FeedbackInfo | null>(null);
  const [error, setError] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [allowPublic, setAllowPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    api<FeedbackInfo>(`feedback?t=${encodeURIComponent(token)}`).then(setInfo).catch((reason: Error) => setError(reason.message));
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!rating) {
      setFormError('Please choose a rating.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await api('feedback', { method: 'POST', body: { token, rating, comment, allowPublic } });
      setDone(true);
    } catch (reason) {
      setFormError((reason as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const labels = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

  return (
    <main className="consult-page consult-narrow" id="main">
      <div className="consult-container">
        <a className="info-back-link" href="/"><ArrowLeft size={17} aria-hidden="true" /> Sri Siri Hospital</a>
        <div className="consult-heading">
          <span className="eyebrow">Feedback</span>
          <h1>How was your <em>consultation?</em></h1>
        </div>
        <div className="consult-panel">
          {error ? (
            <p>{error}</p>
          ) : !info ? (
            <LoaderCircle className="booking-spinner" size={22} aria-label="Loading" />
          ) : done || info.alreadySent ? (
            <div className="booking-success" role="status">
              <span className="booking-success-label">Thank you</span>
              <h2>We have your feedback</h2>
              <p>It helps {info.doctor} and the hospital team. Get well soon.</p>
              <a className="booking-reset" href="/">Back to the website</a>
            </div>
          ) : info.notYet ? (
            <p>Feedback opens after your consultation on {info.date}.</p>
          ) : !info.open ? (
            <p>Feedback is not open for this consultation.</p>
          ) : (
            <form className="booking-form" onSubmit={submit} noValidate>
              <p className="consult-track-who">{info.name} with {info.doctor}, {info.date} (Ref {info.ref})</p>
              <fieldset className="consult-stars">
                <legend>Your rating</legend>
                <div role="radiogroup" aria-label="Rating from 1 to 5">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} of 5, ${labels[value]}`} className={value <= rating ? 'is-on' : ''} onClick={() => { setRating(value); setFormError(''); }}>
                      <Star size={30} aria-hidden="true" />
                    </button>
                  ))}
                  <span className="consult-star-label" aria-hidden="true">{labels[rating]}</span>
                </div>
              </fieldset>
              <div className={`booking-field booking-reason-field${comment ? ' has-value' : ''}`}>
                <textarea id="feedback-comment" placeholder="Anything you would like to tell us (optional)" value={comment} maxLength={1000} onChange={(event) => setComment(event.target.value)} />
                <label htmlFor="feedback-comment">Anything you would like to tell us (optional)</label>
                <span className="booking-field-hint"><span>Please do not include medical details.</span><i>{comment.length}/1000</i></span>
              </div>
              <div className="booking-consent">
                <label htmlFor="feedback-public">
                  <input id="feedback-public" type="checkbox" checked={allowPublic} onChange={(event) => setAllowPublic(event.target.checked)} />
                  <span className="booking-checkbox-art" aria-hidden="true"><Check size={15} strokeWidth={3} /></span>
                  <span>The hospital may show my comment on its website, with my first name only.</span>
                </label>
              </div>
              {formError && <div className="booking-server-error" role="alert"><span aria-hidden="true">!</span><p>{formError}</p></div>}
              <button className="button button-primary booking-submit" type="submit" disabled={submitting}>
                <span>{submitting ? 'Sending…' : 'Send feedback'}</span>
                {submitting ? <LoaderCircle className="booking-spinner" size={18} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

