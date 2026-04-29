import { apiFetch } from './client.js';

export function fetchMyData() {
  return apiFetch('/me/data');
}

export function fetchTeamEmployees() {
  return apiFetch('/team/employees');
}

export function fetchTeamStatuses() {
  return apiFetch('/team/statuses');
}

export function fetchEmployeeProfile(email) {
  return apiFetch(`/employees/${encodeURIComponent(email)}`);
}

export function updateMyStatus(status, currentTask = '') {
  return apiFetch('/me/status', {
    method: 'PUT',
    body: { status, current_task: currentTask },
  });
}
