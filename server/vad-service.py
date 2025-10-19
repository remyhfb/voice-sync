#!/usr/bin/env python3
"""
Voice Activity Detection service using Silero VAD.
Measures speech-only duration from audio files, excluding silence and pauses.
"""

import torch
import sys
import json
import warnings
import soundfile as sf
import numpy as np

warnings.filterwarnings('ignore')

def get_speech_duration(audio_path: str, threshold: float = 0.5) -> dict:
    """
    Analyze audio file and return speech-only duration.
    
    Args:
        audio_path: Path to audio file (mp3, wav, etc.)
        threshold: VAD confidence threshold (0.0-1.0, default 0.5)
    
    Returns:
        dict with speech_duration_seconds and segments
    """
    try:
        # Load Silero VAD model
        model, utils = torch.hub.load(
            repo_or_dir='snakers4/silero-vad',
            model='silero_vad',
            force_reload=False,
            trust_repo=True
        )
        
        (get_speech_timestamps, *_) = utils
        
        # Read audio file using soundfile (simpler than torchaudio)
        audio_data, sample_rate = sf.read(audio_path, dtype='float32')
        
        # Convert to mono if stereo
        if len(audio_data.shape) > 1:
            audio_data = np.mean(audio_data, axis=1)
        
        # Resample to 16kHz if needed (simple linear interpolation)
        if sample_rate != 16000:
            duration = len(audio_data) / sample_rate
            new_length = int(duration * 16000)
            audio_data = np.interp(
                np.linspace(0, len(audio_data), new_length),
                np.arange(len(audio_data)),
                audio_data
            )
        
        # Convert to torch tensor
        wav = torch.from_numpy(audio_data)
        
        # Get speech timestamps (excludes silence/pauses)
        speech_timestamps = get_speech_timestamps(
            wav, 
            model,
            threshold=threshold,
            sampling_rate=16000,
            return_seconds=False  # Returns in samples
        )
        
        # Calculate total speech duration
        total_speech_samples = sum([
            (segment['end'] - segment['start']) 
            for segment in speech_timestamps
        ])
        
        # Convert samples to seconds (16kHz sampling rate)
        speech_duration_seconds = total_speech_samples / 16000.0
        
        return {
            'success': True,
            'speech_duration': speech_duration_seconds,
            'num_speech_segments': len(speech_timestamps),
            'segments': [
                {
                    'start': seg['start'] / 16000.0,
                    'end': seg['end'] / 16000.0,
                    'duration': (seg['end'] - seg['start']) / 16000.0
                }
                for seg in speech_timestamps
            ]
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def analyze_pacing(veo_audio_path: str, user_audio_path: str) -> dict:
    """
    Compare speech duration between VEO audio and user audio.
    
    Returns:
        dict with veo_duration, user_duration, ratio, and classification
    """
    veo_result = get_speech_duration(veo_audio_path)
    user_result = get_speech_duration(user_audio_path)
    
    if not veo_result['success']:
        return {'success': False, 'error': f"VEO audio error: {veo_result['error']}"}
    
    if not user_result['success']:
        return {'success': False, 'error': f"User audio error: {user_result['error']}"}
    
    veo_duration = veo_result['speech_duration']
    user_duration = user_result['speech_duration']
    
    # Calculate ratio (user / veo)
    ratio = user_duration / veo_duration if veo_duration > 0 else 0
    
    # Classify pacing
    if 0.97 <= ratio <= 1.03:
        classification = 'perfect'
    elif 0.90 <= ratio < 0.97:
        classification = 'slightly_fast'
    elif 0.75 <= ratio < 0.90:
        classification = 'fast'
    elif ratio < 0.75:
        classification = 'critically_fast'
    elif 1.03 < ratio <= 1.10:
        classification = 'slightly_slow'
    elif 1.10 < ratio <= 1.25:
        classification = 'slow'
    else:  # ratio > 1.25
        classification = 'critically_slow'
    
    return {
        'success': True,
        'veo_speech_duration': veo_duration,
        'user_speech_duration': user_duration,
        'ratio': ratio,
        'classification': classification,
        'veo_segments': veo_result['num_speech_segments'],
        'user_segments': user_result['num_speech_segments']
    }


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python vad-service.py <veo_audio_path> <user_audio_path>'
        }))
        sys.exit(1)
    
    veo_audio = sys.argv[1]
    user_audio = sys.argv[2]
    
    result = analyze_pacing(veo_audio, user_audio)
    print(json.dumps(result))
