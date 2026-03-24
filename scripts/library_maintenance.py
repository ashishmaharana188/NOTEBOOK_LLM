import os
import logging
import asyncio
from scripts.hydrator import hydrator
from scripts.library_registry import registry
from scripts.parsers import read_any_file_metadata

# CONFIGURATION
BASE_DIR = os.getcwd()
LIBRARY_DIR = os.path.join(BASE_DIR, "data", "library")

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def refresh_library_files():
    """
    Aggressively cleans the library:
    1. Scans data/library/
    2. Hydrates metadata (Clean Title/Author)
    3. Renames files on disk
    4. Registers/Updates the Central Registry
    """
    if not os.path.exists(LIBRARY_DIR):
        logger.error(f"❌ Library directory not found: {LIBRARY_DIR}")
        return {"status": "error", "message": "Library directory missing"}

    files = [
        f
        for f in os.listdir(LIBRARY_DIR)
        if f.lower().endswith((".epub", ".pdf", ".txt", ".md"))
    ]
    logger.info(f"🧹 Starting Aggressive Refresh on {len(files)} files...")

    processed_count = 0
    errors = 0

    for filename in files:
        file_path = os.path.join(LIBRARY_DIR, filename)

        try:
            # 1. Extract Raw Metadata
            meta = read_any_file_metadata(file_path)

            # 2. Hydrate & Clean
            clean_meta = hydrator.hydrate_metadata(filename, meta)

            # 3. Rename File on Disk (Standardize)
            new_path = hydrator.standardize_file_on_disk(
                file_path, clean_meta["title"], clean_meta["author"]
            )

            # 4. Register to DB
            reg_entry = {
                "title": clean_meta["title"],
                "author": clean_meta["author"],
                "year": clean_meta.get("year", 0),
                "file_path": new_path,
                "source": "ingestor",  # Owned file
                "description": meta.get("description", f"Imported from {filename}"),
            }

            lid = registry.register_book(reg_entry)
            processed_count += 1

        except Exception as e:
            logger.error(f"❌ Failed to process {filename}: {e}")
            errors += 1

    logger.info(f"✨ Refresh Complete. Processed: {processed_count}, Errors: {errors}")
    return {"status": "success", "processed": processed_count, "errors": errors}


if __name__ == "__main__":
    refresh_library_files()
