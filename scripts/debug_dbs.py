import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LIBRARY_DB_PATH = os.path.join(BASE_DIR, "..", "data", "library.db")


def debug_echo_clusters():
    if not os.path.exists(LIBRARY_DB_PATH):
        print(f"Database not found at {LIBRARY_DB_PATH}")
        return

    conn = sqlite3.connect(LIBRARY_DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    print("--- RECENT ECHO CLUSTERS ---")
    try:
        # Fetch the 10 most recently created clusters
        c.execute(
            "SELECT cluster_id, book_id, library_id, created_at FROM echo_clusters ORDER BY created_at DESC LIMIT 10"
        )
        rows = c.fetchall()

        if not rows:
            print("No clusters found in the database.")

        for r in rows:
            print(f"Cluster ID: {r['cluster_id']}")
            print(f"  -> book_id (String Fallback): '{r['book_id']}'")
            print(f"  -> library_id (Strict Hash):  '{r['library_id']}'")
            print(f"  -> created_at: {r['created_at']}")
            print("-" * 40)

    except sqlite3.OperationalError as e:
        print(f"Database Error (Did the schema migrate?): {e}")

    conn.close()


if __name__ == "__main__":
    debug_echo_clusters()
