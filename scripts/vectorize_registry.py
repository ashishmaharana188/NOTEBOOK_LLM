import logging
import os
import sqlite3
import threading

from scripts.db_manager import db as db_manager
from scripts.vectorize import get_embeddings_batch

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIBRARY_DB_PATH = os.path.join(BASE_DIR, "data", "library.db")
STOP_SIGNAL_FILE = os.path.join(BASE_DIR, "data", "stop_vectorization.signal")
REGISTRY_TABLE_NAME = "registry_vectors"

# Registry rows stay in manageable outer chunks for DB work, but each chunk is
# embedded in a single high-throughput GPU encode call.
BATCH_SIZE = 64
RUN_LOCK = threading.Lock()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def fetch_all_registry_books():
    if not os.path.exists(LIBRARY_DB_PATH):
        return []

    conn = sqlite3.connect(LIBRARY_DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute(
        "SELECT lid, title, author, description, group_tag, year, rating, source FROM library_inventory WHERE description IS NOT NULL AND description != ''"
    )
    rows = c.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _stop_requested():
    return os.path.exists(STOP_SIGNAL_FILE)


def _clear_stop_signal():
    if os.path.exists(STOP_SIGNAL_FILE):
        os.remove(STOP_SIGNAL_FILE)


def vectorize_registry(progress_callback=None):
    if not RUN_LOCK.acquire(blocking=False):
        logger.warning("Vectorization already running.")
        return {"status": "busy", "message": "Vectorization already running."}

    logger.info("Starting Registry Vectorization...")

    def emit_progress(processed_count, total_count, phase="vectorizing"):
        if progress_callback:
            progress_callback(
                {
                    "phase": phase,
                    "processed": processed_count,
                    "total": total_count,
                    "percent": int((processed_count / max(total_count, 1)) * 100)
                    if total_count
                    else 0,
                }
            )

    try:
        _clear_stop_signal()

        if not os.path.exists(LIBRARY_DB_PATH):
            logger.error(f"Library DB not found at {LIBRARY_DB_PATH}")
            return {"status": "error", "message": "Library DB missing"}

        books = fetch_all_registry_books()
        total_books = len(books)
        logger.info(f"Found {total_books} books to vectorize.")
        emit_progress(0, total_books, "starting")

        processed = 0

        if REGISTRY_TABLE_NAME in db_manager.db.table_names():
            db_manager.db.drop_table(REGISTRY_TABLE_NAME)

        for i in range(0, total_books, BATCH_SIZE):
            if _stop_requested():
                logger.warning("Vectorization stopped by user.")
                _clear_stop_signal()
                return {"status": "stopped", "processed": processed}

            batch = books[i : i + BATCH_SIZE]
            texts_to_embed = []
            batch_data = []

            for book in batch:
                if _stop_requested():
                    logger.warning("Vectorization stopped by user.")
                    _clear_stop_signal()
                    return {"status": "stopped", "processed": processed}

                try:
                    raw_year = book.get("year")
                    year_val = (
                        str(int(raw_year))
                        if raw_year and str(raw_year).isdigit()
                        else "0"
                    )

                    text = f"Title: {book['title']}. Author: {book['author']}."
                    if year_val != "0":
                        text += f" Year: {year_val}."
                    if book["group_tag"]:
                        text += f" Genre: {book['group_tag']}."
                    if book["description"]:
                        text += f" Summary: {book['description'][:1000]}"

                    texts_to_embed.append(text)
                    batch_data.append(
                        {
                            "title": book["title"] or "Unknown",
                            "author": book["author"] or "Unknown",
                            "year": year_val,
                            "group_tag": book["group_tag"] or "",
                            "source_type": "registry",
                            "book_id": str(book["lid"]),
                            "filename": book["source"] or "registry",
                            "chunk_id": f"reg_{book['lid']}",
                            "text": text,
                            "chapter": "Unknown Chapter",
                            "processed_filename": "registry",
                        }
                    )
                except Exception:
                    pass

            if not texts_to_embed:
                continue

            batch_start = processed
            vectors = get_embeddings_batch(
                texts_to_embed,
                progress_callback=lambda done, total: emit_progress(
                    batch_start if done <= 0 else batch_start + total,
                    total_books,
                    "vectorizing",
                ),
            )
            if _stop_requested():
                logger.warning("Vectorization stopped by user.")
                _clear_stop_signal()
                return {"status": "stopped", "processed": processed}

            for j, vec in enumerate(vectors):
                batch_data[j]["vector"] = (
                    vec.tolist() if hasattr(vec, "tolist") else vec
                )

            db_manager.add_vectors(batch_data, table_name=REGISTRY_TABLE_NAME)
            processed += len(batch)
            emit_progress(processed, total_books, "saving")
            logger.info(f"Processed {processed}/{total_books} registry items...")

        logger.info("Registry Vectorization Complete.")
        emit_progress(total_books, total_books, "complete")
        return {"status": "complete", "processed": processed}
    finally:
        RUN_LOCK.release()


def stop_vectorization():
    with open(STOP_SIGNAL_FILE, "w", encoding="utf-8") as f:
        f.write("STOP")
    return {"status": "stopping"}


if __name__ == "__main__":
    vectorize_registry()
