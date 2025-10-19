import { pipeline } from '@xenova/transformers';
import { logger } from './logger';
import { FFmpegService } from './ffmpeg';
import * as path from 'path';
import * as fs from 'fs/promises';

const ffmpegService = new FFmpegService();

export interface DetectedSound {
  timestamp: number;
  label: string;
  confidence: number;
  category: "ambient" | "effect" | "music" | "other";
}

export interface SoundPrompt {
  startTime: number;
  endTime: number;
  prompt: string;
  duration: number;
}

const AMBIENT_KEYWORDS = [
  'rain', 'wind', 'thunder', 'ocean', 'water', 'stream', 'river',
  'bird', 'cricket', 'frog', 'insect', 'nature',
  'traffic', 'street', 'crowd', 'city', 'urban',
  'engine', 'hum', 'buzz', 'background'
];

const EFFECT_KEYWORDS = [
  'crash', 'bang', 'slam', 'knock', 'hit', 'impact',
  'glass', 'break', 'shatter',
  'door', 'footstep', 'walk',
  'car', 'horn', 'brake', 'screech',
  'gunshot', 'explosion', 'boom',
  'laugh', 'scream', 'shout', 'yell'
];

const MUSIC_KEYWORDS = [
  'music', 'song', 'melody', 'instrument', 'guitar', 'piano',
  'drum', 'bass', 'violin', 'singing', 'vocal'
];

export class SoundDetector {
  private classifier: any = null;

  async initialize(): Promise<void> {
    try {
      logger.info('SoundDetector', 'Initializing audio classification model');
      
      // Load AudioSet-trained model (527 classes)
      this.classifier = await pipeline(
        'audio-classification',
        'Xenova/ast-finetuned-audioset-10-10-0.4593'
      );
      
      logger.info('SoundDetector', 'Model initialized successfully');
    } catch (error) {
      logger.error('SoundDetector', 'Failed to initialize model', error as Error);
      throw error;
    }
  }

  private categorizeSound(label: string): "ambient" | "effect" | "music" | "other" {
    const lowerLabel = label.toLowerCase();
    
    if (MUSIC_KEYWORDS.some(keyword => lowerLabel.includes(keyword))) {
      return 'music';
    }
    
    if (AMBIENT_KEYWORDS.some(keyword => lowerLabel.includes(keyword))) {
      return 'ambient';
    }
    
    if (EFFECT_KEYWORDS.some(keyword => lowerLabel.includes(keyword))) {
      return 'effect';
    }
    
    return 'other';
  }

  async detectSoundsFromVideo(videoPath: string, tempDir: string): Promise<DetectedSound[]> {
    if (!this.classifier) {
      await this.initialize();
    }

    let tempAudioPath: string | null = null;

    try {
      // Step 1: Extract audio from VEO video
      logger.info('SoundDetector', `Extracting audio from video: ${path.basename(videoPath)}`);
      tempAudioPath = path.join(tempDir, `veo-audio-${Date.now()}.wav`);
      await ffmpegService.extractAudio(videoPath, tempAudioPath);
      
      // Step 2: Run classification on extracted audio (clip-level, not temporal)
      logger.info('SoundDetector', `Analyzing audio: ${path.basename(tempAudioPath)}`);
      const results = await this.classifier(tempAudioPath, { top_k: 15 });
      
      logger.debug('SoundDetector', 'Classification results', { 
        count: results.length,
        topResult: results[0]
      });
      
      // Step 3: Filter and categorize detected sounds
      // Note: timestamp is 0 because this is clip-level detection, not frame-level
      const detectedSounds: DetectedSound[] = results
        .filter((result: any) => result.score > 0.1) // 10% confidence threshold
        .map((result: any) => ({
          timestamp: 0, // Clip-level classification - no temporal info available
          label: result.label,
          confidence: result.score,
          category: this.categorizeSound(result.label)
        }));
      
      logger.info('SoundDetector', `Detected ${detectedSounds.length} sound categories`, {
        ambient: detectedSounds.filter(s => s.category === 'ambient').length,
        effects: detectedSounds.filter(s => s.category === 'effect').length,
        music: detectedSounds.filter(s => s.category === 'music').length
      });
      
      return detectedSounds;
    } catch (error) {
      logger.error('SoundDetector', 'Sound detection failed', error as Error);
      throw error;
    } finally {
      // Cleanup temp audio file
      if (tempAudioPath) {
        try {
          await fs.unlink(tempAudioPath);
          logger.debug('SoundDetector', 'Cleaned up temp audio file');
        } catch (cleanupError) {
          logger.warn('SoundDetector', 'Failed to cleanup temp audio', cleanupError as Error);
        }
      }
    }
  }

  generatePrompts(detectedSounds: DetectedSound[], videoDuration: number): SoundPrompt[] {
    const prompts: SoundPrompt[] = [];
    
    // Group sounds by category
    const ambientSounds = detectedSounds.filter(s => s.category === 'ambient');
    const effectSounds = detectedSounds.filter(s => s.category === 'effect');
    
    // Generate ambient prompt (continuous throughout video)
    if (ambientSounds.length > 0) {
      const topAmbient = ambientSounds
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3)
        .map(s => s.label.toLowerCase())
        .join(' with ');
      
      prompts.push({
        startTime: 0,
        endTime: videoDuration,
        prompt: topAmbient,
        duration: videoDuration
      });
      
      logger.debug('SoundDetector', 'Generated ambient prompt', { prompt: topAmbient });
    }
    
    // Generate effect prompts (could be timestamped later)
    if (effectSounds.length > 0) {
      const topEffects = effectSounds
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5);
      
      for (const effect of topEffects) {
        prompts.push({
          startTime: 0, // Would need temporal analysis for exact timing
          endTime: videoDuration,
          prompt: effect.label.toLowerCase(),
          duration: 3 // Default 3 second effect
        });
        
        logger.debug('SoundDetector', 'Generated effect prompt', { 
          effect: effect.label,
          confidence: effect.confidence
        });
      }
    }
    
    return prompts;
  }
}

// Singleton instance
export const soundDetector = new SoundDetector();
