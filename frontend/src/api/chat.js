import { apiFetch } from './client.js';

export async function sendChatMessage(message, history = [], signal) {
  return apiFetch('/chat', {
    method: 'POST',
    body:   { message, history },
    signal,
  });
}
