import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { graphqlRequest } from '../api/graphqlClient.js';

const AuthContext = createContext(null);

const ME_QUERY = `
  query Me {
    me { id name email role }
  }
`;

const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) { token user { id name email role } }
  }
`;

const REGISTER_MUTATION = `
  mutation Register($name: String!, $email: String!, $password: String!) {
    register(name: $name, email: $email, password: $password) { token user { id name email role } }
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
    const payload = data.login || data.register;
    localStorage.setItem('authToken', payload.token);
    setUser(payload.user);
    return payload.user;
  };

  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated: Boolean(user),
    login: (email, password) => authenticate(LOGIN_MUTATION, { email, password }),
    register: (name, email, password) => authenticate(REGISTER_MUTATION, { name, email, password }),
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
