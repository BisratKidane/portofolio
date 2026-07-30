export const GEEZ_LANG = 'ti';

/**
 * Derives the Ge'ez display name for a family member, or null if absent.
 * Reads the server-derived geezFullname field (Phase 18/19 VIRTUAL) directly
 * — it does not recompute the join from the underlying raw name parts.
 * @param {{ geezFullname?: string | null }} member
 * @returns {{ text: string, lang: string } | null}
 */
export function getGeezDisplay(member) {
  const text = member?.geezFullname?.trim();
  if (!text) return null;
  return { text, lang: GEEZ_LANG };
}
