import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MemberDetailPanel from './MemberDetailPanel.jsx';

vi.mock('../../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));

const SELF = {
  id: '1',
  fullname: 'Ada Lovelace',
  gender: 'Female',
  birthdate: '1815-12-10',
  isAlive: false,
  phone: null,
  address: null,
  mother: { id: '2' },
  father: null,
  spouses: [],
  children: [{ id: '4' }],
  linkedUser: null
};

const MOTHER = {
  id: '2',
  fullname: 'Grace Hopper',
  gender: 'Female',
  birthdate: null,
  isAlive: true,
  mother: null,
  father: null,
  spouses: [],
  children: [{ id: '1' }]
};

const CHILD = {
  id: '4',
  fullname: 'Byron Lovelace',
  gender: 'Male',
  birthdate: null,
  isAlive: true,
  mother: { id: '1' },
  father: null,
  spouses: [],
  children: []
};

function buildMembersById(rows) {
  return new Map(rows.map((row) => [String(row.id), row]));
}

function renderPanel(overrides = {}) {
  const onClose = vi.fn();
  const props = {
    open: true,
    member: SELF,
    membersById: buildMembersById([SELF, MOTHER, CHILD]),
    onClose,
    ...overrides
  };
  const utils = render(<MemberDetailPanel {...props} />);
  return { onClose, ...utils };
}

describe('MemberDetailPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = renderPanel({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when member is null', () => {
    const { container } = renderPanel({ member: null });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the member name, gender, birth year, and living status when open', () => {
    renderPanel();

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Female')).toBeInTheDocument();
    expect(screen.getByText('Born 1815')).toBeInTheDocument();
    expect(screen.getByText('Deceased')).toBeInTheDocument();
  });

  it('shows "Dates unknown" and a Living chip for an alive member with no birthdate', () => {
    renderPanel({ member: MOTHER, membersById: buildMembersById([SELF, MOTHER, CHILD]) });

    expect(screen.getByText('Dates unknown')).toBeInTheDocument();
    expect(screen.getByText('Living')).toBeInTheDocument();
  });

  it('shows no isAlive toggle unless canToggleAlive is set', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: /mark as/i })).not.toBeInTheDocument();
  });

  it('renders an admin isAlive toggle that calls onToggleAlive with the member', async () => {
    const onToggleAlive = vi.fn();
    // SELF is deceased -> the toggle offers to mark them living.
    renderPanel({ canToggleAlive: true, onToggleAlive });

    await userEvent.click(screen.getByRole('button', { name: 'Mark as living' }));

    expect(onToggleAlive).toHaveBeenCalledWith(SELF);
  });

  it('resolves Parents and Children sections from membersById, and shows "No recorded spouse" for an empty group', () => {
    renderPanel();

    expect(screen.getByText('Parents')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('Children')).toBeInTheDocument();
    expect(screen.getByText('Byron Lovelace')).toBeInTheDocument();
    expect(screen.getByText('No recorded spouse')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const { onClose } = renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
  });
});
