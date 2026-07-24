import axios from 'axios';

export function attachAuthHeader(config) {
  const token = localStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}

const photoClient = axios.create();

photoClient.interceptors.request.use(attachAuthHeader);

function rethrowWithNetworkContext(error) {
  if (error.message === 'Network Error') {
    throw new Error('Network Error: the frontend could not reach the photo API. Check that the backend is running and that VITE_API_URL or VITE_PROXY_TARGET points to it.');
  }
  throw error;
}

export async function uploadMemberPhoto(memberId, blob) {
  try {
    const formData = new FormData();
    formData.append('photo', blob);
    const response = await photoClient.post(`/api/family-members/${memberId}/photo`, formData);
    return response.data;
  } catch (error) {
    rethrowWithNetworkContext(error);
  }
}

export async function removeMemberPhoto(memberId) {
  try {
    const response = await photoClient.delete(`/api/family-members/${memberId}/photo`);
    return response.data;
  } catch (error) {
    rethrowWithNetworkContext(error);
  }
}

export async function fetchMemberPhotoBlob(photoUrl) {
  try {
    const response = await photoClient.get(photoUrl, { responseType: 'blob' });
    return response.data;
  } catch (error) {
    rethrowWithNetworkContext(error);
  }
}

export default photoClient;
