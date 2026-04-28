"""
Парсинг и индексация документов в ChromaDB.
Поддержка: PDF, DOCX, XLSX/XLS.
"""

import io
import re
import uuid
from pathlib import Path
from typing import Optional


def _chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """Делит текст на чанки с перекрытием."""
    text = re.sub(r'\s+', ' ', text).strip()
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks


def parse_pdf(file_bytes: bytes) -> str:
    import pypdf
    reader = pypdf.PdfReader(io.BytesIO(file_bytes))
    pages = [page.extract_text() or '' for page in reader.pages]
    return '\n'.join(pages)


def parse_docx(file_bytes: bytes) -> str:
    from docx import Document
    doc = Document(io.BytesIO(file_bytes))
    return '\n'.join(p.text for p in doc.paragraphs if p.text.strip())


def parse_xlsx(file_bytes: bytes) -> str:
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(file_bytes), data_only=True)
    lines = []
    for ws in wb.worksheets:
        for row in ws.iter_rows(values_only=True):
            row_text = ' | '.join(str(c) for c in row if c is not None)
            if row_text.strip():
                lines.append(row_text)
    return '\n'.join(lines)


def ingest_document(
    filename: str,
    file_bytes: bytes,
    uploader_email: str,
    audience: str = 'all',
) -> int:
    """
    Парсит файл, делит на чанки и добавляет в ChromaDB.
    Возвращает количество добавленных чанков.
    Бросает ValueError если формат не поддерживается.
    """
    ext = Path(filename).suffix.lower()

    if ext == '.pdf':
        text = parse_pdf(file_bytes)
    elif ext in ('.docx', '.doc'):
        text = parse_docx(file_bytes)
    elif ext in ('.xlsx', '.xls'):
        text = parse_xlsx(file_bytes)
    else:
        raise ValueError(f"Неподдерживаемый формат: {ext}")

    if not text.strip():
        raise ValueError("Документ пустой или не удалось извлечь текст")

    chunks = _chunk_text(text)
    if not chunks:
        raise ValueError("Не удалось разбить текст на чанки")

    # Добавляем в ChromaDB
    chroma_path = Path(__file__).parent / "chroma_db"
    chroma_path.mkdir(exist_ok=True)

    import chromadb
    client = chromadb.PersistentClient(path=str(chroma_path))

    try:
        coll = client.get_collection("hr_documents")
    except Exception:
        coll = client.create_collection("hr_documents")

    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")

    doc_title = Path(filename).stem
    doc_section = f"Документ: {doc_title}"

    ids, docs, embeddings, metas = [], [], [], []
    for i, chunk in enumerate(chunks):
        chunk_id = f"{uuid.uuid4().hex}_{i}"
        emb = model.encode([chunk])[0].tolist()
        ids.append(chunk_id)
        docs.append(chunk)
        embeddings.append(emb)
        metas.append({
            "title":        doc_title,
            "section":      doc_section,
            "audience":     audience,
            "source_file":  filename,
            "chunk_index":  i,
            "uploader":     uploader_email,
        })

    coll.add(ids=ids, documents=docs, embeddings=embeddings, metadatas=metas)
    return len(chunks)
