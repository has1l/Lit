import { API_BASE, ApiError, tokenStore } from './client.js';
import { apiFetch } from './client.js';

export async function openDocumentFile(docId, page = 0) {
  const token = tokenStore.get();
  const response = await fetch(`${API_BASE}/documents/${docId}/file`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!response.ok) throw new Error('Файл не найден');
  const blob = await response.blob();
  const base = URL.createObjectURL(blob);
  const url = page > 0 ? `${base}#page=${page}` : base;
  window.open(url, '_blank');
}

export async function openDocumentView(docId, section = '') {
  const token = tokenStore.get();
  const response = await fetch(`${API_BASE}/documents/${docId}/view`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!response.ok) throw new Error('Документ не найден');
  const html = await response.text();
  const blob = new Blob([html], { type: 'text/html' });
  const base = URL.createObjectURL(blob);
  const anchor = section ? encodeURIComponent(section) : '';
  window.open(anchor ? `${base}#${anchor}` : base, '_blank');
}

export function fetchDocuments() {
  return apiFetch('/documents');
}

export function deleteDocument(id) {
  return apiFetch(`/documents/${id}`, { method: 'DELETE' });
}

export async function uploadDocument(file, audience = 'all') {
  const token = tokenStore.get();
  const form = new FormData();
  form.append('file', file);
  form.append('audience', audience);

  let response;
  try {
    response = await fetch(`${API_BASE}/documents/upload`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    });
  } catch (networkError) {
    throw new ApiError('Не удалось соединиться с сервером', 0, { cause: networkError });
  }

  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}

  if (!response.ok) {
    const message = data?.detail || data?.message || `Ошибка ${response.status}`;
    throw new ApiError(message, response.status, data);
  }

  return data;
}
