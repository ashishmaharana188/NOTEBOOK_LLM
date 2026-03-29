FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TOKENIZERS_PARALLELISM=false

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    zstd \
    && rm -rf /var/lib/apt/lists/*

RUN ARCH="$(dpkg --print-architecture)" && \
    case "$ARCH" in \
        amd64) OLLAMA_ARCH="amd64" ;; \
        arm64) OLLAMA_ARCH="arm64" ;; \
        *) echo "Unsupported architecture: $ARCH" && exit 1 ;; \
    esac && \
    curl --retry 5 --retry-all-errors --connect-timeout 20 --max-time 180 -fsSL "https://ollama.com/download/ollama-linux-${OLLAMA_ARCH}.tar.zst" -o /tmp/ollama.tar.zst && \
    tar --zstd -xf /tmp/ollama.tar.zst -C /usr && \
    rm -f /tmp/ollama.tar.zst && \
    chmod +x /usr/bin/ollama

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
