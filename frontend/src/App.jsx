import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Login from './pages/Login.jsx';
import ManagePage from './pages/ManagePage.jsx';
import Pending from './pages/Pending.jsx';
import Register from './pages/Register.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
// Temporary SC-1 spike route (Phase 17, Plan 17-02, D-11 gate). Removed in
// Plan 17-03 Task 1 once the human checkpoint approves the pattern.
import TreeSpikeHarness from './components/family/__spike/TreeSpikeHarness.jsx';

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
          {/* Temporary SC-1 spike (D-11) -- removed in Plan 17-03 Task 1 */}
          <Route path="family-spike" element={<TreeSpikeHarness />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
          <Route path="admin/link-members" element={<Navigate to="/manage" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
