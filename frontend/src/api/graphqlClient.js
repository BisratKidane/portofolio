import axios from 'axios';

const graphqlClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/graphql',
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
  const response = await graphqlClient.post('', { query, variables });
  if (response.data.errors?.length) {
    throw new Error(response.data.errors.map((error) => error.message).join('\n'));
  }
  return response.data.data;
}

export default graphqlClient;
