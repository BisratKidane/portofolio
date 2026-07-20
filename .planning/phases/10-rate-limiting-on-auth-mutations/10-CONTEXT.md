# Phase 10: Rate Limiting on Auth Mutations - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Throttle brute-force / enumeration / reset-token-guessing attempts against the `login`, `register`, and `requestPasswordReset` GraphQL mutations, per client IP, without affecting ordinary queries (`me`, `dashboard`). Enforcement is an Apollo Server plugin at `didResolveOperation` (keyed `${clientIp}:${operationName}`), so it is exercised by the in-process `executeOperation()` harness with no HTTP boot required.

**In scope:** the rate-limit plugin, its in-memory counter store, the per-operation limit config, client-IP derivation, the generic 429 error, and tests proving throttle behavior + no enumeration oracle + normal-query immunity.

**Out of scope (own phases / deferred):** persistent/shared (Redis) counters, per-user (vs per-IP) limits, CAPTCHA/lockout escalation, and `resendVerificationEmail` throttling (Phase 11 folds into this same config map).
</domain>

<decisions>
## Implementation Decisions

### Counter store & scope
- **D-01:** Counters live in a module-level **in-memory `Map`** keyed by `${clientIp}:${operationName}`, holding attempt count + window-start timestamp. Zero new dependencies (matches the project's minimal-dependency ethos). No Redis/persistent store this milestone.
- **D-02:** Accepted trade-offs, to be documented, not fixed: counters **reset on server restart** and are **per-process** (a future multi-instance deploy would not share them). These are acceptable for the single-instance v1.1 app; a shared store is explicitly deferred.
- **D-03:** The store must expose a **reset hook** (e.g. `resetRateLimitStore()`) that tests call between cases, mirroring the existing `resetTables()` helper — otherwise counters bleed across tests. Test isolation for the limiter is a hard requirement.

### Client-IP trust / proxy
- **D-04:** `server.js` sets Express **`trust proxy = 1`** (single reverse-proxy hop) so `req.ip` resolves to the real client from `X-Forwarded-For` behind the documented Nginx/Caddy deploy. Correct-by-default for the single-proxy topology; must be **documented in README** so the trust boundary is explicit (and not silently spoofable by adding forged hops).
- **D-05:** The Apollo `context()` function derives `clientIp` from `req.ip` and puts it on `contextValue` (alongside `models`, `user`). The plugin reads `contextValue.clientIp` — never `req` directly — so `executeOperation()` tests inject `clientIp` via `contextValue` and stay HTTP-free (satisfies RATE-04). The `graphql()` test helper is extended to accept/inject a `clientIp`.

### Limits: fixed vs configurable
- **D-06:** Thresholds are a **centralized constants map** keyed by operation name — `login: 5 / 15 min`, `register: 5 / hour`, `requestPasswordReset: 5 / hour` (the ROADMAP defaults). No env-var surface this milestone.
- **D-07:** The map is the single edit point: tuning a limit is a one-line change, and Phase 11's `resendVerificationEmail` limit drops in as one more entry (per the ROADMAP Phase 11 dependency note). Operations **absent** from the map are unlimited (normal queries like `me`/`dashboard` are never keyed — RATE-04 / SC-4).

### 429 error response (UX vs security)
- **D-08:** A breach throws a **generic** `GraphQLError` — "Too many requests. Please try again later." — with `extensions.code = TOO_MANY_REQUESTS`. **No** retry-after, time-remaining, or attempt-count is leaked. The rejection happens at `didResolveOperation` (before the resolver runs), so the 429 fires **before** credentials are checked and the trigger count is **identical** for a real vs. nonexistent account — no new enumeration oracle (RATE-05 / SC-5). A dedicated test pins the real-vs-nonexistent parity.
- **D-09:** The frontend surfaces the throttle error through the **existing error `<Alert>`** on the auth pages — no special rate-limit UI.

### Claude's Discretion
- Window algorithm (fixed-window vs sliding) and the exact store data-shape are left to research/planning, provided per-IP+operation isolation, correct expiry, and deterministic test control over time (e.g. injectable clock or fake timers) are preserved.
- Whether the plugin is registered by sharing one Apollo plugin/config list between `server.js` and the `test/helpers.js` Apollo instance, vs. each constructing it — planner's call, but **both** Apollo instances MUST carry the plugin or the tests won't exercise production behavior (see Integration Points).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 10: Rate Limiting on Auth Mutations" — goal, the 5 success criteria (locks the plugin mechanism, thresholds, test approach, no-enumeration guarantee).
- `.planning/REQUIREMENTS.md` — RATE-01…RATE-05 (traceability targets for verification).

### Prior-phase patterns to follow
- `.planning/phases/09-session-revocation-via-passwordchangedat/09-CONTEXT.md` — decision-record style + manual-migration discipline (not needed here: no DB columns) and the central-guard precedent.
- `backend/src/utils/auth.js` — the `getUserFromRequest` central-check pattern (Phase 9); the limiter is the analogous central pre-resolver guard.

No external ADRs/specs — requirements fully captured in the decisions above.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/test/helpers.js` — `graphql(query, variables, user)` wraps `server.executeOperation(..., { contextValue: { models, user } })`. Extend its `contextValue` with `clientIp` so limiter tests inject an IP. `resetTables()` is the template for the required `resetRateLimitStore()` reset hook.
- `backend/src/server.js` — single Apollo instance + `context: async ({ req }) => ({ models, user })`. This is where `trust proxy = 1`, `clientIp` derivation, and plugin registration land.

### Established Patterns
- Apollo config is currently `new ApolloServer({ typeDefs, resolvers })` with **no plugins** — the plugin array is a new addition in both `server.js` and `test/helpers.js`.
- Resolver-layer errors are thrown `Error`/`GraphQLError` surfaced by Apollo; the 429 follows the same throw-based convention.
- Minimal-dependency ethos: hand-rolled in-memory limiter over a library (consistent with prior phases).

### Integration Points
- **Critical:** `test/helpers.js` constructs its **own** `ApolloServer` separate from `server.js`. The rate-limit plugin MUST be present on the instance the tests run against, or `executeOperation()` won't exercise it. Plan for a shared plugin/config source consumed by both.
- `context()` in `server.js` is the only place `req` is available in production; `clientIp` must be lifted onto `contextValue` there so the plugin never touches `req` (keeps it HTTP-free for tests).
</code_context>

<specifics>
## Specific Ideas

- Keep the limiter's public surface tiny: a config map + a plugin factory + a `resetRateLimitStore()` test hook. Everything keyed by GraphQL `operationName`, not URL/path.
- Parity test is explicit: same IP hitting `login` 6× with a real email vs a nonexistent email must 429 on the same attempt number.
</specifics>

<deferred>
## Deferred Ideas

- **Persistent / shared (Redis) rate-limit store** — needed only for multi-instance or restart-durable limits; revisit if the app scales beyond single-instance.
- **Env-configurable thresholds** — reconsider if ops need to tune limits without a redeploy.
- **Per-account or escalating lockout / CAPTCHA** — a different (heavier) anti-abuse capability; its own future phase if desired.
- **`resendVerificationEmail` throttling** — belongs to Phase 11, which adds one entry to this phase's config map.

</deferred>

---

*Phase: 10-rate-limiting-on-auth-mutations*
*Context gathered: 2026-07-20*
