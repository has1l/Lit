"""
Политика доступа к данным сотрудников.

Иерархия:
  hr      → видит всё о всех
  manager → видит всё о своей команде
  employee → видит свои данные + публичные поля коллег
"""

# Поля, доступные любому сотруднику о любом коллеге
PUBLIC_FIELDS = {
    "full_name", "position", "department",
    "birth_date", "hire_date", "phone", "avatar_color",
}

# Поля, доступные только самому сотруднику / manager / hr
PRIVATE_FIELDS = {
    "salary", "leave_balances", "salary_payments", "bonus_records",
}


def can_access(
    requester_role: str,
    requester_email: str,
    subject_email: str,
    field: str,
) -> bool:
    """Возвращает True если requester может видеть field о subject."""
    if requester_role in ("manager", "hr"):
        return True
    if requester_email == subject_email:
        return True
    return field in PUBLIC_FIELDS


def denial_message() -> str:
    return "Данная информация является конфиденциальной."
