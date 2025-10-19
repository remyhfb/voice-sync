# Sound Detection Microservice

FastAPI service for temporal sound event detection using PANNs (Pretrained Audio Neural Networks).

## Features

- **527 AudioSet classes**: Detects ambient sounds, effects, music, and more
- **10ms temporal resolution**: Frame-by-frame detection with precise timestamps
- **Automatic categorization**: Classifies sounds as ambient, effect, music, or other
- **RESTful API**: Easy integration with Node.js backend

## Quick Start

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run the service
python app.py
```

Service runs on `http://localhost:8000`

### Docker

```bash
# Build
docker build -t sound-detection .

# Run
docker run -p 8000:8000 sound-detection
```

## API Endpoints

### POST /detect-sounds

Upload audio/video file and detect sound events with timestamps.

**Parameters:**
- `file`: Audio or video file (multipart/form-data)
- `threshold`: Confidence threshold (0.0-1.0, default 0.3)
- `min_duration`: Minimum event duration in seconds (default 0.1)

**Response:**
```json
{
  "status": "success",
  "filename": "video.mp4",
  "duration": 10.5,
  "total_events": 15,
  "events": [
    {
      "label": "Rain",
      "category": "ambient",
      "start_time": 0.5,
      "end_time": 8.3,
      "duration": 7.8,
      "confidence": 0.89
    }
  ],
  "summary": {
    "ambient_count": 5,
    "effect_count": 8,
    "music_count": 2,
    "other_count": 0
  }
}
```

### GET /health

Health check endpoint.

## Integration with Node.js

```javascript
const FormData = require('form-data');
const fs = require('fs');

const formData = new FormData();
formData.append('file', fs.createReadStream('video.mp4'));

const response = await fetch('http://localhost:8000/detect-sounds', {
  method: 'POST',
  body: formData
});

const { events } = await response.json();
```

## Model Details

- **Architecture**: PANNs Cnn14_DecisionLevelMax
- **Training data**: AudioSet (2M+ labeled audio clips)
- **Classes**: 527 environmental sounds
- **Performance**: mAP 0.385 on AudioSet evaluation
