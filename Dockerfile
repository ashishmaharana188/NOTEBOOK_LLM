# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Install system dependencies needed for Ollama, sqlite, and building packages
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    sqlite3 \
    zstd \
    && rm -rf /var/lib/apt/lists/*

# Install Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

# Set the working directory to the root of your app
WORKDIR /app

# 🔴 THE FIX: Install the tiny CPU-only version of PyTorch first!
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu

# Copy requirements and install them
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your repository into the container
COPY . .

# Create the storage directories your app expects so it doesn't crash on startup
RUN mkdir -p data/processed data/library data/metadata data/crawler data/reader_cache stored_files/notes

# Make the startup script executable
RUN chmod +x start.sh

# Hugging Face Spaces strictly routes traffic to port 7860
EXPOSE 7860

# Command to run when the container starts
CMD ["./start.sh"]