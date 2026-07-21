# Stack Research

**Domain:** Stack additions for a collaborative family-tree domain (deep multi-generation tree visualization, photo upload, self-referential relational modeling) bolted onto an existing, shipped Express 4 + Apollo Server 4 + React 18/MUI 6 + Sequelize 6/MySQL app — v2.0 milestone, NOT a greenfield stack pick
**Researched:** 2026-07-21
**Confidence:** HIGH (all package versions/publish dates/peer-deps verified live against the npm registry; Sequelize association patterns verified against official Context7-indexed docs; Apollo's own upload guidance verified against its official blog post)

## Scope Note

This is an *addendum* to `.planning/codebase/STACK.md`, not a re-derivation of it. The existing stack (React 18.3, MUI 6.3, React Router 6.28, Axios 1.7 with raw GraphQL query strings and **no Apollo Client**, Express 4.21, Apollo Server 4.11 via `expressMiddleware`, GraphQL 16.10, Sequelize 6.37 + mysql2 3.11, Vitest, Docker Compose) is treated as fixed. Only the three new capabilities this milestone needs are researched: (1) a deep-tree visualization library, (2) photo-upload handling compatible with Apollo Server 4 + a no-Apollo-Client Axios frontend, and (3) Sequelize patterns for self-referential parent/child and spouse relationships (no new ORM).

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@xyflow/react` | `^12.11.2` | Renders the `/family` deep tree: nodes, edges, pan/zoom, minimap, controls | This is **React Flow** under its current scoped package name (the old `reactflow`/`react-flow-renderer` names are deprecated redirects). Actively maintained on a near-weekly cadence — `12.11.2` published **2026-07-06**, days before this research. Peer deps are `react: >=17`, `react-dom: >=17` — satisfied by the installed React 18.3. Nodes are **plain React components** you author yourself, so a node can render an MUI `Card`/`Avatar`/`Chip` directly (Emotion styling co-exists fine; only extra step is importing `@xyflow/react/dist/style.css` once, which doesn't conflict with MUI's `CssBaseline`). Pan/zoom, box-select, and a `<Controls>`/`<MiniMap>` are built-in (backed by `d3-zoom`/`d3-drag` internally) — no hand-rolled gesture code needed. Because you own the nodes/edges arrays, **collapsible/lazy branches are a first-class, documented pattern**: toggle a node's `hidden` flag to collapse a subtree, or fetch a person's children from GraphQL only when their node is expanded and merge the results into state (React Flow's own docs recommend exactly this `hidden`-property approach for large/deep graphs, and ship an official "Expand and Collapse" example at `reactflow.dev/examples/layout/expand-collapse`). Bundle size: **~59 KB gzipped** (main bundle, includes `zustand` for internal state + d3 sub-deps) — acceptable for a single feature page loaded behind a route, not the whole app shell. |
| `@dagrejs/dagre` | `^3.0.0` | Computes hierarchical (x, y) node positions for the tree before handing them to React Flow | React Flow has **no built-in auto-layout** — it only renders nodes at coordinates you supply, so a layout algorithm is mandatory for anything beyond a hand-placed diagram. `@dagrejs/dagre` is the actively-maintained fork of the original `dagre` project (`3.0.0`, published **2026-03-22**) — critically, this is **not** the plain `dagre` package on npm, which last published in **2022-06-14** and is effectively abandoned. `reactflow.dev` ships an official, currently-maintained "Dagre Tree" example using exactly this fork. Dagre trades perfect optimality for speed and simplicity, which is the right tradeoff here: because branches are lazily expanded (only a small visible subset of the 10–23 generation tree is ever laid out at once), you never ask dagre to lay out the whole tree in one pass. Gzip size: **~13 KB**. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `multer` | `^2.2.0` | Express middleware that parses `multipart/form-data` file uploads on a **dedicated REST route**, separate from `/graphql`, writing the photo to the mounted Docker volume | This is the file-upload mechanism (see Question 2 write-up below for the full end-to-end flow). **Must be `2.x`, not `1.x`**: versions `>=1.4.4-lts.1, <2.0.2` carry two unpatched DoS CVEs — `CVE-2025-7338` (malformed multipart request crashes the process) and `CVE-2025-48997` (empty-string field name triggers an uncaught exception that kills the Node process). `2.2.0` (published **2026-06-15**) is well past the `2.0.2` fix line. Peer requirement is only `node >= 10.16.0` — trivially satisfied by the repo's Node 24 runtime. Core API (`upload.single()`, `diskStorage`, `fileFilter`) is unchanged from 1.x, so there's no unfamiliar API to learn. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `supertest` (already added in v1.1, `^7.2.2`) | HTTP-level Vitest test for the new multer REST upload route | The multer route is Express middleware sitting *outside* the GraphQL execution path — like the v1.1 rate-limit/CORS fixes, it's invisible to the in-process `executeOperation()` harness and needs a real `supertest` request against the exported Express `app`. Reuse the pattern already established in v1.1 rather than adding a new HTTP test tool. |
| `d3-hierarchy` (transitively available, not a direct install) | Not recommended as a direct dependency — see "What NOT to Use" | Included here only to name it explicitly as considered-and-rejected; see below. |

## Installation

```bash
# Frontend workspace — tree visualization
npm install --workspace frontend @xyflow/react@^12.11.2 @dagrejs/dagre@^3.0.0

# Backend workspace — photo upload
npm install --workspace backend multer@^2.2.0

# No new dev/test dependencies — reuse supertest@^7.2.2 already installed in backend from v1.1
```

No new Sequelize packages are needed (see Question 3 below) — `sequelize@6.37.8` (already installed) covers both association shapes natively.

## Question 1 — Tree Visualization Library: Detailed Comparison

| Library | Current version | Last publish | React/MUI fit | Spouse-pairing | Large/deep trees | Verdict |
|---|---|---|---|---|---|---|
| **`@xyflow/react`** (React Flow) | `12.11.2` | **2026-07-06** | Native React components; nodes are JSX, so MUI `Card`/`Avatar` drop straight in | No built-in concept, but the standard pattern (used in multiple public family-tree-on-React-Flow projects) is a small **synthetic "union" node** between two spouse nodes, with children edges hanging off the union node rather than off either parent directly — this is also structurally how GEDCOM's "FAM" record works, which pays off if GEDCOM import is tackled in a future milestone | No built-in virtualization, but the `hidden`-node-property pattern (officially documented) + lazy per-branch GraphQL fetch keeps the actually-rendered node count small regardless of total tree depth | **Recommended** |
| `react-d3-tree` | `3.6.6` | **2025-02-28** (~17 months stale as of this research) | React component wrapper around D3, but no native MUI slot — nodes render as SVG `<foreignObject>`, workable but clunkier | No native spouse concept; would need the same synthetic-node workaround, with less documented prior art than React Flow | **Documented, known performance cliff**: community issue reports ~500 nodes freezing the page for about a minute; no virtualization | Rejected — maintenance has stalled (no npm release in over a year) and the exact failure mode (large-tree freeze) is the exact risk this milestone's "10–23 generations" requirement runs into |
| Raw `d3-hierarchy` + `dagre`, hand-rolled SVG/Canvas | `d3-hierarchy@3.1.2` (2022), `dagre@0.8.5` (2022, unmaintained — use `@dagrejs/dagre` if going this route) | n/a (algorithm libraries, not full viz solutions) | Full control, but **you build pan/zoom, node components, hit-testing, and React reconciliation yourself** — React Flow already ships all of this on top of the same underlying d3-zoom/d3-drag primitives | Full manual control, same synthetic-node technique applies | Full manual control over rendering strategy (e.g., canvas for very large trees) — most flexible, most work | Rejected as primary — reinvents what React Flow already provides; only worth it if React Flow's DOM-per-node rendering ever proves to be the bottleneck (unlikely given lazy/collapsed branches keep visible node counts small) |
| `family-chart` (genealogy-specific, `donatso/family-chart`) | `0.9.0` | 2025-10-21 | **Framework-agnostic vanilla D3** — no native React component; needs manual `useEffect` + ref wiring to mount/unmount inside React's lifecycle, which is exactly the kind of DOM-vs-React ownership conflict that causes bugs on re-renders/route changes | **Best native spouse support of any option researched** — spouse pairing, collapsible branches, and pan/zoom are purpose-built genealogy features, not adapted from a generic graph library | Vendor's own site advertises a **paid "premium" tier with "Performance Optimizations"** — a strong signal the free/open-source version has real headroom limits, which is a direct risk against this milestone's explicit 10–23 generation depth requirement | Rejected as primary — genuinely the most on-the-nose feature set for genealogy, but the combination of (a) no first-class React integration and (b) performance headroom apparently gated behind a paywall makes it a worse fit than React Flow for *this* stack and *this* depth requirement. Worth a second look only if React Flow's synthetic-union-node approach proves awkward in practice. |
| `relatives-tree` + `react-family-tree` | `relatives-tree@3.2.2` (2025-03-16, the layout-math package); `react-family-tree@3.2.0` (**2022-07-18**, the React binding) | Layout math actively maintained; React wrapper is 4 years stale | Purpose-built family-tree layout (handles couples as first-class layout units) with a thin React renderer | **Native, first-class** — this is the one library here designed around couples-as-a-unit from the ground up | Layout algorithm is fast (positions computed as plain objects, rendering-agnostic), but the React binding predates React 18 concurrent features and hasn't been touched since | Rejected as primary due to the React wrapper's staleness (peer dep only demands `react >= 16`, no confirmed React 18 testing), but flagged as worth revisiting narrowly for its layout algorithm (`relatives-tree` alone, rendering-agnostic) if React Flow's manual synthetic-node layout ever becomes a maintenance burden |

**Recommendation: `@xyflow/react` + `@dagrejs/dagre`.** It's the only option in this comparison that is simultaneously (a) actively maintained on a near-weekly cadence, (b) natively React-idiomatic (so MUI components compose directly into tree nodes without DOM-ownership conflicts), and (c) has an officially documented pattern for both auto-layout (Dagre example) and collapsible/lazy branches (Expand-and-Collapse example) — the two hardest requirements this milestone has. The spouse-pairing gap is real but solvable with the synthetic "union node" technique, which is well-precedented in public React-Flow family-tree projects and has the side benefit of mirroring GEDCOM's own data model if genealogy import is ever revisited.

## Question 2 — Photo Upload: Apollo Server 4 vs. Multer REST Endpoint

**Recommendation: a dedicated REST multipart endpoint via `multer`, NOT `graphql-upload`.**

### Why not `graphql-upload`

- **Apollo's own guidance rejects it.** Apollo's official blog ("File Upload Best Practices") explicitly states multipart uploads through the GraphQL server "introduce major security issues" and does not recommend `graphql-upload` for anything beyond a hobby project — its own recommended paths are a dedicated image service or client-direct signed-URL uploads to cloud storage, neither of which fits this milestone's mounted-Docker-volume requirement.
- **Apollo Server 4 defaults `csrfPrevention: true`** (v3 defaulted it to `false`). This blocks any request whose `Content-Type` is `multipart/form-data` (among others) *unless* it also carries a non-empty `X-Apollo-Operation-Name` header or an `Apollo-Require-Preflight` header. Apollo Client injects this automatically. **This app has no Apollo Client** — the frontend's Axios-based `graphqlClient.js` sends raw query strings with plain `Content-Type: application/json`. Wiring `graphql-upload` in would mean either (a) manually adding a bespoke header to every upload-related Axios call (fragile, easy to regress since nothing enforces it at compile time), or (b) setting `csrfPrevention: false`, which reopens exactly the CSRF-adjacent risk surface this app's v1.1 milestone spent five phases hardening. Neither is acceptable given the "no application runtime regressions" discipline this codebase has shown across v1.0/v1.1.
- `graphql-upload@17.1.0` (published literally the day of this research, so not a maintenance concern per se) still requires `graphql: ^16.3.0 || ^17.0.0` and works by making resolver argument values into Promises that resolve to file streams — a resolver-shape change that ripples into every mutation touching `profilePicture`, for a feature (multipart-over-GraphQL) that Apollo itself steers you away from.

### Why a dedicated REST endpoint + `multer` fits this stack specifically

- It is **fully orthogonal to Apollo Server's CSRF/CSP posture** — the upload route lives on the same Express `app` but entirely outside `/graphql`, so none of Apollo Server's request-shape checks apply to it. It gets its own auth check instead (see below).
- It matches Apollo's own "separate the high-cost upload logic from data-manipulation logic" recommendation precisely: upload the bytes over REST, then reference the resulting path in an ordinary GraphQL mutation.
- It plays cleanly with the **mounted Docker volume** requirement: `multer.diskStorage()` writes directly to a volume-mounted directory, no intermediate buffering-to-cloud-storage step needed (unlike Apollo's signed-URL recommendation, which assumes S3/GCS).
- The existing `uuid@11.0.3` dependency (already installed backend-side, currently unused per `.planning/codebase/STACK.md`) is a natural fit for generating collision-proof upload filenames (`crypto.randomUUID()` from `node:crypto` also works with zero new dependency, since Node 24 has it built in — either is fine, but reusing `uuid` finally gives that dependency a purpose).

### Concrete end-to-end flow (Axios, no Apollo Client)

1. **Frontend UI:** an MUI `Button` with `component="label"` wraps a visually-hidden `<input type="file" accept="image/*" hidden />`, following the standard MUI file-upload pattern (MUI has no dedicated upload component; this composition is the documented approach).
2. **Client request:** on file selection, build `const formData = new FormData(); formData.append('photo', file);` and `axios.post('/api/family-members/:id/photo', formData, { headers: { Authorization: \`Bearer ${token}\` } })`. **Do not** manually set `Content-Type` — letting Axios/the browser set it preserves the required `multipart/form-data; boundary=...` value that `multer` parses.
3. **Backend route:** a new Express route (e.g., `backend/src/routes/upload.js`), mounted in `server.js` alongside (not through) the Apollo `expressMiddleware`, e.g. `app.post('/api/family-members/:id/photo', requireAuthMiddleware, upload.single('photo'), uploadHandler)`. The route reuses the JWT-verification logic already in `backend/src/utils/auth.js` — wrapped as a small Express middleware function so the same "who is this request from" logic isn't duplicated — and enforces the same member-scoped permission rule as the GraphQL resolvers (self or ADMIN only) before invoking `multer`.
4. **Storage:** `multer.diskStorage({ destination: '<mounted-volume-path>/family-photos', filename: (req, file, cb) => cb(null, \`${uuid()}${path.extname(file.originalname)}\`) })`, plus a `fileFilter` restricting to image MIME types and a `limits.fileSize` cap.
5. **Response:** the route returns `{ path: '/uploads/family-photos/<uuid>.jpg' }` as plain JSON (not GraphQL).
6. **Persisting the reference:** the frontend then calls the *existing* `graphqlRequest()` helper with a normal `updateFamilyMember` mutation, setting `profilePicture` to the returned path — this is the step that goes through Apollo Server normally, with `Content-Type: application/json`, which **is not subject to the CSRF-prevention multipart/preflight-header requirement at all**, so nothing here needs a CORS/CSRF exception.
7. **Serving the photo:** `app.use('/uploads', express.static('<mounted-volume-path>'))` mounted in `server.js` next to the existing `/health` route; the frontend then renders `<img src={\`${apiOrigin}${familyMember.profilePicture}\`} />` directly — `<img>` tags are not subject to CORS the way `fetch`/`XHR`/canvas-read are, so no CORS config changes are needed for image display even if frontend and backend are on different origins.

## Question 3 — Sequelize 6 Patterns for Self-Referential Associations

No new ORM or Sequelize plugin is needed — `sequelize@6.37.8` supports both association shapes natively. Verified against the official Sequelize v6 docs (Context7 `/websites/sequelize_v6`, HIGH confidence).

### Parent↔child (adjacency list, one-to-many self-reference)

Standard `belongsTo`/`hasMany` pair on the same model, with an alias (`as`) and an explicit `foreignKey` on both sides so the generated column name is predictable and consistent between the two calls (Sequelize's own naming-strategies docs warn that omitting `foreignKey` on only one side of a self-referential pair produces unreliable/mismatched column names):

```javascript
// backend/src/models/FamilyMember.js — associations registered in models/index.js, matching the existing barrel pattern
FamilyMember.belongsTo(FamilyMember, { as: 'father', foreignKey: 'fatherId' });
FamilyMember.belongsTo(FamilyMember, { as: 'mother', foreignKey: 'motherId' });
FamilyMember.hasMany(FamilyMember, { as: 'fatheredChildren', foreignKey: 'fatherId' });
FamilyMember.hasMany(FamilyMember, { as: 'motheredChildren', foreignKey: 'motherId' });
```

Using two explicit FK columns (`fatherId`/`motherId`) rather than one generic `parentId` avoids needing a join table for the common two-parent case and keeps single-hop `include: [{ association: 'father' }, { association: 'mother' }]` queries trivial. Siblings (per this milestone's spec: "derived from shared parents") are then a plain query — members sharing the same `fatherId` and/or `motherId` — not a separate association at all.

**Flag for the roadmap, not a library gap:** Sequelize has no built-in recursive/CTE query helper for walking N-deep ancestor/descendant chains in one query (no ORM does, natively — recursive CTEs are hand-written SQL in every JS ORM this size). For the "10–23 generations" `/family` tree, the practical pattern — and the one that also satisfies "collapsible/lazy branches" — is **iterative, per-branch fetching from the resolver** (fetch one member + immediate children/spouse per GraphQL call as the user expands a branch in React Flow), not one giant recursive query for the whole tree. This keeps both the DB query pattern and the frontend rendering pattern lazy and matched to each other, and needs no raw-SQL CTE at all for the MVP depth. If a future milestone wants a single "load whole tree" query, a raw `sequelize.query()` with a `WITH RECURSIVE` CTE (MySQL 8+ supports this — already the pinned DB version) is the fallback, not a new dependency.

### Spouse (many-to-many self-reference, symmetric/undirected)

Sequelize's own advanced-associations docs confirm the pattern directly: `Person.belongsToMany(Person, { as: 'Children', through: 'PersonChildren' })` — the same shape applies to a spouse/marriage relationship:

```javascript
FamilyMember.belongsToMany(FamilyMember, {
  as: 'spouses',
  through: 'Marriages',
  foreignKey: 'memberId',
  otherKey: 'spouseId',
});
```

**The one real gotcha (confirmed via Sequelize's own GitHub issue tracker, not just training data):** a self-referential `belongsToMany` is inherently **directional** in the generated SQL (`memberId`/`otherKey` columns), but a spouse relationship is conceptually **symmetric** — "A is B's spouse" must be true from either A's or B's row. The two workable options:
1. **Write both directions on marriage creation** — when linking A↔B, insert two rows into `Marriages` (`{memberId: A, spouseId: B}` and `{memberId: B, spouseId: A}`), so a plain one-directional `member.getSpouses()` call from either side works with no query-time special-casing. **Recommended** — simplest, keeps every read path (including the `/family` tree resolver's per-branch fetch) a single unmodified `belongsToMany` query.
2. **Single row + `Op.or` query** — store one row per marriage (with an app-level convention like `memberId < spouseId` to avoid duplicates) and query with `where: { [Op.or]: [{ memberId: id }, { spouseId: id }] }` on the raw join table. Fewer rows, but every read path needs the `Op.or` awareness — including inside any `include` on the association, which Sequelize's own `belongsToMany` include mechanism does not do for you automatically. More fragile long-term.

Given this milestone's `/manage` UI lets member-users and admins add/edit relationships directly (not a one-time import), **option 1 (symmetric double-write)** is the safer default — it means every future read path (GraphQL resolver, tree traversal, sibling-derivation query) can use the association exactly as Sequelize generates it, with no bespoke `Op.or` logic to remember or forget in a new query.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| `@xyflow/react` + `@dagrejs/dagre` | `family-chart` (genealogy-specific, native spouse/couple support) | If the synthetic-union-node approach in React Flow proves awkward in practice, or if the team is fine building a `useEffect`+ref wrapper around a vanilla-D3 library and accepts the risk that performance headroom for very deep trees may sit behind the vendor's paid tier. |
| `@xyflow/react` + `@dagrejs/dagre` | `relatives-tree` (layout algorithm only, not the stale `react-family-tree` binding) | If a future maintenance burden emerges from hand-building the synthetic-couple-node layout logic on top of dagre, `relatives-tree`'s rendering-agnostic layout math (still actively maintained as of 2025-03) could replace just the layout step while keeping React Flow (or any renderer) for the visual layer. |
| `@dagrejs/dagre` for layout | `elkjs` (`^0.12.0`, published **2026-07-17** — very actively maintained, and React Flow ships an official example for it too) | If dagre's layout ever proves too rigid for enforcing strict spouse-adjacency or generation-row alignment across many branches at once — ELK's layered algorithm exposes far more layout constraints (e.g., explicit in-layer ordering) at the cost of a larger, more complex configuration surface. Not justified for the MVP given lazy/collapsed branches keep each layout pass small. |
| `multer` REST endpoint | Signed URLs to cloud object storage (S3/GCS), per Apollo's own top recommendation | If a later milestone moves off the mounted-Docker-volume model (already explicitly deferred — "Deferred to a later milestone: ... object-storage photos" per `PROJECT.md`). Not applicable to this milestone's stated storage requirement. |
| `multer` REST endpoint | `graphql-upload` / `graphql-upload-minimal` | Only if the frontend later adopts a full GraphQL client (Apollo Client/urql) that automatically attaches the required CSRF-preflight headers — at that point the header-friction argument above disappears, though Apollo's security guidance against multipart-over-GraphQL still stands independently. |
| Symmetric double-write for `Marriages` join rows | Single-row + `Op.or` query convention | If storage/row-count optimization ever matters more than query-path simplicity (unlikely at this app's portfolio scale — a few hundred family members at most). |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `react-d3-tree` | No npm release in ~17 months (last: 2025-02-28); community-documented performance cliff at a few hundred nodes (page freezes ~1 minute) — directly conflicts with this milestone's 10–23-generation depth requirement | `@xyflow/react` + `@dagrejs/dagre` |
| Plain `dagre` (unscoped npm package, not `@dagrejs/dagre`) | Last published 2022-06-14 — effectively abandoned; the community has moved to the `@dagrejs/dagre` fork, which is what React Flow's own official example uses today | `@dagrejs/dagre@^3.0.0` |
| `graphql-upload` / `graphql-upload-minimal` | Apollo's own blog steers away from multipart-over-GraphQL entirely; Apollo Server 4's default `csrfPrevention: true` requires a preflight header this app's Apollo-Client-less Axios frontend has no automatic mechanism to attach; fixing that by disabling `csrfPrevention` reopens a CSRF-adjacent risk surface right after v1.1 spent five phases hardening the app's security posture | A dedicated `multer`-backed REST route, decoupled from `/graphql` entirely (see Question 2 flow above) |
| `multer@1.x` (including LTS tags like `1.4.5-lts.2`) | Two unpatched DoS CVEs (`CVE-2025-7338`, `CVE-2025-48997`) affecting all `1.4.4-lts.1`–`<2.0.2` versions — a malformed or empty-field multipart request can crash the whole Node process | `multer@^2.2.0` |
| `family-chart` as the primary/only tree library | No native React component (manual `useEffect`+ref DOM ownership, real risk of bugs on route change/unmount); the vendor's own site advertises a paid tier for "Performance Optimizations," suggesting the free tier has real headroom limits — a direct risk against the 10–23 generation depth requirement | `@xyflow/react`, with the synthetic-union-node technique for spouse pairing |
| `react-family-tree` (the React binding, not the `relatives-tree` layout package it wraps) | Last published 2022-07-18 (4 years stale); no confirmed React 18 concurrent-mode testing | `@xyflow/react`, or `relatives-tree`'s layout math alone if a dedicated genealogy layout algorithm is wanted later |
| A hand-rolled recursive Sequelize `WITH RECURSIVE` CTE for the whole tree in this milestone's MVP | Not needed given lazy/collapsible branches — building it now solves a problem ("load the whole 10–23-generation tree in one query") this milestone's UI doesn't actually have, since branches expand incrementally | Iterative, per-branch resolver queries (fetch one member + immediate relations per GraphQL call as branches expand) |
| A single asymmetric `Marriages` row + no query-time symmetry handling | Silently breaks "is X married to Y" lookups from one direction while working from the other — an easy, hard-to-notice bug in a member-editable `/manage` UI | Symmetric double-write on marriage creation (see Question 3), or the `Op.or` convention if row-count optimization is prioritized instead |

## Stack Patterns by Variant

**If the synthetic spouse "union node" pattern in React Flow proves awkward during implementation:**
- Fall back to rendering spouse pairs as a single wider node containing both people (two MUI `Avatar`s side by side inside one React Flow node) instead of two separate nodes joined by a union node
- Because this sidesteps the need for dagre/elk to understand "these two nodes must be adjacent" at all — the pairing becomes a rendering concern inside one node, not a layout-graph concern between two nodes

**If dagre's layout output looks visually wrong for deep/wide trees once real data is loaded:**
- Swap `@dagrejs/dagre` for `elkjs@^0.12.0` (drop-in swap at the layout-computation step only — both just return `{x, y}` per node id, consumed identically by React Flow)
- Because ELK's layered algorithm exposes explicit inter-layer spacing and in-layer ordering constraints that dagre doesn't, at the cost of a more verbose configuration object

**If a future milestone drops the mounted-Docker-volume requirement in favor of object storage:**
- Swap the `multer.diskStorage()` call for `multer.memoryStorage()` + a direct S3/GCS SDK upload inside the same route handler, or move to client-side signed-URL uploads per Apollo's top recommendation
- Because the REST-route-plus-GraphQL-mutation-for-metadata split already isolates "how bytes get stored" from "how the app records the reference" — only the `multer` storage engine option changes, not the overall architecture

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `@xyflow/react@12.11.2` | `react@18.3` / `react-dom@18.3` (installed) | Peer requirement is `react: >=17`, `react-dom: >=17` — satisfied. Peer also lists `@types/react: >=17`/`@types/react-dom: >=17`, irrelevant here since this codebase has no TypeScript. |
| `@xyflow/react@12.11.2` | MUI 6.3 / Emotion 11.14 (installed) | No conflict — React Flow's own stylesheet (`@xyflow/react/dist/style.css`) is scoped to its own node/edge/pane class names; import it once (e.g., in the `/family` page or `main.jsx`) alongside the existing MUI `ThemeProvider`/`CssBaseline` setup with no ordering requirements observed. |
| `@dagrejs/dagre@3.0.0` | `@xyflow/react@12.11.2` | Not a direct peer dependency — dagre computes plain `{x, y}` coordinates consumed manually and passed into React Flow's `nodes` array; this is the same integration shape shown in React Flow's own official "Dagre Tree" example. |
| `multer@2.2.0` | `express@4.21.2` (installed) | Multer is Express-native middleware (`upload.single(fieldName)` returns standard `(req, res, next)` middleware); no explicit peer-dependency declaration, but it's the same de facto standard multipart middleware used across the Express ecosystem for years. Engine floor is `node >= 10.16.0`, trivially satisfied by Node 24. |
| `sequelize@6.37.8` (installed) | Self-referential `belongsTo`/`hasMany`/`belongsToMany` | No version bump needed — these association shapes have been stable Sequelize 6 API since early 6.x; verified directly against the current v6 docs (Context7 `/websites/sequelize_v6`), not inferred from training data. |
| `@apollo/server@4.11` (installed, unchanged) | `csrfPrevention` default | Confirmed still defaults to `true` in the 4.x line (unchanged from when v1.1 was researched); this is precisely why the photo-upload recommendation routes around `/graphql` entirely rather than trying to carve out an exception. |

## Sources

- npm registry (`npm view <pkg> version/time.modified/peerDependencies/dependencies/engines`) — live-verified versions and publish dates for `react-d3-tree`, `@xyflow/react`, `d3-hierarchy`, `dagre`, `@dagrejs/dagre`, `relatives-tree`, `family-chart`, `react-family-tree`, `entitree-flex`, `elkjs`, `multer`, `graphql-upload`, `graphql-upload-minimal`, `@apollo/server`, `sequelize`. HIGH confidence (primary source, checked directly against the registry).
- Context7 (`ctx7` CLI, `/websites/sequelize_v6`) — confirmed official self-referential `belongsTo`/`hasMany`/`belongsToMany` patterns and the `as`/`foreignKey` alias requirements directly from Sequelize's own docs, not a third-party tutorial. HIGH confidence.
- [Apollo GraphQL Blog — File Upload Best Practices](https://www.apollographql.com/blog/file-upload-best-practices) — confirmed Apollo's own recommendation against `graphql-upload` for production use and its preference for signed-URL/dedicated-service uploads. HIGH confidence (official vendor source).
- [reactflow.dev — Layout examples](https://reactflow.dev/examples/layout/dagre), [Elkjs Tree](https://reactflow.dev/examples/layout/elkjs), [Expand and Collapse](https://reactflow.dev/examples/layout/expand-collapse) — confirmed official dagre/elkjs integration patterns and the documented `hidden`-property collapse/expand technique for large graphs. HIGH confidence (official vendor docs/examples).
- [reactflow.dev — Performance guide](https://reactflow.dev/learn/advanced-use/performance) — confirmed no built-in viewport culling; the `hidden` node property is the documented technique for large/deep graphs. MEDIUM confidence (WebFetch summary of official docs, not a raw excerpt).
- WebSearch: react-d3-tree maintenance/performance ([Snyk Advisor](https://snyk.io/advisor/npm-package/cl-react-d3-tree), [bkrem/react-d3-tree issues](https://github.com/bkrem/react-d3-tree/issues)) — confirmed "Inactive" maintenance classification and the documented ~500-node freeze issue. MEDIUM confidence (third-party analysis + primary GitHub issue tracker).
- WebSearch: Apollo Server 4 CSRF/multipart friction ([apollographql/apollo-server issue #6433](https://github.com/apollographql/apollo-server/issues/6433), [Apollo CORS docs](https://www.apollographql.com/docs/apollo-server/security/cors)) — confirmed `csrfPrevention` default change from v3→v4 and the required preflight-header workaround for multipart requests. HIGH confidence (official issue tracker + official docs referenced in search summary).
- WebSearch: multer CVE details ([ZeroPath — CVE-2025-7338](https://zeropath.com/blog/cve-2025-7338-multer-dos-vulnerability), [Miggo — CVE-2025-48997](https://www.miggo.io/vulnerability-database/cve/CVE-2025-48997), [expressjs/multer security advisory GHSA-g5hg-p3ph-g8qg](https://github.com/expressjs/multer/security/advisories/GHSA-g5hg-p3ph-g8qg)) — confirmed the affected version range (`>=1.4.4-lts.1, <2.0.2`) and that `2.x` is the fixed line. HIGH confidence (official GitHub security advisory + CVE databases).
- WebSearch: Sequelize self-referential many-to-many gotchas ([sequelize/sequelize issue #1724](https://github.com/sequelize/sequelize/issues/1724), [issue #1937](https://github.com/sequelize/sequelize/issues/1937), [issue #1559](https://github.com/sequelize/sequelize/issues/1559)) — confirmed the directional/symmetric-write gotcha for self-referential `belongsToMany` associations directly from the maintainers' own issue tracker discussions. MEDIUM-HIGH confidence (primary GitHub issue tracker, cross-referenced with official docs).
- WebFetch: [donatso/family-chart GitHub](https://github.com/donatso/family-chart), [family-chart docs site](https://donatso.github.io/family-chart-doc/) — confirmed framework-agnostic (no native React binding) and the existence of a paid "premium" tier advertising performance optimizations. MEDIUM confidence (vendor's own marketing/docs site, cross-checked against npm package metadata for version/publish date).
- Repo inspection: `.planning/PROJECT.md`, `.planning/codebase/STACK.md`, `backend/package.json` — confirmed the existing fixed stack (no Apollo Client, Axios raw-query client, existing unused `uuid@11.0.3` dependency, Apollo Server 4.11, Sequelize 6.37) this research builds on top of. HIGH confidence (primary source, the actual repo).

---
*Stack research for: v2.0 Collaborative Family Tree (tree visualization, photo upload, self-referential Sequelize associations — additions only, on top of the existing validated Express 4 + Apollo Server 4 + React 18/MUI 6 + Sequelize 6 stack)*
*Researched: 2026-07-21*
