export type TemplateKey = 'request' | 'confirmation' | 'rejection' | 'link_reminder' | 'feedback' | 'reschedule' | 'cancellation';
export type Templates = Record<TemplateKey, string>;

export declare const TIME_ZONE: string;
export declare const TEMPLATE_FIELDS: Readonly<Record<TemplateKey, { label: string; placeholders: string[] }>>;
export declare const DEFAULT_TEMPLATES: Readonly<Templates>;
export declare const TEMPLATE_KEYS: readonly TemplateKey[];
export declare function renderTemplate(template: string, values: Record<string, unknown>): string;
export declare function normalizeIndianMobile(input: unknown): string | null;
export declare function formatIndianPhone(value: unknown): string;
export declare function waLink(phone: string, text: string): string;
export declare function formatDate(iso: string): string;
export declare function formatTime(iso: string): string;
export declare function messageValues(
  consultation: {
    ref_code: string; patient_name: string; starts_at: string; doctor_name?: string | null; join_url?: string | null;
    tracker_url?: string | null; feedback_url?: string | null; booking_url?: string | null;
  },
  extra?: Record<string, string>,
): Record<string, string>;
