"""
Агент HR-ассистента — надёжный pipeline для локальных моделей.

Архитектура:
  1. Intent detection — ключевые слова определяют нужные инструменты
  2. Tool execution  — RAG (Chroma) + SQL (SQLite с RLS)
  3. Quick answer    — детерминистический ответ для частых сценариев (минуя LLM)
  4. LLM synthesis   — модель пересказывает факты для свободных вопросов

Почему не ReAct: qwen2.5-coder:7b — coding-модель, не следует сложным
инструкциям с форматом Action/Observation. Pipeline + детерминистические
шорткаты надёжнее: для KPI-сценариев (остаток отпуска, ближайшая выплата)
ответ идёт напрямую из БД и галлюцинации невозможны.

RBAC:
  employee → только свои данные
  manager  → данные своего отдела
  hr       → без ограничений
"""

import asyncio
import re
import sqlite3
from pathlib import Path
from typing import Any

import httpx
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama

from database import get_connection

# ── Векторный поиск (ChromaDB + sentence-transformers) ───────────────────────

CHROMA_PATH = Path(__file__).parent / "chroma_db"
EMBED_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"
VECTOR_THRESHOLD = 0.70  # cosine distance: ниже = релевантнее

_embed_model = None
_chroma_coll = None


def _get_embed_model():
    global _embed_model
    if _embed_model is None:
        from sentence_transformers import SentenceTransformer
        _embed_model = SentenceTransformer(EMBED_MODEL)
    return _embed_model


def _get_chroma():
    global _chroma_coll
    if _chroma_coll is None:
        if not CHROMA_PATH.exists():
            return None
        try:
            import chromadb
            client = chromadb.PersistentClient(path=str(CHROMA_PATH))
            _chroma_coll = client.get_collection("hr_documents")
        except Exception as e:
            print(f"[CHROMA] Не удалось открыть коллекцию: {e}")
            return None
    return _chroma_coll

# ── Конфигурация ──────────────────────────────────────────────────────────────

OLLAMA_BASE_URL = "http://168.222.142.182:11434"
OLLAMA_MODEL    = "qwen2.5-coder:7b"

_AUDIENCE_BY_ROLE = {
    "employee": ["all"],
    "manager":  ["all", "manager"],
    "hr":       ["all", "manager", "hr"],
}

_PVTR_TITLE = "Правила внутреннего трудового распорядка"

_DB_KEYWORDS = {
    "отпуск", "отпуска", "vacation", "дней", "остаток", "баланс",
    "зарплат", "оклад", "salary", "стаж", "hire", "дата",
    "выплат", "выплата", "аванс", "получк", "получу", "оплат",
    "когда", "ближайш", "следующ",
}

_PAYMENT_TYPE_RU = {"advance": "аванс", "salary": "зарплата"}
_MONTH_RU = [
    "", "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
]

# Темы, которых заведомо нет в ПВТР — очищаем контекст до LLM,
# чтобы модель сказала «нет информации», а не галлюцинировала
_OUT_OF_SCOPE = [
    "дмс", "полис", "страховк",
    "декрет",
    "командировк",
    "пенсион",
]


# ── RAG: поиск по документам ─────────────────────────────────────────────────

# Слова-интенты из вопросов пользователя, которых нет в тексте документов.
# Без этого списка фильтр specific_words убивает результаты:
# «расскажи про поощрения» → specific_words = ['расскажи', 'поощрения']
# → AND-фильтр требует «расскажи» в тексте ПВТР → 0 результатов.
_INTENT_STOP_WORDS = {
    "расскажи", "расскажите", "объясни", "объясните", "покажи", "покажите",
    "подскажи", "подскажите", "напиши", "напишите", "помоги", "помогите",
    "скажи", "скажите", "опиши", "опишите", "уточни", "уточните",
    "поясни", "поясните", "выясни", "выясните", "расскаж", "подскаж",
    "хочу", "знать", "нужно", "можно", "какие", "каких", "каким",
    "какой", "какая", "какое", "какую", "которые", "который",
    "которая", "которое", "которую", "пожалуйста", "будьте",
    "добры", "привет", "здравствуйте", "спасибо",
    "интересует", "интересно", "вопрос", "скольк",
}


