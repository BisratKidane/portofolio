import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLinkMembers from './pages/AdminLinkMembers.jsx';
import AppLayout from './components/AppLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Login from './pages/Login.jsx';
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
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
          <Route path="admin/link-members" element={<AdminLinkMembers />} />
        </Route>
      </Route>
    </Routes>
  );
}
