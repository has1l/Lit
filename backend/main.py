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

from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from agent import run_agent
from auth import UserContext, get_current_user, router as auth_router
from database import get_connection, init_db

_UPLOADS_DIR = Path(__file__).parent / "uploads"
_UPLOADS_DIR.mkdir(exist_ok=True)

_DOC_MEDIA_TYPES = {
    ".pdf":  "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc":  "application/msword",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls":  "application/vnd.ms-excel",
}

_ROLE_AUDIENCE = {
    "employee": ["all"],
    "manager":  ["all", "managers"],
    "hr":       ["all", "managers", "hr"],
}

# ── Инициализация приложения ──────────────────────────────────────────────────

app = FastAPI(
    title="1221 HR Assistant API",
    description="Корпоративный HR-ассистент на базе Ollama + LangGraph",
    version="0.1.0",
)

# CORS — разрешаем запросы от React dev-сервера
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


# ── STT (Speech-to-Text) через faster-whisper ─────────────────────────────────

_whisper_model = None

def _get_whisper():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        print("[STT] Загружаю модель Whisper small...")
        _whisper_model = WhisperModel("small", device="cpu", compute_type="int8")
        print("[STT] Модель загружена.")
    return _whisper_model


@app.post("/stt")
async def speech_to_text(audio: UploadFile = File(...)):
    """Принимает аудио-файл (webm/wav/ogg), возвращает распознанный текст."""
    import tempfile, os
    suffix = Path(audio.filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name
    try:
        model = _get_whisper()
        segments, _ = model.transcribe(tmp_path, language="ru", beam_size=3)
        text = " ".join(seg.text.strip() for seg in segments).strip()
        return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)


# ── Схемы запрос/ответ для чата ───────────────────────────────────────────────

class HistoryMessage(BaseModel):
    role: str   # "user" | "assistant"
    text: str


class ChatRequest(BaseModel):
    message: str
    history: list[HistoryMessage] = []


class ChatResponse(BaseModel):
    answer:       str
    sources:      list[str]
    steps:        int
    user:         str
    escalate:     bool = False
    doc_id:       int | None = None
    doc_page:     int = 0
    doc_section:  str = ""
    resource_url: str | None = None


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
        escalate=result.get("escalate", False),
        doc_id=result.get("doc_id"),
        doc_page=result.get("doc_page", 0),
        doc_section=result.get("doc_section", ""),
        resource_url=result.get("resource_url") or None,
    )


@app.get("/team/employees")
def get_team_employees(current_user: Annotated[UserContext, Depends(get_current_user)]):
    """Список сотрудников команды с расширенными полями (статус, ДР, пол)."""
    if current_user.role not in ("manager", "hr"):
        raise HTTPException(status_code=403, detail="Нет доступа")

    conn = get_connection()
    try:
        year = datetime.now().year
        base_sql = (
            "SELECT e.email, e.full_name, e.department, e.position, e.hire_date, "
            "       e.birth_date, e.gender, e.salary, e.avatar_color, "
            "       lb.total_days, lb.used_days, lb.pending_days, "
            "       COALESCE(es.status, 'offline') AS online_status, "
            "       COALESCE(es.current_task, '') AS current_task, "
            "       es.updated_at AS status_updated_at "
            "FROM employees e "
            "LEFT JOIN leave_balances lb ON lb.employee_email = e.email AND lb.year = ? "
            "LEFT JOIN employee_status es ON es.employee_email = e.email "
        )
        if current_user.role == "hr":
            rows = conn.execute(
                base_sql + "ORDER BY e.department, e.full_name", (year,)
            ).fetchall()
        else:
            rows = conn.execute(
                base_sql + "WHERE e.manager_email = ? ORDER BY e.full_name",
                (year, current_user.email),
            ).fetchall()

        result = []
        for r in rows:
            total = r["total_days"] or 28
            used  = r["used_days"]  or 0
            pend  = r["pending_days"] or 0
            result.append({
                "email":              r["email"],
                "full_name":          r["full_name"],
                "department":         r["department"],
                "position":           r["position"],
                "hire_date":          r["hire_date"],
                "birth_date":         r["birth_date"],
                "gender":             r["gender"],
                "salary":             r["salary"],
                "avatar_color":       r["avatar_color"],
                "vacation_total":     total,
                "vacation_used":      used,
                "vacation_pending":   pend,
                "vacation_remaining": total - used - pend,
                "online_status":      r["online_status"],
                "current_task":       r["current_task"],
                "status_updated_at":  r["status_updated_at"],
            })
        return result
    finally:
        conn.close()


