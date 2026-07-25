import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import MemberNode from './MemberNode.jsx';

vi.mock('../../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));

// MemberNode now renders React Flow <Handle>s, which require both a
// ReactFlowProvider ancestor and a ResizeObserver whose entries expose
// contentRect (jsdom has none; @xyflow/system reads entry.contentRect).
class ResizeObserverPolyfill {
  observe(target) {
    this.cb?.([{ target, contentRect: { width: 180, height: 64, top: 0, left: 0 } }]);
  }
  unobserve() {}
  disconnect() {}
  constructor(cb) {
    this.cb = cb;
  }
}
globalThis.ResizeObserver = globalThis.ResizeObserver || ResizeObserverPolyfill;

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
  const utils = render(
    <ReactFlowProvider>
      <MemberNode data={data} />
    </ReactFlowProvider>
  );
  return { data, ...utils };
}

describe('MemberNode', () => {
  it('renders the full name and birth-death years', () => {
    renderNode();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('1932–2001')).toBeInTheDocument();
  });

  it('renders four handles (top/bottom for parent->child, left/right for the spouse connector) so both edge types can attach', () => {
    const { container } = renderNode();
    // Without these handles React Flow draws no edges at all.
    const handles = container.querySelectorAll('.react-flow__handle');
    expect(handles.length).toBe(4);
    expect(container.querySelector('.react-flow__handle-top')).toBeTruthy();
    expect(container.querySelector('.react-flow__handle-bottom')).toBeTruthy();
    expect(container.querySelector('.react-flow__handle-left')).toBeTruthy();
    expect(container.querySelector('.react-flow__handle-right')).toBeTruthy();
  });

  it('exposes explicit handle ids so parent/child/spouse edges attach to the correct side', () => {
    const { container } = renderNode();
    expect(container.querySelector('[data-handleid="child-target"]')).toBeTruthy();
    expect(container.querySelector('[data-handleid="parent-source"]')).toBeTruthy();
    expect(container.querySelector('[data-handleid="spouse-source"]')).toBeTruthy();
    expect(container.querySelector('[data-handleid="spouse-target"]')).toBeTruthy();
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

  it('depicts a Male member by card colour (data-gender + accessible label), not a gender icon', () => {
    const { container } = renderNode({ member: { ...BASE_MEMBER, gender: 'Male' } });
    const card = screen.getByTestId(`member-node-${BASE_MEMBER.id}`);
    expect(card).toHaveAttribute('data-gender', 'Male');
    expect(card).toHaveAccessibleName('Ada Lovelace, Male');
    // Gender is now conveyed by colour, not an icon.
    expect(container.querySelector('svg[aria-label="Male"]')).toBeNull();
  });

  it('depicts a Female member by card colour', () => {
    renderNode({ member: { ...BASE_MEMBER, gender: 'Female' } });
    const card = screen.getByTestId(`member-node-${BASE_MEMBER.id}`);
    expect(card).toHaveAttribute('data-gender', 'Female');
    expect(card).toHaveAccessibleName('Ada Lovelace, Female');
  });

  it('depicts any other gender value as "Other" by card colour', () => {
    renderNode({ member: { ...BASE_MEMBER, gender: 'Other' } });
    const card = screen.getByTestId(`member-node-${BASE_MEMBER.id}`);
    expect(card).toHaveAttribute('data-gender', 'Other');
    expect(card).toHaveAccessibleName('Ada Lovelace, Other');
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
