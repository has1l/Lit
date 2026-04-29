import { apiFetch } from './client.js';

export function fetchAppeals() {
  return apiFetch('/appeals');
}

export function createAppeal(questionText, category = 'other') {
  return apiFetch('/appeals', {
    method: 'POST',
    body: { question_text: questionText, category },
  });
}

export function resolveAppeal(id, hrResponse) {
  return apiFetch(`/appeals/${id}/resolve`, {
    method: 'PATCH',
    body: { hr_response: hrResponse },
  });
}

export function assignAppeal(id, assigneeEmail) {
  return apiFetch(`/appeals/${id}/assign`, {
    method: 'PATCH',
    body: { assignee_email: assigneeEmail },
  });
}
