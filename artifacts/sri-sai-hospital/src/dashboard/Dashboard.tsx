import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BellRing, Check, CircleAlert, History, LoaderCircle, LogOut, RefreshCw, Settings, Star, Video, Volume2, VolumeX, X,
} from 'lucide-react';
import {
  DEFAULT_TEMPLATES, TEMPLATE_FIELDS, TEMPLATE_KEYS, type TemplateKey, type Templates, formatDate, formatIndianPhone, formatTime, renderTemplate,
} from '../../shared/messages.mjs';
import { OVERDUE_AFTER_MINUTES, REMINDER_KINDS, type DueReminder, remindersDue } from '../../shared/reminders.mjs';
import { ApiError, api, type PublicConfig } from '../consult/api';
import { type AuthMode, currentToken, signIn, signOut, staffApi, subscribeToChanges, supabaseConfigured } from './session';
import { playSound, soundLocked, unlockSound } from './sound';
import './dashboard.css';

type Message = { delivery: 'link'; url: string; text: string } | { delivery: 'sent'; text: string; providerMessageId?: string };
type Consultation = {
  id: string; ref_code: string; patient_name: string; patient_phone: string; patient_phone_display: string;
  starts_at: string; ends_at: string; status: string; status_label: string; reject_reason: string | null;
  meeting: { provider: string; join_url: string; passcode: string | null } | null;
  accepted_at: string | null; confirmation_sent_at: string | null; link_reminder_sent_at: string | null; feedback_request_sent_at: string | null;
  created_at: string; tracker_url: string;
  feedback: { rating: number; comment: string; allow_public: boolean } | null;
  messages: Partial<Record<'confirmation' | 'link_reminder' | 'feedback' | 'rejection', Message>>;
};
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

  if (error) return <main className="dash-center"><div className="dash-login"><p className="dash-error">{error}</p></div></main>;
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
    <main className="dash-center">
      <form className="dash-login" onSubmit={submit}>
        <span className="dash-brand">Sri Siri Hospital</span>
        <h1>Consultations</h1>
        <p>Sign in to see requests and reminders.</p>
        {mode === 'demo' && <p className="dash-demo-note">Local demo: the password is <code>demo</code> unless DEMO_PASSWORD is set. Data resets when the dev server restarts.</p>}
        {unavailable && <p className="dash-error">Sign-in is not set up yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.</p>}
        <label htmlFor="dash-email">Email</label>
        <input id="dash-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <label htmlFor="dash-password">Password</label>
        <input id="dash-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error && <p className="dash-error" role="alert">{error}</p>}
        <button className="dash-button dash-primary" type="submit" disabled={busy || unavailable}>
          {busy ? <LoaderCircle className="dash-spin" size={18} aria-hidden="true" /> : null} Sign in
        </button>
      </form>
    </main>
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
  const [sendDialog, setSendDialog] = useState<{ title: string; consultation: Consultation; message: Message; kind?: 'confirmation' } | null>(null);
  const [rejecting, setRejecting] = useState<Consultation | null>(null);
  const [historyFor, setHistoryFor] = useState<Consultation | null>(null);
  const [showSettings, setShowSettings] = useState(false);
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

  if (!data) {
    return (
      <main className="dash-center">
        {loadError ? (
          <div className="dash-login"><p className="dash-error">{loadError}</p><button className="dash-button" type="button" onClick={load}><RefreshCw size={16} aria-hidden="true" /> Try again</button></div>
        ) : <LoaderCircle className="dash-spin" size={28} aria-label="Loading" />}
      </main>
    );
  }

  const upcoming = data.consultations.filter((item) => item.status === 'scheduled');
  const recent = data.consultations
    .filter((item) => !['requested', 'scheduled'].includes(item.status))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));

  return (
    <div className="dash">
      <header className="dash-top">
        <div className="dash-top-inner">
          <div className="dash-title">
            <span className="dash-brand">Sri Siri Hospital</span>
            <h1>Consultations</h1>
          </div>
          <div className="dash-top-actions">
            <span className={`dash-live${loadError ? ' is-off' : ''}`} title={live ? 'Updates arrive instantly' : 'Checks for updates every few seconds'}>
              <i aria-hidden="true" /> {loadError ? 'Offline' : live ? 'Live' : 'Auto-refresh'}
            </span>
            <button className="dash-icon-button" type="button" onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? 'Turn sound off' : 'Turn sound on'} title={soundOn ? 'Sound on' : 'Sound off'}>
              {soundOn ? <Volume2 size={19} aria-hidden="true" /> : <VolumeX size={19} aria-hidden="true" />}
            </button>
            <button className="dash-icon-button" type="button" onClick={() => setShowSettings(true)} aria-label="Settings" title="Settings"><Settings size={19} aria-hidden="true" /></button>
            <button className="dash-icon-button" type="button" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={19} aria-hidden="true" /></button>
          </div>
        </div>
      </header>

      <main className="dash-main">
        {soundOn && locked && (
          <button className="dash-sound-banner" type="button" onClick={enableSound}>
            <BellRing size={18} aria-hidden="true" /> Tap here to turn on alert sounds for new requests and reminders.
          </button>
        )}
        {loadError && <p className="dash-error dash-inline-error" role="alert">{loadError} Retrying…</p>}
        {data.zoomMode === 'mock' && (
          <p className="dash-mock-note"><CircleAlert size={16} aria-hidden="true" /> Zoom keys are not added yet, so meetings are test links that do not open a real call.</p>
        )}

        <RemindersPanel
          due={due}
          byId={byId}
          now={now}
          busy={busy}
          onMarkSent={markSent}
        />

        <section className="dash-section" aria-labelledby="dash-requests">
          <div className="dash-section-head">
            <h2 id="dash-requests">New requests</h2>
            <span className="dash-count">{requests.length}</span>
          </div>
          {requests.length ? (
            <div className="dash-grid">
              {requests.map((item) => (
                <article className="dash-card is-request" key={item.id}>
                  <div className="dash-card-top">
                    <span className="dash-when">{when(item.starts_at)}</span>
                    <span className="dash-ref">{item.ref_code}</span>
                  </div>
                  <h3>{item.patient_name}</h3>
                  <p className="dash-phone"><a href={`tel:${item.patient_phone}`}>{item.patient_phone_display}</a></p>
                  <p className="dash-meta">Requested {minutesAgo(item.created_at, now)}</p>
                  <div className="dash-actions">
                    <button className="dash-button dash-primary" type="button" onClick={() => accept(item)} disabled={Boolean(busy[item.id])}>
                      {busy[item.id] === 'accept' ? <LoaderCircle className="dash-spin" size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
                      {busy[item.id] === 'accept' ? 'Creating Zoom meeting…' : 'Accept'}
                    </button>
                    <button className="dash-button dash-danger-outline" type="button" onClick={() => setRejecting(item)} disabled={Boolean(busy[item.id])}>
                      <X size={17} aria-hidden="true" /> Reject
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="dash-empty">No new requests. New ones appear here by themselves, with a sound.</p>}
        </section>

        <section className="dash-section" aria-labelledby="dash-upcoming">
          <div className="dash-section-head">
            <h2 id="dash-upcoming">Upcoming</h2>
            <span className="dash-count">{upcoming.length}</span>
          </div>
          {upcoming.length ? (
            <div className="dash-list">
              {upcoming.map((item) => {
                const startsIn = Math.round((Date.parse(item.starts_at) - now) / 60_000);
                return (
                  <article className="dash-row" key={item.id}>
                    <div className="dash-row-time">
                      <strong>{formatTime(item.starts_at)}</strong>
                      <span>{formatDate(item.starts_at)}</span>
                    </div>
                    <div className="dash-row-main">
                      <h3>{item.patient_name} <span className="dash-ref">{item.ref_code}</span></h3>
                      <p><a href={`tel:${item.patient_phone}`}>{item.patient_phone_display}</a></p>
                      <div className="dash-chips">
                        <SentChip label="Confirmation" at={item.confirmation_sent_at} />
                        <SentChip label="Zoom link" at={item.link_reminder_sent_at} />
                        {item.meeting?.provider === 'zoom-mock' && <span className="dash-chip is-test">Test meeting</span>}
                      </div>
                    </div>
                    <div className="dash-row-actions">
                      {startsIn <= 15 && startsIn > -60 && <span className="dash-soon">{startsIn > 0 ? `Starts in ${startsIn} min` : 'Now'}</span>}
                      <button className="dash-button dash-primary" type="button" onClick={() => startMeeting(item)}><Video size={17} aria-hidden="true" /> Start meeting</button>
                      {item.messages.confirmation && (
                        <button className="dash-button" type="button" onClick={() => setSendDialog({ title: 'Send confirmation again', consultation: item, message: item.messages.confirmation!, kind: 'confirmation' })}>
                          <WhatsAppGlyph /> Confirmation
                        </button>
                      )}
                      <button className="dash-icon-button" type="button" onClick={() => setHistoryFor(item)} aria-label={`History for ${item.ref_code}`} title="History"><History size={18} aria-hidden="true" /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : <p className="dash-empty">No confirmed consultations coming up.</p>}
        </section>

        <section className="dash-section" aria-labelledby="dash-recent">
          <div className="dash-section-head">
            <h2 id="dash-recent">Recent</h2>
            <span className="dash-count">{recent.length}</span>
          </div>
          {recent.length ? (
            <div className="dash-list is-compact">
              {recent.map((item) => (
                <article className="dash-row" key={item.id}>
                  <div className="dash-row-time">
                    <strong>{formatTime(item.starts_at)}</strong>
                    <span>{formatDate(item.starts_at)}</span>
                  </div>
                  <div className="dash-row-main">
                    <h3>{item.patient_name} <span className="dash-ref">{item.ref_code}</span></h3>
                    <p>
                      <span className={`dash-status status-${item.status}`}>{item.status_label}</span>
                      {item.reject_reason && <span className="dash-reason">{item.reject_reason}</span>}
                    </p>
                    {item.feedback && (
                      <p className="dash-feedback">
                        <span className="dash-stars" aria-label={`${item.feedback.rating} of 5`}>
                          {Array.from({ length: 5 }, (_, index) => <Star key={index} size={14} className={index < item.feedback!.rating ? 'is-on' : ''} aria-hidden="true" />)}
                        </span>
                        {item.feedback.comment && <q>{item.feedback.comment}</q>}
                        {item.feedback.allow_public && <span className="dash-chip">May be shown on website</span>}
                      </p>
                    )}
                  </div>
                  <div className="dash-row-actions">
                    {item.messages.rejection && (
                      <a className="dash-button" href={(item.messages.rejection as { url?: string }).url} target="_blank" rel="noreferrer"><WhatsAppGlyph /> Rejection message</a>
                    )}
                    <button className="dash-icon-button" type="button" onClick={() => setHistoryFor(item)} aria-label={`History for ${item.ref_code}`} title="History"><History size={18} aria-hidden="true" /></button>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="dash-empty">Nothing in the last few days.</p>}
        </section>
      </main>

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
        <RejectDialog
          consultation={rejecting}
          mode={mode}
          onError={handleError}
          onDone={() => { load(); }}
          onClose={() => setRejecting(null)}
        />
      )}
      {historyFor && <HistoryDialog consultation={historyFor} mode={mode} onClose={() => setHistoryFor(null)} />}
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
  return (
    <section className={`dash-reminders${due.length ? ' has-due' : ''}${overdueCount ? ' has-overdue' : ''}`} aria-labelledby="dash-reminders-title">
      <div className="dash-reminders-head">
        <BellRing size={20} aria-hidden="true" />
        <h2 id="dash-reminders-title">Reminders due</h2>
        <span className="dash-count">{due.length}</span>
        <p>Send these on WhatsApp, then tap “Mark as sent”. They turn red after {OVERDUE_AFTER_MINUTES} minutes.</p>
      </div>
      {due.length ? (
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
                  <span className="dash-reminder-kind">{kind.title}{item.overdue ? ` · overdue ${late} min` : late > 0 ? ` · due ${late} min ago` : ''}</span>
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
      ) : <p className="dash-empty">Nothing to send right now. Zoom links appear here 30 minutes before each consultation, and feedback requests 15 minutes after it ends.</p>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} className={`dash-dialog${wide ? ' is-wide' : ''}`} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="dash-dialog-title">
      <div className="dash-dialog-head">
        <h2 id="dash-dialog-title">{title}</h2>
        <button className="dash-icon-button" type="button" onClick={onClose} aria-label="Close"><X size={19} aria-hidden="true" /></button>
      </div>
      {children}
    </dialog>
  );
}

function MessagePreview({ message }: { message: Message }) {
  return <pre className="dash-message-preview">{message.text}</pre>;
}

function SendDialog({ title, consultation, message, onMarkSent, onClose, busy, alreadySent }: {
  title: string; consultation: Consultation; message: Message; onMarkSent?: () => void; onClose: () => void; busy: boolean; alreadySent: boolean;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <p className="dash-dialog-lead">
        {consultation.status === 'scheduled' ? 'Accepted. The Zoom meeting is ready. ' : ''}
        Send this to <strong>{consultation.patient_name}</strong> ({consultation.patient_phone_display}):
      </p>
      <MessagePreview message={message} />
      <div className="dash-dialog-actions">
        {'url' in message ? (
          <a className="dash-button dash-whatsapp" href={message.url} target="_blank" rel="noreferrer" onClick={() => setOpened(true)}><WhatsAppGlyph /> Send on WhatsApp</a>
        ) : <span className="dash-chip is-done">Sent automatically</span>}
        {onMarkSent && !alreadySent && (
          <button className={`dash-button${opened ? ' dash-primary' : ''}`} type="button" onClick={onMarkSent} disabled={busy}>
            <Check size={17} aria-hidden="true" /> Mark as sent
          </button>
        )}
        {alreadySent && <span className="dash-chip is-done"><Check size={13} aria-hidden="true" /> Marked as sent</span>}
      </div>
      {onMarkSent && !alreadySent && <p className="dash-dialog-note">If you close this without marking it sent, it stays in “Reminders due”.</p>}
    </Modal>
  );
}

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

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5 5.1-1.3A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3 .8.8-2.95-.2-.31a8.2 8.2 0 1 1 6.9 3.8Zm4.5-6.15c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.55.12-.17.25-.64.8-.78.97-.14.16-.29.18-.53.06a6.7 6.7 0 0 1-3.37-2.94c-.25-.44.25-.41.72-1.36.08-.16.04-.3-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.3 2.74 2.74 0 0 0-.86 2.04 4.76 4.76 0 0 0 1 2.53c.12.16 1.7 2.6 4.12 3.64 1.53.66 2.13.72 2.9.6.46-.07 1.46-.6 1.67-1.18.2-.58.2-1.08.14-1.18-.06-.1-.22-.17-.47-.29Z" />
    </svg>
  );
}
