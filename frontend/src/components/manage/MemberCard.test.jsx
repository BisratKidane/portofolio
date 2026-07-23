import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MemberCard from './MemberCard.jsx';

const BASE_MEMBER = { id: 5, fullname: 'Ada Lovelace', linkedUser: null };

function renderCard(overrides = {}) {
  const props = {
    member: BASE_MEMBER,
    isAdmin: false,
    actingUserId: 1,
    isSelf: false,
    isDerived: false,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...overrides
  };
  render(<MemberCard {...props} />);
  return props;
}

describe('MemberCard', () => {
  it('renders the member name and avatar initials', () => {
    renderCard();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('hides the Edit button and shows the lock caption for a locked relative (D-06)', () => {
    const member = { id: 5, fullname: 'Ada Lovelace', linkedUser: { id: 99 } };
    renderCard({ member, actingUserId: 1, isSelf: false, isAdmin: false });

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getByText('Manages their own profile.')).toBeInTheDocument();
  });

  it('shows the Edit button (no caption) when isSelf is true, even with the same linkedUser mismatch', () => {
    const member = { id: 5, fullname: 'Ada Lovelace', linkedUser: { id: 99 } };
    renderCard({ member, actingUserId: 1, isSelf: true, isAdmin: false });

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByText('Manages their own profile.')).not.toBeInTheDocument();
  });

  it('shows Edit and Remove for an admin regardless of the lock condition (D-07 bypass)', () => {
    const member = { id: 5, fullname: 'Ada Lovelace', linkedUser: { id: 99 } };
    renderCard({ member, actingUserId: 1, isSelf: false, isAdmin: true });

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.queryByText('Manages their own profile.')).not.toBeInTheDocument();
  });

  it('renders a "Derived" chip when isDerived is true (D-02)', () => {
    renderCard({ isDerived: true });
    expect(screen.getByText('Derived')).toBeInTheDocument();
  });

  it('does not render a "Derived" chip when isDerived is false', () => {
    renderCard({ isDerived: false });
    expect(screen.queryByText('Derived')).not.toBeInTheDocument();
  });

  it('calls onEdit with the member when Edit is clicked', async () => {
    const onEdit = vi.fn();
    renderCard({ onEdit });
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(BASE_MEMBER);
  });

  it('calls onDelete with the member when Remove is clicked (admin only)', async () => {
    const onDelete = vi.fn();
    renderCard({ isAdmin: true, onDelete });
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onDelete).toHaveBeenCalledWith(BASE_MEMBER);
  });

  it('never renders a "Rewire" affordance (T-15-05, no backing mutation this phase)', () => {
    const member = { id: 5, fullname: 'Ada Lovelace', linkedUser: { id: 99 } };
    renderCard({ member, isAdmin: true });
    expect(screen.queryByText(/rewire/i)).not.toBeInTheDocument();
  });
});
