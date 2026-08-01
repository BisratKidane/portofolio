import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminMemberTable from './AdminMemberTable.jsx';

vi.mock('../../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));

const MEMBERS = [
  { id: '1', firstname: 'Ada', lastname: 'Lovelace', fullname: 'Ada Lovelace', gender: 'Female', linkedUser: null },
  {
    id: '2',
    firstname: 'Grace',
    lastname: 'Hopper',
    fullname: 'Grace Hopper',
    gender: 'Female',
    linkedUser: { id: '10', name: 'Grace H', email: 'grace@example.com' }
  }
];

describe('AdminMemberTable', () => {
  it('renders the empty-state message when members is empty', () => {
    render(<AdminMemberTable members={[]} onSelect={vi.fn()} />);

    expect(screen.getByText('No members match your search.')).toBeInTheDocument();
  });

  it('renders the empty-state message when the search matches nothing', async () => {
    render(<AdminMemberTable members={MEMBERS} onSelect={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Search members'), 'zzz');

    expect(screen.getByText('No members match your search.')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();
  });

  it('filters visible rows by case-insensitive substring match on fullname', async () => {
    render(<AdminMemberTable members={MEMBERS} onSelect={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Search members'), 'ada');

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();
  });

  it('always lists members in ascending numeric id order, regardless of input order', () => {
    const outOfOrder = [
      { id: '3', firstname: 'Cara', lastname: 'Gamma', fullname: 'Cara Gamma', gender: 'Female', linkedUser: null },
      { id: '1', firstname: 'Ann', lastname: 'Alpha', fullname: 'Ann Alpha', gender: 'Female', linkedUser: null },
      { id: '2', firstname: 'Bea', lastname: 'Beta', fullname: 'Bea Beta', gender: 'Female', linkedUser: null }
    ];
    render(<AdminMemberTable members={outOfOrder} onSelect={vi.fn()} />);

    const first = screen.getByText('Ann Alpha');
    const second = screen.getByText('Bea Beta');
    const third = screen.getByText('Cara Gamma');
    // DOM order follows ascending id (1 -> 2 -> 3), not the input order (3, 1, 2).
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(second.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('exposes the search field as an accessible labelled input', () => {
    render(<AdminMemberTable members={MEMBERS} onSelect={vi.fn()} />);

    expect(screen.getByLabelText('Search members')).toBeInTheDocument();
  });

  it('renders a Name column but no Born, Gender, or Linked account column headers', () => {
    render(<AdminMemberTable members={MEMBERS} onSelect={vi.fn()} />);

    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Born' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Linked account' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Gender' })).not.toBeInTheDocument();
  });

  it('marks a member with a linked account with an icon (named after the account), and leaves unlinked rows empty', () => {
    render(<AdminMemberTable members={MEMBERS} onSelect={vi.fn()} />);

    // Ada (row 0) has no account; Grace (row 1) does.
    expect(screen.getByRole('img', { name: 'Linked to Grace H' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Linked to Ada Lovelace' })).not.toBeInTheDocument();
  });

  it('does not render any birth date in the rows', () => {
    render(
      <AdminMemberTable
        members={[{ ...MEMBERS[0], birthdate: '1815-12-10' }]}
        onSelect={vi.fn()}
      />
    );
    expect(screen.queryByText('1815-12-10')).not.toBeInTheDocument();
  });

  it('renders MUI TablePagination navigation controls', () => {
    render(<AdminMemberTable members={MEMBERS} onSelect={vi.fn()} />);

    expect(screen.getByLabelText('Go to next page')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to previous page')).toBeInTheDocument();
  });

  it('shows only rowsPerPage rows per page and the remainder after paging', async () => {
    const manyMembers = Array.from({ length: 15 }, (_, i) => ({
      id: String(i + 1),
      firstname: `First${i + 1}`,
      lastname: `Last${i + 1}`,
      fullname: `First${i + 1} Last${i + 1}`,
      gender: 'Other',
      linkedUser: null
    }));

    render(<AdminMemberTable members={manyMembers} onSelect={vi.fn()} />);

    expect(screen.getByText('First1 Last1')).toBeInTheDocument();
    expect(screen.getByText('First10 Last10')).toBeInTheDocument();
    expect(screen.queryByText('First11 Last11')).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Go to next page'));

    expect(screen.getByText('First11 Last11')).toBeInTheDocument();
    expect(screen.getByText('First15 Last15')).toBeInTheDocument();
    expect(screen.queryByText('First1 Last1')).not.toBeInTheDocument();
  });

  it('calls onSelect with the exact member object when a row is clicked', async () => {
    const handleSelect = vi.fn();
    render(<AdminMemberTable members={MEMBERS} onSelect={handleSelect} />);

    await userEvent.click(screen.getByText('Ada Lovelace'));

    expect(handleSelect).toHaveBeenCalledWith(MEMBERS[0]);
  });

  it('renders a photo thumbnail avatar for every row', () => {
    const { container } = render(<AdminMemberTable members={MEMBERS} onSelect={vi.fn()} />);

    expect(container.querySelectorAll('.MuiAvatar-root')).toHaveLength(MEMBERS.length);
  });

  it('renders a living toggle that calls onToggleAlive (without selecting the row)', async () => {
    const onToggleAlive = vi.fn();
    const onSelect = vi.fn();
    render(<AdminMemberTable members={MEMBERS} onSelect={onSelect} onToggleAlive={onToggleAlive} />);

    const toggle = screen.getByLabelText('Toggle living status for Ada Lovelace');
    expect(toggle).toBeChecked(); // undefined isAlive treated as living
    await userEvent.click(toggle);

    expect(onToggleAlive).toHaveBeenCalledWith(MEMBERS[0]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('reflects a deceased member as an unchecked toggle', () => {
    render(
      <AdminMemberTable
        members={[{ ...MEMBERS[0], isAlive: false }]}
        onSelect={vi.fn()}
        onToggleAlive={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Toggle living status for Ada Lovelace')).not.toBeChecked();
  });

  it('shows last-edited-by provenance (no Added-by column)', () => {
    render(
      <AdminMemberTable
        members={[{ ...MEMBERS[0], createdBy: { id: '9', name: 'Root Admin' }, updatedBy: { id: '8', name: 'Grace H' } }]}
        onSelect={vi.fn()}
      />
    );
    expect(screen.queryByRole('columnheader', { name: 'Added by' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Last edited by' })).toBeInTheDocument();
    expect(screen.getByText('Grace H')).toBeInTheDocument();
  });

  it("renders the Ge'ez name line (lang=ti) below the Latin fullname in the same name cell (VIEW-02)", () => {
    render(
      <AdminMemberTable
        members={[{ ...MEMBERS[0], geezFullname: 'ጃነ ዶ' }]}
        onSelect={vi.fn()}
      />
    );
    const geezLine = screen.getByText('ጃነ ዶ');
    expect(geezLine).toBeInTheDocument();
    expect(geezLine).toHaveAttribute('lang', 'ti');
    const latin = screen.getByText('Ada Lovelace');
    // Same name cell: shared TableCell ancestor.
    expect(latin.closest('td')).toBe(geezLine.closest('td'));
  });

  it("renders no Ge'ez line when geezFullname is absent", () => {
    render(<AdminMemberTable members={MEMBERS} onSelect={vi.fn()} />);
    expect(screen.queryByText('ጃነ ዶ')).not.toBeInTheDocument();
  });

  it("filters rows by a typed Ge'ez substring matched against geezFullname (FIND-01)", async () => {
    render(
      <AdminMemberTable
        members={[
          { ...MEMBERS[0], geezFullname: 'ጃነ ዶ' },
          { ...MEMBERS[1] }
        ]}
        onSelect={vi.fn()}
      />
    );

    await userEvent.type(screen.getByLabelText('Search members'), 'ጃነ');

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();
  });

  it("still filters by a Latin substring after the Ge'ez extension (regression guard)", async () => {
    render(
      <AdminMemberTable
        members={[
          { ...MEMBERS[0], geezFullname: 'ጃነ ዶ' },
          { ...MEMBERS[1] }
        ]}
        onSelect={vi.fn()}
      />
    );

    await userEvent.type(screen.getByLabelText('Search members'), 'grace');

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('does not throw when searching and a member has a null/undefined geezFullname (null-guard)', async () => {
    render(
      <AdminMemberTable
        members={[
          { ...MEMBERS[0], geezFullname: null },
          { ...MEMBERS[1] }
        ]}
        onSelect={vi.fn()}
      />
    );

    await userEvent.type(screen.getByLabelText('Search members'), 'ada');

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();
  });
});