def _search_documents(query: str, user_role: str) -> tuple[str, list[str]]:
    """Семантический поиск через ChromaDB; при недоступности — FTS5 fallback."""
    allowed = _AUDIENCE_BY_ROLE.get(user_role, ["all"])
    coll = _get_chroma()

    if coll is not None:
        try:
            model = _get_embed_model()
            query_vec = model.encode([query])[0].tolist()
            raw = coll.query(
                query_embeddings=[query_vec],
                n_results=10,
                where={"audience": {"$in": allowed}},
                include=["documents", "metadatas", "distances"],
            )
            docs      = raw["documents"][0]
            metas     = raw["metadatas"][0]
            distances = raw["distances"][0]

            chunks = [
                (doc, meta, dist)
                for doc, meta, dist in zip(docs, metas, distances)
                if dist <= VECTOR_THRESHOLD
            ]
            chunks.sort(key=lambda x: x[2])

            if chunks:
                results, seen = [], []
                for doc, meta, _ in chunks[:3]:
                    section = meta["section"].strip()
                    title   = meta["title"].strip()
                    cite    = f"{section} «{title}»"
                    results.append(f"{doc}\n\n> Основание: {cite}")
                    label = f"Основание: {cite}"
                    if label not in seen:
                        seen.append(label)
                return "\n\n---\n\n".join(results), seen

        except Exception as e:
            print(f"[CHROMA] Ошибка поиска: {e}")

    # ── FTS5 fallback ─────────────────────────────────────────────────────────
    return _search_documents_fts(query, user_role)


def _search_documents_fts(query: str, user_role: str) -> tuple[str, list[str]]:
    """Полнотекстовый поиск по ПВТР через SQLite FTS5 (BM25).
    Возвращает (текст_для_llm, список_источников).
    """
    allowed = _AUDIENCE_BY_ROLE.get(user_role, ["all"])
    try:
        conn = get_connection()
        exists = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='documents_fts'"
        ).fetchone()
        if not exists:
            conn.close()
            return "", []

        words = [w for w in query.split() if len(w) > 2]
        if not words:
            conn.close()
            return "", []

        # FTS5: используем prefix-поиск (word*) для слов ≥ 4 букв,
        # чтобы покрыть русскую морфологию (поощрения → поощр* → поощряет).
        fts_terms = []
        for w in words:
            clean = re.sub(r"[^\w]", "", w)
            if not clean:
                continue
            if len(clean) >= 4:
                # Берём основу (≥4 буквы) и добавляем * для prefix match
                stem = clean[:max(4, len(clean) - 2)]
                fts_terms.append(f"{stem}*")
            else:
                fts_terms.append(f'"{clean}"')

        terms = " OR ".join(fts_terms)
        if not terms:
            conn.close()
            return "", []

        rows = conn.execute(
            "SELECT content, title, section, audience, rank FROM documents_fts "
            "WHERE documents_fts MATCH ? "
            "ORDER BY rank LIMIT 10",
            (terms,),
        ).fetchall()
        conn.close()
    except Exception as e:
        print(f"[FTS] Ошибка поиска: {e}")
        return "", []

    # Отбираем только разрешённые по роли
    allowed_rows = [r for r in rows if r["audience"] in allowed]
    if not allowed_rows:
        return "", []

    # Конкретные слова запроса (длиннее 5 букв, без интент-стоп-слов)
    # Зачищаем пунктуацию перед проверкой
    clean_words = [re.sub(r"[^\w]", "", w) for w in query.split()]
    specific_words = [
        w.lower() for w in clean_words
        if len(w) > 5 and w.lower() not in _INTENT_STOP_WORDS
    ]

    # Для проверки по содержимому используем основы слов (обрезаем окончания),
    # чтобы «охрана» → «охран» матчило «охраны», «охране», «охрану» и т.п.
    specific_stems = [sw[:max(4, len(sw) - 2)] for sw in specific_words]

    def _content_has_stem(content_lower: str, stem: str) -> bool:
        return stem in content_lower

    if specific_stems:
        # Сначала пробуем AND: все основы в чанке
        relevant = [
            r for r in allowed_rows
            if all(_content_has_stem(r["content"].lower(), st) for st in specific_stems)
        ]
        # Fallback: если AND не дал результатов — ANY (хотя бы одна основа)
        if not relevant:
            relevant = [
                r for r in allowed_rows
                if any(_content_has_stem(r["content"].lower(), st) for st in specific_stems)
            ]
    else:
        relevant = allowed_rows

    if not relevant:
        return "", []

    results = []
    seen_sections: list[str] = []
    for row in relevant[:3]:
        section = row["section"].strip()
        title   = row["title"].strip()
        cite    = f"{section} «{title}»"
        results.append(f"{row['content']}\n\n> Основание: {cite}")
        label = f"Основание: {cite}"
        if label not in seen_sections:
            seen_sections.append(label)

    return "\n\n---\n\n".join(results), seen_sections


