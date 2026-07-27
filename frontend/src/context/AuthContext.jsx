import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { graphqlRequest } from '../api/graphqlClient.js';

const AuthContext = createContext(null);

const ME_QUERY = `
  query Me {
    me { id name email role familyMemberId }
  }
`;

const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) { token user { id name email role familyMemberId } }
  }
`;

const REGISTER_MUTATION = `
  mutation Register($name: String!, $email: String!, $password: String!) {
    register(name: $name, email: $email, password: $password) { message }
  }
`;

const VERIFY_EMAIL_MUTATION = `
  mutation VerifyEmail($token: String!) {
    verifyEmail(token: $token) { token user { id name email role familyMemberId } }
  }
`;

const CHANGE_PASSWORD_MUTATION = `
  mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
    changePassword(currentPassword: $currentPassword, newPassword: $newPassword) {
      token
      user { id name email role familyMemberId }
    }
  }
`;

const LOGOUT_MUTATION = `mutation Logout { logout }`;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      if (!localStorage.getItem('authToken')) {
        setLoading(false);
        return;
      }
      try {
        const data = await graphqlRequest(ME_QUERY);
        setUser(data.me);
      } catch {
        localStorage.removeItem('authToken');
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []);

  const authenticate = async (mutation, variables) => {
    const data = await graphqlRequest(mutation, variables);
    const payload = data.login || data.verifyEmail;
    localStorage.setItem('authToken', payload.token);
    setUser(payload.user);
    return payload.user;
  };

  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated: Boolean(user),
    login: (email, password) => authenticate(LOGIN_MUTATION, { email, password }),
    register: (name, email, password) => graphqlRequest(REGISTER_MUTATION, { name, email, password }).then((data) => data.register),
    verifyEmail: (token) => authenticate(VERIFY_EMAIL_MUTATION, { token }),
    // Changing your own password rotates the JWT (the old one is revoked by
    // passwordChangedAt on the backend), so persist the fresh token to stay
    // signed in and refresh the cached user.
    changePassword: async (currentPassword, newPassword) => {
      const data = await graphqlRequest(CHANGE_PASSWORD_MUTATION, { currentPassword, newPassword });
      const payload = data.changePassword;
      localStorage.setItem('authToken', payload.token);
      setUser(payload.user);
      return payload.user;
    },
    logout: async () => {
      try {
        if (localStorage.getItem('authToken')) await graphqlRequest(LOGOUT_MUTATION);
      } finally {
        localStorage.removeItem('authToken');
        setUser(null);
      }
    }
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
