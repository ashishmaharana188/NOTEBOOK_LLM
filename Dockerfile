FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TOKENIZERS_PARALLELISM=false

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./requirements.txt

RUN pip install --index-url https://download.pytorch.org/whl/cpu torch && \
    pip install -r requirements.txt

COPY scripts ./scripts
COPY start.sh ./start.sh

RUN mkdir -p \
    data/processed \
    data/library \
    data/metadata \
    data/crawler \
    data/reader_cache \
    stored_files/notes && \
    chmod +x start.sh

EXPOSE 7860

CMD ["./start.sh"]
