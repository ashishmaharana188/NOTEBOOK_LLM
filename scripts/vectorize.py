import logging
from typing import List, Optional

from scripts.model_runtime import runtime_manager

logger = logging.getLogger(__name__)

OLLAMA_MODEL = "bge-m3"


def load_model():
    runtime_manager.ensure_roles_loaded(["embedding"], allow_start_managed=False)
    return True


def unload_model():
    runtime_manager.unload_roles(["embedding"])


def get_embedding(text: str, model: str = OLLAMA_MODEL, max_retries: int = 5):
    return runtime_manager.get_embedding(text)


def get_embeddings_batch(
    texts: List[str],
    cancel_event=None,
    batch_size: Optional[int] = None,
    progress_callback=None,
):
    return runtime_manager.get_embeddings_batch(
        texts,
        cancel_event=cancel_event,
        batch_size=batch_size,
        progress_callback=progress_callback,
    )
