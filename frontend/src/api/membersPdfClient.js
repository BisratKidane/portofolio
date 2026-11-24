import axios from 'axios';
import { attachAuthHeader } from './photoClient.js';

const membersPdfClient = axios.create();

membersPdfClient.interceptors.request.use(attachAuthHeader);

function rethrowWithNetworkContext(error) {
  if (error.message === 'Network Error') {
    throw new Error('Network Error: the frontend could not reach the members API. Check that the backend is running and that VITE_API_URL or VITE_PROXY_TARGET points to it.');
  }
  throw error;
}

// A plain <a href> cannot send the Authorization header, so the PDF is fetched
// as a blob with the Bearer token and saved through a temporary object URL.
export async function downloadMembersPdf() {
  let blob;
  try {
    const response = await membersPdfClient.get('/api/members.pdf', { responseType: 'blob' });
    blob = response.data;
  } catch (error) {
    rethrowWithNetworkContext(error);
  }

  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'members.pdf';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default membersPdfClient;
