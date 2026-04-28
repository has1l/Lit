"""
HR-агент: детерминированный сбор контекста + LLM-синтез.

Pipeline:
  1. Fuzzy-поиск упомянутого сотрудника в БД (любые падежи)
  2. Pre-fetch данных: свой профиль/отпуск/выплаты + коллега (если упомянут)
  3. RAG-поиск по ПВТР (ChromaDB → FTS fallback)
  4. LLM синтезирует ответ из готового контекста (без tool calling)

RBAC применяется при сборе данных — LLM не видит запрещённые поля.
"""

import asyncio
import re
from datetime import date
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import httpx
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_ollama import ChatOllama

from data_policy import can_access, denial_message
from database import get_connection

# ── ChromaDB ──────────────────────────────────────────────────────────────────

CHROMA_PATH      = Path(__file__).parent / "chroma_db"
EMBED_MODEL      = "paraphrase-multilingual-MiniLM-L12-v2"
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
            print(f"[CHROMA] {e}")
            return None
    return _chroma_coll


# ── Конфигурация ──────────────────────────────────────────────────────────────

OLLAMA_BASE_URL = "http://168.222.142.182:11434"
OLLAMA_MODEL    = "llama3.1:8b"

_AUDIENCE_BY_ROLE = {
    "employee": ["all"],
    "manager":  ["all", "manager"],
    "hr":       ["all", "manager", "hr"],
}

_PAYMENT_TYPE_RU = {"advance": "аванс", "salary": "зарплата"}

_MONTH_RU = [
    "", "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
]

_ROLE_RU = {
    "employee": "Сотрудник",
    "manager":  "Руководитель",
    "hr":       "HR-специалист",
}

# ── Утилиты ───────────────────────────────────────────────────────────────────

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
        total = (today.year - hd.year) * 12 + (today.month - hd.month)
        y, m = total // 12, total % 12
        parts = []
        if y:
            parts.append(f"{y} {'год' if y == 1 else 'лет' if y >= 5 else 'года'}")
        if m:
            parts.append(f"{m} {'месяц' if m == 1 else 'месяца' if m < 5 else 'месяцев'}")
        return " ".join(parts) if parts else "меньше месяца"
    except Exception:
        return ""


def _format_amount(v: float) -> str:
    return f"{int(v):,}".replace(",", " ") + " ₽"


def _gender_ru(g: str) -> str:
    return {"male": "мужской", "female": "женский"}.get(g or "", "")


# ── Fuzzy-поиск сотрудника ────────────────────────────────────────────────────

def _name_score(query_words: list[str], name_tokens: list[str], threshold: float = 0.75) -> float:
    total, matched = 0.0, 0
    for tok in name_tokens:
        best = max((SequenceMatcher(None, w, tok).ratio() for w in query_words), default=0.0)
        if best >= threshold:
            total += best
            matched += 1
    return total * (1 + 0.3 * (matched - 1)) if matched else 0.0


def _find_mentioned_employee(message: str, exclude_email: str) -> dict | None:
    """Ищет имя любого сотрудника в сообщении. Возвращает row или None."""
    words = [w for w in re.findall(r"[а-яёa-z]+", message.lower()) if len(w) >= 3]
    if not words:
        return None
    try:
        conn = get_connection()
        rows = conn.execute("SELECT email, full_name FROM employees").fetchall()
        conn.close()
    except Exception:
        return None

    best, best_score = None, 0.0
    for row in rows:
        if row["email"] == exclude_email:
            continue
        tokens = [t.lower() for t in row["full_name"].split() if len(t) >= 3]
        score = _name_score(words, tokens)
        if score > best_score:
            best_score = score
            best = row
    return best if best and best_score > 0 else None


# ── Сбор данных из БД ─────────────────────────────────────────────────────────

def _get_profile_block(email: str, user_email: str, user_role: str, label: str = "ПРОФИЛЬ") -> str:
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT full_name, department, position, salary, hire_date, birth_date, gender, phone "
            "FROM employees WHERE email=?", (email,)
        ).fetchone()
        conn.close()
    except Exception:
        return ""
    if not row:
        return ""
    p = dict(row)
    lines = [
        f"{label}:",
        f"- ФИО: {p['full_name']}",
        f"- Отдел: {p['department']}",
        f"- Должность: {p['position']}",
    ]
    if p.get("birth_date"):
        age = _calc_age(p["birth_date"])
        lines.append(f"- Дата рождения: {_format_date_ru(p['birth_date'])}" + (f" ({age} лет)" if age else ""))
    if p.get("gender"):
        lines.append(f"- Пол: {_gender_ru(p['gender'])}")
    if p.get("hire_date"):
        lines.append(f"- Принят: {_format_date_ru(p['hire_date'])}, стаж: {_calc_tenure(p['hire_date'])}")
    if p.get("phone"):
        lines.append(f"- Телефон: {p['phone']}")
    if can_access(user_role, user_email, email, "salary") and p.get("salary"):
        lines.append(f"- Оклад: {_format_amount(p['salary'])}")
    return "\n".join(lines)


