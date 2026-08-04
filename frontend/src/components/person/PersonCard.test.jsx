import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PersonCard from './PersonCard.jsx';

vi.mock('../../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));

const BASE_MEMBER = {
  id: '1',
  fullname: 'Ada Lovelace',
  gender: 'Female',
  isAlive: true,
  geezFullname: null,
  photoUrl: null,
  children: [],
  spouses: [],
  canEdit: false
};

const SPOUSE = { ...BASE_MEMBER, id: '2', fullname: 'Bob Lovelace' };

function renderCard(overrides = {}) {
  const props = {
    member: BASE_MEMBER,
    role: 'Head',
    expanded: false,
    onExpand: vi.fn(),
    onEdit: vi.fn(),
    ...overrides
  };
  const utils = render(<PersonCard {...props} />);
  return { ...props, ...utils };
}

describe('PersonCard', () => {
  // CARD-01: identity fields, field omission
  it('renders the Latin fullname always', () => {
    renderCard();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it("renders no Ge'ez line when geezFullname is absent", () => {
    renderCard();
    expect(screen.queryByText('ጃነ ዶ')).not.toBeInTheDocument();
  });

  it("renders the Ge'ez name (lang=ti) when geezFullname is present", () => {
    renderCard({ member: { ...BASE_MEMBER, geezFullname: 'ጃነ ዶ' } });
    const geezLine = screen.getByText('ጃነ ዶ');
    expect(geezLine).toBeInTheDocument();
    expect(geezLine).toHaveAttribute('lang', 'ti');
  });

  it('omits the role label when role is undefined', () => {
    renderCard({ role: undefined });
    expect(screen.queryByText('Head')).not.toBeInTheDocument();
    expect(screen.queryByText('Child')).not.toBeInTheDocument();
    expect(screen.queryByText('Grandchild')).not.toBeInTheDocument();
  });

  // CARD-02: role-agnostic, same component/markup for every role
  it.each(['Head', 'Child', 'Grandchild'])('renders the %s role label via the same component/markup', (role) => {
    const { container } = renderCard({ role });
    expect(screen.getByText(role)).toBeInTheDocument();
    // Same card shape regardless of role -- one Paper root, one testid.
    expect(container.querySelectorAll('[data-testid^="person-card-"]').length).toBe(1);
  });

  // CARD-03: gender cue -- color+data-gender+aria-label, never color alone
  it.each([
    ['Male', 'Male'],
    ['Female', 'Female'],
    ['Other', 'Other'],
    [undefined, 'Other']
  ])('exposes data-gender + accessible name for gender=%s', (gender, expectedLabel) => {
    renderCard({ member: { ...BASE_MEMBER, gender } });
    const card = screen.getByTestId('person-card-1');
    expect(card).toHaveAttribute('data-gender', expectedLabel);
    expect(card).toHaveAccessibleName(`Ada Lovelace, ${expectedLabel}`);
  });

  it.each([
    ['Male', 'solid'],
    ['Female', 'dashed'],
    ['Other', 'dotted'],
    [undefined, 'dotted']
  ])('exposes data-ring-style=%s for gender=%s ring wrapper', (gender, expectedStyle) => {
    renderCard({ member: { ...BASE_MEMBER, gender } });
    const card = screen.getByTestId('person-card-1');
    const ring = card.querySelector('[data-ring-style]');
    expect(ring).not.toBeNull();
    expect(ring).toHaveAttribute('data-ring-style', expectedStyle);
  });

  // D-04: status chip
  it('renders "Living" when isAlive is not false', () => {
    renderCard({ member: { ...BASE_MEMBER, isAlive: true } });
    expect(screen.getByText('Living')).toBeInTheDocument();
  });

  it('renders "Deceased" when isAlive is false', () => {
    renderCard({ member: { ...BASE_MEMBER, isAlive: false } });
    expect(screen.getByText('Deceased')).toBeInTheDocument();
  });

  // CARD-04: child-count + expand gating
  it('renders no expand control when children.length === 0', () => {
    renderCard({ member: { ...BASE_MEMBER, children: [] } });
    expect(screen.queryByRole('button', { name: /children of/i })).not.toBeInTheDocument();
  });

  it('renders "1 child" (singular) for a single child', () => {
    renderCard({ member: { ...BASE_MEMBER, children: [{ id: '2' }] } });
    expect(screen.getByText('1 child')).toBeInTheDocument();
  });

  it('renders "2 children" (plural) for two children', () => {
    renderCard({ member: { ...BASE_MEMBER, children: [{ id: '2' }, { id: '3' }] } });
    expect(screen.getByText('2 children')).toBeInTheDocument();
  });

  it('shows "Show children of {fullname}" accessible name when collapsed', () => {
    renderCard({ member: { ...BASE_MEMBER, children: [{ id: '2' }] }, expanded: false });
    expect(screen.getByRole('button', { name: 'Show children of Ada Lovelace' })).toBeInTheDocument();
  });

  it('shows "Hide children of {fullname}" accessible name when expanded', () => {
    renderCard({ member: { ...BASE_MEMBER, children: [{ id: '2' }] }, expanded: true });
    expect(screen.getByRole('button', { name: 'Hide children of Ada Lovelace' })).toBeInTheDocument();
  });

  it('calls onExpand with the member when the expand control is clicked', async () => {
    const onExpand = vi.fn();
    const member = { ...BASE_MEMBER, children: [{ id: '2' }] };
    renderCard({ member, onExpand });
    await userEvent.click(screen.getByRole('button', { name: /Show children of/i }));
    expect(onExpand).toHaveBeenCalledWith(member);
  });

  it('never renders an expand control when isSpouse is true, even with children', () => {
    renderCard({ member: { ...BASE_MEMBER, children: [{ id: '2' }] }, isSpouse: true });
    expect(screen.queryByRole('button', { name: /children of/i })).not.toBeInTheDocument();
  });

  // D-08: admin edit gate
  it('renders no Edit button when canEdit is false', () => {
    renderCard({ member: { ...BASE_MEMBER, canEdit: false } });
    expect(screen.queryByRole('button', { name: /Edit/i })).not.toBeInTheDocument();
  });

  it('renders the Edit button when canEdit is true', () => {
    renderCard({ member: { ...BASE_MEMBER, canEdit: true } });
    expect(screen.getByRole('button', { name: 'Edit Ada Lovelace' })).toBeInTheDocument();
  });

  it('calls onEdit with the member when the Edit button is clicked', async () => {
    const onEdit = vi.fn();
    const member = { ...BASE_MEMBER, canEdit: true };
    renderCard({ member, onEdit });
    await userEvent.click(screen.getByRole('button', { name: 'Edit Ada Lovelace' }));
    expect(onEdit).toHaveBeenCalledWith(member);
  });

  // SPOUSE-01: spouse pairing + dashed connector (D-12/D-13/D-14)
  describe('spouse pairing', () => {
    it('renders no dashed connector or second card when spouse is absent', () => {
      const { container } = renderCard({});
      expect(container.querySelectorAll('[data-testid^="person-card-"]').length).toBe(1);
    });

    it('renders both the anchor and spouse cards when spouse is supplied', () => {
      renderCard({ spouse: SPOUSE });
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
      expect(screen.getByText('Bob Lovelace')).toBeInTheDocument();
    });

    it('renders an aria-hidden dashed connector between the anchor and spouse cards', () => {
      const { container } = renderCard({ spouse: SPOUSE });
      const connector = container.querySelector('[data-connector-style="dashed"]');
      expect(connector).not.toBeNull();
      expect(connector).toHaveAttribute('aria-hidden', 'true');
    });

    it('never shows an expand control on the spouse card, even when the spouse has children', () => {
      const spouseWithChildren = { ...SPOUSE, children: [{ id: '3' }, { id: '4' }] };
      const member = { ...BASE_MEMBER, children: [{ id: '5' }] };
      renderCard({ member, spouse: spouseWithChildren, expanded: false });
      const spouseCard = screen.getByTestId('person-card-2');
      expect(
        Array.from(spouseCard.querySelectorAll('button')).find((btn) => /children of/i.test(btn.textContent || ''))
      ).toBeUndefined();
      // Anchor's own expand control is unaffected.
      expect(screen.getByRole('button', { name: 'Show children of Ada Lovelace' })).toBeInTheDocument();
    });

    it('renders exactly 2 person cards for a spouse pair, never recursing into the spouse\'s own spouse', () => {
      const member = { ...BASE_MEMBER, spouses: [{ id: '2' }] };
      const spouse = { ...SPOUSE, spouses: [{ id: '1' }] };
      const { container } = renderCard({ member, spouse });
      expect(container.querySelectorAll('[data-testid^="person-card-"]').length).toBe(2);
    });

    it('ignores its own spouse prop when isSpouse is true (defense in depth, no recursion)', () => {
      const { container } = renderCard({ isSpouse: true, spouse: SPOUSE });
      expect(container.querySelectorAll('[data-testid^="person-card-"]').length).toBe(1);
    });
  });

  // PERM-02 (D-01/D-02/D-07): admin-only Add-relative menu
  describe('Add-menu control', () => {
    it('renders no Add control when canEdit is false', () => {
      renderCard({ member: { ...BASE_MEMBER, canEdit: false }, onAddRelative: vi.fn() });
      expect(screen.queryByLabelText(/add relative/i)).not.toBeInTheDocument();
    });

    it('renders an Add IconButton when canEdit is true and onAddRelative is supplied', () => {
      renderCard({ member: { ...BASE_MEMBER, canEdit: true }, onAddRelative: vi.fn() });
      expect(screen.getByLabelText(/add relative to ada lovelace/i)).toBeInTheDocument();
    });

    it('renders no Add control on a spouse card, even when canEdit is true (D-07)', () => {
      renderCard({ isSpouse: true, member: { ...BASE_MEMBER, canEdit: true }, onAddRelative: vi.fn() });
      expect(screen.queryByLabelText(/add relative/i)).not.toBeInTheDocument();
    });

    it('renders the Add control on the anchor card only, never on the composed spouse leaf', () => {
      const { container } = renderCard({
        member: { ...BASE_MEMBER, canEdit: true },
        spouse: { ...SPOUSE, canEdit: true },
        onAddRelative: vi.fn()
      });
      expect(container.querySelectorAll('[aria-label^="Add relative to"]').length).toBe(1);
    });

    it('opens a menu with exactly two items ("Add child", "Add spouse") when clicked', async () => {
      renderCard({ member: { ...BASE_MEMBER, canEdit: true }, onAddRelative: vi.fn() });
      await userEvent.click(screen.getByLabelText(/add relative to ada lovelace/i));
      expect(screen.getByRole('menuitem', { name: 'Add child' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Add spouse' })).toBeInTheDocument();
      expect(screen.getAllByRole('menuitem').length).toBe(2);
    });

    it('calls onAddRelative(\'child\', member) and closes the menu when "Add child" is clicked', async () => {
      const onAddRelative = vi.fn();
      const member = { ...BASE_MEMBER, canEdit: true };
      renderCard({ member, onAddRelative });
      await userEvent.click(screen.getByLabelText(/add relative to ada lovelace/i));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Add child' }));
      expect(onAddRelative).toHaveBeenCalledWith('child', member);
      expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    });

    it('calls onAddRelative(\'spouse\', member) when "Add spouse" is clicked', async () => {
      const onAddRelative = vi.fn();
      const member = { ...BASE_MEMBER, canEdit: true };
      renderCard({ member, onAddRelative });
      await userEvent.click(screen.getByLabelText(/add relative to ada lovelace/i));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Add spouse' }));
      expect(onAddRelative).toHaveBeenCalledWith('spouse', member);
    });

    it('does not throw and renders no Add control when onAddRelative is not supplied', () => {
      expect(() => renderCard({ member: { ...BASE_MEMBER, canEdit: true } })).not.toThrow();
      expect(screen.queryByLabelText(/add relative/i)).not.toBeInTheDocument();
    });
  });
});
