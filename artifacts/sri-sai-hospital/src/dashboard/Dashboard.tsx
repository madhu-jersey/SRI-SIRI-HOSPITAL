import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BellRing, CalendarClock, CalendarDays, CalendarRange, CalendarX2, Check, ChevronRight, CircleAlert, History, Inbox, LayoutDashboard, LoaderCircle, LockKeyhole, LogOut, Printer, RefreshCw, Search, Settings, Star, UserPlus, Video, Volume2, VolumeX, X,
} from 'lucide-react';
import {
  DEFAULT_TEMPLATES, TEMPLATE_FIELDS, TEMPLATE_KEYS, type TemplateKey, type Templates, formatDate, formatIndianPhone, formatTime, renderTemplate,
} from '../../shared/messages.mjs';
import { OVERDUE_AFTER_MINUTES, REMINDER_KINDS, type DueReminder, remindersDue } from '../../shared/reminders.mjs';
import { ApiError, api, type PublicConfig } from '../consult/api';
import { type AuthMode, currentToken, signIn, signOut, staffApi, subscribeToChanges, supabaseConfigured } from './session';
import { playSound, soundLocked, unlockSound } from './sound';
import './dashboard.css';
import './calendar.css';
import { type Consultation, type Message, MessagePreview, Modal, SendDialog, WhatsAppGlyph } from './ui';
import {
  type ActionResult, type Rule, type TimeOffDraft, AffectedDialog, BookingWeek, CalendarView, CancelDialog, ClinicHoursDialog, NewBookingDialog, RescheduleDialog, TimeOffDialog,
} from './CalendarView';

type SettingsData = { hospitalWhatsapp: string; hospitalWhatsappDisplay: string; templates: Templates };
type DashboardData = { now: string; doctor: { name: string }; zoomMode: 'mock' | 'live'; messagingMode: string; consultations: Consultation[]; settings: SettingsData };
type Toast = { id: number; text: string; tone: 'info' | 'error' };

const POLL_DEMO_MS = 5_000;
const POLL_LIVE_MS = 20_000;
const SOUND_KEY = 'sri-siri-dashboard-sound';
const QUICK_REASONS = [
  'The doctor is not available at this time.',
  'Please visit the hospital in person for this problem.',
  'This time is no longer free. Please choose another time.',
];

const when = (iso: string) => `${formatDate(iso)}, ${formatTime(iso)}`;
const minutesAgo = (iso: string, now: number) => {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : formatDate(iso);
};

export default function Dashboard() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState('');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    api<PublicConfig>('config')
      .then(async (value) => {
        setConfig(value);
        setSignedIn(Boolean(await currentToken(value.auth).catch(() => null)));
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  if (error) return <main className="dash-center"><div className="dash-panel dash-center-card"><p className="dash-error">{error}</p></div></main>;
  if (!config || signedIn === null) return <main className="dash-center" aria-busy="true"><LoaderCircle className="dash-spin" size={28} aria-label="Loading" /></main>;
  if (!signedIn) return <Login mode={config.auth} onSignedIn={() => setSignedIn(true)} />;
  return <DashboardApp mode={config.auth} onSignedOut={() => setSignedIn(false)} />;
}

function Login({ mode, onSignedIn }: { mode: AuthMode; onSignedIn: () => void }) {
  const [email, setEmail] = useState(mode === 'demo' ? 'doctor@demo.local' : '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const unavailable = mode === 'supabase' && !supabaseConfigured;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    unlockSound();
    try {
      await signIn(mode, email.trim(), password);
      onSignedIn();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dash-auth">
      <section className="dash-auth-brand" aria-hidden="true">
        <div className="dash-auth-brand-inner">
          <Brand light />
          <div>
            <p className="dash-auth-kicker">Staff portal</p>
            <h2>Video consultations</h2>
            <p>Requests, Zoom meetings and WhatsApp reminders for Dr. Sritha’s evening clinic.</p>
          </div>
          <p className="dash-auth-foot">For hospital staff only. Patient details stay private.</p>
        </div>
      </section>
      <section className="dash-auth-form-wrap">
        <form className="dash-auth-form" onSubmit={submit}>
          <div className="dash-auth-mobile-brand"><Brand /></div>
          <h1>Sign in</h1>
          <p className="dash-auth-lead">Use the email and password given to you by the hospital.</p>
          {mode === 'demo' && <p className="dash-demo-note">Local demo: the password is <code>demo</code> unless DEMO_PASSWORD is set. Data resets when the dev server restarts.</p>}
          {unavailable && <p className="dash-error">Sign-in is not set up yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.</p>}
          <label className="dash-label" htmlFor="dash-email">Email</label>
          <input id="dash-email" className="dash-input" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <label className="dash-label" htmlFor="dash-password">Password</label>
          <input id="dash-password" className="dash-input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          {error && <p className="dash-error" role="alert">{error}</p>}
          <button className="dash-button dash-primary dash-auth-submit" type="submit" disabled={busy || unavailable}>
            {busy ? <LoaderCircle className="dash-spin" size={18} aria-hidden="true" /> : <LockKeyhole size={17} aria-hidden="true" />} Sign in
          </button>
        </form>
      </section>
    </main>
  );
}

function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`dash-logo${light ? ' is-light' : ''}`}>
      <img src="/assets/sri-siri-hospital-logo.png" alt="" width="40" height="40" />
      <span><strong>Sri Siri Hospital</strong><small>Tanuku · Consultations</small></span>
    </span>
  );
}

