import os
import re

import ebooklib
import fitz  # PyMuPDF
from bs4 import BeautifulSoup
from ebooklib import epub


def clean_text(text):

    text = re.sub(r"(\w+)-\s*\n\s*(\w+)", r"\1\2", text)
    text = re.sub(r"\n\s*\n", "\n\n", text)
    return text.strip()


def extract_pdf_data(file_path):

    try:
        doc = fitz.open(file_path)

        # 1. Extract Text & Track Offsets
        full_text = ""
        page_offsets = []

        for page in doc:
            page_offsets.append(len(full_text))
            # Clean page-by-page so the character offsets perfectly match the final text
            cleaned_page = clean_text(page.get_text())
            full_text += cleaned_page + "\n\n"

        # 2. Extract ToC and map to Char Index
        raw_toc = doc.get_toc()
        structured_toc = []

        for item in raw_toc:
            lvl, title, page_num = item[0], item[1], item[2]

            char_idx = 0
            # Ensure the page number exists in our offset array
            if 0 < page_num <= len(page_offsets):
                char_idx = page_offsets[page_num - 1]

            structured_toc.append(
                {
                    "label": title,
                    "level": lvl,
                    "page": page_num - 1,
                    "char_index": char_idx,  # <--- CRITICAL FOR MAPPING
                }
            )

        return {"text": full_text.strip(), "toc": structured_toc}
    except Exception as e:
        print(f"PDF Parse Error: {e}")
        raise e


def extract_epub_data(file_path):

    try:
        book = epub.read_epub(file_path)

        # 1. Extract Text & Map Chapters
        full_text = ""
        structured_toc = []
        item_offsets = {}
        current_offset = 0

        for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
            soup = BeautifulSoup(item.get_content(), "html.parser")
            text = soup.get_text(separator="\n")
            cleaned = clean_text(text)

            item_offsets[item.get_name()] = current_offset
            full_text += cleaned + "\n\n"
            current_offset = len(full_text)

        # 2. Process Native ToC
        def process_toc_items(items, level=1):
            result = []
            for item in items:
                if isinstance(item, tuple) or isinstance(item, list):
                    section_title, sub_items = item[0], item[1:]
                    result.extend(process_toc_items(sub_items, level + 1))
                elif isinstance(item, epub.Link):
                    href_clean = item.href.split("#")[0]
                    char_index = item_offsets.get(href_clean, 0)
                    result.append(
                        {
                            "label": item.title,
                            "level": level,
                            "char_index": char_index,
                            "href": item.href,
                        }
                    )
            return result

        structured_toc = process_toc_items(book.toc)

        return {"text": full_text, "toc": structured_toc, "type": "epub"}
    except Exception as e:
        print(f"EPUB Parse Error: {e}")
        raise e


def extract_txt_data(file_path):
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        text = clean_text(f.read())
    return {"text": text, "toc": []}


def read_any_file_metadata(file_path):

    _, ext = os.path.splitext(file_path)
    ext = ext.lower()

    print(f"Parsing: {os.path.basename(file_path)} ({ext})")

    if ext == ".pdf":
        return extract_pdf_data(file_path)
    elif ext == ".epub":
        return extract_epub_data(file_path)
    elif ext in [".txt", ".md"]:
        return extract_txt_data(file_path)
    else:
        # Fallback for unknown files - try simple read
        try:
            return extract_txt_data(file_path)
        except:
            raise ValueError(f"Unsupported file format: {ext}")
