// Route component for /family (Phase 17, Plan 17-04). Fetches the single
// flat FamilyMember query on mount, assembles the forest client-side via
// buildForest, and orchestrates FamilyTreeCanvas (Plan 17-03) + the
// read-only MemberDetailPanel (this plan's Task 1).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
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
      id firstname lastname fullname gender birthdate deathdate photoUrl
      mother { id } father { id } spouses { id } children { id }
    }
  }
`;

export default function FamilyTreePage() {
  const { user } = useAuth();
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

  const membersById = useMemo(() => new Map(members.map((member) => [String(member.id), member])), [members]);

  const forest = useMemo(
    () => buildForest(members, user.familyMemberId),
    [members, user.familyMemberId]
  );

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
    <Box sx={{ height: 'calc(100vh - 220px)', minHeight: 480 }}>
      <ReactFlowProvider>
        <FamilyTreeCanvas
          nodes={forest.nodes}
          edges={forest.edges}
          initialExpandedIds={forest.initialExpandedIds}
          viewerId={user.familyMemberId}
          onMemberClick={(id) => setSelectedMemberId(id)}
        />
      </ReactFlowProvider>
      <MemberDetailPanel
        open={Boolean(selectedMemberId)}
        member={membersById.get(selectedMemberId)}
        membersById={membersById}
        onClose={() => setSelectedMemberId(null)}
      />
    </Box>
  );
}
