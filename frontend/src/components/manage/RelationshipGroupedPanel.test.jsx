import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RelationshipGroupedPanel from './RelationshipGroupedPanel.jsx';

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
    ...overrides
  };
  render(<RelationshipGroupedPanel {...props} />);
  return props;
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
});