# ── SQL с RBAC ────────────────────────────────────────────────────────────────

def _apply_rls(sql: str, user_email: str, user_role: str, user_department: str) -> str:
    """
    Оборачивает SELECT в CTE и фильтрует строки по роли.
    Контракт: каждый внутренний SELECT обязан возвращать колонки
    `employee_email` и `department` (можно через AS), иначе CTE упадёт.
    """
    if user_role == "hr":
        return sql
    if user_role == "employee":
        return (f"WITH _b AS ({sql}) SELECT * FROM _b "
                f"WHERE employee_email = '{user_email}'")
    if user_role == "manager":
        return (f"WITH _b AS ({sql}) SELECT * FROM _b "
                f"WHERE department = '{user_department}'")
    return sql


def _run_sql(sql: str, user_email: str, user_role: str, user_department: str) -> list[dict]:
    secured = _apply_rls(sql, user_email, user_role, user_department)
    try:
        conn = get_connection()
        cur  = conn.execute(secured)
        rows = [dict(row) for row in cur.fetchall()]
        conn.close()
        return rows
    except sqlite3.Error as e:
        print(f"[SQL] {e}: {secured[:200]}")
        return []


def _fetch_employee_facts(user_email: str, user_role: str, user_department: str) -> dict[str, Any]:
    """Собирает структурированные факты из БД для одного сотрудника (или его команды)."""
    facts: dict[str, Any] = {}

    # Профиль (employees.email → employee_email, department уже есть)
    profile_rows = _run_sql(
        "SELECT email AS employee_email, department, full_name, position, salary, hire_date "
        "FROM employees",
        user_email, user_role, user_department,
    )
    facts["profile"] = profile_rows[0] if profile_rows else None

    # Остаток отпуска — берём самый свежий доступный год
    leave_rows = _run_sql(
        "SELECT lb.employee_email, e.department, e.full_name, lb.year, "
        "lb.total_days, lb.used_days, lb.pending_days, "
        "(lb.total_days - lb.used_days - lb.pending_days) AS remaining_days "
        "FROM leave_balances lb JOIN employees e ON lb.employee_email = e.email "
        "ORDER BY lb.year DESC",
        user_email, user_role, user_department,
    )
    facts["leave"] = leave_rows[0] if leave_rows else None

    # Ближайшие плановые выплаты
    facts["salary_upcoming"] = _run_sql(
        "SELECT sp.employee_email, e.department, sp.payment_date, sp.payment_type, sp.amount "
        "FROM salary_payments sp JOIN employees e ON sp.employee_email = e.email "
        "WHERE sp.status = 'planned' AND sp.payment_date >= date('now') "
        "ORDER BY sp.payment_date ASC LIMIT 4",
        user_email, user_role, user_department,
    )

    # Последние фактические выплаты (история)
    facts["salary_recent"] = _run_sql(
        "SELECT sp.employee_email, e.department, sp.payment_date, sp.payment_type, sp.amount "
        "FROM salary_payments sp JOIN employees e ON sp.employee_email = e.email "
        "WHERE sp.status = 'paid' "
        "ORDER BY sp.payment_date DESC LIMIT 4",
        user_email, user_role, user_department,
    )

    return facts


