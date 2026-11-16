// Errors a store raises for expected conflicts. The service turns these into
// friendly HTTP responses.
export class StoreConflict extends Error {
  constructor(code) {
    super(code);
    this.code = code; // 'slot_taken' | 'hold_expired' | 'ref_taken' | 'feedback_exists'
  }
}

export const ACTIVE = ['requested', 'scheduled'];
