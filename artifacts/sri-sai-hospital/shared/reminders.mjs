// Which WhatsApp messages the doctor's team should send now. Computed from the
// consultation data and the clock, so the panel stays right even if the page
// has been open for hours.

const MINUTE = 60_000;
export const LINK_REMINDER_MINUTES = 30;
export const FEEDBACK_AFTER_MINUTES = 15;
export const OVERDUE_AFTER_MINUTES = 10;
const FEEDBACK_WINDOW_MINUTES = 3 * 24 * 60;

export const REMINDER_KINDS = Object.freeze({
  confirmation: { template: 'confirmation', sentField: 'confirmation_sent_at', title: 'Send confirmation' },
  link: { template: 'link_reminder', sentField: 'link_reminder_sent_at', title: 'Send Zoom link' },
  feedback: { template: 'feedback', sentField: 'feedback_request_sent_at', title: 'Ask for feedback' },
});

export function remindersDue(consultations, now = Date.now()) {
  const due = [];
  for (const consultation of consultations) {
    const starts = Date.parse(consultation.starts_at);
    const ends = Date.parse(consultation.ends_at);
    const add = (kind, dueAt) => due.push({
      key: `${consultation.id}:${kind}`,
      kind,
      consultationId: consultation.id,
      dueAt: new Date(dueAt).toISOString(),
      overdue: now >= dueAt + OVERDUE_AFTER_MINUTES * MINUTE,
    });

    if (consultation.status === 'scheduled') {
      if (!consultation.confirmation_sent_at && consultation.accepted_at && now < ends) {
        add('confirmation', Date.parse(consultation.accepted_at));
      }
      const linkDue = starts - LINK_REMINDER_MINUTES * MINUTE;
      if (!consultation.link_reminder_sent_at && now >= linkDue && now < ends) add('link', linkDue);
    }
    if (consultation.status === 'scheduled' || consultation.status === 'completed') {
      const feedbackDue = ends + FEEDBACK_AFTER_MINUTES * MINUTE;
      if (!consultation.feedback_request_sent_at && now >= feedbackDue && now < feedbackDue + FEEDBACK_WINDOW_MINUTES * MINUTE) {
        add('feedback', feedbackDue);
      }
    }
  }
  return due.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}
