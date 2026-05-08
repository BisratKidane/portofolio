import { useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { graphqlRequest } from '../api/graphqlClient.js';

const REQUEST_RESET = `
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email) { message resetToken }
  }
`;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const data = await graphqlRequest(REQUEST_RESET, { email });
      setResult(data.requestPasswordReset);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Paper sx={{ maxWidth: 560, mx: 'auto', p: 4 }}>
      <Typography variant="h4" gutterBottom>Password reset</Typography>
      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          {result && <Alert severity="success">{result.message}{result.resetToken ? ` Dev token: ${result.resetToken}` : ''}</Alert>}
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" variant="contained">Request reset token</Button>
        </Stack>
      </Box>
    </Paper>
  );
}
