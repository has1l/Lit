import { apiFetch, tokenStore } from './client.js';

export async function login(email, password) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body:   { email, password },
  });
  if (data?.access_token) {
    tokenStore.set(data.access_token);
  }
  return data;
}

export async function fetchMe() {
  return apiFetch('/auth/me');
}

export function logout() {
  tokenStore.clear();
}