def _format_date_ru(iso: str) -> str:
    """'2026-05-05' -> '5 мая 2026'."""
    try:
        y, m, d = iso.split("-")
        return f"{int(d)} {_MONTH_RU[int(m)]} {y}"
    except (ValueError, IndexError):
        return iso


def _format_amount(value: float) -> str:
    """90000 -> '90 000 ₽'."""
    return f"{int(value):,}".replace(",", " ") + " ₽"


def _format_facts_for_llm(facts: dict[str, Any]) -> str:
    """Превращает структурированные факты в человекочитаемый текст для контекста LLM."""
    blocks = []

    if facts.get("profile"):
        p = facts["profile"]
        blocks.append(
            f"ПРОФИЛЬ:\n"
            f"- ФИО: {p['full_name']}\n"
            f"- Отдел: {p['department']}\n"
            f"- Должность: {p['position']}\n"
            f"- Оклад: {_format_amount(p['salary'])}\n"
            f"- Дата приёма: {_format_date_ru(p['hire_date'])}"
        )

    if facts.get("leave"):
        l = facts["leave"]
        blocks.append(
            f"ОСТАТОК ОТПУСКА (год {l['year']}):\n"
            f"- Доступно к использованию: {l['remaining_days']} дней\n"
            f"- Всего за год: {l['total_days']} дней\n"
            f"- Уже использовано: {l['used_days']} дней\n"
            f"- В процессе оформления: {l['pending_days']} дней"
        )

    if facts.get("salary_upcoming"):
        lines = ["БЛИЖАЙШИЕ ПЛАНОВЫЕ ВЫПЛАТЫ:"]
        for r in facts["salary_upcoming"]:
            kind = _PAYMENT_TYPE_RU.get(r["payment_type"], r["payment_type"])
            lines.append(f"- {_format_date_ru(r['payment_date'])} — {kind}, {_format_amount(r['amount'])}")
        blocks.append("\n".join(lines))

    if facts.get("salary_recent"):
        lines = ["ПОСЛЕДНИЕ ФАКТИЧЕСКИЕ ВЫПЛАТЫ:"]
        for r in facts["salary_recent"]:
            kind = _PAYMENT_TYPE_RU.get(r["payment_type"], r["payment_type"])
            lines.append(f"- {_format_date_ru(r['payment_date'])} — {kind}, {_format_amount(r['amount'])}")
        blocks.append("\n".join(lines))

    return "\n\n".join(blocks)


# ── Детерминистические быстрые ответы для топ-сценариев ─────────────────────

