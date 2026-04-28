import { apiFetch } from './client.js';

export const fetchContacts = () =>
  apiFetch('/messages/contacts');

export const fetchMessages = (withEmail) =>
  apiFetch(`/messages?with_email=${encodeURIComponent(withEmail)}`);

export const postMessage = (toEmail, text) =>
  apiFetch('/messages', { method: 'POST', body: { to_email: toEmail, text } });
