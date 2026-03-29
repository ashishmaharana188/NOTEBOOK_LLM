#!/bin/sh

set -eu

export COGNITIVE_RUNTIME_PRESET="${COGNITIVE_RUNTIME_PRESET:-cloud_cpu}"

echo "Starting FastAPI server..."
exec uvicorn scripts.api:app --host 0.0.0.0 --port 7860
