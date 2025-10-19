#!/bin/bash

echo "Starting Sound Detection Service..."
echo ""
echo "Installing dependencies (this may take a few minutes on first run)..."

python3 -m pip install --user -q fastapi uvicorn[standard] numpy soundfile librosa torch panns_inference

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Dependencies installed successfully!"
    echo ""
    echo "🚀 Starting FastAPI service on http://localhost:8001"
    echo ""
    python3 -m uvicorn app:app --host 0.0.0.0 --port 8001
else
    echo ""
    echo "❌ Failed to install dependencies"
    echo ""
    echo "Try installing manually:"
    echo "  python3 -m pip install --user fastapi uvicorn numpy soundfile librosa torch panns_inference"
    exit 1
fi
