import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute.jsx';

const useAuthMock = vi.fn();

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => useAuthMock()
}));

function renderProtectedRoute({ allowedRoles } = {}) {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/login" element={<div>Login Sentinel</div>} />
        <Route path="/dashboard" element={<div>Dashboard Sentinel</div>} />
        <Route element={<ProtectedRoute allowedRoles={allowedRoles} />}>
          <Route path="/admin" element={<div>Admin Sentinel</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a loading indicator while auth state is loading', () => {
    useAuthMock.mockReturnValue({ loading: true, user: null });

    renderProtectedRoute();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('Admin Sentinel')).not.toBeInTheDocument();
    expect(screen.queryByText('Login Sentinel')).not.toBeInTheDocument();
  });

  it('redirects unauthenticated users to /login', () => {
    useAuthMock.mockReturnValue({ loading: false, user: null });

    renderProtectedRoute();

    expect(screen.getByText('Login Sentinel')).toBeInTheDocument();
    expect(screen.queryByText('Admin Sentinel')).not.toBeInTheDocument();
  });

  it('renders the protected child route for an authenticated user with no role restriction', () => {
    useAuthMock.mockReturnValue({ loading: false, user: { id: 1, role: 'USER' } });

    renderProtectedRoute({ allowedRoles: undefined });

    expect(screen.getByText('Admin Sentinel')).toBeInTheDocument();
  });

  it('redirects to /dashboard when the user role is not in allowedRoles', () => {
    useAuthMock.mockReturnValue({ loading: false, user: { id: 1, role: 'USER' } });

    renderProtectedRoute({ allowedRoles: ['ADMIN'] });

    expect(screen.getByText('Dashboard Sentinel')).toBeInTheDocument();
    expect(screen.queryByText('Admin Sentinel')).not.toBeInTheDocument();
  });
});
