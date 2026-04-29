# LIT — 1221 HR Assistant

Корпоративный HR-портал с AI-ассистентом, геймификацией рабочего дня и внутренним мессенджером. Разработан в рамках хакатона на базе стека FastAPI + React.

**Продакшн:** [https://texna-1221.ru](https://texna-1221.ru)

---

## Что умеет

- **AI-ассистент Техна** — отвечает на вопросы по отпуску, зарплате, ДМС и внутренним регламентам. Ищет ответы в базе документов (RAG), при невозможности ответить предлагает эскалировать вопрос в HR.
- **Рабочий день** — сотрудник выбирает задачи на день, отмечает выполненные, завершает день с подтверждением. Система начисляет баллы с учётом сложности задач и стриков.
- **Магазин наград** — баллы обмениваются на реальные бонусы (дополнительный выходной, мерч и др.), HR подтверждает заявки.
- **HR Service Desk** — сотрудники создают обращения с категорией, HR отвечает прямо в интерфейсе.
- **Мессенджер** — личная переписка сотрудника с руководителем (и наоборот), HR пишет всем.
- **Документы** — HR и руководители загружают PDF/DOCX/XLSX, они автоматически индексируются для RAG.
- **Кабинет менеджера** — онлайн-статусы команды в реальном времени, профили сотрудников, история выплат.
- **Голосовой ввод** — запись через микрофон, распознавание на сервере (Whisper).

---

## Стек

| Слой | Технология |
|------|-----------|
| Backend | FastAPI + Uvicorn |
| Frontend | Vite + React 18 + Tailwind CSS 3 |
| LLM | Ollama (`llama3.1:8b`) на VPS |
| RAG | ChromaDB + `paraphrase-multilingual-MiniLM-L12-v2` |
| STT | Whisper (через `/stt` endpoint) |
| База данных | SQLite (`backend/hr.db`) |
| Аутентификация | JWT (python-jose), срок 8 часов |
| Reverse proxy | Caddy (HTTPS через Let's Encrypt) |

---

## Структура проекта

```
LIT/
├── backend/
│   ├── main.py          # FastAPI — все маршруты (40+ endpoint'ов)
│   ├── auth.py          # JWT: выдача токенов, get_current_user(), демо-аккаунты
│   ├── agent.py         # AI-пайплайн: quick_answer → RAG → LLM
│   ├── data_policy.py   # RBAC данных: PUBLIC_FIELDS, PRIVATE_FIELDS, can_access()
│   ├── database.py      # SQLite: инициализация схемы, get_connection()
│   ├── documents.py     # Парсинг PDF/DOCX/XLSX, загрузка чанков в ChromaDB
│   ├── ingest.py        # Ручная загрузка документов в ChromaDB (запускать 1 раз)
│   ├── requirements.txt
│   └── dist/            # Собранный фронтенд (не в git, деплоится через scp)
└── frontend/
    ├── vite.config.js      # Dev-прокси /api → localhost:8000
    ├── tailwind.config.js  # Brand-токены цветов
    ├── .env.production     # VITE_API_BASE='' (пустая строка для прода)
    └── src/
        ├── api/
        │   ├── client.js      # apiFetch() — базовый HTTP-клиент с JWT
        │   ├── auth.js        # login(), getMe()
        │   ├── chat.js        # sendChatMessage()
        │   ├── employee.js    # fetchMyData(), fetchTeamStatuses(), updateMyStatus()
        │   ├── goals.js       # CRUD целей, ежедневные задачи, геймификация
        │   ├── messages.js    # fetchContacts(), fetchMessages(), postMessage()
        │   ├── appeals.js     # fetchAppeals(), createAppeal(), resolveAppeal()
        │   └── documents.js   # fetchDocuments(), uploadDocument(), deleteDocument()
        ├── components/
        │   ├── Layout.jsx              # Навигация + обёртка страниц
        │   ├── Mascot.jsx              # Анимированный AI-маскот (5 состояний)
        │   ├── Card.jsx                # Базовая карточка
        │   ├── GlassCard.jsx           # Карточка с glass-морфизмом
        │   ├── Button.jsx              # Кнопка с вариантами (primary/secondary)
        │   ├── LoginScreen.jsx         # Экран входа
        │   └── EmployeeOnboarding.jsx  # Онбординг-тур для новых сотрудников
        ├── pages/
        │   ├── Dashboard.jsx        # Главная: рабочий день, задачи, виджеты
        │   ├── Chat.jsx             # AI-чат + мессенджер + голосовой ввод
        │   ├── Goals.jsx            # Список целей на месяц
        │   ├── Store.jsx            # Магазин наград за баллы
        │   ├── Appeals.jsx          # HR Service Desk
        │   ├── Documents.jsx        # Библиотека документов
        │   ├── Vacation.jsx         # Остаток и история отпуска
        │   ├── Salary.jsx           # История выплат
        │   ├── Profile.jsx          # Личный профиль
        │   └── ManagerDashboard.jsx # Панель руководителя — статусы команды
        ├── store/
        │   └── AuthContext.jsx  # Глобальное состояние аутентификации
        ├── lib/
        │   ├── displayUser.js  # Форматирование данных пользователя
        │   └── format.js       # Форматирование дат, сумм, типов выплат
        ├── data/
        │   └── mockData.js     # Навигация, быстрые вопросы для чата
        └── App.jsx             # Роутинг, глобальное состояние страниц
```

---

## Локальный запуск

### Требования

- Python 3.11+
- Node.js 18+
- [Ollama](https://ollama.com) с загруженной моделью `llama3.1:8b` (или доступ к VPS)

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Фронтенд запустится на [http://localhost:5173](http://localhost:5173).  
Все запросы `/api/*` автоматически проксируются на `localhost:8000`.

### Первичная загрузка документов (RAG)

Если нужно заново проиндексировать документы в ChromaDB:

```bash
cd backend
python ingest.py
```

---

## Демо-аккаунты

Все аккаунты используют один пароль: **`6J1~CzTZ&X`**

| Роль | Email | Имя | Должность |
|------|-------|-----|-----------|
| HR | `hr@portal-test.1221systems.ru` | Анна Петрова | HR-менеджер |
| Руководитель | `dir@portal-test.1221systems.ru` | Сергей Козлов | Team Lead |
| Сотрудник | `work@portal-test.1221systems.ru` | Иван Сидоров | Junior Developer |
| Сотрудник | `senior@portal-test.1221systems.ru` | Мария Волкова | Senior Developer |
| Сотрудник | `qa@portal-test.1221systems.ru` | Алексей Новиков | QA Engineer |
| Сотрудник | `design@portal-test.1221systems.ru` | Ольга Смирнова | UI Designer |
| Сотрудник | `clean@portal-test.1221systems.ru` | Татьяна Фёдорова | Уборщик |

---

## Роли и права доступа

### Уровни доступа

| Роль | Что видит |
|------|-----------|
| `employee` | Личный кабинет: дашборд, цели, отпуск, зарплата, чат, обращения, документы |
| `manager` | Всё то же + панель команды с онлайн-статусами сотрудников |
| `hr` | Те же права в интерфейсе, что у manager + видит все обращения, может на них отвечать |

### Политика доступа к данным

Поля разделены на публичные (видны всем) и приватные (только свои или manager/hr):

- **Публичные:** `full_name`, `position`, `department`, `birth_date`, `hire_date`, `phone`
- **Приватные:** `salary`, `leave_balances`, `salary_payments`

Фильтрация происходит в Python (`data_policy.py`) **до** передачи данных в LLM — сотрудник не может получить чужую зарплату даже через AI-чат.

### Мессенджер

- `employee` — пишет только своему руководителю
- `manager` — пишет только своим подчинённым
- `hr` — пишет всем

---

## AI-пайплайн

```
run_agent(question, user)
  ├── _fetch_employee_facts()    — профиль + отпуск + зарплата из SQLite
  ├── _detect_subject()          — определяет, о ком вопрос (я / другой / команда)
  │                                применяет can_access() — обрезает запрещённые поля
  ├── _try_quick_answer()        — детерминированный ответ на типовые вопросы
  │     └── если найден → возвращает сразу (без LLM, без галлюцинаций)
  └── RAG + LLM (если быстрый ответ не найден)
        ├── ChromaDB: top-3 чанка из hr_documents
        ├── _format_facts_for_llm() — возраст, пол, стаж, должность
        └── _synthesize() → Ollama (3 попытки с exponential backoff)

Ответ: { answer, sources, steps, escalate: bool }
```

Если модель не уверена в ответе — `escalate: true`. Фронтенд показывает кнопку **"Отправить вопрос в HR"**, которая открывает форму создания обращения с предзаполненным текстом.

Системный промпт автоматически адаптирует стиль под должность:
- Developer / Engineer / Designer → технический язык (PR, спринт, деплой)
- Уборщик / Рабочий / Охранник → простой бытовой язык
- HR → кадровая терминология

---

## Геймификация

Система баллов за рабочий день:

1. **Выбор задач** — сотрудник выбирает задачи из месячного плана на текущий день
2. **Работа** — отмечает выполненные; незавершённые при завершении дня требуют объяснения
3. **Начисление баллов** — рассчитывается с учётом:
   - Сложности задачи (`easy` / `medium` / `hard`)
   - Процента выполнения дня
   - Стрика (серии продуктивных дней подряд)
4. **Магазин** — баллы обмениваются на награды, HR подтверждает или отклоняет заявки
5. **Выполненные задачи** не появляются в выборке снова (статус `completed`)

---

## База данных

SQLite-файл `backend/hr.db` (не в git). Схема создаётся автоматически при первом запуске.

| Таблица | Описание |
|---------|---------|
| `employees` | Профили: email, имя, отдел, должность, зарплата, дата найма, менеджер |
| `leave_balances` | Остатки отпуска по годам |
| `salary_payments` | История выплат (аванс, зарплата) |
| `messages` | Личная переписка между сотрудниками |
| `employee_status` | Онлайн-статус: `online` / `break` / `offline` |
| `hr_appeals` | Обращения в HR: вопрос, категория, статус, ответ HR |
| `uploaded_documents` | Реестр загруженных документов |
| `goals` | Месячные цели сотрудников |
| `daily_selections` | Задачи, выбранные на конкретный день |
| `employee_points` | Накопленные баллы |
| `bonus_records` | Заявки в магазин наград |

---

## API

Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)  
ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

### Аутентификация

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/auth/login` | Получить JWT по email и паролю |
| `GET` | `/auth/me` | Профиль из токена |

### Сотрудник

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/me/data` | Отпуск + история выплат текущего пользователя |
| `PUT` | `/me/status` | Обновить онлайн-статус и текущую задачу |
| `GET` | `/employees/{email}` | Профиль сотрудника (RBAC) |

### Команда (manager/hr)

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/team/employees` | Список команды с профилями и статусами |
| `GET` | `/team/statuses` | Только онлайн-статусы (быстрый поллинг) |

### AI-чат

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/chat` | Вопрос ассистенту; возвращает `answer`, `sources`, `escalate` |
| `POST` | `/stt` | Голосовое сообщение (multipart/form-data) → текст |

### Цели и геймификация

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/goals` | Месячные цели (фильтры: month, year, employee_email) |
| `POST` | `/goals` | Создать цель (manager/hr) |
| `PUT` | `/goals/{id}` | Обновить цель |
| `DELETE` | `/goals/{id}` | Удалить цель |
| `POST` | `/goals/suggest-points` | AI-предложение баллов за набор целей |
| `GET` | `/goals/daily` | Задачи на конкретный день |
| `POST` | `/goals/daily` | Выбрать задачи на день |
| `PATCH` | `/goals/daily/{id}/complete` | Отметить задачу выполненной |
| `PATCH` | `/goals/daily/{id}/uncomplete` | Снять отметку |
| `POST` | `/goals/daily/finish` | Завершить рабочий день |
| `DELETE` | `/goals/daily/reset` | Сбросить день (для тестирования) |
| `GET` | `/gamification/stats` | Баллы, стрик, уровень |
| `GET` | `/gamification/bonus-records` | Заявки в магазин наград |
| `PATCH` | `/gamification/bonus-records/{id}/review` | HR подтверждает/отклоняет заявку |
| `POST` | `/gamification/close-month` | Закрыть месяц и подвести итоги |

### Мессенджер

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/messages/contacts` | Контакты с превью последнего сообщения |
| `GET` | `/messages?with_email=` | Диалог с пользователем (последние 100) |
| `POST` | `/messages` | Отправить сообщение |

### Обращения в HR

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/appeals` | Создать обращение |
| `GET` | `/appeals` | Список обращений (employee — свои, hr — все) |
| `PATCH` | `/appeals/{id}/resolve` | HR отвечает и закрывает тикет |
| `PATCH` | `/appeals/{id}/assign` | HR назначает ответственного |

### Документы

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/documents/upload` | Загрузить PDF/DOCX/XLSX (hr/manager) |
| `GET` | `/documents` | Список документов |
| `GET` | `/documents/{id}/view` | Просмотр документа в браузере |
| `GET` | `/documents/{id}/file` | Скачать файл |
| `DELETE` | `/documents/{id}` | Удалить документ |
| `GET` | `/health` | Проверка работоспособности сервера |

---

## Деплой

### Сборка и публикация фронтенда

```bash
cd frontend
npm run build
scp -r dist root@168.222.142.182:/root/Lit/backend/
```

FastAPI отдаёт `dist/index.html` для всех SPA-маршрутов через `StaticFiles`.

### Обновление бэкенда на сервере

```bash
ssh root@168.222.142.182
cd /root/Lit
git pull origin main
# перезапустить uvicorn (через systemd или tmux)
```

### Git workflow

```bash
git add .
git commit -m "feat: описание"
git pull origin main --rebase   # подтянуть изменения коллег
git push origin main
```

---

## Дизайн-система

Tailwind переопределён в `tailwind.config.js` с корпоративными токенами:

| Токен | Hex | Назначение |
|-------|-----|-----------|
| `slate-950` | `#001221` | Основной фон (Deep Ashy Blue) |
| `slate-900` | `#0F1221` | Вторичный фон (Dark Void Blue) |
| `green-500` | `#6AB216` | CTA-кнопки (Tech Green) |
| `brand.danger` | `#DC143C` | Ошибки (Crimson) |
| `brand.light` | `#F4F5F0` | Светлая тема (Cloud Dancer) |

Использовать только классы Tailwind — никаких произвольных hex в JSX.

**Компоненты:**
- `Card` — стандартная тёмная карточка
- `GlassCard` — карточка с `backdrop-blur-3xl` и градиентной рамкой (glass-морфизм)
- `Mascot` — AI-маскот с 5 состояниями: `idle`, `thinking`, `success`, `empty`, `error`
- `Button` — `variant="primary"` (зелёный CTA) и `variant="secondary"` (прозрачный)
