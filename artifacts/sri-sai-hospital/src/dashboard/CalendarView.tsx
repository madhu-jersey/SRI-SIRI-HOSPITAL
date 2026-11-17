import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban, CalendarClock, CalendarPlus, CalendarX2, ChevronLeft, ChevronRight, Clock3, History, LoaderCircle, Lock, LockOpen, Plus, Trash2, UserPlus,
} from 'lucide-react';
import { formatDate, formatTime, normalizeIndianMobile } from '../../shared/messages.mjs';
import { ApiError, api, type SlotDay } from '../consult/api';
import { type AuthMode, staffApi } from './session';
import { type Consultation, type Message, Modal } from './ui';

// ---------------------------------------------------------------------------
// Types and date helpers (all dates are India dates, "YYYY-MM-DD")
// ---------------------------------------------------------------------------

export type Rule = { weekday: number; start_minute: number; end_minute: number; slot_minutes: number };
export type TimeOff = { id: string; starts_at: string; ends_at: string; reason: string };
type CalendarSlot = { start: string; end: string; state: 'free' | 'booked' | 'blocked' | 'past'; consultationId?: string; timeOffId?: string };
type CalendarDay = { date: string; weekday: number; open: boolean; slots: CalendarSlot[]; consultationIds: string[]; timeOffIds: string[] };
type CalendarData = { from: string; lastBookable: string; days: CalendarDay[]; rules: Rule[]; timeOff: TimeOff[]; consultations: Consultation[] };
export type ActionResult = { consultation: Consultation; message: Message };

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const SLOT_LENGTHS = [10, 15, 20, 30, 45, 60];

