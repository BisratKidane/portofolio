// Route component for /detail (Phase 26). Opens on the family head via the
// uniform head-id -> person-by-id load path (D-04), rendering a single
// Phase-25 PersonCard with no descendants expanded. Also owns every
// page-level D-08 edge/empty state. Plan 26-02 mounts the persistent
// PersonSearch bar (D-07) above the card, wiring its onSelect straight to
// loadPersonById -- the same uniform person-by-id path the head load uses,
// so selecting a suggestion clears the current view and shows only the new
// person's card with descendants collapsed (SEARCH-03/D-05).
import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { graphqlRequest } from '../api/graphqlClient.js';
import PersonCard from '../components/person/PersonCard.jsx';
import PersonSearch from '../components/person/PersonSearch.jsx';
import GenerationGrid from '../components/person/GenerationGrid.jsx';
import EditMemberDialog from '../components/manage/EditMemberDialog.jsx';
import { useDescendantNav } from '../hooks/useDescendantNav.js';

const FAMILY_HEAD_QUERY = `
  query FamilyHead {
    familyHead { id }
  }
`;

const FAMILY_MEMBER_QUERY = `
  query FamilyMember($id: ID!) {
    familyMember(id: $id) {
      id
      fullname
      geezFullname
      gender
      isAlive
      photoUrl
      canEdit
      spouses { id fullname geezFullname gender isAlive photoUrl }
      children { id }
    }
  }
`;

// PERM-01: the /detail read queries above only carry card-display fields --
// none of EditMemberDialog's editable set (firstname/lastname/geez*/
// mothersname/email/birthdate/phone/address). Fetched fresh, on demand, when
// Edit is clicked, rather than widening the two read queries above (Phase
// 27's established "separate narrower query per use case" convention).
const FAMILY_MEMBER_EDIT_QUERY = `
  query FamilyMemberEdit($id: ID!) {
    familyMember(id: $id) {
      id
      firstname
      lastname
      geezFirstname
      geezLastname
      geezMothersname
      gender
      mothersname
      email
      birthdate
      isAlive
      phone
      address
      photoUrl
      canEdit
    }
  }
`;

export default function DetailPage() {
  const [mainPerson, setMainPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [missingHead, setMissingHead] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editLoadingId, setEditLoadingId] = useState(null);

  // D-04/D-05: the one uniform person-by-id path, reused later by 26-02's
  // suggestion-select as well as the initial head load below.
  const loadPersonById = useCallback((id) => {
    setLoading(true);
    setError('');
    return graphqlRequest(FAMILY_MEMBER_QUERY, { id })
      .then((data) => setMainPerson(data.familyMember))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const loadInitial = useCallback(() => {
    setLoading(true);
    setError('');
    setMissingHead(false);
    setMainPerson(null);
    return graphqlRequest(FAMILY_HEAD_QUERY)
      .then((data) => {
        if (!data.familyHead) {
          setMissingHead(true);
          setLoading(false);
          return;
        }
        return loadPersonById(data.familyHead.id);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [loadPersonById]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // PERM-01: fetches the full editable field set for whatever member was
  // clicked (head, gen1, or gen2), then opens EditMemberDialog pre-filled.
  const handleEditClick = useCallback((member) => {
    setEditLoadingId(member.id);
    return graphqlRequest(FAMILY_MEMBER_EDIT_QUERY, { id: member.id })
      .then((data) => setEditTarget(data.familyMember))
      .catch((err) => setError(err.message))
      .finally(() => setEditLoadingId((current) => (current === member.id ? null : current)));
  }, []);

  // Plan 27-03's hook must be called unconditionally on every render (Rules
  // of Hooks), so it lives above the loading/error/missing early returns
  // below even though its output is only consumed by the final JSX.
  const nav = useDescendantNav(mainPerson);

  // PERM-01 (revision): UNCONDITIONAL for every target -- head, gen1, gen2,
  // or a forward-shifted promoted top -- all route through the exact same
  // nav.refreshEntry(id) call. nav.topPerson/gen1/gen2 all derive from the
  // per-id cache refreshEntry writes to, never from the mainPerson state
  // variable directly, so a head-only loadPersonById branch would silently
  // never reach the rendered card (the blocker this plan fixes). The
  // setMainPerson(fresh) call below is a secondary consistency sync only --
  // it does not retrigger useDescendantNav's cache-seed effect (that
  // effect's deps are [mainPerson?.id], and the id is unchanged here).
  const refreshAfterMutation = useCallback(
    (member) =>
      nav.refreshEntry(member.id).then((fresh) => {
        if (fresh && mainPerson && String(fresh.id) === String(mainPerson.id)) {
          setMainPerson(fresh);
        }
        return fresh;
      }),
    [mainPerson, nav.refreshEntry]
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 10 }}>
        <CircularProgress />
        <Typography color="text.secondary">Loading…</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
        <Alert severity="error">{error}</Alert>
        <Button variant="contained" onClick={loadInitial}>
          Retry
        </Button>
      </Box>
    );
  }

  if (missingHead) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
        <Alert severity="info">No family head found</Alert>
      </Box>
    );
  }

  if (!mainPerson) {
    return (
      <Box sx={{ textAlign: 'center', py: 10 }}>
        <Typography color="text.secondary">We couldn&apos;t find that person.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
      {/* D-07: persistent search bar, stays visible above the centered card. */}
      <Box sx={{ width: '100%', maxWidth: 420 }}>
        <PersonSearch onSelect={(id) => loadPersonById(id)} />
      </Box>
      <Box sx={{ width: '100%', maxWidth: 420, position: 'relative' }}>
        <PersonCard
          member={nav.topPerson}
          role="Head"
          spouse={nav.topPerson.spouses?.[0]}
          expanded={nav.topExpanded}
          onExpand={nav.onExpandTop}
          onEdit={handleEditClick}
        />
        {nav.loadingId === nav.topPerson.id && (
          <CircularProgress
            size={16}
            aria-hidden="true"
            data-testid="top-loading"
            sx={{ position: 'absolute', top: 8, right: 8 }}
          />
        )}
      </Box>
      {nav.topExpanded && nav.gen1.length > 0 && (
        <GenerationGrid
          people={nav.gen1}
          role="Child"
          expandedId={nav.expandedChildId}
          onExpand={nav.onExpandChild}
          onEdit={handleEditClick}
          loadingId={nav.loadingId}
        />
      )}
      {nav.expandedChildId && nav.gen2.length > 0 && (
        <GenerationGrid
          people={nav.gen2}
          role="Grandchild"
          expandedId={null}
          onExpand={nav.onExpandGrandchild}
          onEdit={handleEditClick}
          loadingId={nav.loadingId}
        />
      )}
      <EditMemberDialog
        open={Boolean(editTarget)}
        member={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => refreshAfterMutation(editTarget)}
      />
    </Box>
  );
}