def _get_leave_block(email: str, user_email: str, user_role: str) -> str:
    if not can_access(user_role, user_email, email, "leave_balances"):
        return "ОТПУСК: информация конфиденциальна."
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT year, total_days, used_days, pending_days, "
            "(total_days - used_days - pending_days) AS remaining_days "
            "FROM leave_balances WHERE employee_email=? ORDER BY year DESC LIMIT 2",
            (email,),
        ).fetchall()
        conn.close()
    except Exception:
        return ""
    if not rows:
        return ""
    lines = ["ОСТАТОК ОТПУСКА:"]
    for r in rows:
        lines.append(
            f"- {r['year']} год: осталось {r['remaining_days']} дн. "
            f"(всего {r['total_days']}, использовано {r['used_days']}, в оформлении {r['pending_days']})"
        )
    return "\n".join(lines)


def _get_payments_block(email: str, user_email: str, user_role: str) -> str:
    if not can_access(user_role, user_email, email, "salary_payments"):
        return "ВЫПЛАТЫ: информация конфиденциальна."
    try:
        conn = get_connection()
        upcoming = conn.execute(
            "SELECT payment_date, payment_type, amount FROM salary_payments "
            "WHERE employee_email=? AND status='planned' AND payment_date >= date('now') "
            "ORDER BY payment_date ASC LIMIT 4", (email,)
        ).fetchall()
        recent = conn.execute(
            "SELECT payment_date, payment_type, amount FROM salary_payments "
            "WHERE employee_email=? AND status='paid' "
            "ORDER BY payment_date DESC LIMIT 4", (email,)
        ).fetchall()
        conn.close()
    except Exception:
        return ""
    lines = []
    if upcoming:
        lines.append("БЛИЖАЙШИЕ ВЫПЛАТЫ:")
        for r in upcoming:
            kind = _PAYMENT_TYPE_RU.get(r["payment_type"], r["payment_type"])
            lines.append(f"- {_format_date_ru(r['payment_date'])} — {kind}, {_format_amount(r['amount'])}")
    if recent:
        lines.append("ПОСЛЕДНИЕ ВЫПЛАТЫ:")
        for r in recent:
            kind = _PAYMENT_TYPE_RU.get(r["payment_type"], r["payment_type"])
            lines.append(f"- {_format_date_ru(r['payment_date'])} — {kind}, {_format_amount(r['amount'])}")
    return "\n".join(lines)


# ── RAG: поиск по ПВТР ───────────────────────────────────────────────────────

def _search_docs(query: str, user_role: str) -> tuple[str, list[str]]:
    allowed = _AUDIENCE_BY_ROLE.get(user_role, ["all"])
    coll = _get_chroma()

    if coll is not None:
        try:
            vec = _get_embed_model().encode([query])[0].tolist()
            raw = coll.query(
                query_embeddings=[vec], n_results=5,
                where={"audience": {"$in": allowed}},
                include=["documents", "metadatas", "distances"],
            )
            chunks = [
                (doc, meta, dist)
                for doc, meta, dist in zip(raw["documents"][0], raw["metadatas"][0], raw["distances"][0])
                if dist <= VECTOR_THRESHOLD
            ]
            chunks.sort(key=lambda x: x[2])
            if chunks:
                parts, sources = [], []
                for doc, meta, _ in chunks[:3]:
                    cite = f"{meta['section'].strip()} «{meta['title'].strip()}»"
                    parts.append(f"{doc}\n\nОснование: {cite}")
                    src = f"Основание: {cite}"
                    if src not in sources:
                        sources.append(src)
                return "\n\n---\n\n".join(parts), sources
        except Exception as e:
            print(f"[CHROMA] {e}")

    # FTS fallback
    try:
        conn = get_connection()
        if not conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='documents_fts'"
        ).fetchone():
            conn.close()
            return "", []
        words = [w for w in query.split() if len(w) > 2]
        terms = " OR ".join(f"{w[:max(4, len(w)-2)]}*" for w in words if w)
        if not terms:
            conn.close()
            return "", []
        rows = conn.execute(
            "SELECT content, title, section, audience FROM documents_fts "
            "WHERE documents_fts MATCH ? ORDER BY rank LIMIT 5", (terms,)
        ).fetchall()
        conn.close()
        relevant = [r for r in rows if r["audience"] in allowed]
        if not relevant:
            return "", []
        parts, sources = [], []
        for r in relevant[:3]:
            cite = f"{r['section'].strip()} «{r['title'].strip()}»"
            parts.append(f"{r['content']}\n\nОснование: {cite}")
            src = f"Основание: {cite}"
            if src not in sources:
                sources.append(src)
        return "\n\n---\n\n".join(parts), sources
    except Exception as e:
        return "", []


# ── Системный промпт ──────────────────────────────────────────────────────────

