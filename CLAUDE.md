# 1221 HR Assistant — проект LIT (хакатон)

## Стек

| Слой | Технология |
|------|-----------|
| Backend | FastAPI + Uvicorn, порт **8000** |
| Frontend | Vite + React + Tailwind 3, порт **5173** |
| iOS | Swift/SwiftUI в `LIT ASSISTANT/` (второй разработчик) |
| LLM | Ollama на VPS `168.222.142.182:11434`, модель `qwen2.5-coder:7b` |
| RAG | ChromaDB + `paraphrase-multilingual-MiniLM-L12-v2` |
| БД | SQLite (`backend/hr.db`) |
| Auth | JWT (python-jose), 8 ч, ключ в `auth.py` |

Vite проксирует `/api/*` → `http://127.0.0.1:8000` (без `/api` префикса).

## Структура

```
LIT/
├── backend/
│   ├── main.py          # FastAPI routes
│   ├── auth.py          # JWT, MOCK_USERS, get_current_user()
│   ├── agent.py         # pipeline agent (quick_answer → RAG → LLM)
│   ├── database.py      # SQLite init, get_connection()
│   ├── ingest.py        # ChromaDB ingestion из ПВТР
│   └── hr.db            # SQLite файл
└── frontend/
    ├── vite.config.js   # proxy /api → :8000
    ├── tailwind.config.js  # brand tokens
    └── src/
        ├── api/
        │   ├── client.js      # apiFetch(), tokenStore
        │   ├── auth.js        # login(), getMe()
        │   ├── chat.js        # sendMessage()
        │   └── employee.js    # fetchMyData()
        ├── hooks/
        │   └── useEmployeeData.js  # useEffect wrapper для /me/data
        ├── store/
        │   └── AuthContext.jsx  # user, status, login, logout
        ├── lib/
        │   └── displayUser.js  # displayUser(), defaultViewMode()
        ├── components/
        │   ├── Mascot.jsx      # 5 состояний: idle/thinking/success/empty/error
        │   ├── LoginScreen.jsx
        │   ├── Layout.jsx
        │   ├── Button.jsx
        │   └── Card.jsx
        ├── pages/
        │   ├── Chat.jsx
        │   ├── Dashboard.jsx
        │   ├── Vacation.jsx    # реальные данные из /me/data
        │   ├── Salary.jsx      # реальные данные из /me/data
        │   ├── Profile.jsx
        │   ├── ManagerDashboard.jsx
        │   └── ...
        ├── data/mockData.js    # навигация, статичные данные (не HR-данные)
        └── App.jsx             # роутинг: loading → LoginScreen → Workspace
```

## Запуск

```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend && npm install && npm run dev
```

## Демо-аккаунты (все с одним паролем)

| Роль | Email | Пароль |
|------|-------|--------|
| HR | hr@portal-test.1221systems.ru | `6J1~CzTZ&X` |
| Руководитель | dir@portal-test.1221systems.ru | `6J1~CzTZ&X` |
| Сотрудник | work@portal-test.1221systems.ru | `6J1~CzTZ&X` |

## Роли и RBAC

- `employee` → viewMode `employee` (личные страницы)
- `manager` → viewMode `manager` (ManagerDashboard + личные страницы)
- `hr` → viewMode `manager` (те же права, что manager в UI)

RLS в Python (не в LLM): каждый SQL-запрос в agent.py оборачивается в CTE с фильтром по `employee_email`. **Контракт**: каждый SQL-запрос в `_fetch_employee_facts()` обязан возвращать колонки `employee_email` и `department`.

## Agent pipeline

```
run_agent()
  ├── _fetch_employee_facts()   — SQL → dict (профиль, отпуск, зарплата)
  ├── _try_quick_answer()       — детерминированный ответ на отпуск/зарплату
  │     └── если не None → вернуть сразу (ноль LLM, ноль галлюцинаций)
  └── RAG + LLM fallback
        ├── ChromaDB top-3 chunks из ПВТР
        ├── _format_facts_for_llm() → текстовый блок фактов
        └── _synthesize() → Ollama с retry (3 попытки, exp. backoff)
```

## API endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/auth/login` | JWT по email/паролю |
| GET | `/auth/me` | профиль из токена |
| GET | `/me/data` | отпуск + выплаты текущего пользователя |
| POST | `/chat` | сообщение агенту |
| GET | `/health` | проверка сервера |

## Дизайн-система

Tailwind переопределён в `tailwind.config.js`:
- `slate-950` = `#001221` (Deep Ashy Blue, основной фон)
- `slate-900` = `#0F1221` (Dark Void Blue)
- `green-500` = `#6AB216` (Tech Green, CTA)
- `brand.danger` = `#DC143C` (Crimson, ошибки)
- `brand.light` = `#F4F5F0` (Cloud Dancer, светлый фон)

Никогда не вводить произвольные hex в JSX — только классы Tailwind.

## БД — таблицы

- `employees` — профиль (email, full_name, department, position, manager_email, salary, hire_date)
- `leave_balances` — отпуск (employee_email, year, total_days, used_days, pending_days)
- `salary_payments` — выплаты (employee_email, payment_date, payment_type, amount, status)

Тестовые данные: апрель 2026 (paid) + май 2026 (planned), отпуск за 2025 и 2026.

## iOS

Проект `LIT ASSISTANT/` разрабатывает второй разработчик (has1l).
Макеты: https://github.com/has1l/Lit
Общий backend — те же endpoints что и веб. Не ломать контракт API без согласования.
