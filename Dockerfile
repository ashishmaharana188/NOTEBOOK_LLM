FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TOKENIZERS_PARALLELISM=false \
    PYTHONPATH=/app \
    COGNITIVE_RUNTIME_PRESET=cloud_cpu

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./requirements.txt

RUN pip install --index-url https://download.pytorch.org/whl/cpu torch && \
    pip install -r requirements.txt && \
    pip check

COPY scripts ./scripts

RUN mkdir -p \
    data/processed \
    data/library \
    data/metadata \
    data/crawler \
    data/reader_cache \
    stored_files/notes && \
    python -m compileall -q scripts && \
    python -c "import scripts.api; print('API_IMPORT_PREFLIGHT_OK')"

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:7860/system/runtime', timeout=5).status == 200 else 1)"

CMD ["python", "-m", "uvicorn", "scripts.api:app", "--host", "0.0.0.0", "--port", "7860"]
