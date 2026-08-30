// Pure, dependency-free HTML-entity escaping for values interpolated into an
// HTML text node (never an attribute like href). Naive/single-pass, not
// idempotent-aware — callers must escape exactly once, at the point of
// interpolation, never twice. `&` is replaced first so the `&` introduced by
// the other entities' own replacements is not itself re-escaped.
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
