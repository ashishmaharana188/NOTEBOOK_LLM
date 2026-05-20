import lancedb
import os
import sqlite3
import numpy as np
import logging
from typing import List, Dict, Optional, Union
from scripts.vectorize import get_embedding
from scripts.db_manager import DB_PATH as LANCE_DB_PATH

# CONFIGURATION
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIBRARY_DB_PATH = os.path.join(BASE_DIR, "data", "library.db")
REGISTRY_TABLE = "registry_vectors"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_user_taste_vector() -> Optional[np.ndarray]:
    """Calculates the 'User Taste Vector' based on Library Inventory."""
    if not os.path.exists(LIBRARY_DB_PATH):
        return None

    conn = sqlite3.connect(LIBRARY_DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT lid FROM library_inventory WHERE file_path IS NOT NULL")

    owned_lids = [str(row["lid"]) for row in c.fetchall()]
    conn.close()

    if not owned_lids:
        return None

    try:
        db = lancedb.connect(LANCE_DB_PATH)
        if REGISTRY_TABLE not in db.table_names():
            return None

        tbl = db.open_table(REGISTRY_TABLE)
        vectors = []

        for lid in owned_lids:
       
            res = tbl.search().where(f"book_id = '{lid}'").limit(1).to_list()
            if res and "vector" in res[0]:
                vectors.append(res[0]["vector"])

        if not vectors:
            return None
        return np.mean(vectors, axis=0)
    except Exception as e:
        logger.error(f"Error calculating taste vector: {e}")
        return None


def get_recommendations(
    limit: int = 20, genre_filter: str = None, user_query: str = None
) -> Union[List[Dict], Dict]:
    """
    The Discover Recommender.
    Fixed to avoid 'Self-Cannibalization' and support manual topics.
    """
    try:
        db = lancedb.connect(LANCE_DB_PATH)
        if REGISTRY_TABLE not in db.table_names():
            return {"error": "Registry Index not built."}

        tbl = db.open_table(REGISTRY_TABLE)

        # 1. Determine Query Vector
        query_vec = None
        if user_query and len(user_query.strip()) > 0:
            query_vec = get_embedding(user_query)
        else:
            user_taste = get_user_taste_vector()
            if genre_filter and genre_filter != "All":
                genre_vec = np.array(get_embedding(genre_filter))
                if user_taste is not None:
                    # Weighted Average: 70% Genre, 30% User Taste
                    query_vec = (0.7 * genre_vec) + (0.3 * user_taste)
                else:
                    query_vec = genre_vec
            else:
                # Fallback if no taste (Cold Start)
                query_vec = (
                    user_taste
                    if user_taste is not None
                    else get_embedding("philosophy history science")
                )

        # 2. Identify Owned Books
        conn = sqlite3.connect(LIBRARY_DB_PATH)
        c = conn.cursor()
        c.execute("SELECT lid FROM library_inventory WHERE file_path IS NOT NULL")
     
        owned_ids = {str(r[0]) for r in c.fetchall()}
        conn.close()

        # 3. Perform Vector Search
        search_limit = max(500, len(owned_ids) * 2)

       
        if isinstance(query_vec, np.ndarray):
            query_vec = query_vec.tolist()

        search_res = tbl.search(query_vec).limit(search_limit).to_list()

        filtered_results = []
        for r in search_res:
        
            if str(r.get("book_id", "")) not in owned_ids:
                filtered_results.append(r)
                if len(filtered_results) >= limit:
                    break

        # 4. Quality Sort
        filtered_results.sort(key=lambda x: x.get("rating", 0) or 0, reverse=True)
        return filtered_results[:limit]

    except Exception as e:
        logger.error(f"Recommender Error: {e}")
        return []
