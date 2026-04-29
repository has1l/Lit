"""
Инициализация локальной SQLite-базы данных для HR-ассистента.

Таблицы:
  - employees          профиль сотрудника (email, имя, отдел, зарплата, ДР, пол)
  - leave_balances     баланс отпускных дней по годам
  - salary_payments    история выплат (аванс/зарплата) и ближайшие плановые
  - messages           личные сообщения между сотрудниками
  - goals              цели сотрудников на месяц
  - daily_selections   ежедневный выбор задач
  - employee_points    баллы и серии
  - bonus_records      бонусные итоги месяца
  - employee_status    онлайн-статус сотрудника (серверный)
  - hr_appeals         тикеты в HR из чата
  - uploaded_documents список загруженных в RAG документов
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "hr.db"


def get_connection() -> sqlite3.Connection:
    """Возвращает соединение с БД с включёнными внешними ключами."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """Создаёт таблицы и наполняет их тестовыми данными."""
    conn = get_connection()
    cur = conn.cursor()

    # ── Таблица сотрудников ───────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS employees (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            email         TEXT    UNIQUE NOT NULL,
            full_name     TEXT    NOT NULL,
            department    TEXT    NOT NULL,
            position      TEXT    NOT NULL,
            manager_email TEXT    REFERENCES employees(email),
            salary        REAL    NOT NULL,
            hire_date     TEXT    NOT NULL,
            birth_date    TEXT,
            gender        TEXT,
            phone         TEXT,
            avatar_color  TEXT
        )
    """)

    # Миграция: добавить новые колонки если их нет
    existing = {row[1] for row in cur.execute("PRAGMA table_info(employees)").fetchall()}
    for col, typedef in [
        ("birth_date",   "TEXT"),
        ("gender",       "TEXT"),
        ("phone",        "TEXT"),
        ("avatar_color", "TEXT"),
    ]:
        if col not in existing:
            cur.execute(f"ALTER TABLE employees ADD COLUMN {col} {typedef}")

    # ── Таблица остатков отпуска ──────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS leave_balances (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_email TEXT    NOT NULL REFERENCES employees(email),
            year           INTEGER NOT NULL,
            total_days     INTEGER NOT NULL DEFAULT 28,
            used_days      INTEGER NOT NULL DEFAULT 0,
            pending_days   INTEGER NOT NULL DEFAULT 0,
            UNIQUE(employee_email, year)
        )
    """)

    # ── Таблица выплат зарплаты ───────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS salary_payments (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_email TEXT    NOT NULL REFERENCES employees(email),
            payment_date   TEXT    NOT NULL,
            payment_type   TEXT    NOT NULL,
            amount         REAL    NOT NULL,
            status         TEXT    NOT NULL DEFAULT 'planned',
            UNIQUE(employee_email, payment_date, payment_type)
        )
    """)

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

    # ── Геймификация ──────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS goals (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_email TEXT    NOT NULL REFERENCES employees(email),
            created_by     TEXT    NOT NULL REFERENCES employees(email),
            title          TEXT    NOT NULL,
            description    TEXT    NOT NULL DEFAULT '',
            points         INTEGER NOT NULL DEFAULT 10,
            difficulty     TEXT    NOT NULL DEFAULT 'medium',
            month          INTEGER NOT NULL,
            year           INTEGER NOT NULL,
            status         TEXT    NOT NULL DEFAULT 'active',
            created_at     TEXT    NOT NULL
                DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS daily_selections (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id        INTEGER NOT NULL REFERENCES goals(id),
            employee_email TEXT    NOT NULL REFERENCES employees(email),
            date           TEXT    NOT NULL,
            completed      INTEGER NOT NULL DEFAULT 0,
            completed_at   TEXT,
            UNIQUE(goal_id, employee_email, date)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS employee_points (
            employee_email   TEXT    PRIMARY KEY REFERENCES employees(email),
            points_total     INTEGER NOT NULL DEFAULT 0,
            streak_days      INTEGER NOT NULL DEFAULT 0,
            last_active_date TEXT    DEFAULT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS bonus_records (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_email TEXT    NOT NULL REFERENCES employees(email),
            month          INTEGER NOT NULL,
            year           INTEGER NOT NULL,
            score_pct      REAL    NOT NULL,
            earned_points  INTEGER NOT NULL,
            max_points     INTEGER NOT NULL,
            status         TEXT    NOT NULL DEFAULT 'pending',
            reviewed_by    TEXT,
            reviewed_at    TEXT,
            created_at     TEXT    NOT NULL
                DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')),
            UNIQUE(employee_email, month, year)
        )
    """)

    # ── Онлайн-статус сотрудников (серверный) ────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS employee_status (
            employee_email TEXT    PRIMARY KEY REFERENCES employees(email),
            status         TEXT    NOT NULL DEFAULT 'offline',
            current_task   TEXT    NOT NULL DEFAULT '',
            updated_at     TEXT    NOT NULL
                DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'))
        )
    """)

    # ── HR-тикеты (эскалация из чата) ────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS hr_appeals (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            from_email    TEXT    NOT NULL REFERENCES employees(email),
            question_text TEXT    NOT NULL,
            category      TEXT    NOT NULL DEFAULT 'other',
            status        TEXT    NOT NULL DEFAULT 'open',
            hr_response   TEXT,
            assigned_to   TEXT    REFERENCES employees(email),
            created_at    TEXT    NOT NULL
                DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')),
            resolved_at   TEXT
        )
    """)

    # ── Загруженные документы в RAG ──────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS uploaded_documents (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            filename     TEXT    NOT NULL,
            uploaded_by  TEXT    NOT NULL REFERENCES employees(email),
            audience     TEXT    NOT NULL DEFAULT 'all',
            chunk_count  INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT    NOT NULL
                DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'))
        )
    """)

    # ── База знаний: ресурсы компании ────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS company_resources (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT    NOT NULL,
            description TEXT    NOT NULL DEFAULT '',
            url         TEXT    NOT NULL,
            audience    TEXT    NOT NULL DEFAULT 'all',
            added_by    TEXT    NOT NULL REFERENCES employees(email),
            chroma_id   TEXT    NOT NULL DEFAULT '',
            created_at  TEXT    NOT NULL
                DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'))
        )
    """)

    # ── Магазин наград ────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS reward_items (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT    NOT NULL,
            description TEXT    NOT NULL DEFAULT '',
            cost_points INTEGER NOT NULL,
            quantity    INTEGER NOT NULL DEFAULT -1,
            created_by  TEXT    NOT NULL REFERENCES employees(email),
            is_active   INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT    NOT NULL
                DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS reward_requests (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id        INTEGER NOT NULL REFERENCES reward_items(id),
            employee_email TEXT    NOT NULL REFERENCES employees(email),
            status         TEXT    NOT NULL DEFAULT 'pending',
            reviewed_by    TEXT    REFERENCES employees(email),
            reviewed_at    TEXT,
            created_at     TEXT    NOT NULL
                DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'))
        )
    """)

    # Миграция difficulty в goals
    goal_cols = {row[1] for row in cur.execute("PRAGMA table_info(goals)").fetchall()}
    if "difficulty" not in goal_cols:
        cur.execute("ALTER TABLE goals ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'medium'")

    # Seed: примеры наград в магазине
    if cur.execute("SELECT COUNT(*) FROM reward_items").fetchone()[0] == 0:
        seed_items = [
            ("Абонемент в спортзал (1 мес.)", "Оплата месячного абонемента в ближайший фитнес-клуб", 500, 3, "hr@portal-test.1221systems.ru"),
            ("Мерч 1221 Systems", "Фирменная толстовка с логотипом компании", 300, 10, "hr@portal-test.1221systems.ru"),
            ("День удалённой работы", "Один дополнительный день работы из дома по согласованию", 150, -1, "dir@portal-test.1221systems.ru"),
            ("Скидка 50% в кафе партнёра", "Купон на скидку в ресторане-партнёре рядом с офисом", 100, 20, "hr@portal-test.1221systems.ru"),
            ("Ранний уход в пятницу", "Уйти на 2 часа раньше в любую пятницу месяца", 200, -1, "dir@portal-test.1221systems.ru"),
        ]
        cur.executemany(
            "INSERT INTO reward_items (title, description, cost_points, quantity, created_by) VALUES (?,?,?,?,?)",
            seed_items,
        )

    # ── Seed: 7 сотрудников ───────────────────────────────────────────────────
    # Порядок важен: сначала без manager_email, потом со ссылкой
    employees = [
        # email, full_name, department, position, manager_email, salary, hire_date, birth_date, gender, phone, avatar_color
        (
            "hr@portal-test.1221systems.ru",
            "Анна Петрова", "HR", "HR-менеджер",
            None, 130_000.0, "2020-03-15",
            "1985-09-22", "female", "+7 901 100-00-01", "#6AB216",
        ),
        (
            "dir@portal-test.1221systems.ru",
            "Сергей Козлов", "Разработка", "Team Lead",
            "hr@portal-test.1221systems.ru", 210_000.0, "2018-11-20",
            "1988-03-12", "male", "+7 901 100-00-02", "#4F46E5",
        ),
        (
            "work@portal-test.1221systems.ru",
            "Иван Сидоров", "Разработка", "Junior Developer",
            "dir@portal-test.1221systems.ru", 90_000.0, "2023-06-01",
            "2001-06-20", "male", "+7 901 100-00-03", "#0EA5E9",
        ),
        (
            "senior@portal-test.1221systems.ru",
            "Мария Волкова", "Разработка", "Senior Developer",
            "dir@portal-test.1221systems.ru", 180_000.0, "2019-04-10",
            "1993-11-05", "female", "+7 901 100-00-04", "#EC4899",
        ),
        (
            "qa@portal-test.1221systems.ru",
            "Алексей Новиков", "Разработка", "QA Engineer",
            "dir@portal-test.1221systems.ru", 120_000.0, "2021-09-01",
            "1996-08-30", "male", "+7 901 100-00-05", "#F59E0B",
        ),
        (
            "design@portal-test.1221systems.ru",
            "Ольга Смирнова", "Дизайн", "UI Designer",
            "dir@portal-test.1221systems.ru", 140_000.0, "2022-02-14",
            "1997-04-17", "female", "+7 901 100-00-06", "#8B5CF6",
        ),
        (
            "clean@portal-test.1221systems.ru",
            "Татьяна Фёдорова", "Хозяйственный отдел", "Уборщик",
            "dir@portal-test.1221systems.ru", 45_000.0, "2019-01-10",
            "1975-02-08", "female", "+7 901 100-00-07", "#64748B",
        ),
    ]

    cur.executemany(
        """
        INSERT OR IGNORE INTO employees
            (email, full_name, department, position, manager_email,
             salary, hire_date, birth_date, gender, phone, avatar_color)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        employees,
    )

    # Обновить birth_date/gender/phone/avatar_color для уже существующих записей
    for emp in employees:
        cur.execute(
            """UPDATE employees SET birth_date=?, gender=?, phone=?, avatar_color=?
               WHERE email=? AND (birth_date IS NULL OR birth_date='')""",
            (emp[7], emp[8], emp[9], emp[10], emp[0]),
        )

    # ── Отпуска для всех 7 сотрудников ───────────────────────────────────────
    leave_data = [
        ("hr@portal-test.1221systems.ru",     2025, 28,  5, 0),
        ("hr@portal-test.1221systems.ru",     2026, 28,  4, 0),
        ("dir@portal-test.1221systems.ru",    2025, 28,  8, 0),
        ("dir@portal-test.1221systems.ru",    2026, 28, 10, 0),
        ("work@portal-test.1221systems.ru",   2025, 28, 12, 3),
        ("work@portal-test.1221systems.ru",   2026, 28,  6, 5),
        ("senior@portal-test.1221systems.ru", 2025, 28, 20, 0),
        ("senior@portal-test.1221systems.ru", 2026, 28,  3, 0),
        ("qa@portal-test.1221systems.ru",     2025, 28, 14, 0),
        ("qa@portal-test.1221systems.ru",     2026, 28,  7, 7),
        ("design@portal-test.1221systems.ru", 2025, 28, 10, 0),
        ("design@portal-test.1221systems.ru", 2026, 28,  5, 0),
        ("clean@portal-test.1221systems.ru",  2025, 28, 28, 0),
        ("clean@portal-test.1221systems.ru",  2026, 28,  0, 0),
    ]

    cur.executemany(
        """
        INSERT OR IGNORE INTO leave_balances
            (employee_email, year, total_days, used_days, pending_days)
        VALUES (?, ?, ?, ?, ?)
        """,
        leave_data,
    )

    # ── Выплаты для всех 7 сотрудников ───────────────────────────────────────
    def _payments(email, salary):
        adv = round(salary * 0.4)
        sal = round(salary * 0.6)
        return [
            (email, "2026-04-05", "advance", adv,  "paid"),
            (email, "2026-04-20", "salary",  sal,  "paid"),
            (email, "2026-05-05", "advance", adv,  "planned"),
            (email, "2026-05-20", "salary",  sal,  "planned"),
        ]

    salary_data = []
    for em, _, _, _, _, sal, *_ in employees:
        salary_data.extend(_payments(em, sal))

    cur.executemany(
        """
        INSERT OR IGNORE INTO salary_payments
            (employee_email, payment_date, payment_type, amount, status)
        VALUES (?, ?, ?, ?, ?)
        """,
        salary_data,
    )

    # ── Seed: сообщения ───────────────────────────────────────────────────────
    if cur.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 0:
        seed_messages = [
            ("dir@portal-test.1221systems.ru", "work@portal-test.1221systems.ru",
             "Иван, напомни статус по задачам на сегодня.", "2026-04-28T10:30:00"),
            ("work@portal-test.1221systems.ru", "dir@portal-test.1221systems.ru",
             "Добрый день! Закрыл три задачи, осталась одна — жду ревью.", "2026-04-28T10:35:00"),
            ("dir@portal-test.1221systems.ru", "work@portal-test.1221systems.ru",
             "Хорошо, пришли PR-ссылку, посмотрю после обеда.", "2026-04-28T10:37:00"),
            ("hr@portal-test.1221systems.ru", "dir@portal-test.1221systems.ru",
             "Сергей, не забудь про отчёт по команде до конца недели.", "2026-04-28T09:00:00"),
        ]
        cur.executemany(
            "INSERT INTO messages (from_email, to_email, text, created_at) VALUES (?,?,?,?)",
            seed_messages,
        )

    # ── Seed: онлайн-статусы ──────────────────────────────────────────────────
    seed_statuses = [
        ("work@portal-test.1221systems.ru",   "online",  "Работаю над PR #42"),
        ("senior@portal-test.1221systems.ru", "online",  "Ревью кода"),
        ("qa@portal-test.1221systems.ru",     "break",   ""),
        ("dir@portal-test.1221systems.ru",    "online",  "Митинг с командой"),
        ("design@portal-test.1221systems.ru", "offline", ""),
        ("hr@portal-test.1221systems.ru",     "online",  ""),
        ("clean@portal-test.1221systems.ru",  "offline", ""),
    ]
    cur.executemany(
        """INSERT OR IGNORE INTO employee_status (employee_email, status, current_task)
           VALUES (?, ?, ?)""",
        seed_statuses,
    )

    # ── Seed: цели ────────────────────────────────────────────────────────────
    if cur.execute("SELECT COUNT(*) FROM goals").fetchone()[0] == 0:
        seed_goals = [
            ("work@portal-test.1221systems.ru", "dir@portal-test.1221systems.ru",
             "Завершить код-ревью", "Проверить открытые PR в репозитории", 20, "medium", 4, 2026),
            ("work@portal-test.1221systems.ru", "dir@portal-test.1221systems.ru",
             "Написать unit-тесты", "Покрыть тестами новый модуль авторизации", 30, "hard", 4, 2026),
            ("work@portal-test.1221systems.ru", "dir@portal-test.1221systems.ru",
             "Обновить документацию", "README и комментарии к API-эндпоинтам", 15, "easy", 4, 2026),
            ("work@portal-test.1221systems.ru", "dir@portal-test.1221systems.ru",
             "Провести встречу с командой", "Синк по текущим задачам спринта", 25, "medium", 4, 2026),
            ("work@portal-test.1221systems.ru", "dir@portal-test.1221systems.ru",
             "Исправить баги из трекера", "Закрыть задачи с приоритетом HIGH", 35, "hard", 4, 2026),
            ("work@portal-test.1221systems.ru", "dir@portal-test.1221systems.ru",
             "Подготовить презентацию", "Слайды для демо в конце спринта", 40, "hard", 4, 2026),
        ]
        goal_ids = []
        for g in seed_goals:
            cur.execute(
                "INSERT INTO goals (employee_email,created_by,title,description,points,difficulty,month,year) "
                "VALUES (?,?,?,?,?,?,?,?)", g
            )
            goal_ids.append(cur.lastrowid)

        history_days = [
            ("2026-04-22", [0, 1, 2], [0, 1]),
            ("2026-04-23", [0, 1, 3], [0, 1, 3]),
            ("2026-04-24", [2, 4, 5], [2, 4, 5]),
            ("2026-04-25", [0, 3, 4], [0, 3, 4]),
        ]
        for date, selected_idx, completed_idx in history_days:
            for idx in selected_idx:
                completed = 1 if idx in completed_idx else 0
                completed_at = f"{date}T18:00:00" if completed else None
                cur.execute(
                    "INSERT OR IGNORE INTO daily_selections "
                    "(goal_id, employee_email, date, completed, completed_at) VALUES (?,?,?,?,?)",
                    (goal_ids[idx], "work@portal-test.1221systems.ru", date, completed, completed_at),
                )

        seed_pts = [
            ("work@portal-test.1221systems.ru",   215, 3, "2026-04-25"),
            ("dir@portal-test.1221systems.ru",    480, 0, "2026-04-20"),
            ("hr@portal-test.1221systems.ru",     120, 0, "2026-04-15"),
            ("senior@portal-test.1221systems.ru", 340, 2, "2026-04-27"),
            ("qa@portal-test.1221systems.ru",     95,  0, "2026-04-26"),
        ]
        for pt in seed_pts:
            cur.execute(
                "INSERT OR IGNORE INTO employee_points "
                "(employee_email, points_total, streak_days, last_active_date) VALUES (?,?,?,?)", pt
            )

    conn.commit()
    conn.close()
    print(f"[DB] База данных инициализирована: {DB_PATH}")


if __name__ == "__main__":
    init_db()
