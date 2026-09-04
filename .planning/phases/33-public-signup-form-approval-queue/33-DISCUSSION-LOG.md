# Phase 33: Public Signup Form & Approval Queue — Discussion Log

**Date:** 2026-09-04
**Mode:** default (interactive)

> Human reference only — audits and retrospectives. Downstream agents read `33-CONTEXT.md`, not this file.

---

## Todo cross-reference

**CR-02 — account pre-hijacking** matched at 0.6 (`keywords: tokenless, register, account, password, before`).

- **Presented:** fold in as a decision / keep deferred and build the 4-field form / give it its own phase before 33
- **Selected:** Fold in as a decision

---

## Gray area selection

- **Presented:** Queue shape & the swap / Post-submit message / Relationship note in the queue / Validation split
- **Selected:** all four

Plus the folded CR-02 credential question, discussed first because it determines the form's shape.

---

## Area: Credential timing (CR-02)

**Q1 — When does a self-registrant's password get set?**
- Options: after verification (recommended) / at registration, invalidated on verify / at registration + explicit warnings
- **Selected:** At registration, invalidated on verify

**Q2 — After clicking the verification link, how do they get a working password?**
- Options: set-password form on the link (recommended) / email them a reset link / reuse the existing reset flow self-served
- **Answered freeform:** "On the registration form, they insert email and password in addition to first name and lastname."

**Q3 — Given the registration password is always discarded, does the form still collect one?**
- Options: drop it (3 fields) / keep it as REG-01 written / keep it and honour it for invited users
- **Selected:** Keep it — REG-01 as written

**Conflict raised.** Q1's answer (invalidate on verify) and Q2/Q3's answers (registrant types a password, field kept as written) could not both hold — either the typed password becomes the working credential or it does not. Also surfaced: Q2's answer introduced separate first/last name fields, which the backend does not model on `User`. Both were put back to the user rather than assumed.

**Q4 — Does the password typed on the signup form become the account's working password?**
- Options: yes, it just works / no, discarded and set again after verify / yes but only once verified by the owner
- **Selected:** Yes — it just works
- **Consequence:** CR-02 is accepted, not fixed. Recorded in CONTEXT.md D-01 with the full attack, so it is not later mistaken for an oversight. Todo file stays open, annotated.

**Q5 — First name and last name separately: how does that map to the backend?**
- Options: join client-side into `name` / add `firstname`/`lastname` to `User` / keep one "Full name" field
- **Selected:** Keep one "Full name" field → CONTEXT.md D-02

---

## Area: Queue shape & relationship note

**Q6 — How should a waiting account be laid out?**
- Options: keep the table (recommended) / switch to cards / table with expandable detail row
- **Selected:** Switch to cards → D-07

**Q7 — How is the relationship note rendered (optional, up to 500 attacker-controlled chars)?**
- Options: truncate with expand / always show in full / full text with capped height and scroll
- **Selected:** Always show in full → D-08

**Q8 — Should the admin have to give a reject reason?**
- Options: optional, prompt but allow empty / required / no reason at all
- **Selected:** Optional — prompt but allow empty → D-09

**Established during this area (not a question):** verified from the resolvers that after Phase 31 D-04/D-05 invited registrants auto-activate on verification, so `pendingApprovals` holds only self-registrants. There is one queue, not an invited-vs-self split. Recorded in D-10.

---

## Area: Post-submit message & validation

**Q9 — Where does the "what happens next" message appear?**
- Options: swap the form in place (recommended) / redirect to a dedicated page / inline Alert above the form
- **Selected:** Swap the form in place → D-05

**Q10 — Does the UI show the server's fixed message, or write its own?**
- Options: UI's own copy naming the address / server message verbatim / server message plus UI-added next steps
- **Selected:** UI's own copy, naming the address → D-06 (with the enumeration-safety reasoning recorded: safe only because the UI never branches on existence)

**Q11 — Where does field validation happen?**
- Options: client-side first with server backstop / submit and surface server errors / client-side for required/empty only
- **Selected:** Client-side first, server as backstop → D-04
- **Flagged at ask time and carried into CONTEXT.md as a hard constraint:** this is the CR-01 bug class from Phase 32. Client rules must be derived from, or tested for agreement against, the server-side policy modules — not hand-written approximations.

---

## Scope creep

None. Two ideas were raised and deferred rather than folded: splitting `User.name` into first/last (rejected as backend scope), and fixing CR-02 properly (consciously accepted instead).

---

*Phase: 33-public-signup-form-approval-queue*
