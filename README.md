---
title: Cognitive Graph Backend
emoji: 🧠
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
---

# Cognitive Graph API
This is the backend for the Cognitive Graph application.

## Dev vs Production

Frontend mode now controls which backend it talks to:

- Development mode uses `http://127.0.0.1:8000`
- Production mode uses `https://doomprompting123-space.hf.space`

From the repo root, start the local backend with:

```bash
npm run backend:dev
```

Start the frontend dev server with:

```bash
npm run frontend:dev
```

## Local CUDA Runtime

For local testing you can switch the backend from the default cloud-safe CPU runtime to the `local_cuda_test` preset.

Prerequisites:
- Run `ollama serve`
- Install a local Phi-3.5 Mini Instruct Q4 Ollama model
- Start the backend with CUDA available for PyTorch

Environment variables:
- `COGNITIVE_RUNTIME_PRESET=local_cuda_test`
- `COGNITIVE_LOCAL_REASONING_OLLAMA_TAG=<your exact local Ollama Phi-3.5 tag>`

The backend now reads `.env` and `.env.local` from the repo root automatically. For local development, edit `.env.local` instead of exporting variables manually.

Example local startup:

```bash
export COGNITIVE_RUNTIME_PRESET=local_cuda_test
export COGNITIVE_LOCAL_REASONING_OLLAMA_TAG="phi3.5:mini-instruct-q4_K_M"
ollama serve
uvicorn scripts.api:app --reload
```

In `local_cuda_test` mode the backend uses `BAAI/bge-m3` on CUDA for embeddings, resolves reasoning through your local Ollama Phi-3.5 tag, unloads embeddings immediately after each task, and auto-unloads idle models after 5 minutes.
