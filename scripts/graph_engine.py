import os
import json
import logging
from scripts.db_manager import graph_db, db

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIBRARY_DB_PATH = os.path.join(BASE_DIR, "data", "library.db")


def get_core_graph():
    """
    Builds the 5-Layer Arc Reactor Payload.
    Uses strict Deterministic ID mapping to perfectly route Layer 3 -> Layer 1 without fuzzy string matching.
    """
    nodes = []
    edges = []
    node_ids = set()
    seen_cross_links = set()
    seen_hub_links = set()
    seen_catalyst_links = set()

    # --- LAYER 1: CORE (Library Books) ---
    library_books = {}
    library_lid_by_filename = {}
    library_lid_by_title = {}

    def normalize_book_key(value):
        if value is None:
            return ""
        normalized = str(value).strip().replace("\\", "/")
        if "/" in normalized:
            normalized = normalized.split("/")[-1]
        lowered = normalized.lower()
        for suffix in (".pdf", ".epub", ".txt", ".md"):
            if lowered.endswith(suffix):
                normalized = normalized[: -len(suffix)]
                lowered = normalized.lower()
        return lowered
    try:
        import sqlite3

        lib_conn = sqlite3.connect(LIBRARY_DB_PATH)
        lib_conn.row_factory = sqlite3.Row
        lib_c = lib_conn.cursor()
        lib_c.execute("SELECT * FROM library_inventory")
        books = lib_c.fetchall()

        for row in books:
            b = dict(row)
            title = b["title"] or "Unknown Book"
            lid_str = str(b["lid"])  # The indestructible hash!
            library_books[lid_str] = lid_str
            filename = b.get("file_path") or title
            normalized_filename = normalize_book_key(filename)
            normalized_title = normalize_book_key(title)
            if normalized_filename:
                library_lid_by_filename[normalized_filename] = lid_str
            if normalized_title:
                library_lid_by_title[normalized_title] = lid_str

            nodes.append(
                {
                    "id": lid_str,
                    "label": title,
                    "filename": filename,
                    "group": "library",
                    "author": b["author"] or "Unknown",
                    "year": b["year"] or 0,
                    "hasFile": True,
                }
            )
            node_ids.add(lid_str)
    except Exception as e:
        logger.error(f"Failed to load Library Layer: {e}")
    finally:
        try:
            lib_conn.close()
        except:
            pass

    # --- LAYER 2: RING 1 (The Brain / LanceDB) ---
    brain_books = {}
    brain_lid_map = {}  # Maps Brain Filename -> Library ID
    try:
        brain_records = db.get_all_books()
        for b in brain_records:
            filename = b.get("filename")
            title = b.get("title", filename)
            true_lid = b.get("book_id")  # LanceDB stores the lib_ hash here

            brain_books[filename] = filename
            if true_lid:
                brain_lid_map[filename] = true_lid

            if filename not in node_ids:
                nodes.append(
                    {
                        "id": filename,
                        "label": title,
                        "group": "brain",
                        "author": b.get("author", "Unknown"),
                        "year": b.get("year", 0),
                        "hasFile": True,
                    }
                )
                node_ids.add(filename)
    except Exception as e:
        logger.error(f"Failed to load Brain Layer: {e}")

    def resolve_library_anchor(*candidates):
        for candidate in candidates:
            if not candidate:
                continue
            candidate_str = str(candidate).strip()
            if candidate_str in library_books:
                return candidate_str
            if candidate_str in brain_lid_map:
                return brain_lid_map[candidate_str]

            normalized = normalize_book_key(candidate_str)
            if normalized in library_lid_by_filename:
                return library_lid_by_filename[normalized]
            if normalized in library_lid_by_title:
                return library_lid_by_title[normalized]

        return None

    # --- LAYER 3: RING 2 (Echo Clusters & Synthesis Hubs) ---
    cluster_catalyst = {}
    try:
        gc = graph_db.conn.cursor()

        # 1. Fetch Parent Clusters (The Workspace Anchors)
        # Notice we are now fetching the Dual-Anchor fields!
        gc.execute("SELECT cluster_id, book_id, library_id FROM echo_clusters")
        for r in gc.fetchall():
            cid = r["cluster_id"]
            fallback_string = r["book_id"]
            library_id = r["library_id"]

            display_title = (
                str(fallback_string)
                .replace(".pdf", "")
                .replace(".epub", "")
                .replace(".txt", "")
            )
            if len(display_title) > 25:
                display_title = display_title[:22] + "..."

            nodes.append(
                {"id": cid, "label": display_title, "group": "echo", "hasFile": False}
            )
            node_ids.add(cid)

            target_book = resolve_library_anchor(library_id, fallback_string)
            cluster_catalyst[cid] = target_book

        # 2. Fetch Unique Child Echoes & Route Cross-Pollination
        # --- V2: We no longer fetch linked_note_id from user_echoes! ---
        gc.execute("PRAGMA table_info(user_echoes)")
        columns = [col[1] for col in gc.fetchall()]
        has_title = "title" in columns
        has_sources = "sources" in columns

        select_cols = ["echo_id", "cluster_id", "ai_insight"]
        if has_title:
            select_cols.append("title")
        if has_sources:
            select_cols.append("sources")

        gc.execute(f"SELECT {', '.join(select_cols)} FROM user_echoes")

        for r in gc.fetchall():
            eid = r["echo_id"]
            cid = r["cluster_id"]
            insight = r["ai_insight"] or "Echo"
            title = r["title"] if has_title and r["title"] else None

            if has_sources and r["sources"]:
                try:
                    sources_data = json.loads(r["sources"])
                    if isinstance(sources_data, list) and len(sources_data) > 0:
                        src_filename = sources_data[0].get("filename")

                        if src_filename and src_filename in brain_books:
                            # 1. Link Parent Column -> Source Book (Layer 3 -> Layer 2)
                            hub_key = (cid, src_filename)
                            if hub_key not in seen_hub_links:
                                seen_hub_links.add(hub_key)
                                edges.append(
                                    {
                                        "id": f"edge_hub_{cid}_{src_filename}",
                                        "source": cid,
                                        "target": src_filename,
                                        "type": "implicit",
                                        "weight": 1.5,
                                    }
                                )

                            # 2. Link Source Book -> Catalyst Book (Layer 2 -> Layer 1)
                            cat_id = cluster_catalyst.get(cid)

                            if not cat_id:
                                cat_id = resolve_library_anchor(src_filename)

                            if cat_id and cat_id in library_books:
                                cat_key = (src_filename, cat_id)
                                if cat_key not in seen_catalyst_links:
                                    seen_catalyst_links.add(cat_key)
                                    edges.append(
                                        {
                                            "id": f"edge_catalyst_{src_filename}_{cat_id}",
                                            "source": src_filename,
                                            "target": cat_id,
                                            "type": "cross_pollination",
                                            "weight": 2.0,
                                        }
                                    )
                except Exception as e:
                    pass

            display_label = (
                title
                if title
                else (insight[:20] + "..." if len(insight) > 20 else insight)
            )

            nodes.append(
                {
                    "id": eid,
                    "label": display_label,
                    "group": "echo",
                    "description": insight,
                    "hasFile": False,
                }
            )
            node_ids.add(eid)

            edges.append(
                {
                    "id": f"edge_echo_{eid}",
                    "source": eid,
                    "target": cid,
                    "type": "implicit",
                    "weight": 1.0,
                }
            )
            # --- V2: Legacy cross-link drawing from the echo side has been safely removed. ---

    except Exception as e:
        logger.error(f"Failed to load Echoes/Clusters: {e}")

    # --- LAYER 4 & 5: OUTER RINGS (Stacks, Note Groups & Notes) ---
    try:
        gc = graph_db.conn.cursor()

        gc.execute("PRAGMA table_info(note_stacks)")
        if gc.fetchall():
            gc.execute("SELECT stack_id, title FROM note_stacks")
            for r in gc.fetchall():
                sid = r["stack_id"]
                nodes.append(
                    {
                        "id": sid,
                        "label": r["title"],
                        "group": "stacks",
                        "hasFile": False,
                    }
                )
                node_ids.add(sid)

        gc.execute("PRAGMA table_info(note_groups)")
        columns = [col[1] for col in gc.fetchall()]
        has_stack_id = "stack_id" in columns

        query = (
            "SELECT group_id, title, stack_id FROM note_groups"
            if has_stack_id
            else "SELECT group_id, title FROM note_groups"
        )
        gc.execute(query)

        for r in gc.fetchall():
            gid = r["group_id"]
            stack_id = r["stack_id"] if has_stack_id and r["stack_id"] else None

            nodes.append(
                {
                    "id": gid,
                    "label": r["title"],
                    "group": "notes",
                    "stackId": stack_id,
                    "hasFile": False,
                }
            )
            node_ids.add(gid)

            if stack_id:
                edges.append(
                    {
                        "id": f"edge_group_stack_{gid}",
                        "source": gid,
                        "target": stack_id,
                        "type": "implicit",
                        "weight": 1.0,
                    }
                )

        gc.execute("PRAGMA table_info(user_notes)")
        n_columns = [col[1] for col in gc.fetchall()]

        select_n_cols = ["note_id", "group_id", "title", "content"]

        gc.execute(f"SELECT {', '.join(select_n_cols)} FROM user_notes")

        for r in gc.fetchall():
            nid = r["note_id"]
            gid = r["group_id"]

            nodes.append(
                {
                    "id": nid,
                    "label": r["title"],
                    "group": "notes",
                    "groupId": gid,  # <--- ADDED
                    "description": r["content"],
                    "hasFile": False,
                }
            )
            node_ids.add(nid)
            edges.append(
                {
                    "id": f"edge_note_{nid}",
                    "source": nid,
                    "target": gid,
                    "type": "implicit",
                    "weight": 1.0,
                }
            )

    except Exception as e:
        logger.error(f"Failed to load Notes/Groups/Stacks: {e}")

    # --- CUSTOM USER NODES & RELATIONAL EDGES ---
    try:
        custom_nodes = graph_db.get_all_user_nodes()
        for cn in custom_nodes:
            if cn["node_id"] not in node_ids:
                group = cn["node_type"]
                if group not in ["echo", "note", "brain", "library", "stacks"]:
                    group = "notes"

                nodes.append(
                    {
                        "id": cn["node_id"],
                        "label": cn["label"],
                        "group": group,
                        "description": cn["description"],
                        "hasFile": False,
                    }
                )
                node_ids.add(cn["node_id"])

        saved_edges = graph_db.get_all_edges()
        for edge in saved_edges:
            if edge["edge_type"] in ("compound_link", "manual_link") or not edge[
                "source_id"
            ].startswith(("echo_", "note_")):
                edges.append(
                    {
                        "id": f"edge_{edge['edge_id']}",
                        "source": edge["source_id"],
                        "target": edge["target_id"],
                        "type": edge["edge_type"],
                        "label": edge["context_text"],
                        "weight": edge["weight"],
                    }
                )
    except Exception as e:
        logger.error(f"Failed to load Custom Nodes/Edges: {e}")

    return {"nodes": nodes, "links": edges}


def add_custom_edge(
    source_id, target_id, edge_type="explicit", context_text="", weight=1.0
):
    try:
        graph_db.add_edge(source_id, target_id, edge_type, context_text, weight)
        return {"status": "success", "message": "Edge saved."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def add_custom_node(node_id, label, node_type="concept", description=""):
    try:
        graph_db.add_node(node_id, label, node_type, description)
        return {"status": "success", "node_id": node_id}
    except Exception as e:
        return {"status": "error", "message": str(e)}
