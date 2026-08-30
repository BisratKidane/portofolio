import { describe, it, expect } from 'vitest';
import {
  buildTransportOptions,
  sendAccountRejectedEmail,
  sendPendingRegistrationEmail,
  sendInvitationEmail,
  sendRegistrationAttemptEmail
} from './mailer.js';
import { env } from '../config/env.js';

const productionConfig = {
  nodeEnv: 'production',
  smtpHost: 'smtp.example.com',
  smtpUser: 'apikey',
  smtpPass: 'secret'
};

// nodeEnv is 'test' throughout this suite, so buildTransportOptions always
// selects jsonTransport (see above) and every sendXEmail below resolves with
// nodemailer's JSON-transport result — `result.message` is the real,
// normalized mail data (subject/text/html) as a JSON string. Parsing it reads
// the function's actual rendered output, not a mocked/stubbed return value.
async function renderedMessage(sendPromise) {
  const result = await sendPromise;
  return JSON.parse(result.message);
}

describe('buildTransportOptions', () => {
  it('uses jsonTransport in tests and when SMTP is unconfigured, so no email is sent', () => {
    // Tests must never open a socket, even if credentials happen to be present.
    expect(buildTransportOptions({ nodeEnv: 'test' })).toEqual({ jsonTransport: true });
    expect(buildTransportOptions({ nodeEnv: 'test', smtpHost: 'smtp.resend.com', smtpPass: 're_x' })).toEqual({
      jsonTransport: true
    });
    // Unconfigured dev (no key yet) falls back to jsonTransport so the app still boots.
    expect(buildTransportOptions({ nodeEnv: 'development' })).toEqual({ jsonTransport: true });
    expect(buildTransportOptions({ nodeEnv: 'development', smtpHost: 'smtp.resend.com' })).toEqual({
      jsonTransport: true
    });
  });

  it('builds a real SMTP transport in development once configured, so local sends via Resend', () => {
    const options = buildTransportOptions({
      nodeEnv: 'development',
      smtpHost: 'smtp.resend.com',
      smtpPort: 587,
      smtpUser: 'resend',
      smtpPass: 're_local_key'
    });

    expect(options.jsonTransport).toBeUndefined();
    expect(options.host).toBe('smtp.resend.com');
    expect(options.port).toBe(587);
    expect(options.requireTLS).toBe(true);
    expect(options.auth).toEqual({ user: 'resend', pass: 're_local_key' });
  });

  it('enforces STARTTLS on port 587 in production', () => {
    const options = buildTransportOptions({ ...productionConfig, smtpPort: 587 });

    expect(options.secure).toBe(false);
    expect(options.requireTLS).toBe(true);
    expect(options.host).toBe('smtp.example.com');
    expect(options.port).toBe(587);
  });

  it('enforces implicit TLS on port 465 in production', () => {
    const options = buildTransportOptions({ ...productionConfig, smtpPort: 465 });

    expect(options.secure).toBe(true);
    expect(options.port).toBe(465);
  });

  it('never permits a cleartext session in production, whatever the port', () => {
    for (const smtpPort of [25, 465, 587, 2525, '587', '465']) {
      const options = buildTransportOptions({ ...productionConfig, smtpPort });

      expect(options.secure || options.requireTLS).toBe(true);
    }
  });
});

describe('sendAccountRejectedEmail', () => {
  it('escapes an HTML-injection payload in reason (D-07)', async () => {
    const { html } = await renderedMessage(
      sendAccountRejectedEmail({ to: 'x@example.com', name: 'Eve', reason: '<img src=x onerror=alert(1)>' })
    );

    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });
});

describe('sendPendingRegistrationEmail', () => {
  it('escapes newUserName/newUserEmail/note and describes a self-registration when inviterName is absent (D-07, D-12)', async () => {
    const { html } = await renderedMessage(
      sendPendingRegistrationEmail({
        to: 'admin@example.com',
        newUserName: '<b>Eve</b>',
        newUserEmail: 'eve@x.com',
        inviterName: null,
        relationship: null,
        note: '<script>x</script>',
        registeredAt: new Date()
      })
    );

    expect(html).toContain('&lt;b&gt;Eve&lt;/b&gt;');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).not.toContain('<b>Eve</b>');
    expect(html).not.toContain('<script>x</script>');
    expect(html).not.toContain('via an invitation from');
  });

  it('describes an invited registration and escapes the inviter name when inviterName/relationship are present (D-12)', async () => {
    const { html } = await renderedMessage(
      sendPendingRegistrationEmail({
        to: 'admin@example.com',
        newUserName: 'Eve',
        newUserEmail: 'eve@x.com',
        inviterName: 'Alice',
        relationship: 'cousin',
        note: null,
        registeredAt: new Date()
      })
    );

    expect(html).toContain('via an invitation from');
    expect(html).toContain('Alice');
  });
});

describe('sendInvitationEmail', () => {
  it('escapes inviterName and note (D-07)', async () => {
    const { html } = await renderedMessage(
      sendInvitationEmail({
        to: 'invitee@example.com',
        url: 'https://example.com/register?token=abc',
        inviterName: '<i>Bob</i>',
        invitedName: null,
        relationship: null,
        note: '<u>hi</u>'
      })
    );

    expect(html).toContain('&lt;i&gt;Bob&lt;/i&gt;');
    expect(html).toContain('&lt;u&gt;hi&lt;/u&gt;');
    expect(html).not.toContain('<i>Bob</i>');
    expect(html).not.toContain('<u>hi</u>');
  });
});

describe('sendRegistrationAttemptEmail', () => {
  it('escapes name, references a registration attempt, and points its CTA at /forgot-password (D-10)', async () => {
    const { html, subject } = await renderedMessage(
      sendRegistrationAttemptEmail({ to: 'x@example.com', name: '<mark>X</mark>' })
    );

    expect(html).toContain('&lt;mark&gt;X&lt;/mark&gt;');
    expect(html).not.toContain('<mark>');
    expect(subject.toLowerCase()).toContain('registration attempt');
    expect(html).toContain(`${env.clientUrl}/forgot-password`);
  });
});
