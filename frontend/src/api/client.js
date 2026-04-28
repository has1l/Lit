/**
 * Базовый HTTP-клиент для общения с FastAPI-бэкендом 1221 HR Assistant.
 *
 * В dev-режиме Vite проксирует /api/* → http://127.0.0.1:8000.
 * Для iOS-клиента можно собрать отдельный билд с VITE_API_BASE=https://...,
 * базовый путь меняется одной переменной.
 */

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const TOKEN_KEY = 'lit-auth-token';

export const tokenStore = {
  get:    () => localStorage.getItem(TOKEN_KEY),
  set:    (token) => localStorage.setItem(TOKEN_KEY, token),
  clear:  () => localStorage.removeItem(TOKEN_KEY),
};

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name    = 'ApiError';
    this.status  = status;
    this.payload = payload;
  }
}

export { ApiError };

export async function apiFetch(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const token = tokenStore.get();
  const finalHeaders = {
    Accept: 'application/json',
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: finalHeaders,
      body:    body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (networkError) {
    throw new ApiError('Не удалось соединиться с сервером', 0, { cause: networkError });
  }

  const text = await response.text();
  const data = text ? safeJson(text) : null;

  if (!response.ok) {
    const message = data?.detail || data?.message || `Ошибка ${response.status}`;
    if (response.status === 401) {
      tokenStore.clear();
    }
    throw new ApiError(message, response.status, data);
  }

  return data;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
