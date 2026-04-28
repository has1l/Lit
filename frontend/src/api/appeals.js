import { apiFetch } from './client.js';

export function fetchAppeals() {
  return apiFetch('/appeals');
}

export function createAppeal(questionText, category = 'other') {
  return apiFetch('/appeals', {
    method: 'POST',
    body: JSON.stringify({ question_text: questionText, category }),
  });
}

export function resolveAppeal(id, hrResponse) {
  return apiFetch(`/appeals/${id}/resolve`, {
    method: 'PATCH',
    body: JSON.stringify({ hr_response: hrResponse }),
  });
}

export function assignAppeal(id, assigneeEmail) {
  return apiFetch(`/appeals/${id}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ assignee_email: assigneeEmail }),
  });
}
