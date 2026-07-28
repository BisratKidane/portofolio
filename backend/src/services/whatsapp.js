import { env } from '../config/env.js';

// WhatsApp delivery. The project targets the WhatsApp Business API, but until a
// provider + credentials are configured (WHATSAPP_PROVIDER/API_URL/API_TOKEN/
// FROM), sending is DORMANT: sendWhatsappMessage() no-ops and the caller falls
// back to a shareable wa.me link the inviter/admin sends manually. Wiring a real
// provider is a single localized change inside sendWhatsappMessage().

export function isWhatsappConfigured() {
  const w = env.whatsapp;
  return Boolean(w && w.provider && w.apiUrl && w.token && w.from);
}

// A wa.me deep link with a prefilled message. Strips everything but digits from
// the phone number (wa.me requires a bare international number).
export function buildWhatsappShareUrl(phone, message) {
  const digits = String(phone || '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export async function sendWhatsappMessage({ to, message }) {
  if (!isWhatsappConfigured()) {
    if (env.nodeEnv !== 'production') {
      console.log(`[whatsapp] (dormant — no provider configured) to=${to}`);
    }
    return { sent: false, reason: 'not_configured' };
  }

  // Real provider dispatch goes here once WHATSAPP_* credentials exist. Kept as
  // a single integration point so adding a provider (Meta Cloud API, Twilio,
  // etc.) does not touch the invitation resolver.
  void message;
  return { sent: false, reason: 'provider_not_implemented' };
}
