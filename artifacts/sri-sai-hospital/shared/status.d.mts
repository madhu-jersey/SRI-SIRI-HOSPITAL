export type ConsultationStatus =
  | 'requested' | 'scheduled' | 'rejected' | 'cancelled' | 'expired' | 'completed' | 'feedback_received';

export declare const STATUSES: readonly ConsultationStatus[];
export declare const ACTIVE_STATUSES: readonly ConsultationStatus[];
export declare const TRANSITIONS: Readonly<Record<ConsultationStatus, readonly ConsultationStatus[]>>;
export declare const STATUS_LABELS: Readonly<Record<ConsultationStatus, string>>;
export declare function canTransition(from: string, to: string): boolean;
export declare function allowedFrom(to: ConsultationStatus): ConsultationStatus[];
