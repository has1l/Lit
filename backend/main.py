"""
Точка входа FastAPI-приложения HR-ассистента.

Маршруты:
  POST /auth/login    — авторизация, получение JWT
  GET  /auth/me       — профиль текущего пользователя
  GET  /me/data       — отпуск и зарплата текущего пользователя
  POST /chat          — отправка сообщения агенту
  GET  /health        — проверка работоспособности

Запуск:
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

from datetime import datetime
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agent import run_agent
from auth import UserContext, get_current_user, router as auth_router
from database import get_connection, init_db

# ── Инициализация приложения ──────────────────────────────────────────────────

app = FastAPI(
    title="1221 HR Assistant API",
    description="Корпоративный HR-ассистент на базе Ollama + LangGraph",
    version="0.1.0",
)

# CORS — разрешаем запросы от React dev-сервера
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем роутер авторизации (/auth/login, /auth/me)
app.include_router(auth_router)


# ── Инициализация БД при старте ───────────────────────────────────────────────

@app.on_event("startup")
def on_startup():
    init_db()
    print("[API] Сервер запущен. База данных готова.")


# ── Схемы запрос/ответ для чата ───────────────────────────────────────────────

class HistoryMessage(BaseModel):
    role: str   # "user" | "assistant"
    text: str


class ChatRequest(BaseModel):
    message: str
    history: list[HistoryMessage] = []


class ChatResponse(BaseModel):
    answer:  str
    sources: list[str]
    steps:   int
    user:    str       # имя пользователя для отображения в UI


# ── Маршруты ──────────────────────────────────────────────────────────────────

@app.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    """
    Основной эндпоинт чата.

    Принимает сообщение пользователя, запускает агент с контекстом роли,
    возвращает ответ с источниками.

    Требует заголовок: Authorization: Bearer <token>
    """
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Сообщение не может быть пустым")

    result = await run_agent(
        user_email=current_user.email,
        user_role=current_user.role,
        user_name=current_user.name,
        user_department=current_user.department,
        message=body.message,
        history=[{"role": h.role, "text": h.text} for h in body.history],
    )

    return ChatResponse(
        answer=result["answer"],
        sources=result["sources"],
        steps=result["steps"],
        user=current_user.name,
    )


@app.get("/team/employees")
def get_team_employees(current_user: Annotated[UserContext, Depends(get_current_user)]):
    """
    Список сотрудников команды.
    manager — только прямые подчинённые (manager_email = текущий пользователь).
    hr      — все сотрудники компании.
    """
    if current_user.role not in ("manager", "hr"):
        raise HTTPException(status_code=403, detail="Нет доступа")

    conn = get_connection()
    try:
        year = datetime.now().year

        if current_user.role == "hr":
            rows = conn.execute(
                "SELECT e.email, e.full_name, e.department, e.position, e.hire_date, "
                "       lb.total_days, lb.used_days, lb.pending_days "
                "FROM employees e "
                "LEFT JOIN leave_balances lb "
                "       ON lb.employee_email = e.email AND lb.year = ? "
                "ORDER BY e.department, e.full_name",
                (year,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT e.email, e.full_name, e.department, e.position, e.hire_date, "
                "       lb.total_days, lb.used_days, lb.pending_days "
                "FROM employees e "
                "LEFT JOIN leave_balances lb "
                "       ON lb.employee_email = e.email AND lb.year = ? "
                "WHERE e.manager_email = ? "
                "ORDER BY e.full_name",
                (year, current_user.email),
            ).fetchall()

        result = []
        for r in rows:
            total = r["total_days"] or 28
            used  = r["used_days"]  or 0
            pend  = r["pending_days"] or 0
            result.append({
                "email":          r["email"],
                "full_name":      r["full_name"],
                "department":     r["department"],
                "position":       r["position"],
                "hire_date":      r["hire_date"],
                "vacation_total":     total,
                "vacation_used":      used,
                "vacation_pending":   pend,
                "vacation_remaining": total - used - pend,
            })
        return result
    finally:
        conn.close()


@app.get("/me/data")
def get_my_data(current_user: Annotated[UserContext, Depends(get_current_user)]):
    """
    Данные текущего пользователя: баланс отпуска за текущий год,
    история по годам и ближайшие/последние выплаты.
    """
    conn = get_connection()
    try:
        year = datetime.now().year
        today = datetime.now().strftime("%Y-%m-%d")

        emp_row = conn.execute(
            "SELECT full_name, position, department, hire_date FROM employees "
            "WHERE email = ?",
            (current_user.email,),
        ).fetchone()

        leave_row = conn.execute(
            "SELECT total_days, used_days, pending_days FROM leave_balances "
            "WHERE employee_email = ? AND year = ?",
            (current_user.email, year),
        ).fetchone()

        leave = None
        if leave_row:
            leave = {
                "year": year,
                "total_days": leave_row["total_days"],
                "used_days": leave_row["used_days"],
                "pending_days": leave_row["pending_days"],
                "remaining_days": (
                    leave_row["total_days"]
                    - leave_row["used_days"]
                    - leave_row["pending_days"]
                ),
            }

        history_rows = conn.execute(
            "SELECT year, total_days, used_days, pending_days FROM leave_balances "
            "WHERE employee_email = ? ORDER BY year DESC",
            (current_user.email,),
        ).fetchall()

        upcoming_rows = conn.execute(
            "SELECT payment_date, payment_type, amount FROM salary_payments "
            "WHERE employee_email = ? AND status = 'planned' AND payment_date >= ? "
            "ORDER BY payment_date ASC LIMIT 4",
            (current_user.email, today),
        ).fetchall()

        recent_rows = conn.execute(
            "SELECT payment_date, payment_type, amount FROM salary_payments "
            "WHERE employee_email = ? AND status = 'paid' "
            "ORDER BY payment_date DESC LIMIT 4",
            (current_user.email,),
        ).fetchall()

        return {
            "profile": dict(emp_row) if emp_row else None,
            "leave": leave,
            "leave_history": [dict(r) for r in history_rows],
            "upcoming_payments": [dict(r) for r in upcoming_rows],
            "recent_payments": [dict(r) for r in recent_rows],
        }
    finally:
        conn.close()


class SendMessageBody(BaseModel):
    to_email: str
    text:     str


def _allowed_contacts(conn, email: str, role: str) -> list[dict]:
    """Возвращает список людей, с которыми пользователь может переписываться."""
    if role == "employee":
        row = conn.execute(
            "SELECT e2.email, e2.full_name, e2.position, e2.department "
            "FROM employees e1 JOIN employees e2 ON e1.manager_email = e2.email "
            "WHERE e1.email = ?",
            (email,),
        ).fetchone()
        return [dict(row)] if row else []
    if role == "manager":
        rows = conn.execute(
            "SELECT email, full_name, position, department FROM employees "
            "WHERE manager_email = ? ORDER BY full_name",
            (email,),
        ).fetchall()
        return [dict(r) for r in rows]
    # hr — все остальные
    rows = conn.execute(
        "SELECT email, full_name, position, department FROM employees "
        "WHERE email != ? ORDER BY department, full_name",
        (email,),
    ).fetchall()
    return [dict(r) for r in rows]


@app.get("/messages/contacts")
def get_contacts(current_user: Annotated[UserContext, Depends(get_current_user)]):
    """Список контактов с превью последнего сообщения и счётчиком непрочитанных.
    Сортируется по времени последней активности."""
    conn = get_connection()
    try:
        contacts = _allowed_contacts(conn, current_user.email, current_user.role)
        for c in contacts:
            last = conn.execute(
                "SELECT text, created_at, from_email FROM messages "
                "WHERE (from_email = ? AND to_email = ?) OR (from_email = ? AND to_email = ?) "
                "ORDER BY created_at DESC LIMIT 1",
                (current_user.email, c["email"], c["email"], current_user.email),
            ).fetchone()
            unread = conn.execute(
                "SELECT COUNT(*) FROM messages "
                "WHERE to_email = ? AND from_email = ? AND is_read = 0",
                (current_user.email, c["email"]),
            ).fetchone()[0]
            c["last_message"] = dict(last) if last else None
            c["unread_count"] = unread
        # сортируем: с активностью — по убыванию времени; без сообщений — в конец
        contacts.sort(
            key=lambda c: (c["last_message"]["created_at"] if c["last_message"] else ""),
            reverse=True,
        )
        return contacts
    finally:
        conn.close()


@app.get("/messages")
def get_messages(
    with_email: str,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    """Диалог с конкретным пользователем (последние 100 сообщений)."""
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, from_email, to_email, text, created_at, is_read FROM messages "
            "WHERE (from_email = ? AND to_email = ?) OR (from_email = ? AND to_email = ?) "
            "ORDER BY created_at ASC LIMIT 100",
            (current_user.email, with_email, with_email, current_user.email),
        ).fetchall()
        conn.execute(
            "UPDATE messages SET is_read = 1 "
            "WHERE to_email = ? AND from_email = ? AND is_read = 0",
            (current_user.email, with_email),
        )
        conn.commit()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/messages", status_code=201)
def send_message(
    body: SendMessageBody,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    """Отправить личное сообщение (RBAC: только разрешённым контактам)."""
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Сообщение пустое")
    conn = get_connection()
    try:
        allowed = {c["email"] for c in _allowed_contacts(conn, current_user.email, current_user.role)}
        if body.to_email not in allowed:
            raise HTTPException(status_code=403, detail="Нет доступа к этому пользователю")
        conn.execute(
            "INSERT INTO messages (from_email, to_email, text) VALUES (?,?,?)",
            (current_user.email, body.to_email, body.text.strip()),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.get("/health")
def health():
    """Проверка работоспособности сервера и подключения к модели."""
    return {
        "status": "ok",
        "model":  "qwen2.5-coder:7b",
        "ollama": "http://168.222.142.182:11434",
    }
