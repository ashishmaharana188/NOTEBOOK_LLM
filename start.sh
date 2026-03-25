#!/bin/bash

# 1. Start Ollama in the background
echo "Starting Ollama service..."
ollama serve &

# Wait a few seconds to ensure the Ollama daemon is fully up
sleep 5

# 2. Ensure the small default reasoning models are available
echo "Pulling required AI models..."
for model in qwen2.5:0.5b-instruct qwen2.5:1.5b-instruct; do
  if ! ollama show "$model" >/dev/null 2>&1; then
    ollama pull "$model"
  fi
done

# 3. Pre-cache the default embedding model so the first vectorization request
# doesn't pay the download cost on a cold deployment.
echo "Caching embedding model..."
PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
fi

if [ -n "$PYTHON_BIN" ]; then
  "$PYTHON_BIN" -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"
else
  echo "Skipping embedding cache warm-up: no Python interpreter found."
fi

# 4. Start your FastAPI application on port 7860
echo "Starting FastAPI server..."
uvicorn scripts.api:app --host 0.0.0.0 --port 7860
