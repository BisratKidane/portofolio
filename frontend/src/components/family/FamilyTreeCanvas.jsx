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
import { Box, Button, TextField } from '@mui/material';
import MemberNode from './MemberNode.jsx';
import { layoutWithDagre } from './familyTree.layout.js';

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

export default function FamilyTreeCanvas({ nodes, edges, initialExpandedIds, viewerId, onMemberClick }) {
  const [expandedIds, setExpandedIds] = useState(() => new Set(initialExpandedIds));
  const [searchTerm, setSearchTerm] = useState('');
  const { fitView, getNode } = useReactFlow();
  const didAutoFindMe = useRef(false);

  const membersById = useMemo(() => buildMembersById(nodes), [nodes]);
  const viewerNodeId = viewerId != null ? String(viewerId) : null;

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

  const renderEdges = useMemo(
    () => edges.map((e) => ({ ...e, hidden: !(expandedIds.has(e.source) && expandedIds.has(e.target)) })),
    [edges, expandedIds]
  );

  const findMe = useCallback(() => {
    if (viewerNodeId == null) return;
    if (!expandedIds.has(viewerNodeId)) {
      setExpandedIds((prev) => expandAncestorChainFrom(viewerNodeId, membersById, prev));
      return; // becomes visible next render; the auto-find-me effect below reframes it
    }
    const node = getNode(viewerNodeId);
    if (!node) return;
    fitView({ nodes: [{ id: viewerNodeId }], duration: 400, maxZoom: 1.2 });
  }, [viewerNodeId, expandedIds, membersById, getNode, fitView]);

  // D-02: on load, auto-pan to and highlight the viewer's own node.
  useEffect(() => {
    if (didAutoFindMe.current) return;
    if (viewerNodeId == null) return;
    if (!expandedIds.has(viewerNodeId)) return;
    const node = getNode(viewerNodeId);
    if (!node) return;
    didAutoFindMe.current = true;
    fitView({ nodes: [{ id: viewerNodeId }], duration: 400, maxZoom: 1.2 });
  }, [viewerNodeId, expandedIds, getNode, fitView, renderNodes]);

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
