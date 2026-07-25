// Render-smoke suite for FamilyTreeCanvas (Phase 17, Plan 17-03). Requires
// the RESEARCH Pitfall 2 mockReactFlow() jsdom polyfill set -- defined here,
// colocated, NOT added to the global frontend/test/setup.js.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import FamilyTreeCanvas from './FamilyTreeCanvas.jsx';

vi.mock('../../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));

class MockResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target) {
    // xyflow's internal extentResizeObserver reads entry.contentRect.width/
    // height (not just `target`) -- RESEARCH.md's documented mockReactFlow()
    // snippet omits this field, which throws inside @xyflow/system at the
    // installed v12 version; contentRect is added here as a Rule 1 fix.
    setTimeout(
      () =>
        this.callback(
          [{ target, contentRect: { width: target.offsetWidth || 1, height: target.offsetHeight || 1 } }],
          this
        ),
      0
    );
  }
  unobserve() {}
  disconnect() {}
}

function mockReactFlow() {
  global.ResizeObserver = MockResizeObserver;
  global.DOMMatrixReadOnly = class {
    constructor(transform) {
      const scale = transform?.match(/scale\(([1-9.])\)/)?.[1];
      this.m22 = scale !== undefined ? +scale : 1;
    }
  };
  Object.defineProperties(global.HTMLElement.prototype, {
    offsetHeight: {
      get() {
        return parseFloat(this.style.height) || 1;
      },
      configurable: true
    },
    offsetWidth: {
      get() {
        return parseFloat(this.style.width) || 1;
      },
      configurable: true
    }
  });
  global.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
}

mockReactFlow();

// Ada (viewer, id '1') is visible; her mother Grace (id '2', hidden
// ancestor) and her child Byron (id '3', hidden descendant) start outside
// initialExpandedIds. John Doe (id '4') is a second visible, unrelated
// member -- the "2 members, no union" base case for Tests 1/2/2b/4.
const ADA = { id: '1', fullname: 'Ada Lovelace', gender: 'Female', mother: { id: '2' }, father: null, children: [{ id: '3' }] };
const GRACE = { id: '2', fullname: 'Grace Hopper', gender: 'Female', mother: null, father: null, children: [{ id: '1' }] };
const BYRON = { id: '3', fullname: 'Byron Lovelace', gender: 'Male', mother: { id: '1' }, father: null, children: [] };
const JOHN = { id: '4', fullname: 'John Doe', gender: 'Male', mother: null, father: null, children: [] };

const NODES = [
  { id: '1', type: 'member', data: { member: ADA } },
  { id: '2', type: 'member', data: { member: GRACE } },
  { id: '3', type: 'member', data: { member: BYRON } },
  { id: '4', type: 'member', data: { member: JOHN } }
];
const EDGES = [];
const VIEWER_ID = '1';

function renderCanvas(overrides = {}) {
  const onMemberClick = vi.fn();
  const props = {
    nodes: NODES,
    edges: EDGES,
    initialExpandedIds: new Set(['1', '4']),
    viewerId: VIEWER_ID,
    onMemberClick,
    ...overrides
  };
  const utils = render(
    <ReactFlowProvider>
      <FamilyTreeCanvas {...props} />
    </ReactFlowProvider>
  );
  return { onMemberClick, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FamilyTreeCanvas', () => {
  it('renders visible members from the initial expand set', async () => {
    renderCanvas();
    await waitFor(() => {
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  it('highlights the viewer node with the You chip; the non-viewer node has neither', async () => {
    renderCanvas();
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('applies the viewer ring to the viewer node only', async () => {
    renderCanvas();
    await waitFor(() => expect(screen.getByTestId('member-node-1')).toBeInTheDocument());
    expect(screen.getByTestId('member-node-1')).toHaveAttribute('data-viewer-ring', 'true');
    expect(screen.getByTestId('member-node-4')).toHaveAttribute('data-viewer-ring', 'false');
  });

  it('keeps a hidden descendant out of the document, revealing it via the descendant expand badge', async () => {
    renderCanvas();
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    expect(screen.queryByText('Byron Lovelace')).not.toBeInTheDocument();

    const badge = screen.getByLabelText(/Show \d+ hidden descendants of Ada Lovelace/);
    fireEvent.click(badge);

    await waitFor(() => expect(screen.getByText('Byron Lovelace')).toBeInTheDocument());
  });

  it('keeps a hidden ancestor out of the document, revealing it via the ancestor expand badge', async () => {
    renderCanvas();
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();

    const badge = screen.getByLabelText(/Show \d+ hidden ancestors of Ada Lovelace/);
    fireEvent.click(badge);

    await waitFor(() => expect(screen.getByText('Grace Hopper')).toBeInTheDocument());
  });

  it('calls onMemberClick with the clicked member id', async () => {
    const { onMemberClick } = renderCanvas();
    await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());

    fireEvent.click(screen.getByText('John Doe'));

    expect(onMemberClick).toHaveBeenCalledWith('4');
  });
});
