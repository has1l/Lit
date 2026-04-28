"""
Агент HR-ассистента — надёжный pipeline для локальных моделей.

Архитектура:
  1. Subject detection  — о ком вопрос: о себе, коллеге, команде, документах
  2. Data policy        — применяем политику доступа к данным
  3. Fact fetching      — SQL → структурированные факты (только разрешённые)
  4. Quick answer       — детерминистический ответ для частых сценариев (без LLM)
  5. RAG + LLM          — ChromaDB top-3 + синтез через Ollama с полным контекстом

RBAC:
  employee → только свои данные + публичные поля коллег
  manager  → все данные своего отдела
  hr       → без ограничений
"""

import asyncio
import re
import sqlite3
from datetime import date, datetime
from pathlib import Path
from typing import Any

import httpx
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama

from data_policy import can_access, denial_message, PUBLIC_FIELDS
from database import get_connection

# ── Векторный поиск (ChromaDB + sentence-transformers) ───────────────────────

CHROMA_PATH = Path(__file__).parent / "chroma_db"
EMBED_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"
VECTOR_THRESHOLD = 0.70

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
    "когда", "ближайш", "следующ", "день рожден", "др ", "родился",
    "возраст", "лет ", "сколько лет",
}

_PAYMENT_TYPE_RU = {"advance": "аванс", "salary": "зарплата"}
_MONTH_RU = [
    "", "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
]
_MONTH_NOM = [
    "", "январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
]

_OUT_OF_SCOPE = [
    "дмс", "полис", "страховк",
    "командировк",
    "пенсион",
]

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


# ── Утилиты дат ──────────────────────────────────────────────────────────────

def _format_date_ru(iso: str) -> str:
    try:
        y, m, d = iso.split("-")
        return f"{int(d)} {_MONTH_RU[int(m)]} {y}"
    except (ValueError, IndexError):
        return iso


def _calc_age(birth_date: str) -> int | None:
    try:
        bd = date.fromisoformat(birth_date)
        today = date.today()
        return today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day))
    except Exception:
        return None


def _calc_tenure(hire_date: str) -> str:
    try:
        hd = date.fromisoformat(hire_date)
        today = date.today()
        total_months = (today.year - hd.year) * 12 + (today.month - hd.month)
        years = total_months // 12
        months = total_months % 12
        parts = []
        if years:
            parts.append(f"{years} {'год' if years == 1 else 'лет' if years >= 5 else 'года'}")
        if months:
            parts.append(f"{months} {'месяц' if months == 1 else 'месяца' if months < 5 else 'месяцев'}")
        return " ".join(parts) if parts else "меньше месяца"
    except Exception:
        return ""


def _format_amount(value: float) -> str:
    return f"{int(value):,}".replace(",", " ") + " ₽"


def _gender_ru(gender: str) -> str:
    return {"male": "мужской", "female": "женский"}.get(gender or "", "")


# ── Subject detection ─────────────────────────────────────────────────────────

def _detect_subject(message: str, user_email: str) -> dict:
    """
    Определяет о ком вопрос.
    Возвращает: {'type': 'self'|'other'|'team'|'document',
                 'subject_email': str|None,
                 'field': str|None}
    """
    msg = message.lower()

    # Ключевые слова "о себе"
    self_words = ["у меня", "мне ", "мой ", "моя ", "моё ", "моих ", "я ", "мне?", "меня"]
    if any(w in msg for w in self_words):
        return {"type": "self", "subject_email": user_email, "field": _detect_field(msg)}

    # Ищем имя коллеги в тексте (сравниваем с БД)
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT email, full_name FROM employees WHERE email != ?", (user_email,)
        ).fetchall()
        conn.close()
        for row in rows:
            first_name = row["full_name"].split()[0].lower()
            if first_name in msg or row["full_name"].lower() in msg:
                return {
                    "type": "other",
                    "subject_email": row["email"],
                    "subject_name": row["full_name"],
                    "field": _detect_field(msg),
                }
    except Exception:
        pass

    # Вопросы о команде/отделе
    team_words = ["команд", "отдел", "сотрудник", "коллег", "все ", "всех "]
    if any(w in msg for w in team_words):
        return {"type": "team", "subject_email": None, "field": _detect_field(msg)}

    return {"type": "self", "subject_email": user_email, "field": _detect_field(msg)}


