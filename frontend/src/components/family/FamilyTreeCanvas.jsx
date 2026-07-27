// <ReactFlow> wrapper for the /family tree (Phase 17, Plan 17-03, revised
// for the pure hierarchical model). Owns dagre layout-on-visible-subset,
// collapse/expand state in BOTH the descendant and ancestor direction
// (D-03), and all four D-05 navigation aids (find-me, search, zoom/fit,
// minimap). Read-only -- nodesDraggable is always false (D-08).
//
// The caller (FamilyTreePage, Plan 17-04) supplies the FULL forest (all
// nodes/edges from buildForest, not yet layout-positioned) plus
// initialExpandedIds and viewerId, and must mount this component under a
// <ReactFlowProvider> (useReactFlow() requires one -- RESEARCH Pattern 4).
//
// Pure hierarchical model (supersedes the union/marriage/descent model,
// D-11/D-12): every edge is a direct member->member 'parent' edge, so the
// CR-01 union-reveal helpers (buildUnionConnections/revealConnectingUnions)
// are no longer needed -- the edge-visibility gate
// `hidden: !(expandedIds.has(e.source) && expandedIds.has(e.target))`
// already reveals a parent->child edge as soon as both its member endpoints
// are expanded.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controls, MiniMap, Panel, ReactFlow, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Box, Button, FormControlLabel, Switch, TextField } from '@mui/material';
import MemberNode from './MemberNode.jsx';
import { layoutWithDagre } from './familyTree.layout.js';
import { deriveSiblings } from './familyTree.assembly.js';
import { colors } from '../../theme.js';

const NODE_TYPES = { member: MemberNode };

function idOrNull(ref) {
  return ref?.id != null ? String(ref.id) : null;
}

function buildMembersById(nodes) {
  const map = new Map();
  for (const n of nodes) {
    if (n.type === 'member') map.set(n.id, n.data.member);
  }
  return map;
}

function computeHiddenCount(member, expandedIds) {
  return (member.children || []).filter((child) => {
    const childId = idOrNull(child);
    return childId != null && !expandedIds.has(childId);
  }).length;
}

function computeAncestorHiddenCount(member, expandedIds) {
  let count = 0;
  const motherId = idOrNull(member.mother);
  const fatherId = idOrNull(member.father);
  if (motherId != null && !expandedIds.has(motherId)) count += 1;
  if (fatherId != null && !expandedIds.has(fatherId)) count += 1;
  return count;
}

// Adds memberId's currently-hidden mother/father id(s), then walks each
// newly-revealed ancestor's own hidden ancestor chain up to its apex
// (mirrors onToggleExpand's descendant-reveal shape, but walking upward).
// In the pure hierarchical model, revealing both endpoints of a
// parent->child edge is all the edge-visibility gate needs -- no separate
// union-reveal step required (see file header).
export function expandAncestorChainFrom(memberId, membersById, expandedIds) {
  const next = new Set(expandedIds);
  const queue = [];
  const seed = membersById.get(String(memberId));
  if (seed) {
    const motherId = idOrNull(seed.mother);
    const fatherId = idOrNull(seed.father);
    if (motherId != null && !next.has(motherId)) {
      next.add(motherId);
      queue.push(motherId);
    }
    if (fatherId != null && !next.has(fatherId)) {
      next.add(fatherId);
      queue.push(fatherId);
    }
  }
  while (queue.length > 0) {
    const currentId = queue.shift();
    const current = membersById.get(currentId);
    if (!current) continue;
    const motherId = idOrNull(current.mother);
    const fatherId = idOrNull(current.father);
    if (motherId != null && !next.has(motherId)) {
      next.add(motherId);
      queue.push(motherId);
    }
    if (fatherId != null && !next.has(fatherId)) {
      next.add(fatherId);
      queue.push(fatherId);
    }
  }
  return next;
}

