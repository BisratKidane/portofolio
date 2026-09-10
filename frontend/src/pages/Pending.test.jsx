import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Pending from './Pending.jsx';

const useAuthMock = vi.fn();

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => useAuthMock()
}));

function renderPending() {
  return render(
    <MemoryRouter initialEntries={['/pending']}>
      <Routes>
        <Route path="/login" element={<div>Login Sentinel</div>} />
        <Route path="/dashboard" element={<div>Dashboard Sentinel</div>} />
        <Route path="/pending" element={<Pending />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Pending page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the static awaiting-link message for an unlinked, non-admin user', () => {
    useAuthMock.mockReturnValue({ user: { id: 1, role: 'USER', familyMemberId: null } });

    renderPending();

    expect(
      screen.getByText(
        "Your account is approved. An administrator still needs to link you to your family member in the tree — you'll get access as soon as that happens."
      )
    ).toBeInTheDocument();
  });

  it('renders the same awaiting-link message for an approved, unlinked self-registrant (APPR-06 regression)', () => {
    // AuthContext.jsx's ME_QUERY selects only id/name/email/role/familyMemberId,
    // so nothing in `user` distinguishes a self-registered account from an
    // invited one -- Pending.jsx needs no code change, this test exists purely
    // to make APPR-06's coverage traceable in the suite.
    useAuthMock.mockReturnValue({ user: { id: 2, role: 'USER', familyMemberId: null } });

    renderPending();

    expect(
      screen.getByText(
        "Your account is approved. An administrator still needs to link you to your family member in the tree — you'll get access as soon as that happens."
      )
    ).toBeInTheDocument();
  });

  it('redirects to /dashboard for a linked user', () => {
    useAuthMock.mockReturnValue({ user: { id: 1, role: 'USER', familyMemberId: 5 } });

    renderPending();

    expect(screen.getByText('Dashboard Sentinel')).toBeInTheDocument();
  });

  it('redirects to /dashboard for an ADMIN with no linked member', () => {
    useAuthMock.mockReturnValue({ user: { id: 1, role: 'ADMIN', familyMemberId: null } });

    renderPending();

    expect(screen.getByText('Dashboard Sentinel')).toBeInTheDocument();
  });

  it('redirects to /login when user is null', () => {
    useAuthMock.mockReturnValue({ user: null });

    renderPending();

    expect(screen.getByText('Login Sentinel')).toBeInTheDocument();
  });
});
