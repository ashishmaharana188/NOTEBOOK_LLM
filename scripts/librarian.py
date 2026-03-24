import os
import asyncio
import httpx
import requests
import shutil
import tarfile
import json
from collections import Counter
import gutenbergpy.textget
from gutenbergpy.gutenbergcache import GutenbergCache, GutenbergCacheSettings

# CONFIGURATION
BASE_DIR = os.getcwd()
LIBRARY_DIR = os.path.join(BASE_DIR, "data", "library")
CACHE_DIR = os.path.join(BASE_DIR, "cache")
ARCHIVE_NAME = "rdf-files.tar.bz2"
ARCHIVE_PATH = os.path.join(CACHE_DIR, ARCHIVE_NAME)
DB_PATH = "gutenbergindex.db"

# Ensure settings point to our local DB
GutenbergCacheSettings.CACHE_FILENAME = DB_PATH


def check_catalog_status():
    """Checks if the Gutenberg Catalog DB exists."""
    exists = os.path.exists(DB_PATH) and GutenbergCache.exists()
    return exists


def download_file_robustly(url, dest_path):
    """Downloads a file with timeout and error handling."""
    if not os.path.exists(os.path.dirname(dest_path)):
        os.makedirs(os.path.dirname(dest_path))

    print(f"⬇️ Downloading: {url}")
    with httpx.Client(follow_redirects=True, timeout=60.0) as client:
        try:
            with client.stream("GET", url) as r:
                r.raise_for_status()
                with open(dest_path, "wb") as f:
                    for chunk in r.iter_bytes(chunk_size=8192):
                        f.write(chunk)
            print(f"✅ Download Complete: {os.path.basename(dest_path)}")
        except Exception as e:
            print(f"❌ Download Error for {url}: {e}")
            if os.path.exists(dest_path):
                os.remove(dest_path)  # Clean up partial files
            raise e


# --- GUTENBERG LOGIC ---


def build_catalog():
    """Builds the local Gutenberg SQLite catalog from scratch."""
    GutenbergCacheSettings.CACHE_FILENAME = DB_PATH
    if GutenbergCache.exists():
        return {"status": "skipped", "message": "Catalog exists."}

    os.makedirs(CACHE_DIR, exist_ok=True)

    # Download the RDF Catalog
    download_file_robustly(
        "https://www.gutenberg.org/cache/epub/feeds/rdf-files.tar.bz2", ARCHIVE_PATH
    )

    GutenbergCacheSettings.CACHE_RDF_ARCHIVE_NAME = os.path.abspath(ARCHIVE_PATH)

    if os.path.exists(DB_PATH):
        try:
            os.remove(DB_PATH)
        except:
            pass

    # Create the cache
    GutenbergCache.create(
        refresh=False,
        download=False,
        unpack=True,
        parse=True,
        cache=True,
        deleteTemp=True,
    )


