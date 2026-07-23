import { useState } from 'react';
import { Box, TextField, Typography } from '@mui/material';

export default function AdminMemberTable({ members, onSelect }) {
  const [search, setSearch] = useState('');

  const filtered = members.filter((member) =>
    member.fullname.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <Box>
      <TextField
        label="Search members"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        fullWidth
        sx={{ mb: 2 }}
      />
      {filtered.length === 0 ? (
        <Typography>No members match your search.</Typography>
      ) : (
        <Box>
          {filtered.map((member) => (
            <Box key={member.id} onClick={() => onSelect(member)} sx={{ cursor: 'pointer', py: 1 }}>
              {member.fullname}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
