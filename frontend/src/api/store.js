import { apiFetch } from './client.js';

export const fetchStoreItems = () => apiFetch('/store/items');

export const createStoreItem = (body) =>
  apiFetch('/store/items', { method: 'POST', body });

export const deleteStoreItem = (id) =>
  apiFetch(`/store/items/${id}`, { method: 'DELETE' });

export const purchaseItem = (item_id) =>
  apiFetch('/store/purchase', { method: 'POST', body: { item_id } });

export const fetchStoreRequests = () => apiFetch('/store/requests');

export const approveRequest = (id) =>
  apiFetch(`/store/requests/${id}/approve`, { method: 'PATCH' });

export const declineRequest = (id) =>
  apiFetch(`/store/requests/${id}/decline`, { method: 'PATCH' });
