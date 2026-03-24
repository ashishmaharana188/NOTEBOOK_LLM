#!/bin/bash

# 1. Start Ollama in the background
echo "Starting Ollama service..."
ollama serve &

# Wait a few seconds to ensure the Ollama daemon is fully up
sleep 5

# 2. Pre-pull the necessary models
# (Adjust these names if you use specific quantized tags like phi3.5:q4_0)
echo "Pulling required AI models..."
ollama pull nomic-embed-text
ollama pull phi3.5

# 3. Start your FastAPI application on port 7860
echo "Starting FastAPI server..."
uvicorn scripts.api:app --host 0.0.0.0 --port 7860