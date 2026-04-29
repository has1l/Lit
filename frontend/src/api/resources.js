import { apiFetch } from './client.js';

export function fetchResources() {
  return apiFetch('/resources');
}

export function createResource(data) {
  return apiFetch('/resources', { method: 'POST', body: JSON.stringify(data) });
}

export function deleteResource(id) {
  return apiFetch(`/resources/${id}`, { method: 'DELETE' });
}