@app.get("/team/statuses")
def get_team_statuses(current_user: Annotated[UserContext, Depends(get_current_user)]):
    """Быстрый поллинг статусов команды (только email + status + current_task)."""
    if current_user.role not in ("manager", "hr"):
        raise HTTPException(status_code=403, detail="Нет доступа")
    conn = get_connection()
    try:
        if current_user.role == "hr":
            rows = conn.execute(
                "SELECT es.employee_email, es.status, es.current_task, es.updated_at "
                "FROM employee_status es"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT es.employee_email, es.status, es.current_task, es.updated_at "
                "FROM employee_status es "
                "JOIN employees e ON es.employee_email = e.email "
                "WHERE e.manager_email = ?",
                (current_user.email,),
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/employees/{employee_email}")
def get_employee_profile(
    employee_email: str,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    """Полный профиль сотрудника (RBAC: manager видит свою команду, hr — всех)."""
    if current_user.role not in ("manager", "hr"):
        raise HTTPException(status_code=403, detail="Нет доступа")
    conn = get_connection()
    try:
        if current_user.role == "manager":
            emp = conn.execute(
                "SELECT * FROM employees WHERE email=? AND manager_email=?",
                (employee_email, current_user.email),
            ).fetchone()
        else:
            emp = conn.execute(
                "SELECT * FROM employees WHERE email=?", (employee_email,)
            ).fetchone()
        if not emp:
            raise HTTPException(status_code=404, detail="Сотрудник не найден")

        year = datetime.now().year
        leave = conn.execute(
            "SELECT * FROM leave_balances WHERE employee_email=? AND year=?",
            (employee_email, year),
        ).fetchone()
        recent_payments = conn.execute(
            "SELECT * FROM salary_payments WHERE employee_email=? "
            "ORDER BY payment_date DESC LIMIT 4",
            (employee_email,),
        ).fetchall()
        status = conn.execute(
            "SELECT * FROM employee_status WHERE employee_email=?",
            (employee_email,),
        ).fetchone()

        result = dict(emp)
        result["leave"] = dict(leave) if leave else None
        result["recent_payments"] = [dict(r) for r in recent_payments]
        result["online_status"] = dict(status) if status else {"status": "offline", "current_task": ""}
        return result
    finally:
        conn.close()


class UpdateStatusBody(BaseModel):
    status:       str
    current_task: str = ""


@app.put("/me/status")
def update_my_status(
    body: UpdateStatusBody,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    """Обновить свой онлайн-статус и текущую задачу."""
    if body.status not in ("online", "offline", "break"):
        raise HTTPException(status_code=400, detail="status: online | offline | break")
    conn = get_connection()
    try:
        now_str = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
        conn.execute(
            """INSERT INTO employee_status (employee_email, status, current_task, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(employee_email) DO UPDATE SET
                 status=excluded.status,
                 current_task=excluded.current_task,
                 updated_at=excluded.updated_at""",
            (current_user.email, body.status, body.current_task.strip(), now_str),
        )
        conn.commit()
        return {"ok": True, "status": body.status}
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

_DIFFICULTY_WEIGHT = {"easy": 5, "medium": 15, "hard": 30}
_MIN_DAY_WEIGHT    = 20
_DIFFICULTY_POINTS = {"easy": 10, "medium": 20, "hard": 35}


class CreateGoalBody(BaseModel):
    employee_email: str
    title: str
    description: str = ""
    points: int = 10
    difficulty: str = "medium"
    month: int
    year: int


class UpdateGoalBody(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    points: Optional[int] = None
    difficulty: Optional[str] = None


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
        difficulty = body.difficulty if body.difficulty in _DIFFICULTY_WEIGHT else "medium"
        points = body.points if body.points else _DIFFICULTY_POINTS[difficulty]
        cur = conn.execute(
            "INSERT INTO goals (employee_email,created_by,title,description,points,difficulty,month,year) VALUES (?,?,?,?,?,?,?,?)",
            (body.employee_email, current_user.email, body.title, body.description, points, difficulty, body.month, body.year),
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
        if body.difficulty is not None and body.difficulty in _DIFFICULTY_WEIGHT:
            updates.append("difficulty=?"); vals.append(body.difficulty)
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
            "g.title, g.description, g.points, g.difficulty FROM daily_selections ds "
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

        # Проверка минимального веса выбранных задач
        goals_data = []
        for gid in body.goal_ids:
            goal = conn.execute(
                "SELECT id, difficulty FROM goals WHERE id=? AND employee_email=? AND status='active'",
                (gid, current_user.email),
            ).fetchone()
            if not goal:
                raise HTTPException(status_code=400, detail=f"Цель {gid} недоступна")
            goals_data.append(dict(goal))

        total_weight = sum(_DIFFICULTY_WEIGHT.get(g["difficulty"], 15) for g in goals_data)
        if total_weight < _MIN_DAY_WEIGHT:
            raise HTTPException(
                status_code=400,
                detail=f"Выберите задачи с суммарным весом ≥{_MIN_DAY_WEIGHT} (сейчас {total_weight}). Добавьте задачи посложнее.",
            )

        for gid in body.goal_ids:
            conn.execute(
                "INSERT OR IGNORE INTO daily_selections (goal_id,employee_email,date) VALUES (?,?,?)",
                (gid, current_user.email, body.date),
            )
        conn.commit()
        rows = conn.execute(
            "SELECT ds.id, ds.goal_id, ds.date, ds.completed, ds.completed_at, "
            "g.title, g.description, g.points, g.difficulty FROM daily_selections ds "
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


@app.patch("/goals/daily/{selection_id}/uncomplete")
def uncomplete_daily_task(selection_id: int, current_user: Annotated[UserContext, Depends(get_current_user)]):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM daily_selections WHERE id=? AND employee_email=?",
            (selection_id, current_user.email),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Задача не найдена")
        conn.execute("UPDATE daily_selections SET completed=0, completed_at=NULL WHERE id=?", (selection_id,))
        conn.commit()
        return dict(conn.execute("SELECT * FROM daily_selections WHERE id=?", (selection_id,)).fetchone())
    finally:
        conn.close()


@app.post("/goals/daily/finish")
def finish_day(body: FinishDayBody, current_user: Annotated[UserContext, Depends(get_current_user)]):
    conn = get_connection()
    try:
        selections = conn.execute(
            "SELECT ds.id, ds.goal_id, ds.completed, g.points FROM daily_selections ds JOIN goals g ON ds.goal_id=g.id "
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

        pts_row = _get_or_create_points(conn, current_user.email)
        prev_streak = pts_row["streak_days"]

        if rate == 1.0:
            earned = int(base_pts * 1.5)
            bonus, penalty = True, False
        elif rate >= 0.6:
            earned = base_pts
            bonus, penalty = False, False
        else:
            earned = max(0, base_pts - int(missed_pts * 0.2))
            bonus, penalty = False, True

        # Стрик-бонус: 3+ дней подряд → +20%
        streak_bonus = False
        new_streak = (prev_streak + 1) if rate == 1.0 else 0
        if rate == 1.0 and prev_streak >= 2:
            earned = int(earned * 1.2)
            streak_bonus = True

        new_total = pts_row["points_total"] + earned

        conn.execute(
            "INSERT INTO employee_points (employee_email,points_total,streak_days,last_active_date) "
            "VALUES (?,?,?,?) ON CONFLICT(employee_email) DO UPDATE SET "
            "points_total=excluded.points_total, streak_days=excluded.streak_days, "
            "last_active_date=excluded.last_active_date",
            (current_user.email, new_total, new_streak, body.date),
        )
        # Помечаем выполненные цели как completed
        completed_goal_ids = [s["goal_id"] for s in selections if s["completed"]]
        for gid in completed_goal_ids:
            conn.execute("UPDATE goals SET status='completed' WHERE id=?", (gid,))
        conn.commit()
        return {
            "points_earned": earned, "bonus": bonus, "penalty": penalty,
            "streak": new_streak, "total": new_total,
            "completion_rate": round(rate * 100),
            "streak_bonus": streak_bonus,
        }
    finally:
        conn.close()


@app.delete("/goals/daily/reset")
def reset_day(date: str, current_user: Annotated[UserContext, Depends(get_current_user)]):
    conn = get_connection()
    try:
        conn.execute("DELETE FROM daily_selections WHERE employee_email=? AND date=?", (current_user.email, date))
        # Возвращаем все цели сотрудника обратно в active (для тестирования)
        now = datetime.now()
        conn.execute(
            "UPDATE goals SET status='active' WHERE employee_email=? AND month=? AND year=?",
            (current_user.email, now.month, now.year),
        )
        conn.commit()
        return {"ok": True}
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
        llm = ChatOllama(base_url="http://168.222.142.182:11434", model="llama3.1:8b",
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


# ── Магазин наград ────────────────────────────────────────────────────────────

class CreateRewardItemBody(BaseModel):
    title:        str
    description:  str = ""
    cost_points:  int
    quantity:     int = -1  # -1 = unlimited


class PurchaseItemBody(BaseModel):
    item_id: int


@app.get("/store/items")
def get_store_items(current_user: Annotated[UserContext, Depends(get_current_user)]):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT ri.*, e.full_name AS creator_name FROM reward_items ri "
            "LEFT JOIN employees e ON ri.created_by = e.email "
            "WHERE ri.is_active = 1 ORDER BY ri.cost_points ASC"
        ).fetchall()
        items = []
        for r in rows:
            item = dict(r)
            # Количество доступных = quantity - одобренные заявки
            if item["quantity"] != -1:
                used = conn.execute(
                    "SELECT COUNT(*) FROM reward_requests WHERE item_id=? AND status='approved'",
                    (r["id"],),
                ).fetchone()[0]
                item["available"] = max(0, item["quantity"] - used)
            else:
                item["available"] = -1
            # Есть ли заявка текущего пользователя
            my_req = conn.execute(
                "SELECT id, status FROM reward_requests WHERE item_id=? AND employee_email=? ORDER BY id DESC LIMIT 1",
                (r["id"], current_user.email),
            ).fetchone()
            item["my_request"] = dict(my_req) if my_req else None
            items.append(item)
        return items
    finally:
        conn.close()


@app.post("/store/items", status_code=201)
def create_store_item(
    body: CreateRewardItemBody,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    if current_user.role not in ("manager", "hr"):
        raise HTTPException(status_code=403, detail="Нет доступа")
    if body.cost_points <= 0:
        raise HTTPException(status_code=400, detail="Стоимость должна быть > 0")
    conn = get_connection()
    try:
        cur = conn.execute(
            "INSERT INTO reward_items (title, description, cost_points, quantity, created_by) VALUES (?,?,?,?,?)",
            (body.title.strip(), body.description.strip(), body.cost_points, body.quantity, current_user.email),
        )
        conn.commit()
        row = conn.execute(
            "SELECT ri.*, e.full_name AS creator_name FROM reward_items ri "
            "LEFT JOIN employees e ON ri.created_by = e.email WHERE ri.id=?",
            (cur.lastrowid,),
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.delete("/store/items/{item_id}", status_code=204)
def delete_store_item(
    item_id: int,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    if current_user.role not in ("manager", "hr"):
        raise HTTPException(status_code=403, detail="Нет доступа")
    conn = get_connection()
    try:
        conn.execute("UPDATE reward_items SET is_active=0 WHERE id=?", (item_id,))
        conn.commit()
    finally:
        conn.close()


@app.post("/store/purchase", status_code=201)
def purchase_item(
    body: PurchaseItemBody,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    conn = get_connection()
    try:
        item = conn.execute(
            "SELECT * FROM reward_items WHERE id=? AND is_active=1", (body.item_id,)
        ).fetchone()
        if not item:
            raise HTTPException(status_code=404, detail="Товар не найден")

        # Проверить лимит количества
        if item["quantity"] != -1:
            used = conn.execute(
                "SELECT COUNT(*) FROM reward_requests WHERE item_id=? AND status='approved'",
                (body.item_id,),
            ).fetchone()[0]
            if used >= item["quantity"]:
                raise HTTPException(status_code=409, detail="Товар закончился")

        # Проверить, нет ли уже pending-заявки
        existing = conn.execute(
            "SELECT id FROM reward_requests WHERE item_id=? AND employee_email=? AND status='pending'",
            (body.item_id, current_user.email),
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="У вас уже есть заявка на этот товар")

        # Проверить баллы
        pts = _get_or_create_points(conn, current_user.email)
        if pts["points_total"] < item["cost_points"]:
            raise HTTPException(
                status_code=400,
                detail=f"Недостаточно баллов: нужно {item['cost_points']}, у вас {pts['points_total']}",
            )

        # Списываем баллы и создаём заявку
        new_total = pts["points_total"] - item["cost_points"]
        conn.execute(
            "UPDATE employee_points SET points_total=? WHERE employee_email=?",
            (new_total, current_user.email),
        )
        cur = conn.execute(
            "INSERT INTO reward_requests (item_id, employee_email) VALUES (?,?)",
            (body.item_id, current_user.email),
        )
        conn.commit()
        req = conn.execute("SELECT * FROM reward_requests WHERE id=?", (cur.lastrowid,)).fetchone()
        return {"request": dict(req), "points_remaining": new_total}
    finally:
        conn.close()


@app.get("/store/requests")
def get_store_requests(current_user: Annotated[UserContext, Depends(get_current_user)]):
    conn = get_connection()
    try:
        if current_user.role == "employee":
            rows = conn.execute(
                "SELECT rr.*, ri.title AS item_title, ri.cost_points, e.full_name AS employee_name "
                "FROM reward_requests rr "
                "JOIN reward_items ri ON rr.item_id = ri.id "
                "JOIN employees e ON rr.employee_email = e.email "
                "WHERE rr.employee_email=? ORDER BY rr.created_at DESC",
                (current_user.email,),
            ).fetchall()
        elif current_user.role == "manager":
            rows = conn.execute(
                "SELECT rr.*, ri.title AS item_title, ri.cost_points, e.full_name AS employee_name "
                "FROM reward_requests rr "
                "JOIN reward_items ri ON rr.item_id = ri.id "
                "JOIN employees e ON rr.employee_email = e.email "
                "WHERE e.manager_email=? ORDER BY rr.created_at DESC",
                (current_user.email,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT rr.*, ri.title AS item_title, ri.cost_points, e.full_name AS employee_name "
                "FROM reward_requests rr "
                "JOIN reward_items ri ON rr.item_id = ri.id "
                "JOIN employees e ON rr.employee_email = e.email "
                "ORDER BY rr.created_at DESC"
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.patch("/store/requests/{req_id}/approve")
def approve_reward_request(
    req_id: int,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    if current_user.role not in ("manager", "hr"):
        raise HTTPException(status_code=403, detail="Нет доступа")
    conn = get_connection()
    try:
        req = conn.execute("SELECT * FROM reward_requests WHERE id=?", (req_id,)).fetchone()
        if not req:
            raise HTTPException(status_code=404, detail="Заявка не найдена")
        if req["status"] != "pending":
            raise HTTPException(status_code=409, detail="Заявка уже обработана")
        now_str = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
        conn.execute(
            "UPDATE reward_requests SET status='approved', reviewed_by=?, reviewed_at=? WHERE id=?",
            (current_user.email, now_str, req_id),
        )
        conn.commit()
        return dict(conn.execute("SELECT * FROM reward_requests WHERE id=?", (req_id,)).fetchone())
    finally:
        conn.close()


@app.patch("/store/requests/{req_id}/decline")
def decline_reward_request(
    req_id: int,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    if current_user.role not in ("manager", "hr"):
        raise HTTPException(status_code=403, detail="Нет доступа")
    conn = get_connection()
    try:
        req = conn.execute("SELECT * FROM reward_requests WHERE id=?", (req_id,)).fetchone()
        if not req:
            raise HTTPException(status_code=404, detail="Заявка не найдена")
        if req["status"] != "pending":
            raise HTTPException(status_code=409, detail="Заявка уже обработана")
        # Вернуть баллы
        item = conn.execute("SELECT cost_points FROM reward_items WHERE id=?", (req["item_id"],)).fetchone()
        if item:
            conn.execute(
                "UPDATE employee_points SET points_total = points_total + ? WHERE employee_email=?",
                (item["cost_points"], req["employee_email"]),
            )
        now_str = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
        conn.execute(
            "UPDATE reward_requests SET status='declined', reviewed_by=?, reviewed_at=? WHERE id=?",
            (current_user.email, now_str, req_id),
        )
        conn.commit()
        return dict(conn.execute("SELECT * FROM reward_requests WHERE id=?", (req_id,)).fetchone())
    finally:
        conn.close()


# ── HR-тикеты (Appeals) ───────────────────────────────────────────────────────

class CreateAppealBody(BaseModel):
    question_text: str
    category:      str = "other"


class ResolveAppealBody(BaseModel):
    hr_response: str


class AssignAppealBody(BaseModel):
    assignee_email: str


@app.post("/appeals", status_code=201)
def create_appeal(
    body: CreateAppealBody,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    """Создать обращение в HR (любой авторизованный пользователь)."""
    if not body.question_text.strip():
        raise HTTPException(status_code=400, detail="Текст обращения не может быть пустым")
    conn = get_connection()
    try:
        cur = conn.execute(
            "INSERT INTO hr_appeals (from_email, question_text, category) VALUES (?,?,?)",
            (current_user.email, body.question_text.strip(), body.category),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM hr_appeals WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.get("/appeals")
def get_appeals(current_user: Annotated[UserContext, Depends(get_current_user)]):
    """
    Список обращений.
    employee — только свои.
    manager  — своей команды.
    hr       — все.
    """
    conn = get_connection()
    try:
        if current_user.role == "employee":
            rows = conn.execute(
                "SELECT a.*, e.full_name AS from_name FROM hr_appeals a "
                "JOIN employees e ON a.from_email = e.email "
                "WHERE a.from_email = ? ORDER BY a.created_at DESC",
                (current_user.email,),
            ).fetchall()
        elif current_user.role == "manager":
            rows = conn.execute(
                "SELECT a.*, e.full_name AS from_name FROM hr_appeals a "
                "JOIN employees e ON a.from_email = e.email "
                "WHERE e.manager_email = ? ORDER BY a.created_at DESC",
                (current_user.email,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT a.*, e.full_name AS from_name FROM hr_appeals a "
                "JOIN employees e ON a.from_email = e.email "
                "ORDER BY a.created_at DESC"
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.patch("/appeals/{appeal_id}/resolve")
def resolve_appeal(
    appeal_id: int,
    body: ResolveAppealBody,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    """HR закрывает тикет с ответом."""
    if current_user.role != "hr":
        raise HTTPException(status_code=403, detail="Нет доступа")
    if not body.hr_response.strip():
        raise HTTPException(status_code=400, detail="Ответ не может быть пустым")
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM hr_appeals WHERE id=?", (appeal_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Обращение не найдено")
        now_str = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
        conn.execute(
            "UPDATE hr_appeals SET status='resolved', hr_response=?, "
            "assigned_to=?, resolved_at=? WHERE id=?",
            (body.hr_response.strip(), current_user.email, now_str, appeal_id),
        )
        conn.commit()
        return dict(conn.execute("SELECT * FROM hr_appeals WHERE id=?", (appeal_id,)).fetchone())
    finally:
        conn.close()


@app.patch("/appeals/{appeal_id}/assign")
def assign_appeal(
    appeal_id: int,
    body: AssignAppealBody,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    """HR назначает ответственного и переводит в in_progress."""
    if current_user.role != "hr":
        raise HTTPException(status_code=403, detail="Нет доступа")
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM hr_appeals WHERE id=?", (appeal_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Обращение не найдено")
        conn.execute(
            "UPDATE hr_appeals SET assigned_to=?, status='in_progress' WHERE id=?",
            (body.assignee_email, appeal_id),
        )
        conn.commit()
        return dict(conn.execute("SELECT * FROM hr_appeals WHERE id=?", (appeal_id,)).fetchone())
    finally:
        conn.close()


# ── Документы (загрузка в RAG) ────────────────────────────────────────────────

_ALLOWED_DOC_EXTS = {".pdf", ".docx", ".doc", ".xlsx", ".xls"}


@app.post("/documents/upload", status_code=201)
async def upload_document(
    current_user: Annotated[UserContext, Depends(get_current_user)],
    file: UploadFile = File(...),
    audience: str = Form("all"),
):
    """Загрузить документ в базу знаний RAG (только hr и manager)."""
    if current_user.role not in ("hr", "manager"):
        raise HTTPException(status_code=403, detail="Нет доступа")
    if audience not in ("all", "managers", "hr"):
        raise HTTPException(status_code=400, detail="audience: all | managers | hr")

    ext = Path(file.filename).suffix.lower()
    if ext not in _ALLOWED_DOC_EXTS:
        raise HTTPException(status_code=400, detail=f"Неподдерживаемый формат: {ext}. Допустимые: PDF, DOCX, XLSX")

    file_bytes = await file.read()
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Файл слишком большой (макс. 20 МБ)")

    try:
        from documents import ingest_document
        chunk_count = ingest_document(file.filename, file_bytes, current_user.email, audience)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ошибка обработки файла: {exc}")

    conn = get_connection()
    try:
        cur = conn.execute(
            "INSERT INTO uploaded_documents (filename, uploaded_by, audience, chunk_count) VALUES (?,?,?,?)",
            (file.filename, current_user.email, audience, chunk_count),
        )
        conn.commit()
        doc_id = cur.lastrowid
        # Сохраняем оригинальный файл для последующей отдачи
        suffix = Path(file.filename).suffix.lower()
        (_UPLOADS_DIR / f"{doc_id}{suffix}").write_bytes(file_bytes)
        row = conn.execute("SELECT * FROM uploaded_documents WHERE id=?", (doc_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.get("/documents")
def get_documents(current_user: Annotated[UserContext, Depends(get_current_user)]):
    """Список загруженных документов (фильтрация по роли через audience)."""
    conn = get_connection()
    try:
        if current_user.role == "employee":
            rows = conn.execute(
                "SELECT d.*, e.full_name AS uploader_name FROM uploaded_documents d "
                "LEFT JOIN employees e ON d.uploaded_by = e.email "
                "WHERE d.audience = 'all' ORDER BY d.created_at DESC"
            ).fetchall()
        elif current_user.role == "manager":
            rows = conn.execute(
                "SELECT d.*, e.full_name AS uploader_name FROM uploaded_documents d "
                "LEFT JOIN employees e ON d.uploaded_by = e.email "
                "WHERE d.audience IN ('all', 'managers') ORDER BY d.created_at DESC"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT d.*, e.full_name AS uploader_name FROM uploaded_documents d "
                "LEFT JOIN employees e ON d.uploaded_by = e.email "
                "ORDER BY d.created_at DESC"
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/documents/{doc_id}/file")
def get_document_file(
    doc_id: int,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    """Отдать оригинальный файл документа (с проверкой RBAC по audience)."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM uploaded_documents WHERE id=?", (doc_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Документ не найден")
        allowed = _ROLE_AUDIENCE.get(current_user.role, ["all"])
        if row["audience"] not in allowed:
            raise HTTPException(status_code=403, detail="Нет доступа")
    finally:
        conn.close()
    suffix = Path(row["filename"]).suffix.lower()
    file_path = _UPLOADS_DIR / f"{doc_id}{suffix}"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден на сервере")
    media_type = _DOC_MEDIA_TYPES.get(suffix, "application/octet-stream")
    return FileResponse(str(file_path), media_type=media_type, filename=row["filename"])


@app.get("/documents/{doc_id}/view", response_class=HTMLResponse)
def view_document(
    doc_id: int,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    """Рендерит DOCX как HTML-страницу с анкорами по разделам."""
    import html as html_lib
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM uploaded_documents WHERE id=?", (doc_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Документ не найден")
        allowed = _ROLE_AUDIENCE.get(current_user.role, ["all"])
        if row["audience"] not in allowed:
            raise HTTPException(status_code=403, detail="Нет доступа")
    finally:
        conn.close()

    suffix = Path(row["filename"]).suffix.lower()
    file_path = _UPLOADS_DIR / f"{doc_id}{suffix}"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден на сервере")

    doc_title = html_lib.escape(row["filename"])
    sections_html = ""

    if suffix in (".docx", ".doc"):
        import re
        from docx import Document as DocxDocument
        HEADING_STYLES = {
            "heading 1", "heading 2", "heading 3",
            "заголовок 1", "заголовок 2", "заголовок 3",
        }
        _H_RE = re.compile(r"^(Статья|Раздел|Глава|Пункт)\s+\d+", re.IGNORECASE)
        doc = DocxDocument(str(file_path))
        current_heading = "Общие положения"
        current_lines: list[str] = []

        def _flush(heading: str, lines: list[str]) -> str:
            if not lines:
                return ""
            anchor = html_lib.escape(heading)
            body = "".join(f"<p>{html_lib.escape(l)}</p>" for l in lines if l.strip())
            return f'<section id="{anchor}"><h2>{anchor}</h2>{body}</section>\n'

        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue
            style = (para.style.name or "").lower()
            is_h = style in HEADING_STYLES or bool(_H_RE.match(text))
            if is_h:
                sections_html += _flush(current_heading, current_lines)
                current_heading = text[:120]
                current_lines = []
            else:
                current_lines.append(text)
        sections_html += _flush(current_heading, current_lines)

    elif suffix == ".pdf":
        sections_html = (
            '<section id="doc">'
            f'<p>PDF-документ: <a href="/documents/{doc_id}/file">{doc_title}</a></p>'
            '</section>'
        )
    else:
        sections_html = f'<section id="doc"><p>{doc_title}</p></section>'

    html_content = f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{doc_title}</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f1221; color: #e2e8f0;
      padding: 2rem 1rem; max-width: 860px; margin: 0 auto;
      line-height: 1.7; font-size: 15px;
    }}
    h1 {{ font-size: 1.4rem; color: #a5b4fc; margin-bottom: 2rem; border-bottom: 1px solid #334155; padding-bottom: 1rem; }}
    section {{ padding: 1.25rem 1.5rem; margin-bottom: 1rem; border-radius: 12px; border: 1px solid transparent; scroll-margin-top: 80px; }}
    section h2 {{ font-size: 1rem; font-weight: 700; color: #c7d2fe; margin-bottom: .75rem; }}
    section p {{ color: #94a3b8; margin-bottom: .5rem; }}
    section:target {{
      background: rgba(124, 58, 237, 0.15);
      border-color: rgba(124, 58, 237, 0.5);
      box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.25);
    }}
    section:target h2 {{ color: #a78bfa; }}
    section:target p {{ color: #cbd5e1; }}
    .nav {{ position: sticky; top: 0; background: #0f1221cc; backdrop-filter: blur(8px); padding: .75rem 0; margin-bottom: 1.5rem; border-bottom: 1px solid #1e293b; font-size: .8rem; color: #64748b; }}
  </style>
</head>
<body>
  <div class="nav">{doc_title}</div>
  <h1>{doc_title}</h1>
  {sections_html}
  <script>
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash) {{
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({{ behavior: "smooth", block: "start" }});
    }}
  </script>
</body>
</html>"""
    return HTMLResponse(content=html_content)


@app.delete("/documents/{doc_id}", status_code=204)
def delete_document(
    doc_id: int,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    """Удалить документ (hr — любой, manager — только свои)."""
    if current_user.role not in ("hr", "manager"):
        raise HTTPException(status_code=403, detail="Нет доступа")
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM uploaded_documents WHERE id=?", (doc_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Документ не найден")
        if current_user.role == "manager" and row["uploaded_by"] != current_user.email:
            raise HTTPException(status_code=403, detail="Нет доступа")
        conn.execute("DELETE FROM uploaded_documents WHERE id=?", (doc_id,))
        conn.commit()
    finally:
        conn.close()



# ── База знаний: ресурсы компании ────────────────────────────────────────────

class CreateResourceBody(BaseModel):
    title:       str
    description: str = ""
    url:         str
    audience:    str = "all"


def _index_resource(resource_id: int, title: str, description: str, url: str, audience: str) -> str:
    """Индексирует ресурс в ChromaDB. Возвращает chroma_id или ''."""
    try:
        from agent import _get_embed_model, _get_chroma
        coll = _get_chroma()
        if coll is None:
            return ""
        model = _get_embed_model()
        text = f"{title}\n\n{description}" if description else title
        vec = model.encode([text])[0].tolist()
        chroma_id = f"resource_{resource_id}"
        coll.upsert(
            ids=[chroma_id],
            embeddings=[vec],
            documents=[text],
            metadatas=[{
                "type": "resource",
                "resource_id": str(resource_id),
                "title": title,
                "url": url,
                "audience": audience,
                "source_file": "",
                "section": title,
                "page_number": "0",
            }],
        )
        return chroma_id
    except Exception as e:
        print(f"[CHROMA] resource index error: {e}")
        return ""


@app.post("/resources", status_code=201)
def create_resource(
    body: CreateResourceBody,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    """Добавить ресурс в базу знаний (hr или manager)."""
    if current_user.role not in ("hr", "manager"):
        raise HTTPException(status_code=403, detail="Нет доступа")
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Название обязательно")
    if not body.url.strip():
        raise HTTPException(status_code=400, detail="URL обязателен")
    if body.audience not in ("all", "managers", "hr"):
        raise HTTPException(status_code=400, detail="audience: all | managers | hr")

    conn = get_connection()
    try:
        cur = conn.execute(
            "INSERT INTO company_resources (title, description, url, audience, added_by) VALUES (?,?,?,?,?)",
            (body.title.strip(), body.description.strip(), body.url.strip(), body.audience, current_user.email),
        )
        conn.commit()
        resource_id = cur.lastrowid
        chroma_id = _index_resource(resource_id, body.title.strip(), body.description.strip(), body.url.strip(), body.audience)
        conn.execute("UPDATE company_resources SET chroma_id=? WHERE id=?", (chroma_id, resource_id))
        conn.commit()
        row = conn.execute(
            "SELECT r.*, e.full_name AS adder_name FROM company_resources r "
            "LEFT JOIN employees e ON r.added_by = e.email WHERE r.id=?",
            (resource_id,),
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.get("/resources")
def get_resources(current_user: Annotated[UserContext, Depends(get_current_user)]):
    """Список ресурсов базы знаний (с фильтрацией по audience)."""
    allowed = _ROLE_AUDIENCE.get(current_user.role, ["all"])
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT r.*, e.full_name AS adder_name FROM company_resources r "
            "LEFT JOIN employees e ON r.added_by = e.email "
            f"WHERE r.audience IN ({','.join('?' * len(allowed))}) ORDER BY r.created_at DESC",
            allowed,
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.delete("/resources/{resource_id}", status_code=204)
def delete_resource(
    resource_id: int,
    current_user: Annotated[UserContext, Depends(get_current_user)],
):
    """Удалить ресурс (hr — любой, manager — только свои)."""
    if current_user.role not in ("hr", "manager"):
        raise HTTPException(status_code=403, detail="Нет доступа")
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM company_resources WHERE id=?", (resource_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Ресурс не найден")
        if current_user.role == "manager" and row["added_by"] != current_user.email:
            raise HTTPException(status_code=403, detail="Нет доступа")
        chroma_id = row["chroma_id"]
        conn.execute("DELETE FROM company_resources WHERE id=?", (resource_id,))
        conn.commit()
        if chroma_id:
            try:
                from agent import _get_chroma
                coll = _get_chroma()
                if coll:
                    coll.delete(ids=[chroma_id])
            except Exception as e:
                print(f"[CHROMA] resource delete error: {e}")
    finally:
        conn.close()


@app.get("/health")
def health():
    """Проверка работоспособности сервера и подключения к модели."""
    return {
        "status": "ok",
        "model":  "llama3.1:8b",
        "ollama": "http://168.222.142.182:11434",
    }


# ── Фронтенд (SPA) ────────────────────────────────────────────────────────────
# Монтируем после всех API-роутов чтобы не перехватить /auth, /chat и т.д.

_DIST = Path(__file__).parent / "dist"

if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(_DIST / "assets")), name="assets")

    @app.get("/", include_in_schema=False)
    def spa_root():
        return FileResponse(str(_DIST / "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        """Все неизвестные пути отдают index.html — нужно для React Router."""
        return FileResponse(str(_DIST / "index.html"))
