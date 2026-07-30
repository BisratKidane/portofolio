# Phase 17: /family Deep Tree Visualization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-24
**Phase:** 17-family-deep-tree-visualization
**Areas discussed:** Focal point & scope, Node content & click, Layout & spouse pairing, Backend query & gating

---

## Focal point & scope

### Rooting / initial view
| Option | Description | Selected |
|--------|-------------|----------|
| Ego-centric on viewer | Tree re-rooted/centered on the viewing member | |
| Whole forest, top-down | Apex ancestors at top, one canonical view, scroll to find yourself | |
| Whole forest + jump-to-me | Canonical top-down forest, auto-pan + highlight viewer's node on load, plus find-me button | ✓ |

### Disconnected roots
| Option | Description | Selected |
|--------|-------------|----------|
| Single canvas, side by side | All disconnected lineages on one canvas as separate clusters | |
| Primary tree only, others on demand | Viewer's lineage by default; other apex roots collapsed behind an expander | ✓ |
| You decide | Defer to library capability | |

### Initial expansion
| Option | Description | Selected |
|--------|-------------|----------|
| Viewer's direct line | Direct ancestors + descendants + spouse + siblings expanded | ✓ (both) |
| Just neighbors (1 hop) | Only viewer + 1 hop | |
| Root + path to viewer | Ancestral spine from apex down to viewer | ✓ (both) |

**User's choice:** BOTH the ancestral spine (apex → viewer path) AND the viewer's direct line are expanded on load; collateral collapsed.

### Navigation aids (multiSelect)
| Option | Description | Selected |
|--------|-------------|----------|
| Find-me / recenter button | Re-pan + highlight viewer's node | ✓ |
| Name search / jump | Search any member by name, pan-to | ✓ |
| Zoom controls + fit-to-view | Explicit +/- and fit/reset buttons | ✓ |
| Minimap | Corner overview map (xyflow-native) | ✓ |

**Notes:** All four navigation aids selected. Minimap flagged as library-dependent (native to @xyflow/react; conditional under the family-chart fallback).

---

## Node content & click

### Node content
| Option | Description | Selected |
|--------|-------------|----------|
| Avatar + name + years | Photo avatar + full name + birth–death years | ✓ |
| Avatar + name only | Avatar + name, dates on click | |
| Name only (compact) | Densest layout, details on click | |

### Node click behavior
| Option | Description | Selected |
|--------|-------------|----------|
| Read-only detail card | Popover/side-panel with full details, read-only | ✓ |
| Expand/collapse only | Click toggles branch only; details via /manage | |
| Detail card + 'Edit in /manage' | Read-only card with deep-link to edit if in scope | |

### Expand cue
| Option | Description | Selected |
|--------|-------------|----------|
| Toggle with hidden count | +/- badge showing hidden descendant count | |
| Plain +/- toggle | Simple chevron/toggle, no count | |
| You decide | Library-driven affordance | ✓ |

### Node markers (multiSelect)
| Option | Description | Selected |
|--------|-------------|----------|
| Highlight viewer's node | Viewer's own node distinguished | ✓ |
| Deceased indicator | Members with deathdate marked | |
| Editable-scope marker | Nodes in viewer's editable scope marked | |
| No markers | Uniform nodes | |
| **Gender indicator** (free-text) | Encode Male/Female/Other on the node | ✓ |

**User's choice:** Highlight viewer's node + a gender indicator (replaced deceased/editable-scope options via free text). Gender cue to be accessible, not color-only.

---

## Layout & spouse pairing

### Orientation
| Option | Description | Selected |
|--------|-------------|----------|
| Vertical top-down | Apex at top, descendants below (dagre TB) | ✓ |
| Horizontal left-right | Ancestors left, descendants right | |
| You decide / spike-driven | Spike determines | |

### Spouse pairing
| Option | Description | Selected |
|--------|-------------|----------|
| Adjacent + connector | Side-by-side, marriage connector, children from synthetic union node | |
| Single node, spouse attached | Blood-line primary node, spouse as attached badge | |
| You decide / spike-driven | Spike proves whichever renders cleanly at depth | ✓ |

### Library
| Option | Description | Selected |
|--------|-------------|----------|
| Spike xyflow first, fallback ready | Spike @xyflow/react + dagre; family-chart only if spike fails | ✓ |
| Prefer family-chart | Start with purpose-built genealogy lib | |
| You decide | Trust spike outcome, no preference | |

### Edge style
| Option | Description | Selected |
|--------|-------------|----------|
| Distinct marriage vs descent | Different styling per edge type | |
| Uniform lines | Plain uniform lines | |
| You decide / spike-driven | Library/spike defaults | ✓ |

---

## Backend query & gating

### Whole-tree read exposure
| Option | Description | Selected |
|--------|-------------|----------|
| New familyTree query | Dedicated requireFamilyAccess query; leave familyMembers admin-only | |
| Relax familyMembers | Change familyMembers guard requireAdmin → requireFamilyAccess, shared query | ✓ |
| You decide | Defer to planning | |

### Flat payload shape
| Option | Description | Selected |
|--------|-------------|----------|
| Flat nodes + edge IDs | motherId/fatherId/spouseIds fields; client assembles | |
| Flat nodes + nested {id} refs | Existing nested fields selected one level deep | |
| You decide | Planning picks after examining resolver/DataLoader wiring | ✓ |

### Component-test bar (QUAL-02)
| Option | Description | Selected |
|--------|-------------|----------|
| Logic-heavy, render-smoke | Thorough assembly unit tests + render smoke, mock layout lib | |
| Full component coverage attempt | Push jsdom coverage of pan/zoom/expand | |
| You decide | Planning sets split after spike reveals jsdom testability | ✓ |

**Notes:** Claude's default for the "you decide" test bar is logic-heavy + render-smoke (see CONTEXT.md Claude's Discretion).

---

## Claude's Discretion

- Expand/collapse affordance (count badge vs plain toggle) — library-driven.
- Spouse-pairing visual and edge styling — spike-driven.
- Flat payload field shape (ID fields vs nested `{id}` refs) — planning decides.
- Component-test split (QUAL-02) — default logic-heavy + render-smoke.

## Deferred Ideas

- Inline editing from tree nodes (CUR-01) — v2; `/family` stays read-only.
- Editable-scope node marker + "Edit in /manage" deep-link — considered, not selected.
- Duplicate-merge tooling (CUR-02), richer genealogy (GEN-01/02) — out of scope per REQUIREMENTS.md.
- Browser E2E (Playwright/Cypress) — out of scope.
