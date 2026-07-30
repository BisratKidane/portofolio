import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MemberCard from './MemberCard.jsx';

vi.mock('../../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));

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
    onPickPhoto: vi.fn(),
    onRemovePhoto: vi.fn(),
    ...overrides
  };
  const utils = render(<MemberCard {...props} />);
  return { ...props, ...utils };
}

describe('MemberCard', () => {
  it('renders the member name and an icon placeholder avatar, never initials (D-10)', () => {
    const { container } = renderCard();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText('AL')).not.toBeInTheDocument();
    expect(container.querySelector('.MuiAvatar-root')).toBeInTheDocument();
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

  it('has aria-label "Add a photo for {fullname}" when the member has no photo', () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Add a photo for Ada Lovelace' })).toBeInTheDocument();
  });

  it('has aria-label "Change photo for {fullname}" when the member has a photo', () => {
    const member = { ...BASE_MEMBER, photoUrl: '/api/family-members/5/photo' };
    renderCard({ member });
    expect(screen.getByRole('button', { name: 'Change photo for Ada Lovelace' })).toBeInTheDocument();
  });

  it('does not render an interactive avatar trigger when locked', () => {
    const member = { id: 5, fullname: 'Ada Lovelace', linkedUser: { id: 99 } };
    renderCard({ member, actingUserId: 1, isSelf: false, isAdmin: false });
    expect(screen.queryByRole('button', { name: /photo for/i })).not.toBeInTheDocument();
  });

  it('calls onPickPhoto with the member and the picked file when a file is chosen', async () => {
    const onPickPhoto = vi.fn();
    const { container } = renderCard({ onPickPhoto });
    const fileInput = container.querySelector('input[type="file"]');
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });

    await userEvent.upload(fileInput, file);

    expect(onPickPhoto).toHaveBeenCalledWith(BASE_MEMBER, file);
  });

  it('renders "Remove photo" only when unlocked with a photoUrl, and calls onRemovePhoto with the member', async () => {
    const onRemovePhoto = vi.fn();
    const member = { ...BASE_MEMBER, photoUrl: '/api/family-members/5/photo' };
    renderCard({ member, onRemovePhoto });

    const button = screen.getByRole('button', { name: 'Remove photo' });
    await userEvent.click(button);

    expect(onRemovePhoto).toHaveBeenCalledWith(member);
  });

  it('does not render "Remove photo" when the member has no photo', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument();
  });

  it('does not render "Remove photo" when locked, even with a photoUrl', () => {
    const member = {
      id: 5,
      fullname: 'Ada Lovelace',
      linkedUser: { id: 99 },
      photoUrl: '/api/family-members/5/photo'
    };
    renderCard({ member, actingUserId: 1, isSelf: false, isAdmin: false });
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument();
  });

  it("renders the Ge'ez name line (lang=ti) below the Latin fullname when geezFullname is present (VIEW-02)", () => {
    renderCard({ member: { ...BASE_MEMBER, geezFullname: 'ጃነ ዶ' } });
    const geezLine = screen.getByText('ጃነ ዶ');
    expect(geezLine).toBeInTheDocument();
    expect(geezLine).toHaveAttribute('lang', 'ti');
    const latin = screen.getByText('Ada Lovelace');
    expect(latin.compareDocumentPosition(geezLine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders no Ge'ez line when geezFullname is absent", () => {
    renderCard();
    expect(screen.queryByText('ጃነ ዶ')).not.toBeInTheDocument();
  });

  it("renders the Ge'ez line alongside the Derived chip without disturbing it", () => {
    renderCard({ isDerived: true, member: { ...BASE_MEMBER, geezFullname: 'ጃነ ዶ' } });
    expect(screen.getByText('Derived')).toBeInTheDocument();
    expect(screen.getByText('ጃነ ዶ')).toBeInTheDocument();
  });

  it("renders the Ge'ez line alongside the locked caption without disturbing it", () => {
    const member = { id: 5, fullname: 'Ada Lovelace', linkedUser: { id: 99 }, geezFullname: 'ጃነ ዶ' };
    renderCard({ member, actingUserId: 1, isSelf: false, isAdmin: false });
    expect(screen.getByText('Manages their own profile.')).toBeInTheDocument();
    expect(screen.getByText('ጃነ ዶ')).toBeInTheDocument();
  });
});
