import sqlite3
import os
import hashlib
from datetime import datetime
import logging

# --- CONFIGURATION ---
CURRENT_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_SCRIPT_DIR)
DB_PATH = os.path.join(PROJECT_ROOT, "data", "library.db")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def generate_deterministic_id(title: str, author: str) -> str:
    """
    Generates an indestructible MD5 hash based on immutable book traits.
    If you delete a book and re-ingest it years later, it will generate the EXACT SAME ID,
    ensuring all nodes, echoes, and connections instantly self-heal.
    """
    clean_title = (
        str(title).lower().strip().replace(" ", "").replace("_", "").replace("-", "")
    )
    clean_author = str(author).lower().strip().replace(" ", "")
    raw_string = f"{clean_title}_{clean_author}"
    return f"lib_{hashlib.md5(raw_string.encode('utf-8')).hexdigest()[:16]}"


class LibraryRegistry:
    def __init__(self):
        self.db_path = DB_PATH
        self._init_db()

    def _init_db(self):
        """Initializes the centralized library database."""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()

        # Central Table: Library Inventory
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS library_inventory (
                lid TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                author TEXT,
                year INTEGER,
                description TEXT,
                rating REAL,
                rating_count INTEGER,
                source TEXT,
                file_path TEXT,
                group_tag TEXT,
                url TEXT,
                created_at DATETIME,
                updated_at DATETIME
            )
        """
        )

        # Schema Migrations: Add columns if missing
        try:
            c.execute("ALTER TABLE library_inventory ADD COLUMN group_tag TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            c.execute("ALTER TABLE library_inventory ADD COLUMN url TEXT")
        except sqlite3.OperationalError:
            pass

        # FTS Table for fast searching
        c.execute(
            """
            CREATE VIRTUAL TABLE IF NOT EXISTS library_fts USING fts5(
                lid,
                title,
                author,
                description
            )
        """
        )

        conn.commit()
        conn.close()

    def register_book(self, meta):
        """Smart Upsert Logic using Deterministic Identity."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        # 1. Standardize Inputs
        title = meta.get("title", "Unknown").strip()
        author = meta.get("author", "Unknown").strip()
        new_source = meta.get("source", "unknown")

        # 2. GENERATE DETERMINISTIC ID
        lid = generate_deterministic_id(title, author)

        # 3. Check Existence strictly by the Indestructible ID
        c.execute("SELECT * FROM library_inventory WHERE lid = ?", (lid,))
        row = c.fetchone()

        if row:
            # --- SMART MERGE (Self-Healing) ---
            current_data = dict(row)
            update_cols = []
            params = []

            # RULE A: File Path
            if meta.get("file_path") and not current_data.get("file_path"):
                update_cols.append("file_path = ?")
                params.append(meta["file_path"])

            # RULE B: Ratings
            new_rating = meta.get("rating", 0.0)
            current_rating = current_data.get("rating") or 0.0
            if new_rating > 0:
                if current_rating == 0 or new_source == "crawler":
                    update_cols.append("rating = ?")
                    params.append(new_rating)
                    if meta.get("rating_count"):
                        update_cols.append("rating_count = ?")
                        params.append(meta["rating_count"])

            # RULE C: Description (Trust the richer text)
            new_desc = meta.get("description", "")
            curr_desc = current_data.get("description") or ""
            if new_desc and (
                len(new_desc) > len(curr_desc) or "Imported from" in curr_desc
            ):
                update_cols.append("description = ?")
                params.append(new_desc)
                c.execute(
                    "UPDATE library_fts SET description = ? WHERE lid = ?",
                    (new_desc, lid),
                )

            # RULE D: Year
            if meta.get("year") and not current_data.get("year"):
                update_cols.append("year = ?")
                params.append(meta["year"])

            # RULE E: Group Tag (Genre)
            new_tag = meta.get("group_tag", "")
            curr_tag = current_data.get("group_tag") or ""
            if new_tag and (not curr_tag or new_source == "crawler"):
                update_cols.append("group_tag = ?")
                params.append(new_tag)

            # RULE F: URL
            new_url = meta.get("url", "")
            curr_url = current_data.get("url") or ""
            if new_url and not curr_url:
                update_cols.append("url = ?")
                params.append(new_url)

            # Execute Update
            if update_cols:
                update_cols.append("updated_at = ?")
                params.append(datetime.now())
                params.append(lid)

                sql = f"UPDATE library_inventory SET {', '.join(update_cols)} WHERE lid = ?"
                c.execute(sql, params)

            logger.info(f"🔄 Smart Merged existing book: {title} [{lid}]")

        else:
            # --- INSERT NEW ---
            c.execute(
                """
                INSERT INTO library_inventory 
                (lid, title, author, year, description, rating, rating_count, source, file_path, group_tag, url, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    lid,
                    title,
                    author,
                    meta.get("year", 0),
                    meta.get("description", ""),
                    meta.get("rating", 0.0),
                    meta.get("rating_count", 0),
                    new_source,
                    meta.get("file_path", None),
                    meta.get("group_tag", ""),
                    meta.get("url", ""),
                    datetime.now(),
                    datetime.now(),
                ),
            )

            # Sync to FTS
            c.execute(
                "INSERT INTO library_fts (lid, title, author, description) VALUES (?, ?, ?, ?)",
                (lid, title, author, meta.get("description", "")),
            )
            logger.info(f"✅ Registered new book: {title} [{lid}]")

        conn.commit()
        conn.close()
        return lid

    def get_book(self, lid):
        """Returns full book metadata by LID."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM library_inventory WHERE lid = ?", (lid,))
        row = c.fetchone()
        conn.close()
        return dict(row) if row else {}


def search_books(self, query, limit=50, group_tag=None):
    """Searches the centralized library using FTS5 with optional genre filtering."""
    conn = sqlite3.connect(self.db_path)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    try:
        clean_q = query.replace('"', "").replace("'", "")
        where_clause = "library_fts MATCH ?"
        params = [f'"{clean_q}"']

        if group_tag:
            where_clause += " AND group_tag LIKE ?"
            params.append(f"%{group_tag}%")

        sql = f"""
                SELECT i.* FROM library_inventory i
                JOIN library_fts f ON i.lid = f.lid
                WHERE {where_clause}
                ORDER BY i.rating DESC, i.rating_count DESC
                LIMIT ?
            """
        final_params = tuple(params) + (limit,)
        c.execute(sql, final_params)
        rows = c.fetchall()
    except Exception:
        sql_fallback = "SELECT * FROM library_inventory WHERE title LIKE ? ORDER BY rating DESC LIMIT ?"
        c.execute(sql_fallback, (f"%{query}%", limit))
        rows = c.fetchall()

    conn.close()
    return [dict(r) for r in rows]


# Apply monkeypatch for search_books to match existing structure
LibraryRegistry.search_books = search_books
registry = LibraryRegistry()
