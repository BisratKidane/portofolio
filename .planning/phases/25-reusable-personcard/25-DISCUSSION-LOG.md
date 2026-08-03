# Phase 25: Reusable PersonCard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-03
**Phase:** 25-reusable-personcard
**Areas discussed:** Card visual style, Fields & layout, Gender cue, Spouse presentation

---

## Card visual style

### Visual foundation
| Option | Description | Selected |
|--------|-------------|----------|
| Fresh /detail card | New vertical card, roomier than the tree node; reuses conventions not geometry | ✓ |
| Mirror /family MemberNode | Reuse compact 252×120 gender-tinted avatar-left card verbatim | |
| Adapt /manage row | Horizontal row like /manage | |

**User's choice:** Fresh /detail card

### Gender tint carry-over
| Option | Description | Selected |
|--------|-------------|----------|
| Keep border + soft tint | Same as /family: gender-colored border + faint tint on whole card | ✓ |
| Accent only (ring / top strip) | Gender color as smaller accent | |
| No gender color on card | Rely entirely on icon/label cue | |

**User's choice:** Keep border + soft tint

### Sizing across roles
| Option | Description | Selected |
|--------|-------------|----------|
| One fixed size, fluid width | Same design for all roles; width flexes to grid column, height grows | ✓ |
| Larger 'head' variant | Size/prominence prop for the main person | |
| Fixed pixel size like /family | Hard fixed box for every card | |

**User's choice:** One fixed size, fluid width

---

## Fields & layout

### "Relationship info" meaning (CARD-01)
| Option | Description | Selected |
|--------|-------------|----------|
| Relationship to main person | Role label (Child/Grandchild/Head) from card position | ✓ |
| Parent (mother's name) line | Mother's name line like /family | |
| Both role + parent line | Role chip AND mother line | |

**User's choice:** Relationship to main person

### Which detail fields to show
| Option | Description | Selected |
|--------|-------------|----------|
| Birth year | 'Born YYYY' when present | |
| Living/Deceased status | Living/Deceased chip from isAlive | ✓ |
| Address | Address with pin, living-only | |
| Phone | Contact number | |

**User's choice:** Living/Deceased status only (multi-select returned status alone)

### Confirm birth-info trim vs CARD-01
| Option | Description | Selected |
|--------|-------------|----------|
| Birth year + status | Show birth year + status; satisfies CARD-01 birth/death info | |
| Status only, no birth year | Only the status chip; recorded as deliberate CARD-01 trim | ✓ |
| Add address too | Birth year + status + address | |

**User's choice:** Status only, no birth year
**Notes:** Recorded as an intentional lean-card trim of CARD-01's "birth info" (D-06) so the planner/verifier don't flag the missing birth year as a defect.

### Card controls placement (CARD-04 + edit)
| Option | Description | Selected |
|--------|-------------|----------|
| Expand at bottom, edit top-right | Child count/expand full-width bottom; admin edit icon top-right | ✓ |
| Both in a bottom action row | Expand + edit share one footer row | |
| You decide | Defer to planning | |

**User's choice:** Expand at bottom, edit top-right

---

## Gender cue (CARD-03 — hard requirement)

### First pass — non-color cue
| Option | Description | Selected |
|--------|-------------|----------|
| Small gender icon | Compact ♂/♀/⚥ glyph + aria-label | |
| Text label | 'Male'/'Female'/'Other' label or chip | |
| Icon + accessible label | Visible icon with text label | |

**User's choice:** "none — the colors should be enough"
**Notes:** Claude flagged a conflict: CARD-03 explicitly requires a non-color cue "never by color alone," and A11Y-01/WCAG "use of color" would fail. Did not accept color-only; re-asked for the most minimal compliant cue.

### Minimal compliant cue
| Option | Description | Selected |
|--------|-------------|----------|
| Tiny corner glyph | Small low-contrast glyph | |
| Gender-shaped avatar ring | Ring style encodes gender, no glyph/text | |
| Tooltip label only | Visible only on hover — flagged as still non-compliant | |

**User's choice:** "if there is no photo there is an avatar in the card, that is enough on top of the color codes"
**Notes:** Claude verified `MemberFallbackAvatar` is gender-differentiated (illustrated male/female, neutral other) — a real visible cue for no-photo cards. Flagged the remaining gap: has-photo cards would fall back to color-only. Re-asked to cover that case.

### Always-present cue for has-photo cards
| Option | Description | Selected |
|--------|-------------|----------|
| Gender-shaped avatar ring | Ring border style (solid/dashed/dotted) over any photo | ✓ |
| Keep glyph after all | Tiny corner glyph as universal cue | |
| Fallback avatar only, accept gap | Photo cards stay color-only (recorded gap) | |

**User's choice:** Gender-shaped avatar ring
**Notes:** Final cue stack (D-09/D-10/D-11): avatar ring shape (always on) + gendered fallback avatar (no-photo) + color border/tint + aria-label. Fully satisfies CARD-03 for photo and no-photo cards.

---

## Spouse presentation (SPOUSE-01)

### How spouses surface
| Option | Description | Selected |
|--------|-------------|----------|
| Paired cards + dashed connector | Spouse as a second PersonCard beside the person, /family dashed connector | ✓ |
| Compact spouse strip inside card | Small avatar + name row docked in the card | |
| Adjacent mini-card | Smaller subordinate card | |

**User's choice:** Paired cards + dashed connector

### Spouse card expand parity
| Option | Description | Selected |
|--------|-------------|----------|
| No expand on spouse card | Spouse full card without its own expand control | ✓ |
| Spouse card can also expand | Symmetric; risks duplicate children | |
| You decide | Defer to Phase 27 | |

**User's choice:** No expand on spouse card
**Notes:** Couple's children hang off the descendant (blood-line) person; avoids offering shared children twice (D-13).

### Multiple spouses
| Option | Description | Selected |
|--------|-------------|----------|
| All as paired cards in a row | Each spouse its own paired card | |
| Show one, indicate others | First spouse + '+N more' | |
| You decide | Defer to real-data commonness | |

**User's choice:** "only the last one should be visible. It is not possible to have two spouses"
**Notes:** At most one spouse shown — the last entry in `spouses` (D-14). Deliberately scopes SPOUSE-01's "spouse(s)" to a single displayed spouse.

---

## Claude's Discretion

- Exact ring-style→gender mapping, ring thickness, and ring/`MemberAvatarImage` composition.
- Avatar shape (circle vs rounded-square), card padding/spacing.
- Off-canvas dashed-connector rendering technique (reuse /family's visual language).
- Chevron/expand iconography and status-chip styling.
- Which `spouses` index is "last" if ordering is ambiguous (default: final element).

## Deferred Ideas

- Birth year / address / phone on the card — intentionally omitted (D-06).
- Multiple concurrent spouses / fuller genealogy — not modeled (D-14).
- Larger emphasized "head" card variant — rejected for D-03.
- Wiring the edit/add dialogs — Phase 28 (PERM-01/02).
