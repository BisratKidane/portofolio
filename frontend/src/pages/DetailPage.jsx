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
import AddRelativeDialog from '../components/manage/AddRelativeDialog.jsx';
import { useDescendantNav } from '../hooks/useDescendantNav.js';

// PERM-02: /detail has no ready in-scope co-parent list to feed
// AddRelativeDialog's optional Autocomplete, so the picker always shows no
// options (submission still works with otherParentId: null) -- CONTEXT.md
// Claude's Discretion.
const EMPTY_ADD_STATE = { open: false, relationType: '', targetId: null, targetName: '', targetGender: '', level: null };

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
  const [addState, setAddState] = useState(EMPTY_ADD_STATE);

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

  // PERM-02: opens AddRelativeDialog pre-targeted at the clicked person,
  // recording which render site (top/gen1/gen2) triggered it so
  // autoExpandIfCollapsed below knows which nav handler to call on success.
  const handleAddRelative = useCallback(
    (relationType, member, level) =>
      setAddState({ open: true, relationType, targetId: member.id, targetName: member.fullname, targetGender: member.gender, level }),
    []
  );

  // D-05: after a successful add-child, auto-expand the target if its
  // children were previously collapsed so the new child is immediately
  // visible -- respecting the existing one-branch/forward-shift/3-generation
  // rules (nav.onExpandTop/onExpandChild/onExpandGrandchild, unchanged).
  const autoExpandIfCollapsed = useCallback(
    (fresh, level) => {
      if (level === 'top' && !nav.topExpanded) return nav.onExpandTop(fresh);
      if (level === 'gen1' && nav.expandedChildId !== fresh.id) return nav.onExpandChild(fresh);
      if (level === 'gen2') return nav.onExpandGrandchild(fresh);
      return Promise.resolve();
    },
    [nav]
  );

  // PERM-02: refreshAfterMutation (Plan 28-04, revised) already writes the
  // target's fresh self+children into the cache and dispatches REFRESH for
  // EVERY target -- head included -- before this runs, so no special-casing
  // is needed here for an already-expanded target or an add-spouse (the
  // fresh spouses/children are already visible via the cache).
  const handleAddCreated = useCallback(() => {
    const { targetId, relationType, level } = addState;
    return refreshAfterMutation({ id: targetId }).then((fresh) => {
      if (fresh && relationType === 'child') return autoExpandIfCollapsed(fresh, level);
      return null;
    });
  }, [addState, refreshAfterMutation, autoExpandIfCollapsed]);

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
          onAddRelative={(relationType, member) => handleAddRelative(relationType, member, 'top')}
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
          onAddRelative={(relationType, member) => handleAddRelative(relationType, member, 'gen1')}
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
          onAddRelative={(relationType, member) => handleAddRelative(relationType, member, 'gen2')}
          loadingId={nav.loadingId}
        />
      )}
      <EditMemberDialog
        open={Boolean(editTarget)}
        member={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => refreshAfterMutation(editTarget)}
      />
      <AddRelativeDialog
        open={addState.open}
        relationType={addState.relationType}
        targetId={addState.targetId}
        targetName={addState.targetName}
        targetGender={addState.targetGender}
        inScopeMembers={[]}
        onClose={() => setAddState(EMPTY_ADD_STATE)}
        onCreated={handleAddCreated}
      />
    </Box>
  );
}
