#!/bin/bash

echo "Starting Sound Detection Service..."
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating Python 3.10 virtual environment..."
    python3.10 -m venv venv
    if [ $? -ne 0 ]; then
        echo "❌ Failed to create virtual environment"
        exit 1
    fi
fi

# Activate virtual environment
source venv/bin/activate

# Check if dependencies are installed
python -c "import panns_inference" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "Installing dependencies from requirements.txt (this may take 3-5 minutes on first run)..."
    echo ""
    
    # Install from requirements.txt with index fallback
    pip install --no-cache-dir -r requirements.txt -q
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Dependencies installed successfully!"
    else
        echo ""
        echo "❌ Failed to install dependencies"
        echo "Please check your internet connection and try again"
        exit 1
    fi
else
    echo "✅ Dependencies already installed"
fi

echo ""
echo "🚀 Starting FastAPI service on http://localhost:8001"
echo ""

# Start the service
python -m uvicorn app:app --host 0.0.0.0 --port 8001
