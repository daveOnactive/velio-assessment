export const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function apiClient<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiBaseUrl + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Something went wrong');
  return body as T;
}
