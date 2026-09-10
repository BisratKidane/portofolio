import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Link, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';
import { graphqlRequest } from '../api/graphqlClient.js';
import {
  validateFullName,
  validateEmail,
  validatePassword,
  validateRelationshipNote,
  MAX_RELATIONSHIP_NOTE_LENGTH,
} from './Register.validation.js';

const PUBLIC_REGISTRATION_ENABLED_QUERY = `query PublicRegistrationEnabled { publicRegistrationEnabled }`;

export default function Register() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [form, setForm] = useState({ name: '', email: '', password: '', relationshipNote: '' });
  const [touched, setTouched] = useState({ name: false, email: false, password: false, relationshipNote: false });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [publicOpen, setPublicOpen] = useState(null);
  const { register } = useAuth();

  // Gates only the tokenless path (D-08): an invited visitor must render
  // immediately with zero added latency, so this effect no-ops on `token`
  // rather than being conditionally called. A rejected read fails closed
  // (setPublicOpen(false)), matching the server's own D-02 fail-closed
  // default, so the client and server never disagree in the direction
  // that would expose the form.
  useEffect(() => {
    if (token) return;
    graphqlRequest(PUBLIC_REGISTRATION_ENABLED_QUERY)
      .then((data) => setPublicOpen(data.publicRegistrationEnabled))
      .catch(() => setPublicOpen(false));
  }, [token]);

  const nameCheck = validateFullName(form.name);
  const emailCheck = validateEmail(form.email);
  const passwordCheck = validatePassword(form.password);
  const noteCheck = validateRelationshipNote(form.relationshipNote);

  // Blur-then-live timing (D-04): a field only shows an error once it has
  // been touched (blurred, or all-touched-on-submit). Errors are derived
  // fresh every render from `form` + the validators, never stored
  // separately, so a touched field's error clears the instant it's fixed.
  const nameError = touched.name && !nameCheck.valid ? nameCheck.message : null;
  const emailError = touched.email && !emailCheck.valid ? emailCheck.message : null;
  const passwordError = touched.password && !passwordCheck.valid ? passwordCheck.message : null;
  const noteError = touched.relationshipNote && !noteCheck.valid ? noteCheck.message : null;

  const handleFieldChange = (field) => (event) => {
    const { value } = event.target;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFieldBlur = (field) => () => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleInvitedSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await register({ token, name: form.name, password: form.password });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePublicSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const allValid = nameCheck.valid && emailCheck.valid && passwordCheck.valid && noteCheck.valid;
    if (!allValid) {
      // A submit with multiple invalid fields lights all of them up at once
      // (D-04 / UI-SPEC validation contract) rather than one at a time.
      setTouched({ name: true, email: true, password: true, relationshipNote: true });
      return;
    }

    setLoading(true);
    try {
      const data = await register({
        name: form.name,
        email: form.email,
        password: form.password,
        relationshipNote: form.relationshipNote,
      });
      setResult(data);
    } catch (err) {
      setError(err.message);
      // D-07 / T-34-06-B: never decide the door is closed by inspecting the
      // rejection's message text. graphqlClient.js:26-28 flattens GraphQL
      // errors into one joined-string Error, so extensions.code is not
      // reachable without widening the shared client (do not do that here).
      // A text match would give this component a second, independently
      // derived notion of "closed" -- decoupled from the stored value,
      // silently broken by any rewording of the server's message, and
      // untestable against the real predicate. That is the precise bug
      // class that has hit this project across Phases 14, 15, 30, 31, 32
      // and 33. Instead, re-run the same query the mount effect uses and
      // let the single invitation-only definition above pick it up.
      //
      // The swapped view must stay byte-identical to the initial-closed
      // view: no "the door just closed while you were filling this in"
      // line, no "your details weren't saved" line, no distinguishing
      // severity. A second variant is copy that must be kept in sync by
      // hand and will not be; and a message that differs by how the
      // visitor arrived leaks that an admin closed the door in the last
      // few seconds -- timing information about an administrative action,
      // on a public unauthenticated page. Losing what the visitor typed is
      // accepted: there is nothing left to submit it to.
      try {
        const stillOpen = await graphqlRequest(PUBLIC_REGISTRATION_ENABLED_QUERY);
        if (!stillOpen.publicRegistrationEnabled) {
          setPublicOpen(false);
          setError('');
        }
      } catch {
        // The re-query itself failed: leave the original error rendered
        // rather than guessing at the door state from a network failure.
      }
    } finally {
      setLoading(false);
    }
  };

  // D-07: this function is the SINGLE definition of the invitation-only
  // view, called from both the initial-closed branch below and the
  // mid-form-refusal swap inside handlePublicSubmit's catch. D-07 requires
  // the two paths show the SAME message; duplicating this JSX at a second
  // call site would create two copies that can drift, which is a small
  // instance of the exact divergence class this phase exists to close. Do
  // not inline a second AuthShell with this copy anywhere else.
  function renderInvitationOnly() {
    return (
      <AuthShell
        eyebrow="Invitation required"
        title="You need an invitation"
        subtitle="Agne is invitation-only right now."
        footer={
          <Typography variant="body2" color="text.secondary">
            Already have an account?{' '}
            <Link component={RouterLink} to="/login">
              Sign in
            </Link>
          </Typography>
        }
      >
        <Alert severity="info">
          Registration is currently by invitation only. Ask an administrator to send you an invitation link, then
          open the link from that email.
        </Alert>
      </AuthShell>
    );
  }

  if (!token) {
    if (publicOpen === null) {
      // No chrome, no title: every visible word differs between the open
      // and closed outcomes, so there is no honest neutral chrome to show
      // while the value is unknown. The outer Box is verbatim
      // AuthShell.jsx:11 so the spinner lands where the card's top edge
      // will be and there is no layout jump once the real view resolves.
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: { xs: 1, md: 3 } }}>
          <CircularProgress />
        </Box>
      );
    }

    if (!publicOpen) {
      return renderInvitationOnly();
    }

    return (
      <AuthShell
        eyebrow="Request access"
        title="Create your account"
        subtitle="Tell us how you're related to the family — an administrator reviews every request."
        footer={
          <Typography variant="body2" color="text.secondary">
            Already have an account?{' '}
            <Link component={RouterLink} to="/login">
              Sign in
            </Link>
          </Typography>
        }
      >
        <Stack spacing={2.25}>
          {error && <Alert severity="error">{error}</Alert>}
          {result ? (
            <>
              {/*
                D-06 / SEC-01 (Phase 32 D-08): this copy is generated
                entirely from the form's own `form.email` state and never
                reads `result.message` -- the same text renders whether or
                not that address already has an account, which is what
                keeps this branch enumeration-silent. Any future edit that
                varies this copy by server response would break SEC-01.
              */}
              <Alert severity="success">Check {form.email} for a verification link.</Alert>
              <Typography variant="body2" color="text.secondary">
                Once you verify your email, an administrator reviews your request. You&apos;ll be able to sign in as
                soon as they approve it.
              </Typography>
            </>
          ) : (
            <Box component="form" onSubmit={handlePublicSubmit} noValidate>
              <Stack spacing={2.25}>
                <TextField
                  label="Full name"
                  value={form.name}
                  onChange={handleFieldChange('name')}
                  onBlur={handleFieldBlur('name')}
                  error={Boolean(nameError)}
                  helperText={nameError}
                  required
                  fullWidth
                  autoComplete="name"
                />
                <TextField
                  label="Email address"
                  type="email"
                  value={form.email}
                  onChange={handleFieldChange('email')}
                  onBlur={handleFieldBlur('email')}
                  error={Boolean(emailError)}
                  helperText={emailError}
                  required
                  fullWidth
                  autoComplete="email"
                />
                <TextField
                  label="Password"
                  type="password"
                  value={form.password}
                  onChange={handleFieldChange('password')}
                  onBlur={handleFieldBlur('password')}
                  error={Boolean(passwordError)}
                  helperText={passwordError}
                  required
                  fullWidth
                  autoComplete="new-password"
                />
                <TextField
                  label="How are you related to the family?"
                  value={form.relationshipNote}
                  onChange={handleFieldChange('relationshipNote')}
                  onBlur={handleFieldBlur('relationshipNote')}
                  error={Boolean(noteError)}
                  helperText={
                    <Box component="span" sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <span>{noteError || 'e.g. "cousin", "in-law", "family friend"'}</span>
                      <Typography
                        component="span"
                        variant="caption"
                        color={
                          form.relationshipNote.length > MAX_RELATIONSHIP_NOTE_LENGTH ? 'error' : 'text.secondary'
                        }
                      >
                        {`${form.relationshipNote.length}/${MAX_RELATIONSHIP_NOTE_LENGTH}`}
                      </Typography>
                    </Box>
                  }
                  required
                  fullWidth
                  multiline
                  minRows={3}
                />
                <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>
                  {loading ? 'Creating account…' : 'Create account'}
                </Button>
              </Stack>
            </Box>
          )}
        </Stack>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Get started"
      title="Create your account"
      subtitle="You've been invited — set up your Agne profile."
      footer={
        <Typography variant="body2" color="text.secondary">
          Already have an account?{' '}
          <Link component={RouterLink} to="/login">
            Sign in
          </Link>
        </Typography>
      }
    >
      <Stack spacing={2.25}>
        {error && <Alert severity="error">{error}</Alert>}
        {result ? (
          <>
            <Alert severity="success">{result.message}</Alert>
            <Typography variant="body2" color="text.secondary">
              We&apos;ve sent a verification link to your email. Verify it and you can sign in right away.
            </Typography>
          </>
        ) : (
          <Box component="form" onSubmit={handleInvitedSubmit} noValidate>
            <Stack spacing={2.25}>
              <TextField
                label="Full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                fullWidth
                autoComplete="name"
              />
              <TextField
                label="Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                fullWidth
                autoComplete="new-password"
              />
              <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>
                {loading ? 'Creating account…' : 'Create account'}
              </Button>
            </Stack>
          </Box>
        )}
      </Stack>
    </AuthShell>
  );
}