// The collapsed view: a focal member's immediate family (parents, spouse,
// children, siblings) PLUS the vertical lineage line through them — up to the
// head (top ancestor, mother-preferred) and down to a leaf (first-child chain).
// Gives a "you are here" slice instead of the whole tree.
export function computeCollapsedSet(focalId, membersById) {
  const set = new Set();
  const start = focalId != null ? String(focalId) : null;
  if (start == null || !membersById.has(start)) return set;

  const focal = membersById.get(start);
  set.add(start);

  // Immediate family.
  for (const rel of [focal.mother, focal.father, ...(focal.spouses || []), ...(focal.children || [])]) {
    const id = idOrNull(rel);
    if (id != null && membersById.has(id)) set.add(id);
  }
  for (const sibling of deriveSiblings(start, membersById)) set.add(String(sibling.id));

  // Line up to the head (prefer the mother's chain, D-01 tie-break).
  let cursor = start;
  const walkedUp = new Set();
  while (cursor != null && membersById.has(cursor) && !walkedUp.has(cursor)) {
    walkedUp.add(cursor);
    set.add(cursor);
    const member = membersById.get(cursor);
    const motherId = idOrNull(member.mother);
    const fatherId = idOrNull(member.father);
    if (motherId == null && fatherId == null) break;
    cursor =
      motherId != null && membersById.has(motherId)
        ? motherId
        : fatherId != null && membersById.has(fatherId)
          ? fatherId
          : null;
  }

  // Line down to a leaf (first child at each step).
  cursor = start;
  const walkedDown = new Set();
  while (cursor != null && membersById.has(cursor) && !walkedDown.has(cursor)) {
    walkedDown.add(cursor);
    set.add(cursor);
    const member = membersById.get(cursor);
    const childIds = (member.children || [])
      .map(idOrNull)
      .filter((id) => id != null && membersById.has(id));
    if (childIds.length === 0) break;
    cursor = childIds[0];
  }

  return set;
}

