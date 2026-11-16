// Consultation states and the allowed changes between them. Used by the API
// to guard every update and by the dashboard and tracker to pick what to show.
// Keep ACTIVE_STATUSES in step with consultations_no_overlap in the migration.

export const STATUSES = Object.freeze([
  'requested', 'scheduled', 'rejected', 'cancelled', 'expired', 'completed', 'feedback_received',
]);

// Statuses that occupy the doctor's time; the database refuses overlaps among them.
export const ACTIVE_STATUSES = Object.freeze(['requested', 'scheduled']);

export const TRANSITIONS = Object.freeze({
  requested: Object.freeze(['scheduled', 'rejected', 'cancelled', 'expired']),
  scheduled: Object.freeze(['completed', 'cancelled']),
  completed: Object.freeze(['feedback_received']),
  rejected: Object.freeze([]),
  cancelled: Object.freeze([]),
  expired: Object.freeze([]),
  feedback_received: Object.freeze([]),
});

export const STATUS_LABELS = Object.freeze({
  requested: 'Waiting for the doctor',
  scheduled: 'Confirmed',
  rejected: 'Not accepted',
  cancelled: 'Cancelled',
  expired: 'Expired',
  completed: 'Completed',
  feedback_received: 'Feedback received',
});

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

// Every status that may move to `to`, for conditional updates that cannot race.
export function allowedFrom(to) {
  return STATUSES.filter((from) => TRANSITIONS[from].includes(to));
}
