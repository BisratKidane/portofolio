// Single edit point for tuning any threshold below. A GraphQL Mutation field name absent from
// this map is treated as unlimited by the consuming plugin (Plan 10-02) — do not add `logout`,
// `me`, or `dashboard` here.
// resendVerificationEmail was added in Phase 11 (VERIFY-07).
export const RATE_LIMITS = {
  login: { max: 5, windowMs: 15 * 60 * 1000 },
  register: { max: 5, windowMs: 60 * 60 * 1000 },
  requestPasswordReset: { max: 5, windowMs: 60 * 60 * 1000 },
  resendVerificationEmail: { max: 5, windowMs: 60 * 60 * 1000 }
};
