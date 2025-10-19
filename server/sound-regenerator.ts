import { logger } from './logger';
import { ElevenLabsService } from './elevenlabs';
import { FFmpegService } from './ffmpeg';
import FormData from 'form-data';
import fs from 'fs/promises';
import * as path from 'path';

const PYTHON_SERVICE_URL = process.env.PYTHON_SOUND_DETECTION_URL || 'http://localhost:8000';

interface DetectedEvent {
  label: string;
  category: 'ambient' | 'effect' | 'music' | 'other';
  start_time: number;
  end_time: number;
  duration: number;
  confidence: number;
}

interface DetectionResponse {
  status: string;
  filename: string;
  duration: number;
  total_events: number;
  events: DetectedEvent[];
  summary: {
    ambient_count: number;
    effect_count: number;
    music_count: number;
    other_count: number;
  };
}

export interface SoundDesignResult {
  detectedSounds: Array<{
    timestamp: number;
    label: string;
    confidence: number;
    category: string;
  }>;
  generatedPrompts: Array<{
    startTime: number;
    endTime: number;
    prompt: string;
    duration: number;
  }>;
  regeneratedAudioPaths: {
    ambientAudio?: string;
    effectsAudio?: string;
    mixedAudio?: string;
  };
  enhancedVideoPath?: string;
}

export class SoundRegenerator {
  private elevenLabs: ElevenLabsService;
  private ffmpeg: FFmpegService;

  constructor() {
    this.elevenLabs = new ElevenLabsService();
    this.ffmpeg = new FFmpegService();
  }

  /**
   * Step 1: Call Python microservice to detect sounds with timestamps
   */
  async detectSounds(videoPath: string): Promise<DetectionResponse> {
    logger.info('SoundRegenerator', 'Calling Python sound detection service', {
      videoPath: path.basename(videoPath),
      serviceUrl: PYTHON_SERVICE_URL
    });

    try {
      const formData = new FormData();
      formData.append('file', await fs.readFile(videoPath), {
        filename: path.basename(videoPath),
        contentType: 'video/mp4'
      });
      formData.append('threshold', '0.3');
      formData.append('min_duration', '0.1');

      const response = await fetch(`${PYTHON_SERVICE_URL}/detect-sounds`, {
        method: 'POST',
        body: formData as any,
        headers: formData.getHeaders()
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Python service error: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as DetectionResponse;
      
      logger.info('SoundRegenerator', 'Sound detection complete', {
        totalEvents: result.total_events,
        ambient: result.summary.ambient_count,
        effects: result.summary.effect_count,
        music: result.summary.music_count
      });

      return result;
    } catch (error) {
      logger.error('SoundRegenerator', 'Failed to detect sounds', error as Error);
      throw error;
    }
  }

  /**
   * Step 2: Generate prompts from detected events
   */
  generatePrompts(events: DetectedEvent[], videoDuration: number): Array<{
    startTime: number;
    endTime: number;
    prompt: string;
    duration: number;
    type: 'ambient' | 'effect';
  }> {
    const prompts: Array<any> = [];

    // Group events by category
    const ambientEvents = events.filter(e => e.category === 'ambient');
    const effectEvents = events.filter(e => e.category === 'effect');

    // Generate ambient prompt (continuous background)
    if (ambientEvents.length > 0) {
      const topAmbient = ambientEvents
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3)
        .map(e => e.label.toLowerCase())
        .join(' with ');

      prompts.push({
        startTime: 0,
        endTime: videoDuration,
        prompt: topAmbient,
        duration: videoDuration,
        type: 'ambient'
      });

      logger.info('SoundRegenerator', 'Generated ambient prompt', { prompt: topAmbient });
    }

    // Generate effect prompts (timed events)
    const significantEffects = effectEvents
      .filter(e => e.confidence > 0.5 && e.duration > 0.1)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5); // Top 5 most confident effects

    for (const effect of significantEffects) {
      prompts.push({
        startTime: effect.start_time,
        endTime: effect.end_time,
        prompt: effect.label.toLowerCase(),
        duration: effect.duration,
        type: 'effect'
      });

      logger.debug('SoundRegenerator', 'Generated effect prompt', {
        prompt: effect.label,
        time: `${effect.start_time.toFixed(2)}s - ${effect.end_time.toFixed(2)}s`
      });
    }

    return prompts;
  }

