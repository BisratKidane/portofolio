// CR-04 (mitigate): security-relevant numeric config must fail FAST at
// startup, never fail open. `Number(process.env.X || fallback)` turns a typo
// into NaN (every `depth > NaN` comparison is false, silently disabling the
// rule) and inverts an explicit `0` into the most permissive fallback.
// Same fail-fast convention as assertProductionSecrets/assertProductionMailConfig.
export function requiredPositiveInt(raw, fallback, name) {
  const value = raw === undefined || raw === null || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, received: ${JSON.stringify(raw)}`);
  }
  return value;
}
