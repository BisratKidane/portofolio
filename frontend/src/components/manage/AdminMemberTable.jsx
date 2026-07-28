import { useState } from 'react';
import {
  Box,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import MemberAvatarImage from './MemberAvatarImage.jsx';
import { colors } from '../../theme.js';

function formatWhen(value) {
  if (!value) return null;
  const ms = Number.isNaN(Number(value)) ? Date.parse(value) : Number(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Compact provenance cell: "name" over the date it happened. Admin-only data —
// createdBy/updatedBy are already null for non-admins server-side.
function Provenance({ who, when }) {
  const date = formatWhen(when);
  return (
    <Box>
      <Typography variant="body2" noWrap>{who?.name || '—'}</Typography>
      {date && (
        <Typography variant="caption" color="text.secondary" noWrap>
          {date}
        </Typography>
      )}
    </Box>
  );
}

// Gender is no longer its own column — the avatar already conveys it. Instead the
// member's NAME is colour-coded: blue for Male, orange for Female (matching the
// gender avatars), default ink for other/unknown.
const NAME_COLOR = { Male: '#2563eb', Female: '#ea580c' };
function nameColor(gender) {
  return NAME_COLOR[gender] || 'text.primary';
}

export default function AdminMemberTable({ members, onSelect, onToggleAlive }) {
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
                {/* Headerless: a link icon marks members with a linked account. */}
                <TableCell sx={{ width: 44 }} />
                <TableCell>Living</TableCell>
                <TableCell>Last edited by</TableCell>
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
                  <TableCell sx={{ textAlign: 'center' }}>
                    {member.linkedUser && (
                      <Tooltip title={`Linked to ${member.linkedUser.name}`}>
                        <LinkRoundedIcon
                          fontSize="small"
                          titleAccess={`Linked to ${member.linkedUser.name}`}
                          sx={{ color: colors.primary, verticalAlign: 'middle' }}
                        />
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()} sx={{ cursor: 'default' }}>
                    <Tooltip title={member.isAlive !== false ? 'Living — click to mark deceased' : 'Deceased — click to mark living'}>
                      <Switch
                        size="small"
                        checked={member.isAlive !== false}
                        onChange={() => onToggleAlive && onToggleAlive(member)}
                        inputProps={{ 'aria-label': `Toggle living status for ${member.fullname}` }}
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell><Provenance who={member.updatedBy} when={member.updatedAt} /></TableCell>
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
