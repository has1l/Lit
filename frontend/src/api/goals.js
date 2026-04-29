import { apiFetch } from './client.js';

export const fetchGoals = (params = {}) => {
  const q = new URLSearchParams();
  if (params.employee_email) q.set('employee_email', params.employee_email);
  if (params.month) q.set('month', params.month);
  if (params.year) q.set('year', params.year);
  return apiFetch(`/goals?${q}`);
};

export const createGoal = (body) =>
  apiFetch('/goals', { method: 'POST', body });

export const updateGoal = (id, body) =>
  apiFetch(`/goals/${id}`, { method: 'PUT', body });

export const deleteGoal = (id) =>
  apiFetch(`/goals/${id}`, { method: 'DELETE' });

export const fetchDailyTasks = (date) =>
  apiFetch(`/goals/daily?date=${date}`);

export const selectDailyTasks = (goal_ids, date) =>
  apiFetch('/goals/daily', { method: 'POST', body: { goal_ids, date } });

export const completeDailyTask = (selection_id) =>
  apiFetch(`/goals/daily/${selection_id}/complete`, { method: 'PATCH' });

export const uncompleteDailyTask = (selection_id) =>
  apiFetch(`/goals/daily/${selection_id}/uncomplete`, { method: 'PATCH' });

export const finishDay = (date) =>
  apiFetch('/goals/daily/finish', { method: 'POST', body: { date } });

export const fetchGamificationStats = () =>
  apiFetch('/gamification/stats');

export const fetchBonusRecords = () =>
  apiFetch('/gamification/bonus-records');

export const reviewBonus = (id, action) =>
  apiFetch(`/gamification/bonus-records/${id}/review`, { method: 'PATCH', body: { action } });

export const closeMonth = (params = {}) => {
  const q = new URLSearchParams();
  if (params.month) q.set('month', params.month);
  if (params.year) q.set('year', params.year);
  if (params.employee_email) q.set('employee_email', params.employee_email);
  return apiFetch(`/gamification/close-month?${q}`, { method: 'POST' });
};

export const suggestPoints = (goals) =>
  apiFetch('/goals/suggest-points', { method: 'POST', body: { goals } });
