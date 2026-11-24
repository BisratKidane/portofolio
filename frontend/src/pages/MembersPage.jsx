import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { graphqlRequest } from '../api/graphqlClient.js';
import { downloadMembersPdf } from '../api/membersPdfClient.js';

const MEMBERS_QUERY = `
  query Members {
    familyMembers {
      id
      firstname
      lastname
      gender
      mothersname
      geezFirstname
      geezLastname
      geezMothersname
    }
  }
`;

const GENDER_COLORS = {
  Male: '#1d4ed8',
  Female: '#be185d',
  Other: '#4b5563'
};

const DASH = '–';

function joinNames(first, last) {
  const parts = [first, last].filter(Boolean);
  return parts.length ? parts.join(' ') : DASH;
}

export default function MembersPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await graphqlRequest(MEMBERS_QUERY);
      setMembers(data.familyMembers);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      await downloadMembersPdf();
    } catch (err) {
      setDownloadError(err.message);
    } finally {
      setDownloading(false);
    }
  };

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
        <Button variant="contained" onClick={loadMembers}>
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h4" component="h1">
          Members
        </Typography>
        <Button variant="contained" onClick={handleDownload} disabled={downloading}>
          Download PDF
        </Button>
      </Box>

      {downloadError && <Alert severity="error">{downloadError}</Alert>}

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Mother&apos;s name</TableCell>
              <TableCell>Gender</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {members.map((member) => {
              const geezName = joinNames(member.geezFirstname, member.geezLastname);
              const geezMother = member.geezMothersname || DASH;
              const color = GENDER_COLORS[member.gender] || GENDER_COLORS.Other;
              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <Typography variant="body2">{joinNames(member.firstname, member.lastname)}</Typography>
                    <Typography variant="body2" color="text.secondary" lang="am" sx={{ fontFamily: '"Abyssinica SIL", serif' }}>
                      {geezName}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{member.mothersname || DASH}</Typography>
                    <Typography variant="body2" color="text.secondary" lang="am" sx={{ fontFamily: '"Abyssinica SIL", serif' }}>
                      {geezMother}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={member.gender}
                      size="small"
                      variant="outlined"
                      sx={{ color, borderColor: color, fontWeight: 600 }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