def _detect_field(msg: str) -> str | None:
    if any(w in msg for w in ["зарплат", "оклад", "платят", "получает", "доход"]):
        return "salary"
    if any(w in msg for w in ["отпуск", "vacation"]):
        return "leave_balances"
    if any(w in msg for w in ["день рожден", "дни рожден", "др ", "родился", "родилась", "возраст", "лет "]):
        return "birth_date"
    return None


# ── RAG: поиск по документам ─────────────────────────────────────────────────

def _search_documents(query: str, user_role: str) -> tuple[str, list[str]]:
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

    return _search_documents_fts(query, user_role)


def _search_documents_fts(query: str, user_role: str) -> tuple[str, list[str]]:
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

        fts_terms = []
        for w in words:
            clean = re.sub(r"[^\w]", "", w)
            if not clean:
                continue
            if len(clean) >= 4:
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
            "WHERE documents_fts MATCH ? ORDER BY rank LIMIT 10",
            (terms,),
        ).fetchall()
        conn.close()
    except Exception as e:
        print(f"[FTS] Ошибка поиска: {e}")
        return "", []

    allowed_rows = [r for r in rows if r["audience"] in allowed]
    if not allowed_rows:
        return "", []

    clean_words = [re.sub(r"[^\w]", "", w) for w in query.split()]
    specific_words = [
        w.lower() for w in clean_words
        if len(w) > 5 and w.lower() not in _INTENT_STOP_WORDS
    ]
    specific_stems = [sw[:max(4, len(sw) - 2)] for sw in specific_words]

    def _has_stem(content_lower, stem):
        return stem in content_lower

    if specific_stems:
        relevant = [
            r for r in allowed_rows
            if all(_has_stem(r["content"].lower(), st) for st in specific_stems)
        ]
        if not relevant:
            relevant = [
                r for r in allowed_rows
                if any(_has_stem(r["content"].lower(), st) for st in specific_stems)
            ]
    else:
        relevant = allowed_rows

    if not relevant:
        return "", []

    results, seen = [], []
    for row in relevant[:3]:
        section = row["section"].strip()
        title   = row["title"].strip()
        cite    = f"{section} «{title}»"
        results.append(f"{row['content']}\n\n> Основание: {cite}")
        label = f"Основание: {cite}"
        if label not in seen:
            seen.append(label)

    return "\n\n---\n\n".join(results), seen


# ── SQL с RBAC ────────────────────────────────────────────────────────────────

def _apply_rls(sql: str, user_email: str, user_role: str, user_department: str) -> str:
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


