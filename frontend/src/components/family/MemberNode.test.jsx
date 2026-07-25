import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MemberNode from './MemberNode.jsx';

vi.mock('../../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));

const BASE_MEMBER = {
  id: '1',
  fullname: 'Ada Lovelace',
  gender: 'Female',
  birthdate: '1932-01-01',
  deathdate: '2001-06-15'
};

function renderNode(dataOverrides = {}) {
  const data = {
    member: BASE_MEMBER,
    isViewer: false,
    hiddenCount: 0,
    onToggleExpand: vi.fn(),
    ancestorHiddenCount: 0,
    onToggleAncestorExpand: vi.fn(),
    ...dataOverrides
  };
  const utils = render(<MemberNode data={data} />);
  return { data, ...utils };
}

describe('MemberNode', () => {
  it('renders the full name and birth-death years', () => {
    renderNode();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('1932–2001')).toBeInTheDocument();
  });

  it('renders only the start year with a trailing dash when deathdate is unknown', () => {
    renderNode({ member: { ...BASE_MEMBER, deathdate: null } });
    expect(screen.getByText('1932–')).toBeInTheDocument();
  });

  it('renders only the end year with a leading dash when birthdate is unknown', () => {
    renderNode({ member: { ...BASE_MEMBER, birthdate: null } });
    expect(screen.getByText('–2001')).toBeInTheDocument();
  });

  it('omits the years line entirely when both dates are unknown', () => {
    renderNode({ member: { ...BASE_MEMBER, birthdate: null, deathdate: null } });
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
  });

  it('applies a 2px solid viewer ring (outline) when isViewer is true, distinct from the You chip', () => {
    renderNode({ isViewer: true });
    const card = screen.getByTestId(`member-node-${BASE_MEMBER.id}`);
    expect(card).toHaveAttribute('data-viewer-ring', 'true');
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('applies no ring and no You chip when isViewer is false', () => {
    renderNode({ isViewer: false });
    const card = screen.getByTestId(`member-node-${BASE_MEMBER.id}`);
    expect(card).toHaveAttribute('data-viewer-ring', 'false');
    expect(screen.queryByText('You')).not.toBeInTheDocument();
  });

  it('renders MaleRounded with the blue tint for a Male member', () => {
    renderNode({ member: { ...BASE_MEMBER, gender: 'Male' } });
    const icon = screen.getByLabelText('Male');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveStyle('color: #3b82f6');
  });

  it('renders FemaleRounded with the rose tint for a Female member', () => {
    renderNode({ member: { ...BASE_MEMBER, gender: 'Female' } });
    const icon = screen.getByLabelText('Female');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveStyle('color: #ec4899');
  });

  it('renders TransgenderRounded with the slate tint for any other gender value', () => {
    renderNode({ member: { ...BASE_MEMBER, gender: 'Other' } });
    const icon = screen.getByLabelText('Other');
    expect(icon).toBeInTheDocument();
  });

  it('shows the descendant hidden-count badge when hiddenCount > 0 and calls onToggleExpand on click', async () => {
    const onToggleExpand = vi.fn();
    renderNode({ hiddenCount: 3, onToggleExpand });
    const badge = screen.getByLabelText(/Show 3 hidden descendants of Ada Lovelace/);
    expect(badge).toBeInTheDocument();
    await userEvent.click(badge);
    expect(onToggleExpand).toHaveBeenCalledWith(BASE_MEMBER.id);
  });

  it('does not show the descendant badge when hiddenCount is 0', () => {
    renderNode({ hiddenCount: 0 });
    expect(screen.queryByLabelText(/Show \d+ hidden descendants of/)).not.toBeInTheDocument();
  });

  it('shows the ancestor hidden-count badge when ancestorHiddenCount > 0 and calls onToggleAncestorExpand on click', async () => {
    const onToggleAncestorExpand = vi.fn();
    renderNode({ ancestorHiddenCount: 2, onToggleAncestorExpand });
    const badge = screen.getByLabelText(/Show 2 hidden ancestors of Ada Lovelace/);
    expect(badge).toBeInTheDocument();
    await userEvent.click(badge);
    expect(onToggleAncestorExpand).toHaveBeenCalledWith(BASE_MEMBER.id);
  });

  it('does not show the ancestor badge when ancestorHiddenCount is 0', () => {
    renderNode({ ancestorHiddenCount: 0 });
    expect(screen.queryByLabelText(/Show \d+ hidden ancestors of/)).not.toBeInTheDocument();
  });

  it('renders both the ancestor and descendant badges simultaneously as distinct elements', () => {
    renderNode({ hiddenCount: 1, ancestorHiddenCount: 1 });
    const descendantBadge = screen.getByLabelText(/Show 1 hidden descendants of/);
    const ancestorBadge = screen.getByLabelText(/Show 1 hidden ancestors of/);
    expect(descendantBadge).toBeInTheDocument();
    expect(ancestorBadge).toBeInTheDocument();
    expect(descendantBadge).not.toBe(ancestorBadge);
  });
});
