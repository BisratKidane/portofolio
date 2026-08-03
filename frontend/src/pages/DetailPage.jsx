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

export default function DetailPage() {
  const [mainPerson, setMainPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [missingHead, setMissingHead] = useState(false);

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
      <Box sx={{ width: '100%', maxWidth: 420 }}>
        <PersonCard
          member={mainPerson}
          role="Head"
          spouse={mainPerson.spouses?.[0]}
          expanded={false}
          onExpand={() => {}}
          onEdit={() => {}}
        />
      </Box>
    </Box>
  );
}
