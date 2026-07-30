// Colocates the RESEARCH Pitfall 2 mockReactFlow() jsdom polyfill set (same
// shape as FamilyTreeCanvas.test.jsx) because this page mounts
// FamilyTreeCanvas under its own ReactFlowProvider.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FamilyTreePage from './FamilyTreePage.jsx';

const useAuthMock = vi.fn();

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => useAuthMock()
}));

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

vi.mock('../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));

import { graphqlRequest } from '../api/graphqlClient.js';

class MockResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target) {
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

const USER = { id: '1', name: 'Ada', email: 'ada@example.com', role: 'USER', familyMemberId: '1' };

const ADA = {
  id: '1',
  firstname: 'Ada',
  lastname: 'Lovelace',
  fullname: 'Ada Lovelace',
  gender: 'Female',
  birthdate: null,
  isAlive: true,
  photoUrl: null,
  mother: null,
  father: null,
  spouses: [],
  children: []
};

function renderPage(initialEntries = ['/family']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <FamilyTreePage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ user: USER });
});

describe('FamilyTreePage', () => {
  it('shows a loading state while the flat query is pending', () => {
    graphqlRequest.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByText('Building your family tree…')).toBeInTheDocument();
  });

  it('shows an error state with a working Retry button', async () => {
    graphqlRequest.mockRejectedValueOnce(new Error('Network error'));
    renderPage();

    await waitFor(() => expect(screen.getByText("We couldn't load your family tree.")).toBeInTheDocument());
    expect(screen.getByText('Check your connection and try again.')).toBeInTheDocument();

    graphqlRequest.mockResolvedValueOnce({ familyMembers: [ADA] });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    expect(graphqlRequest).toHaveBeenCalledTimes(2);
  });

  it('shows the empty state with a /manage link when familyMembers is empty', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMembers: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Your family tree is empty')).toBeInTheDocument());
    const link = screen.getByText('Family members added on the Manage page will appear here as a tree.');
    expect(link).toHaveAttribute('href', '/manage');
  });

  it('renders a populated tree and opens the detail panel on node double-click', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMembers: [ADA] });
    renderPage();

    await waitFor(() => expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0));

    // Single click re-roots; the detail panel now opens on double-click
    // (two click events on the node).
    const node = screen.getAllByText('Ada Lovelace')[0];
    fireEvent.click(node);
    fireEvent.click(node);

    await waitFor(() => expect(screen.getByText('Dates unknown')).toBeInTheDocument());
  });

  it('opens the tree headed on the ?head= member, hiding unrelated members', async () => {
    // Ada (id '1') heads her branch (child Byron, id '3'); John (id '4') is an
    // unrelated member and must not show when the tree opens headed on Ada.
    const ADA_WITH_CHILD = { ...ADA, children: [{ id: '3' }] };
    const BYRON = {
      id: '3',
      firstname: 'Byron',
      lastname: 'Lovelace',
      fullname: 'Byron Lovelace',
      gender: 'Male',
      birthdate: null,
      isAlive: true,
      photoUrl: null,
      mother: { id: '1' },
      father: null,
      spouses: [],
      children: []
    };
    const JOHN = {
      id: '4',
      firstname: 'John',
      lastname: 'Doe',
      fullname: 'John Doe',
      gender: 'Male',
      birthdate: null,
      isAlive: true,
      photoUrl: null,
      mother: null,
      father: null,
      spouses: [],
      children: []
    };
    graphqlRequest.mockResolvedValueOnce({ familyMembers: [ADA_WITH_CHILD, BYRON, JOHN] });
    renderPage(['/family?head=1']);

    await waitFor(() => {
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
      expect(screen.getByText('Byron Lovelace')).toBeInTheDocument();
    });
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show full tree' })).toBeInTheDocument();
  });

  it('never selects linkedUser in the flat query it issues', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMembers: [ADA] });
    renderPage();

    await waitFor(() => expect(graphqlRequest).toHaveBeenCalled());
    const [query] = graphqlRequest.mock.calls[0];
    expect(query).not.toMatch(/linkedUser/);
  });
});
