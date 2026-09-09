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
  it('renders the public signup form with all four fields, locked AuthShell chrome, and no invitation-only copy', () => {
    renderRegister(null);

    expect(screen.getByText('Request access')).toBeInTheDocument();
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

  it('shows an inline error on blur for an empty "Full name" field, and clears it live once a valid value is typed', async () => {
    renderRegister(null);

    const nameField = screen.getByLabelText('Full name', { exact: false });
    await userEvent.click(nameField);
    await userEvent.tab();

    expect(await screen.findByText('Enter your name.')).toBeInTheDocument();

    await userEvent.type(nameField, 'Ada');

    expect(screen.queryByText('Enter your name.')).not.toBeInTheDocument();
  });

  it('submitting the empty tokenless form shows all four inline errors at once and does not call graphqlRequest', async () => {
    renderRegister(null);

    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(screen.getByText("Tell us how you're related to the family.")).toBeInTheDocument();

    expect(graphqlRequest).not.toHaveBeenCalled();
  });

  it('submitting a fully valid tokenless form calls register with the correct shape and shows the D-06 success copy, never the server message', async () => {
    graphqlRequest.mockImplementation((query) => {
      if (query.includes('publicRegistrationEnabled')) return Promise.resolve({ publicRegistrationEnabled: true });
      if (query.includes('register(token'))
        return Promise.resolve({ register: { message: 'a message the UI must never render on this branch' } });
      return Promise.resolve({});
    });

    renderRegister(null);

    await userEvent.type(screen.getByLabelText('Full name', { exact: false }), 'Ada Lovelace');
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
