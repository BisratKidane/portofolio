import axios from 'axios';

function normalizeGraphqlUrl(url) {
  if (!url) return '/graphql';
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return '/graphql';
  return trimmedUrl.endsWith('/graphql') ? trimmedUrl : `${trimmedUrl.replace(/\/$/, '')}/graphql`;
}

const graphqlClient = axios.create({
  baseURL: normalizeGraphqlUrl(import.meta.env.VITE_API_URL),
  headers: {
    'Content-Type': 'application/json'
  }
});

graphqlClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function graphqlRequest(query, variables = {}) {
  try {
    const response = await graphqlClient.post('', { query, variables });
    if (response.data.errors?.length) {
      throw new Error(response.data.errors.map((error) => error.message).join('\n'));
    }
    return response.data.data;
  } catch (error) {
    if (error.message === 'Network Error') {
      throw new Error('Network Error: the frontend could not reach the GraphQL API. Check that the backend is running and that VITE_API_URL or VITE_PROXY_TARGET points to it.');
    }
    throw error;
  }
}

export default graphqlClient;
