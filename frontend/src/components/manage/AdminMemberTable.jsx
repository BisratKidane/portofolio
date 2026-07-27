import { useState } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import MemberAvatarImage from './MemberAvatarImage.jsx';

// Gender is no longer its own column — the avatar already conveys it. Instead the
// member's NAME is colour-coded: blue for Male, orange for Female (matching the
// gender avatars), default ink for other/unknown.
const NAME_COLOR = { Male: '#2563eb', Female: '#ea580c' };
function nameColor(gender) {
  return NAME_COLOR[gender] || 'text.primary';
}

export default function AdminMemberTable({ members, onSelect }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const filtered = members.filter((member) =>
    member.fullname.toLowerCase().includes(search.trim().toLowerCase())
  );

  const paginated = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const handleSearchChange = (event) => {
    setSearch(event.target.value);
    setPage(0);
  };

  const handleChangePage = (_event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  return (
    <Box>
      <TextField
        label="Search members"
        value={search}
        onChange={handleSearchChange}
        fullWidth
        sx={{ mb: 2 }}
      />
      {filtered.length === 0 ? (
        <Typography>No members match your search.</Typography>
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 56 }} />
                <TableCell>Name</TableCell>
                <TableCell>Linked account</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginated.map((member) => (
                <TableRow
                  key={member.id}
                  hover
                  onClick={() => onSelect(member)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <MemberAvatarImage member={member} />
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, color: nameColor(member.gender) }} noWrap>
                      {member.fullname}
                    </Typography>
                  </TableCell>
                  <TableCell>{member.linkedUser ? member.linkedUser.name : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={filtered.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[10, 25, 50]}
          />
        </TableContainer>
      )}
    </Box>
  );
}
