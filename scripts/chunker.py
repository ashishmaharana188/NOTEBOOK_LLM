import os
import json
import re

# CONFIGURATION
PROCESSED_DIR = "data/processed"
OUTPUT_FILE = "data/dataset.json"

# LOGIC SETTINGS
WINDOW_SIZE = 1000  # Size of the thought unit
OVERLAP = 200  # Size of the logical bridge


def chunk_text(text, chunk_size=800, overlap=0):
    """
    Splits text cleanly by natural paragraph boundaries.
    It groups smaller paragraphs together up to the target chunk_size.
    We intentionally REMOVE overlap so that when the UI stitches chunks
    back together, there is no duplicated text!
    """
    if not text:
        return []

    # Standardize whitespace but preserve natural paragraph breaks
    text = text.replace("\r\n", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)

    paragraphs = text.split("\n\n")

    chunks = []
    current_chunk = ""

    for para in paragraphs:
        # Clean up weird spaces inside the paragraph
        para = re.sub(r"\s+", " ", para).strip()
        if not para:
            continue

        # If adding this paragraph exceeds our limit, save the current chunk and start a new one
        if len(current_chunk) + len(para) > chunk_size and current_chunk:
            chunks.append(current_chunk.strip())
            current_chunk = ""

        current_chunk += para + "\n\n"

    if current_chunk.strip():
        chunks.append(current_chunk.strip())

    return chunks


def parse_metadata(filename):
    """
    Extracts info from: clean_The Republic_Plato_-375.txt
    Strategy: Split by '_' and grab specific indices.
    """
    try:
        # Remove extension and 'clean_' prefix
        name = filename.replace(".txt", "")
        parts = name.split("_")

        # Format is: clean, Title, Author, Year
        # parts[0] is "clean"
        title = parts[1]
        author = parts[2]
        year = parts[3]

        return title, author, year
    except Exception as e:
        print(f"Metadata Error ({filename}): {e}")
        return "Unknown", "Unknown", "0000"


def create_sliding_window(text):
    chunks = []
    # Step size is the window minus the overlap (1000 - 200 = 800)
    step = WINDOW_SIZE - OVERLAP

    for i in range(0, len(text), step):
        chunk = text[i : i + WINDOW_SIZE]

        # Only keep chunks that are substantial (ignore tiny end bits)
        if len(chunk) > 100:
            chunks.append(chunk)
    return chunks


def main():
    print("Starting Deconstruction...")
    all_records = []

    files = [f for f in os.listdir(PROCESSED_DIR) if f.endswith(".txt")]

    for filename in files:
        # 1. Extract Metadata (Who wrote this and when?)
        title, author, year = parse_metadata(filename)

        # 2. Load the Text
        path = os.path.join(PROCESSED_DIR, filename)
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()

        # 3. Slice it (The Sliding Window)
        text_chunks = create_sliding_window(text)

        # 4. Tag it (Assign ID and Metadata)
        for i, segment in enumerate(text_chunks):
            record = {
                "id": f"{title}_{i}",  # Unique Row ID
                "text": segment,  # The Content
                "metadata": {  # The Context
                    "title": title,
                    "author": author,
                    "year": year,
                },
            }
            all_records.append(record)

        print(f"   -> {title}: Created {len(text_chunks)} segments.")

    # 5. Save the Master Database
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_records, f, indent=4)

    print(
        f"\n DATABASE READY: {len(all_records)} total thoughts stored in {OUTPUT_FILE}"
    )


if __name__ == "__main__":
    main()
