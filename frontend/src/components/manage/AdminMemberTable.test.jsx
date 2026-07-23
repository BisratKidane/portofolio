import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminMemberTable from './AdminMemberTable.jsx';

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
});
