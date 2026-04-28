"""
Инициализация локальной SQLite-базы данных для HR-ассистента.

Содержит три таблицы:
  - employees:        профиль сотрудника (email, имя, отдел, зарплата)
  - leave_balances:   баланс отпускных дней по годам
  - salary_payments:  история выплат (аванс/зарплата) и ближайшие плановые

Запусти напрямую (`python database.py`), чтобы пересоздать базу с тестовыми данными.
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "hr.db"


def get_connection() -> sqlite3.Connection:
    """Возвращает соединение с БД с включёнными внешними ключами."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row          # результаты как словари
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """Создаёт таблицы и наполняет их тестовыми данными."""
    conn = get_connection()
    cur = conn.cursor()

    # ── Таблица сотрудников ───────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS employees (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            email         TEXT    UNIQUE NOT NULL,
            full_name     TEXT    NOT NULL,
            department    TEXT    NOT NULL,
            position      TEXT    NOT NULL,
            manager_email TEXT    REFERENCES employees(email),
            salary        REAL    NOT NULL,
            hire_date     TEXT    NOT NULL   -- формат YYYY-MM-DD
        )
    """)

    # ── Таблица остатков отпуска ──────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS leave_balances (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_email TEXT    NOT NULL REFERENCES employees(email),
            year           INTEGER NOT NULL,
            total_days     INTEGER NOT NULL DEFAULT 28,
            used_days      INTEGER NOT NULL DEFAULT 0,
            pending_days   INTEGER NOT NULL DEFAULT 0,  -- поданы, но не утверждены
            UNIQUE(employee_email, year)
        )
    """)

    # ── Тестовые сотрудники ───────────────────────────────────────────────
    # Порядок важен: сначала те, у кого нет менеджера, затем те, кто на них ссылается
    employees = [
        (
            "hr@portal-test.1221systems.ru",
            "Анна Петрова",
            "HR",
            "HR-менеджер",
            None,                               # нет руководителя
            130_000.0,
            "2020-03-15",
        ),
        (
            "dir@portal-test.1221systems.ru",
            "Сергей Козлов",
            "Разработка",
            "Team Lead",
            "hr@portal-test.1221systems.ru",    # руководитель — hr@ (уже вставлен)
            210_000.0,
            "2018-11-20",
        ),
        (
            "work@portal-test.1221systems.ru",
            "Иван Сидоров",
            "Разработка",
            "Junior Developer",
            "dir@portal-test.1221systems.ru",   # руководитель — dir@ (уже вставлен)
            90_000.0,
            "2023-06-01",
        ),
    ]

    cur.executemany(
        """
        INSERT OR IGNORE INTO employees
            (email, full_name, department, position, manager_email, salary, hire_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        employees,
    )

    # ── Остатки отпуска: данные за прошлый и текущий годы ────────────────
    leave_data = [
        # 2025 — прошлый год (история)
        ("hr@portal-test.1221systems.ru",   2025, 28,  5, 0),
        ("work@portal-test.1221systems.ru", 2025, 28, 12, 3),
        ("dir@portal-test.1221systems.ru",  2025, 28,  8, 0),
        # 2026 — текущий год (используется агентом для актуального остатка)
        ("hr@portal-test.1221systems.ru",   2026, 28,  4, 0),
        ("work@portal-test.1221systems.ru", 2026, 28,  6, 5),
        ("dir@portal-test.1221systems.ru",  2026, 28, 10, 0),
    ]

    cur.executemany(
        """
        INSERT OR IGNORE INTO leave_balances
            (employee_email, year, total_days, used_days, pending_days)
        VALUES (?, ?, ?, ?, ?)
        """,
        leave_data,
    )

    # ── Таблица выплат зарплаты ───────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS salary_payments (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_email TEXT    NOT NULL REFERENCES employees(email),
            payment_date   TEXT    NOT NULL,         -- YYYY-MM-DD
            payment_type   TEXT    NOT NULL,         -- 'advance' | 'salary'
            amount         REAL    NOT NULL,
            status         TEXT    NOT NULL DEFAULT 'planned',  -- 'paid' | 'planned'
            UNIQUE(employee_email, payment_date, payment_type)
        )
    """)

    # ── Тестовые выплаты: история (paid) + ближайшие плановые (planned) ──
    # Календарь компании: аванс — 5 числа, зарплата — 20 числа.
    salary_payments_data = [
        # work@: Иван Сидоров, оклад 90 000
        ("work@portal-test.1221systems.ru", "2026-04-05", "advance", 36000.0, "paid"),
        ("work@portal-test.1221systems.ru", "2026-04-20", "salary",  54000.0, "paid"),
        ("work@portal-test.1221systems.ru", "2026-05-05", "advance", 36000.0, "planned"),
        ("work@portal-test.1221systems.ru", "2026-05-20", "salary",  54000.0, "planned"),
        # dir@: Сергей Козлов, оклад 210 000
        ("dir@portal-test.1221systems.ru",  "2026-04-05", "advance", 84000.0, "paid"),
        ("dir@portal-test.1221systems.ru",  "2026-04-20", "salary",  126000.0, "paid"),
        ("dir@portal-test.1221systems.ru",  "2026-05-05", "advance", 84000.0, "planned"),
        ("dir@portal-test.1221systems.ru",  "2026-05-20", "salary",  126000.0, "planned"),
        # hr@: Анна Петрова, оклад 130 000
        ("hr@portal-test.1221systems.ru",   "2026-04-05", "advance", 52000.0, "paid"),
        ("hr@portal-test.1221systems.ru",   "2026-04-20", "salary",  78000.0, "paid"),
        ("hr@portal-test.1221systems.ru",   "2026-05-05", "advance", 52000.0, "planned"),
        ("hr@portal-test.1221systems.ru",   "2026-05-20", "salary",  78000.0, "planned"),
    ]

    cur.executemany(
        """
        INSERT OR IGNORE INTO salary_payments
            (employee_email, payment_date, payment_type, amount, status)
        VALUES (?, ?, ?, ?, ?)
        """,
        salary_payments_data,
    )

    # ── Таблица личных сообщений ──────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            from_email  TEXT NOT NULL,
            to_email    TEXT NOT NULL,
            text        TEXT NOT NULL,
            created_at  TEXT NOT NULL
                DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')),
            is_read     INTEGER NOT NULL DEFAULT 0
        )
    """)

    if cur.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 0:
        seed_messages = [
            ("dir@portal-test.1221systems.ru", "work@portal-test.1221systems.ru",
             "Иван, напомни статус по задачам на сегодня.", "2026-04-28T10:30:00"),
            ("work@portal-test.1221systems.ru", "dir@portal-test.1221systems.ru",
             "Добрый день! Закрыл три задачи, осталась одна — жду ревью.", "2026-04-28T10:35:00"),
            ("dir@portal-test.1221systems.ru", "work@portal-test.1221systems.ru",
             "Хорошо, пришли PR-ссылку, посмотрю после обеда.", "2026-04-28T10:37:00"),
        ]
        cur.executemany(
            "INSERT INTO messages (from_email, to_email, text, created_at) VALUES (?,?,?,?)",
            seed_messages,
        )

    conn.commit()
    conn.close()
    print(f"[DB] База данных инициализирована: {DB_PATH}")


if __name__ == "__main__":
    init_db()