export const istDayKey = (time: number | string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
const keyDate = (key: string) => new Date(`${key}T12:00:00Z`);
const addDays = (key: string, days: number) => new Date(keyDate(key).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const monthTitle = (month: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(keyDate(`${month}-01`));
const shiftMonth = (month: string, by: number) => {
  const [year, value] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, value - 1 + by, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};
const toMinutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const toClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const istIso = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`).toISOString();
const rangeLabel = (item: TimeOff) => {
  const sameDay = istDayKey(item.starts_at) === istDayKey(item.ends_at) || Date.parse(item.ends_at) - Date.parse(item.starts_at) <= 86_400_000 && istDayKey(Date.parse(item.ends_at) - 1) === istDayKey(item.starts_at);
  const wholeDays = formatTime(item.starts_at) === '12:00 AM' && formatTime(item.ends_at) === '12:00 AM';
  if (wholeDays) {
    const last = Date.parse(item.ends_at) - 1;
    return sameDay ? `${formatDate(item.starts_at)}, all day` : `${formatDate(item.starts_at)} – ${formatDate(new Date(last).toISOString())}, all day`;
  }
  return sameDay ? `${formatDate(item.starts_at)}, ${formatTime(item.starts_at)} – ${formatTime(item.ends_at)}` : `${formatDate(item.starts_at)}, ${formatTime(item.starts_at)} – ${formatDate(item.ends_at)}, ${formatTime(item.ends_at)}`;
};

// ---------------------------------------------------------------------------
// Calendar view
// ---------------------------------------------------------------------------

export function CalendarView({ mode, now, refreshKey, onChanged, onReschedule, onCancel, onHistory, onHours, onTimeOff, onNewBooking, onError, toast, onAffected }: {
  mode: AuthMode; now: number; refreshKey: number; onChanged: () => void; onAffected: (items: Consultation[]) => void;
  onReschedule: (item: Consultation) => void; onCancel: (item: Consultation) => void; onHistory: (item: Consultation) => void;
  onHours: (rules: Rule[]) => void; onTimeOff: (draft: TimeOffDraft) => void; onNewBooking: () => void;
  onError: (reason: unknown) => void; toast: (text: string) => void;
}) {
  const todayKey = istDayKey(now);
  const [month, setMonth] = useState(todayKey.slice(0, 7));
  const [selected, setSelected] = useState(todayKey);
  const [data, setData] = useState<CalendarData | null>(null);
  const [busySlot, setBusySlot] = useState('');

  const gridStart = useMemo(() => {
    const first = `${month}-01`;
    const weekday = keyDate(first).getUTCDay();
    return addDays(first, -((weekday + 6) % 7));
  }, [month]);

  const load = useCallback(async () => {
    try {
      setData(await staffApi<CalendarData>(mode, `calendar?from=${gridStart}&days=42`));
    } catch (reason) {
      onError(reason);
    }
  }, [mode, gridStart, onError]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const byId = useMemo(() => new Map((data?.consultations ?? []).map((item) => [item.id, item])), [data]);
  const timeOffById = useMemo(() => new Map((data?.timeOff ?? []).map((item) => [item.id, item])), [data]);
  const day = data?.days.find((item) => item.date === selected);

  async function blockSlot(slot: CalendarSlot) {
    setBusySlot(slot.start);
    try {
      await staffApi(mode, 'time-off', { method: 'POST', body: { start: slot.start, end: slot.end, reason: 'Blocked by the doctor' } });
      toast(`${formatTime(slot.start)} blocked`);
      await load();
      onChanged();
    } catch (reason) {
      onError(reason);
    } finally {
      setBusySlot('');
    }
  }

  async function setDayOpen(date: string, open: boolean) {
    setBusySlot(`day:${date}`);
    try {
      const result = await staffApi<{ affected: Consultation[] }>(mode, 'days/set', { method: 'POST', body: { date, open } });
      toast(open ? `Bookings allowed again for ${formatDate(`${date}T12:00:00+05:30`)}.` : `Bookings stopped for ${formatDate(`${date}T12:00:00+05:30`)}.`);
      await load();
      onChanged();
      if (result.affected.length) onAffected(result.affected);
    } catch (reason) {
      onError(reason);
    } finally {
      setBusySlot('');
    }
  }

  async function removeTimeOff(item: TimeOff) {
    setBusySlot(item.id);
    try {
      await staffApi(mode, 'time-off/remove', { method: 'POST', body: { id: item.id } });
      toast('Time off removed. Those times are open for booking again.');
      await load();
      onChanged();
    } catch (reason) {
      onError(reason);
    } finally {
      setBusySlot('');
    }
  }

  const monthTimeOff = (data?.timeOff ?? []).filter((item) => Date.parse(item.ends_at) > now);
  const strays = day ? day.consultationIds.map((id) => byId.get(id)).filter((item): item is Consultation => Boolean(item) && !day.slots.some((slot) => slot.consultationId === item!.id)) : [];

  return (
    <div className="dash-cal">
      <div className="dash-cal-toolbar">
        <div className="dash-cal-month">
          <button className="dash-icon-button" type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft size={18} aria-hidden="true" /></button>
          <h2>{monthTitle(month)}</h2>
          <button className="dash-icon-button" type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"><ChevronRight size={18} aria-hidden="true" /></button>
          <button className="dash-button" type="button" onClick={() => { setMonth(todayKey.slice(0, 7)); setSelected(todayKey); }}>Today</button>
        </div>
        <div className="dash-cal-actions">
          <button className="dash-button" type="button" onClick={() => onHours(data?.rules ?? [])} disabled={!data}><Clock3 size={17} aria-hidden="true" /> Clinic hours</button>
          <button className="dash-button" type="button" onClick={() => onTimeOff({ from: selected >= todayKey ? selected : todayKey, to: selected >= todayKey ? selected : todayKey, allDay: true })}><Ban size={17} aria-hidden="true" /> Add time off</button>
          <button className="dash-button dash-primary" type="button" onClick={onNewBooking}><UserPlus size={17} aria-hidden="true" /> New booking</button>
        </div>
      </div>

      <div className="dash-cal-layout">
        <section className="dash-panel dash-cal-grid-panel" aria-label={`Calendar for ${monthTitle(month)}`}>
          <div className="dash-cal-weekdays" aria-hidden="true">{WEEK_ORDER.map((weekday) => <span key={weekday}>{WEEKDAYS[weekday].slice(0, 3)}</span>)}</div>
          {!data ? (
            <div className="dash-cal-loading"><LoaderCircle className="dash-spin" size={24} aria-label="Loading calendar" /></div>
          ) : (
            <div className="dash-cal-grid" role="grid">
              {data.days.map((cell) => {
                const booked = cell.slots.filter((slot) => slot.state === 'booked').length + cell.consultationIds.filter((id) => !cell.slots.some((slot) => slot.consultationId === id) && ['requested', 'scheduled'].includes(byId.get(id)?.status ?? '')).length;
                const free = cell.slots.filter((slot) => slot.state === 'free').length;
                const blocked = cell.slots.length > 0 && cell.slots.every((slot) => slot.state === 'blocked' || slot.state === 'past') && cell.timeOffIds.length > 0;
                const inMonth = cell.date.startsWith(month);
                const past = cell.date < todayKey;
                const later = cell.date > data.lastBookable;
                return (
                  <button
                    key={cell.date}
                    type="button"
                    role="gridcell"
                    aria-selected={selected === cell.date}
                    aria-label={`${formatDate(`${cell.date}T12:00:00+05:30`)}: ${!cell.open ? 'closed' : `${booked} booked, ${free} free`}${cell.timeOffIds.length ? ', time off' : ''}`}
                    className={`dash-cal-cell${inMonth ? '' : ' is-outside'}${past ? ' is-past' : ''}${cell.date === todayKey ? ' is-today' : ''}${selected === cell.date ? ' is-selected' : ''}${blocked ? ' is-blocked' : ''}`}
                    onClick={() => { setSelected(cell.date); if (!inMonth) setMonth(cell.date.slice(0, 7)); }}
                  >
                    <span className="dash-cal-num">{Number(cell.date.slice(8))}</span>
                    {!cell.open ? <span className="dash-cal-tag is-closed">Closed</span> : blocked ? <span className="dash-cal-tag is-off">Time off</span> : (
                      <span className="dash-cal-counts">
                        {booked > 0 && <span className="dash-cal-tag is-booked">{booked} booked</span>}
                        {!past && free > 0 && (later ? <span className="dash-cal-tag is-later">Opens later</span> : <span className="dash-cal-tag is-free">{free} free</span>)}
                        {cell.timeOffIds.length > 0 && <span className="dash-cal-dot" title="Some time blocked" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className="dash-cal-legend" aria-hidden="true">
            <span><i className="is-booked" /> Booked</span><span><i className="is-free" /> Free</span><span><i className="is-off" /> Time off</span><span><i className="is-closed" /> Closed</span>
          </div>
        </section>

        <section className="dash-panel dash-cal-day" aria-labelledby="dash-cal-day-title">
          <div className="dash-panel-head">
            <div>
              <h2 id="dash-cal-day-title">{formatDate(`${selected}T12:00:00+05:30`)}</h2>
              <p>{!day ? 'Loading…' : !day.open ? 'The clinic is closed on this day.' : `${day.slots.filter((slot) => slot.state === 'free').length} free of ${day.slots.length} times${data && selected > data.lastBookable ? ' · patients can book this from ' + formatDate(`${addDays(selected, -6)}T12:00:00+05:30`) : ''}`}</p>
            </div>
            {day?.open && selected >= todayKey && (day.timeOffIds.length > 0 && !day.slots.some((slot) => slot.state === 'free') ? (
              <button className="dash-button" type="button" onClick={() => setDayOpen(selected, true)} disabled={busySlot === `day:${selected}`}><LockOpen size={16} aria-hidden="true" /> Allow bookings</button>
            ) : (
              <button className="dash-button dash-danger-outline" type="button" onClick={() => setDayOpen(selected, false)} disabled={busySlot === `day:${selected}`}><Lock size={16} aria-hidden="true" /> Stop bookings</button>
            ))}
          </div>
          {day && (
            <ul className="dash-slots">
              {day.slots.map((slot) => {
                const booking = slot.consultationId ? byId.get(slot.consultationId) : undefined;
                const off = slot.timeOffId ? timeOffById.get(slot.timeOffId) : undefined;
                return (
                  <li key={slot.start} className={`dash-slot is-${slot.state}`}>
                    <span className="dash-slot-time">{formatTime(slot.start)}</span>
                    {booking ? (
                      <>
                        <span className="dash-slot-main">
                          <strong>{booking.patient_name}</strong>
                          <small>{booking.status === 'requested' ? 'Waiting for your answer' : 'Confirmed'} · {booking.ref_code}</small>
                        </span>
                        <span className="dash-slot-actions">
                          <button className="dash-icon-button" type="button" onClick={() => onReschedule(booking)} aria-label={`Reschedule ${booking.patient_name}`} title="Reschedule"><CalendarClock size={17} aria-hidden="true" /></button>
                          <button className="dash-icon-button is-danger" type="button" onClick={() => onCancel(booking)} aria-label={`Cancel ${booking.patient_name}`} title="Cancel"><CalendarX2 size={17} aria-hidden="true" /></button>
                          <button className="dash-icon-button" type="button" onClick={() => onHistory(booking)} aria-label={`Timeline for ${booking.ref_code}`} title="Timeline"><History size={17} aria-hidden="true" /></button>
                        </span>
                      </>
                    ) : slot.state === 'blocked' ? (
                      <>
                        <span className="dash-slot-main"><strong>Time off</strong><small>{off?.reason || 'Blocked'}{off ? ` · ${rangeLabel(off)}` : ''}</small></span>
                        {off && Date.parse(off.ends_at) > now && (
                          <span className="dash-slot-actions">
                            <button className="dash-button" type="button" onClick={() => removeTimeOff(off)} disabled={busySlot === off.id}><LockOpen size={16} aria-hidden="true" /> Unblock</button>
                          </span>
                        )}
                      </>
                    ) : slot.state === 'past' ? (
                      <span className="dash-slot-main"><small>Past</small></span>
                    ) : (
                      <>
                        <span className="dash-slot-main"><small>Free</small></span>
                        <span className="dash-slot-actions">
                          <button className="dash-button" type="button" onClick={() => blockSlot(slot)} disabled={busySlot === slot.start}>
                            {busySlot === slot.start ? <LoaderCircle className="dash-spin" size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />} Block
                          </button>
                        </span>
                      </>
                    )}
                  </li>
                );
              })}
              {strays.map((booking) => (
                <li key={booking.id} className={`dash-slot is-${['requested', 'scheduled'].includes(booking.status) ? 'booked' : 'past'}`}>
                  <span className="dash-slot-time">{formatTime(booking.starts_at)}</span>
                  <span className="dash-slot-main"><strong>{booking.patient_name}</strong><small>{booking.status_label} · {booking.ref_code}{['requested', 'scheduled'].includes(booking.status) ? ' · outside clinic hours' : ''}</small></span>
                  <span className="dash-slot-actions">
                    {['requested', 'scheduled'].includes(booking.status) && <button className="dash-icon-button" type="button" onClick={() => onReschedule(booking)} aria-label={`Reschedule ${booking.patient_name}`} title="Reschedule"><CalendarClock size={17} aria-hidden="true" /></button>}
                    <button className="dash-icon-button" type="button" onClick={() => onHistory(booking)} aria-label={`Timeline for ${booking.ref_code}`} title="Timeline"><History size={17} aria-hidden="true" /></button>
                  </span>
                </li>
              ))}
              {!day.slots.length && !strays.length && <li className="dash-slot is-past"><span className="dash-slot-main"><small>No clinic times on this day. Change this in Clinic hours.</small></span></li>}
            </ul>
          )}
        </section>
      </div>

      <section className="dash-panel" aria-labelledby="dash-timeoff-title">
        <div className="dash-panel-head">
          <div>
            <h2 id="dash-timeoff-title">Upcoming time off</h2>
            <p>Patients can’t book these times. Existing bookings are not moved automatically.</p>
          </div>
        </div>
        {monthTimeOff.length ? (
          <ul className="dash-table">
            {monthTimeOff.map((item) => (
              <li className="dash-tr dash-tr-simple" key={item.id}>
                <div className="dash-td-patient">
                  <span className="dash-avatar is-muted" aria-hidden="true"><Lock size={15} /></span>
                  <span><strong>{rangeLabel(item)}</strong><small>{item.reason || 'Blocked'}</small></span>
                </div>
                <div className="dash-td-actions">
                  <button className="dash-button" type="button" onClick={() => removeTimeOff(item)} disabled={busySlot === item.id}><Trash2 size={16} aria-hidden="true" /> Remove</button>
                </div>
              </li>
            ))}
          </ul>
        ) : <div className="dash-empty"><span aria-hidden="true"><CalendarPlus size={22} /></span><p>No time off in this view. Use “Add time off” for leave, surgery or holidays.</p></div>}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clinic hours
// ---------------------------------------------------------------------------

type Session = { start: string; end: string; slot: number };

export function ClinicHoursDialog({ mode, rules, onSaved, onClose }: { mode: AuthMode; rules: Rule[]; onSaved: () => void; onClose: () => void }) {
  const [week, setWeek] = useState<Record<number, Session[]>>(() => {
    const initial: Record<number, Session[]> = {};
    for (const weekday of WEEK_ORDER) {
      initial[weekday] = rules.filter((rule) => rule.weekday === weekday).sort((a, b) => a.start_minute - b.start_minute)
        .map((rule) => ({ start: toClock(rule.start_minute), end: toClock(rule.end_minute), slot: rule.slot_minutes }));
    }
    return initial;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const update = (weekday: number, index: number, patch: Partial<Session>) => setWeek((current) => ({ ...current, [weekday]: current[weekday].map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
  const add = (weekday: number) => setWeek((current) => ({ ...current, [weekday]: [...current[weekday], current[weekday].length ? { start: '09:30', end: '14:00', slot: 30 } : { start: '17:30', end: '20:30', slot: 30 }] }));
  const remove = (weekday: number, index: number) => setWeek((current) => ({ ...current, [weekday]: current[weekday].filter((_, i) => i !== index) }));
  const copyToAll = (weekday: number) => setWeek((current) => Object.fromEntries(WEEK_ORDER.map((day) => [day, day === 0 ? current[0] : current[weekday].map((item) => ({ ...item }))])) as Record<number, Session[]>);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const body = WEEK_ORDER.flatMap((weekday) => week[weekday].map((item) => ({ weekday, start_minute: toMinutes(item.start), end_minute: toMinutes(item.end), slot_minutes: item.slot })));
    try {
      await staffApi(mode, 'hours', { method: 'PUT', body: { rules: body } });
      onSaved();
      onClose();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Clinic hours for video consultations" onClose={onClose} wide>
      <form onSubmit={save}>
        <p className="dash-dialog-lead">Patients can book only inside these hours. Changes apply to new bookings straight away; existing bookings stay as they are.</p>
        <div className="dash-hours">
          {WEEK_ORDER.map((weekday) => (
            <div className={`dash-hours-row${week[weekday].length ? '' : ' is-closed'}`} key={weekday}>
              <div className="dash-hours-day">
                <strong>{WEEKDAYS[weekday]}</strong>
                <small>{week[weekday].length ? `${week[weekday].length} session${week[weekday].length > 1 ? 's' : ''}` : 'Closed'}</small>
              </div>
              <div className="dash-hours-sessions">
                {week[weekday].map((item, index) => (
                  <div className="dash-hours-session" key={index}>
                    <label><span className="dash-sr">Start</span><input className="dash-input" type="time" step={300} value={item.start} onChange={(event) => update(weekday, index, { start: event.target.value })} required /></label>
                    <span aria-hidden="true">to</span>
                    <label><span className="dash-sr">End</span><input className="dash-input" type="time" step={300} value={item.end} onChange={(event) => update(weekday, index, { end: event.target.value })} required /></label>
                    <label className="dash-hours-length">
                      <span className="dash-sr">Length of each consultation</span>
                      <select className="dash-input" value={item.slot} onChange={(event) => update(weekday, index, { slot: Number(event.target.value) })}>
                        {SLOT_LENGTHS.map((minutes) => <option key={minutes} value={minutes}>{minutes} min each</option>)}
                      </select>
                    </label>
                    <span className="dash-hours-count">{toMinutes(item.end) > toMinutes(item.start) ? `${Math.floor((toMinutes(item.end) - toMinutes(item.start)) / item.slot)} slots` : 'End must be later'}</span>
                    <button className="dash-icon-button" type="button" onClick={() => remove(weekday, index)} aria-label={`Remove this ${WEEKDAYS[weekday]} session`}><Trash2 size={16} aria-hidden="true" /></button>
                  </div>
                ))}
                <div className="dash-hours-tools">
                  <button className="dash-link-button" type="button" onClick={() => add(weekday)}><Plus size={14} aria-hidden="true" /> {week[weekday].length ? 'Add another session' : 'Open this day'}</button>
                  {week[weekday].length > 0 && weekday !== 0 && <button className="dash-link-button" type="button" onClick={() => copyToAll(weekday)}>Copy to Mon–Sat</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
        {error && <p className="dash-error" role="alert">{error}</p>}
        <div className="dash-dialog-actions">
          <button className="dash-button dash-primary" type="submit" disabled={busy}>{busy && <LoaderCircle className="dash-spin" size={17} aria-hidden="true" />} Save clinic hours</button>
          <button className="dash-button" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Time off
// ---------------------------------------------------------------------------

export type TimeOffDraft = { from: string; to: string; allDay: boolean };

export function TimeOffDialog({ mode, draft, onSaved, onReschedule, onCancel, onClose }: {
  mode: AuthMode; draft: TimeOffDraft; onSaved: () => void; onReschedule: (item: Consultation) => void; onCancel: (item: Consultation) => void; onClose: () => void;
}) {
  const [from, setFrom] = useState(draft.from);
  const [to, setTo] = useState(draft.to);
  const [allDay, setAllDay] = useState(draft.allDay);
  const [startTime, setStartTime] = useState('17:30');
  const [endTime, setEndTime] = useState('20:30');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [affected, setAffected] = useState<Consultation[] | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    const start = allDay ? istIso(from, '00:00') : istIso(from, startTime);
    const end = allDay ? istIso(addDays(to < from ? from : to, 1), '00:00') : istIso(to < from ? from : to, endTime);
    setBusy(true);
    setError('');
    try {
      const result = await staffApi<{ affected: Consultation[] }>(mode, 'time-off', { method: 'POST', body: { start, end, reason } });
      onSaved();
      if (result.affected.length) setAffected(result.affected);
      else onClose();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (affected) return <AffectedDialog title="Time off added" items={affected} onReschedule={onReschedule} onCancel={onCancel} onClose={onClose} />;

  return (
    <Modal title="Add time off" onClose={onClose}>
      <form onSubmit={save}>
        <p className="dash-dialog-lead">Block dates or hours for leave, surgery or a holiday. Patients won’t be able to book them.</p>
        <label className="dash-check">
          <input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} /> Whole day(s)
        </label>
        <div className="dash-form-grid">
          <label><span className="dash-label">From</span><input className="dash-input" type="date" value={from} onChange={(event) => { setFrom(event.target.value); if (to < event.target.value) setTo(event.target.value); }} required /></label>
          {!allDay && <label><span className="dash-label">From time</span><input className="dash-input" type="time" step={300} value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label>}
          <label><span className="dash-label">To</span><input className="dash-input" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} required /></label>
          {!allDay && <label><span className="dash-label">To time</span><input className="dash-input" type="time" step={300} value={endTime} onChange={(event) => setEndTime(event.target.value)} required /></label>}
        </div>
        <label><span className="dash-label">Reason (for your team; patients don’t see it)</span><input className="dash-input" value={reason} maxLength={200} placeholder="e.g. Leave, conference, surgery" onChange={(event) => setReason(event.target.value)} /></label>
        {error && <p className="dash-error" role="alert">{error}</p>}
        <div className="dash-dialog-actions">
          <button className="dash-button dash-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="dash-spin" size={17} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />} Block this time</button>
          <button className="dash-button" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

// Bookings already on dates the doctor has just closed. Nothing is moved
// silently: each patient is moved or cancelled, with a WhatsApp message.
export function AffectedDialog({ title, items, onReschedule, onCancel, onClose }: {
  title: string; items: Consultation[]; onReschedule: (item: Consultation) => void; onCancel: (item: Consultation) => void; onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="dash-dialog-lead">Patients can no longer book this time. {items.length === 1 ? 'This patient is' : 'These patients are'} already booked in it. Move or cancel each one so the patient is told:</p>
      <ul className="dash-affected">
        {items.map((item) => (
          <li key={item.id}>
            <span><strong>{item.patient_name}</strong><small>{formatDate(item.starts_at)}, {formatTime(item.starts_at)} · {item.ref_code}</small></span>
            <span className="dash-slot-actions">
              <button className="dash-button" type="button" onClick={() => onReschedule(item)}><CalendarClock size={16} aria-hidden="true" /> Reschedule</button>
              <button className="dash-button dash-danger-outline" type="button" onClick={() => onCancel(item)}><CalendarX2 size={16} aria-hidden="true" /> Cancel</button>
            </span>
          </li>
        ))}
      </ul>
      <div className="dash-dialog-actions"><button className="dash-button" type="button" onClick={onClose}>Done</button></div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Next 7 days: one switch per date to stop or allow patient bookings
// ---------------------------------------------------------------------------

export function BookingWeek({ mode, now, refreshKey, onChanged, onAffected, onError, toast }: {
  mode: AuthMode; now: number; refreshKey: number; onChanged: () => void; onAffected: (items: Consultation[]) => void;
  onError: (reason: unknown) => void; toast: (text: string) => void;
}) {
  const todayKey = istDayKey(now);
  const [data, setData] = useState<CalendarData | null>(null);
  const [busy, setBusy] = useState('');
  // The switch moves at once; the server's answer then confirms or undoes it.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const load = useCallback(async () => {
    try {
      setData(await staffApi<CalendarData>(mode, `calendar?from=${todayKey}&days=7`));
    } catch (reason) {
      onError(reason);
    }
  }, [mode, todayKey, onError]);
  useEffect(() => { load(); }, [load, refreshKey]);

  async function toggle(day: CalendarDay, open: boolean) {
    setBusy(day.date);
    setPending((current) => ({ ...current, [day.date]: open }));
    try {
      const result = await staffApi<{ affected: Consultation[] }>(mode, 'days/set', { method: 'POST', body: { date: day.date, open } });
      toast(open ? `Bookings open again for ${formatDate(`${day.date}T12:00:00+05:30`)}.` : `Bookings stopped for ${formatDate(`${day.date}T12:00:00+05:30`)}.`);
      await load();
      onChanged();
      if (result.affected.length) onAffected(result.affected);
    } catch (reason) {
      onError(reason);
    } finally {
      setBusy('');
      setPending((current) => { const next = { ...current }; delete next[day.date]; return next; });
    }
  }

  return (
    <section className="dash-panel" aria-labelledby="dash-week-title">
      <div className="dash-panel-head">
        <div>
          <h2 id="dash-week-title">Next 7 days</h2>
          <p>Patients can book only these dates. Turn a date off to stop new bookings for it straight away.</p>
        </div>
      </div>
      {!data ? <div className="dash-empty"><LoaderCircle className="dash-spin" size={20} aria-label="Loading" /></div> : (
        <ul className="dash-week">
          {data.days.map((day) => {
            const stopped = day.date in pending ? !pending[day.date] : day.open && day.timeOffIds.length > 0 && !day.slots.some((slot) => slot.state === 'free');
            const fullyPast = day.open && day.slots.length > 0 && day.slots.every((slot) => slot.state === 'past');
            const booked = day.slots.filter((slot) => slot.state === 'booked').length;
            const free = day.slots.filter((slot) => slot.state === 'free').length;
            const label = formatDate(`${day.date}T12:00:00+05:30`);
            const status = !day.open ? 'Clinic closed' : stopped ? 'Bookings stopped' : fullyPast ? 'Over for today' : free ? `${free} free` : 'Fully booked';
            const canToggle = day.open && !fullyPast;
            return (
              <li key={day.date} className={`dash-week-day${!day.open ? ' is-closed' : stopped ? ' is-stopped' : ''}`}>
                <span className="dash-week-date">
                  <small>{day.date === todayKey ? 'Today' : label.slice(0, 3)}</small>
                  <strong>{Number(day.date.slice(8))}</strong>
                  <small>{label.slice(-8, -5)}</small>
                </span>
                <span className="dash-week-info">
                  <strong>{status}</strong>
                  {booked > 0 && <small>{booked} booked</small>}
                </span>
                {canToggle ? (
                  <label className="dash-switch" title={stopped ? 'Bookings are stopped' : 'Taking bookings'}>
                    <input type="checkbox" role="switch" checked={!stopped} disabled={busy === day.date} onChange={(event) => toggle(day, event.target.checked)} aria-label={`Taking bookings on ${label}`} />
                    <span aria-hidden="true" />
                  </label>
                ) : <span className="dash-week-off" aria-hidden="true">—</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Slot picker (free times only, same list patients see)
// ---------------------------------------------------------------------------

function SlotPicker({ value, onChange }: { value: string; onChange: (start: string) => void }) {
  const [days, setDays] = useState<SlotDay[] | null>(null);
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ days: SlotDay[] }>('slots')
      .then((result) => { setDays(result.days); setDate(result.days.find((day) => day.slots.length)?.date ?? ''); })
      .catch((reason: Error) => setError(reason.message));
  }, []);
  if (error) return <p className="dash-error">{error}</p>;
  if (!days) return <LoaderCircle className="dash-spin" size={20} aria-label="Loading free times" />;
  const current = days.find((day) => day.date === date);
  return (
    <div className="dash-picker">
      <div className="dash-picker-days" role="radiogroup" aria-label="Day">
        {days.map((day) => (
          <button key={day.date} type="button" role="radio" aria-checked={date === day.date} className={date === day.date ? 'is-selected' : ''} disabled={!day.slots.length} onClick={() => setDate(day.date)}>
            <small>{keyDate(day.date).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}</small>
            <strong>{Number(day.date.slice(8))}</strong>
            <small>{day.slots.length ? `${day.slots.length} free` : day.open ? 'Full' : 'Closed'}</small>
          </button>
        ))}
      </div>
      <div className="dash-picker-times" role="radiogroup" aria-label="Time">
        {current?.slots.map((slot) => (
          <button key={slot.start} type="button" role="radio" aria-checked={value === slot.start} className={value === slot.start ? 'is-selected' : ''} onClick={() => onChange(slot.start)}>{formatTime(slot.start)}</button>
        ))}
        {current && !current.slots.length && <p className="dash-help">No free times on this day.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reschedule, cancel, new booking
// ---------------------------------------------------------------------------

export function RescheduleDialog({ mode, consultation, onDone, onClose }: { mode: AuthMode; consultation: Consultation; onDone: (result: ActionResult) => void; onClose: () => void }) {
  const [start, setStart] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!start) { setError('Pick a new time.'); return; }
    setBusy(true);
    setError('');
    try {
      onDone(await staffApi<ActionResult>(mode, 'consultations/reschedule', { method: 'POST', body: { id: consultation.id, start, reason } }));
    } catch (reason) {
      setError((reason as Error).message);
      if ((reason as ApiError).status === 409) setStart('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Reschedule ${consultation.patient_name}`} onClose={onClose} wide>
      <form onSubmit={save}>
        <p className="dash-dialog-lead">Now: <strong>{formatDate(consultation.starts_at)}, {formatTime(consultation.starts_at)}</strong> · {consultation.ref_code}. Pick a new free time{consultation.status === 'scheduled' ? '; a new Zoom meeting is created for it' : ''}.</p>
        <SlotPicker value={start} onChange={(value) => { setStart(value); setError(''); }} />
        <label><span className="dash-label">Reason (the patient will see this)</span><input className="dash-input" value={reason} maxLength={300} placeholder="A change in the doctor’s schedule." onChange={(event) => setReason(event.target.value)} /></label>
        {error && <p className="dash-error" role="alert">{error}</p>}
        <div className="dash-dialog-actions">
          <button className="dash-button dash-primary" type="submit" disabled={busy || !start}>{busy ? <LoaderCircle className="dash-spin" size={17} aria-hidden="true" /> : <CalendarClock size={16} aria-hidden="true" />} {start ? `Move to ${formatDate(start)}, ${formatTime(start)}` : 'Move booking'}</button>
          <button className="dash-button" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

const CANCEL_REASONS = ['The doctor is on leave on this day.', 'The doctor has an emergency at the hospital.', 'Please visit the hospital in person for this problem.'];

export function CancelDialog({ mode, consultation, onDone, onClose }: { mode: AuthMode; consultation: Consultation; onDone: (result: ActionResult) => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3) { setError('Please give a short reason. The patient will see it.'); return; }
    setBusy(true);
    setError('');
    try {
      onDone(await staffApi<ActionResult>(mode, 'consultations/cancel', { method: 'POST', body: { id: consultation.id, reason } }));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Cancel ${consultation.patient_name}’s consultation?`} onClose={onClose}>
      <form onSubmit={save}>
        <p className="dash-dialog-lead">{formatDate(consultation.starts_at)}, {formatTime(consultation.starts_at)} · {consultation.ref_code}. The time becomes free again{consultation.meeting ? ' and the Zoom meeting is removed' : ''}.</p>
        <span className="dash-label">Reason (the patient will see this)</span>
        <div className="dash-quick">
          {CANCEL_REASONS.map((text) => <button key={text} type="button" className="dash-chip is-button" onClick={() => { setReason(text); setError(''); }}>{text}</button>)}
        </div>
        <textarea className="dash-textarea" rows={3} maxLength={300} value={reason} onChange={(event) => { setReason(event.target.value); setError(''); }} aria-label="Reason" aria-invalid={Boolean(error)} />
        {error && <p className="dash-error" role="alert">{error}</p>}
        <div className="dash-dialog-actions">
          <button className="dash-button dash-danger" type="submit" disabled={busy}>{busy ? <LoaderCircle className="dash-spin" size={17} aria-hidden="true" /> : <CalendarX2 size={16} aria-hidden="true" />} Cancel consultation</button>
          <button className="dash-button" type="button" onClick={onClose}>Keep it</button>
        </div>
      </form>
    </Modal>
  );
}

export function NewBookingDialog({ mode, onDone, onClose }: { mode: AuthMode; onDone: (result: ActionResult) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [start, setStart] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Enter the patient’s full name.';
    if (!normalizeIndianMobile(phone)) next.phone = 'Enter a 10-digit mobile number.';
    if (!start) next.start = 'Pick a time.';
    if (!agreed) next.agreed = 'Please confirm the patient agreed.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      onDone(await staffApi<ActionResult>(mode, 'consultations/book', { method: 'POST', body: { name, phone, start } }));
    } catch (reason) {
      setErrors({ ...(reason instanceof ApiError ? reason.fields : {}), form: (reason as Error).message });
      if ((reason as ApiError).status === 409) setStart('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New booking" onClose={onClose} wide>
      <form onSubmit={save}>
        <p className="dash-dialog-lead">For a patient who phoned or came to the desk. The booking is confirmed straight away with a Zoom meeting, and you send the confirmation on WhatsApp.</p>
        <div className="dash-form-grid">
          <label><span className="dash-label">Patient’s full name</span><input className="dash-input" value={name} maxLength={80} autoComplete="off" onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(errors.name)} />{errors.name && <span className="dash-error">{errors.name}</span>}</label>
          <label><span className="dash-label">Mobile number (WhatsApp)</span><input className="dash-input" value={phone} inputMode="tel" autoComplete="off" placeholder="98765 43210" onChange={(event) => setPhone(event.target.value)} aria-invalid={Boolean(errors.phone)} />{errors.phone && <span className="dash-error">{errors.phone}</span>}</label>
        </div>
        <span className="dash-label">Time</span>
        <SlotPicker value={start} onChange={setStart} />
        {errors.start && <p className="dash-error">{errors.start}</p>}
        <label className="dash-check">
          <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /> The patient agreed to get messages about this consultation on WhatsApp.
        </label>
        {errors.agreed && <p className="dash-error">{errors.agreed}</p>}
        {errors.form && <p className="dash-error" role="alert">{errors.form}</p>}
        <div className="dash-dialog-actions">
          <button className="dash-button dash-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="dash-spin" size={17} aria-hidden="true" /> : <UserPlus size={16} aria-hidden="true" />} {busy ? 'Creating meeting…' : 'Book and confirm'}</button>
          <button className="dash-button" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

