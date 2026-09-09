import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import Register from './Register.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';

// Register.jsx will fire `publicRegistrationEnabled` before `register` (plan
// 34-06). Dispatching on query text -- never on call order -- means
// inserting that query ahead of the mutation can't shift any assertion in
// this file onto the wrong response (E-6). The shared default is the door
// OPEN, so every existing tokenless test keeps describing the same scenario
// it describes today.
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  graphqlRequest.mockImplementation((query) => {
    if (query.includes('publicRegistrationEnabled')) return Promise.resolve({ publicRegistrationEnabled: true });
    if (query.includes('register(token'))
      return Promise.resolve({
        register: { message: 'Registration received. Verify your email to activate your account.' }
      });
    return Promise.resolve({});
  });
});

function renderRegister(token = 'invite-token-123') {
  const path = token ? `/register?token=${token}` : '/register';
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Register />
      </MemoryRouter>
    </AuthProvider>
  );
}

describe('Register page (invitation-only)', () => {
  it('renders the public signup form with all four fields, locked AuthShell chrome, and no invitation-only copy', async () => {
    renderRegister(null);

    // Awaited: plan 34-06 gates this branch behind a `publicRegistrationEnabled`
    // round-trip, so the form no longer paints synchronously on mount.
    expect(await screen.findByText('Request access')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(
      screen.getByText("Tell us how you're related to the family — an administrator reviews every request.")
    ).toBeInTheDocument();

    expect(screen.getByLabelText('Full name', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Password', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('How are you related to the family?', { exact: false })).toBeInTheDocument();

    expect(screen.queryByText(/invitation only/i)).not.toBeInTheDocument();
  });

  it('registers with the token + name + password (no email field) and shows the confirmation', async () => {
    graphqlRequest.mockImplementation((query) => {
      if (query.includes('publicRegistrationEnabled')) return Promise.resolve({ publicRegistrationEnabled: true });
      if (query.includes('register(token'))
        return Promise.resolve({
          register: {
            message: 'Registration received. Verify your email — then an administrator will review your account.'
          }
        });
      return Promise.resolve({});
    });

    renderRegister('tok-abc');

    expect(screen.queryByLabelText('Email address', { exact: false })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Full name', { exact: false }), 'Ada');
    await userEvent.type(screen.getByLabelText('Password', { exact: false }), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(/an administrator will review your account/i)).toBeInTheDocument();
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('register(token'),
      { token: 'tok-abc', name: 'Ada', password: 'secret123' }
    );
    expect(screen.queryByLabelText('Full name', { exact: false })).not.toBeInTheDocument();
  });

  it('shows an error alert and keeps the form on a rejected registration', async () => {
    graphqlRequest.mockImplementation((query) => {
      if (query.includes('publicRegistrationEnabled')) return Promise.resolve({ publicRegistrationEnabled: true });
      if (query.includes('register(token')) return Promise.reject(new Error('This invitation link has expired.'));
      return Promise.resolve({});
    });

    renderRegister('tok-expired');

    await userEvent.type(screen.getByLabelText('Full name', { exact: false }), 'Ada');
    await userEvent.type(screen.getByLabelText('Password', { exact: false }), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This invitation link has expired.');
    expect(screen.getByLabelText('Full name', { exact: false })).toBeInTheDocument();
  });

  it('D-08: an invited visitor sees the form with zero added latency, and a valid invitation still registers while the public door is closed', () => {
    renderRegister('tok-invited');

    // SYNCHRONOUS on purpose -- this is the structural proof that no loading
    // gate was hoisted above `if (!token)` (D-08). If this assertion is ever
    // made `await`-tolerant, the regression it guards becomes invisible: an
    // invited visitor would silently start seeing the same added latency as
    // the public path, even though a valid invitation vouches for them
    // already and needs no `publicRegistrationEnabled` round-trip.
    expect(screen.getByLabelText('Full name', { exact: false })).toBeInTheDocument();
    expect(graphqlRequest).not.toHaveBeenCalledWith(expect.stringContaining('publicRegistrationEnabled'), expect.anything());
  });

  it('shows an inline error on blur for an empty "Full name" field, and clears it live once a valid value is typed', async () => {
    renderRegister(null);

    // Awaited: plan 34-06 gates this branch behind a `publicRegistrationEnabled`
    // round-trip, so the form no longer paints synchronously on mount.
    const nameField = await screen.findByLabelText('Full name', { exact: false });
    await userEvent.click(nameField);
    await userEvent.tab();

    expect(await screen.findByText('Enter your name.')).toBeInTheDocument();

    await userEvent.type(nameField, 'Ada');

    expect(screen.queryByText('Enter your name.')).not.toBeInTheDocument();
  });

  it('submitting the empty tokenless form shows all four inline errors at once and does not call graphqlRequest', async () => {
    renderRegister(null);

    // Awaited: plan 34-06 gates this branch behind a `publicRegistrationEnabled`
    // round-trip, so the form no longer paints synchronously on mount.
    const submitButton = await screen.findByRole('button', { name: 'Create account' });
    await userEvent.click(submitButton);

    expect(await screen.findByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(screen.getByText("Tell us how you're related to the family.")).toBeInTheDocument();

    // Scoped to the mutation, not "no network calls at all": once plan 34-06
    // lands, Register.jsx legitimately fires `publicRegistrationEnabled` on
    // mount. This test's claim is "an invalid submit does not attempt
    // registration", not "the page makes no network calls at all".
    expect(graphqlRequest).not.toHaveBeenCalledWith(expect.stringContaining('register(token'), expect.anything());
  });

  it('submitting a fully valid tokenless form calls register with the correct shape and shows the D-06 success copy, never the server message', async () => {
    graphqlRequest.mockImplementation((query) => {
      if (query.includes('publicRegistrationEnabled')) return Promise.resolve({ publicRegistrationEnabled: true });
      if (query.includes('register(token'))
        return Promise.resolve({ register: { message: 'a message the UI must never render on this branch' } });
      return Promise.resolve({});
    });

    renderRegister(null);

    // Awaited: plan 34-06 gates this branch behind a `publicRegistrationEnabled`
    // round-trip, so the form no longer paints synchronously on mount. Once
    // the first element is found, the tree has settled and remaining
    // assertions may stay synchronous.
    const nameField = await screen.findByLabelText('Full name', { exact: false });
    await userEvent.type(nameField, 'Ada Lovelace');
    await userEvent.type(screen.getByLabelText('Email address', { exact: false }), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password', { exact: false }), 'secret123');
    await userEvent.type(
      screen.getByLabelText('How are you related to the family?', { exact: false }),
      'cousin'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining('register(token'), {
      token: undefined,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'secret123',
      relationshipNote: 'cousin'
    });

    expect(await screen.findByText('Check ada@example.com for a verification link.')).toBeInTheDocument();
    expect(
      screen.getByText(
        "Once you verify your email, an administrator reviews your request. You'll be able to sign in as soon as they approve it."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('a message the UI must never render on this branch')).not.toBeInTheDocument();
  });
});

describe('/register public-registration gate (ADMIN-02 / D-07)', () => {
  it('Loading: paints no chrome -- a bare spinner only, until publicRegistrationEnabled resolves', () => {
    graphqlRequest.mockImplementation((query) => {
      if (query.includes('publicRegistrationEnabled')) return new Promise(() => {});
      return Promise.resolve({});
    });

    renderRegister(null);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('Request access')).not.toBeInTheDocument();
  });

  it('Open: renders the untouched signup form once publicRegistrationEnabled resolves true', async () => {
    graphqlRequest.mockImplementation((query) => {
      if (query.includes('publicRegistrationEnabled')) return Promise.resolve({ publicRegistrationEnabled: true });
      return Promise.resolve({});
    });

    renderRegister(null);

    expect(await screen.findByText('Request access')).toBeInTheDocument();
    expect(screen.getByLabelText('Full name', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Password', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('How are you related to the family?', { exact: false })).toBeInTheDocument();
    expect(screen.queryByText('You need an invitation')).not.toBeInTheDocument();
  });

  it('Closed: renders the single invitation-only view once publicRegistrationEnabled resolves false', async () => {
    graphqlRequest.mockImplementation((query) => {
      if (query.includes('publicRegistrationEnabled')) return Promise.resolve({ publicRegistrationEnabled: false });
      return Promise.resolve({});
    });

    renderRegister(null);

    expect(await screen.findByText('You need an invitation')).toBeInTheDocument();
    expect(
      screen.getByText(/Registration is currently by invitation only\./)
    ).toBeInTheDocument();
    expect(screen.getByText('Invitation required')).toBeInTheDocument();
    expect(screen.getByText('Agne is invitation-only right now.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();

    expect(screen.queryByLabelText('Full name', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Email address', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Password', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('How are you related to the family?', { exact: false })).not.toBeInTheDocument();
  });

  it('Read failure fails closed: a rejected publicRegistrationEnabled read renders the invitation-only view', async () => {
    graphqlRequest.mockImplementation((query) => {
      if (query.includes('publicRegistrationEnabled')) return Promise.reject(new Error('Network Error'));
      return Promise.resolve({});
    });

    renderRegister(null);

    // Matches the server's own D-02 fail-closed default, so client and
    // server never disagree when the network fails.
    expect(await screen.findByText('You need an invitation')).toBeInTheDocument();
  });

  it('Refused submit + server now closed -> swaps to the invitation-only view via re-query, not the message', async () => {
    graphqlRequest.mockImplementation((query) => {
      if (query.includes('publicRegistrationEnabled')) return Promise.resolve({ publicRegistrationEnabled: true });
      return Promise.resolve({});
    });

    renderRegister(null);

    const nameField = await screen.findByLabelText('Full name', { exact: false });
    await userEvent.type(nameField, 'Ada Lovelace');
    await userEvent.type(screen.getByLabelText('Email address', { exact: false }), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password', { exact: false }), 'secret123');
    await userEvent.type(
      screen.getByLabelText('How are you related to the family?', { exact: false }),
      'cousin'
    );

    graphqlRequest.mockImplementation((query) => {
      if (query.includes('publicRegistrationEnabled')) return Promise.resolve({ publicRegistrationEnabled: false });
      if (query.includes('register(token'))
        return Promise.reject(new Error('Registration is currently by invitation only.'));
      return Promise.resolve({});
    });

    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('You need an invitation')).toBeInTheDocument();
    // renderInvitationOnly()'s own <Alert severity="info"> also carries
    // role="alert" (MUI's behaviour for every severity), so the "no error
    // Alert remains" assertion must be scoped to error severity specifically
    // rather than to role="alert" as a whole.
    expect(document.querySelector('.MuiAlert-standardError')).not.toBeInTheDocument();

    // The swap must be driven by the re-query resolving `false`, not by
    // parsing the rejection's message -- assert the re-query actually
    // happened (mount + post-refusal), not just that the view matches.
    const publicOpenCallCount = graphqlRequest.mock.calls.filter(([query]) =>
      query.includes('publicRegistrationEnabled')
    ).length;
    expect(publicOpenCallCount).toBeGreaterThanOrEqual(2);
  });

  it('Refused submit but server still open -> plain error, no swap (if this passes while the component string-matches the refusal text, the string-match has been reintroduced)', async () => {
    graphqlRequest.mockImplementation((query) => {
      if (query.includes('publicRegistrationEnabled')) return Promise.resolve({ publicRegistrationEnabled: true });
      return Promise.resolve({});
    });

    renderRegister(null);

    const nameField = await screen.findByLabelText('Full name', { exact: false });
    await userEvent.type(nameField, 'Ada Lovelace');
    await userEvent.type(screen.getByLabelText('Email address', { exact: false }), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password', { exact: false }), 'secret123');
    await userEvent.type(
      screen.getByLabelText('How are you related to the family?', { exact: false }),
      'cousin'
    );

    graphqlRequest.mockImplementation((query) => {
      if (query.includes('publicRegistrationEnabled')) return Promise.resolve({ publicRegistrationEnabled: true });
      if (query.includes('register(token')) return Promise.reject(new Error('Something else went wrong.'));
      return Promise.resolve({});
    });

    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something else went wrong.');
    expect(screen.getByLabelText('Full name', { exact: false })).toBeInTheDocument();
  });

  it('Refusal-message rewording is irrelevant: the swap still happens on a message the UI has never seen (D-07 structural pin)', async () => {
    graphqlRequest.mockImplementation((query) => {
      if (query.includes('publicRegistrationEnabled')) return Promise.resolve({ publicRegistrationEnabled: true });
      return Promise.resolve({});
    });

    renderRegister(null);

    const nameField = await screen.findByLabelText('Full name', { exact: false });
    await userEvent.type(nameField, 'Ada Lovelace');
    await userEvent.type(screen.getByLabelText('Email address', { exact: false }), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password', { exact: false }), 'secret123');
    await userEvent.type(
      screen.getByLabelText('How are you related to the family?', { exact: false }),
      'cousin'
    );

    graphqlRequest.mockImplementation((query) => {
      if (query.includes('publicRegistrationEnabled')) return Promise.resolve({ publicRegistrationEnabled: false });
      if (query.includes('register(token')) return Promise.reject(new Error('zzz unrelated server text'));
      return Promise.resolve({});
    });

    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('You need an invitation')).toBeInTheDocument();
  });
});
