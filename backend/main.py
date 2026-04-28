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
from typing import Annotated, Optional

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


def _allowed_contacts(conn, email: str, role: str) -> list:
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


# ── Геймификация: вспомогательные функции ────────────────────────────────────

def _get_or_create_points(conn, email: str) -> dict:
    row = conn.execute(
        "SELECT points_total, streak_days, last_active_date FROM employee_points WHERE employee_email = ?",
        (email,),
    ).fetchone()
    if not row:
        conn.execute("INSERT OR IGNORE INTO employee_points (employee_email) VALUES (?)", (email,))
        conn.commit()
        return {"points_total": 0, "streak_days": 0, "last_active_date": None}
    return dict(row)


def _level_from_points(pts: int) -> dict:
    if pts >= 2500:
        return {"label": "Платина", "key": "platinum", "next": None, "next_pts": None}
    if pts >= 1000:
        return {"label": "Золото", "key": "gold", "next": "Платина", "next_pts": 2500}
    if pts >= 500:
        return {"label": "Серебро", "key": "silver", "next": "Золото", "next_pts": 1000}
    if pts >= 200:
        return {"label": "Бронза", "key": "bronze", "next": "Серебро", "next_pts": 500}
    return {"label": "Новичок", "key": "rookie", "next": "Бронза", "next_pts": 200}


def _compute_badges(streak: int, bonus_records: list) -> list:
    badges = []
    for days, key, label in [(3, "streak_3", "Серия 3 дня"), (7, "streak_7", "Серия 7 дней"),
                              (14, "streak_14", "Серия 14 дней"), (30, "streak_30", "Серия 30 дней")]:
        badges.append({"key": key, "label": label, "unlocked": streak >= days})
    approved = [r for r in bonus_records if r.get("status") == "approved"]
    badges.append({"key": "star_of_month", "label": "Звезда месяца", "unlocked": len(approved) > 0})
    return badges


# ── Pydantic-схемы геймификации ───────────────────────────────────────────────

class CreateGoalBody(BaseModel):
    employee_email: str
    title: str
    description: str = ""
    points: int = 10
    month: int
    year: int