  /**
   * Step 3: Generate audio using ElevenLabs v2
   */
  async generateAudio(prompt: string, duration: number, outputPath: string): Promise<void> {
    logger.info('SoundRegenerator', 'Generating audio with ElevenLabs v2', {
      prompt,
      duration: `${duration}s`
    });

    try {
      const audioBuffer = await this.elevenLabs.generateSoundEffect(prompt, {
        durationSeconds: Math.min(duration, 30), // ElevenLabs max 30s
        promptInfluence: 0.3
      });

      await fs.writeFile(outputPath, audioBuffer);
      
      logger.info('SoundRegenerator', 'Audio generated successfully', {
        size: `${(audioBuffer.length / 1024).toFixed(2)} KB`,
        outputPath: path.basename(outputPath)
      });
    } catch (error) {
      logger.error('SoundRegenerator', 'Failed to generate audio', error as Error);
      throw error;
    }
  }

  /**
   * Step 4: Mix regenerated audio with video
   */
  async mixAudioWithVideo(
    videoPath: string,
    audioPath: string,
    outputPath: string
  ): Promise<void> {
    logger.info('SoundRegenerator', 'Mixing audio with video', {
      video: path.basename(videoPath),
      audio: path.basename(audioPath)
    });

    try {
      await this.ffmpeg.mergeAudioVideo(videoPath, audioPath, outputPath);
      logger.info('SoundRegenerator', 'Video mixing complete', {
        output: path.basename(outputPath)
      });
    } catch (error) {
      logger.error('SoundRegenerator', 'Failed to mix audio/video', error as Error);
      throw error;
    }
  }

  /**
   * Complete pipeline: Detect → Generate → Mix
   */
  async regenerateSoundDesign(
    originalVideoPath: string,
    lipsyncedVideoPath: string,
    tempDir: string
  ): Promise<SoundDesignResult> {
    logger.info('SoundRegenerator', 'Starting sound design regeneration pipeline');

    try {
      // Step 1: Detect sounds from original VEO video
      const detection = await this.detectSounds(originalVideoPath);

      // Step 2: Generate prompts
      const prompts = this.generatePrompts(detection.events, detection.duration);

      // Step 3: Generate ambient audio (if any ambient sounds detected)
      const ambientPrompt = prompts.find(p => p.type === 'ambient');
      const effectPrompts = prompts.filter(p => p.type === 'effect');
      
      let ambientAudioPath: string | undefined;
      const effectAudioPaths: string[] = [];

      if (ambientPrompt) {
        ambientAudioPath = path.join(tempDir, `ambient-${Date.now()}.mp3`);
        await this.generateAudio(ambientPrompt.prompt, ambientPrompt.duration, ambientAudioPath);
      }

      // Step 3b: Generate effect audio clips
      for (const effectPrompt of effectPrompts) {
        const effectPath = path.join(tempDir, `effect-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`);
        await this.generateAudio(effectPrompt.prompt, effectPrompt.duration, effectPath);
        effectAudioPaths.push(effectPath);
      }

      // Step 4: Mix generated audio with lip-synced video
      let enhancedVideoPath: string | undefined;

      if (ambientAudioPath) {
        // Mix ambient audio with lip-synced video to create enhanced output
        enhancedVideoPath = path.join(tempDir, `enhanced-${Date.now()}.mp4`);
        await this.mixAudioWithVideo(lipsyncedVideoPath, ambientAudioPath, enhancedVideoPath);
      }

      logger.info('SoundRegenerator', 'Sound design regeneration complete', {
        detectedEvents: detection.total_events,
        promptsGenerated: prompts.length,
        ambientGenerated: !!ambientAudioPath,
        effectsGenerated: effectAudioPaths.length,
        hasEnhanced: !!enhancedVideoPath
      });

      return {
        detectedSounds: detection.events.map(e => ({
          timestamp: e.start_time,
          label: e.label,
          confidence: e.confidence,
          category: e.category
        })),
        generatedPrompts: prompts.map(p => ({
          startTime: p.startTime,
          endTime: p.endTime,
          prompt: p.prompt,
          duration: p.duration
        })),
        regeneratedAudioPaths: {
          ambientAudio: ambientAudioPath,
          effectsAudio: effectAudioPaths.length > 0 ? effectAudioPaths.join(', ') : undefined,
          // mixedAudio would only exist if we created a separate mixed audio file
          // For now, the mixed audio is embedded in enhancedVideoPath
          mixedAudio: undefined
        },
        enhancedVideoPath
      };
    } catch (error) {
      logger.error('SoundRegenerator', 'Pipeline failed', error as Error);
      throw error;
    }
  }
}

// Singleton instance
export const soundRegenerator = new SoundRegenerator();