def _fetch_employee_facts(
    user_email: str,
    user_role: str,
    user_department: str,
    subject_email: str | None = None,
) -> dict[str, Any]:
    """
    Собирает факты из БД.
    subject_email — о ком запрашиваем (если None — о самом пользователе).
    Применяет data_policy перед включением приватных полей.
    """
    target = subject_email or user_email
    is_self = (target == user_email)
    facts: dict[str, Any] = {}

    # Профиль
    try:
        conn = get_connection()
        profile_row = conn.execute(
            "SELECT email, full_name, department, position, salary, "
            "hire_date, birth_date, gender, phone FROM employees WHERE email=?",
            (target,),
        ).fetchone()
        conn.close()
    except Exception:
        profile_row = None

    if profile_row:
        p = dict(profile_row)
        # Для приватных полей применяем политику
        profile_out = {
            "employee_email": p["email"],
            "department":     p["department"],
            "full_name":      p["full_name"],
            "position":       p["position"],
            "hire_date":      p["hire_date"],
            "birth_date":     p.get("birth_date"),
            "gender":         p.get("gender"),
        }
        # Зарплата — приватная
        if can_access(user_role, user_email, target, "salary"):
            profile_out["salary"] = p["salary"]
        facts["profile"] = profile_out
    else:
        facts["profile"] = None

    # Отпуск — приватный
    if can_access(user_role, user_email, target, "leave_balances"):
        leave_rows = _run_sql(
            "SELECT lb.employee_email, e.department, e.full_name, lb.year, "
            "lb.total_days, lb.used_days, lb.pending_days, "
            "(lb.total_days - lb.used_days - lb.pending_days) AS remaining_days "
            "FROM leave_balances lb JOIN employees e ON lb.employee_email = e.email "
            f"WHERE lb.employee_email = '{target}' "
            "ORDER BY lb.year DESC",
            user_email, user_role, user_department,
        )
        facts["leave"] = leave_rows[0] if leave_rows else None
    else:
        facts["leave"] = None
        facts["leave_denied"] = True

    # Выплаты — приватные
    if can_access(user_role, user_email, target, "salary_payments"):
        facts["salary_upcoming"] = _run_sql(
            "SELECT sp.employee_email, e.department, sp.payment_date, sp.payment_type, sp.amount "
            "FROM salary_payments sp JOIN employees e ON sp.employee_email = e.email "
            f"WHERE sp.status = 'planned' AND sp.payment_date >= date('now') "
            f"AND sp.employee_email = '{target}' "
            "ORDER BY sp.payment_date ASC LIMIT 4",
            user_email, user_role, user_department,
        )
        facts["salary_recent"] = _run_sql(
            "SELECT sp.employee_email, e.department, sp.payment_date, sp.payment_type, sp.amount "
            "FROM salary_payments sp JOIN employees e ON sp.employee_email = e.email "
            f"WHERE sp.status = 'paid' AND sp.employee_email = '{target}' "
            "ORDER BY sp.payment_date DESC LIMIT 4",
            user_email, user_role, user_department,
        )
    else:
        facts["salary_upcoming"] = []
        facts["salary_recent"] = []
        facts["salary_denied"] = True

    return facts


def _format_facts_for_llm(facts: dict[str, Any], is_about_other: bool = False) -> str:
    blocks = []

    if facts.get("profile"):
        p = facts["profile"]
        age = _calc_age(p["birth_date"]) if p.get("birth_date") else None
        tenure = _calc_tenure(p["hire_date"]) if p.get("hire_date") else ""
        gender_str = _gender_ru(p.get("gender", ""))

        profile_lines = [
            f"ПРОФИЛЬ{' СОТРУДНИКА' if is_about_other else ''}:",
            f"- ФИО: {p['full_name']}",
            f"- Отдел: {p['department']}",
            f"- Должность: {p['position']}",
        ]
        if p.get("birth_date"):
            bd_str = _format_date_ru(p["birth_date"])
            age_str = f" ({age} лет)" if age else ""
            profile_lines.append(f"- Дата рождения: {bd_str}{age_str}")
        if gender_str:
            profile_lines.append(f"- Пол: {gender_str}")
        if p.get("hire_date"):
            profile_lines.append(f"- Дата приёма: {_format_date_ru(p['hire_date'])}")
        if tenure:
            profile_lines.append(f"- Стаж: {tenure}")
        if p.get("salary"):
            profile_lines.append(f"- Оклад: {_format_amount(p['salary'])}")
        blocks.append("\n".join(profile_lines))

    if facts.get("leave_denied"):
        blocks.append("ОТПУСК: информация конфиденциальна для данного запроса.")
    elif facts.get("leave"):
        l = facts["leave"]
        blocks.append(
            f"ОСТАТОК ОТПУСКА (год {l['year']}):\n"
            f"- Доступно: {l['remaining_days']} дней\n"
            f"- Всего за год: {l['total_days']} дней\n"
            f"- Использовано: {l['used_days']} дней\n"
            f"- В оформлении: {l['pending_days']} дней"
        )

    if facts.get("salary_denied"):
        blocks.append("ЗАРПЛАТА/ВЫПЛАТЫ: информация конфиденциальна для данного запроса.")
    else:
        if facts.get("salary_upcoming"):
            lines = ["БЛИЖАЙШИЕ ВЫПЛАТЫ:"]
            for r in facts["salary_upcoming"]:
                kind = _PAYMENT_TYPE_RU.get(r["payment_type"], r["payment_type"])
                lines.append(f"- {_format_date_ru(r['payment_date'])} — {kind}, {_format_amount(r['amount'])}")
            blocks.append("\n".join(lines))

        if facts.get("salary_recent"):
            lines = ["ПОСЛЕДНИЕ ВЫПЛАТЫ:"]
            for r in facts["salary_recent"]:
                kind = _PAYMENT_TYPE_RU.get(r["payment_type"], r["payment_type"])
                lines.append(f"- {_format_date_ru(r['payment_date'])} — {kind}, {_format_amount(r['amount'])}")
            blocks.append("\n".join(lines))

    return "\n\n".join(blocks)


