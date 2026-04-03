import lancedb
import pyarrow as pa
import logging
import os
import sqlite3
import json
import uuid
from typing import Any


logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "cognition.lance")
LIBRARY_DB_PATH = os.path.join(BASE_DIR, "data", "library.db")


class DBManager:
    def __init__(self):
        os.makedirs(os.path.join(BASE_DIR, "data"), exist_ok=True)
        self.db = lancedb.connect(DB_PATH)

        # --- VECTOR STORAGE ---
        # Keep the LanceDB schema at 1024 dims for backward compatibility.
        # Smaller embedding models are zero-padded before persistence/search.
        self.schema = pa.schema(
            [
                pa.field("vector", pa.list_(pa.float32(), 1024)),
                pa.field("text", pa.string()),
                pa.field("filename", pa.string()),
                pa.field("title", pa.string()),
                pa.field("author", pa.string()),
                pa.field("year", pa.string()),
                pa.field("chunk_id", pa.string()),
                pa.field("chunk_ref", pa.string()),
                pa.field("source_type", pa.string()),
                pa.field("book_id", pa.string()),
                pa.field("group_tag", pa.string()),
                pa.field("chapter", pa.string()),  # <--- NEW CHAPTER FIELD
                pa.field("processed_filename", pa.string()),
            ]
        )

    def get_table(self, table_name="thoughts"):
        try:
            return self.db.open_table(table_name)
        except:
            return self.db.create_table(table_name, schema=self.schema)

    def add_vectors(self, data, table_name="thoughts"):
        if not data:
            return
        tbl = self.get_table(table_name)
        tbl.add(data)
        logger.info(f"💾 Added {len(data)} records to {table_name}")

    def add(self, vectors, chunks, metadata_list, table_name="thoughts", write_batch_size=256):
        total = len(metadata_list)
        if total == 0:
            return

        batch_size = max(1, int(write_batch_size or 256))
        for start in range(0, total, batch_size):
            end = min(start + batch_size, total)
            combined_data = []
            for i in range(start, end):
                vec = vectors[i]
                if hasattr(vec, "tolist"):
                    vec = vec.tolist()

                row = metadata_list[i].copy()
                row["vector"] = vec
                row["text"] = chunks[i]

                # Ensure required fields exist
                row.setdefault("year", "0")
                row.setdefault("group_tag", "")
                row.setdefault("source_type", "local")
                row.setdefault("chapter", "Unknown Chapter")
                row.setdefault("chunk_ref", "")

                combined_data.append(row)

            self.add_vectors(combined_data, table_name)

    def search(
        self,
        query_vec,
        limit=10,
        table_name="thoughts",
        author=None,
        year_min=None,
        group_tag=None,
    ):
        try:
            tbl = self.get_table(table_name)
            query = tbl.search(query_vec).limit(limit)

            where_clause = []
            if author:
                where_clause.append(f"author = '{author}'")
            if group_tag:
                where_clause.append(f"group_tag = '{group_tag}'")
            if year_min:
                where_clause.append(f"year >= '{year_min}'")

            if where_clause:
                query = query.where(" AND ".join(where_clause))

            return query.to_list()
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return []

    def get_all_books(self):
        try:
            tbl = self.get_table("thoughts")
            df = tbl.to_pandas()
            if df.empty:
                return []

            # --- V2: Ensure book_id (the LID) is strictly returned ---
            cols = ["filename", "title", "author", "source_type", "year", "book_id"]
            existing_cols = [c for c in cols if c in df.columns]

            unique_books = df.drop_duplicates(subset=["title"])[existing_cols]
            unique_books = unique_books.fillna("")
            records = unique_books.to_dict(orient="records")

            for r in records:
                if not r.get("filename"):
                    r["filename"] = r.get("title", "Unknown")

            return records
        except Exception as e:
            logger.error(f"Failed to get books: {e}")
            return []

    def delete_document(self, identifier):
        try:
            tbl = self.get_table("thoughts")
            tbl.delete(f"filename = '{identifier}' OR title = '{identifier}'")
            logger.info(f"🗑️ Deleted {identifier} from The Brain.")
        except Exception as e:
            logger.error(f"Failed to delete document: {e}")

    def get_surrounding_chunks(self, filename, chunk_id, window=4):
        """Fetches the N paragraphs before and after a specific chunk to stitch context."""
        try:
            tbl = self.get_table("thoughts")
            dummy_vec = [0.0] * 1024
            res = (
                tbl.search(dummy_vec)
                .where(f"filename = '{filename}'")
                .limit(10000)
                .to_list()
            )

            valid_res = [
                r
                for r in res
                if r.get("chunk_id") is not None and str(r.get("chunk_id")).isdigit()
            ]
            valid_res.sort(key=lambda x: int(x.get("chunk_id")))

            target_str = str(chunk_id)
            idx = next(
                (
                    i
                    for i, r in enumerate(valid_res)
                    if str(r.get("chunk_id")) == target_str
                ),
                -1,
            )

            if idx == -1:
                return []

            start = max(0, idx - window)
            end = min(len(valid_res), idx + window + 1)

            return [r.get("text", "") for r in valid_res[start:end]]
        except Exception as e:
            logger.error(f"Context fetch failed: {e}")
            return []


db = DBManager()


import json


