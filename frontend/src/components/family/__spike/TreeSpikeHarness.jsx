// Throwaway spike harness (Phase 17, Plan 17-02, SC-1/D-11 human checkpoint).
// Renders the synthetic-union-node spouse-pairing pattern at ~15-20
// generation depth for a human visual pass/fail check. Registered behind
// the existing ProtectedRoute at /family-spike (frontend/src/App.jsx).
//
// This file (and buildSpikeFixture.js, and the temporary family-spike route)
// is explicitly temporary -- Plan 17-03 Task 1 deletes __spike/ and removes
// the route once the SC-1 checkpoint is approved.

import { useMemo } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Box, Typography } from '@mui/material';
import { buildForest } from '../familyTree.assembly.js';
import { layoutWithDagre } from '../familyTree.layout.js';
import { buildSpikeFixture } from './buildSpikeFixture.js';

const PERSON_STYLE = {
  width: 180,
  height: 64,
  border: '1px solid #90caf9',
  borderRadius: 8,
  background: '#e3f2fd',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  padding: 4,
  textAlign: 'center'
};

const UNION_STYLE = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  background: '#616161'
};

function toFlowNodes(nodes) {
  return nodes.map((n) => ({
    id: n.id,
    position: n.position,
    data: { label: n.type === 'member' ? n.data.member.fullname : '' },
    style: n.type === 'union' ? UNION_STYLE : PERSON_STYLE,
    draggable: false
  }));
}

function toFlowEdges(edges) {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'straight',
    style: e.type === 'marriage' ? { stroke: '#616161', strokeDasharray: '4 2' } : { stroke: '#1976d2' }
  }));
}

export default function TreeSpikeHarness() {
  const { flowNodes, flowEdges, memberCount } = useMemo(() => {
    const fixture = buildSpikeFixture({ generations: 18 });
    const { nodes, edges } = buildForest(fixture);
    const laidOut = layoutWithDagre(nodes, edges);
    return {
      flowNodes: toFlowNodes(laidOut),
      flowEdges: toFlowEdges(edges),
      memberCount: fixture.length
    };
  }, []);

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="caption" sx={{ p: 1 }}>
        SC-1 spike: {memberCount} synthetic members, union-node spouse pairing (D-11/D-12). Temporary route -- removed in Plan 17-03.
      </Typography>
      <Box sx={{ flex: 1 }}>
        <ReactFlowProvider>
          <ReactFlow nodes={flowNodes} edges={flowEdges} fitView minZoom={0.05} maxZoom={2}>
            <Background />
            <Controls />
          </ReactFlow>
        </ReactFlowProvider>
      </Box>
    </Box>
  );
}
