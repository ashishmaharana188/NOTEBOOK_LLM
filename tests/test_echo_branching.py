import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import db_manager


class EchoBranchingDbTests(unittest.TestCase):
    def make_manager(self):
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        db_path = Path(temp_dir.name) / "library.db"

        with mock.patch.object(db_manager, "LIBRARY_DB_PATH", str(db_path)):
            manager = db_manager.GraphDBManager()

        self.addCleanup(manager.conn.close)
        manager.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS library_inventory (
                lid TEXT PRIMARY KEY,
                title TEXT
            )
            """
        )
        manager.conn.commit()
        return manager

    def test_create_cluster_persists_source_echo_anchor(self):
        manager = self.make_manager()

        manager.create_cluster("cluster_root", "book-root", library_id="lib-root")
        manager.create_cluster(
            "cluster_branch",
            "book-root",
            parent_cluster_id="cluster_root",
            library_id="lib-root",
            source_echo_id="echo_source_1",
            title="Selection Branch",
            is_active=False,
        )

        clusters = manager.get_all_saved_clusters()
        branch = clusters["cluster_branch"]
        root = clusters["cluster_root"]

        self.assertEqual(branch["source_echo_id"], "echo_source_1")
        self.assertEqual(branch["title"], "Selection Branch")
        self.assertFalse(branch["is_active"])
        self.assertTrue(root["is_active"])

    def test_delete_cluster_removes_nested_descendants(self):
        manager = self.make_manager()

        manager.create_cluster("cluster_root", "book-root", library_id="lib-root")
        manager.create_cluster(
            "cluster_child",
            "book-root",
            parent_cluster_id="cluster_root",
            library_id="lib-root",
            is_active=False,
        )
        manager.create_cluster(
            "cluster_grandchild",
            "book-root",
            parent_cluster_id="cluster_child",
            library_id="lib-root",
            is_active=False,
        )

        manager.save_compound_echo(
            "echo_root",
            "cluster_root",
            "Root insight",
            [{"highlight": "Root insight", "context": "Root chapter"}],
            title="Root insight",
        )
        manager.save_compound_echo(
            "echo_grandchild",
            "cluster_grandchild",
            "Grandchild insight",
            [{"highlight": "Grandchild insight", "context": "Grand chapter"}],
            title="Grandchild insight",
        )

        manager.delete_cluster("cluster_root")

        cluster_count = manager.conn.execute(
            "SELECT COUNT(*) FROM echo_clusters"
        ).fetchone()[0]
        echo_count = manager.conn.execute(
            "SELECT COUNT(*) FROM user_echoes"
        ).fetchone()[0]

        self.assertEqual(cluster_count, 0)
        self.assertEqual(echo_count, 0)

    def test_empty_child_branch_survives_cleanup(self):
        manager = self.make_manager()

        manager.create_cluster("cluster_root", "book-root", library_id="lib-root")
        manager.create_cluster(
            "cluster_child_empty",
            "book-root",
            parent_cluster_id="cluster_root",
            library_id="lib-root",
            title="Manual Branch",
            is_active=False,
        )

        manager.clean_orphan_clusters()

        child = manager.conn.execute(
            "SELECT cluster_id FROM echo_clusters WHERE cluster_id = ?",
            ("cluster_child_empty",),
        ).fetchone()

        self.assertIsNotNone(child)


if __name__ == "__main__":
    unittest.main()