class UpdateGoalBody(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    points: Optional[int] = None


class SelectDailyBody(BaseModel):
    goal_ids: list[int]
    date: str


class FinishDayBody(BaseModel):
    date: str


class ReviewBonusBody(BaseModel):
    action: str  # "approve" | "decline"


class SuggestPointsBody(BaseModel):
    goals: list


# ── Endpoints: цели ───────────────────────────────────────────────────────────

@app.get("/goals")
def get_goals(
    current_user: Annotated[UserContext, Depends(get_current_user)],
    employee_email: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
):
    conn = get_connection()
    try:
        now = datetime.now()
        m = month or now.month
        y = year or now.year

        if current_user.role == "employee":
            rows = conn.execute(
                "SELECT * FROM goals WHERE employee_email=? AND month=? AND year=? AND status='active' ORDER BY id",
                (current_user.email, m, y),
            ).fetchall()
        else:
            target = employee_email or current_user.email
            if current_user.role == "manager":
                allowed = {r["email"] for r in conn.execute(
                    "SELECT email FROM employees WHERE manager_email=?", (current_user.email,)
                ).fetchall()} | {current_user.email}
                if target not in allowed:
                    raise HTTPException(status_code=403, detail="Нет доступа")
            rows = conn.execute(
                "SELECT * FROM goals WHERE employee_email=? AND month=? AND year=? AND status='active' ORDER BY id",
                (target, m, y),
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/goals", status_code=201)
def create_goal(body: CreateGoalBody, current_user: Annotated[UserContext, Depends(get_current_user)]):
    if current_user.role not in ("manager", "hr"):
        raise HTTPException(status_code=403, detail="Нет доступа")
    conn = get_connection()
    try:
        if current_user.role == "manager":
            allowed = {r["email"] for r in conn.execute(
                "SELECT email FROM employees WHERE manager_email=?", (current_user.email,)
            ).fetchall()}
            if body.employee_email not in allowed:
                raise HTTPException(status_code=403, detail="Сотрудник не в вашей команде")
        cur = conn.execute(
            "INSERT INTO goals (employee_email,created_by,title,description,points,month,year) VALUES (?,?,?,?,?,?,?)",
            (body.employee_email, current_user.email, body.title, body.description, body.points, body.month, body.year),
        )
        conn.commit()
        return dict(conn.execute("SELECT * FROM goals WHERE id=?", (cur.lastrowid,)).fetchone())
    finally:
        conn.close()


@app.put("/goals/{goal_id}")
def update_goal(goal_id: int, body: UpdateGoalBody, current_user: Annotated[UserContext, Depends(get_current_user)]):
    if current_user.role not in ("manager", "hr"):
        raise HTTPException(status_code=403, detail="Нет доступа")
    conn = get_connection()
    try:
        goal = conn.execute("SELECT * FROM goals WHERE id=?", (goal_id,)).fetchone()
        if not goal:
            raise HTTPException(status_code=404, detail="Цель не найдена")
        if current_user.role == "manager" and goal["created_by"] != current_user.email:
            raise HTTPException(status_code=403, detail="Нет доступа")
        updates, vals = [], []
        if body.title is not None:
            updates.append("title=?"); vals.append(body.title)
        if body.description is not None:
            updates.append("description=?"); vals.append(body.description)
        if body.points is not None:
            updates.append("points=?"); vals.append(body.points)
        if updates:
            vals.append(goal_id)
            conn.execute(f"UPDATE goals SET {', '.join(updates)} WHERE id=?", vals)
            conn.commit()
        return dict(conn.execute("SELECT * FROM goals WHERE id=?", (goal_id,)).fetchone())
    finally:
        conn.close()


@app.delete("/goals/{goal_id}", status_code=204)
def delete_goal(goal_id: int, current_user: Annotated[UserContext, Depends(get_current_user)]):
    if current_user.role not in ("manager", "hr"):
        raise HTTPException(status_code=403, detail="Нет доступа")
    conn = get_connection()
    try:
        goal = conn.execute("SELECT * FROM goals WHERE id=?", (goal_id,)).fetchone()
        if not goal:
            raise HTTPException(status_code=404, detail="Цель не найдена")
        if current_user.role == "manager" and goal["created_by"] != current_user.email:
            raise HTTPException(status_code=403, detail="Нет доступа")
        conn.execute("UPDATE goals SET status='archived' WHERE id=?", (goal_id,))
        conn.commit()
    finally:
        conn.close()


@app.get("/goals/daily")
def get_daily_tasks(
    current_user: Annotated[UserContext, Depends(get_current_user)],
    date: Optional[str] = None,
):
    today = date or datetime.now().strftime("%Y-%m-%d")
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT ds.id, ds.goal_id, ds.date, ds.completed, ds.completed_at, "
            "g.title, g.description, g.points FROM daily_selections ds "
            "JOIN goals g ON ds.goal_id=g.id "
            "WHERE ds.employee_email=? AND ds.date=?",
            (current_user.email, today),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/goals/daily", status_code=201)
def select_daily_tasks(body: SelectDailyBody, current_user: Annotated[UserContext, Depends(get_current_user)]):
    if not body.goal_ids:
        raise HTTPException(status_code=400, detail="Выберите хотя бы одну задачу")
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT COUNT(*) FROM daily_selections WHERE employee_email=? AND date=?",
            (current_user.email, body.date),
        ).fetchone()[0]
        if existing > 0:
            raise HTTPException(status_code=409, detail="Задачи на этот день уже выбраны")
        for gid in body.goal_ids:
            goal = conn.execute(
                "SELECT id FROM goals WHERE id=? AND employee_email=? AND status='active'",
                (gid, current_user.email),
            ).fetchone()
            if not goal:
                raise HTTPException(status_code=400, detail=f"Цель {gid} недоступна")
            conn.execute(
                "INSERT OR IGNORE INTO daily_selections (goal_id,employee_email,date) VALUES (?,?,?)",
                (gid, current_user.email, body.date),
            )
        conn.commit()
        rows = conn.execute(
            "SELECT ds.id, ds.goal_id, ds.date, ds.completed, ds.completed_at, "
            "g.title, g.description, g.points FROM daily_selections ds "
            "JOIN goals g ON ds.goal_id=g.id WHERE ds.employee_email=? AND ds.date=?",
            (current_user.email, body.date),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.patch("/goals/daily/{selection_id}/complete")
def complete_daily_task(selection_id: int, current_user: Annotated[UserContext, Depends(get_current_user)]):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM daily_selections WHERE id=? AND employee_email=?",
            (selection_id, current_user.email),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Задача не найдена")
        if row["completed"]:
            raise HTTPException(status_code=409, detail="Задача уже выполнена")
        now_str = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
        conn.execute("UPDATE daily_selections SET completed=1, completed_at=? WHERE id=?", (now_str, selection_id))
        conn.commit()
        return dict(conn.execute("SELECT * FROM daily_selections WHERE id=?", (selection_id,)).fetchone())
    finally:
        conn.close()


@app.post("/goals/daily/finish")
def finish_day(body: FinishDayBody, current_user: Annotated[UserContext, Depends(get_current_user)]):
    conn = get_connection()
    try:
        selections = conn.execute(
            "SELECT ds.completed, g.points FROM daily_selections ds JOIN goals g ON ds.goal_id=g.id "
            "WHERE ds.employee_email=? AND ds.date=?",
            (current_user.email, body.date),
        ).fetchall()
        if not selections:
            return {"points_earned": 0, "bonus": False, "penalty": False, "streak": 0, "total": 0}

        total = len(selections)
        completed_count = sum(1 for s in selections if s["completed"])
        rate = completed_count / total
        base_pts = sum(s["points"] for s in selections if s["completed"])
        missed_pts = sum(s["points"] for s in selections if not s["completed"])

        if rate == 1.0:
            earned = int(base_pts * 1.5)
            bonus, penalty = True, False
        elif rate >= 0.6:
            earned = base_pts
            bonus, penalty = False, False
        else:
            earned = max(0, base_pts - int(missed_pts * 0.2))
            bonus, penalty = False, True

        pts_row = _get_or_create_points(conn, current_user.email)
        new_total = pts_row["points_total"] + earned
        new_streak = (pts_row["streak_days"] + 1) if rate == 1.0 else 0

        conn.execute(
            "INSERT INTO employee_points (employee_email,points_total,streak_days,last_active_date) "
            "VALUES (?,?,?,?) ON CONFLICT(employee_email) DO UPDATE SET "
            "points_total=excluded.points_total, streak_days=excluded.streak_days, "
            "last_active_date=excluded.last_active_date",
            (current_user.email, new_total, new_streak, body.date),
        )
        conn.commit()
        return {
            "points_earned": earned, "bonus": bonus, "penalty": penalty,
            "streak": new_streak, "total": new_total,
            "completion_rate": round(rate * 100),
        }
    finally:
        conn.close()


@app.get("/gamification/stats")
def get_gamification_stats(current_user: Annotated[UserContext, Depends(get_current_user)]):
    conn = get_connection()
    try:
        pts_row = _get_or_create_points(conn, current_user.email)
        bonus_rows = conn.execute(
            "SELECT * FROM bonus_records WHERE employee_email=? ORDER BY year DESC, month DESC",
            (current_user.email,),
        ).fetchall()
        bonus_list = [dict(r) for r in bonus_rows]
        now = datetime.now()
        month_earned = conn.execute(
            "SELECT COALESCE(SUM(g.points),0) FROM daily_selections ds JOIN goals g ON ds.goal_id=g.id "
            "WHERE ds.employee_email=? AND ds.completed=1 AND g.month=? AND g.year=?",
            (current_user.email, now.month, now.year),
        ).fetchone()[0]
        month_max = conn.execute(
            "SELECT COALESCE(SUM(points),0) FROM goals "
            "WHERE employee_email=? AND month=? AND year=? AND status='active'",
            (current_user.email, now.month, now.year),
        ).fetchone()[0]
        return {
            "points_total": pts_row["points_total"],
            "streak_days": pts_row["streak_days"],
            "last_active_date": pts_row["last_active_date"],
            "level": _level_from_points(pts_row["points_total"]),
            "badges": _compute_badges(pts_row["streak_days"], bonus_list),
            "month_earned": month_earned,
            "month_max": month_max,
            "bonus_records": bonus_list,
        }
    finally:
        conn.close()


@app.post("/gamification/close-month")
def close_month(
    current_user: Annotated[UserContext, Depends(get_current_user)],
    month: Optional[int] = None,
    year: Optional[int] = None,
    employee_email: Optional[str] = None,
):
    if current_user.role not in ("manager", "hr"):
        raise HTTPException(status_code=403, detail="Нет доступа")
    conn = get_connection()
    try:
        now = datetime.now()
        m = month or now.month
        y = year or now.year
        if current_user.role == "manager":
            target_emails = [r["email"] for r in conn.execute(
                "SELECT email FROM employees WHERE manager_email=?", (current_user.email,)
            ).fetchall()]
        else:
            target_emails = [employee_email] if employee_email else [
                r["email"] for r in conn.execute("SELECT email FROM employees").fetchall()
            ]
        created = []
        for email in target_emails:
            max_pts = conn.execute(
                "SELECT COALESCE(SUM(points),0) FROM goals WHERE employee_email=? AND month=? AND year=? AND status='active'",
                (email, m, y),
            ).fetchone()[0]
            if max_pts == 0:
                continue
            earned = conn.execute(
                "SELECT COALESCE(SUM(g.points),0) FROM daily_selections ds JOIN goals g ON ds.goal_id=g.id "
                "WHERE ds.employee_email=? AND ds.completed=1 AND g.month=? AND g.year=?",
                (email, m, y),
            ).fetchone()[0]
            score_pct = round(earned / max_pts * 100, 1)
            try:
                conn.execute(
                    "INSERT OR IGNORE INTO bonus_records (employee_email,month,year,score_pct,earned_points,max_points) "
                    "VALUES (?,?,?,?,?,?)",
                    (email, m, y, score_pct, earned, max_pts),
                )
                created.append({"email": email, "score_pct": score_pct, "earned": earned, "max": max_pts})
            except Exception:
                pass
        conn.commit()
        return {"created": created}
    finally:
        conn.close()


@app.get("/gamification/bonus-records")
def get_bonus_records(current_user: Annotated[UserContext, Depends(get_current_user)]):
    conn = get_connection()
    try:
        if current_user.role == "employee":
            rows = conn.execute(
                "SELECT br.*, e.full_name FROM bonus_records br JOIN employees e ON br.employee_email=e.email "
                "WHERE br.employee_email=? ORDER BY br.year DESC, br.month DESC",
                (current_user.email,),
            ).fetchall()
        elif current_user.role == "manager":
            rows = conn.execute(
                "SELECT br.*, e.full_name FROM bonus_records br JOIN employees e ON br.employee_email=e.email "
                "WHERE e.manager_email=? ORDER BY br.year DESC, br.month DESC",
                (current_user.email,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT br.*, e.full_name FROM bonus_records br JOIN employees e ON br.employee_email=e.email "
                "ORDER BY br.year DESC, br.month DESC",
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.patch("/gamification/bonus-records/{record_id}/review")
def review_bonus(
    record_id: int,
    body: ReviewBonusBody,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    if current_user.role not in ("manager", "hr"):
        raise HTTPException(status_code=403, detail="Нет доступа")
    if body.action not in ("approve", "decline"):
        raise HTTPException(status_code=400, detail="action: approve или decline")
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM bonus_records WHERE id=?", (record_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Запись не найдена")
        now_str = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
        conn.execute(
            "UPDATE bonus_records SET status=?, reviewed_by=?, reviewed_at=? WHERE id=?",
            ("approved" if body.action == "approve" else "declined", current_user.email, now_str, record_id),
        )
        conn.commit()
        return dict(conn.execute("SELECT * FROM bonus_records WHERE id=?", (record_id,)).fetchone())
    finally:
        conn.close()


@app.post("/goals/suggest-points")
async def suggest_points(
    body: SuggestPointsBody,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    if current_user.role not in ("manager", "hr"):
        raise HTTPException(status_code=403, detail="Нет доступа")
    if not body.goals:
        raise HTTPException(status_code=400, detail="Список целей пуст")

    goals_text = "\n".join(
        f"{i+1}. {g['title']}" + (f" — {g.get('description','')}" if g.get("description") else "")
        for i, g in enumerate(body.goals)
    )
    prompt = (
        "Распредели баллы (от 10 до 100) между следующими рабочими целями сотрудника на месяц. "
        "Учитывай сложность и важность каждой задачи. "
        "Ответь ТОЛЬКО JSON-массивом вида [{\"index\":0,\"points\":30}] без пояснений.\n\n"
        f"Цели:\n{goals_text}"
    )
    try:
        import json, re
        from langchain_core.messages import HumanMessage as LCHuman
        from langchain_ollama import ChatOllama
        llm = ChatOllama(base_url="http://168.222.142.182:11434", model="qwen2.5-coder:7b",
                         temperature=0.1, num_predict=300, timeout=60)
        response = await llm.ainvoke([LCHuman(content=prompt)])
        match = re.search(r'\[.*?\]', response.content, re.DOTALL)
        if not match:
            raise ValueError("no json")
        suggestions = json.loads(match.group())
        result = []
        for i, g in enumerate(body.goals):
            pts = next((s["points"] for s in suggestions if s.get("index") == i), 10)
            result.append({"index": i, "title": g["title"], "points": max(10, min(100, int(pts)))})
        return {"suggestions": result}
    except Exception:
        result = [{"index": i, "title": g["title"], "points": min(100, max(10, len(g["title"]) * 2))}
                  for i, g in enumerate(body.goals)]
        return {"suggestions": result, "fallback": True}


@app.get("/health")
def health():
    """Проверка работоспособности сервера и подключения к модели."""
    return {
        "status": "ok",
        "model":  "qwen2.5-coder:7b",
        "ollama": "http://168.222.142.182:11434",
    }