def search_gutenberg(query, filter_type="title", subject=None, limit=25):
    """
    Searches the local Gutenberg SQLite catalog.
    """
    GutenbergCacheSettings.CACHE_FILENAME = DB_PATH
    if not os.path.exists(DB_PATH):
        return []

    cache = GutenbergCache.get_cache()

    # 1. Sanitize Query (Remove punctuation that breaks SQL LIKE)
    safe_query = query.replace("'", "''") if query else ""
    # Split by spaces but strip commas/dots from tokens
    words = [w.strip(".,;") for w in safe_query.split() if w.strip(".,;")]

    conditions = []

    # 2. Text Search
    if words:
        if filter_type == "author":
            target_col = "A.name"
        elif filter_type == "group":
            target_col = "S.name"
        else:
            target_col = "T.name"

        text_cond = " AND ".join([f"{target_col} LIKE '%{word}%'" for word in words])
        conditions.append(text_cond)

    # 3. Subject Filter
    if subject and subject != "All":
        conditions.append(f"S.name LIKE '%{subject}%'")

    if not conditions:
        return []

    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT B.gutenbergbookid, T.name, A.name, GROUP_CONCAT(DISTINCT S.name), BS.name 
        FROM books B 
        JOIN titles T ON B.id = T.bookid 
        LEFT JOIN book_authors BA ON B.id = BA.bookid 
        LEFT JOIN authors A ON BA.authorid = A.id 
        LEFT JOIN book_subjects BSUB ON B.id = BSUB.bookid 
        LEFT JOIN subjects S ON BSUB.subjectid = S.id 
        LEFT JOIN bookshelves BS ON B.bookshelveid = BS.id 
        WHERE {where_clause} 
        GROUP BY B.gutenbergbookid 
        LIMIT {limit}
    """

    results = []
    try:
        cursor = cache.native_query(sql)
        for row in cursor:
            results.append(
                {
                    "id": row[0],
                    "title": str(row[1]) if row[1] else "Untitled",
                    "author": str(row[2]) if row[2] else "Unknown",
                    "subjects": str(row[3]).split(",") if row[3] else [],
                    "source": "Gutenberg",
                }
            )
    except Exception as e:
        print(f"⚠️ SQL Search Error: {e}")
        return []

    return results


def download_book(book_id, title=None, preferred_format="epub"):
    """
    Downloads a book from Gutenberg with format selection (epub, pdf, txt) and fallbacks.
    """
    if not title:
        title = f"Book_{book_id}"

    os.makedirs(LIBRARY_DIR, exist_ok=True)

    # Sanitize title for filename
    safe_title = "".join(
        [c for c in title if c.isalnum() or c in (" ", "-", "_")]
    ).strip()

    priorities = []
    if preferred_format == "pdf":
        priorities = ["pdf", "epub", "txt"]
    elif preferred_format == "txt":
        priorities = ["txt", "epub", "pdf"]
    else:
        priorities = ["epub", "pdf", "txt"]

    print(f"📚 Downloading {title} (ID: {book_id}). Format Priority: {priorities}")

    for fmt in priorities:
        try:
            if fmt == "epub":
                url = f"https://www.gutenberg.org/cache/epub/{book_id}/pg{book_id}-images.epub"
                filename = f"{safe_title}.epub"
                dest_path = os.path.join(LIBRARY_DIR, filename)
                if os.path.exists(dest_path):
                    return filename
                download_file_robustly(url, dest_path)
                return filename

            elif fmt == "txt":
                filename = f"{safe_title}.txt"
                dest_path = os.path.join(LIBRARY_DIR, filename)
                if os.path.exists(dest_path):
                    return filename
                try:
                    raw_bytes = gutenbergpy.textget.get_text_by_id(int(book_id))
                    if not raw_bytes:
                        raise Exception("Empty content")
                    with open(dest_path, "w", encoding="utf-8") as f:
                        f.write(raw_bytes.decode("utf-8"))
                    return filename
                except:
                    url = f"https://www.gutenberg.org/cache/epub/{book_id}/pg{book_id}.txt"
                    download_file_robustly(url, dest_path)
                    return filename

            elif fmt == "pdf":
                url = f"https://www.gutenberg.org/files/{book_id}/{book_id}-pdf.pdf"
                filename = f"{safe_title}.pdf"
                dest_path = os.path.join(LIBRARY_DIR, filename)
                if os.path.exists(dest_path):
                    return filename
                download_file_robustly(url, dest_path)
                return filename

        except Exception as e:
            print(f"⚠️ Format '{fmt}' failed for {book_id}. Trying next...")
            continue

    raise Exception(f"Failed to download {book_id}")


# --- INTERNET ARCHIVE LOGIC ---


def clean_ia_field(value, default="Unknown"):
    if value is None:
        return default
    if isinstance(value, list):
        valid_items = [str(v).strip() for v in value if v]
        return ", ".join(valid_items) if valid_items else default
    return str(value).strip() or default


def generate_local_facets(results):
    subject_counter = Counter()
    author_counter = Counter()
    for item in results:
        subs = item.get("subjects", [])
        if isinstance(subs, list):
            for s in subs:
                subject_counter[s] += 1
        auth = item.get("author", "Unknown")
        if auth and auth != "Unknown":
            for a in auth.split(","):
                author_counter[a.strip()] += 1
    facets = []
    for name, count in author_counter.most_common(5):
        facets.append({"name": name, "count": count, "type": "author"})
    for name, count in subject_counter.most_common(8):
        facets.append({"name": name, "count": count, "type": "subject"})
    return facets


async def search_internet_archive_async(
    query=None, title=None, author=None, subject=None, page=1, rows=20
):
    base_url = "https://archive.org/advancedsearch.php"
    query_parts = [
        "mediatype:(texts)",
        "(language:eng OR language:English)",
        "-collection:(inlibrary)",
    ]

    # Precise Field Search
    if title:
        query_parts.append(f"title:({title})")
    if author:
        query_parts.append(f"creator:({author})")
    if subject and subject != "All":
        query_parts.append(f'subject:"{subject}"')

    # General Query (Fallback/Addition)
    if query:
        query_parts.append(f"({query})")

    full_query = " AND ".join(query_parts)

    params = {
        "q": full_query,
        "fl[]": ["identifier", "title", "creator", "date", "description", "subject"],
        "rows": rows,
        "page": page,
        "output": "json",
        "sort": ["downloads desc"],
    }

    print(f"🔍 Async Search IA: {full_query}")

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(base_url, params=params, timeout=10.0)
            data = resp.json()

            response_body = data.get("response", {})
            docs = response_body.get("docs", [])
            num_found = response_body.get("numFound", 0)

            results = []
            for doc in docs:
                # Same mapping logic as before...
                t = clean_ia_field(doc.get("title"), "Untitled")
                a = clean_ia_field(doc.get("creator"), "Unknown")
                identifier = doc.get("identifier")
                cover_url = (
                    f"https://archive.org/services/img/{identifier}"
                    if identifier
                    else None
                )

                results.append(
                    {
                        "id": identifier,
                        "title": t,
                        "author": a,
                        "year": doc.get("date", "0000")[:4],
                        "subjects": (
                            doc.get("subject", [])[:5]
                            if isinstance(doc.get("subject"), list)
                            else []
                        ),
                        "cover": cover_url,
                        "source": "Internet Archive",
                    }
                )

            facets = generate_local_facets(results)
            return {"results": results, "total": num_found, "facets": facets}
        except Exception as e:
            print(f"IA Async Error: {e}")
            return {"results": [], "total": 0, "facets": []}


def download_ia_item(identifier, title, preferred_format="epub"):
    """
    Downloads item with Smart Fallback based on user preference.
    """
    metadata_url = f"https://archive.org/metadata/{identifier}"
    resp = requests.get(metadata_url)
    data = resp.json()
    files = data.get("files", [])

    target_file = None
    if preferred_format == "pdf":
        priorities = [".pdf", ".epub", ".txt"]
    elif preferred_format == "txt":
        priorities = [".txt", ".epub", ".pdf"]
    else:
        priorities = [".epub", ".pdf", ".txt"]

    print(f"🔍 Checking formats for {identifier}. Priority: {priorities}")

    for ext in priorities:
        for f in files:
            fname = f.get("name", "").lower()
            if fname.endswith(ext):
                target_file = f.get("name")
                break
        if target_file:
            break

    if not target_file:
        raise Exception(f"No suitable format found.")

    download_url = f"https://archive.org/download/{identifier}/{target_file}"
    os.makedirs(LIBRARY_DIR, exist_ok=True)
    safe_title = "".join(
        [c for c in title if c.isalnum() or c in (" ", "-", "_")]
    ).strip()
    ext = os.path.splitext(target_file)[1]
    filename = f"{safe_title}_IA{ext}"
    dest_path = os.path.join(LIBRARY_DIR, filename)

    download_file_robustly(download_url, dest_path)
    return filename
