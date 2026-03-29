#!/bin/sh

set -eu

export COGNITIVE_RUNTIME_PRESET="${COGNITIVE_RUNTIME_PRESET:-cloud_cpu}"
PREFETCH_OLLAMA_MODELS="${COGNITIVE_PREFETCH_OLLAMA_MODELS:-0}"
PREFETCH_EMBEDDING_MODEL="${COGNITIVE_PREFETCH_EMBEDDING_MODEL:-0}"

echo "Starting Ollama service..."
ollama serve >/tmp/ollama.log 2>&1 &

warm_in_background() {
  (
    for _ in $(seq 1 30); do
      if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done

    if [ "$PREFETCH_OLLAMA_MODELS" = "1" ]; then
      echo "Prefetching Ollama models in background..."
      for model in qwen2.5:0.5b-instruct qwen2.5:1.5b-instruct; do
        if ! ollama show "$model" >/dev/null 2>&1; then
          ollama pull "$model" || true
        fi
      done
    else
      echo "Skipping Ollama model prefetch on startup."
    fi

    if [ "$PREFETCH_EMBEDDING_MODEL" = "1" ]; then
      echo "Prefetching embedding model in background..."
      PYTHON_BIN=""
      if command -v python3 >/dev/null 2>&1; then
        PYTHON_BIN="python3"
      elif command -v python >/dev/null 2>&1; then
        PYTHON_BIN="python"
      fi

      if [ -n "$PYTHON_BIN" ]; then
        "$PYTHON_BIN" -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')" || true
      fi
    else
      echo "Skipping embedding model prefetch on startup."
    fi
  ) &
}

warm_in_background

echo "Starting FastAPI server..."
exec uvicorn scripts.api:app --host 0.0.0.0 --port 7860