_SYSTEM = """\
Ты — корпоративный HR-ассистент компании по имени «Техна». Говоришь ТОЛЬКО на русском языке.
Обращайся к сотруднику по имени (первое слово из ФИО).

ЖЁСТКИЕ ПРАВИЛА:
1. Отвечай ТОЛЬКО на основе блоков «Данные сотрудника», «Данные о коллеге» и «HR-документы» из контекста.
2. НИКОГДА не придумывай цифры, даты, имена, суммы — только то что есть в контексте.
3. Сноску «> Основание:» ставь ТОЛЬКО если в блоке «HR-документы» есть строка «Основание:». Копируй дословно.
4. Если в контексте нет ответа — скажи: «По этому вопросу информации нет, обратитесь в HR-отдел».
5. Если написано «информация конфиденциальна» — так и отвечай, без догадок.
6. Не подписывайся — это чат, не письмо.
7. Адаптируй язык под должность:
   - Developer / Engineer / QA → технический язык (PR, спринт, деплой)
   - Уборщик / Охранник / Водитель → простой бытовой язык
   - HR → кадровая терминология
   - Остальные → нейтральный деловой язык
"""


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
    1. Собираем весь нужный контекст детерминированно:
       - профиль / отпуск / выплаты текущего пользователя
       - данные упомянутого коллеги (fuzzy по имени)
       - релевантные чанки ПВТР (RAG)
    2. Передаём контекст LLM — она только синтезирует ответ.
    """
    context_parts: list[str] = []

    # — Данные текущего пользователя —
    self_blocks: list[str] = []
    self_blocks.append(_get_profile_block(user_email, user_email, user_role, "ВАШ ПРОФИЛЬ"))
    self_blocks.append(_get_leave_block(user_email, user_email, user_role))
    self_blocks.append(_get_payments_block(user_email, user_email, user_role))
    self_ctx = "\n\n".join(b for b in self_blocks if b)
    if self_ctx:
        context_parts.append(f"=== Данные сотрудника ===\n{self_ctx}")

    # — Данные упомянутого коллеги —
    colleague = _find_mentioned_employee(message, user_email)
    if colleague:
        col_blocks: list[str] = []
        col_blocks.append(_get_profile_block(colleague["email"], user_email, user_role, "ПРОФИЛЬ КОЛЛЕГИ"))
        col_blocks.append(_get_leave_block(colleague["email"], user_email, user_role))
        col_blocks.append(_get_payments_block(colleague["email"], user_email, user_role))
        col_ctx = "\n\n".join(b for b in col_blocks if b)
        if col_ctx:
            context_parts.append(f"=== Данные о коллеге ({colleague['full_name']}) ===\n{col_ctx}")

    # — ПВТР / HR-документы —
    doc_text, doc_sources = _search_docs(message, user_role)
    if doc_text:
        context_parts.append(f"=== HR-документы ===\n{doc_text}")

    context = "\n\n".join(context_parts)

    # — Системный промпт с контекстом —
    user_card = (
        f"Имя: {user_name} | email: {user_email} | "
        f"роль: {_ROLE_RU.get(user_role, user_role)} | отдел: {user_department}"
    )
    system_content = f"{_SYSTEM}\n\n=== Текущий пользователь ===\n{user_card}"
    if context:
        system_content += f"\n\n{context}"
    else:
        system_content += "\n\nКонтекст не найден."

    # — LLM —
    llm = ChatOllama(
        base_url=OLLAMA_BASE_URL,
        model=OLLAMA_MODEL,
        temperature=0.1,
        num_predict=600,
        timeout=120,
    )

    lc_messages: list = [SystemMessage(content=system_content)]
    for turn in (history or [])[-12:]:
        if turn["role"] == "user":
            lc_messages.append(HumanMessage(content=turn["text"]))
        else:
            lc_messages.append(AIMessage(content=turn["text"]))
    lc_messages.append(HumanMessage(content=message))

    for attempt in range(3):
        try:
            response = await llm.ainvoke(lc_messages)
            final_answer = response.content
            break
        except (httpx.RemoteProtocolError, httpx.ReadTimeout, httpx.ConnectError):
            if attempt < 2:
                await asyncio.sleep(0.8 * (attempt + 1))
                continue
            raise

    # Если LLM не вставила источник — добавляем программно
    if doc_sources and "Основание:" not in final_answer:
        final_answer += "\n\n" + "\n".join(f"> {s}" for s in doc_sources)

    sources = doc_sources if doc_sources else re.findall(r"Основание:[^\n]+", final_answer)
    escalate = any(p in final_answer.lower() for p in [
        "нет информации", "обратитесь в hr", "обратитесь в отдел",
        "не могу ответить", "данных нет", "нет данных", "информации нет",
    ])

    return {
        "answer":   final_answer,
        "sources":  sources,
        "steps":    2 + (1 if doc_text else 0) + (1 if colleague else 0),
        "escalate": escalate,
    }