# ── Детерминистические быстрые ответы ────────────────────────────────────────

def _try_quick_answer(message: str, facts: dict[str, Any], user_name: str) -> str | None:
    msg = message.lower()
    leave    = facts.get("leave")
    upcoming = facts.get("salary_upcoming") or []

    leave_phrases = ["отпуск", "дней отпуск", "сколько отпуск", "остаток отпуск", "баланс отпуск"]
    if leave and any(p in msg for p in leave_phrases) and "перенос" not in msg and "оформ" not in msg:
        return (
            f"{user_name}, у вас осталось {leave['remaining_days']} календарных дней отпуска "
            f"в {leave['year']} году. Из {leave['total_days']} положенных "
            f"{leave['used_days']} уже использовано, {leave['pending_days']} — в оформлении.\n\n"
            f"> Основание: раздел «{_PVTR_TITLE}»"
        )

    salary_phrases = ["ближайш", "следующ", "когда зарплат", "когда аванс", "когда выплат"]
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

    sick_leave_phrases = ["больничн", "больнич", "заболел", "болею", "болен ", "болеть", "нетрудоспособ"]
    if any(p in msg for p in sick_leave_phrases):
        return (
            f"{user_name}, при болезни вам нужно:\n"
            "1. В течение 1 рабочего дня сообщить руководителю и кадровику об открытии больничного листа.\n"
            "2. Не позднее 7 календарных дней после закрытия выслать номер электронного больничного на почту кадров.\n\n"
            f"> Основание: 4. Основные права и обязанности Работников «{_PVTR_TITLE}»"
        )

    return None


# ── Intent detection ──────────────────────────────────────────────────────────

def _is_out_of_scope(message: str) -> bool:
    msg = message.lower()
    return any(term in msg for term in _OUT_OF_SCOPE)


def _context_covers_query(query: str, context: str) -> bool:
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


def _should_escalate(answer: str) -> bool:
    """Возвращает True если ответ означает 'не знаю' — нужна эскалация в HR."""
    escalation_phrases = [
        "нет информации", "обратитесь в hr", "обратитесь в отдел",
        "не могу ответить", "данных нет", "нет данных",
        "информации в регламентах нет", "не найдена в базе",
        "свяжитесь с hr", "уточните у hr",
    ]
    ans_lower = answer.lower()
    return any(p in ans_lower for p in escalation_phrases)


# ── Системный промпт ──────────────────────────────────────────────────────────

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
2. Если в контексте нет ответа — скажи: «По этому вопросу информации в регламентах нет, обратитесь в HR-отдел». НЕ додумывай.
3. Сноску «> Основание:» ставь ТОЛЬКО если в блоке «Информация из HR-документов» есть текст. Название раздела бери ДОСЛОВНО из строки «Основание:».
4. Числа и даты копируй из контекста буквально, без пересчётов.
5. НЕ подписывайся — это чат, не письмо.
6. Руководители и HR могут видеть данные своей команды — учитывай это при ответе.
7. Если в блоке данных написано «информация конфиденциальна» — ответь: «Данная информация является конфиденциальной.» Никаких догадок и расчётов.
8. Учитывай должность собеседника и выбирай язык:
   - Junior/Middle/Senior Developer, Engineer, QA: технический язык (PR, спринт, деплой, тикет) — норма
   - HR-специалист: кадровая терминология
   - Уборщик, Охранник, Водитель, Рабочий: простой бытовой язык, без профессионального жаргона
   - Дизайнер, Бухгалтер, Менеджер: нейтральный деловой язык
