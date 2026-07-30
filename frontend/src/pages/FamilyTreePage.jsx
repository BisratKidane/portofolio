// Route component for /family (Phase 17, Plan 17-04). Fetches the single
// flat FamilyMember query on mount, assembles the forest client-side via
// buildForest, and orchestrates FamilyTreeCanvas (Plan 17-03) + the
// read-only MemberDetailPanel (this plan's Task 1).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import { useAuth } from '../context/AuthContext.jsx';
import { graphqlRequest } from '../api/graphqlClient.js';
import { buildForest } from '../components/family/familyTree.assembly.js';
import FamilyTreeCanvas from '../components/family/FamilyTreeCanvas.jsx';
import MemberDetailPanel from '../components/family/MemberDetailPanel.jsx';

// D-14/Pitfall 6: this query is reachable by any linked member
// (requireFamilyAccess, Plan 17-01), so it must never expose the
// admin-only account-link field that myEditableMembers/familyMember(id)
// select on ManagePage.
const FAMILY_TREE_QUERY = `
  query FamilyTree {
    familyMembers {
      id firstname lastname fullname geezFullname gender birthdate isAlive photoUrl mothersname address
      mother { id fullname } father { id } spouses { id } children { id }
    }
  }
`;

const TOGGLE_ALIVE_MUTATION = `
  mutation ToggleAlive($id: ID!, $fields: EditFamilyMemberInput!) {
    editMember(id: $id, fields: $fields) { id isAlive }
  }
`;

export default function FamilyTreePage() {
  const { user } = useAuth();
  // Optional ?head=<memberId> (e.g. from the Linked accounts list) opens the
  // tree already re-rooted on that member.
  const [searchParams] = useSearchParams();
  const headId = searchParams.get('head');
  const [members, setMembers] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState(null);

  const refetch = useCallback(() => {
    setPageLoading(true);
    setPageError('');
    return graphqlRequest(FAMILY_TREE_QUERY)
      .then((data) => setMembers(data.familyMembers))
      .catch((err) => setPageError(err.message))
      .finally(() => setPageLoading(false));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const isAdmin = user?.role === 'ADMIN';

  // Admin isAlive toggle from the detail panel: flip the boolean, then patch the
  // single member in place so the drawer stays open and the tree re-renders
  // without a full-page reload.
  const handleToggleAlive = useCallback(async (member) => {
    const { editMember } = await graphqlRequest(TOGGLE_ALIVE_MUTATION, {
      id: member.id,
      fields: { isAlive: member.isAlive === false }
    });
    setMembers((prev) =>
      prev.map((m) => (String(m.id) === String(member.id) ? { ...m, isAlive: editMember.isAlive } : m))
    );
  }, []);

  const membersById = useMemo(() => new Map(members.map((member) => [String(member.id), member])), [members]);

  const forest = useMemo(() => buildForest(members), [members]);

  // The tree opens showing the WHOLE tree (every member), not just the root's
  // descendants. The collapse toggle folds it down to the root ancestor and
  // "expand" restores this full set.
  const allExpandedIds = useMemo(() => new Set(forest.nodes.map((node) => node.id)), [forest.nodes]);

  if (pageLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 10 }}>
        <CircularProgress />
        <Typography color="text.secondary">Building your family tree…</Typography>
      </Box>
    );
  }

  if (pageError) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
        <Alert severity="error">
          <Typography component="span" sx={{ display: 'block' }}>
            We couldn&apos;t load your family tree.
          </Typography>
          <Typography component="span" sx={{ display: 'block' }} variant="body2">
            Check your connection and try again.
          </Typography>
        </Alert>
        <Button variant="contained" onClick={refetch}>
          Retry
        </Button>
      </Box>
    );
  }

  if (members.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 10 }}>
        <Typography variant="h5">Your family tree is empty</Typography>
        <Typography color="text.secondary" component={RouterLink} to="/manage" sx={{ mt: 1, display: 'inline-block' }}>
          Family members added on the Manage page will appear here as a tree.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: { xs: 'calc(100vh - 64px)', md: 'calc(100vh - 72px)' }, width: '100%' }}>
      <ReactFlowProvider>
        <FamilyTreeCanvas
          nodes={forest.nodes}
          edges={forest.edges}
          initialExpandedIds={allExpandedIds}
          viewerId={user.familyMemberId}
          rootId={forest.rootAncestorId}
          onMemberClick={(id) => setSelectedMemberId(id)}
          initialFocusRootId={headId}
        />
      </ReactFlowProvider>
      <MemberDetailPanel
        open={Boolean(selectedMemberId)}
        member={membersById.get(selectedMemberId)}
        membersById={membersById}
        onClose={() => setSelectedMemberId(null)}
        canToggleAlive={isAdmin}
        onToggleAlive={handleToggleAlive}
      />
    </Box>
  );
}
