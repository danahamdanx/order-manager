import { API_URL, ApiError, getToken } from '../api';

// الـ API بيطلب Authorization، والرابط العادي (<a href>) ما بيبعته. فبنجيب الملف بـ fetch ونحمّله من الذاكرة
export async function downloadCsv(path: string, filename: string): Promise<{ truncated: boolean }> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError('Cannot reach the server.', 0);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error ?? `Export failed (${res.status})`, res.status, body?.details ?? []);
  }

  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { truncated: res.headers.get('X-Export-Truncated') === 'true' };
}