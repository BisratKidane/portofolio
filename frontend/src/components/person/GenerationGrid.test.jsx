import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenerationGrid from './GenerationGrid.jsx';

vi.mock('../../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));

function makePerson(id, overrides = {}) {
  return {
    id,
    fullname: `Person ${id}`,
    gender: 'Female',
    isAlive: true,
    geezFullname: null,
    photoUrl: null,
    children: [],
    spouses: [],
    canEdit: false,
    ...overrides
  };
}

function renderGrid(overrides = {}) {
  const props = {
    people: [makePerson('1'), makePerson('2')],
    role: 'Child',
    expandedId: null,
    onExpand: vi.fn(),
    onEdit: vi.fn(),
    loadingId: null,
    ...overrides
  };
  const utils = render(<GenerationGrid {...props} />);
  return { ...props, ...utils };
}

describe('GenerationGrid', () => {
  // Card count for people arrays of length 1, 2, 3
  it('renders exactly 1 PersonCard for 1 person', () => {
    const people = [makePerson('1')];
    const { container } = renderGrid({ people });
    expect(container.querySelectorAll('[data-testid^="person-card-"]').length).toBe(1);
  });

  it('renders exactly 2 PersonCards for 2 people', () => {
    const people = [makePerson('1'), makePerson('2')];
    const { container } = renderGrid({ people });
    expect(container.querySelectorAll('[data-testid^="person-card-"]').length).toBe(2);
  });

  it('renders exactly 3 PersonCards for 3 people', () => {
    const people = [makePerson('1'), makePerson('2'), makePerson('3')];
    const { container } = renderGrid({ people });
    expect(container.querySelectorAll('[data-testid^="person-card-"]').length).toBe(3);
  });

  // D-06: exactly one group-level apex, never one per card
  it('renders exactly one generation-apex element regardless of people.length', () => {
    const people = [makePerson('1'), makePerson('2'), makePerson('3')];
    const { container } = renderGrid({ people });
    expect(container.querySelectorAll('[data-testid="generation-apex"]').length).toBe(1);
  });

  it('the apex element has aria-hidden="true"', () => {
    const { container } = renderGrid();
    const apex = container.querySelector('[data-testid="generation-apex"]');
    expect(apex).not.toBeNull();
    expect(apex).toHaveAttribute('aria-hidden', 'true');
  });

  // expanded is a pure function of the passed-in expandedId (Pitfall 5)
  it('passes expanded={person.id === expandedId} to each card', () => {
    const people = [
      makePerson('1', { children: [{ id: 'c1' }] }),
      makePerson('2', { children: [{ id: 'c2' }] }),
      makePerson('3', { children: [{ id: 'c3' }] })
    ];
    renderGrid({ people, expandedId: '2' });
    expect(screen.getByRole('button', { name: 'Show children of Person 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide children of Person 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show children of Person 3' })).toBeInTheDocument();
  });

  // spouse passthrough (reuses PersonCard's own spouse-pairing rendering)
  it('forwards the spouse prop, rendering both the anchor and spouse cards', () => {
    const spouse = makePerson('2s', { fullname: 'Spouse Two' });
    const people = [makePerson('1', { spouses: [spouse] })];
    const { container } = renderGrid({ people });
    expect(container.querySelectorAll('[data-testid^="person-card-"]').length).toBe(2);
    expect(screen.getByText('Spouse Two')).toBeInTheDocument();
  });

  // onExpand/onEdit forwarded verbatim
  it('calls onExpand with the exact member object when a card expand control is clicked', async () => {
    const onExpand = vi.fn();
    const member = makePerson('1', { children: [{ id: 'c1' }] });
    renderGrid({ people: [member], onExpand });
    await userEvent.click(screen.getByRole('button', { name: 'Show children of Person 1' }));
    expect(onExpand).toHaveBeenCalledWith(member);
  });

  it('calls onEdit with the exact member object when the Edit button is clicked', async () => {
    const onEdit = vi.fn();
    const member = makePerson('1', { canEdit: true });
    renderGrid({ people: [member], onEdit });
    await userEvent.click(screen.getByRole('button', { name: 'Edit Person 1' }));
    expect(onEdit).toHaveBeenCalledWith(member);
  });

  // loadingId passthrough
  it('renders a generation-loading badge only for the person matching loadingId', () => {
    const people = [makePerson('1'), makePerson('2')];
    renderGrid({ people, loadingId: '2' });
    expect(screen.queryByTestId('generation-loading-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('generation-loading-2')).toBeInTheDocument();
  });

  it('renders no generation-loading badge when loadingId is null', () => {
    const people = [makePerson('1'), makePerson('2')];
    const { container } = renderGrid({ people, loadingId: null });
    expect(container.querySelectorAll('[data-testid^="generation-loading-"]').length).toBe(0);
  });

  it('renders no generation-loading badge when loadingId does not match any rendered person', () => {
    const people = [makePerson('1'), makePerson('2')];
    const { container } = renderGrid({ people, loadingId: 'nonexistent' });
    expect(container.querySelectorAll('[data-testid^="generation-loading-"]').length).toBe(0);
  });

  // PERM-02: onAddRelative forwarded straight through to PersonCard
  it('forwards onAddRelative so clicking "Add child" invokes the same mock with (\'child\', person)', async () => {
    const onAddRelative = vi.fn();
    const member = makePerson('1', { canEdit: true });
    renderGrid({ people: [member], onAddRelative });
    await userEvent.click(screen.getByLabelText(/add relative to person 1/i));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add child' }));
    expect(onAddRelative).toHaveBeenCalledWith('child', member);
  });
});
