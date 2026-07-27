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

  it('exposes the search field as an accessible labelled input', () => {
    render(<AdminMemberTable members={MEMBERS} onSelect={vi.fn()} />);

    expect(screen.getByLabelText('Search members')).toBeInTheDocument();
  });

  it('renders a MUI Table with Name / Linked account columns (no Gender column — avatar conveys it)', () => {
    render(<AdminMemberTable members={MEMBERS} onSelect={vi.fn()} />);

    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Linked account' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Gender' })).not.toBeInTheDocument();
    expect(screen.getByText('Grace H')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
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
});
