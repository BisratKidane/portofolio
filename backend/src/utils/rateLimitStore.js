const store = new Map();

export function checkAndIncrement(key, max, windowMs, now = Date.now()) {
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= max) {
    return false;
  }

  entry.count += 1;
  return true;
}

export function resetRateLimitStore() {
  store.clear();
}
