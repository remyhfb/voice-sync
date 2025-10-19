import { logger } from './logger';
import { ElevenLabsService } from './elevenlabs';
import { FFmpegService } from './ffmpeg';
import fs from 'fs/promises';
import * as path from 'path';

export interface SoundDesignResult {
  preset?: AmbientType;
  customPrompt?: string;
  ambientPrompt: string;
  generatedAudioPath: string;
  enhancedVideoPath: string;
}

// Predefined ambient sound options
export const AMBIENT_TYPES = {
  office: 'Gentle office ambience with soft typing and occasional paper shuffling',
  cafe: 'Busy coffee shop ambience with distant chatter and espresso machine sounds',
  nature: 'Peaceful outdoor ambience with gentle birds chirping and soft wind rustling leaves',
  city: 'Urban street ambience with distant traffic and city sounds',
  studio: 'Professional recording studio ambience with very subtle room tone',
  home: 'Quiet home ambience with soft ambient room tone',
} as const;

export type AmbientType = keyof typeof AMBIENT_TYPES;

export class SoundRegenerator {
  private elevenLabs: ElevenLabsService;
  private ffmpeg: FFmpegService;

  constructor() {
    this.elevenLabs = new ElevenLabsService();
    this.ffmpeg = new FFmpegService();
  }

  /**
   * Simple ambient sound enhancement:
   * 1. Generate ambient sound using ElevenLabs (from preset or custom prompt)
   * 2. Mix it with the lip-synced video at low volume
   */
  async enhanceWithAmbient(
    lipsyncedVideoPath: string,
    preset?: AmbientType,
    customPrompt?: string,
    outputDir: string = '/tmp/sound-design'
  ): Promise<SoundDesignResult> {
    logger.info('SoundRegenerator', 'Starting ambient sound enhancement', {
      preset,
      customPrompt,
      videoPath: path.basename(lipsyncedVideoPath)
    });

    // Get video duration
    const videoMetadata = await this.ffmpeg.getVideoMetadata(lipsyncedVideoPath);
    const duration = videoMetadata.duration;

    // Paths
    const ambientAudioPath = path.join(outputDir, `ambient_${Date.now()}.mp3`);
    const enhancedVideoPath = path.join(outputDir, `enhanced_${Date.now()}.mp4`);

    try {
      // Step 1: Determine the prompt to use
      const prompt = customPrompt || (preset ? AMBIENT_TYPES[preset] : '');
      
      if (!prompt) {
        throw new Error('Either preset or customPrompt must be provided');
      }
      
      logger.info('SoundRegenerator', 'Generating ambient sound', { prompt, duration });
      
      const audioBuffer = await this.elevenLabs.generateSoundEffect(prompt, {
        durationSeconds: Math.min(duration, 30), // Max 30s, will be looped if needed
        promptInfluence: 0.5 // Balanced for predictable ambience
      });

      await fs.writeFile(ambientAudioPath, audioBuffer);
      logger.info('SoundRegenerator', 'Ambient sound generated', { 
        path: path.basename(ambientAudioPath) 
      });

      // Step 2: Mix ambient sound with video at low volume (15% ambient, 100% original)
      logger.info('SoundRegenerator', 'Mixing ambient sound with video');
      
      await this.ffmpeg.mixAudioWithVideo(
        lipsyncedVideoPath,
        ambientAudioPath,
        enhancedVideoPath,
        {
          loop: duration > 30, // Loop if video is longer than ambient
          videoVolume: 1.0,    // Keep original audio at full volume
          ambientVolume: 0.15  // Ambient at 15% for subtle background
        }
      );

      logger.info('SoundRegenerator', 'Ambient sound enhancement complete', {
        enhancedVideo: path.basename(enhancedVideoPath)
      });

      return {
        preset,
        customPrompt,
        ambientPrompt: prompt,
        generatedAudioPath: ambientAudioPath,
        enhancedVideoPath
      };
    } catch (error) {
      logger.error('SoundRegenerator', 'Enhancement failed', error as Error);
      throw error;
    }
  }
}

export const soundRegenerator = new SoundRegenerator();