export default function FamilyTreeCanvas({ nodes, edges, initialExpandedIds, viewerId, rootId, onMemberClick }) {
  const [expandedIds, setExpandedIds] = useState(() => new Set(initialExpandedIds));
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const { fitView, getNode } = useReactFlow();
  const didInitialFit = useRef(false);

  const membersById = useMemo(() => buildMembersById(nodes), [nodes]);
  const viewerNodeId = viewerId != null ? String(viewerId) : null;
  const rootNodeId = rootId != null ? String(rootId) : null;

  // Collapse toggle. Collapse folds the tree down to the focal member's
  // immediate family plus the lineage line through them (up to the head, down to
  // a leaf); the +N badges then reveal more. Expand restores the full tree. The
  // focal member is the viewer, falling back to the root ancestor.
  const handleToggleCollapse = useCallback(
    (event) => {
      const next = event.target.checked;
      setCollapsed(next);
      if (next) {
        const collapsedSet = computeCollapsedSet(viewerNodeId ?? rootNodeId, membersById);
        setExpandedIds(collapsedSet.size ? collapsedSet : new Set(rootNodeId ? [rootNodeId] : []));
      } else {
        setExpandedIds(new Set(initialExpandedIds));
      }
      requestAnimationFrame(() => fitView({ padding: 0.1, duration: 400 }));
    },
    [viewerNodeId, rootNodeId, membersById, initialExpandedIds, fitView]
  );

  // Memo key = the visible id set only, NOT the full node/edge arrays --
  // dagre re-runs on expand/collapse toggles, not on every render. Nodes
  // outside expandedIds are NOT removed from the array (kept, hidden:true
  // set), which keeps dagre's rank math stable across toggles.
  const visibleIdsKey = useMemo(() => [...expandedIds].sort().join(','), [expandedIds]);

  const positionedNodes = useMemo(() => {
    const withHidden = nodes.map((n) => ({ ...n, hidden: !expandedIds.has(n.id) }));
    return layoutWithDagre(withHidden, edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIdsKey]);

  const handleToggleExpand = useCallback(
    (memberId) => {
      setExpandedIds((prev) => {
        const member = membersById.get(String(memberId));
        if (!member) return prev;
        const next = new Set(prev);
        for (const child of member.children || []) {
          const childId = idOrNull(child);
          if (childId != null) next.add(childId);
        }
        return next;
      });
    },
    [membersById]
  );

  const handleToggleAncestorExpand = useCallback(
    (memberId) => {
      setExpandedIds((prev) => expandAncestorChainFrom(memberId, membersById, prev));
    },
    [membersById]
  );

  const renderNodes = useMemo(
    () =>
      positionedNodes.map((n) => {
        if (n.type !== 'member') return n;
        const member = n.data.member;
        const hiddenCount = computeHiddenCount(member, expandedIds);
        const ancestorHiddenCount = computeAncestorHiddenCount(member, expandedIds);
        return {
          ...n,
          data: {
            member,
            isViewer: idOrNull(member) === viewerNodeId,
            hiddenCount,
            onToggleExpand: handleToggleExpand,
            ancestorHiddenCount,
            onToggleAncestorExpand: handleToggleAncestorExpand
          }
        };
      }),
    [positionedNodes, expandedIds, viewerNodeId, handleToggleExpand, handleToggleAncestorExpand]
  );

  // Render each domain edge as a built-in React Flow edge type, styled by
  // domain edge type, hidden until BOTH endpoints are expanded (same gate
  // for parent->child and spouse edges). 'parent' edges use 'smoothstep'
  // (valid built-in type -> no missing-edge-type warning, orthogonal tree
  // look); 'spouse' edges use a straight, dashed, distinctly-tinted
  // connector so a married pair reads as linked without looking like a
  // parent->child relationship. sourceHandle/targetHandle are preserved via
  // the `...e` spread so each edge attaches to its dedicated handle.
  const renderEdges = useMemo(() => {
    const posById = new Map(positionedNodes.map((n) => [n.id, n.position]));
    return edges.map((e) => {
      if (e.type === 'spouse') {
        // Orient the connector so it always exits the LEFT partner's right side
        // and enters the RIGHT partner's left side (matches the layout's spouse
        // snap), regardless of the edge's stored source/target id order.
        const ps = posById.get(e.source);
        const pt = posById.get(e.target);
        const leftId = ps && pt && pt.x < ps.x ? e.target : e.source;
        const rightId = leftId === e.source ? e.target : e.source;
        return {
          ...e,
          source: leftId,
          target: rightId,
          sourceHandle: 'spouse-source',
          targetHandle: 'spouse-target',
          type: 'straight',
          style: { stroke: colors.primary, strokeWidth: 1.5, strokeDasharray: '4 3' },
          hidden: !(expandedIds.has(e.source) && expandedIds.has(e.target))
        };
      }
      return {
        ...e,
        type: 'smoothstep',
        style: { stroke: colors.slate, strokeWidth: 1.5 },
        hidden: !(expandedIds.has(e.source) && expandedIds.has(e.target))
      };
    });
  }, [edges, expandedIds, positionedNodes]);

  const findMe = useCallback(() => {
    if (viewerNodeId == null) return;
    // Reveal the viewer's ancestor chain if it's currently collapsed, then
    // frame the viewer node. requestAnimationFrame lets the reveal's layout
    // settle before fitView runs (mirrors handleSearchSubmit); this is
    // self-contained now that the on-load auto-pan effect is gone.
    if (!expandedIds.has(viewerNodeId)) {
      setExpandedIds((prev) => expandAncestorChainFrom(viewerNodeId, membersById, prev));
    }
    requestAnimationFrame(() => {
      if (!getNode(viewerNodeId)) return;
      fitView({ nodes: [{ id: viewerNodeId }], duration: 400, maxZoom: 1.2 });
    });
  }, [viewerNodeId, expandedIds, membersById, getNode, fitView]);

  // On load, frame the WHOLE tree once (root at top), fit to the window.
  // Replaces the old auto-pan-to-viewer behavior — the tree now always opens
  // from the top ancestor. The ref guard keeps this to a single run.
  useEffect(() => {
    if (didInitialFit.current) return;
    if (renderNodes.length === 0) return;
    didInitialFit.current = true;
    fitView({ padding: 0.1, duration: 400 });
  }, [renderNodes, fitView]);

  const handleSearchSubmit = useCallback(
    (event) => {
      event.preventDefault();
      const term = searchTerm.trim().toLowerCase();
      if (!term) return;
      const match = nodes.find(
        (n) => n.type === 'member' && n.data.member.fullname?.toLowerCase().includes(term)
      );
      if (!match) return;
      setExpandedIds((prev) => {
        const withMatch = expandAncestorChainFrom(match.id, membersById, prev);
        withMatch.add(match.id);
        return withMatch;
      });
      requestAnimationFrame(() => {
        fitView({ nodes: [{ id: match.id }], duration: 400, maxZoom: 1.2 });
      });
    },
    [searchTerm, nodes, membersById, fitView]
  );

  const handleNodeClick = useCallback(
    (_event, node) => {
      if (node.type === 'member' && onMemberClick) onMemberClick(node.id);
    },
    [onMemberClick]
  );

  return (
    <ReactFlow
      nodes={renderNodes}
      edges={renderEdges}
      nodeTypes={NODE_TYPES}
      nodesDraggable={false}
      onNodeClick={handleNodeClick}
      fitView
      minZoom={0.05}
      maxZoom={2}
    >
      <MiniMap />
      <Controls />
      <Panel position="top-left">
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            p: 1.5,
            bgcolor: 'background.paper',
            borderRadius: 1,
            boxShadow: 1
          }}
        >
          <Button variant="contained" onClick={findMe} sx={{ minHeight: 44 }}>
            Find me
          </Button>
          <FormControlLabel
            control={<Switch checked={collapsed} onChange={handleToggleCollapse} size="small" />}
            label="Collapse tree"
            sx={{ m: 0 }}
          />
          <Box component="form" onSubmit={handleSearchSubmit} sx={{ display: 'flex', gap: 1 }}>
            <TextField
              size="small"
              placeholder="Search by name"
              aria-label="Search by name"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              sx={{ minWidth: 160 }}
            />
          </Box>
        </Box>
      </Panel>
    </ReactFlow>
  );
}
