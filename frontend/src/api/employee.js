import { apiFetch } from './client.js';

export function fetchMyData() {
  return apiFetch('/me/data');
}

export function fetchTeamEmployees() {
  return apiFetch('/team/employees');
}
