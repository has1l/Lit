/**
 * Адаптер между бэкенд-моделью UserContext (RBAC-роль)
 * и UI-моделью (имя, инициалы, должность для отображения).
 *
 * Бэкенд возвращает: { email, role: "employee"|"manager"|"hr", name, department }
 * UI хочет:          { name, fullName, role, department, avatar, email, rbacRole }
 */

const POSITION_BY_ROLE = {
  employee: 'Сотрудник',
  manager:  'Руководитель отдела',
  hr:       'HR-специалист',
};

export function displayUser(authUser) {
  if (!authUser) return null;
  const parts    = authUser.name.trim().split(/\s+/);
  const initials = parts.map((part) => part[0] || '').join('').slice(0, 2).toUpperCase();
  const firstName = parts[0] || authUser.name;

  return {
    name:       firstName,
    fullName:   authUser.name,
    role:       POSITION_BY_ROLE[authUser.role] || authUser.role,
    department: authUser.department,
    avatar:     initials,
    email:      authUser.email,
    rbacRole:   authUser.role,
  };
}

/**
 * Какой UI-режим (вкладка "Сотрудник" vs "Руководитель") показывать
 * по умолчанию для данной RBAC-роли.
 */
export function defaultViewMode(rbacRole) {
  if (rbacRole === 'manager' || rbacRole === 'hr') return 'manager';
  return 'employee';
}
