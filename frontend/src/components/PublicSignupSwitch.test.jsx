import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PublicSignupSwitch from './PublicSignupSwitch.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';

function settingFixture(overrides = {}) {
  return { enabled: true, updatedAt: null, updatedByName: null, ...overrides };
}

// Mutable fixture + flags the shared dispatcher below reads, so the re-read
// after a flip can return the NEW value -- never a chain of *Once mocks,
// which breaks the moment a state is added.
let current;
let loadShouldFail;
let flipShouldFail;
let neverResolveLoad;

beforeEach(() => {
  vi.clearAllMocks();
  current = settingFixture();
  loadShouldFail = false;
  flipShouldFail = false;
  neverResolveLoad = false;

  graphqlRequest.mockImplementation((query, variables) => {
    if (query.includes('publicRegistrationSetting')) {
      if (neverResolveLoad) return new Promise(() => {});
      if (loadShouldFail) return Promise.reject(new Error('Network error'));
      return Promise.resolve({ publicRegistrationSetting: current });
    }
    if (query.includes('setPublicRegistrationEnabled')) {
      if (flipShouldFail) return Promise.reject(new Error('Nope.'));
      current = { ...current, enabled: variables.enabled, updatedAt: '1757404800000', updatedByName: current.updatedByName };
      return Promise.resolve({ setPublicRegistrationEnabled: current });
    }
    return Promise.resolve({});
  });
});

describe('PublicSignupSwitch', () => {
  it('renders the loading state and no Switch before the setting resolves (ADMIN-03)', async () => {
    neverResolveLoad = true;
    render(<PublicSignupSwitch />);

    expect(await screen.findByText('Checking whether public signup is open…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Public signup')).not.toBeInTheDocument();
  });

  it('renders the open state with "Not changed since setup." attribution when never modified (D-06)', async () => {
    current = settingFixture({ enabled: true, updatedAt: null, updatedByName: null });
    render(<PublicSignupSwitch />);

    await screen.findByText('Public signup is open');
    expect(screen.getByLabelText('Public signup')).toBeChecked();
    expect(screen.getByText('Not changed since setup.')).toBeInTheDocument();
  });

  it('renders the closed state with named-actor attribution (D-06)', async () => {
    current = settingFixture({ enabled: false, updatedAt: '1757404800000', updatedByName: 'Bisrat' });
    render(<PublicSignupSwitch />);

    await screen.findByText('Public signup is closed');
    expect(screen.getByLabelText('Public signup')).not.toBeChecked();
    expect(screen.getByText(/^Closed by Bisrat on /)).toBeInTheDocument();
  });

  it('renders "an administrator" attribution when the actor is unknown (D-06)', async () => {
    current = settingFixture({ enabled: false, updatedAt: '1757404800000', updatedByName: null });
    render(<PublicSignupSwitch />);

    await screen.findByText('Public signup is closed');
    expect(screen.getByText(/^Closed by an administrator on /)).toBeInTheDocument();
  });

  it('closes with a single click and no dialog, so a spam wave can be stopped in seconds (D-05, ADMIN-01)', async () => {
    const user = userEvent.setup();
    current = settingFixture({ enabled: true, updatedAt: null, updatedByName: null });
    render(<PublicSignupSwitch />);

    await screen.findByText('Public signup is open');
    await user.click(screen.getByLabelText('Public signup'));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining('setPublicRegistrationEnabled'), { enabled: false });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks for confirmation before opening and only flips after the confirm click (D-05)', async () => {
    const user = userEvent.setup();
    current = settingFixture({ enabled: false, updatedAt: null, updatedByName: null });
    render(<PublicSignupSwitch />);

    await screen.findByText('Public signup is closed');
    await user.click(screen.getByLabelText('Public signup'));

    expect(await screen.findByText('Open public signup?')).toBeInTheDocument();
    expect(graphqlRequest).not.toHaveBeenCalledWith(expect.stringContaining('setPublicRegistrationEnabled'), expect.anything());

    await user.click(screen.getByRole('button', { name: 'Keep it closed' }));
    expect(graphqlRequest).not.toHaveBeenCalledWith(expect.stringContaining('setPublicRegistrationEnabled'), expect.anything());
    expect(screen.getByLabelText('Public signup')).not.toBeChecked();

    await user.click(screen.getByLabelText('Public signup'));
    await screen.findByText('Open public signup?');
    await user.click(screen.getByRole('button', { name: 'Open signup' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining('setPublicRegistrationEnabled'), { enabled: true });
    });
    expect(await screen.findByText('Public signup is open')).toBeInTheDocument();
  });

  it('returns the Switch to the last server-confirmed position on a failed flip, never the attempted one (D-07 write path)', async () => {
    const user = userEvent.setup();
    current = settingFixture({ enabled: true, updatedAt: null, updatedByName: null });
    flipShouldFail = true;
    render(<PublicSignupSwitch />);

    await screen.findByText('Public signup is open');
    await user.click(screen.getByLabelText('Public signup'));

    expect(await screen.findByText('Nope.')).toBeInTheDocument();
    expect(screen.getByLabelText('Public signup')).toBeChecked();

    await waitFor(() => {
      const readCalls = graphqlRequest.mock.calls.filter(([query]) => query.includes('publicRegistrationSetting'));
      expect(readCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows the load-failure state with a working Retry, no Switch until it resolves', async () => {
    const user = userEvent.setup();
    loadShouldFail = true;
    current = settingFixture({ enabled: true, updatedAt: null, updatedByName: null });
    render(<PublicSignupSwitch />);

    expect(await screen.findByText('Network error')).toBeInTheDocument();
    expect(screen.queryByLabelText('Public signup')).not.toBeInTheDocument();

    loadShouldFail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Public signup is open')).toBeInTheDocument();
  });
});
