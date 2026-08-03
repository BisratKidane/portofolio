// Inline live-search bar for /detail (SEARCH-01/02/03). A debounced async
// MUI Autocomplete whose options come from the server-side
// searchFamilyMembers(term) query -- the backend already matches partial,
// case-insensitive Latin AND Ge'ez first/last names (Phase 24 D-03), so the
// raw typed term is passed straight through (D-02, no client-side language
// detection/transliteration) and filterOptions is the identity function (do
// NOT re-filter client-side, per PATTERNS.md). Each suggestion row is
// intentionally richer than PersonCard (Phase 25 D-06 omits birth year) to
// disambiguate similarly-named people (D-03).
import { useEffect, useRef, useState } from 'react';
import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import { graphqlRequest } from '../../api/graphqlClient.js';
import { getGeezDisplay } from '../../utils/displayName.js';
import MemberAvatarImage from '../manage/MemberAvatarImage.jsx';

const SEARCH_MEMBERS_QUERY = `
  query SearchFamilyMembers($term: String!) {
    searchFamilyMembers(term: $term) {
      id
      fullname
      geezFullname
      gender
      birthdate
      photoUrl
      mothersname
    }
  }
`;

// D-01: Claude's discretion -- debounce + min-char threshold, chosen to avoid
// a request-per-keystroke storm while still feeling instant.
const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

export default function PersonSearch({ onSelect }) {
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  const handleInputChange = (_event, value) => {
    setInputValue(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const term = value.trim();
    if (term.length < MIN_CHARS) {
      setOptions([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      setLoading(true);
      graphqlRequest(SEARCH_MEMBERS_QUERY, { term })
        .then((data) => setOptions(data.searchFamilyMembers))
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
  };

  return (
    <Autocomplete
      options={options}
      loading={loading}
      filterOptions={(x) => x}
      getOptionLabel={(member) => member.fullname}
      isOptionEqualToValue={(option, value) => option.id === value.id}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      onChange={(_event, value) => value && onSelect(value.id)}
      noOptionsText="No matches"
      renderOption={(props, member) => {
        const { key, ...optionProps } = props;
        const geez = getGeezDisplay(member);
        const year = member.birthdate ? String(member.birthdate).slice(0, 4) : null;
        const context = [year && `b. ${year}`, member.mothersname].filter(Boolean).join(' · ');
        return (
          <Box component="li" key={key} {...optionProps} sx={{ gap: 1.5 }}>
            <MemberAvatarImage member={member} size={32} />
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap>{member.fullname}</Typography>
              {geez && (
                <Typography variant="body2" color="text.secondary" lang={geez.lang} noWrap>
                  {geez.text}
                </Typography>
              )}
              {context && (
                <Typography variant="body2" color="text.secondary" noWrap>
                  {context}
                </Typography>
              )}
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => <TextField {...params} label="Search by name" />}
    />
  );
}