def _try_quick_answer(message: str, facts: dict[str, Any], user_name: str) -> str | None:
    """
    Возвращает готовый ответ минуя LLM, если вопрос точно матчится на один из
    KPI-сценариев. Это убирает риск галлюцинаций для самых частых запросов.
    """
    msg = message.lower()
    leave   = facts.get("leave")
    upcoming = facts.get("salary_upcoming") or []

    # — Сколько дней отпуска / остаток отпуска
    leave_phrases = ["отпуск", "дней отпуск", "сколько отпуск", "остаток отпуск", "баланс отпуск"]
    if leave and any(p in msg for p in leave_phrases) and "перенос" not in msg and "оформ" not in msg:
        return (
            f"{user_name}, у вас осталось {leave['remaining_days']} календарных дней отпуска "
            f"в {leave['year']} году. Из {leave['total_days']} положенных за год "
            f"{leave['used_days']} уже использовано, {leave['pending_days']} — в процессе оформления.\n\n"
            f"> Основание: раздел «{_PVTR_TITLE}»"
        )

    # — Когда ближайшая зарплата / аванс / выплата
    salary_phrases = ["ближайш", "следующ", "когда зарплат", "когда аванс", "когда выплат", "следующая выплат"]
    if upcoming and any(p in msg for p in salary_phrases) and "отпуск" not in msg:
        first = upcoming[0]
        kind = _PAYMENT_TYPE_RU.get(first["payment_type"], first["payment_type"])
        lines = [
            f"{user_name}, ближайшая выплата — {kind} {_format_date_ru(first['payment_date'])}, "
            f"сумма {_format_amount(first['amount'])}."
        ]
        if len(upcoming) > 1:
            nxt = upcoming[1]
            nxt_kind = _PAYMENT_TYPE_RU.get(nxt["payment_type"], nxt["payment_type"])
            lines.append(
                f"Следом — {nxt_kind} {_format_date_ru(nxt['payment_date'])}, "
                f"{_format_amount(nxt['amount'])}."
            )
        lines.append(f"\n> Основание: раздел «{_PVTR_TITLE}»")
        return "\n".join(lines)

    # — Как оформить больничный / я заболел
    sick_leave_phrases = ["больничн", "больнич", "заболел", "болею", "болен ", "болеть", "нетрудоспособ"]
    if any(p in msg for p in sick_leave_phrases):
        return (
            f"{user_name}, при болезни вам нужно:\n"
            "1. В течение 1 рабочего дня сообщить непосредственному руководителю и кадровику об открытии листка временной нетрудоспособности.\n"
            "2. Не позднее 7 календарных дней после закрытия выслать номер электронного больничного на почту кадров.\n\n"
            f"> Основание: 4. Основные права и обязанности Работников «{_PVTR_TITLE}»"
        )

    return None


# ── Intent detection ──────────────────────────────────────────────────────────

def _is_out_of_scope(message: str) -> bool:
    """Тема заведомо отсутствует в ПВТР — не передавать контекст в LLM."""
    msg = message.lower()
    return any(term in msg for term in _OUT_OF_SCOPE)


def _context_covers_query(query: str, context: str) -> bool:
    """Хотя бы один специфический термин запроса должен присутствовать в контексте.
    Предотвращает галлюцинации, когда RAG возвращает вообще нерелевантный чанк.
    """
    q_clean = [re.sub(r"[^\w]", "", w) for w in query.split()]
    specific = [
        w.lower() for w in q_clean
        if len(w) > 4 and w.lower() not in _INTENT_STOP_WORDS
    ]
    if not specific:
        return True
    stems = [w[:max(4, len(w) - 2)] for w in specific]
    ctx_lower = context.lower()
    return any(s in ctx_lower for s in stems)


def _needs_db(message: str) -> bool:
    msg_lower = message.lower()
    return any(kw in msg_lower for kw in _DB_KEYWORDS)


# ── Синтез ответа через LLM ───────────────────────────────────────────────────

_ROLE_RU = {
    "employee": "Сотрудник",
    "manager":  "Руководитель",
    "hr":       "HR-специалист",
}

_SYSTEM = """Ты — корпоративный HR-ассистент компании 1221 Systems по имени «Техна».
Ты говоришь ТОЛЬКО на русском языке, кратко и по делу.
Обращайся к сотруднику по имени (первое слово из ФИО).

ЖЁСТКИЕ ПРАВИЛА:
1. Используй ТОЛЬКО факты из блока «Контекст» и «Данные сотрудника». НИКОГДА не придумывай даты, цифры, ФИО, суммы и названия разделов.
2. Если в контексте нет ответа на вопрос — скажи: «По этому вопросу информации в регламентах нет, обратитесь в HR-отдел». НЕ додумывай и НЕ отвечай по общим знаниям.
3. Сноску «> Основание:» ставь ТОЛЬКО если в блоке «Информация из HR-документов» есть текст. Название раздела и документа бери ДОСЛОВНО из строки «Основание:» в контексте — не меняй ни слова.
4. Числа и даты копируй из контекста буквально, без округлений и пересчётов.
5. НЕ подписывайся («С уважением», «HR-ассистент» и т.п.) — это чат, не письмо.
6. Руководители и HR могут видеть данные своей команды — учитывай это при ответе."""


