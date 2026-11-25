import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Link,
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
    familyMembersDepthFirst {
      id
      firstname
      lastname
      gender
      mothersname
      geezFirstname
      geezLastname
      geezMothersname
      email
      phone
    }
  }
`;

const GENDER_COLORS = {
  Male: '#1d4ed8',
  Female: '#be185d',
  Other: '#4b5563'
};

const LINE_SX = { minHeight: '1.43em' };

// Same character set as the PDF service so page and PDF agree.
const NOISE_RE = /[\s\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]+/g;

function clean(value) {
  return value == null ? '' : String(value).replace(NOISE_RE, ' ').trim();
}

function joinNames(first, last) {
  return [clean(first), clean(last)].filter(Boolean).join(' ');
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
      setMembers(data.familyMembersDepthFirst);
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
              <TableCell>ID</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Mother&apos;s name</TableCell>
              <TableCell>Contact</TableCell>
              <TableCell>Gender</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {members.map((member) => {
              const geezName = joinNames(member.geezFirstname, member.geezLastname);
              const geezMother = clean(member.geezMothersname);
              const email = clean(member.email);
              const phone = clean(member.phone);
              const color = GENDER_COLORS[member.gender] || GENDER_COLORS.Other;
              return (
                <TableRow key={member.id}>
                  <TableCell>{String(member.id)}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={LINE_SX}>{joinNames(member.firstname, member.lastname)}</Typography>
                    <Typography variant="body2" color="text.secondary" lang="am" sx={{ ...LINE_SX, fontFamily: '"Abyssinica SIL", serif' }}>
                      {geezName}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={LINE_SX}>{clean(member.mothersname)}</Typography>
                    <Typography variant="body2" color="text.secondary" lang="am" sx={{ ...LINE_SX, fontFamily: '"Abyssinica SIL", serif' }}>
                      {geezMother}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ ...LINE_SX, wordBreak: 'break-all' }}>
                      {email && <Link href={`mailto:${email}`}>{email}</Link>}
                    </Typography>
                    <Typography variant="body2" sx={LINE_SX}>
                      {phone && <Link href={`tel:${phone}`}>{phone}</Link>}
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
