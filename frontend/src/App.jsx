import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Dashboard from './pages/Dashboard.jsx';
import FamilyTreePage from './pages/FamilyTreePage.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Login from './pages/Login.jsx';
import InvitationsPage from './pages/InvitationsPage.jsx';
import LinkAccountsPage from './pages/LinkAccountsPage.jsx';
import ManagePage from './pages/ManagePage.jsx';
import Pending from './pages/Pending.jsx';
import Register from './pages/Register.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="verify-email" element={<VerifyEmail />} />
        <Route path="pending" element={<Pending />} />
        <Route element={<ProtectedRoute />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="manage" element={<ManagePage />} />
          <Route path="family" element={<FamilyTreePage />} />
          <Route path="invitations" element={<InvitationsPage />} />
          {/* Old split routes now redirect to the merged Invitations page. */}
          <Route path="invite" element={<Navigate to="/invitations" replace />} />
          <Route path="approvals" element={<Navigate to="/invitations" replace />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
          <Route path="link-accounts" element={<LinkAccountsPage />} />
          <Route path="admin/link-members" element={<Navigate to="/link-accounts" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
