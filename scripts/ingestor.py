import hashlib
import json
import logging
import os

from scripts.chunker import chunk_text
from scripts.db_manager import db
from scripts.hydrator import hydrator
from scripts.library_registry import registry
from scripts.parsers import read_any_file_metadata
from scripts.vectorize import get_embeddings_batch

BASE_DIR = os.getcwd()
PROCESSED_DIR = os.path.join(BASE_DIR, "data", "processed")
METADATA_DIR = os.path.join(BASE_DIR, "data", "metadata")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

if not os.path.exists(METADATA_DIR):
    os.makedirs(METADATA_DIR)
if not os.path.exists(PROCESSED_DIR):
    os.makedirs(PROCESSED_DIR)


class IngestCancelledError(RuntimeError):
    pass


def _check_cancel(cancel_event):
    if cancel_event and cancel_event.is_set():
        raise IngestCancelledError("Ingestion cancelled.")


def _emit_progress(progress_callback, phase, percent, extra=None):
    if progress_callback:
        payload = {
            "phase": phase,
            "percent": max(0, min(100, int(percent))),
        }
        if extra:
            payload.update(extra)
        progress_callback(payload)


def process_book_task(file_path, metadata, cancel_event=None, progress_callback=None):
    try:
        raw_filename = os.path.basename(file_path)
        _check_cancel(cancel_event)
        logger.info(f"Processing raw file: {raw_filename}")
        _emit_progress(progress_callback, "reading", 5, {"filename": raw_filename})

        extracted_data = read_any_file_metadata(file_path)
        _check_cancel(cancel_event)

        if not extracted_data or not extracted_data.get("text", "").strip():
            logger.warning(f"Skipping empty or unreadable file: {raw_filename}")
            return False

        clean_meta = hydrator.hydrate_metadata(raw_filename, extracted_data)
        _check_cancel(cancel_event)
        _emit_progress(progress_callback, "hydrating", 15)
        final_path = hydrator.standardize_file_on_disk(
            file_path, clean_meta["title"], clean_meta["author"]
        )
        final_filename = os.path.basename(final_path)

        reg_entry = {
            "title": clean_meta["title"],
            "author": clean_meta["author"],
            "year": clean_meta.get("year", 0),
            "file_path": final_path,
            "source": "ingestor",
            "description": f"Imported from {raw_filename}",
        }
        book_id = registry.register_book(reg_entry)

        enriched_book = registry.get_book(book_id)
        group_tag = enriched_book.get("group_tag", "")

        raw_text = extracted_data["text"]
        toc = extracted_data.get("toc", [])
        _check_cancel(cancel_event)

        clean_txt_filename = f"clean_{final_filename}.txt"
        clean_txt_path = os.path.join(PROCESSED_DIR, clean_txt_filename)
        with open(clean_txt_path, "w", encoding="utf-8") as f:
            f.write(raw_text)

        meta_json_path = os.path.join(METADATA_DIR, f"meta_{final_filename}.json")
        with open(meta_json_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "lid": book_id,
                    "title": clean_meta["title"],
                    "author": clean_meta["author"],
                    "group_tag": group_tag,
                    "toc": toc,
                    "source_path": final_path,
                },
                f,
                indent=2,
            )

        chunks = chunk_text(raw_text, chunk_size=800)
        _check_cancel(cancel_event)
        logger.info(f"Created {len(chunks)} chunks for vectorization.")
        _emit_progress(
            progress_callback,
            "chunking",
            30,
            {"chunk_total": len(chunks)},
        )

        if not chunks:
            _emit_progress(progress_callback, "complete", 100, {"chunk_total": 0})
            return True

        try:
            _emit_progress(
                progress_callback,
                "vectorizing",
                35,
                {"embedded_chunks": 0, "chunk_total": len(chunks)},
            )
            vectors = get_embeddings_batch(
                chunks,
                cancel_event=cancel_event,
                progress_callback=lambda done, total: _emit_progress(
                    progress_callback,
                    "vectorizing",
                    35 if done <= 0 else 85,
                    {
                        "embedded_chunks": done,
                        "chunk_total": total,
                    },
                ),
            )
        except RuntimeError as error:
            if str(error) == "INGEST_CANCELLED":
                raise IngestCancelledError("Ingestion cancelled.") from error
            raise

        valid_toc = [t for t in toc if "char_index" in t]
        valid_toc.sort(key=lambda x: x["char_index"])

        lance_meta_list = []
        for i, chunk in enumerate(chunks):
            char_idx = raw_text.find(chunk[:100])

            chapter_title = "Unknown Chapter"
            if valid_toc and char_idx != -1:
                for t in valid_toc:
                    if t["char_index"] <= char_idx:
                        chapter_title = t.get("label", "Unknown Chapter")
                    else:
                        break

            if isinstance(chapter_title, (list, tuple)):
                chapter_title = str(chapter_title[0]).strip()
            else:
                chapter_title = str(chapter_title).strip()

            chunk_ref_str = f"{book_id}_{chunk}"
            chunk_ref = hashlib.sha1(chunk_ref_str.encode("utf-8")).hexdigest()

            lance_meta_list.append(
                {
                    "title": clean_meta["title"],
                    "author": clean_meta["author"],
                    "year": str(clean_meta["year"]),
                    "filename": final_filename,
                    "processed_filename": clean_txt_filename,
                    "book_id": book_id,
                    "group_tag": group_tag,
                    "source_type": "local",
                    "chunk_id": str(i),
                    "chunk_ref": chunk_ref,
                    "chapter": chapter_title,
                }
            )

        _check_cancel(cancel_event)
        _emit_progress(progress_callback, "saving", 92, {"chunk_total": len(chunks)})
        db.add(vectors, chunks, lance_meta_list)

        _emit_progress(progress_callback, "complete", 100, {"chunk_total": len(chunks)})
        logger.info(f"Ingestion complete: {clean_meta['title']} (Tag: {group_tag})")
        return True

    except IngestCancelledError:
        logger.info(f"Ingestion cancelled for {file_path}")
        raise
    except Exception as error:
        logger.error(f"Ingestion failed for {file_path}: {error}")
        raise error