function DashboardApp({ mode, onSignedOut }: { mode: AuthMode; onSignedOut: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [soundOn, setSoundOn] = useState(() => {
    try { return window.localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
  });
  const [locked, setLocked] = useState(soundLocked);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [sendDialog, setSendDialog] = useState<{ title: string; lead?: string; consultation: Consultation; message: Message; kind?: 'confirmation' } | null>(null);
  const [rejecting, setRejecting] = useState<Consultation | null>(null);
  const [historyFor, setHistoryFor] = useState<Consultation | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [moving, setMoving] = useState<Consultation | null>(null);
  const [cancelling, setCancelling] = useState<Consultation | null>(null);
  const [booking, setBooking] = useState(false);
  const [hoursFor, setHoursFor] = useState<Rule[] | null>(null);
  const [timeOffDraft, setTimeOffDraft] = useState<TimeOffDraft | null>(null);
  const [calendarKey, setCalendarKey] = useState(0);
  const [affected, setAffected] = useState<Consultation[] | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Consultation[] | null>(null);
  const [live, setLive] = useState(false);
  const seenRequests = useRef<Set<string> | null>(null);
  const seenReminders = useRef(new Set<string>());
  const seenOverdue = useRef(new Set<string>());
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-3), { id, text, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 6000);
  }, []);

  const handleError = useCallback((reason: unknown) => {
    const status = (reason as ApiError).status;
    if (status === 401) {
      signOut(mode).finally(onSignedOut);
      return;
    }
    toast((reason as Error).message, 'error');
  }, [mode, onSignedOut, toast]);

  const load = useCallback(async () => {
    try {
      const next = await staffApi<DashboardData>(mode, 'dashboard');
      setData(next);
      setLoadError('');
      setNow(Date.now());
      const requested = next.consultations.filter((item) => item.status === 'requested');
      if (seenRequests.current) {
        const fresh = requested.filter((item) => !seenRequests.current!.has(item.id));
        if (fresh.length) {
          if (soundOnRef.current) playSound('request');
          toast(fresh.length === 1 ? `New request from ${fresh[0].patient_name}` : `${fresh.length} new requests`);
        }
      }
      seenRequests.current = new Set([...(seenRequests.current ?? []), ...requested.map((item) => item.id)]);
    } catch (reason) {
      if ((reason as ApiError).status === 401) handleError(reason);
      else setLoadError((reason as Error).message);
    }
  }, [mode, toast, handleError]);

  useEffect(() => {
    load();
    let stop = () => {};
    subscribeToChanges(mode, () => load()).then((unsubscribe) => { stop = unsubscribe; setLive(mode !== 'demo'); }).catch(() => setLive(false));
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible' || mode === 'demo') load(); }, mode === 'demo' ? POLL_DEMO_MS : POLL_LIVE_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 15_000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop();
      window.clearInterval(poll);
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, mode]);

  const byId = useMemo(() => new Map((data?.consultations ?? []).map((item) => [item.id, item])), [data]);
  const due = useMemo(() => (data ? remindersDue(data.consultations, now) : []), [data, now]);

  // Sound when a reminder first appears, and again when it turns red.
  useEffect(() => {
    const fresh = due.filter((item) => !seenReminders.current.has(item.key));
    const freshOverdue = due.filter((item) => item.overdue && !seenOverdue.current.has(item.key));
    fresh.forEach((item) => seenReminders.current.add(item.key));
    freshOverdue.forEach((item) => seenOverdue.current.add(item.key));
    if (!soundOnRef.current) return;
    if (freshOverdue.length) playSound('overdue');
    else if (fresh.length) playSound('reminder');
  }, [due]);

  const requests = data?.consultations.filter((item) => item.status === 'requested') ?? [];
  useEffect(() => {
    const count = due.length + requests.length;
    document.title = count ? `(${count}) Consultations · Sri Siri Hospital` : 'Consultations · Sri Siri Hospital';
  }, [due.length, requests.length]);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    try { window.localStorage.setItem(SOUND_KEY, next ? 'on' : 'off'); } catch { /* ignore */ }
    if (next) unlockSound().then((ok) => { setLocked(!ok); if (ok) playSound('reminder'); });
  }

  async function enableSound() {
    const ok = await unlockSound();
    setLocked(!ok);
    if (ok) playSound('reminder');
  }

  async function accept(consultation: Consultation) {
    setBusy((current) => ({ ...current, [consultation.id]: 'accept' }));
    try {
      const result = await staffApi<{ consultation: Consultation; message: Message }>(mode, 'consultations/accept', { method: 'POST', body: { id: consultation.id } });
      setSendDialog({ title: 'Send confirmation on WhatsApp', consultation: result.consultation, message: result.message, kind: 'confirmation' });
      await load();
    } catch (reason) {
      handleError(reason);
      load();
    } finally {
      setBusy((current) => { const next = { ...current }; delete next[consultation.id]; return next; });
    }
  }

  async function markSent(consultationId: string, kind: keyof typeof REMINDER_KINDS) {
    setBusy((current) => ({ ...current, [`${consultationId}:${kind}`]: 'sent' }));
    try {
      await staffApi(mode, 'consultations/mark-sent', { method: 'POST', body: { id: consultationId, kind } });
      setData((current) => current && ({
        ...current,
        consultations: current.consultations.map((item) => item.id === consultationId ? { ...item, [REMINDER_KINDS[kind].sentField]: new Date().toISOString() } : item),
      }));
      load();
    } catch (reason) {
      handleError(reason);
    } finally {
      setBusy((current) => { const next = { ...current }; delete next[`${consultationId}:${kind}`]; return next; });
    }
  }

  async function startMeeting(consultation: Consultation) {
    const tab = window.open('', '_blank');
    try {
      const { url } = await staffApi<{ url: string }>(mode, 'consultations/start-link', { method: 'POST', body: { id: consultation.id } });
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (reason) {
      tab?.close();
      handleError(reason);
    }
  }

  async function logout() {
    await signOut(mode);
    onSignedOut();
  }

  const [view, setView] = useState<View>('overview');
  const [me, setMe] = useState<{ name: string; email: string } | null>(null);
  useEffect(() => {
    staffApi<{ name: string; email: string }>(mode, 'me').then(setMe).catch(() => {});
  }, [mode]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [view]);
  // Patient search, a moment after typing stops.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) { setResults(null); return undefined; }
    const timer = window.setTimeout(() => {
      staffApi<{ results: Consultation[] }>(mode, `consultations/search?q=${encodeURIComponent(text)}`).then((value) => setResults(value.results)).catch(handleError);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, mode, handleError]);
  // Keeps the pinned reminders panel just under the header, whatever its height.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.dash-top');
    const shell = document.querySelector<HTMLElement>('.dash');
    if (!header || !shell) return;
    const observer = new ResizeObserver(() => shell.style.setProperty('--dash-top-h', `${header.offsetHeight + 12}px`));
    observer.observe(header);
    return () => observer.disconnect();
  }, [data !== null]);

  if (!data) {
    return (
      <main className="dash-center">
        {loadError ? (
          <div className="dash-panel dash-center-card"><p className="dash-error">{loadError}</p><button className="dash-button" type="button" onClick={load}><RefreshCw size={16} aria-hidden="true" /> Try again</button></div>
        ) : <LoaderCircle className="dash-spin" size={28} aria-label="Loading" />}
      </main>
    );
  }

  const upcoming = data.consultations.filter((item) => item.status === 'scheduled').sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const todayKey = istDay(new Date(now).toISOString());
  const today = upcoming.filter((item) => istDay(item.starts_at) === todayKey);
  const next = today.find((item) => Date.parse(item.ends_at) > now);
  const recent = data.consultations
    .filter((item) => !['requested', 'scheduled'].includes(item.status))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const overdue = due.some((item) => item.overdue);

  const nav: Array<{ id: View | 'settings'; label: string; icon: ReactNode; count?: number; alert?: boolean }> = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={19} aria-hidden="true" />, count: due.length + requests.length, alert: overdue },
    { id: 'schedule', label: 'Schedule', icon: <CalendarDays size={19} aria-hidden="true" />, count: upcoming.length },
    { id: 'calendar', label: 'Calendar', icon: <CalendarRange size={19} aria-hidden="true" /> },
    { id: 'history', label: 'History', icon: <History size={19} aria-hidden="true" /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={19} aria-hidden="true" /> },
  ];
  const go = (id: View | 'settings') => (id === 'settings' ? setShowSettings(true) : setView(id));
  const changed = () => { load(); setCalendarKey((value) => value + 1); };
  const finish = (title: string, lead: string, confirm: boolean) => (result: ActionResult) => {
    setMoving(null);
    setCancelling(null);
    setBooking(false);
    setTimeOffDraft(null);
    setAffected((current) => current?.filter((item) => item.id !== result.consultation.id) ?? null);
    setSendDialog({ title, lead, consultation: result.consultation, message: result.message, kind: confirm && result.consultation.status === 'scheduled' ? 'confirmation' : undefined });
    changed();
  };
  const titles: Record<View, string> = { overview: `${greeting(now)}, ${me?.name ?? data.doctor.name}`, schedule: 'Schedule', calendar: 'Calendar', history: 'Patients and history' };
  const rowProps = { now, onReschedule: setMoving, onCancel: setCancelling, onStart: startMeeting, onHistory: setHistoryFor, onConfirmation: (item: Consultation) => item.messages.confirmation && setSendDialog({ title: 'Send confirmation again', consultation: item, message: item.messages.confirmation, kind: 'confirmation' as const }) };

  return (
    <div className="dash">
      <aside className="dash-side" aria-label="Dashboard navigation">
        <Brand light />
        <nav className="dash-nav">
          {nav.map((item) => (
            <button key={item.id} type="button" className={`dash-nav-item${view === item.id ? ' is-active' : ''}`} aria-current={view === item.id ? 'page' : undefined} onClick={() => go(item.id)}>
              {item.icon}<span>{item.label}</span>
              {Boolean(item.count) && <b className={`dash-nav-count${item.alert ? ' is-alert' : ''}`}>{item.count}</b>}
            </button>
          ))}
        </nav>
        <div className="dash-side-foot">
          <div className="dash-user">
            <span className="dash-avatar is-light" aria-hidden="true">{initials(me?.name ?? data.doctor.name)}</span>
            <span><strong>{me?.name ?? data.doctor.name}</strong><small>{me?.email ?? 'Signed in'}</small></span>
          </div>
          <button className="dash-side-signout" type="button" onClick={logout}><LogOut size={17} aria-hidden="true" /> Sign out</button>
        </div>
      </aside>

      <div className="dash-body">
        <header className="dash-top">
          <div className="dash-top-brand"><Brand /></div>
          <div className="dash-top-title">
            <p className="dash-top-date">{fullDate(now)}</p>
            <h1>{titles[view]}</h1>
            {view === 'overview' && (
              <p className="dash-top-sub">
                {today.length ? `${today.length} consultation${today.length > 1 ? 's' : ''} today${next ? ` · next at ${formatTime(next.starts_at)} with ${next.patient_name}` : ' · all done'}` : 'No consultations today'}
              </p>
            )}
          </div>
          <div className="dash-top-actions">
            <span className={`dash-live${loadError ? ' is-off' : ''}`} title={live ? 'Updates arrive instantly' : 'Checks for updates every few seconds'}>
              <i aria-hidden="true" /> {loadError ? 'Offline' : live ? 'Live' : 'Auto-refresh'}
            </span>
            <button className={`dash-button dash-sound${soundOn ? '' : ' is-off'}`} type="button" onClick={toggleSound} aria-pressed={soundOn}>
              {soundOn ? <Volume2 size={17} aria-hidden="true" /> : <VolumeX size={17} aria-hidden="true" />}
              <span>{soundOn ? 'Sound on' : 'Sound off'}</span>
            </button>
            <button className="dash-icon-button dash-mobile-only" type="button" onClick={logout} aria-label="Sign out"><LogOut size={18} aria-hidden="true" /></button>
          </div>
        </header>

        <main className="dash-main">
          {soundOn && locked && (
            <button className="dash-banner is-warn" type="button" onClick={enableSound}>
              <BellRing size={18} aria-hidden="true" /> <span><strong>Alert sounds are paused by the browser.</strong> Click here once to turn them on.</span>
            </button>
          )}
          {loadError && <p className="dash-banner is-error" role="alert"><CircleAlert size={18} aria-hidden="true" /> {loadError} Retrying…</p>}
          {data.zoomMode === 'mock' && (
            <p className="dash-banner"><CircleAlert size={18} aria-hidden="true" /> Zoom keys are not added yet, so meetings are test links that do not open a real call.</p>
          )}

          {view === 'overview' && (
            <>
              <RemindersPanel due={due} byId={byId} now={now} busy={busy} onMarkSent={markSent} />

              <BookingWeek mode={mode} now={now} refreshKey={calendarKey} onChanged={load} onAffected={setAffected} onError={handleError} toast={toast} />

              <section className="dash-panel" aria-labelledby="dash-requests">
                <PanelHead id="dash-requests" title="New requests" count={requests.length} note="Accept to create the Zoom meeting, or reject with a reason." />
                {requests.length ? (
                  <ul className="dash-table">
                    {requests.map((item) => (
                      <li className="dash-tr is-request" key={item.id}>
                        <Patient item={item} />
                        <div className="dash-td-when">
                          <strong>{formatTime(item.starts_at)}</strong>
                          <span>{dayLabel(item.starts_at, now)}</span>
                        </div>
                        <div className="dash-td-meta"><span>Requested {minutesAgo(item.created_at, now)}</span></div>
                        <div className="dash-td-actions">
                          <button className="dash-button dash-primary" type="button" onClick={() => accept(item)} disabled={Boolean(busy[item.id])}>
                            {busy[item.id] === 'accept' ? <LoaderCircle className="dash-spin" size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
                            {busy[item.id] === 'accept' ? 'Creating meeting…' : 'Accept'}
                          </button>
                          <button className="dash-button dash-danger-outline" type="button" onClick={() => setRejecting(item)} disabled={Boolean(busy[item.id])}>
                            <X size={17} aria-hidden="true" /> Reject
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <Empty icon={<Inbox size={22} aria-hidden="true" />} text="No new requests. They appear here by themselves, with a sound." />}
              </section>

              <section className="dash-panel dash-print-area" aria-labelledby="dash-today">
                <div className="dash-print-head" aria-hidden="true"><strong>Sri Siri Hospital, Tanuku</strong><span>Video consultations · {data.doctor.name} · {fullDate(now)}</span></div>
                <PanelHead id="dash-today" title="Today’s consultations" count={today.length} action={(
                  <span className="dash-panel-actions">
                    {today.length > 0 && <button className="dash-link-button" type="button" onClick={() => window.print()}><Printer size={15} aria-hidden="true" /> Print day sheet</button>}
                    {upcoming.length > today.length && <button className="dash-link-button" type="button" onClick={() => setView('schedule')}>Full schedule <ChevronRight size={15} aria-hidden="true" /></button>}
                  </span>
                )} />
                {today.length ? (
                  <ul className="dash-table">{today.map((item) => <ScheduleRow key={item.id} item={item} {...rowProps} />)}</ul>
                ) : <Empty icon={<CalendarDays size={22} aria-hidden="true" />} text={upcoming.length ? `Nothing today. Next: ${when(upcoming[0].starts_at)}, ${upcoming[0].patient_name}.` : 'No confirmed consultations coming up.'} />}
              </section>
            </>
          )}

          {view === 'schedule' && (
            <div className="dash-view-bar">
              <p>All confirmed consultations from today on. Reschedule or cancel from here; the patient gets a prefilled WhatsApp message.</p>
              <button className="dash-button dash-primary" type="button" onClick={() => setBooking(true)}><UserPlus size={17} aria-hidden="true" /> New booking</button>
            </div>
          )}
          {view === 'schedule' && (
            upcoming.length ? (
              groupByDay(upcoming).map(([key, items]) => (
                <section className="dash-panel" key={key} aria-label={dayLabel(items[0].starts_at, now)}>
                  <PanelHead title={dayLabel(items[0].starts_at, now)} count={items.length} />
                  <ul className="dash-table">{items.map((item) => <ScheduleRow key={item.id} item={item} {...rowProps} />)}</ul>
                </section>
              ))
            ) : <section className="dash-panel"><Empty icon={<CalendarDays size={22} aria-hidden="true" />} text="No confirmed consultations coming up." /></section>
          )}

          {view === 'calendar' && (
            <CalendarView
              mode={mode}
              now={now}
              refreshKey={calendarKey}
              onChanged={load}
              onReschedule={setMoving}
              onCancel={setCancelling}
              onHistory={setHistoryFor}
              onHours={setHoursFor}
              onTimeOff={setTimeOffDraft}
              onNewBooking={() => setBooking(true)}
              onError={handleError}
              toast={toast}
              onAffected={setAffected}
            />
          )}

          {view === 'history' && (
            <label className="dash-search">
              <Search size={18} aria-hidden="true" />
              <span className="dash-sr">Search patients</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by patient name, mobile number or reference (SS-…)" />
            </label>
          )}
          {view === 'history' && (
            <section className="dash-panel" aria-labelledby="dash-history">
              <PanelHead id="dash-history" title={results ? `Results for “${query.trim()}”` : 'Last few days'} count={(results ?? recent).length} note={results ? 'All consultations, newest first.' : 'Completed, rejected, cancelled and expired consultations, with feedback.'} />
              {(results ?? recent).length ? (
                <ul className="dash-table">
                  {(results ?? recent).map((item) => (
                    <li className="dash-tr" key={item.id}>
                      <Patient item={item} />
                      <div className="dash-td-when">
                        <strong>{formatTime(item.starts_at)}</strong>
                        <span>{dayLabel(item.starts_at, now)}</span>
                      </div>
                      <div className="dash-td-meta">
                        <span className={`dash-status status-${item.status}`}>{item.status_label}</span>
                        {item.reject_reason && <span className="dash-reason">{item.reject_reason}</span>}
                        {item.feedback && (
                          <span className="dash-feedback">
                            <span className="dash-stars" aria-label={`${item.feedback.rating} of 5`}>
                              {Array.from({ length: 5 }, (_, index) => <Star key={index} size={14} className={index < item.feedback!.rating ? 'is-on' : ''} aria-hidden="true" />)}
                            </span>
                            {item.feedback.comment && <q>{item.feedback.comment}</q>}
                          </span>
                        )}
                      </div>
                      <div className="dash-td-actions">
                        {item.messages.rejection && 'url' in item.messages.rejection && (
                          <a className="dash-button" href={item.messages.rejection.url} target="_blank" rel="noreferrer"><WhatsAppGlyph /> Rejection message</a>
                        )}
                        {item.messages.cancellation && 'url' in item.messages.cancellation && (
                          <a className="dash-button" href={item.messages.cancellation.url} target="_blank" rel="noreferrer"><WhatsAppGlyph /> Cancellation message</a>
                        )}
                        {['requested', 'scheduled'].includes(item.status) && (
                          <>
                            <button className="dash-icon-button" type="button" onClick={() => setMoving(item)} aria-label={`Reschedule ${item.patient_name}`} title="Reschedule"><CalendarClock size={17} aria-hidden="true" /></button>
                            <button className="dash-icon-button is-danger" type="button" onClick={() => setCancelling(item)} aria-label={`Cancel ${item.patient_name}`} title="Cancel"><CalendarX2 size={17} aria-hidden="true" /></button>
                          </>
                        )}
                        <button className="dash-icon-button" type="button" onClick={() => setHistoryFor(item)} aria-label={`Timeline for ${item.ref_code}`} title="Timeline"><History size={18} aria-hidden="true" /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <Empty icon={results ? <Search size={22} aria-hidden="true" /> : <History size={22} aria-hidden="true" />} text={results ? 'No patient matches this search.' : 'Nothing in the last few days.'} />}
            </section>
          )}
        </main>
      </div>

      <nav className="dash-tabbar" aria-label="Dashboard sections">
        {nav.map((item) => (
          <button key={item.id} type="button" className={view === item.id ? 'is-active' : ''} aria-current={view === item.id ? 'page' : undefined} onClick={() => go(item.id)}>
            {item.icon}<span>{item.label}</span>
            {Boolean(item.count) && <b className={item.alert ? 'is-alert' : ''}>{item.count}</b>}
          </button>
        ))}
      </nav>

      {sendDialog && (
        <SendDialog
          {...sendDialog}
          busy={Boolean(busy[`${sendDialog.consultation.id}:confirmation`])}
          alreadySent={Boolean(byId.get(sendDialog.consultation.id)?.confirmation_sent_at)}
          onMarkSent={sendDialog.kind ? async () => { await markSent(sendDialog.consultation.id, 'confirmation'); setSendDialog(null); } : undefined}
          onClose={() => setSendDialog(null)}
        />
      )}
      {rejecting && (
        <RejectDialog consultation={rejecting} mode={mode} onError={handleError} onDone={() => { load(); }} onClose={() => setRejecting(null)} />
      )}
      {historyFor && <HistoryDialog consultation={historyFor} mode={mode} onClose={() => setHistoryFor(null)} />}
      {moving && <RescheduleDialog mode={mode} consultation={moving} onDone={finish('Send the new time on WhatsApp', 'Moved. ', true)} onClose={() => setMoving(null)} />}
      {cancelling && <CancelDialog mode={mode} consultation={cancelling} onDone={finish('Send the cancellation on WhatsApp', 'Cancelled and the time is free again. ', false)} onClose={() => setCancelling(null)} />}
      {booking && <NewBookingDialog mode={mode} onDone={finish('Send the confirmation on WhatsApp', 'Booked and confirmed. The Zoom meeting is ready. ', true)} onClose={() => setBooking(false)} />}
      {hoursFor && <ClinicHoursDialog mode={mode} rules={hoursFor} onSaved={() => { toast('Clinic hours saved. The booking page uses them now.'); changed(); }} onClose={() => setHoursFor(null)} />}
      {affected && !moving && !cancelling && (
        <AffectedDialog title="Bookings stopped" items={affected} onReschedule={setMoving} onCancel={setCancelling} onClose={() => setAffected(null)} />
      )}
      {timeOffDraft && !moving && !cancelling && (
        <TimeOffDialog mode={mode} draft={timeOffDraft} onSaved={() => { toast('Time off added. Patients can’t book it.'); changed(); }} onReschedule={setMoving} onCancel={setCancelling} onClose={() => setTimeOffDraft(null)} />
      )}
      {showSettings && (
        <SettingsDialog
          settings={data.settings}
          mode={mode}
          onSaved={(settings) => { setData((current) => current && ({ ...current, settings })); toast('Settings saved'); load(); }}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div className="dash-toasts" aria-live="polite">
        {toasts.map((item) => <div key={item.id} className={`dash-toast is-${item.tone}`}>{item.text}</div>)}
      </div>
    </div>
  );
}

type View = 'overview' | 'schedule' | 'calendar' | 'history';

const istDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const initials = (name: string) => name.replace(/^Dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
const fullDate = (now: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(now));
function greeting(now: number) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', hourCycle: 'h23' }).format(new Date(now)));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}
function dayLabel(iso: string, now: number) {
  const key = istDay(iso);
  if (key === istDay(new Date(now).toISOString())) return 'Today';
  if (key === istDay(new Date(now + 86_400_000).toISOString())) return 'Tomorrow';
  return formatDate(iso);
}
function groupByDay(items: Consultation[]) {
  const groups = new Map<string, Consultation[]>();
  for (const item of items) groups.set(istDay(item.starts_at), [...(groups.get(istDay(item.starts_at)) ?? []), item]);
  return [...groups];
}

function PanelHead({ id, title, count, note, action }: { id?: string; title: string; count?: number; note?: string; action?: ReactNode }) {
  return (
    <div className="dash-panel-head">
      <div>
        <h2 id={id}>{title}{count !== undefined && <span className="dash-count">{count}</span>}</h2>
        {note && <p>{note}</p>}
      </div>
      {action}
    </div>
  );
}

function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="dash-empty"><span aria-hidden="true">{icon}</span><p>{text}</p></div>;
}

function Patient({ item }: { item: Consultation }) {
  return (
    <div className="dash-td-patient">
      <span className="dash-avatar" aria-hidden="true">{initials(item.patient_name)}</span>
      <span>
        <strong>{item.patient_name}</strong>
        <small><a href={`tel:${item.patient_phone}`}>{item.patient_phone_display}</a> · {item.ref_code}</small>
      </span>
    </div>
  );
}

function ScheduleRow({ item, now, onStart, onHistory, onConfirmation, onReschedule, onCancel }: {
  item: Consultation; now: number; onStart: (item: Consultation) => void; onHistory: (item: Consultation) => void; onConfirmation: (item: Consultation) => void;
  onReschedule: (item: Consultation) => void; onCancel: (item: Consultation) => void;
}) {
  const startsIn = Math.round((Date.parse(item.starts_at) - now) / 60_000);
  const inProgress = startsIn <= 0 && Date.parse(item.ends_at) > now;
  return (
    <li className={`dash-tr${inProgress ? ' is-now' : ''}`}>
      <div className="dash-td-when">
        <strong>{formatTime(item.starts_at)}</strong>
        <span>{inProgress ? 'In progress' : startsIn > 0 && startsIn <= 60 ? `In ${startsIn} min` : '30 min'}</span>
      </div>
      <Patient item={item} />
      <div className="dash-td-meta">
        <SentChip label="Confirmation" at={item.confirmation_sent_at} />
        <SentChip label="Zoom link" at={item.link_reminder_sent_at} />
        {item.meeting?.provider === 'zoom-mock' && <span className="dash-chip is-test">Test meeting</span>}
      </div>
      <div className="dash-td-actions">
        <button className="dash-button dash-primary" type="button" onClick={() => onStart(item)}><Video size={17} aria-hidden="true" /> Start meeting</button>
        {item.messages.confirmation && (
          <button className="dash-icon-button" type="button" onClick={() => onConfirmation(item)} aria-label={`Confirmation message for ${item.patient_name}`} title="Confirmation message"><WhatsAppGlyph /></button>
        )}
        <button className="dash-icon-button" type="button" onClick={() => onReschedule(item)} aria-label={`Reschedule ${item.patient_name}`} title="Reschedule"><CalendarClock size={18} aria-hidden="true" /></button>
        <button className="dash-icon-button is-danger" type="button" onClick={() => onCancel(item)} aria-label={`Cancel ${item.patient_name}`} title="Cancel"><CalendarX2 size={18} aria-hidden="true" /></button>
        <button className="dash-icon-button" type="button" onClick={() => onHistory(item)} aria-label={`Timeline for ${item.ref_code}`} title="Timeline"><History size={18} aria-hidden="true" /></button>
      </div>
    </li>
  );
}

function SentChip({ label, at }: { label: string; at: string | null }) {
  return <span className={`dash-chip${at ? ' is-done' : ''}`}>{at ? <Check size={13} aria-hidden="true" /> : null}{label} {at ? 'sent' : 'not sent'}</span>;
}

// ---------------------------------------------------------------------------
// Reminders due (pinned)
// ---------------------------------------------------------------------------

function RemindersPanel({ due, byId, now, busy, onMarkSent }: {
  due: DueReminder[]; byId: Map<string, Consultation>; now: number; busy: Record<string, string>;
  onMarkSent: (id: string, kind: DueReminder['kind']) => void;
}) {
  const overdueCount = due.filter((item) => item.overdue).length;
  if (!due.length) {
    return (
      <section className="dash-reminders is-clear" aria-labelledby="dash-reminders-title">
        <span className="dash-reminders-icon" aria-hidden="true"><Check size={18} /></span>
        <div>
          <h2 id="dash-reminders-title">No WhatsApp messages to send</h2>
          <p>Zoom links appear here 30 minutes before each consultation, and feedback requests 15 minutes after it ends.</p>
        </div>
      </section>
    );
  }
  return (
    <section className={`dash-reminders has-due${overdueCount ? ' has-overdue' : ''}`} aria-labelledby="dash-reminders-title">
      <div className="dash-reminders-head">
        <span className="dash-reminders-icon" aria-hidden="true"><BellRing size={18} /></span>
        <div>
          <h2 id="dash-reminders-title">Reminders due <span className="dash-count">{due.length}</span></h2>
          <p>{overdueCount ? `${overdueCount} overdue. ` : ''}Send on WhatsApp, then mark as sent. Reminders turn red after {OVERDUE_AFTER_MINUTES} minutes.</p>
        </div>
      </div>
      <ul className="dash-reminder-list">
        {due.map((item) => {
          const consultation = byId.get(item.consultationId);
          if (!consultation) return null;
          const kind = REMINDER_KINDS[item.kind];
          const message = consultation.messages[kind.template as 'confirmation' | 'link_reminder' | 'feedback'];
          const title = item.kind === 'link'
            ? `Send link to ${consultation.patient_name} — ${formatTime(consultation.starts_at)}`
            : item.kind === 'confirmation'
              ? `Send confirmation to ${consultation.patient_name} — ${when(consultation.starts_at)}`
              : `Ask ${consultation.patient_name} for feedback — ${formatTime(consultation.starts_at)} consultation`;
          const late = Math.round((now - Date.parse(item.dueAt)) / 60_000);
          return (
            <li key={item.key} className={`dash-reminder${item.overdue ? ' is-overdue' : ''}`}>
              <div className="dash-reminder-text">
                <span className="dash-reminder-kind">{kind.title}{item.overdue ? ` · overdue ${late} min` : late > 0 ? ` · due ${late} min ago` : ' · due now'}</span>
                <strong>{title}</strong>
                <span className="dash-reminder-phone">{consultation.patient_phone_display} · {consultation.ref_code}</span>
              </div>
              <div className="dash-reminder-actions">
                {message && 'url' in message ? (
                  <a className="dash-button dash-whatsapp" href={message.url} target="_blank" rel="noreferrer"><WhatsAppGlyph /> Open WhatsApp</a>
                ) : <span className="dash-chip">Sent automatically</span>}
                <button className="dash-button" type="button" onClick={() => onMarkSent(consultation.id, item.kind)} disabled={Boolean(busy[`${consultation.id}:${item.kind}`])}>
                  <Check size={17} aria-hidden="true" /> Mark as sent
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------




function RejectDialog({ consultation, mode, onError, onDone, onClose }: {
  consultation: Consultation; mode: AuthMode; onError: (reason: unknown) => void; onDone: () => void; onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [message, setMessage] = useState<Message | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3) {
      setFieldError('Please give a short reason. The patient will see it.');
      return;
    }
    setBusy(true);
    try {
      const result = await staffApi<{ message: Message }>(mode, 'consultations/reject', { method: 'POST', body: { id: consultation.id, reason } });
      setMessage(result.message);
      onDone();
    } catch (reason) {
      if (reason instanceof ApiError && reason.fields.reason) setFieldError(reason.fields.reason);
      else { onError(reason); onClose(); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={message ? 'Send the rejection on WhatsApp' : `Reject ${consultation.patient_name}’s request?`} onClose={onClose}>
      {message ? (
        <>
          <p className="dash-dialog-lead">The time is free again. Send this polite message to <strong>{consultation.patient_name}</strong> ({consultation.patient_phone_display}):</p>
          <MessagePreview message={message} />
          <div className="dash-dialog-actions">
            {'url' in message ? <a className="dash-button dash-whatsapp" href={message.url} target="_blank" rel="noreferrer"><WhatsAppGlyph /> Send on WhatsApp</a> : <span className="dash-chip is-done">Sent automatically</span>}
            <button className="dash-button" type="button" onClick={onClose}>Done</button>
          </div>
        </>
      ) : (
        <form onSubmit={submit}>
          <p className="dash-dialog-lead">{when(consultation.starts_at)} · {consultation.ref_code}</p>
          <label className="dash-label" htmlFor="reject-reason">Reason (the patient will see this)</label>
          <div className="dash-quick">
            {QUICK_REASONS.map((text) => <button key={text} type="button" className="dash-chip is-button" onClick={() => { setReason(text); setFieldError(''); }}>{text}</button>)}
          </div>
          <textarea id="reject-reason" className="dash-textarea" rows={3} maxLength={300} value={reason} onChange={(event) => { setReason(event.target.value); setFieldError(''); }} aria-invalid={Boolean(fieldError)} />
          {fieldError && <p className="dash-error">{fieldError}</p>}
          <div className="dash-dialog-actions">
            <button className="dash-button dash-danger" type="submit" disabled={busy}>{busy ? <LoaderCircle className="dash-spin" size={17} aria-hidden="true" /> : <X size={17} aria-hidden="true" />} Reject request</button>
            <button className="dash-button" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function HistoryDialog({ consultation, mode, onClose }: { consultation: Consultation; mode: AuthMode; onClose: () => void }) {
  const [events, setEvents] = useState<Array<{ from_status: string | null; to_status: string | null; actor: string; note: string | null; created_at: string }> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    staffApi<{ events: NonNullable<typeof events> }>(mode, `consultations/events?id=${encodeURIComponent(consultation.id)}`)
      .then((result) => setEvents(result.events))
      .catch((reason: Error) => setError(reason.message));
  }, [consultation.id, mode]);
  return (
    <Modal title={`History · ${consultation.ref_code}`} onClose={onClose}>
      <p className="dash-dialog-lead">{consultation.patient_name} · {when(consultation.starts_at)}</p>
      {error ? <p className="dash-error">{error}</p> : !events ? <LoaderCircle className="dash-spin" size={20} aria-label="Loading" /> : (
        <ol className="dash-history">
          {events.map((event, index) => (
            <li key={index}>
              <time>{when(event.created_at)}</time>
              <span>{event.note ?? event.to_status}</span>
              <small>{event.actor}</small>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

const SAMPLE = {
  ref: 'SS-7K4Q', name: 'Ravi Kumar', doctor: 'Dr. Sritha', date: formatDate('2026-11-20T12:00:00Z'), time: formatTime('2026-11-20T12:00:00Z'),
  zoom_link: 'https://zoom.us/j/1234567890', tracker_link: `${window.location.origin}/a/…`, feedback_link: `${window.location.origin}/f/…`,
  booking_link: `${window.location.origin}/consult`, reason: 'The doctor is not available at this time.',
};

function SettingsDialog({ settings, mode, onSaved, onClose }: { settings: SettingsData; mode: AuthMode; onSaved: (settings: SettingsData) => void; onClose: () => void }) {
  const [number, setNumber] = useState(formatIndianPhone(settings.hospitalWhatsapp));
  const [templates, setTemplates] = useState<Templates>({ ...settings.templates });
  const [active, setActive] = useState<TemplateKey>('confirmation');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  function insert(placeholder: string) {
    const area = areaRef.current;
    const token = `{${placeholder}}`;
    const value = templates[active];
    const start = area?.selectionStart ?? value.length;
    const end = area?.selectionEnd ?? value.length;
    setTemplates((current) => ({ ...current, [active]: value.slice(0, start) + token + value.slice(end) }));
    window.requestAnimationFrame(() => { area?.focus(); area?.setSelectionRange(start + token.length, start + token.length); });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const result = await staffApi<{ settings: SettingsData }>(mode, 'settings', { method: 'PUT', body: { hospitalWhatsapp: number, templates } });
      onSaved(result.settings);
      onClose();
    } catch (reason) {
      if (reason instanceof ApiError) {
        setErrors({ ...reason.fields, form: reason.message });
        const firstTemplate = Object.keys(reason.fields).find((key) => key.startsWith('templates.'));
        if (firstTemplate) setActive(firstTemplate.slice(10) as TemplateKey);
      } else setErrors({ form: (reason as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Settings" onClose={onClose} wide>
      <form className="dash-settings" onSubmit={save}>
        <div className="dash-setting">
          <label className="dash-label" htmlFor="setting-number">Hospital WhatsApp number</label>
          <p className="dash-help">Patients send their requests to this number. Shown on the site as {formatIndianPhone(number) || '+91 …'}.</p>
          <input id="setting-number" className="dash-input" inputMode="tel" value={number} onChange={(event) => setNumber(event.target.value)} aria-invalid={Boolean(errors.hospitalWhatsapp)} />
          {errors.hospitalWhatsapp && <p className="dash-error">{errors.hospitalWhatsapp}</p>}
        </div>

        <div className="dash-setting">
          <span className="dash-label">Message templates</span>
          <div className="dash-tabs" role="tablist">
            {TEMPLATE_KEYS.map((key) => (
              <button key={key} type="button" role="tab" aria-selected={active === key} className={`dash-tab${active === key ? ' is-active' : ''}${errors[`templates.${key}`] ? ' has-error' : ''}`} onClick={() => setActive(key)}>
                {TEMPLATE_FIELDS[key].label}
              </button>
            ))}
          </div>
          <div className="dash-template">
            <div>
              <textarea ref={areaRef} className="dash-textarea" rows={9} maxLength={1000} value={templates[active]} onChange={(event) => setTemplates((current) => ({ ...current, [active]: event.target.value }))} aria-label={TEMPLATE_FIELDS[active].label} aria-invalid={Boolean(errors[`templates.${active}`])} />
              {errors[`templates.${active}`] && <p className="dash-error">{errors[`templates.${active}`]}</p>}
              <div className="dash-quick">
                {TEMPLATE_FIELDS[active].placeholders.map((placeholder) => (
                  <button key={placeholder} type="button" className="dash-chip is-button" onClick={() => insert(placeholder)}>{`{${placeholder}}`}</button>
                ))}
                <button type="button" className="dash-link-button" onClick={() => setTemplates((current) => ({ ...current, [active]: DEFAULT_TEMPLATES[active] }))}>Reset to default</button>
              </div>
            </div>
            <div>
              <span className="dash-help">Preview</span>
              <pre className="dash-message-preview">{renderTemplate(templates[active], SAMPLE)}</pre>
            </div>
          </div>
        </div>
        {errors.form && <p className="dash-error" role="alert">{errors.form}</p>}
        <div className="dash-dialog-actions">
          <button className="dash-button dash-primary" type="submit" disabled={busy}>{busy && <LoaderCircle className="dash-spin" size={17} aria-hidden="true" />} Save settings</button>
          <button className="dash-button" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

