# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Install system dependencies needed for Ollama and sqlite
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Install Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

# Set the working directory
WORKDIR /app

# Copy requirements and install them
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your application code
COPY . .

# Create the storage directories your app expects
RUN mkdir -p data/processed data/library data/metadata data/crawler data/reader_cache stored_files/notes

# Make the startup script executable
RUN chmod +x start.sh

# Hugging Face Spaces route traffic to port 7860
EXPOSE 7860

# Command to run when the container starts
CMD ["./start.sh"]