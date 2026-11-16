import type { TemplateKey } from './messages.mjs';

export type ReminderKind = 'confirmation' | 'link' | 'feedback';
export type DueReminder = { key: string; kind: ReminderKind; consultationId: string; dueAt: string; overdue: boolean };

export declare const LINK_REMINDER_MINUTES: number;
export declare const FEEDBACK_AFTER_MINUTES: number;
export declare const OVERDUE_AFTER_MINUTES: number;
export declare const REMINDER_KINDS: Readonly<Record<ReminderKind, { template: TemplateKey; sentField: string; title: string }>>;
export declare function remindersDue(
  consultations: Array<{
    id: string; status: string; starts_at: string; ends_at: string; accepted_at?: string | null;
    confirmation_sent_at?: string | null; link_reminder_sent_at?: string | null; feedback_request_sent_at?: string | null;
  }>,
  now?: number,
): DueReminder[];
