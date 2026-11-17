import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';

// Shared dashboard pieces: data types, the dialog shell and the WhatsApp send box.

export type Message = { delivery: 'link'; url: string; text: string } | { delivery: 'sent'; text: string; providerMessageId?: string };
export type Consultation = {
  id: string; ref_code: string; patient_name: string; patient_phone: string; patient_phone_display: string;
  starts_at: string; ends_at: string; status: string; status_label: string; reject_reason: string | null;
  meeting: { provider: string; join_url: string; passcode: string | null } | null;
  accepted_at: string | null; confirmation_sent_at: string | null; link_reminder_sent_at: string | null; feedback_request_sent_at: string | null;
  created_at: string; tracker_url: string;
  feedback: { rating: number; comment: string; allow_public: boolean } | null;
  messages: Partial<Record<'confirmation' | 'link_reminder' | 'feedback' | 'rejection' | 'cancellation', Message>>;
};

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
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

export function MessagePreview({ message }: { message: Message }) {
  return <pre className="dash-message-preview">{message.text}</pre>;
}

export function SendDialog({ title, lead, consultation, message, onMarkSent, onClose, busy, alreadySent }: {
  title: string; lead?: string; consultation: Consultation; message: Message; onMarkSent?: () => void; onClose: () => void; busy: boolean; alreadySent: boolean;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <p className="dash-dialog-lead">
        {lead ?? (consultation.status === 'scheduled' ? 'Accepted. The Zoom meeting is ready. ' : '')}
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

export function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5 5.1-1.3A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3 .8.8-2.95-.2-.31a8.2 8.2 0 1 1 6.9 3.8Zm4.5-6.15c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.55.12-.17.25-.64.8-.78.97-.14.16-.29.18-.53.06a6.7 6.7 0 0 1-3.37-2.94c-.25-.44.25-.41.72-1.36.08-.16.04-.3-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.3 2.74 2.74 0 0 0-.86 2.04 4.76 4.76 0 0 0 1 2.53c.12.16 1.7 2.6 4.12 3.64 1.53.66 2.13.72 2.9.6.46-.07 1.46-.6 1.67-1.18.2-.58.2-1.08.14-1.18-.06-.1-.22-.17-.47-.29Z" />
    </svg>
  );
}
