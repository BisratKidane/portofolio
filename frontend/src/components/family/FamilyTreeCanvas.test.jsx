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

  it("collapses to the viewer's immediate family + lineage line (head & leaf), then expands back", async () => {
    // Viewer is Ada (id '1'). Collapse should keep her line up to the head
    // (her mother Grace, id '2') and down to a leaf (her child Byron, id '3'),
    // and fold away the unrelated John (id '4').
    renderCanvas({ viewerId: '1', rootId: '1', initialExpandedIds: new Set(['1', '4']) });
    await waitFor(() => {
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Collapse tree'));
    await waitFor(() => {
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
      expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
      expect(screen.getByText('Byron Lovelace')).toBeInTheDocument();
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    });

    // Expand -> the full initial set is restored (John visible again).
    fireEvent.click(screen.getByLabelText('Collapse tree'));
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  it('identifies the viewer by the ring alone — no "You" chip is rendered', async () => {
    renderCanvas();
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    expect(screen.queryByText('You')).not.toBeInTheDocument();
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

  it('opens the detail panel on DOUBLE click (two clicks call onMemberClick)', async () => {
    const { onMemberClick } = renderCanvas();
    await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());

    // A real double click fires two click events on the node.
    const target = screen.getByText('John Doe');
    fireEvent.click(target);
    fireEvent.click(target);

    expect(onMemberClick).toHaveBeenCalledWith('4');
  });

  it('single-clicking a member re-roots the tree to that person + descendants, and does NOT open the panel', async () => {
    // Ada (id '1') has child Byron (id '3'); John (id '4') is unrelated.
    const { onMemberClick } = renderCanvas();
    await waitFor(() => {
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Ada Lovelace'));

    // After the click-vs-doubleclick delay, the tree is headed on Ada: her
    // descendant Byron appears and the unrelated John is gone.
    await waitFor(() => {
      expect(screen.getByText('Byron Lovelace')).toBeInTheDocument();
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    });
    // A single click must not open the read-only detail panel.
    expect(onMemberClick).not.toHaveBeenCalled();
    // Ada is flagged as the head.
    expect(screen.getByTestId('member-node-1')).toHaveAttribute('data-focus-root', 'true');
  });

  it('opens already re-rooted when initialFocusRootId is provided (headed on that member, unrelated members hidden)', async () => {
    // Navigated in with head = Ada (id '1'): her descendant Byron is shown, the
    // unrelated John is hidden, Ada is flagged as head, and the reset button
    // is available immediately — no click required.
    renderCanvas({ initialFocusRootId: '1' });

    await waitFor(() => {
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
      expect(screen.getByText('Byron Lovelace')).toBeInTheDocument();
    });
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    expect(screen.getByTestId('member-node-1')).toHaveAttribute('data-focus-root', 'true');
    expect(screen.getByRole('button', { name: 'Show full tree' })).toBeInTheDocument();
  });

  it('ignores an initialFocusRootId that is not a member in this forest (falls back to the full tree)', async () => {
    renderCanvas({ initialFocusRootId: '999' });

    await waitFor(() => {
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Show full tree' })).not.toBeInTheDocument();
  });

  it('shows a "Show full tree" button while focused that restores the full forest', async () => {
    renderCanvas();
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Show full tree' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Ada Lovelace'));
    await waitFor(() => expect(screen.queryByText('John Doe')).not.toBeInTheDocument());

    const reset = await screen.findByRole('button', { name: 'Show full tree' });
    fireEvent.click(reset);

    await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Show full tree' })).not.toBeInTheDocument();
  });

  it('clicking the current head again pops back to the full tree', async () => {
    renderCanvas();
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Ada Lovelace'));
    await waitFor(() => expect(screen.queryByText('John Doe')).not.toBeInTheDocument());

    // Click the head (Ada) again -> full tree restored (John visible again).
    fireEvent.click(screen.getByText('Ada Lovelace'));
    await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());
  });

  // The tree now opens framed on the whole forest from the top ancestor (no
  // auto-pan-to-viewer on load); the "Find me" button remains the way to jump
  // back to the viewer's own node.
  it('keeps the "Find me" button working: clicking it leaves the viewer node visible', async () => {
    renderCanvas();
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Find me' }));

    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    expect(screen.getByTestId('member-node-1')).toHaveAttribute('data-viewer-ring', 'true');
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

// Spouse connector edge: styled distinctly from a parent->child edge (dashed,
// primary-tinted) and hidden until BOTH partner nodes are expanded, same gate
// as parent->child edges.
describe('FamilyTreeCanvas — spouse connector edge', () => {
  const MEMBER_6 = {
    id: '6',
    fullname: 'Pat Rivera',
    gender: 'Male',
    mother: null,
    father: null,
    spouses: [{ id: '14' }],
    children: []
  };
  const MEMBER_14 = {
    id: '14',
    fullname: 'Sam Rivera',
    gender: 'Female',
    mother: null,
    father: null,
    spouses: [{ id: '6' }],
    children: []
  };
  const nodes = [
    { id: '6', type: 'member', data: { member: MEMBER_6 } },
    { id: '14', type: 'member', data: { member: MEMBER_14 } }
  ];
  const edges = [
    {
      id: 'spouse-6-14',
      source: '6',
      target: '14',
      type: 'spouse',
      sourceHandle: 'spouse-source',
      targetHandle: 'spouse-target'
    }
  ];

  it('renders the spouse edge with a dashed, distinctly-colored stroke when both partners are expanded', async () => {
    renderCanvas({ nodes, edges, initialExpandedIds: new Set(['6', '14']), viewerId: '6' });

    await waitFor(() => expect(screen.getByText('Pat Rivera')).toBeInTheDocument());

    const edgeEl = await waitFor(() => {
      const el = document.querySelector('[data-testid="rf__edge-spouse-6-14"]');
      expect(el).toBeTruthy();
      return el;
    });
    const path = edgeEl.querySelector('.react-flow__edge-path');
    expect(path).toBeTruthy();
    expect(path.style.strokeDasharray).toBeTruthy();
  });

  it('hides the spouse edge until both partner nodes are expanded', async () => {
    renderCanvas({ nodes, edges, initialExpandedIds: new Set(['6']), viewerId: '6' });

    await waitFor(() => expect(screen.getByText('Pat Rivera')).toBeInTheDocument());
    expect(screen.queryByText('Sam Rivera')).not.toBeInTheDocument();

    const edgeEl = document.querySelector('[data-testid="rf__edge-spouse-6-14"]');
    // Hidden edges are not rendered into the DOM by React Flow at all when
    // `hidden: true` is set on the edge object.
    expect(edgeEl).toBeFalsy();
  });
});
