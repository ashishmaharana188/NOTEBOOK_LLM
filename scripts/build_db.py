import pandas as pd
import os
import glob
import logging
from scripts.library_registry import registry

# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data", "crawler")

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def clean_text(text):
    if pd.isna(text) or str(text).strip() == "":
        return ""
    return str(text).replace("\n", " ").replace("\r", "").strip()


def ingest_csvs():
    """
    Reads all CSVs in data/crawler/ and registers them into the Central Library Registry.
    Extracts Genre, Year, and Rating data.
    """
    if not os.path.exists(DATA_DIR):
        logger.warning(f"Data directory not found: {DATA_DIR}")
        os.makedirs(DATA_DIR, exist_ok=True)
        return {
            "status": "error",
            "message": f"Created {DATA_DIR}. Please drop CSVs there.",
        }

    csv_files = glob.glob(os.path.join(DATA_DIR, "*.csv"))
    if not csv_files:
        logger.warning(f" No CSV files found in {DATA_DIR}")
        return {"status": "empty", "message": "No CSV files found in data/crawler/"}

    count = 0
    try:
        for file_path in csv_files:
            filename = os.path.basename(file_path)
            logger.info(f" Processing CSV: {filename}...")

            try:
                df = pd.read_csv(file_path, engine="python", on_bad_lines="skip")
                df.columns = [col.strip().lower() for col in df.columns]

                # Identify Columns
                def get_col_name(options):
                    for opt in options:
                        if opt in df.columns:
                            return opt
                    return None

                col_title = get_col_name(["title", "book_title", "name", "work_title"])
                col_rating = get_col_name(
                    ["rating", "average_rating", "score", "stars"]
                )
                col_count = get_col_name(["rating_count", "votes", "count"])
                col_author = get_col_name(["author", "authors", "writer"])

                # Genre / Group Tag
                col_genre = get_col_name(
                    ["search_term", "bookshelves", "genre", "shelf", "category", "tags"]
                )

                # FIX: Explicitly look for Year, Description, and URL columns
                col_year = get_col_name(
                    [
                        "publication_year",
                        "original_publication_year",
                        "year",
                        "date",
                        "published_date",
                    ]
                )
                col_desc = get_col_name(["description", "summary", "synopsis", "blurb"])
                col_url = get_col_name(["url", "link"])

                if not col_title:
                    logger.warning(
                        f" Skipping {filename}: Could not find Title column."
                    )
                    continue

                for _, row in df.iterrows():
                    # Extract Data
                    title_raw = row[col_title]
                    if pd.isna(title_raw) or str(title_raw).strip() == "":
                        continue

                    title = clean_text(title_raw)
                    author = clean_text(row[col_author]) if col_author else "Unknown"

                    rating = 0.0
                    if col_rating:
                        try:
                            rating = float(str(row[col_rating]).replace(",", ""))
                        except:
                            pass

                    rating_count = 0
                    if col_count:
                        try:
                            rating_count = int(
                                float(str(row[col_count]).replace(",", ""))
                            )
                        except:
                            pass

                    group_tag = ""
                    if col_genre:
                        group_tag = clean_text(row[col_genre])

                    # FIX: Parsing Logic for Year
                    year = 0
                    if col_year:
                        try:
                            val = str(row[col_year]).strip()
                            if "." in val:
                                val = val.split(".")[0]
                            if "-" in val:
                                val = val.split("-")[0]
                            if val.isdigit():
                                year = int(val)
                        except:
                            pass

                    # FIX: Parsing Logic for Description & URL
                    description = ""
                    if col_desc:
                        description = clean_text(row[col_desc])

                    url = ""
                    if col_url:
                        url = clean_text(row[col_url])

                    # REGISTER TO CENTRAL REGISTRY
                    meta = {
                        "title": title,
                        "author": author,
                        "rating": rating,
                        "rating_count": rating_count,
                        "group_tag": group_tag,
                        "year": year,
                        "source": "crawler",
                        # Fallback to the default string only if the CSV has absolutely no description
                        "description": (
                            description if description else f"Imported from {filename}"
                        ),
                        "url": url,
                    }

                    registry.register_book(meta)
                    count += 1

            except Exception as e:
                logger.error(f" Error processing {filename}: {e}")

        logger.info(f"Sync Complete! Registered {count} books in Library DB.")
        return {"status": "success", "count": count}

    except Exception as e:
        logger.error(f"Sync Error: {e}")
        return {"status": "error", "message": str(e)}


if __name__ == "__main__":
    ingest_csvs()
