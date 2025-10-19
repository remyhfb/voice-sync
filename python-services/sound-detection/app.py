#!/usr/bin/env python3
"""
Sound Detection Microservice
Provides framewise temporal sound event detection using PANNs (Pretrained Audio Neural Networks)
Returns events with precise timestamps (10ms resolution) for 527 AudioSet classes
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import List, Dict, Optional
import tempfile
import os
import librosa
import numpy as np
from panns_inference import SoundEventDetection, labels
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Sound Detection API",
    description="Temporal sound event detection with 527 AudioSet classes",
    version="1.0.0"
)

# Enable CORS for Node.js backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize model once at startup (lazy loading)
sed_model = None

def get_model():
    """Lazy load SED model"""
    global sed_model
    if sed_model is None:
        logger.info("Initializing Sound Event Detection model (Cnn14_DecisionLevelMax)...")
        sed_model = SoundEventDetection(checkpoint_path=None, device='cpu')
        logger.info("Model initialized successfully")
    return sed_model


@app.get("/")
async def root():
    return {
        "service": "Sound Detection API",
        "model": "PANNs Cnn14_DecisionLevelMax",
        "classes": 527,
        "temporal_resolution": "10ms",
        "endpoints": {
            "detect": "POST /detect-sounds",
            "health": "GET /health"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model_loaded": sed_model is not None
    }


def categorize_sound(label: str) -> str:
    """Categorize detected sound into ambient, effect, music, or other"""
    label_lower = label.lower()
    
    ambient_keywords = [
        'rain', 'wind', 'thunder', 'ocean', 'water', 'stream', 'river',
        'bird', 'cricket', 'frog', 'insect', 'nature',
        'traffic', 'street', 'crowd', 'city', 'urban',
        'engine', 'hum', 'buzz', 'background', 'environment'
    ]
    
    effect_keywords = [
        'crash', 'bang', 'slam', 'knock', 'hit', 'impact',
        'glass', 'break', 'shatter', 'smash',
        'door', 'footstep', 'walk', 'step',
        'car', 'horn', 'brake', 'screech',
        'gunshot', 'explosion', 'boom', 'blast',
        'laugh', 'scream', 'shout', 'yell', 'cry'
    ]
    
    music_keywords = [
        'music', 'song', 'melody', 'instrument', 'guitar', 'piano',
        'drum', 'bass', 'violin', 'singing', 'vocal', 'choir'
    ]
    
    if any(keyword in label_lower for keyword in music_keywords):
        return 'music'
    elif any(keyword in label_lower for keyword in ambient_keywords):
        return 'ambient'
    elif any(keyword in label_lower for keyword in effect_keywords):
        return 'effect'
    else:
        return 'other'


@app.post("/detect-sounds")
async def detect_sounds(
    file: UploadFile = File(...),
    threshold: float = 0.3,
    min_duration: float = 0.1
):
    """
    Detect sound events with framewise timestamps
    
    Args:
        file: Audio or video file (audio will be extracted)
        threshold: Confidence threshold (0.0-1.0, default 0.3)
        min_duration: Minimum event duration in seconds (default 0.1)
    
    Returns:
        JSON with detected events including timestamps, labels, and confidence
    """
    temp_input_path = None
    temp_audio_path = None
    
    try:
        # Save uploaded file temporarily with original extension
        file_ext = os.path.splitext(file.filename)[1] or '.mp4'
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp:
            content = await file.read()
            tmp.write(content)
            temp_input_path = tmp.name
        
        logger.info(f"Processing file: {file.filename}")
        
        # For video files, extract audio using ffmpeg first
        if file_ext.lower() in ['.mp4', '.avi', '.mov', '.mkv', '.webm']:
            import subprocess
            temp_audio_path = tempfile.mktemp(suffix='.wav')
            
            logger.info("Extracting audio from video using ffmpeg...")
            subprocess.run([
                'ffmpeg', '-i', temp_input_path,
                '-vn',  # No video
                '-acodec', 'pcm_s16le',  # PCM WAV
                '-ar', '32000',  # 32kHz for PANNs
                '-ac', '1',  # Mono
                '-y',  # Overwrite
                temp_audio_path
            ], check=True, capture_output=True)
            
            audio_path_for_librosa = temp_audio_path
        else:
            # For audio files, use directly
            audio_path_for_librosa = temp_input_path
        
        # Load audio at 32kHz (required for PANNs)
        audio, sr = librosa.load(audio_path_for_librosa, sr=32000, mono=True)
        audio = audio[None, :]  # Add batch dimension: (1, samples)
        
        duration = len(audio[0]) / sr
        logger.info(f"Audio loaded: {duration:.2f}s at {sr}Hz")
        
        # Get model and run inference
        model = get_model()
        logger.info("Running framewise sound event detection...")
        framewise_output = model.inference(audio)
        # Shape: (batch=1, time_frames, 527_classes)
        
        framewise_data = framewise_output[0]  # Remove batch dimension
        num_frames = framewise_data.shape[0]
        frame_duration = 0.01  # 10ms per frame (320 samples at 32kHz)
        
        logger.info(f"Detected {num_frames} frames ({num_frames * frame_duration:.2f}s)")
        
        # Extract sound events with temporal segmentation
        events = []
        
        for class_idx in range(len(labels)):
            class_probs = framewise_data[:, class_idx]
            above_threshold = class_probs > threshold
            
            if not np.any(above_threshold):
                continue
            
            # Find contiguous segments where sound is detected
            diff = np.diff(np.concatenate(([0], above_threshold.astype(int), [0])))
            starts = np.where(diff == 1)[0]
            ends = np.where(diff == -1)[0]
            
            for start, end in zip(starts, ends):
                segment_duration = (end - start) * frame_duration
                
                # Filter by minimum duration
                if segment_duration >= min_duration:
                    events.append({
                        "label": labels[class_idx],
                        "category": categorize_sound(labels[class_idx]),
                        "start_time": float(start * frame_duration),
                        "end_time": float(end * frame_duration),
                        "duration": float(segment_duration),
                        "confidence": float(np.mean(class_probs[start:end]))
                    })
        
        # Sort by start time
        events = sorted(events, key=lambda x: x['start_time'])
        
        logger.info(f"Detected {len(events)} sound events")
        
        # Categorize events
        categories = {
            'ambient': [e for e in events if e['category'] == 'ambient'],
            'effects': [e for e in events if e['category'] == 'effect'],
            'music': [e for e in events if e['category'] == 'music'],
            'other': [e for e in events if e['category'] == 'other']
        }
        
        return JSONResponse({
            "status": "success",
            "filename": file.filename,
            "duration": float(duration),
            "total_events": len(events),
            "events": events,
            "summary": {
                "ambient_count": len(categories['ambient']),
                "effect_count": len(categories['effects']),
                "music_count": len(categories['music']),
                "other_count": len(categories['other'])
            },
            "parameters": {
                "threshold": threshold,
                "min_duration": min_duration,
                "frame_duration": frame_duration
            }
        })
        
    except Exception as e:
        logger.error(f"Error processing audio: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Audio processing failed: {str(e)}")
    
    finally:
        # Cleanup temp files
        for temp_file in [temp_input_path, temp_audio_path]:
            if temp_file and os.path.exists(temp_file):
                try:
                    os.unlink(temp_file)
                    logger.debug(f"Cleaned up temp file: {os.path.basename(temp_file)}")
                except Exception as e:
                    logger.warning(f"Failed to cleanup temp file: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
