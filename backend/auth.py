"""
Модуль авторизации HR-ассистента.

Реализует:
  - POST /auth/login  — принимает email/пароль, возвращает JWT-токен с ролью
  - GET  /auth/me     — возвращает профиль текущего пользователя по токену

Роли:
  hr       — Анна Петрова  (hr@portal-test.1221systems.ru)
  employee — Иван Сидоров  (work@portal-test.1221systems.ru)
  manager  — Сергей Козлов (dir@portal-test.1221systems.ru)

ВАЖНО: В продакшене замени MOCK_USERS на реальную интеграцию
с порталом https://portal-test.1221systems.ru.
"""

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel

# ── Конфигурация JWT ──────────────────────────────────────────────────────────
SECRET_KEY = "1221-systems-hackathon-secret-change-in-prod"
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 8

# ── Моковые пользователи (эмулируют портал 1221 Systems) ─────────────────────
MOCK_USERS: dict[str, dict] = {
    "hr@portal-test.1221systems.ru": {
        "password": "6J1~CzTZ&X",
        "role":     "hr",
        "name":     "Анна Петрова",
        "department": "HR",
    },
    "work@portal-test.1221systems.ru": {
        "password": "6J1~CzTZ&X",
        "role":     "employee",
        "name":     "Иван Сидоров",
        "department": "Разработка",
    },
    "dir@portal-test.1221systems.ru": {
        "password": "6J1~CzTZ&X",
        "role":     "manager",
        "name":     "Сергей Козлов",
        "department": "Разработка",
    },
    "senior@portal-test.1221systems.ru": {
        "password": "6J1~CzTZ&X",
        "role":     "employee",
        "name":     "Мария Волкова",
        "department": "Разработка",
    },
    "qa@portal-test.1221systems.ru": {
        "password": "6J1~CzTZ&X",
        "role":     "employee",
        "name":     "Алексей Новиков",
        "department": "Разработка",
    },
    "design@portal-test.1221systems.ru": {
        "password": "6J1~CzTZ&X",
        "role":     "employee",
        "name":     "Ольга Смирнова",
        "department": "Дизайн",
    },
    "clean@portal-test.1221systems.ru": {
        "password": "6J1~CzTZ&X",
        "role":     "employee",
        "name":     "Татьяна Фёдорова",
        "department": "Хозяйственный отдел",
    },
}

# ── Pydantic-схемы ────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email:    str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    role:         str
    name:         str


class UserContext(BaseModel):
    """Декодированный контекст пользователя из JWT — передаётся в агент."""
    email:      str
    role:       str
    name:       str
    department: str


# ── Вспомогательные функции ───────────────────────────────────────────────────

def _create_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]) -> UserContext:
    """
    Dependency для FastAPI-роутов.
    Декодирует JWT и возвращает UserContext.
    """
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Невалидный или просроченный токен",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub", "")
        if not email:
            raise credentials_error
        return UserContext(
            email=email,
            role=payload["role"],
            name=payload["name"],
            department=payload["department"],
        )
    except JWTError:
        raise credentials_error


# ── Роутер ────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    """
    Авторизация по email и паролю.
    Возвращает JWT-токен, который нужно передавать
    в заголовке: Authorization: Bearer <token>
    """
    user = MOCK_USERS.get(body.email)
    if not user or user["password"] != body.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
        )

    token = _create_token({
        "sub":        body.email,
        "role":       user["role"],
        "name":       user["name"],
        "department": user["department"],
    })

    return TokenResponse(
        access_token=token,
        role=user["role"],
        name=user["name"],
    )


@router.get("/me", response_model=UserContext)
def get_me(current_user: Annotated[UserContext, Depends(get_current_user)]):
    """Возвращает профиль текущего пользователя."""
    return current_user
