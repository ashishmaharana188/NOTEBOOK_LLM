import tempfile
import unittest
from pathlib import Path

from scripts.reader_service import ReaderManifestService


class FakeGraphDb:
    def __init__(self, identity, manifest):
        self.identity = identity
        self.manifest = manifest

    def resolve_reader_book_identity(self, filename, lid=None):
        return dict(self.identity)

    def get_reader_manifest(self, filename, lid=None):
        return dict(self.manifest)

    def upsert_reader_manifest(self, filename, manifest, lid=None):
        self.manifest = dict(manifest)
        return self.get_reader_manifest(filename, lid)


class ReaderManifestServiceTests(unittest.TestCase):
    def test_epub_content_rebuilds_invalid_section_offsets(self):
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)

        cache_path = Path(temp_dir.name) / "book.txt"
        full_text = "First paragraph.\n\nSecond paragraph."
        cache_path.write_text(full_text, encoding="utf-8")

        identity = {
            "book_key": "lid:test-book.epub",
            "lid": "lid:test",
            "filename": "test-book.epub",
            "format": "epub",
            "file_path": str(Path(temp_dir.name) / "test-book.epub"),
        }
        manifest = {
            "status": "ready",
            "file_fingerprint": "fingerprint",
            "section_index": [
                {
                    "section_index": 0,
                    "label": "Broken section",
                    "start_offset": 999,
                    "end_offset": 1200,
                    "char_length": 201,
                }
            ],
            "content_meta": {
                "supports_section_content": True,
                "cache_path": str(cache_path),
            },
        }
        graph_db = FakeGraphDb(identity, manifest)
        service = ReaderManifestService(graph_db, temp_dir.name, temp_dir.name)
        service.ensure_manifest = lambda filename, lid=None: (identity, graph_db.manifest, "ready")

        _, rebuilt_manifest, sections, status = service.get_text_sections(
            "test-book.epub",
            section=9,
            limit=1,
            lid="lid:test",
        )

        self.assertEqual(status, "ready")
        self.assertEqual(len(rebuilt_manifest["section_index"]), 1)
        self.assertEqual(sections[0]["section_index"], 0)
        self.assertEqual(sections[0]["content"], full_text)


if __name__ == "__main__":
    unittest.main()
