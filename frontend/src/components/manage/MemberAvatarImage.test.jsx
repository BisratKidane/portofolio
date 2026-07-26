import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MemberAvatarImage from './MemberAvatarImage.jsx';

vi.mock('../../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn()
}));

import { fetchMemberPhotoBlob } from '../../api/photoClient.js';

const MEMBER_NO_PHOTO = { id: '1', fullname: 'Ada Lovelace', photoUrl: null };
const MEMBER_WITH_PHOTO = { id: '2', fullname: 'Grace Hopper', photoUrl: '/api/family-members/2/photo' };

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  URL.revokeObjectURL = vi.fn();
});

describe('MemberAvatarImage', () => {
  it('renders a placeholder icon avatar (never initials, never a skeleton) when the member has no photoUrl', () => {
    const { container } = render(<MemberAvatarImage member={MEMBER_NO_PHOTO} />);

    expect(document.querySelector('.MuiSkeleton-circular')).not.toBeInTheDocument();
    expect(screen.queryByText('AL')).not.toBeInTheDocument();
    expect(container.querySelector('.MuiAvatar-root')).toBeInTheDocument();
    const fallback = document.querySelector('[data-testid="member-fallback-avatar"]');
    expect(fallback).toBeInTheDocument();
    expect(fallback).toHaveAttribute('aria-hidden', 'true');
    expect(fetchMemberPhotoBlob).not.toHaveBeenCalled();
  });

  it('renders a circular Skeleton while the photo blob fetch is pending', () => {
    fetchMemberPhotoBlob.mockReturnValueOnce(new Promise(() => {}));

    render(<MemberAvatarImage member={MEMBER_WITH_PHOTO} />);

    expect(document.querySelector('.MuiSkeleton-circular')).toBeInTheDocument();
  });

  it('renders the fetched photo as an Avatar src once the blob resolves, and revokes the object URL on unmount', async () => {
    const blob = new Blob(['fake-image-bytes'], { type: 'image/jpeg' });
    fetchMemberPhotoBlob.mockResolvedValueOnce(blob);

    const { unmount } = render(<MemberAvatarImage member={MEMBER_WITH_PHOTO} />);

    await waitFor(() => {
      const avatar = screen.getByRole('img', { name: 'Grace Hopper' });
      expect(avatar).toHaveAttribute('src', 'blob:mock-url');
    });

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('silently falls back to the placeholder when the blob fetch rejects (no visible error)', async () => {
    fetchMemberPhotoBlob.mockRejectedValueOnce(new Error('network fail'));

    render(<MemberAvatarImage member={MEMBER_WITH_PHOTO} />);

    await waitFor(() => {
      const fallback = document.querySelector('[data-testid="member-fallback-avatar"]');
      expect(fallback).toBeInTheDocument();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('uses the gender-coded fallback avatar (Male/Female) when there is no photo', () => {
    const { rerender } = render(
      <MemberAvatarImage member={{ id: '3', fullname: 'Alan T', photoUrl: null, gender: 'Male' }} />
    );
    expect(document.querySelector('[data-testid="member-fallback-avatar"]')).toHaveAttribute('data-gender', 'Male');

    rerender(
      <MemberAvatarImage member={{ id: '4', fullname: 'Ada L', photoUrl: null, gender: 'Female' }} />
    );
    expect(document.querySelector('[data-testid="member-fallback-avatar"]')).toHaveAttribute('data-gender', 'Female');
  });
});
