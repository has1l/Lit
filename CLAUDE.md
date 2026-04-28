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

## Git

Репозиторий: https://github.com/has1l/Lit  
`.gitignore` исключает: `__pycache__`, `.DS_Store`, `chroma_db/`, `hr.db`, `node_modules/`, Xcode xcuserstate.

## Структура

```
LIT/
├── backend/
│   ├── main.py          # FastAPI routes (35+ endpoints)
│   ├── auth.py          # JWT, MOCK_USERS (7 аккаунтов), get_current_user()
│   ├── agent.py         # pipeline agent (quick_answer → RAG → LLM), subject detection
│   ├── data_policy.py   # RBAC данных: PUBLIC_FIELDS, PRIVATE_FIELDS, can_access()
│   ├── database.py      # SQLite init, get_connection(), 11 таблиц
│   ├── documents.py     # парсинг PDF/DOCX/XLSX, ingest_document() → ChromaDB
│   └── ingest.py        # ChromaDB ingestion из ПВТР (ручной запуск)
└── frontend/
    ├── vite.config.js   # proxy /api → :8000
    ├── tailwind.config.js  # brand tokens
    └── src/
        ├── api/
        │   ├── client.js      # apiFetch(), tokenStore
        │   ├── auth.js        # login(), getMe()
        │   ├── chat.js        # sendMessage()
        │   ├── employee.js    # fetchMyData(), fetchTeamStatuses(), fetchEmployeeProfile(), updateMyStatus()
        │   ├── messages.js    # fetchContacts(), fetchMessages(), postMessage()
        │   ├── appeals.js     # fetchAppeals(), createAppeal(), resolveAppeal()
        │   └── documents.js   # fetchDocuments(), uploadDocument(), deleteDocument()
        ├── hooks/
        │   └── useEmployeeData.js  # useEffect wrapper для /me/data
        ├── store/
        │   └── AuthContext.jsx  # user, status, login, logout
        ├── lib/
        │   ├── displayUser.js  # displayUser(), defaultViewMode()
        │   └── format.js       # formatDay(), formatFull(), formatAmount(), paymentTypeRu(), pluralDays()
        ├── components/
        │   ├── Mascot.jsx              # 5 состояний: idle/thinking/success/empty/error
        │   ├── GlassCard.jsx           # glass-морфизм карточка (backdrop-blur + градиент)
        │   ├── LiquidGlassBackground.jsx  # ambient blur-блобы (используй осторожно)
        │   ├── LoginScreen.jsx
        │   ├── Layout.jsx
        │   ├── Button.jsx
        │   └── Card.jsx
        ├── pages/
        │   ├── Chat.jsx           # AI-чат + голосовой ввод (Web Speech API, ru-RU) + эскалация в HR
        │   ├── Dashboard.jsx      # виджеты + обновление онлайн-статуса
        │   ├── Vacation.jsx       # реальные данные из /me/data
        │   ├── Salary.jsx         # реальные данные из /me/data, плоские карточки (без GlassCard)
        │   ├── Profile.jsx
        │   ├── ManagerDashboard.jsx  # команда: статусы, фильтры, поллинг 15с, профиль-модалка
        │   ├── Appeals.jsx        # тикеты: сотрудник создаёт, HR отвечает
        │   ├── Documents.jsx      # загрузка PDF/DOCX/XLSX (hr/manager), просмотр (all)
        │   └── Questions.jsx
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

API-документация доступна автоматически:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Демо-аккаунты (все с одним паролем `6J1~CzTZ&X`)

| Роль | Email | Имя | Должность |
|------|-------|-----|-----------|
| HR | hr@portal-test.1221systems.ru | Анна Петрова | HR-менеджер |
| Руководитель | dir@portal-test.1221systems.ru | Сергей Козлов | Team Lead |
| Сотрудник | work@portal-test.1221systems.ru | Иван Сидоров | Junior Developer |
| Сотрудник | senior@portal-test.1221systems.ru | Мария Волкова | Senior Developer |
| Сотрудник | qa@portal-test.1221systems.ru | Алексей Новиков | QA Engineer |
| Сотрудник | design@portal-test.1221systems.ru | Ольга Смирнова | UI Designer |
| Сотрудник | clean@portal-test.1221systems.ru | Татьяна Фёдорова | Уборщик |

## Роли и RBAC

- `employee` → viewMode `employee` (личные страницы)
- `manager` → viewMode `manager` (ManagerDashboard + личные страницы)
- `hr` → viewMode `manager` (те же права, что manager в UI)

**Политика доступа к данным (`data_policy.py`):**
- Публичные поля (все видят о любом коллеге): `full_name`, `position`, `department`, `birth_date`, `hire_date`, `phone`
- Приватные поля (только о себе или manager/hr): `salary`, `leave_balances`, `salary_payments`
- Функция `can_access(requester_role, requester_email, subject_email, field) → bool`

RLS в Python (не в LLM): данные фильтруются до передачи в LLM. Если доступ запрещён — поле не попадает в контекст вообще.

Мессенджер RBAC:
- `employee` — может писать только своему руководителю
- `manager` — только своим прямым подчинённым
- `hr` — всем сотрудникам

## Agent pipeline

```
run_agent()
  ├── _fetch_employee_facts()   — SQL → dict (профиль, отпуск, зарплата)
  ├── _detect_subject()         — о ком вопрос? self/other/team, применяет can_access()
  ├── _try_quick_answer()       — детерминированный ответ на отпуск/зарплату
  │     └── если не None → вернуть сразу (ноль LLM, ноль галлюцинаций)
  └── RAG + LLM fallback
        ├── ChromaDB top-3 chunks (hr_documents коллекция)
        ├── _format_facts_for_llm() → возраст, пол, стаж, должность
        └── _synthesize() → Ollama с retry (3 попытки, exp. backoff)

