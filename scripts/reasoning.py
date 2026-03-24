import json
import logging

from scripts.model_runtime import runtime_manager

logger = logging.getLogger(__name__)


def analyze_relations_batch(highlight_text, chunks_list):
    if not chunks_list:
        return []

    logger.info(
        f"LLM batch analyzing {len(chunks_list)} connections simultaneously..."
    )

    try:
        result = runtime_manager.analyze_relations_batch(highlight_text, chunks_list)
        data = json.loads(result)
        if isinstance(data, list):
            aligned = []
            for index in range(len(chunks_list)):
                if index < len(data):
                    item = data[index]
                    relation = str(item.get("relation", "EXPAND")).upper()
                    if relation not in ["SUPPORT", "CHALLENGE", "EXPAND"]:
                        relation = "EXPAND"
                    aligned.append(
                        {
                            "relation": relation,
                            "bridge": item.get("bridge", "Shared Concept"),
                        }
                    )
                else:
                    aligned.append(
                        {"relation": "EXPAND", "bridge": "Semantic Match"}
                    )
            return aligned
    except Exception as error:
        logger.error(f"Reasoning batch engine error: {error}")

    return [{"relation": "EXPAND", "bridge": "Semantic Match"} for _ in chunks_list]


def unload_llm():
    runtime_manager.unload_roles(["reasoning"])