9. Если вопрос выходит за рамки твоих знаний — честно скажи об этом и предложи создать обращение в HR-отдел."""


# ── Синтез через LLM ──────────────────────────────────────────────────────────

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

    profile = facts.get("profile") or {}
    position  = profile.get("position", "")
    hire_date = profile.get("hire_date", "")
    birth_date = profile.get("birth_date", "")
    gender     = profile.get("gender", "")

    age = _calc_age(birth_date) if birth_date else None
    tenure = _calc_tenure(hire_date) if hire_date else ""

    user_card_lines = [
        f"Роль: {_ROLE_RU.get(user_role, user_role)}",
        f"Отдел: {user_department}",
    ]
    if position:
        user_card_lines.append(f"Должность: {position}")
    if age:
        user_card_lines.append(f"Возраст: {age} лет (род. {_format_date_ru(birth_date)})")
    if gender:
        user_card_lines.append(f"Пол: {_gender_ru(gender)}")
    if tenure:
        user_card_lines.append(f"Стаж: {tenure}")

    user_card = "\n".join(user_card_lines)

    full_context = f"=== Сотрудник ===\nИмя: {user_name}\n{user_card}"
    if context.strip():
        full_context += f"\n\n{context}"
    else:
        full_context += "\n\nДанных в регламентах и базе не найдено."

    system_with_ctx = f"{_SYSTEM}\n\n{full_context}"

    lc_messages: list = [SystemMessage(content=system_with_ctx)]
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
      1. Subject detection — о ком вопрос
      2. Data policy       — применяем ограничения доступа
      3. Факты из БД       — только разрешённые поля
      4. Quick answer      — детерминистический шорткат (без LLM)
      5. RAG + LLM         — свободные вопросы
    """
    # 1. Определяем субъект вопроса
    subject_info = _detect_subject(message, user_email)
    subject_email = subject_info.get("subject_email") or user_email
    is_about_other = (subject_email != user_email)

    # 2. Проверяем поле — если приватное и нет доступа, отвечаем сразу
    field = subject_info.get("field")
    if is_about_other and field in ("salary", "leave_balances", "salary_payments"):
        if not can_access(user_role, user_email, subject_email, field):
            return {
                "answer":   denial_message(),
                "sources":  [],
                "steps":    1,
                "escalate": False,
            }

    # 3. Собираем факты
    facts: dict[str, Any] = {}
    if _needs_db(message):
        facts = _fetch_employee_facts(user_email, user_role, user_department, subject_email)

    # 4. Детерминистический ответ (только для вопросов о себе)
    if not is_about_other:
        quick = _try_quick_answer(message, facts, user_name)
        if quick:
            return {
                "answer":  quick,
                "sources": re.findall(r"Основание:[^\n]+", quick),
                "steps":   2,
                "escalate": False,
            }

    # 5. RAG + LLM
    context_parts = []
    doc_context, doc_sources = _search_documents(message, user_role)

    if doc_context and (_is_out_of_scope(message) or not _context_covers_query(message, doc_context)):
        doc_context = ""
        doc_sources = []

    if doc_context:
        context_parts.append(f"=== Информация из HR-документов ===\n{doc_context}")
    if facts:
        formatted = _format_facts_for_llm(facts, is_about_other=is_about_other)
        if formatted:
            label = "=== Данные сотрудника ===" if not is_about_other else "=== Данные о коллеге ==="
            context_parts.append(f"{label}\n{formatted}")

    context      = "\n\n".join(context_parts)
    final_answer = await _synthesize(
        message, context, user_name, user_role, user_department, facts,
        history or [],
    )
    sources  = doc_sources if doc_sources else re.findall(r"Основание:[^\n]+", final_answer)
    escalate = _should_escalate(final_answer)
    steps    = 2 + (1 if facts else 0)

    return {"answer": final_answer, "sources": sources, "steps": steps, "escalate": escalate}
