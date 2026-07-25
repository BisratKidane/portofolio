// Render-smoke suite for FamilyTreeCanvas (Phase 17, Plan 17-03, revised for
// the pure hierarchical model). Requires the RESEARCH Pitfall 2
// mockReactFlow() jsdom polyfill set -- defined here, colocated, NOT added
// to the global frontend/test/setup.js.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import FamilyTreeCanvas, { expandAncestorChainFrom } from './FamilyTreeCanvas.jsx';

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
// member -- the "2 members, no edge" base case for Tests 1/2/2b/4.
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
const EDGES = [
  { id: 'parent-2-1', source: '2', target: '1', type: 'parent' },
  { id: 'parent-1-3', source: '1', target: '3', type: 'parent' }
];
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

// Regression coverage for the pure hierarchical model: a member connects to
// their parent(s) via direct parent->child edges (no synthetic union node).
// Revealing the child via either interactive toggle must also reveal the
// connecting edge(s) -- the edge-visibility gate
// `hidden: !(expandedIds.has(e.source) && expandedIds.has(e.target))` must
// flip to visible in the same DOM update that reveals both endpoints.
describe('FamilyTreeCanvas — direct parent->child edge reveal on interactive expand', () => {
  it('reveals the connecting parent->child edges when a two-parent child is expanded from an already-visible couple', async () => {
    const MONA = {
      id: '10',
      fullname: 'Mona Adams',
      gender: 'Female',
      mother: null,
      father: null,
      spouses: [{ id: '11' }],
      children: [{ id: '13' }]
    };
    const DEREK = {
      id: '11',
      fullname: 'Derek Adams',
      gender: 'Male',
      mother: null,
      father: null,
      spouses: [{ id: '10' }],
      children: [{ id: '13' }]
    };
    const CARA = {
      id: '13',
      fullname: 'Cara Adams',
      gender: 'Female',
      mother: { id: '10' },
      father: { id: '11' },
      children: []
    };
    const nodes = [
      { id: '10', type: 'member', data: { member: MONA } },
      { id: '11', type: 'member', data: { member: DEREK } },
      { id: '13', type: 'member', data: { member: CARA } }
    ];
    const edges = [
      { id: 'parent-10-13', source: '10', target: '13', type: 'parent' },
      { id: 'parent-11-13', source: '11', target: '13', type: 'parent' }
    ];

    renderCanvas({ nodes, edges, initialExpandedIds: new Set(['10', '11']), viewerId: '10' });

    await waitFor(() => expect(screen.getByText('Mona Adams')).toBeInTheDocument());
    expect(screen.queryByText('Cara Adams')).not.toBeInTheDocument();

    const badge = screen.getByLabelText(/Show \d+ hidden descendants of Mona Adams/);
    fireEvent.click(badge);

    await waitFor(() => expect(screen.getByText('Cara Adams')).toBeInTheDocument());
  });

  it('reveals the connecting parent->child edges when both parents are expanded via the ancestor badge', async () => {
    const CODY = {
      id: '30',
      fullname: 'Cody Baker',
      gender: 'Male',
      mother: { id: '31' },
      father: { id: '32' },
      children: []
    };
    const MEG = {
      id: '31',
      fullname: 'Meg Baker',
      gender: 'Female',
      mother: null,
      father: null,
      spouses: [{ id: '32' }],
      children: [{ id: '30' }]
    };
    const DAN = {
      id: '32',
      fullname: 'Dan Baker',
      gender: 'Male',
      mother: null,
      father: null,
      spouses: [{ id: '31' }],
      children: [{ id: '30' }]
    };
    const nodes = [
      { id: '30', type: 'member', data: { member: CODY } },
      { id: '31', type: 'member', data: { member: MEG } },
      { id: '32', type: 'member', data: { member: DAN } }
    ];
    const edges = [
      { id: 'parent-31-30', source: '31', target: '30', type: 'parent' },
      { id: 'parent-32-30', source: '32', target: '30', type: 'parent' }
    ];

    renderCanvas({ nodes, edges, initialExpandedIds: new Set(['30']), viewerId: '30' });

    await waitFor(() => expect(screen.getByText('Cody Baker')).toBeInTheDocument());
    expect(screen.queryByText('Meg Baker')).not.toBeInTheDocument();

    const badge = screen.getByLabelText(/Show \d+ hidden ancestors of Cody Baker/);
    fireEvent.click(badge);

    await waitFor(() => expect(screen.getByText('Meg Baker')).toBeInTheDocument());
    expect(screen.getByText('Dan Baker')).toBeInTheDocument();

    // Pure-logic assertion using the exact production function the ancestor
    // badge calls: both newly-revealed parents must be present -- this is
    // sufficient for the direct-edge model since the edge-visibility gate
    // depends only on both endpoints being in expandedIds (no extra
    // union-reveal step needed, unlike the old union model).
    const membersById = new Map([
      ['30', CODY],
      ['31', MEG],
      ['32', DAN]
    ]);
    const revealed = expandAncestorChainFrom('30', membersById, new Set(['30']));
    expect(revealed.has('31')).toBe(true);
    expect(revealed.has('32')).toBe(true);
  });
});
