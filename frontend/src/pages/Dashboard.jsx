import { useEffect, useState } from 'react';
import { Alert, Card, CardContent, Chip, Grid, List, ListItem, ListItemText, Typography } from '@mui/material';
import { graphqlRequest } from '../api/graphqlClient.js';

const DASHBOARD_QUERY = `
  query Dashboard {
    dashboard {
      message
      user { id name email role }
      users { id name email role }
    }
  }
`;

export default function Dashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    graphqlRequest(DASHBOARD_QUERY)
      .then((data) => setDashboard(data.dashboard))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!dashboard) return <Typography>Loading dashboard...</Typography>;

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={dashboard.user.role === 'ADMIN' ? 6 : 12}>
        <Card>
          <CardContent>
            <Typography variant="h4" gutterBottom>Dashboard</Typography>
            <Typography sx={{ mb: 2 }}>{dashboard.message}</Typography>
            <Typography variant="h6">{dashboard.user.name}</Typography>
            <Typography color="text.secondary">{dashboard.user.email}</Typography>
            <Chip sx={{ mt: 2 }} label={dashboard.user.role} color={dashboard.user.role === 'ADMIN' ? 'secondary' : 'primary'} />
          </CardContent>
        </Card>
      </Grid>
      {dashboard.user.role === 'ADMIN' && (
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>System users</Typography>
              <List>
                {dashboard.users.map((user) => (
                  <ListItem key={user.id} divider>
                    <ListItemText primary={`${user.name} (${user.role})`} secondary={user.email} />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
      )}
    </Grid>
  );
}