class GraphDBManager:
    def __init__(self):
        self.conn = sqlite3.connect(LIBRARY_DB_PATH, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_tables()

    def _init_tables(self):
        """Creates the permanent memory structures for the Cognitive Graph."""
        c = self.conn.cursor()
        # --- USER NODES (Manual only in V2) ---
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS user_nodes (
                node_id TEXT PRIMARY KEY,
                label TEXT,
                node_type TEXT,
                description TEXT
            )
        """
        )

        # --- USER EDGES (Manual/Explicit only in V2) ---
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS user_edges (
                edge_id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id TEXT,
                target_id TEXT,
                edge_type TEXT,
                context_text TEXT,
                weight REAL DEFAULT 1.0,
                UNIQUE(source_id, target_id, edge_type)
            )
        """
        )

        # --- V2 ECHO CLUSTERS ---
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS echo_clusters (
                cluster_id TEXT PRIMARY KEY,
                library_id TEXT,
                book_id TEXT, -- Legacy display fallback
                is_active INTEGER DEFAULT 1,
                parent_cluster_id TEXT,
                source_echo_id TEXT,
                column_metadata TEXT DEFAULT '{}',
                archive_group_id TEXT,
                archive_group_title TEXT,
                cover_media TEXT,
                title TEXT,
                orbit_layout TEXT DEFAULT '[]', -- NEW: Master Layout Binder
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """
        )

        # MIGRATION: Add the deterministic Dual-Anchor library_id
        try:
            c.execute("ALTER TABLE echo_clusters ADD COLUMN library_id TEXT")
            logger.info("⚙️ Migrated echo_clusters to include library_id Dual-Anchor.")
        except sqlite3.OperationalError:
            pass

        try:
            c.execute("ALTER TABLE echo_clusters ADD COLUMN source_echo_id TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            c.execute(
                "ALTER TABLE echo_clusters ADD COLUMN column_metadata TEXT DEFAULT '{}'"
            )
        except sqlite3.OperationalError:
            pass

        # MIGRATION: Drop old user_echoes if it lacks the new cluster_id column
        c.execute("PRAGMA table_info(user_echoes)")
        columns = [row[1] for row in c.fetchall()]
        if "cluster_id" not in columns and len(columns) > 0:
            logger.info("⚙️ Migrating user_echoes table to support Compound Echoes...")
            c.execute("DROP TABLE user_echoes")

        # --- V2 USER ECHOES ---
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS user_echoes (
                echo_id TEXT PRIMARY KEY,
                cluster_id TEXT,
                ai_insight TEXT,
                weight INTEGER DEFAULT 1,
                title TEXT,
                tags TEXT,
                sticky_data_json TEXT DEFAULT '[]',
                quick_thoughts TEXT DEFAULT '[]',
                analysis_metadata TEXT DEFAULT '{}',
                sources TEXT, 
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """
        )

        # --- V2-- NOTE-- GROUPS ---
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS note_groups (
                group_id TEXT PRIMARY KEY,
                title TEXT,
                linked_book_id TEXT,
                stack_id TEXT,
                tags TEXT,
                sticky_data_json TEXT DEFAULT '[]',
                quick_thoughts TEXT DEFAULT '[]',
                group_kind TEXT DEFAULT 'regular',  -- NEW: 'regular' or 'archive'
                owner_item_id TEXT,                 -- NEW: ID of the parent slot/cluster
                owner_item_type TEXT,               -- NEW: 'stack' or 'cluster'
                display_parent_id TEXT,            -- NEW: Actual UI parent where the archive card should render
                restore_group_id TEXT,              -- NEW: Immediate parent to return cards to
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """
        )

        # --- V2 USER NOTES ---
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS user_notes (
                note_id TEXT PRIMARY KEY,
                group_id TEXT,
                title TEXT,
                content TEXT,
                tags TEXT,
                sticky_data_json TEXT DEFAULT '[]',
                quick_thoughts TEXT DEFAULT '[]',
                linked_echo_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(group_id) REFERENCES note_groups(group_id)
            )
        """
        )

        # --- V2 NOTE STACKS ---
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS note_stacks (
                stack_id TEXT PRIMARY KEY,
                title TEXT,
                tags TEXT,
                sticky_data_json TEXT DEFAULT '[]',
                quick_thoughts TEXT DEFAULT '[]',
                cover_image TEXT,
                archive_group_id TEXT,
                archive_group_title TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """
        )

        c.execute("PRAGMA table_info(user_echoes)")
        columns = [row[1] for row in c.fetchall()]
        if len(columns) > 0:
            if "cluster_id" not in columns:
                c.execute("DROP TABLE user_echoes")
            else:
                if "linked_note_id" not in columns:
                    c.execute("ALTER TABLE user_echoes ADD COLUMN linked_note_id TEXT")
                if "title" not in columns:
                    c.execute("ALTER TABLE user_echoes ADD COLUMN title TEXT")
                if "tags" not in columns:
                    c.execute("ALTER TABLE user_echoes ADD COLUMN tags TEXT")
                if "quick_thoughts" not in columns:
                    c.execute("ALTER TABLE user_echoes ADD COLUMN quick_thoughts TEXT")
                if "analysis_metadata" not in columns:
                    c.execute(
                        "ALTER TABLE user_echoes ADD COLUMN analysis_metadata TEXT DEFAULT '{}'"
                    )
                # --- NEW MIGRATION: ADD GROUP_ID FOR SCATTERED ARCHIVES ---
                if "group_id" not in columns:
                    c.execute("ALTER TABLE user_echoes ADD COLUMN group_id TEXT")

        # Fallback creation to make sure the complete schema exists with NEW columns
        c.execute(
            "CREATE TABLE IF NOT EXISTS user_echoes (echo_id TEXT PRIMARY KEY, cluster_id TEXT, group_id TEXT, ai_insight TEXT, weight INTEGER DEFAULT 1, sources TEXT, linked_note_id TEXT, title TEXT, tags TEXT, quick_thoughts TEXT, analysis_metadata TEXT DEFAULT '{}', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
        )

        # Fallback creation to make sure the complete schema exists with NEW columns
        c.execute(
            "CREATE TABLE IF NOT EXISTS user_echoes (echo_id TEXT PRIMARY KEY, cluster_id TEXT, ai_insight TEXT, weight INTEGER DEFAULT 1, sources TEXT, linked_note_id TEXT, title TEXT, tags TEXT, quick_thoughts TEXT, analysis_metadata TEXT DEFAULT '{}', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
        )

        c.execute(
            "CREATE TABLE IF NOT EXISTS note_groups (group_id TEXT PRIMARY KEY, title TEXT, linked_book_id TEXT, stack_id TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
        )

        # --- MIGRATION: ADD TAGS, QUICK THOUGHTS, AND COVERS TO FOLDERS/STACKS ---
        c.execute("PRAGMA table_info(note_groups)")
        columns = [row[1] for row in c.fetchall()]
        if len(columns) > 0:
            if "tags" not in columns:
                c.execute("ALTER TABLE note_groups ADD COLUMN tags TEXT")
            if "quick_thoughts" not in columns:
                c.execute("ALTER TABLE note_groups ADD COLUMN quick_thoughts TEXT")

        c.execute("PRAGMA table_info(note_stacks)")
        columns = [row[1] for row in c.fetchall()]
        if len(columns) > 0:
            if "tags" not in columns:
                c.execute("ALTER TABLE note_stacks ADD COLUMN tags TEXT")
            if "quick_thoughts" not in columns:
                c.execute("ALTER TABLE note_stacks ADD COLUMN quick_thoughts TEXT")
            if "cover_image" not in columns:
                c.execute("ALTER TABLE note_stacks ADD COLUMN cover_image TEXT")

        # --- MIGRATION: ADD COVER MEDIA TO CLUSTERS ---
        c.execute("PRAGMA table_info(echo_clusters)")
        columns = [row[1] for row in c.fetchall()]
        if len(columns) > 0 and "cover_media" not in columns:
            c.execute("ALTER TABLE echo_clusters ADD COLUMN cover_media TEXT")
        if len(columns) > 0 and "title" not in columns:
            c.execute("ALTER TABLE echo_clusters ADD COLUMN title TEXT")
        if len(columns) > 0 and "column_metadata" not in columns:
            c.execute(
                "ALTER TABLE echo_clusters ADD COLUMN column_metadata TEXT DEFAULT '{}'"
            )

        # --- NEW MIGRATION: ADD TITLE TO CLUSTERS ---
        if len(columns) > 0 and "title" not in columns:
            c.execute("ALTER TABLE echo_clusters ADD COLUMN title TEXT")

        # --- NEW MIGRATION: ADD ARCHIVE GROUP TITLE TO CLUSTERS ---
        if len(columns) > 0 and "archive_group_title" not in columns:
            c.execute("ALTER TABLE echo_clusters ADD COLUMN archive_group_title TEXT")

        # --- NEW MIGRATION: ADD ORBIT LAYOUT TO CLUSTERS ---
        if len(columns) > 0 and "orbit_layout" not in columns:
            c.execute(
                "ALTER TABLE echo_clusters ADD COLUMN orbit_layout TEXT DEFAULT '[]'"
            )

        c.execute("PRAGMA table_info(note_stacks)")
        columns = [row[1] for row in c.fetchall()]
        if len(columns) > 0 and "archive_group_id" not in columns:
            c.execute("ALTER TABLE note_stacks ADD COLUMN archive_group_id TEXT")

        # --- NEW MIGRATION: ADD ARCHIVE GROUP TITLE TO STACKS ---
        if len(columns) > 0 and "archive_group_title" not in columns:
            c.execute("ALTER TABLE note_stacks ADD COLUMN archive_group_title TEXT")

        # Fallback creations (Updated with archive_group_id and archive_group_title)
        c.execute(
            "CREATE TABLE IF NOT EXISTS note_groups (group_id TEXT PRIMARY KEY, title TEXT, linked_book_id TEXT, stack_id TEXT, tags TEXT, quick_thoughts TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
        )
        c.execute(
            "CREATE TABLE IF NOT EXISTS note_stacks (stack_id TEXT PRIMARY KEY, title TEXT, tags TEXT, quick_thoughts TEXT, cover_image TEXT, archive_group_id TEXT, archive_group_title TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
        )

        c.execute(
            """
            CREATE TABLE IF NOT EXISTS reader_sessions (
                session_id TEXT PRIMARY KEY,
                book_key TEXT UNIQUE,
                lid TEXT,
                filename TEXT NOT NULL,
                format TEXT,
                last_location TEXT,
                last_location_type TEXT,
                progress_percent REAL DEFAULT 0,
                last_page_label TEXT,
                view_state_json TEXT DEFAULT '{}',
                file_fingerprint TEXT,
                last_opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """
        )

        c.execute(
            """
            CREATE TABLE IF NOT EXISTS reader_annotations (
                annotation_id TEXT PRIMARY KEY,
                book_key TEXT,
                lid TEXT,
                filename TEXT NOT NULL,
                format TEXT,
                anchor_json TEXT NOT NULL,
                quote_text TEXT DEFAULT '',
                title TEXT DEFAULT '',
                note TEXT DEFAULT '',
                color TEXT DEFAULT '',
                kind TEXT DEFAULT 'bookmark',
                page_label TEXT DEFAULT '',
                chapter_label TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """
        )

        c.execute(
            """
            CREATE TABLE IF NOT EXISTS reader_manifests (
                book_key TEXT PRIMARY KEY,
                lid TEXT,
                filename TEXT NOT NULL,
                format TEXT,
                manifest_version INTEGER DEFAULT 0,
                file_fingerprint TEXT,
                status TEXT DEFAULT 'pending',
                toc_json TEXT DEFAULT '[]',
                page_count INTEGER DEFAULT 0,
                section_index_json TEXT DEFAULT '[]',
                location_map_json TEXT DEFAULT '[]',
                content_meta_json TEXT DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """
        )

        manifest_columns = {
            row["name"]
            for row in c.execute("PRAGMA table_info(reader_manifests)").fetchall()
        }
        if "manifest_version" not in manifest_columns:
            c.execute(
                """
                ALTER TABLE reader_manifests
                ADD COLUMN manifest_version INTEGER DEFAULT 0
                """
            )
        self.conn.commit()

        # --- SPATIAL METADATA ---
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS spatial_canvas_metadata (
                item_id TEXT PRIMARY KEY,
                item_type TEXT,
                x_coord REAL,
                y_coord REAL,
                orientation TEXT DEFAULT 'portrait',
                z_index INTEGER DEFAULT 0,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """
        )

        c.execute("PRAGMA table_info(note_groups)")
        columns = [row[1] for row in c.fetchall()]
        if len(columns) > 0:
            try:
                if "group_kind" not in columns:
                    c.execute(
                        "ALTER TABLE note_groups ADD COLUMN group_kind TEXT DEFAULT 'regular'"
                    )
                if "owner_item_id" not in columns:
                    c.execute("ALTER TABLE note_groups ADD COLUMN owner_item_id TEXT")
                if "owner_item_type" not in columns:
                    c.execute("ALTER TABLE note_groups ADD COLUMN owner_item_type TEXT")
                if "display_parent_id" not in columns:
                    c.execute("ALTER TABLE note_groups ADD COLUMN display_parent_id TEXT")
                if "restore_group_id" not in columns:
                    c.execute(
                        "ALTER TABLE note_groups ADD COLUMN restore_group_id TEXT"
                    )
            except sqlite3.OperationalError as e:
                logger.error(f"Migration error on note_groups: {e}")

        self.conn.commit()

        try:
            c.execute(
                "ALTER TABLE spatial_canvas_metadata ADD COLUMN z_index INTEGER DEFAULT 0"
            )
            self.conn.commit()
        except sqlite3.OperationalError:
            pass  # Column already exists

        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_reader_sessions_filename ON reader_sessions(filename)"
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_reader_annotations_book_key ON reader_annotations(book_key)"
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_reader_annotations_filename ON reader_annotations(filename)"
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_reader_annotations_created ON reader_annotations(created_at)"
        )
        self.conn.commit()

        self._run_archive_backfill()
        c.execute(
            """
            UPDATE note_groups
            SET display_parent_id = COALESCE(display_parent_id, restore_group_id, owner_item_id, stack_id)
            WHERE group_kind = 'archive'
              AND (display_parent_id IS NULL OR TRIM(display_parent_id) = '')
            """
        )
        self.conn.commit()
        self.backfill_manual_links_from_legacy()

    def _run_archive_backfill(self):
        """
        Scans existing note_groups. If it finds legacy archives (based on title or ID prefix),
        it migrates them to the new explicit schema so the UI doesn't have to guess anymore.
        """
        c = self.conn.cursor()

        # Select all groups that haven't been migrated yet
        c.execute("SELECT * FROM note_groups WHERE group_kind = 'regular'")
        groups = c.fetchall()

        for group in groups:
            group_id = group["group_id"]
            title = group["title"]
            stack_id = group["stack_id"]

            # The old heuristics: Title contains "archive" OR ID doesn't start with "grp_"
            is_legacy_archive = (title and "archive" in title.lower()) or (
                group_id and not group_id.startswith("grp_")
            )

            if is_legacy_archive:
                owner_type = "cluster"
                # Determine if the parent is a stack (Notes Mode) or cluster (Echo Mode)
                c.execute(
                    "SELECT stack_id FROM note_stacks WHERE stack_id = ?", (stack_id,)
                )
                if c.fetchone():
                    owner_type = "stack"

                # Update the legacy folder to the explicit new schema
                c.execute(
                    """
                    UPDATE note_groups 
                    SET group_kind = 'archive', 
                        owner_item_id = ?, 
                        owner_item_type = ?, 
                        restore_group_id = NULL 
                    WHERE group_id = ?
                    """,
                    (stack_id, owner_type, group_id),
                )
        self.conn.commit()

    # --- GRAPH PHYSICS METHODS ---
    def add_node(self, node_id, label, node_type="concept", description=""):
        c = self.conn.cursor()
        c.execute(
            """
            INSERT OR REPLACE INTO user_nodes (node_id, label, node_type, description)
            VALUES (?, ?, ?, ?)
        """,
            (node_id, label, node_type, description),
        )
        self.conn.commit()

    def add_edge(self, source_id, target_id, edge_type, context_text="", weight=1.0):
        c = self.conn.cursor()
        c.execute(
            """
            INSERT OR REPLACE INTO user_edges (source_id, target_id, edge_type, context_text, weight)
            VALUES (?, ?, ?, ?, ?)
        """,
            (source_id, target_id, edge_type, context_text, weight),
        )
        self.conn.commit()

    def update_cluster_cover(self, cluster_id: str, cover_url: str):
        c = self.conn.cursor()
        c.execute(
            "UPDATE echo_clusters SET cover_media = ? WHERE cluster_id = ?",
            (cover_url, cluster_id),
        )
        self.conn.commit()

    def get_all_edges(self):
        c = self.conn.cursor()
        c.execute("SELECT * FROM user_edges")
        return [dict(r) for r in c.fetchall()]

    def get_all_user_nodes(self):
        c = self.conn.cursor()
        c.execute("SELECT * FROM user_nodes")
        return [dict(r) for r in c.fetchall()]

    def _normalize_manual_link_pair(self, item_a: str, item_b: str):
        left = str(item_a or "").strip()
        right = str(item_b or "").strip()
        if not left or not right or left == right:
            return None
        return tuple(sorted((left, right)))

    def _get_linkable_item_type(self, item_id: str, cursor: sqlite3.Cursor = None):
        item_id = str(item_id or "").strip()
        if not item_id:
            return None

        local_cursor = cursor or self.conn.cursor()
        if item_id.startswith("note_"):
            local_cursor.execute(
                "SELECT 1 FROM user_notes WHERE note_id = ?",
                (item_id,),
            )
            return "note" if local_cursor.fetchone() else None

        if item_id.startswith("echo_"):
            local_cursor.execute(
                "SELECT 1 FROM user_echoes WHERE echo_id = ?",
                (item_id,),
            )
            return "echo" if local_cursor.fetchone() else None

        return None

    def _expand_manual_link_pairs(self, item_ids: list[str], cursor: sqlite3.Cursor = None):
        local_cursor = cursor or self.conn.cursor()
        normalized_ids = []
        invalid_ids = []

        for raw_id in item_ids or []:
            item_id = str(raw_id or "").strip()
            if not item_id or item_id in normalized_ids:
                continue
            item_type = self._get_linkable_item_type(item_id, local_cursor)
            if item_type is None:
                invalid_ids.append(item_id)
                continue
            normalized_ids.append(item_id)

        notes = [item_id for item_id in normalized_ids if item_id.startswith("note_")]
        echoes = [item_id for item_id in normalized_ids if item_id.startswith("echo_")]

        if invalid_ids:
            raise ValueError("Only note and echo cards can be linked.")
        if len(normalized_ids) < 2:
            raise ValueError("Select at least two note or echo cards.")
        if not notes:
            raise ValueError("Select at least one note. Echo-to-echo linking is not supported.")

        pairs = []
        seen_pairs = set()

        for index, note_id in enumerate(notes):
            for other_note_id in notes[index + 1 :]:
                normalized = self._normalize_manual_link_pair(note_id, other_note_id)
                if normalized and normalized not in seen_pairs:
                    seen_pairs.add(normalized)
                    pairs.append(normalized)

        for note_id in notes:
            for echo_id in echoes:
                normalized = self._normalize_manual_link_pair(note_id, echo_id)
                if normalized and normalized not in seen_pairs:
                    seen_pairs.add(normalized)
                    pairs.append(normalized)

        if not pairs:
            raise ValueError("This selection does not form any supported note-based links.")

        return {
            "pairs": pairs,
            "note_ids": notes,
            "echo_ids": echoes,
        }

    def _sync_note_primary_links(
        self, note_ids: set[str] | list[str], cursor: sqlite3.Cursor = None
    ):
        local_cursor = cursor or self.conn.cursor()

        for note_id in {str(note_id) for note_id in (note_ids or []) if note_id}:
            local_cursor.execute(
                "SELECT linked_echo_id FROM user_notes WHERE note_id = ?",
                (note_id,),
            )
            row = local_cursor.fetchone()
            if not row:
                continue

            current_primary = row["linked_echo_id"]
            local_cursor.execute(
                """
                SELECT edge_id, source_id, target_id
                FROM user_edges
                WHERE edge_type = 'manual_link'
                  AND (source_id = ? OR target_id = ?)
                ORDER BY edge_id ASC
                """,
                (note_id, note_id),
            )
            remaining_echo_ids = []
            for edge_row in local_cursor.fetchall():
                other_id = (
                    edge_row["target_id"]
                    if edge_row["source_id"] == note_id
                    else edge_row["source_id"]
                )
                if str(other_id).startswith("echo_"):
                    remaining_echo_ids.append(str(other_id))

            next_primary = None
            if current_primary and current_primary in remaining_echo_ids:
                next_primary = current_primary
            elif remaining_echo_ids:
                next_primary = remaining_echo_ids[0]

            local_cursor.execute(
                """
                UPDATE user_notes
                SET linked_echo_id = ?, updated_at = CURRENT_TIMESTAMP
                WHERE note_id = ?
                """,
                (next_primary, note_id),
            )

    def backfill_manual_links_from_legacy(self):
        c = self.conn.cursor()
        c.execute(
            """
            SELECT note_id, linked_echo_id
            FROM user_notes
            WHERE linked_echo_id IS NOT NULL
              AND TRIM(linked_echo_id) != ''
              AND linked_echo_id != 'null'
            """
        )

        affected_note_ids = set()
        for row in c.fetchall():
            normalized = self._normalize_manual_link_pair(
                row["note_id"], row["linked_echo_id"]
            )
            if not normalized:
                continue

            source_id, target_id = normalized
            c.execute(
                """
                INSERT OR IGNORE INTO user_edges
                (source_id, target_id, edge_type, context_text, weight)
                VALUES (?, ?, 'manual_link', 'Legacy linked echo', 1.0)
                """,
                (source_id, target_id),
            )
            affected_note_ids.add(str(row["note_id"]))

        self._sync_note_primary_links(affected_note_ids, c)
        self.conn.commit()

    def get_manual_links(self):
        c = self.conn.cursor()
        c.execute(
            """
            SELECT edge_id, source_id, target_id, edge_type, context_text, weight
            FROM user_edges
            WHERE edge_type = 'manual_link'
            ORDER BY edge_id ASC
            """
        )
        return [dict(row) for row in c.fetchall()]

    def get_linked_notes_for_echo(self, echo_id: str):
        c = self.conn.cursor()
        c.execute(
            """
            SELECT ue.edge_id,
                   n.note_id,
                   n.group_id,
                   n.title,
                   n.content,
                   n.tags,
                   n.linked_echo_id,
                   n.created_at
            FROM user_edges ue
            JOIN user_notes n
              ON (
                (ue.source_id = n.note_id AND ue.target_id = ?)
                OR
                (ue.target_id = n.note_id AND ue.source_id = ?)
              )
            WHERE ue.edge_type = 'manual_link'
            ORDER BY ue.edge_id ASC
            """,
            (echo_id, echo_id),
        )
        return [dict(row) for row in c.fetchall()]

    def link_items(self, item_ids: list[str]) -> dict:
        c = self.conn.cursor()
        expanded = self._expand_manual_link_pairs(item_ids, c)
        created_count = 0

        for source_id, target_id in expanded["pairs"]:
            c.execute(
                """
                INSERT OR IGNORE INTO user_edges
                (source_id, target_id, edge_type, context_text, weight)
                VALUES (?, ?, 'manual_link', 'Spatial canvas link', 1.0)
                """,
                (source_id, target_id),
            )
            created_count += c.rowcount or 0

        self._sync_note_primary_links(expanded["note_ids"], c)
        self.conn.commit()
        return {
            "pair_count": len(expanded["pairs"]),
            "created_count": created_count,
            "affected_note_ids": expanded["note_ids"],
        }

    def unlink_items(self, item_ids: list[str]) -> dict:
        c = self.conn.cursor()
        expanded = self._expand_manual_link_pairs(item_ids, c)
        removed_count = 0

        for source_id, target_id in expanded["pairs"]:
            c.execute(
                """
                DELETE FROM user_edges
                WHERE edge_type = 'manual_link'
                  AND source_id = ?
                  AND target_id = ?
                """,
                (source_id, target_id),
            )
            removed_count += c.rowcount or 0

        self._sync_note_primary_links(expanded["note_ids"], c)
        self.conn.commit()
        return {
            "pair_count": len(expanded["pairs"]),
            "removed_count": removed_count,
            "affected_note_ids": expanded["note_ids"],
        }

    def update_quick_thoughts(self, item_id: str, thoughts: str, item_type: str):
        c = self.conn.cursor()
        if item_type == "note":
            c.execute(
                "UPDATE user_notes SET quick_thoughts = ? WHERE note_id = ?",
                (thoughts, item_id),
            )
        elif item_type == "group":
            c.execute(
                "UPDATE note_groups SET quick_thoughts = ? WHERE group_id = ?",
                (thoughts, item_id),
            )
        elif item_type == "stack":
            c.execute(
                "UPDATE note_stacks SET quick_thoughts = ? WHERE stack_id = ?",
                (thoughts, item_id),
            )
        else:
            c.execute(
                "UPDATE user_echoes SET quick_thoughts = ? WHERE echo_id = ?",
                (thoughts, item_id),
            )
        self.conn.commit()

    def update_stack_cover(self, stack_id: str, cover_url: str):
        c = self.conn.cursor()
        c.execute(
            "UPDATE note_stacks SET cover_image = ? WHERE stack_id = ?",
            (cover_url, stack_id),
        )
        self.conn.commit()

    # --- CLUSTER & COMPOUND ECHO METHODS ---
    def get_active_cluster(self, library_id, fallback_book_id):
        """Checks for an active cluster using the strict ID first, then falls back to string."""
        c = self.conn.cursor()
        if library_id:
            c.execute(
                "SELECT cluster_id FROM echo_clusters WHERE library_id = ? AND is_active = 1 LIMIT 1",
                (library_id,),
            )
            res = c.fetchone()
            if res:
                return res["cluster_id"]

        c.execute(
            "SELECT cluster_id FROM echo_clusters WHERE book_id = ? AND is_active = 1 LIMIT 1",
            (fallback_book_id,),
        )
        res = c.fetchone()
        return res["cluster_id"] if res else None

    def create_cluster(
        self,
        cluster_id,
        book_id,
        parent_cluster_id=None,
        library_id=None,
        source_echo_id=None,
        title=None,
        is_active=True,
        column_metadata=None,
    ):
        """Saves BOTH the display string and the indestructible library ID."""
        c = self.conn.cursor()
        column_metadata_json = json.dumps(column_metadata or {})
        if is_active and library_id:
            c.execute(
                "UPDATE echo_clusters SET is_active = 0 WHERE library_id = ?",
                (library_id,),
            )
        if is_active:
            c.execute(
                "UPDATE echo_clusters SET is_active = 0 WHERE book_id = ?", (book_id,)
            )

        c.execute(
            """
            INSERT INTO echo_clusters (
                cluster_id,
                book_id,
                is_active,
                parent_cluster_id,
                library_id,
                source_echo_id,
                column_metadata,
                title
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                cluster_id,
                book_id,
                1 if is_active else 0,
                parent_cluster_id,
                library_id,
                source_echo_id,
                column_metadata_json,
                title,
            ),
        )
        self.conn.commit()

    def get_cluster(self, cluster_id):
        c = self.conn.cursor()
        c.execute(
            """
            SELECT cluster_id, book_id, library_id, is_active, parent_cluster_id,
                   source_echo_id, column_metadata, title
            FROM echo_clusters
            WHERE cluster_id = ?
        """,
            (cluster_id,),
        )
        row = c.fetchone()
        if not row:
            return None
        data = dict(row)
        try:
            data["column_metadata"] = (
                json.loads(data.get("column_metadata") or "{}") or {}
            )
        except Exception:
            data["column_metadata"] = {}
        return data

    def update_cluster_metadata(self, cluster_id, column_metadata):
        c = self.conn.cursor()
        c.execute(
            """
            UPDATE echo_clusters
            SET column_metadata = ?, updated_at = CURRENT_TIMESTAMP
            WHERE cluster_id = ?
        """,
            (json.dumps(column_metadata or {}), cluster_id),
        )
        self.conn.commit()

    def find_cluster_by_parent_source_mode(
        self,
        parent_cluster_id=None,
        source_echo_id=None,
        column_kind="",
        mode="",
    ):
        c = self.conn.cursor()
        c.execute(
            """
            SELECT cluster_id, column_metadata
            FROM echo_clusters
            WHERE COALESCE(parent_cluster_id, '') = ?
              AND COALESCE(source_echo_id, '') = ?
            ORDER BY created_at DESC
        """,
            (
                str(parent_cluster_id or ""),
                str(source_echo_id or ""),
            ),
        )
        for row in c.fetchall():
            try:
                metadata = json.loads(row["column_metadata"] or "{}") or {}
            except Exception:
                metadata = {}
            if column_kind and str(metadata.get("column_kind") or "") != str(
                column_kind
            ):
                continue
            if mode and str(metadata.get("mode") or "") != str(mode):
                continue
            return str(row["cluster_id"])
        return None

    def set_active_cluster(self, cluster_id, book_id, library_id=None):
        c = self.conn.cursor()
        if library_id:
            c.execute(
                "UPDATE echo_clusters SET is_active = 0 WHERE library_id = ?",
                (library_id,),
            )
        c.execute(
            "UPDATE echo_clusters SET is_active = 0 WHERE book_id = ?", (book_id,)
        )

        c.execute(
            "UPDATE echo_clusters SET is_active = 1 WHERE cluster_id = ?", (cluster_id,)
        )
        self.conn.commit()

    def save_compound_echo(
        self,
        echo_id,
        cluster_id,
        ai_insight,
        sources_list,
        weight=1,
        title="",
        analysis_metadata=None,
    ):
        c = self.conn.cursor()
        sources_json = json.dumps(sources_list)
        analysis_metadata_json = json.dumps(analysis_metadata or {})

        c.execute(
            "SELECT linked_note_id FROM user_echoes WHERE echo_id = ?", (echo_id,)
        )
        row = c.fetchone()
        linked_note = row["linked_note_id"] if row else None

        c.execute(
            """
            INSERT OR REPLACE INTO user_echoes (echo_id, cluster_id, ai_insight, weight, sources, title, analysis_metadata, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """,
            (
                echo_id,
                cluster_id,
                ai_insight,
                weight,
                sources_json,
                title,
                analysis_metadata_json,
            ),
        )
        self.conn.commit()

        display_label = (
            title
            if title
            else "Insight: "
            + (ai_insight[:30] + "..." if len(ai_insight) > 30 else ai_insight)
        )
        self.add_node(echo_id, display_label, node_type="echo", description=ai_insight)
        self.add_edge(
            echo_id, cluster_id, edge_type="implicit", context_text="Cluster Member"
        )

    def get_echo_analysis_metadata(self, echo_id):
        c = self.conn.cursor()
        c.execute(
            "SELECT analysis_metadata FROM user_echoes WHERE echo_id = ?", (echo_id,)
        )
        row = c.fetchone()
        if not row:
            return {}
        try:
            return json.loads(row["analysis_metadata"] or "{}") or {}
        except Exception:
            return {}

    def update_echo_analysis_metadata(self, echo_id, analysis_metadata):
        c = self.conn.cursor()
        c.execute(
            """
            UPDATE user_echoes
            SET analysis_metadata = ?, updated_at = CURRENT_TIMESTAMP
            WHERE echo_id = ?
        """,
            (json.dumps(analysis_metadata or {}), echo_id),
        )
        self.conn.commit()

    def update_echo_title(self, echo_id: str, title: str, chunk_id: str = ""):
        c = self.conn.cursor()
        c.execute(
            "SELECT sources, title FROM user_echoes WHERE echo_id = ?", (echo_id,)
        )
        row = c.fetchone()

        if row and row["sources"]:
            sources = json.loads(row["sources"])
            parent_title = row["title"]
            for src in sources:
                if "title" not in src:
                    src["title"] = parent_title if parent_title else "Untitled Snippet"
            if chunk_id:
                for src in sources:
                    if src.get("original_chunk_id") == chunk_id:
                        src["title"] = title
                        break
            c.execute(
                "UPDATE user_echoes SET sources = ?, updated_at = CURRENT_TIMESTAMP WHERE echo_id = ?",
                (json.dumps(sources), echo_id),
            )

        c.execute(
            "UPDATE user_echoes SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE echo_id = ?",
            (title, echo_id),
        )
        # --- V2: Removed the UPDATE user_nodes statement here ---
        self.conn.commit()

    def get_all_notes(self):
        c = self.conn.cursor()
        c.execute("SELECT * FROM user_notes ORDER BY created_at DESC")
        return [dict(r) for r in c.fetchall()]

    def clean_orphan_clusters(self):
        """V2: Safe cleanup. Only deletes empty inactive root clusters."""
        c = self.conn.cursor()
        c.execute(
            """
            DELETE FROM echo_clusters
            WHERE cluster_id NOT IN (SELECT DISTINCT cluster_id FROM user_echoes)
              AND parent_cluster_id IS NULL
              AND cluster_id NOT IN (
                SELECT DISTINCT parent_cluster_id
                FROM echo_clusters
                WHERE parent_cluster_id IS NOT NULL
              )
              AND archive_group_id IS NULL
              AND is_active = 0;
            """
        )
        self.conn.commit()

    def get_all_saved_clusters(self):
        """Fetches clusters, echoes, and notes, and interleaves them using the orbit_layout map."""
        self.clean_orphan_clusters()
        self.clean_orphan_metadata()

        c = self.conn.cursor()

        # 1. Fetch all notes so we can inject them into the layouts
        c.execute("SELECT * FROM user_notes")
        all_notes = {row["note_id"]: dict(row) for row in c.fetchall()}

        # 2. Fetch all clusters and echoes
        c.execute(
            """
            SELECT c.cluster_id, c.book_id, c.library_id, c.is_active, c.parent_cluster_id,
                   c.source_echo_id, c.column_metadata,
                   c.cover_media, c.archive_group_id, c.archive_group_title, c.title as custom_title, c.orbit_layout,
                   e.echo_id, e.ai_insight, e.weight, e.sources, e.title, e.tags, e.quick_thoughts, e.analysis_metadata, e.group_id,
                   lib.title as true_library_title
            FROM echo_clusters c
            LEFT JOIN user_echoes e ON c.cluster_id = e.cluster_id
            LEFT JOIN library_inventory lib ON c.library_id = lib.lid
            ORDER BY c.created_at DESC
        """
        )
        rows = c.fetchall()

        clusters = {}
        for r in rows:
            cid = r["cluster_id"]
            if cid not in clusters:
                display_title = (
                    r["custom_title"]
                    if r["custom_title"]
                    else (
                        r["true_library_title"]
                        if r["true_library_title"]
                        else r["book_id"]
                    )
                )

                try:
                    import json

                    layout = json.loads(r["orbit_layout"]) if r["orbit_layout"] else []
                except:
                    layout = []
                try:
                    column_metadata = (
                        json.loads(r["column_metadata"])
                        if r["column_metadata"]
                        else {}
                    )
                except:
                    column_metadata = {}

                clusters[cid] = {
                    "id": cid,
                    "book_id": r["book_id"],
                    "library_id": r["library_id"],
                    "title": display_title,
                    "is_active": bool(r["is_active"]),
                    "parent_cluster_id": r["parent_cluster_id"],
                    "source_echo_id": r["source_echo_id"],
                    "column_metadata": column_metadata,
                    "cover_media": r["cover_media"],
                    "archive_group_id": r["archive_group_id"],
                    "archive_group_title": r["archive_group_title"],
                    "orbit_layout": layout,
                    "author": "Thought Cluster",
                    "chunks": [],
                    "_echo_map": {},  # Temporary dictionary to hold echoes before sorting
                }

            if r["echo_id"]:
                import json

                try:
                    sources = json.loads(r["sources"])
                except:
                    sources = []
                try:
                    analysis_metadata = (
                        json.loads(r["analysis_metadata"])
                        if r["analysis_metadata"]
                        else {}
                    )
                except:
                    analysis_metadata = {}

                for src in sources:
                    clusters[cid]["_echo_map"][r["echo_id"]] = {
                        "type": "echo",
                        "title": src.get("title") or r["title"] or "Untitled Snippet",
                        "echo_id": r["echo_id"],
                        "chunk_id": src.get("original_chunk_id", ""),
                        "filename": src.get("filename", ""),
                        "source_lid": src.get("source_lid", ""),
                        "text": src.get("highlight", ""),
                        "chapter": src.get("context", "Unknown Chapter"),
                        "bridge": r["ai_insight"],
                        "relation": (
                            "Compound Echo" if r["weight"] > 1 else "Saved Insight"
                        ),
                        "similarity": 100,
                        "tags": r["tags"] or "",
                        "quick_thoughts": r["quick_thoughts"] or "[]",
                        "analysis_metadata": analysis_metadata,
                        "group_id": r["group_id"],  # <--- ADD THIS
                    }

        # 3. Process the orbit_layout map to interleave Notes and Echoes seamlessly
        for cid, cluster in clusters.items():
            layout = cluster["orbit_layout"]
            echo_map = cluster["_echo_map"]

            # Identify all echo IDs in this specific cluster
            cluster_echo_ids = set(echo_map.keys())

            if not layout:
                # If no layout exists yet, fallback to appending echoes and auto-generate layout
                for echo_id, chunk_data in echo_map.items():
                    cluster["chunks"].append(chunk_data)
                    cluster["orbit_layout"].append({"type": "echo", "id": echo_id})

                # NEW: Auto-append any globally saved notes linked to these echoes
                for note_id, note_data in all_notes.items():
                    if note_data.get("linked_echo_id") in cluster_echo_ids:
                        cluster["chunks"].append(
                            {
                                "type": "note",
                                "note_id": note_id,
                                "title": note_data.get("title", "Untitled Note"),
                                "text": note_data.get("content", ""),
                                "tags": note_data.get("tags", ""),
                                "quick_thoughts": note_data.get("quick_thoughts", "[]"),
                                "linked_echo_id": note_data.get("linked_echo_id", None),
                                "group_id": note_data.get("group_id", None),
                            }
                        )
                        cluster["orbit_layout"].append({"type": "note", "id": note_id})
            else:
                # Follow the master binder layout
                for item in layout:
                    item_type = item.get("type")
                    item_id = item.get("id")

                    if item_type == "echo" and item_id in echo_map:
                        cluster["chunks"].append(echo_map[item_id])
                    elif item_type == "note" and item_id in all_notes:
                        note_data = all_notes[item_id]
                        note_tags = note_data.get("tags", "") or ""
                        if (
                            note_data.get("linked_echo_id") in cluster_echo_ids
                            or "manual_canvas:1" in note_tags
                        ):
                            cluster["chunks"].append(
                                {
                                    "type": "note",
                                    "note_id": item_id,
                                    "title": note_data.get("title", "Untitled Note"),
                                    "text": note_data.get("content", ""),
                                    "tags": note_data.get("tags", ""),
                                    "quick_thoughts": note_data.get(
                                        "quick_thoughts", "[]"
                                    ),
                                    "linked_echo_id": note_data.get(
                                        "linked_echo_id", None
                                    ),
                                    "group_id": note_data.get("group_id", None),
                                }
                            )

                # Catch any new system Echoes that were saved but aren't in the layout yet
                layout_echo_ids = {
                    item["id"] for item in layout if item.get("type") == "echo"
                }
                for echo_id, chunk_data in echo_map.items():
                    if echo_id not in layout_echo_ids:
                        cluster["chunks"].append(chunk_data)
                        cluster["orbit_layout"].append({"type": "echo", "id": echo_id})

                # NEW: Catch any Notes that were linked to these Echoes but aren't in the layout yet
                layout_note_ids = {
                    item["id"] for item in layout if item.get("type") == "note"
                }
                for note_id, note_data in all_notes.items():
                    if note_data.get("linked_echo_id") in cluster_echo_ids:
                        if note_id not in layout_note_ids:
                            cluster["chunks"].append(
                                {
                                    "type": "note",
                                    "note_id": note_id,
                                    "title": note_data.get("title", "Untitled Note"),
                                    "text": note_data.get("content", ""),
                                    "tags": note_data.get("tags", ""),
                                    "quick_thoughts": note_data.get(
                                        "quick_thoughts", "[]"
                                    ),
                                    "linked_echo_id": note_data.get(
                                        "linked_echo_id", None
                                    ),
                                    "group_id": note_data.get("group_id", None),
                                }
                            )
                            cluster["orbit_layout"].append(
                                {"type": "note", "id": note_id}
                            )

            del cluster["_echo_map"]  # Clean up the temporary dictionary

        return list(clusters.values())

    def create_note_group(
        self, group_id: str, title: str, stack_id: str, linked_book_id: str = None
    ):
        c = self.conn.cursor()
        c.execute(
            "INSERT INTO note_groups (group_id, title, stack_id, linked_book_id) VALUES (?, ?, ?, ?)",
            (group_id, title, stack_id, linked_book_id),
        )
        self.conn.commit()

    def update_tags(self, item_id: str, tags: str, item_type: str):
        c = self.conn.cursor()
        if item_type == "note":
            c.execute(
                "UPDATE user_notes SET tags = ? WHERE note_id = ?", (tags, item_id)
            )
        elif item_type == "group":
            c.execute(
                "UPDATE note_groups SET tags = ? WHERE group_id = ?", (tags, item_id)
            )
        elif item_type == "stack":
            c.execute(
                "UPDATE note_stacks SET tags = ? WHERE stack_id = ?", (tags, item_id)
            )
        else:
            c.execute(
                "UPDATE user_echoes SET tags = ? WHERE echo_id = ?", (tags, item_id)
            )
        self.conn.commit()

    def get_all_note_groups(self):
        c = self.conn.cursor()
        c.execute("SELECT * FROM note_groups ORDER BY created_at DESC")
        return [dict(row) for row in c.fetchall()]

    def create_note_stack(self, stack_id: str, title: str):
        c = self.conn.cursor()
        c.execute(
            "INSERT INTO note_stacks (stack_id, title) VALUES (?, ?)", (stack_id, title)
        )
        self.conn.commit()

    def get_all_note_stacks(self):
        c = self.conn.cursor()
        c.execute("SELECT * FROM note_stacks ORDER BY created_at ASC")
        return [dict(row) for row in c.fetchall()]

    def _safe_json_loads(self, raw_value, fallback):
        if raw_value is None or raw_value == "":
            return fallback
        try:
            return json.loads(raw_value)
        except Exception:
            return fallback

    def _reader_book_key(self, lid: str | None, filename: str | None) -> str:
        normalized_lid = str(lid or "").strip()
        normalized_filename = str(filename or "").strip()
        return normalized_lid or f"file:{normalized_filename}"

    def _hydrate_reader_session_row(self, row: sqlite3.Row | None):
        if not row:
            return None
        data = dict(row)
        data["progress_percent"] = float(data.get("progress_percent") or 0.0)
        data["view_state"] = self._safe_json_loads(
            data.pop("view_state_json", "{}"), {}
        )
        return data

    def _hydrate_reader_annotation_row(self, row: sqlite3.Row | None):
        if not row:
            return None
        data = dict(row)
        data["anchor"] = self._safe_json_loads(data.pop("anchor_json", "{}"), {})
        return data

    def _hydrate_reader_manifest_row(self, row: sqlite3.Row | None):
        if not row:
            return None
        data = dict(row)
        data["manifest_version"] = int(data.get("manifest_version") or 0)
        data["toc"] = self._safe_json_loads(data.pop("toc_json", "[]"), [])
        data["section_index"] = self._safe_json_loads(
            data.pop("section_index_json", "[]"), []
        )
        data["location_map"] = self._safe_json_loads(
            data.pop("location_map_json", "[]"), []
        )
        data["content_meta"] = self._safe_json_loads(
            data.pop("content_meta_json", "{}"), {}
        )
        return data

    def _promote_reader_records_to_lid(
        self, cursor: sqlite3.Cursor, lid: str | None, filename: str | None
    ):
        normalized_lid = str(lid or "").strip()
        normalized_filename = str(filename or "").strip()
        if not normalized_lid or not normalized_filename:
            return

        fallback_key = self._reader_book_key(None, normalized_filename)
        if fallback_key == normalized_lid:
            return

        cursor.execute(
            "SELECT 1 FROM reader_sessions WHERE book_key = ?", (normalized_lid,)
        )
        session_exists = bool(cursor.fetchone())
        if session_exists:
            cursor.execute(
                "DELETE FROM reader_sessions WHERE book_key = ?", (fallback_key,)
            )
        else:
            cursor.execute(
                """
                UPDATE reader_sessions
                SET book_key = ?, lid = ?, updated_at = CURRENT_TIMESTAMP
                WHERE book_key = ?
                """,
                (normalized_lid, normalized_lid, fallback_key),
            )

        cursor.execute(
            """
            UPDATE reader_annotations
            SET book_key = ?, lid = ?, updated_at = CURRENT_TIMESTAMP
            WHERE book_key = ?
            """,
            (normalized_lid, normalized_lid, fallback_key),
        )

        cursor.execute(
            "SELECT 1 FROM reader_manifests WHERE book_key = ?", (normalized_lid,)
        )
        manifest_exists = bool(cursor.fetchone())
        if manifest_exists:
            cursor.execute(
                "DELETE FROM reader_manifests WHERE book_key = ?", (fallback_key,)
            )
        else:
            cursor.execute(
                """
                UPDATE reader_manifests
                SET book_key = ?, lid = ?, updated_at = CURRENT_TIMESTAMP
                WHERE book_key = ?
                """,
                (normalized_lid, normalized_lid, fallback_key),
            )

    def resolve_reader_book_identity(
        self, filename: str, lid: str | None = None
    ) -> dict[str, str]:
        normalized_filename = os.path.basename(str(filename or "").strip())
        normalized_lid = str(lid or "").strip()
        extension = os.path.splitext(normalized_filename)[1].lower().lstrip(".") or "txt"
        c = self.conn.cursor()

        row = None
        if normalized_lid:
            c.execute(
                """
                SELECT lid, title, author, file_path
                FROM library_inventory
                WHERE lid = ?
                LIMIT 1
                """,
                (normalized_lid,),
            )
            row = c.fetchone()

        if row is None and normalized_filename:
            like_forward = f"%/{normalized_filename}"
            like_backward = f"%\\{normalized_filename}"
            c.execute(
                """
                SELECT lid, title, author, file_path
                FROM library_inventory
                WHERE file_path = ?
                   OR file_path LIKE ?
                   OR file_path LIKE ?
                   OR title = ?
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (
                    normalized_filename,
                    like_forward,
                    like_backward,
                    normalized_filename,
                ),
            )
            row = c.fetchone()

        resolved_lid = normalized_lid
        title = normalized_filename
        author = "Unknown"
        file_path = ""
        if row:
            resolved_lid = row["lid"] or resolved_lid
            title = row["title"] or title
            author = row["author"] or author
            file_path = row["file_path"] or ""

        self._promote_reader_records_to_lid(c, resolved_lid, normalized_filename)
        self.conn.commit()

        return {
            "book_key": self._reader_book_key(resolved_lid, normalized_filename),
            "lid": resolved_lid,
            "filename": normalized_filename,
            "title": title,
            "author": author,
            "file_path": file_path,
            "format": extension,
        }

    def get_reader_session(self, filename: str, lid: str | None = None):
        identity = self.resolve_reader_book_identity(filename, lid)
        c = self.conn.cursor()
        c.execute(
            "SELECT * FROM reader_sessions WHERE book_key = ? LIMIT 1",
            (identity["book_key"],),
        )
        return self._hydrate_reader_session_row(c.fetchone())

    def upsert_reader_session(
        self,
        filename: str,
        session_payload: dict,
        lid: str | None = None,
    ):
        identity = self.resolve_reader_book_identity(filename, lid)
        c = self.conn.cursor()
        c.execute(
            "SELECT session_id FROM reader_sessions WHERE book_key = ? LIMIT 1",
            (identity["book_key"],),
        )
        existing = c.fetchone()
        session_id = (
            existing["session_id"]
            if existing and existing["session_id"]
            else f"rdr_sess_{uuid.uuid4().hex[:12]}"
        )

        c.execute(
            """
            INSERT INTO reader_sessions (
                session_id,
                book_key,
                lid,
                filename,
                format,
                last_location,
                last_location_type,
                progress_percent,
                last_page_label,
                view_state_json,
                file_fingerprint,
                last_opened_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(book_key) DO UPDATE SET
                lid = excluded.lid,
                filename = excluded.filename,
                format = excluded.format,
                last_location = excluded.last_location,
                last_location_type = excluded.last_location_type,
                progress_percent = excluded.progress_percent,
                last_page_label = excluded.last_page_label,
                view_state_json = excluded.view_state_json,
                file_fingerprint = excluded.file_fingerprint,
                last_opened_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                session_id,
                identity["book_key"],
                identity["lid"] or None,
                identity["filename"],
                session_payload.get("format") or identity["format"],
                None
                if session_payload.get("last_location") is None
                else str(session_payload.get("last_location")),
                session_payload.get("last_location_type") or "",
                float(session_payload.get("progress_percent") or 0.0),
                session_payload.get("last_page_label") or "",
                json.dumps(session_payload.get("view_state") or {}),
                session_payload.get("file_fingerprint") or "",
            ),
        )
        self.conn.commit()
        return self.get_reader_session(identity["filename"], identity["lid"])

    def get_reader_annotations(self, filename: str, lid: str | None = None):
        identity = self.resolve_reader_book_identity(filename, lid)
        c = self.conn.cursor()
        c.execute(
            """
            SELECT *
            FROM reader_annotations
            WHERE book_key = ?
            ORDER BY created_at ASC, annotation_id ASC
            """,
            (identity["book_key"],),
        )
        return [self._hydrate_reader_annotation_row(row) for row in c.fetchall()]

    def create_reader_annotation(
        self, filename: str, payload: dict, lid: str | None = None
    ):
        identity = self.resolve_reader_book_identity(filename, lid)
        annotation_id = payload.get("annotation_id") or f"ann_{uuid.uuid4().hex[:12]}"
        c = self.conn.cursor()
        c.execute(
            """
            INSERT INTO reader_annotations (
                annotation_id,
                book_key,
                lid,
                filename,
                format,
                anchor_json,
                quote_text,
                title,
                note,
                color,
                kind,
                page_label,
                chapter_label,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """,
            (
                annotation_id,
                identity["book_key"],
                identity["lid"] or None,
                identity["filename"],
                payload.get("format") or identity["format"],
                json.dumps(payload.get("anchor") or {}),
                payload.get("quote_text") or "",
                payload.get("title") or "",
                payload.get("note") or "",
                payload.get("color") or "",
                payload.get("kind") or "bookmark",
                payload.get("page_label") or "",
                payload.get("chapter_label") or "",
            ),
        )
        self.conn.commit()
        c.execute(
            "SELECT * FROM reader_annotations WHERE annotation_id = ? LIMIT 1",
            (annotation_id,),
        )
        return self._hydrate_reader_annotation_row(c.fetchone())

    def update_reader_annotation(self, annotation_id: str, payload: dict):
        c = self.conn.cursor()
        c.execute(
            """
            UPDATE reader_annotations
            SET anchor_json = ?,
                quote_text = ?,
                title = ?,
                note = ?,
                color = ?,
                kind = ?,
                page_label = ?,
                chapter_label = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE annotation_id = ?
            """,
            (
                json.dumps(payload.get("anchor") or {}),
                payload.get("quote_text") or "",
                payload.get("title") or "",
                payload.get("note") or "",
                payload.get("color") or "",
                payload.get("kind") or "bookmark",
                payload.get("page_label") or "",
                payload.get("chapter_label") or "",
                annotation_id,
            ),
        )
        self.conn.commit()
        c.execute(
            "SELECT * FROM reader_annotations WHERE annotation_id = ? LIMIT 1",
            (annotation_id,),
        )
        return self._hydrate_reader_annotation_row(c.fetchone())

    def delete_reader_annotation(self, annotation_id: str):
        c = self.conn.cursor()
        c.execute(
            "DELETE FROM reader_annotations WHERE annotation_id = ?", (annotation_id,)
        )
        self.conn.commit()
        return c.rowcount > 0

    def get_reader_manifest(self, filename: str, lid: str | None = None):
        identity = self.resolve_reader_book_identity(filename, lid)
        c = self.conn.cursor()
        c.execute(
            "SELECT * FROM reader_manifests WHERE book_key = ? LIMIT 1",
            (identity["book_key"],),
        )
        return self._hydrate_reader_manifest_row(c.fetchone())

    def upsert_reader_manifest(
        self, filename: str, manifest_payload: dict, lid: str | None = None
    ):
        identity = self.resolve_reader_book_identity(filename, lid)
        c = self.conn.cursor()
        c.execute(
            """
            INSERT INTO reader_manifests (
                book_key,
                lid,
                filename,
                format,
                manifest_version,
                file_fingerprint,
                status,
                toc_json,
                page_count,
                section_index_json,
                location_map_json,
                content_meta_json,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(book_key) DO UPDATE SET
                lid = excluded.lid,
                filename = excluded.filename,
                format = excluded.format,
                manifest_version = excluded.manifest_version,
                file_fingerprint = excluded.file_fingerprint,
                status = excluded.status,
                toc_json = excluded.toc_json,
                page_count = excluded.page_count,
                section_index_json = excluded.section_index_json,
                location_map_json = excluded.location_map_json,
                content_meta_json = excluded.content_meta_json,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                identity["book_key"],
                identity["lid"] or None,
                identity["filename"],
                manifest_payload.get("format") or identity["format"],
                int(manifest_payload.get("manifest_version") or 0),
                manifest_payload.get("file_fingerprint") or "",
                manifest_payload.get("status") or "ready",
                json.dumps(manifest_payload.get("toc") or []),
                int(manifest_payload.get("page_count") or 0),
                json.dumps(manifest_payload.get("section_index") or []),
                json.dumps(manifest_payload.get("location_map") or []),
                json.dumps(manifest_payload.get("content_meta") or {}),
            ),
        )
        self.conn.commit()
        return self.get_reader_manifest(identity["filename"], identity["lid"])

    def clean_orphan_metadata(self):
        """Silently scrubs layout coordinates for items that have been deleted or unarchived."""
        c = self.conn.cursor()

        # 1. Clean dead Echoes
        c.execute(
            "DELETE FROM spatial_canvas_metadata WHERE item_type = 'ECHO' AND item_id NOT IN (SELECT cluster_id FROM echo_clusters)"
        )
        # 2. Clean dead Notes
        c.execute(
            "DELETE FROM spatial_canvas_metadata WHERE item_type = 'NOTES' AND item_id NOT IN (SELECT stack_id FROM note_stacks)"
        )
        # 3. Clean dead Archives
        c.execute(
            """
            DELETE FROM spatial_canvas_metadata 
            WHERE item_type = 'ARCHIVE' AND item_id NOT IN (
                SELECT archive_group_id FROM echo_clusters WHERE archive_group_id IS NOT NULL
                UNION
                SELECT archive_group_id FROM note_stacks WHERE archive_group_id IS NOT NULL
            )
        """
        )
        # 4. NEW: Clean dead Grid Layouts
        c.execute(
            """
            DELETE FROM spatial_canvas_metadata 
            WHERE item_type = 'GRID' AND item_id NOT IN (
                SELECT cluster_id FROM echo_clusters
                UNION
                SELECT stack_id FROM note_stacks
            )
        """
        )
        self.conn.commit()

    def delete_note_stack(self, stack_id: str):
        c = self.conn.cursor()
        c.execute("SELECT group_id FROM note_groups WHERE stack_id = ?", (stack_id,))
        groups = c.fetchall()
        for g in groups:
            self.delete_note_group(g["group_id"])
        c.execute("DELETE FROM note_stacks WHERE stack_id = ?", (stack_id,))
        self.conn.commit()

    def update_note(
        self,
        note_id: str,
        title: str,
        content: str,
        tags: str = "",
        group_id: str = None,
    ):
        c = self.conn.cursor()
        if group_id:
            c.execute(
                "UPDATE user_notes SET title = ?, content = ?, tags = ?, group_id = ? WHERE note_id = ?",
                (title, content, tags, group_id, note_id),
            )
        else:
            c.execute(
                "UPDATE user_notes SET title = ?, content = ?, tags = ? WHERE note_id = ?",
                (title, content, tags, note_id),
            )
        self.conn.commit()

    def update_note_group_title(self, group_id: str, title: str):
        c = self.conn.cursor()
        c.execute(
            "UPDATE note_groups SET title = ? WHERE group_id = ?", (title, group_id)
        )
        self.conn.commit()

    def create_note(
        self,
        note_id: str,
        group_id: str,
        title: str,
        content: str,
        tags: str = "",
        linked_echo_id: str = None,
    ):
        c = self.conn.cursor()
        c.execute(
            "INSERT INTO user_notes (note_id, group_id, title, content, tags, linked_echo_id) VALUES (?, ?, ?, ?, ?, ?)",
            (note_id, group_id, title, content, tags, linked_echo_id),
        )
        if linked_echo_id:
            normalized = self._normalize_manual_link_pair(note_id, linked_echo_id)
            if normalized:
                c.execute(
                    """
                    INSERT OR IGNORE INTO user_edges
                    (source_id, target_id, edge_type, context_text, weight)
                    VALUES (?, ?, 'manual_link', 'Legacy linked echo', 1.0)
                    """,
                    normalized,
                )
                self._sync_note_primary_links({note_id}, c)
        self.conn.commit()

    def get_notes_by_group(self, group_id: str):
        c = self.conn.cursor()
        c.execute(
            "SELECT * FROM user_notes WHERE group_id = ? ORDER BY created_at DESC",
            (group_id,),
        )
        return [dict(row) for row in c.fetchall()]

    def get_note_by_id(self, note_id: str):
        """Fetches a single note to verify its existence before reassigning folders."""
        c = self.conn.cursor()
        c.execute("SELECT * FROM user_notes WHERE note_id = ?", (note_id,))
        row = c.fetchone()
        if row:
            return dict(row)
        return None

    def delete_note(self, note_id: str):
        c = self.conn.cursor()
        c.execute(
            "DELETE FROM user_edges WHERE source_id = ? OR target_id = ?",
            (note_id, note_id),
        )
        c.execute("DELETE FROM user_notes WHERE note_id = ?", (note_id,))
        self.conn.commit()

    def delete_note_group(self, group_id: str):
        c = self.conn.cursor()
        c.execute("SELECT note_id FROM user_notes WHERE group_id = ?", (group_id,))
        note_ids = [row["note_id"] for row in c.fetchall()]
        if note_ids:
            placeholders = ",".join(["?"] * len(note_ids))
            c.execute(
                f"DELETE FROM user_edges WHERE source_id IN ({placeholders}) OR target_id IN ({placeholders})",
                note_ids + note_ids,
            )
        c.execute("DELETE FROM user_notes WHERE group_id = ?", (group_id,))
        c.execute("DELETE FROM note_groups WHERE group_id = ?", (group_id,))
        self.conn.commit()

    def delete_empty_inner_archive(self, archive_id: str) -> bool:
        c = self.conn.cursor()
        c.execute(
            """
            SELECT group_kind, display_parent_id, restore_group_id, owner_item_id
            FROM note_groups
            WHERE group_id = ?
            """,
            (archive_id,),
        )
        row = c.fetchone()
        if not row or row["group_kind"] != "archive":
            return False

        c.execute("SELECT COUNT(*) FROM user_notes WHERE group_id = ?", (archive_id,))
        notes_count = c.fetchone()[0]
        c.execute(
            "SELECT COUNT(*) FROM user_echoes WHERE group_id = ?", (archive_id,)
        )
        echoes_count = c.fetchone()[0]

        if notes_count > 0 or echoes_count > 0:
            return False

        replacement_display_parent = (
            row["display_parent_id"] or row["restore_group_id"] or row["owner_item_id"]
        )
        replacement_restore_group = row["restore_group_id"]

        # Re-parent descendant archives before deleting the empty shell so nested archives remain visible.
        if replacement_display_parent != archive_id:
            c.execute(
                """
                UPDATE note_groups
                SET display_parent_id = ?
                WHERE group_kind = 'archive' AND display_parent_id = ?
                """,
                (replacement_display_parent, archive_id),
            )
        else:
            c.execute(
                """
                UPDATE note_groups
                SET display_parent_id = owner_item_id
                WHERE group_kind = 'archive' AND display_parent_id = ?
                """,
                (archive_id,),
            )

        c.execute(
            """
            UPDATE note_groups
            SET restore_group_id = ?
            WHERE group_kind = 'archive' AND restore_group_id = ?
            """,
            (replacement_restore_group, archive_id),
        )

        c.execute("DELETE FROM note_groups WHERE group_id = ?", (archive_id,))
        c.execute(
            "DELETE FROM spatial_canvas_metadata WHERE item_id = ?", (archive_id,)
        )
        self.conn.commit()
        return True

    def link_note_to_echo(self, note_id: str, echo_id: str):
        self.link_items([note_id, echo_id])

    def upsert_spatial_metadata(
        self,
        item_id: str,
        item_type: str,
        x_coord: float,
        y_coord: float,
        orientation: str = "portrait",
        z_index: int = 0,  # <-- NEW
    ):
        """Saves or updates the visual canvas properties for an item."""
        c = self.conn.cursor()
        c.execute(
            """
            INSERT OR REPLACE INTO spatial_canvas_metadata 
            (item_id, item_type, x_coord, y_coord, orientation, z_index, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (item_id, item_type, x_coord, y_coord, orientation, z_index),
        )
        self.conn.commit()

    def get_spatial_metadata(self, item_ids: list[str] = None):
        """Fetches canvas metadata. Returns a dictionary mapped by item_id for fast frontend parsing."""
        c = self.conn.cursor()
        if item_ids:
            placeholders = ",".join(["?"] * len(item_ids))
            c.execute(
                f"SELECT * FROM spatial_canvas_metadata WHERE item_id IN ({placeholders})",
                item_ids,
            )
        else:
            c.execute("SELECT * FROM spatial_canvas_metadata")

        # Return as a dictionary so the frontend can easily look up item metadata by ID
        return {row["item_id"]: dict(row) for row in c.fetchall()}

    def archive_items_group(self, item_ids: list[str], group_type: str) -> str:
        """Groups root items by assigning them a shared archive_group_id and title."""
        import uuid

        arch_id = f"arch_{uuid.uuid4().hex[:8]}"
        default_title = "Archived Items"
        c = self.conn.cursor()

        placeholders = ",".join(["?"] * len(item_ids))
        parameters = [arch_id, default_title] + item_ids

        if group_type == "ECHO":
            query = f"UPDATE echo_clusters SET archive_group_id = ?, archive_group_title = ? WHERE cluster_id IN ({placeholders})"
        else:
            query = f"UPDATE note_stacks SET archive_group_id = ?, archive_group_title = ? WHERE stack_id IN ({placeholders})"

        c.execute(query, parameters)
        self.conn.commit()
        return arch_id

    def update_outer_archive_title(self, archive_id: str, title: str, group_type: str):
        """Safely updates the title for ALL items sharing this archive bucket."""
        c = self.conn.cursor()
        if group_type == "ECHO":
            c.execute(
                "UPDATE echo_clusters SET archive_group_title = ? WHERE archive_group_id = ?",
                (title, archive_id),
            )
        else:
            c.execute(
                "UPDATE note_stacks SET archive_group_title = ? WHERE archive_group_id = ?",
                (title, archive_id),
            )
        self.conn.commit()

    def _cleanup_outer_archive_metadata(
        self, archive_id: str, group_type: str, cursor: sqlite3.Cursor
    ):
        if not archive_id:
            return

        if group_type == "ECHO":
            cursor.execute(
                "SELECT COUNT(*) FROM echo_clusters WHERE archive_group_id = ?",
                (archive_id,),
            )
        else:
            cursor.execute(
                "SELECT COUNT(*) FROM note_stacks WHERE archive_group_id = ?",
                (archive_id,),
            )

        if cursor.fetchone()[0] == 0:
            cursor.execute(
                "DELETE FROM spatial_canvas_metadata WHERE item_id = ?", (archive_id,)
            )

    def append_items_to_archive(
        self, target_archive_id: str, item_ids: list[str]
    ) -> dict[str, any]:
        c = self.conn.cursor()

        if not target_archive_id:
            raise ValueError("Target archive id is required.")

        if not item_ids:
            return {"target_type": None, "moved_count": 0}

        c.execute(
            """
            SELECT group_id, title
            FROM note_groups
            WHERE group_id = ? AND group_kind = 'archive'
            """,
            (target_archive_id,),
        )
        inner_archive = c.fetchone()
        if inner_archive:
            moved_count = self._append_to_inner_archive(
                c, target_archive_id, item_ids
            )
            self.conn.commit()
            return {"target_type": "INNER_ARCHIVE", "moved_count": moved_count}

        c.execute(
            """
            SELECT archive_group_title
            FROM echo_clusters
            WHERE archive_group_id = ?
            LIMIT 1
            """,
            (target_archive_id,),
        )
        outer_echo = c.fetchone()
        if outer_echo:
            moved_count = self._append_root_items_to_outer_archive(
                c,
                target_archive_id,
                item_ids,
                "ECHO",
                outer_echo["archive_group_title"] or "Archived Items",
            )
            self.conn.commit()
            return {"target_type": "ECHO", "moved_count": moved_count}

        c.execute(
            """
            SELECT archive_group_title
            FROM note_stacks
            WHERE archive_group_id = ?
            LIMIT 1
            """,
            (target_archive_id,),
        )
        outer_notes = c.fetchone()
        if outer_notes:
            moved_count = self._append_root_items_to_outer_archive(
                c,
                target_archive_id,
                item_ids,
                "NOTES",
                outer_notes["archive_group_title"] or "Archived Items",
            )
            self.conn.commit()
            return {"target_type": "NOTES", "moved_count": moved_count}

        raise ValueError(f"Archive target '{target_archive_id}' was not found.")

    def _append_root_items_to_outer_archive(
        self,
        cursor: sqlite3.Cursor,
        target_archive_id: str,
        item_ids: list[str],
        group_type: str,
        target_title: str,
    ) -> int:
        prefix = "cluster_" if group_type == "ECHO" else "stack_"
        id_column = "cluster_id" if group_type == "ECHO" else "stack_id"
        table_name = "echo_clusters" if group_type == "ECHO" else "note_stacks"
        valid_item_ids = [
            str(item_id) for item_id in item_ids if str(item_id).startswith(prefix)
        ]

        if not valid_item_ids:
            raise ValueError(
                "Only root slots can be merged into an outer archive folder."
            )

        placeholders = ",".join(["?"] * len(valid_item_ids))
        cursor.execute(
            f"SELECT {id_column} AS item_id, archive_group_id FROM {table_name} WHERE {id_column} IN ({placeholders})",
            valid_item_ids,
        )
        existing_rows = cursor.fetchall()
        if not existing_rows:
            raise ValueError("No compatible root items were found for this archive.")

        previous_archive_ids = {
            row["archive_group_id"]
            for row in existing_rows
            if row["archive_group_id"] and row["archive_group_id"] != target_archive_id
        }

        cursor.execute(
            f"""
            UPDATE {table_name}
            SET archive_group_id = ?, archive_group_title = ?
            WHERE {id_column} IN ({placeholders})
            """,
            [target_archive_id, target_title] + valid_item_ids,
        )

        for archive_id in previous_archive_ids:
            self._cleanup_outer_archive_metadata(archive_id, group_type, cursor)

        return len(existing_rows)

    def _append_to_inner_archive(
        self, cursor: sqlite3.Cursor, target_archive_id: str, item_ids: list[str]
    ) -> int:
        valid_item_ids = []
        source_archive_ids = set()

        for item_id in item_ids:
            item_id = str(item_id)
            if item_id.startswith("cluster_") or item_id.startswith("stack_"):
                continue

            cursor.execute("SELECT 1 FROM note_groups WHERE group_id = ?", (item_id,))
            if cursor.fetchone():
                continue

            valid_item_ids.append(item_id)

            current_group_id = None
            cursor.execute(
                "SELECT group_id FROM user_notes WHERE note_id = ?", (item_id,)
            )
            row = cursor.fetchone()
            if row and row[0]:
                current_group_id = row[0]
            else:
                cursor.execute(
                    "SELECT group_id FROM user_echoes WHERE echo_id = ?", (item_id,)
                )
                row = cursor.fetchone()
                if row and row[0]:
                    current_group_id = row[0]

            if current_group_id and current_group_id != target_archive_id:
                cursor.execute(
                    "SELECT group_kind FROM note_groups WHERE group_id = ?",
                    (current_group_id,),
                )
                kind_row = cursor.fetchone()
                if kind_row and kind_row[0] == "archive":
                    source_archive_ids.add(current_group_id)

        if not valid_item_ids:
            raise ValueError(
                "Only note and echo cards can be merged into an inner archive folder."
            )

        moved_count = 0
        for item_id in valid_item_ids:
            cursor.execute(
                "UPDATE user_notes SET group_id = ? WHERE note_id = ?",
                (target_archive_id, item_id),
            )
            moved_count += cursor.rowcount or 0
            cursor.execute(
                "UPDATE user_echoes SET group_id = ? WHERE echo_id = ?",
                (target_archive_id, item_id),
            )
            moved_count += cursor.rowcount or 0

        for archive_id in source_archive_ids:
            cursor.execute(
                "SELECT COUNT(*) FROM user_notes WHERE group_id = ?", (archive_id,)
            )
            notes_left = cursor.fetchone()[0]
            cursor.execute(
                "SELECT COUNT(*) FROM user_echoes WHERE group_id = ?", (archive_id,)
            )
            echoes_left = cursor.fetchone()[0]

            if notes_left == 0 and echoes_left == 0:
                cursor.execute("DELETE FROM note_groups WHERE group_id = ?", (archive_id,))
                cursor.execute(
                    "DELETE FROM spatial_canvas_metadata WHERE item_id = ?",
                    (archive_id,),
                )

        return moved_count

    def unarchive_items_group(self, archive_id: str, group_type: str):
        """Unarchives items by wiping their archive tags from the database."""
        c = self.conn.cursor()

        if group_type == "ECHO":
            # THE FIX: Explicitly clear BOTH the ID and the Title columns to prevent silent SQL conflicts
            c.execute(
                "UPDATE echo_clusters SET archive_group_id = NULL, archive_group_title = NULL WHERE archive_group_id = ?",
                (archive_id,),
            )
        else:
            c.execute(
                "UPDATE note_stacks SET archive_group_id = NULL, archive_group_title = NULL WHERE archive_group_id = ?",
                (archive_id,),
            )

        c.execute(
            "DELETE FROM spatial_canvas_metadata WHERE item_id = ?", (archive_id,)
        )
        self.conn.commit()

    def unarchive_specific_root_items(self, item_ids: list[str], group_type: str):
        """Unarchives specific root items (fanned out cards) by clearing their archive tag."""
        c = self.conn.cursor()
        placeholders = ",".join(["?"] * len(item_ids))

        if group_type == "ECHO":
            c.execute(
                f"UPDATE echo_clusters SET archive_group_id = NULL, archive_group_title = NULL WHERE cluster_id IN ({placeholders})",
                item_ids,
            )
        else:
            c.execute(
                f"UPDATE note_stacks SET archive_group_id = NULL, archive_group_title = NULL WHERE stack_id IN ({placeholders})",
                item_ids,
            )
        self.conn.commit()

    def update_cluster_title(self, cluster_id: str, title: str):
        c = self.conn.cursor()
        c.execute(
            "UPDATE echo_clusters SET title = ? WHERE cluster_id = ?",
            (title, cluster_id),
        )
        self.conn.commit()

    def update_cluster_orbit_layout(self, cluster_id: str, layout_json: str):
        c = self.conn.cursor()
        c.execute(
            "UPDATE echo_clusters SET orbit_layout = ? WHERE cluster_id = ?",
            (layout_json, cluster_id),
        )
        self.conn.commit()

    def delete_cluster(self, cluster_id: str):
        """Cascade deletes a column, its child branches, and all echoes inside them."""
        c = self.conn.cursor()
        all_clusters = []
        queue = [cluster_id]

        while queue:
            current_cluster_id = queue.pop(0)
            if current_cluster_id in all_clusters:
                continue
            all_clusters.append(current_cluster_id)
            c.execute(
                "SELECT cluster_id FROM echo_clusters WHERE parent_cluster_id = ?",
                (current_cluster_id,),
            )
            queue.extend(row["cluster_id"] for row in c.fetchall())

        placeholders = ",".join(["?"] * len(all_clusters))

        # Identify all echoes living in these clusters
        c.execute(
            f"SELECT echo_id FROM user_echoes WHERE cluster_id IN ({placeholders})",
            all_clusters,
        )
        echoes = [row["echo_id"] for row in c.fetchall()]

        # Cascade Delete the Echoes and their graph lines
        if echoes:
            echo_placeholders = ",".join(["?"] * len(echoes))
            c.execute(
                f"DELETE FROM user_echoes WHERE echo_id IN ({echo_placeholders})",
                echoes,
            )
            c.execute(
                f"DELETE FROM user_nodes WHERE node_id IN ({echo_placeholders})", echoes
            )
            c.execute(
                f"DELETE FROM user_edges WHERE source_id IN ({echo_placeholders}) OR target_id IN ({echo_placeholders})",
                echoes * 2,
            )

        # Delete the clusters and metadata
        c.execute(
            f"DELETE FROM echo_clusters WHERE cluster_id IN ({placeholders})",
            all_clusters,
        )
        c.execute(
            f"DELETE FROM spatial_canvas_metadata WHERE item_id IN ({placeholders})",
            all_clusters,
        )

        self.conn.commit()

    # THE FIX: Indented this function so it belongs to GraphDBManager
    def save_bulk_orbit_metadata(self, metadata_list: list):
        c = self.conn.cursor()
        for item in metadata_list:
            c.execute(
                """
                    REPLACE INTO spatial_canvas_metadata (item_id, item_type, x_coord, y_coord, z_index)
                    VALUES (?, ?, ?, ?, ?)
                """,
                (
                    item["item_id"],
                    item["item_type"],
                    item["x"],  # Maps to x_coord
                    item["y"],  # Maps to y_coord
                    item["z_index"],
                ),
            )
        self.conn.commit()

    def archive_scattered_items(
        self,
        item_ids: list[str],
        owner_item_id: str,
        owner_item_type: str,
        display_parent_id: str = None,
        restore_group_id: str = None,
        title: str = "Archived Items",
    ) -> str:
        """Creates an inner archive folder explicitly linked to its parent hierarchy."""
        c = self.conn.cursor()

        # ✨ THE FIX: Filter out any items that are already folders (groups).
        valid_item_ids = []
        for i_id in item_ids:
            c.execute("SELECT 1 FROM note_groups WHERE group_id = ?", (i_id,))
            if not c.fetchone():
                valid_item_ids.append(i_id)

        # ✨ THE FIX: If there are no valid items left (e.g. user only selected folders), abort!
        if not valid_item_ids:
            return None

        import uuid

        arch_id = f"arch_fld_{uuid.uuid4().hex[:8]}"
        inferred_display_parent_id = display_parent_id or owner_item_id
        inferred_restore_group_id = restore_group_id
        affected_groups = set()

        # 1. Inspect original homes before moving anything.
        for item_id in valid_item_ids:
            try:
                c.execute(
                    "SELECT group_id FROM user_notes WHERE note_id = ?", (item_id,)
                )
                row = c.fetchone()
                if row and row[0]:
                    affected_groups.add(row[0])

                c.execute(
                    "SELECT group_id FROM user_echoes WHERE echo_id = ?", (item_id,)
                )
                row = c.fetchone()
                if row and row[0]:
                    affected_groups.add(row[0])
            except Exception:
                pass

        if inferred_restore_group_id is None and len(affected_groups) == 1:
            inferred_restore_group_id = next(iter(affected_groups))

        # 2. Create the Explicit Archive Folder
        c.execute(
            """
            INSERT INTO note_groups 
            (group_id, title, stack_id, group_kind, owner_item_id, owner_item_type, display_parent_id, restore_group_id) 
            VALUES (?, ?, ?, 'archive', ?, ?, ?, ?)
            """,
            (
                arch_id,
                title,
                owner_item_id,
                owner_item_id,
                owner_item_type,
                inferred_display_parent_id,
                inferred_restore_group_id,
            ),
        )

        # 3. Re-assign items into the archive folder
        for item_id in valid_item_ids:

            c.execute(
                "UPDATE user_notes SET group_id = ? WHERE note_id = ?",
                (arch_id, item_id),
            )
            c.execute(
                "UPDATE user_echoes SET group_id = ? WHERE echo_id = ?",
                (arch_id, item_id),
            )

        for group_id in affected_groups:
            # ✨ THE FIX 1: Never delete the folder we are supposed to restore to!
            if group_id == arch_id or group_id == inferred_restore_group_id:
                continue
            try:
                c.execute(
                    "SELECT COUNT(*) FROM user_notes WHERE group_id = ?", (group_id,)
                )
                notes_left = c.fetchone()[0]
                c.execute(
                    "SELECT COUNT(*) FROM user_echoes WHERE group_id = ?", (group_id,)
                )
                echoes_left = c.fetchone()[0]

                if notes_left == 0 and echoes_left == 0:
                    import logging

                    logging.info(
                        f"Archive Folder {group_id} emptied during re-archiving. Destroying it."
                    )
                    c.execute("DELETE FROM note_groups WHERE group_id = ?", (group_id,))
                    c.execute(
                        "DELETE FROM spatial_canvas_metadata WHERE item_id = ?",
                        (group_id,),
                    )
            except Exception as cleanup_e:
                pass

        self.conn.commit()
        return arch_id

    def _group_exists(self, cursor: sqlite3.Cursor, group_id: str | None) -> bool:
        if not group_id:
            return False
        cursor.execute("SELECT 1 FROM note_groups WHERE group_id = ?", (group_id,))
        return bool(cursor.fetchone())

    def _ensure_note_in_cluster_orbit_layout(
        self, cursor: sqlite3.Cursor, cluster_id: str | None, note_id: str | None
    ):
        if not cluster_id or not note_id:
            return

        cursor.execute(
            "SELECT orbit_layout FROM echo_clusters WHERE cluster_id = ?", (cluster_id,)
        )
        row = cursor.fetchone()
        if not row:
            return

        try:
            layout = json.loads(row["orbit_layout"] or "[]")
            if not isinstance(layout, list):
                layout = []
        except Exception:
            layout = []

        if any(
            item.get("type") == "note" and item.get("id") == note_id for item in layout
        ):
            return

        layout.append({"type": "note", "id": note_id})
        cursor.execute(
            "UPDATE echo_clusters SET orbit_layout = ? WHERE cluster_id = ?",
            (json.dumps(layout), cluster_id),
        )

    def _resolve_archive_restore_targets(
        self, cursor: sqlite3.Cursor, archive_id: str
    ) -> tuple[str | None, str | None, str | None, str | None]:
        cursor.execute(
            """
            SELECT restore_group_id, display_parent_id, owner_item_id, owner_item_type
            FROM note_groups
            WHERE group_id = ?
            """,
            (archive_id,),
        )
        row = cursor.fetchone()
        if not row:
            return (None, None, None, None)

        restore_val = row["restore_group_id"]
        display_parent_val = row["display_parent_id"]
        owner_val = row["owner_item_id"]
        owner_type = row["owner_item_type"]

        if restore_val and not self._group_exists(cursor, restore_val):
            restore_val = None
        if display_parent_val and not self._group_exists(cursor, display_parent_val):
            display_parent_val = None

        note_dest = restore_val or display_parent_val
        if note_dest is None and owner_val and self._group_exists(cursor, owner_val):
            note_dest = owner_val

        final_dest = restore_val or display_parent_val or owner_val
        return (note_dest, final_dest, owner_val, owner_type)

    def remove_scattered_items(self, item_ids: list[str]):
        """Partial Unarchive: Restores specific items to their immediate parent slot/folder."""
        c = self.conn.cursor()
        affected_groups = set()

        for item_id in item_ids:
            group_id = None
            c.execute("SELECT group_id FROM user_notes WHERE note_id = ?", (item_id,))
            row = c.fetchone()
            if row and row[0]:
                group_id = row[0]
            else:
                c.execute(
                    "SELECT group_id FROM user_echoes WHERE echo_id = ?", (item_id,)
                )
                row = c.fetchone()
                if row and row[0]:
                    group_id = row[0]

            if not group_id:
                continue

            # NEW STRICT GUARD: Ensure the item is actually inside an archive group
            c.execute(
                "SELECT group_kind FROM note_groups WHERE group_id = ?", (group_id,)
            )
            gk_row = c.fetchone()
            if not gk_row or gk_row[0] != "archive":
                continue

            affected_groups.add(group_id)

            # ✨ THE FIX 2: Safely check if the restore folder exists. If it was deleted, fallback to the main Stack!
            note_dest, final_dest, owner_val, owner_type = (
                self._resolve_archive_restore_targets(c, group_id)
            )

            c.execute(
                "UPDATE user_notes SET group_id = ? WHERE note_id = ?",
                (note_dest, item_id),
            )
            if note_dest is None and owner_type == "cluster":
                self._ensure_note_in_cluster_orbit_layout(c, owner_val, item_id)
            c.execute(
                "UPDATE user_echoes SET group_id = ? WHERE echo_id = ?",
                (final_dest, item_id),
            )

        # Precision Cleanup
        for group_id in affected_groups:
            c.execute("SELECT COUNT(*) FROM user_notes WHERE group_id = ?", (group_id,))
            notes_left = c.fetchone()[0]
            c.execute(
                "SELECT COUNT(*) FROM user_echoes WHERE group_id = ?", (group_id,)
            )
            echoes_left = c.fetchone()[0]

            if notes_left == 0 and echoes_left == 0:
                c.execute("DELETE FROM note_groups WHERE group_id = ?", (group_id,))
                c.execute(
                    "DELETE FROM spatial_canvas_metadata WHERE item_id = ?", (group_id,)
                )

        self.conn.commit()

    def dissolve_inner_archive(self, archive_id: str):
        """Full Unarchive: Dissolves an entire inner folder and returns contents to parent."""
        c = self.conn.cursor()

        # NEW STRICT GUARD: Ensure the target is actually an archive folder
        c.execute(
            "SELECT group_kind FROM note_groups WHERE group_id = ?", (archive_id,)
        )
        gk_row = c.fetchone()
        if not gk_row or gk_row[0] != "archive":
            return  # No-op if it's a regular folder

        note_dest, final_dest, owner_val, owner_type = self._resolve_archive_restore_targets(
            c, archive_id
        )

        c.execute("SELECT note_id FROM user_notes WHERE group_id = ?", (archive_id,))
        archived_note_ids = [row["note_id"] for row in c.fetchall()]

        c.execute(
            "UPDATE user_notes SET group_id = ? WHERE group_id = ?",
            (note_dest, archive_id),
        )
        if note_dest is None and owner_type == "cluster":
            for note_id in archived_note_ids:
                self._ensure_note_in_cluster_orbit_layout(c, owner_val, note_id)
        c.execute(
            "UPDATE user_echoes SET group_id = ? WHERE group_id = ?",
            (final_dest, archive_id),
        )

        c.execute("DELETE FROM note_groups WHERE group_id = ?", (archive_id,))
        c.execute(
            "DELETE FROM spatial_canvas_metadata WHERE item_id = ?", (archive_id,)
        )
        self.conn.commit()


graph_db = GraphDBManager()
