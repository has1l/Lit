"""
Индексация ПВТР в SQLite FTS5 + ChromaDB (семантический поиск).

Запуск:
  cd /Users/rodion/Desktop/LIT
  python3 backend/ingest.py
"""

import re
import shutil
import sqlite3
from pathlib import Path

import docx as python_docx

DB_PATH       = Path(__file__).parent / "hr.db"
CHROMA_PATH   = Path(__file__).parent / "chroma_db"
EMBED_MODEL   = "paraphrase-multilingual-MiniLM-L12-v2"
CHUNK_SIZE    = 500
CHUNK_OVERLAP = 100

DOCS = [
    {
        "path":     Path("/Users/rodion/Downloads/Telegram Desktop/ПВТР от 07.03.2025 №07.03.2025-1 (2).docx"),
        "title":    "Правила внутреннего трудового распорядка",
        "audience": "all",
    },
    {
        "path":     Path("/Users/rodion/Downloads/Telegram Desktop/ПВТР от 07.03.2025 №07.03.2025-1.docx"),
        "title":    "Правила внутреннего трудового распорядка (ред. 1)",
        "audience": "all",
    },
]

HEADING_STYLES = {
    "heading 1", "heading 2", "heading 3",
    "заголовок 1", "заголовок 2", "заголовок 3",
}


def parse_docx(path: Path) -> list[dict]:
    doc = python_docx.Document(str(path))
    sections, heading, lines = [], "Общие положения", []

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        style = (para.style.name or "").lower()
        is_h  = style in HEADING_STYLES or bool(re.match(r"^(Статья|Раздел|Глава)\s+\d+", text))
        if is_h:
            if lines:
                sections.append({"heading": heading, "text": "\n".join(lines).strip()})
                lines = []
            heading = text[:120]
        else:
            lines.append(text)

    if lines:
        sections.append({"heading": heading, "text": "\n".join(lines).strip()})

    return [s for s in sections if len(s["text"]) > 60]


def make_chunks(text: str) -> list[str]:
    if len(text) <= CHUNK_SIZE:
        return [text]
    chunks, start = [], 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        split_at = text.rfind(". ", start + CHUNK_OVERLAP, end)
        if split_at == -1:
            split_at = text.rfind("\n", start + CHUNK_OVERLAP, end)
        if split_at == -1:
            split_at = text.rfind("; ", start + CHUNK_OVERLAP, end)
        if split_at == -1:
            split_at = text.rfind(" ", start + CHUNK_OVERLAP, end)
        if split_at == -1:
            split_at = end

        chunks.append(text[start:split_at + 1].strip())
        start = split_at + 1
    return [c for c in chunks if len(c) > 60]


def ingest_fts5(conn: sqlite3.Connection, all_chunks: list[dict]) -> None:
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS documents_fts")
    cur.execute("""
        CREATE VIRTUAL TABLE documents_fts USING fts5(
            content,
            title,
            section,
            source,
            audience,
            tokenize = 'unicode61'
        )
    """)
    for c in all_chunks:
        cur.execute(
            "INSERT INTO documents_fts(content, title, section, source, audience) VALUES (?,?,?,?,?)",
            (c["content"], c["title"], c["section"], c["source"], c["audience"]),
        )
    conn.commit()
    print(f"[FTS5] {len(all_chunks)} чанков сохранено.", flush=True)


def ingest_chromadb(all_chunks: list[dict]) -> None:
    import chromadb
    from sentence_transformers import SentenceTransformer

    print(f"[CHROMA] Загрузка модели {EMBED_MODEL}…", flush=True)
    model = SentenceTransformer(EMBED_MODEL)

    if CHROMA_PATH.exists():
        shutil.rmtree(CHROMA_PATH)
    client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    collection = client.create_collection(
        name="hr_documents",
        metadata={"hnsw:space": "cosine"},
    )

    texts = [c["content"] for c in all_chunks]
    print(f"[CHROMA] Создание эмбеддингов для {len(texts)} чанков…", flush=True)
    embeddings = model.encode(texts, show_progress_bar=True, batch_size=32)

    collection.add(
        ids=[str(i) for i in range(len(all_chunks))],
        documents=texts,
        embeddings=embeddings.tolist(),
        metadatas=[
            {
                "title":    c["title"],
                "section":  c["section"],
                "source":   c["source"],
                "audience": c["audience"],
            }
            for c in all_chunks
        ],
    )
    print(f"[CHROMA] {len(all_chunks)} векторов сохранено в {CHROMA_PATH}", flush=True)


def ingest_all() -> None:
    all_chunks: list[dict] = []

    for cfg in DOCS:
        path     = cfg["path"]
        title    = cfg["title"]
        audience = cfg["audience"]

        if not path.exists():
            print(f"[WARN] Файл не найден: {path}", flush=True)
            continue

        print(f"[PARSE] {path.name} …", flush=True)
        sections = parse_docx(path)
        print(f"[PARSE] Секций: {len(sections)}", flush=True)

        for si, sec in enumerate(sections):
            chunks = make_chunks(sec["text"])
            for chunk in chunks:
                enriched = f"[{title} — {sec['heading']}]\n{chunk}"
                all_chunks.append({
                    "content":  enriched,
                    "title":    title,
                    "section":  sec["heading"],
                    "source":   path.name,
                    "audience": audience,
                })
            print(f"  [{si+1}/{len(sections)}] {sec['heading'][:60]} → {len(chunks)} чанков", flush=True)

        print(f"[OK] «{title}»\n", flush=True)

    if not all_chunks:
        print("[ERROR] Нет чанков — проверьте пути к файлам.", flush=True)
        return

    print(f"[TOTAL] {len(all_chunks)} чанков\n", flush=True)

    conn = sqlite3.connect(DB_PATH)
    ingest_fts5(conn, all_chunks)
    conn.close()

    ingest_chromadb(all_chunks)

    print(f"\n[DONE] Индексация завершена.", flush=True)


if __name__ == "__main__":
    ingest_all()