async def _synthesize(
    message: str,
    context: str,
    user_name: str,
    user_role: str,
    user_department: str,
    facts: dict,
    history: list[dict],
) -> str:
    from langchain_core.messages import AIMessage

    llm = ChatOllama(
        base_url=OLLAMA_BASE_URL,
        model=OLLAMA_MODEL,
        temperature=0.1,
        num_predict=600,
        timeout=120,
    )

    # Карточка пользователя — всегда в начале контекста
    profile = facts.get("profile") or {}
    position  = profile.get("position", "")
    hire_date = profile.get("hire_date", "")

    user_card_lines = [
        f"Роль: {_ROLE_RU.get(user_role, user_role)}",
        f"Отдел: {user_department}",
    ]
    if position:
        user_card_lines.append(f"Должность: {position}")
    if hire_date:
        user_card_lines.append(f"Дата трудоустройства: {_format_date_ru(hire_date)}")

    user_card = "\n".join(user_card_lines)

    full_context = f"=== Сотрудник ===\nИмя: {user_name}\n{user_card}"
    if context.strip():
        full_context += f"\n\n{context}"
    else:
        full_context += "\n\nДанных в регламентах и базе не найдено."

    # Системное сообщение с контекстом
    system_with_ctx = f"{_SYSTEM}\n\n{full_context}"

    # Собираем цепочку сообщений: system → история → текущий вопрос
    lc_messages: list = [SystemMessage(content=system_with_ctx)]

    # Берём последние 6 пар (12 сообщений) — не раздуваем контекст
    for turn in history[-12:]:
        if turn["role"] == "user":
            lc_messages.append(HumanMessage(content=turn["text"]))
        else:
            lc_messages.append(AIMessage(content=turn["text"]))

    lc_messages.append(HumanMessage(content=message))

    for attempt in range(3):
        try:
            response = await llm.ainvoke(lc_messages)
            return response.content
        except (httpx.RemoteProtocolError, httpx.ReadTimeout, httpx.ConnectError):
            if attempt < 2:
                await asyncio.sleep(0.8 * (attempt + 1))
                continue
            raise


# ── Публичный интерфейс ───────────────────────────────────────────────────────

async def run_agent(
    user_email: str,
    user_role: str,
    user_name: str,
    user_department: str,
    message: str,
    history: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Pipeline:
      1. Собираем факты из БД (профиль, отпуск, выплаты)
      2. Пробуем детерминистический шорткат — если совпало с KPI-сценарием, отдаём сразу
      3. Иначе — RAG по документам + факты в контекст → LLM
    """
    facts: dict[str, Any] = {}
    if _needs_db(message):
        facts = _fetch_employee_facts(user_email, user_role, user_department)

    # 2. Детерминистический ответ для частых сценариев (без LLM = без галлюцинаций)
    quick = _try_quick_answer(message, facts, user_name)
    if quick:
        return {
            "answer":  quick,
            "sources": re.findall(r"Основание:[^\n]+", quick),
            "steps":   2,
        }

    # 3. Свободный вопрос — RAG + LLM
    context_parts = []
    doc_context, doc_sources = _search_documents(message, user_role)

    # Очищаем контекст если тема заведомо вне ПВТР или RAG вернул нерелевантный чанк
    if doc_context and (_is_out_of_scope(message) or not _context_covers_query(message, doc_context)):
        doc_context = ""
        doc_sources = []

    if doc_context:
        context_parts.append(f"=== Информация из HR-документов ===\n{doc_context}")
    if facts:
        formatted = _format_facts_for_llm(facts)
        if formatted:
            context_parts.append(f"=== Данные сотрудника из базы 1221 Systems ===\n{formatted}")

    context      = "\n\n".join(context_parts)
    final_answer = await _synthesize(
        message, context, user_name, user_role, user_department, facts,
        history or [],
    )
    # Используем реальные секции из FTS5, не парсим текст LLM
    sources = doc_sources if doc_sources else re.findall(r"Основание:[^\n]+", final_answer)
    steps   = 2 + (1 if facts else 0)

    return {"answer": final_answer, "sources": sources, "steps": steps}
