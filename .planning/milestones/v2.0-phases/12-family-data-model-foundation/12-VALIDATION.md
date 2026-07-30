---
phase: 12
slug: family-data-model-foundation
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-21
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already installed: `vitest@4.1.10`, `supertest@7.2.2`) |
| **Config file** | `backend/vitest.config.js` (existing — isolated MySQL `_test` harness) |
| **Quick run command** | `cd backend && npm test` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~20 seconds (estimate — small suite, real MySQL round-trips via `globalSetup.js`) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npm test`
- **After every plan wave:** Run `cd backend && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | MEM-01, MEM-02, MEM-03 | input-validation | Missing required fields / bad ENUM / future or inverted dates rejected | unit (RED) | `cd backend && npm test` | ✅ | ⬜ pending |
| 12-01-02 | 01 | 1 | MEM-01, MEM-02, MEM-03, MEM-05 | input-validation | `fullname` derived-only; required/optional field rules enforced at model layer | unit (GREEN) | `cd backend && npm test` | ✅ | ⬜ pending |
| 12-02-01 | 02 | 2 | REL-01, REL-03 | integrity (cascade) | Deleting a parent nulls children's `motherId`/`fatherId`, never deletes children | integration (RED) | `cd backend && npm test` | ✅ | ⬜ pending |
| 12-02-02 | 02 | 2 | REL-02 | integrity (duplicate/self) | One canonical spouse row per couple; no self-marriage; multiple spouse edges allowed | integration (RED) | `cd backend && npm test` | ✅ | ⬜ pending |
| 12-02-03 | 02 | 2 | REL-01, REL-02, REL-03 | integrity (FK) | `ON DELETE SET NULL` parent FKs + symmetric spouse read wired correctly | integration (GREEN) | `cd backend && npm test` | ✅ | ⬜ pending |
| 12-03-01 | 03 | 3 | REL-05 | integrity (cycle) | Parent edit making a member its own ancestor is rejected (direct + multi-gen) | integration (RED) | `cd backend && npm test` | ✅ | ⬜ pending |
| 12-03-02 | 03 | 3 | REL-01, REL-03, REL-05 | integrity (cycle) | `linkParent` runs `wouldCreateCycle` before persisting; `addChild` sets parent FK | integration (GREEN) | `cd backend && npm test` | ✅ | ⬜ pending |
| 12-04-01 | 04 | 4 | REL-02 | integrity (data-loss) | Blood relatives survive delete; married-in-only spouse removed one hop only | integration (RED) | `cd backend && npm test` | ✅ | ⬜ pending |
| 12-04-02 | 04 | 4 | REL-02, MEM-05 | integrity (data-loss) | `deleteMember` transaction-wrapped; fresh-DB `sync({force:true})` smoke + full suite green | integration (GREEN) | `cd backend && npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing infrastructure (`backend/vitest.config.js`, `backend/test/globalSetup.js`, `backend/test/helpers.js`, `env/test.env`) covers all phase requirements — reuse, do not reinstall.

*Existing infrastructure covers all phase requirements — no Wave 0 install needed.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification (every task's `<automated>` verify is `cd backend && npm test`).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — existing infra)
- [x] No watch-mode flags
- [x] Feedback latency < ~20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-21