Возвращает: {answer, sources, steps, escalate: bool}
escalate=True если нейронка не знает ответа → фронт показывает кнопку "Отправить в HR"
```

**Системный промпт адаптирует язык под должность:**
- Developer/Engineer/Designer → технический (PR, спринт, деплой)
- Уборщик/Рабочий/Охранник → простой бытовой язык
- HR → кадровая терминология

## API endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/auth/login` | JWT по email/паролю |
| GET | `/auth/me` | профиль из токена |
| GET | `/me/data` | отпуск + выплаты текущего пользователя |
| PUT | `/me/status` | обновить онлайн-статус (online/break/offline) |
| POST | `/chat` | сообщение агенту, возвращает `escalate` |
| GET | `/team/employees` | список команды с birth_date, gender, статусами |
| GET | `/team/statuses` | быстрый поллинг статусов (manager/hr) |
| GET | `/employees/{email}` | полный профиль сотрудника (RBAC) |
| GET | `/messages/contacts` | контакты с превью и счётчиком непрочитанных |
| GET | `/messages?with_email=` | диалог с пользователем (последние 100) |
| POST | `/messages` | отправить личное сообщение |
| POST | `/appeals` | создать тикет в HR |
| GET | `/appeals` | список тикетов (свои / все для hr) |
| PATCH | `/appeals/{id}/resolve` | HR закрывает тикет с ответом |
| PATCH | `/appeals/{id}/assign` | HR назначает ответственного |
| POST | `/documents/upload` | загрузить PDF/DOCX/XLSX (hr/manager) |
| GET | `/documents` | список документов (с RBAC по audience) |
| DELETE | `/documents/{id}` | удалить документ |
| GET | `/health` | проверка сервера |

## Дизайн-система

Tailwind переопределён в `tailwind.config.js`:
- `slate-950` = `#001221` (Deep Ashy Blue, основной фон)
- `slate-900` = `#0F1221` (Dark Void Blue)
- `green-500` = `#6AB216` (Tech Green, CTA)
- `brand.danger` = `#DC143C` (Crimson, ошибки)
- `brand.light` = `#F4F5F0` (Cloud Dancer, светлый фон)

Никогда не вводить произвольные hex в JSX — только классы Tailwind.

`GlassCard` — компонент с glass-морфизмом (backdrop-blur-3xl + градиентная рамка). Используется на большинстве страниц. На странице `Salary.jsx` намеренно заменён на плоский `Card` (`bg-slate-800`).

## БД — таблицы

- `employees` — профиль (email, full_name, department, position, manager_email, salary, hire_date, **birth_date, gender, phone, avatar_color**)
- `leave_balances` — отпуск (employee_email, year, total_days, used_days, pending_days)
- `salary_payments` — выплаты (employee_email, payment_date, payment_type, amount, status)
- `messages` — личные сообщения (id, from_email, to_email, text, created_at, is_read)
- `employee_status` — онлайн-статус (employee_email PK, status, current_task, updated_at)
- `hr_appeals` — тикеты в HR (id, from_email, question_text, category, status, hr_response, assigned_to, created_at, resolved_at)
- `uploaded_documents` — реестр документов (id, filename, uploaded_by, audience, chunk_count, created_at)
- `goals`, `daily_selections`, `employee_points`, `bonus_records` — геймификация

Тестовые данные: апрель 2026 (paid) + май 2026 (planned), отпуск за 2025 и 2026, 7 сотрудников.

## iOS

Проект `LIT ASSISTANT/` разрабатывает второй разработчик (has1l).
Макеты: https://github.com/has1l/Lit  
Общий backend — те же endpoints что и веб. **Не ломать контракт API без согласования.**  
Критичные endpoints для iOS: `/auth/login`, `/auth/me`, `/me/data`, `/chat` — структуру не менять.
