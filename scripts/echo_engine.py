import logging
from collections import defaultdict
from scripts.db_manager import db
from scripts.vectorize import get_embedding

logger = logging.getLogger(__name__)

# Era Labels for UI
ERAS = [
    (1990, 9999, "Information Age"),
    (1945, 1990, "Cold War"),
    (1914, 1945, "World Wars"),
    (1800, 1914, "Industrial Age"),
    (1500, 1800, "Early Modern"),
    (500, 1500, "Medieval"),
    (-500, 500, "Classical"),
]


def get_era_label(year):
    try:
        y = int(year)
        if y == 0:
            return "Unknown"
        for start, end, label in ERAS:
            if start <= y <= end:
                return label
    except:
        pass
    return "Unknown"


def get_echo_context(
    query_text: str,
    current_book_title: str = None,
    current_book_author: str = None,
    limit: int = 15,
):
    logger.info(f"🧠 Echo Search: '{query_text[:30]}...'")

    thought_vec = get_embedding(query_text)

    # Import the new batching logic inline
    from scripts.reasoning import analyze_relations_batch

    # 1. OVER-FETCH: Pull top 50 chunks for deep stacks and diversity
    brain_res = db.search(thought_vec, limit=50, table_name="thoughts")
    registry_res = db.search(thought_vec, limit=15, table_name="registry_vectors")

    # 2. COLLECT AND FILTER
    collected_texts = []
    chunk_metadata = []
    book_counts = defaultdict(int)

    for r in brain_res:
        title = r.get("title", "Unknown")

        if current_book_title and title.lower() == current_book_title.lower():
            continue

        # Diversity limit: Max 3 chunks per book
        if book_counts[title] >= 3:
            continue

        if len(collected_texts) >= limit:
            break

        chunk_text = r.get("text", "")
        collected_texts.append(chunk_text)
        chunk_metadata.append(r)
        book_counts[title] += 1

    # 3. THE SPEED BOOST: Send all chunks to the LLM in ONE batch
    llm_results = analyze_relations_batch(query_text, collected_texts)

    # 4. ASSEMBLE STACKED CARDS
    grouped_books = {}

    for idx, r in enumerate(chunk_metadata):
        title = r.get("title", "Unknown")
        llm_eval = llm_results[idx]

        if llm_eval.get("relation") == "TANGENT":
            continue

        if title not in grouped_books:
            year_val = int(r.get("year", 0) if str(r.get("year", "0")).isdigit() else 0)
            grouped_books[title] = {
                "id": r.get("filename", title),
                "year": year_val,
                "title": title,
                "author": r.get("author", "Unknown"),
                "era": get_era_label(year_val),
                "is_owned": True,
                "chunks": [],
            }

        sim_score = 1 / (1 + r.get("_distance", 0.5))
        sim_percentage = int(sim_score * 100)

        grouped_books[title]["chunks"].append(
            {
                "chunk_id": r.get("chunk_id", r.get("chunk_index", "0")),
                "chunk_ref": r.get("chunk_ref", ""),  # <--- NEW V2 FIELD
                "source_lid": r.get("book_id", ""),
                "filename": r.get("filename", title),
                "chapter": r.get("chapter", "Unknown Chapter"),
                "text": collected_texts[idx][:300] + "...",
                "relation": llm_eval.get("relation", "EXPAND"),
                "bridge": llm_eval.get("bridge", "Semantic Match"),
                "similarity": sim_percentage,
            }
        )

    timeline = list(grouped_books.values())
    timeline = [b for b in timeline if len(b["chunks"]) > 0]
    timeline.sort(key=lambda x: x["year"])

    # 5. FORMAT REGISTRY RECOMMENDATIONS
    recommendations = []
    seen_rec_titles = set()

    for r in registry_res:
        title = r.get("title", "Unknown")
        if title in grouped_books or title in seen_rec_titles:
            continue

        seen_rec_titles.add(title)
        sim_score = 1 / (1 + r.get("_distance", 0.5))

        recommendations.append(
            {
                "id": r.get("lid", r.get("id", "")),
                "title": title,
                "author": r.get("author", "Unknown"),
                "year": int(
                    r.get("year", 0) if str(r.get("year", "0")).isdigit() else 0
                ),
                "similarity": int(sim_score * 100),
                "description": r.get("text", "")[:300] + "...",
            }
        )

        if len(recommendations) >= 5:
            break

    return {"current_year": 0, "timeline": timeline, "recommendations": recommendations}
