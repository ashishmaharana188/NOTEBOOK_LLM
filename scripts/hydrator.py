import os
import re
import logging
import sqlite3
import time
import requests
import concurrent.futures
import random

# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIBRARY_DIR = os.path.join(BASE_DIR, "data", "library")
DB_PATH = os.path.join(BASE_DIR, "data", "library.db")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Hydrator:
    def __init__(self):
        self.junk_patterns = [
            r"\(z-lib\.org\)",
            r"\(libgen\)",
            r"\[b-ok\]",
            r"\(.*?\)",
            r"\[.*?\]",
            r"_",
            r"\.epub$",
            r"\.pdf$",
            r"\.txt$",
        ]

    def clean_text(self, text):
        if not text:
            return ""
        cleaned = text
        for pattern in self.junk_patterns:
            cleaned = re.sub(pattern, " ", cleaned, flags=re.IGNORECASE)
        return re.sub(r"\s+", " ", cleaned).strip()

    def extract_metadata_from_filename(self, filename):
        name = os.path.splitext(filename)[0]
        if " - " in name:
            parts = name.split(" - ")
            return self.clean_text(parts[0]), (
                self.clean_text(parts[1]) if len(parts) > 1 else "Unknown"
            )
        elif " by " in name:
            parts = name.split(" by ")
            return self.clean_text(parts[0]), (
                self.clean_text(parts[1]) if len(parts) > 1 else "Unknown"
            )
        return self.clean_text(name), "Unknown"

    def hydrate_metadata(self, filename, internal_meta):
        """Merges internal metadata with filename guesses."""
        file_title, file_author = self.extract_metadata_from_filename(filename)

        final_title = internal_meta.get("title")
        if not final_title or len(final_title) < 2 or "Unknown" in final_title:
            final_title = file_title

        final_author = internal_meta.get("author")
        if not final_author or len(final_author) < 2 or "Unknown" in final_author:
            final_author = file_author

        return {
            "title": self.clean_text(final_title),
            "author": self.clean_text(final_author),
            "year": internal_meta.get("year", 0),
            "source": "hydrated",
        }

    def standardize_file_on_disk(self, file_path, title, author):
        directory = os.path.dirname(file_path)
        extension = os.path.splitext(file_path)[1]
        safe_title = re.sub(r"[^a-zA-Z0-9 ]", "", title).strip()
        safe_author = re.sub(r"[^a-zA-Z0-9 ]", "", author).strip()
        new_filename = f"{safe_title} - {safe_author}{extension}"
        new_path = os.path.join(directory, new_filename)

        if os.path.exists(new_path) and os.path.abspath(new_path) != os.path.abspath(
            file_path
        ):
            return new_path
        try:
            os.rename(file_path, new_path)
            return new_path
        except Exception as e:
            return file_path


class APIHydrator:
 

    def __init__(self):
        self.db_path = DB_PATH
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        )
        self.google_banned = False

    def fetch_google_books(self, title, author):
        if self.google_banned:
            return None

        try:
            q = f'intitle:"{title}"'
            if author and author.lower() != "unknown":
                q += f'+inauthor:"{author}"'

            url = f"https://www.googleapis.com/books/v1/volumes?q={q}&maxResults=1"
            resp = self.session.get(url, timeout=5)

            if resp.status_code == 200:
                data = resp.json()
                if "items" in data and len(data["items"]) > 0:
                    vol = data["items"][0]["volumeInfo"]
                    return {
                        "description": vol.get("description", ""),
                        "categories": vol.get("categories", []),
                    }
            elif resp.status_code == 429:
                logger.error(
                    f"Google Rate Limit (429) Switching to OpenLibrary."
                )
                self.google_banned = True

        except Exception:
            pass
        return None

    def fetch_openlibrary(self, title, author):
        try:
            q = f'title="{title}"'
            if author and author.lower() != "unknown":
                q += f'&author="{author}"'

            url = f"https://openlibrary.org/search.json?{q}&limit=1"
            resp = self.session.get(url, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                if "docs" in data and len(data["docs"]) > 0:
                    doc = data["docs"][0]
                    return {"subjects": doc.get("subject", [])}
        except Exception:
            pass
        return None

    def process_single_book(self, book):
        lid, title, author = book["lid"], book["title"], book["author"]
        new_desc = book["description"] or ""
        new_tags = book["group_tag"] or ""

        time.sleep(random.uniform(1.0, 2.5))

        gb_data = self.fetch_google_books(title, author)
        if gb_data:
            if gb_data.get("description") and len(gb_data["description"]) > len(
                new_desc
            ):
                new_desc = gb_data["description"]
            if gb_data.get("categories"):
                new_tags = ", ".join(gb_data["categories"])

        if not new_tags or self.google_banned:
            ol_data = self.fetch_openlibrary(title, author)
            if ol_data and ol_data.get("subjects"):
                new_tags = ", ".join(ol_data["subjects"][:3])

        return {
            "lid": lid,
            "new_desc": new_desc,
            "new_tags": new_tags,
            "changed": new_desc != (book["description"] or "")
            or new_tags != (book["group_tag"] or ""),
        }

    def run_hydration_loop(self):
        logger.info("🔍 Starting Resilient API Metadata Hydration...")
        if not os.path.exists(self.db_path):
            return

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        c.execute(
            """
            SELECT lid, title, author, description, group_tag 
            FROM library_inventory 
            WHERE description IS NULL OR description = '' OR length(description) < 30
               OR group_tag IS NULL OR group_tag = ''
            LIMIT 200
        """
        )
        starving_books = c.fetchall()

        if not starving_books:
            logger.info("No starving books found. Database is fully hydrated.")
            conn.close()
            return

        total_books = len(starving_books)
        logger.info(f"⚡ Hydrating {total_books} books using 3 concurrent threads...")
        results = []

        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            future_to_book = {
                executor.submit(self.process_single_book, dict(b)): b
                for b in starving_books
            }

            processed = 0
            for future in concurrent.futures.as_completed(future_to_book):
                try:
                    res = future.result()
                    results.append(res)
                    processed += 1

                    if processed % 10 == 0 or processed == total_books:
                        logger.info(
                            f"   ⏳ Progress: {processed}/{total_books} books processed..."
                        )

                except Exception as e:
                    logger.error(f"Thread failed: {e}")

        updated_count = 0
        for res in results:
            if res["changed"]:
                c.execute(
                    """
                    UPDATE library_inventory 
                    SET description = ?, group_tag = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE lid = ?
                """,
                    (res["new_desc"], res["new_tags"], res["lid"]),
                )
                c.execute(
                    "UPDATE library_fts SET description = ? WHERE lid = ?",
                    (res["new_desc"], res["lid"]),
                )
                updated_count += 1

        conn.commit()
        conn.close()
        logger.info(
            f"Batch Hydration Complete! Enriched {updated_count} out of {total_books} books."
        )


# --- INSTANTIATE GLOBAL EXPORTS ---
hydrator = Hydrator()
api_hydrator = APIHydrator()


def hydrate_entire_library():
   
    if os.path.exists(LIBRARY_DIR):
        logger.info(f" Standardizing filenames in {LIBRARY_DIR}...")
        files = [
            f
            for f in os.listdir(LIBRARY_DIR)
            if os.path.isfile(os.path.join(LIBRARY_DIR, f))
        ]
        for f in files:
            guessed_title, guessed_author = hydrator.extract_metadata_from_filename(f)
            hydrator.standardize_file_on_disk(
                os.path.join(LIBRARY_DIR, f), guessed_title, guessed_author
            )

    api_hydrator.run_hydration_loop()


if __name__ == "__main__":
    hydrate_entire_library()
