import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminLinkMembers from './AdminLinkMembers.jsx';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/link-members']}>
      <Routes>
        <Route path="/admin/link-members" element={<AdminLinkMembers />} />
        <Route path="/manage" element={<div>Manage Sentinel</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminLinkMembers (T-15-11 retirement to a redirect)', () => {
  it('unconditionally redirects to /manage', () => {
    renderPage();

    expect(screen.getByText('Manage Sentinel')).toBeInTheDocument();
  });

  it('renders no admin-linking UI of its own', () => {
    renderPage();

    expect(screen.queryByText('Link accounts to family members')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link' })).not.toBeInTheDocument();
  });
});
