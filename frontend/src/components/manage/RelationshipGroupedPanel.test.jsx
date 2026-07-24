import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RelationshipGroupedPanel from './RelationshipGroupedPanel.jsx';

vi.mock('../../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));

const SELF = { id: 1, fullname: 'Ada Lovelace', linkedUser: null };
const MOTHER = { id: 2, fullname: 'Grace Hopper', linkedUser: null };
const SPOUSE = { id: 3, fullname: 'John Doe', linkedUser: null };
const CHILD = { id: 4, fullname: 'Byron Lovelace', linkedUser: null };
const SIBLING = { id: 5, fullname: 'Anna Lovelace', linkedUser: null };

const EMPTY_SCOPE = { self: SELF, parents: [], spouses: [], children: [], siblings: [] };

function renderPanel(overrides = {}) {
  const props = {
    scope: EMPTY_SCOPE,
    isAdmin: false,
    actingUserId: 1,
    onAddRelative: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onPickPhoto: vi.fn(),
    onRemovePhoto: vi.fn(),
    ...overrides
  };
  const utils = render(<RelationshipGroupedPanel {...props} />);
  return { ...props, ...utils };
}

describe('RelationshipGroupedPanel', () => {
  it('renders the "Just you so far." empty state and the You section with self when scope is fully empty', () => {
    renderPanel();

    expect(screen.getByText('Just you so far.')).toBeInTheDocument();
    expect(
      screen.getByText('Add your parents, spouse, or children to start building your branch of the family.')
    ).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('renders exactly 4 "+ Add ..." buttons (parent/spouse/child/sibling) and none in the You section', () => {
    renderPanel();

    const addButtons = screen.getAllByRole('button', { name: /^\+ Add /i });
    expect(addButtons).toHaveLength(4);
    expect(screen.getByRole('button', { name: '+ Add parent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add spouse' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add child' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add sibling' })).toBeInTheDocument();
  });

  it('renders a Parents section heading, the mother\'s MemberCard, and an "+ Add parent" button', () => {
    renderPanel({ scope: { ...EMPTY_SCOPE, parents: [MOTHER] } });

    expect(screen.getByText('Parents')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add parent' })).toBeInTheDocument();
  });

  it('renders the siblings-specific empty copy whenever siblings is empty, regardless of other sections', () => {
    renderPanel({
      scope: { self: SELF, parents: [MOTHER], spouses: [SPOUSE], children: [CHILD], siblings: [] }
    });

    expect(
      screen.getByText('No siblings yet — they appear automatically once you and another child share a parent.')
    ).toBeInTheDocument();
    // combined empty-state notice should NOT show since parents/spouses/children are populated
    expect(screen.queryByText('Just you so far.')).not.toBeInTheDocument();
  });

  it('renders sibling rows via MemberCard with isDerived=true (Derived chip)', () => {
    renderPanel({ scope: { ...EMPTY_SCOPE, siblings: [SIBLING] } });

    expect(screen.getByText('Anna Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Derived')).toBeInTheDocument();
  });

  it('calls onAddRelative with the correct lowercase relation string per section button', async () => {
    const onAddRelative = vi.fn();
    renderPanel({ onAddRelative });

    await userEvent.click(screen.getByRole('button', { name: '+ Add parent' }));
    await userEvent.click(screen.getByRole('button', { name: '+ Add spouse' }));
    await userEvent.click(screen.getByRole('button', { name: '+ Add child' }));
    await userEvent.click(screen.getByRole('button', { name: '+ Add sibling' }));

    expect(onAddRelative).toHaveBeenNthCalledWith(1, 'parent');
    expect(onAddRelative).toHaveBeenNthCalledWith(2, 'spouse');
    expect(onAddRelative).toHaveBeenNthCalledWith(3, 'child');
    expect(onAddRelative).toHaveBeenNthCalledWith(4, 'sibling');
  });

  it('renders exactly one MemberCard for self in the You section with isSelf semantics (Edit always present)', () => {
    renderPanel();

    // Self should always be editable (isSelf=true) -- Edit button present for the You row.
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('threads onPickPhoto to both the self row (standalone render) and a MemberRows-rendered row (parent)', async () => {
    const onPickPhoto = vi.fn();
    const { container } = renderPanel({ scope: { ...EMPTY_SCOPE, parents: [MOTHER] }, onPickPhoto });

    // Render order: self ("You" section) first, then Parents section (MOTHER).
    const fileInputs = container.querySelectorAll('input[type="file"]');
    expect(fileInputs).toHaveLength(2);

    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });

    await userEvent.upload(fileInputs[0], file);
    expect(onPickPhoto).toHaveBeenCalledWith(SELF, file);

    await userEvent.upload(fileInputs[1], file);
    expect(onPickPhoto).toHaveBeenCalledWith(MOTHER, file);
  });

  it('threads onRemovePhoto to both the self row and a MemberRows-rendered row (parent), each with a photoUrl', async () => {
    const onRemovePhoto = vi.fn();
    const SELF_WITH_PHOTO = { ...SELF, photoUrl: '/api/family-members/1/photo' };
    const MOTHER_WITH_PHOTO = { ...MOTHER, photoUrl: '/api/family-members/2/photo' };

    renderPanel({
      scope: { self: SELF_WITH_PHOTO, parents: [MOTHER_WITH_PHOTO], spouses: [], children: [], siblings: [] },
      onRemovePhoto
    });

    const removeButtons = screen.getAllByRole('button', { name: 'Remove photo' });
    expect(removeButtons).toHaveLength(2);

    await userEvent.click(removeButtons[0]);
    expect(onRemovePhoto).toHaveBeenCalledWith(SELF_WITH_PHOTO);

    await userEvent.click(removeButtons[1]);
    expect(onRemovePhoto).toHaveBeenCalledWith(MOTHER_WITH_PHOTO);
  });
});
