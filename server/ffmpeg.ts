import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
import { logger } from "./logger";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export class FFmpegService {
  async extractAudio(
    videoPath: string,
    outputPath: string,
  ): Promise<{ duration: number; format: string }> {
    return new Promise((resolve, reject) => {
      let duration = 0;

      // Extract audio without conversion - ElevenLabs accepts any format
      ffmpeg(videoPath)
        .outputOptions([
          "-vn",              // No video
          "-acodec", "copy"   // Copy original audio stream
        ])
        .output(outputPath)
        .on("codecData", (data: any) => {
          const durationStr = data.duration;
          const parts = durationStr.split(":");
          duration =
            parseInt(parts[0]) * 3600 +
            parseInt(parts[1]) * 60 +
            parseFloat(parts[2]);
        })
        .on("end", () => {
          resolve({
            duration,
            format: "mp3",
          });
        })
        .on("error", (err: any) => {
          reject(new Error(`FFmpeg error: ${err.message}`));
        })
        .run();
    });
  }

  async getVideoMetadata(videoPath: string): Promise<{
    duration: number;
    format: string;
    size: number;
  }> {
    const stats = await fs.stat(videoPath);

    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err: any, metadata: any) => {
        if (err) {
          reject(new Error(`FFprobe error: ${err.message}`));
          return;
        }

        resolve({
          duration: metadata.format.duration || 0,
          format: metadata.format.format_name || "unknown",
          size: stats.size,
        });
      });
    });
  }

  async convertAudioFormat(
    inputPath: string,
    outputPath: string,
    format: "mp3" | "wav" = "mp3",
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath).output(outputPath);

      if (format === "mp3") {
        command.outputOptions(["-acodec", "libmp3lame", "-ab", "192k"]);
      } else if (format === "wav") {
        command.outputOptions(["-acodec", "pcm_s16le"]);
      }

      command
        .on("end", () => resolve())
        .on("error", (err: any) => reject(new Error(`FFmpeg error: ${err.message}`)))
        .run();
    });
  }

  /**
   * Re-encode video for maximum browser compatibility
   * Uses H.264/AAC codecs which are universally supported
   * Boosts audio by 30% to compensate for volume loss in earlier pipeline stages
   */
  async reencodeForBrowser(
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Re-encode to H.264/AAC which is universally supported by browsers
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .audioFilters('volume=1.3')  // Boost audio by 30% to restore lost volume
        .outputOptions([
          '-preset', 'fast',           // Fast encoding
          '-crf', '23',                // Good quality (lower = better, 23 is default)
          '-b:a', '192k',              // Audio bitrate for quality
          '-pix_fmt', 'yuv420p',       // Pixel format for maximum compatibility
          '-movflags', '+faststart',   // Enable streaming (metadata at start)
          '-profile:v', 'main',        // H.264 main profile for compatibility
          '-level', '4.0',             // H.264 level for wide device support
        ])
        .output(outputPath)
        .on('end', () => {
          logger.info("FFmpeg", "Re-encoded for browser compatibility (30% volume boost applied)");
          resolve();
        })
        .on('error', (err: any) => {
          reject(new Error(`FFmpeg re-encode error: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Time-stretch audio to match target duration while preserving pitch
   */
  async timeStretchAudio(
    inputPath: string,
    outputPath: string,
    targetDuration: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // First get the current duration
      ffmpeg.ffprobe(inputPath, (err: any, metadata: any) => {
        if (err) {
          reject(new Error(`FFprobe error: ${err.message}`));
          return;
        }

        const currentDuration = metadata.format.duration || 0;
        if (currentDuration === 0) {
          reject(new Error("Could not determine audio duration"));
          return;
        }

        // Calculate tempo adjustment factor
        const tempo = currentDuration / targetDuration;
        
        logger.debug("FFmpeg", "Time-stretching audio", { currentDuration, targetDuration, tempo: tempo.toFixed(3) });

        // Use atempo filter to adjust speed while preserving pitch
        // atempo only supports 0.5 to 2.0, so chain multiple if needed
        const atempoFilters: string[] = [];
        let remainingTempo = tempo;
        
        while (remainingTempo > 2.0) {
          atempoFilters.push('atempo=2.0');
          remainingTempo /= 2.0;
        }
        while (remainingTempo < 0.5) {
          atempoFilters.push('atempo=0.5');
          remainingTempo /= 0.5;
        }
        atempoFilters.push(`atempo=${remainingTempo}`);

        ffmpeg(inputPath)
          .audioFilters(atempoFilters.join(','))
          .output(outputPath)
          .on("end", () => resolve())
          .on("error", (err: any) => reject(new Error(`FFmpeg time-stretch error: ${err.message}`)))
          .run();
      });
    });
  }

  /**
   * Generate a silent audio file of specified duration with consistent codec parameters
   */
  async generateSilence(
    outputPath: string,
    duration: number
  ): Promise<void> {
    if (duration <= 0) {
      throw new Error("Duration must be positive");
    }

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(`anullsrc=r=48000:cl=stereo`)  // 48kHz stereo to match concat target
        .inputOptions(['-f', 'lavfi'])
        .outputOptions([
          '-t', duration.toString(),
          '-acodec', 'libmp3lame',
          '-ar', '48000',       // Match concat sample rate
          '-ac', '2',           // Match concat channels (stereo)
          '-ab', '192k'         // Match concat bitrate
        ])
        .output(outputPath)
        .on("end", () => {
          logger.debug("FFmpeg", "Generated silence", { duration });
          resolve();
        })
        .on("error", (err: any) => reject(new Error(`FFmpeg silence generation error: ${err.message}`)))
        .run();
    });
  }

  /**
   * Concatenate multiple audio files with re-encoding to ensure consistent codec
   */
  async concatenateAudio(
    inputPaths: string[],
    outputPath: string
  ): Promise<void> {
    if (inputPaths.length === 0) {
      throw new Error("No input files to concatenate");
    }

    // Create concat file list
    const concatListPath = `/tmp/concat_${Date.now()}.txt`;
    const concatList = inputPaths.map(p => `file '${p}'`).join('\n');
    await fs.writeFile(concatListPath, concatList);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        // Re-encode to consistent format instead of stream copy to avoid codec mismatch
        .outputOptions([
          '-acodec', 'libmp3lame',
          '-ar', '48000',       // 48kHz sample rate (standard for web)
          '-ac', '2',           // Stereo
          '-ab', '192k'         // 192kbps bitrate
        ])
        .output(outputPath)
        .on("end", async () => {
          await fs.unlink(concatListPath).catch(() => {});
          resolve();
        })
        .on("error", async (err: any) => {
          await fs.unlink(concatListPath).catch(() => {});
          reject(new Error(`FFmpeg concat error: ${err.message}`));
        })
        .run();
    });
  }

  async mergeAudioVideo(
    videoPath: string,
    audioPath: string,
    outputPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-map",
          "0:v:0",
          "-map",
          "1:a:0",
          "-shortest",
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err: any) => reject(new Error(`FFmpeg merge error: ${err.message}`)))
        .run();
    });
  }

  /**
   * Detect and trim silence from beginning and end of audio file
   * Returns trimmed audio file and metadata about what was removed
   */
  async trimSilence(
    inputPath: string,
    outputPath: string,
    options: {
      noiseThreshold?: number;  // dB threshold for silence detection (-50dB default)
      minSilenceDuration?: number;  // minimum silence duration in seconds (0.1s default)
    } = {}
  ): Promise<{
    startTrimmed: number;  // seconds trimmed from start
    endTrimmed: number;    // seconds trimmed from end
    originalDuration: number;
    trimmedDuration: number;
  }> {
    const noiseThreshold = options.noiseThreshold || -50;  // -50dB is good for speech
    const minSilenceDuration = options.minSilenceDuration || 0.1;

    return new Promise((resolve, reject) => {
      // First, get original duration
      ffmpeg.ffprobe(inputPath, (err: any, metadata: any) => {
        if (err) {
          reject(new Error(`FFprobe error: ${err.message}`));
          return;
        }

        const originalDuration = metadata.format.duration || 0;

        // Use silencedetect to find speech boundaries
        let silenceData = '';
        
        ffmpeg(inputPath)
          .audioFilters(`silencedetect=noise=${noiseThreshold}dB:d=${minSilenceDuration}`)
          .outputOptions(['-f', 'null'])
          .output('-')
          .on('stderr', (stderrLine: string) => {
            silenceData += stderrLine + '\n';
          })
          .on('end', () => {
            // Parse silence detection output to find speech start/end
            const silenceStartMatches = Array.from(silenceData.matchAll(/silence_start: ([\d.]+)/g));
            const silenceEndMatches = Array.from(silenceData.matchAll(/silence_end: ([\d.]+)/g));

            let speechStart = 0;
            let speechEnd = originalDuration;

            // Find leading silence: if first silence_start is near beginning (within 0.5s),
            // then speech starts when that silence ends
            if (silenceStartMatches.length > 0 && silenceEndMatches.length > 0) {
              const firstSilenceStart = parseFloat(silenceStartMatches[0][1]);
              if (firstSilenceStart < 0.5) {
                speechStart = parseFloat(silenceEndMatches[0][1]);
              }
            }

            // Find trailing silence: if last silence_start exists and either:
            // - has no matching silence_end (extends to EOF), OR
            // - the matching silence_end is very close to EOF (within minSilenceDuration)
            // then speech ends when that silence starts
            if (silenceStartMatches.length > 0) {
              const lastSilenceStart = parseFloat(silenceStartMatches[silenceStartMatches.length - 1][1]);
              
              // Check if this silence extends to (or very near) the end of file
              const hasMatchingEnd = silenceEndMatches.length >= silenceStartMatches.length;
              if (hasMatchingEnd) {
                const lastSilenceEnd = parseFloat(silenceEndMatches[silenceEndMatches.length - 1][1]);
                // If silence extends to near EOF, trim it
                if (originalDuration - lastSilenceEnd < minSilenceDuration) {
                  speechEnd = lastSilenceStart;
                }
              } else {
                // No matching end means silence extends to EOF
                speechEnd = lastSilenceStart;
              }
            }

            const startTrimmed = speechStart;
            const endTrimmed = originalDuration - speechEnd;
            const trimmedDuration = speechEnd - speechStart;

            logger.debug("FFmpeg", "Silence trimmed", { 
              startTrimmed: startTrimmed.toFixed(2), 
              endTrimmed: endTrimmed.toFixed(2),
              originalDuration: originalDuration.toFixed(2),
              trimmedDuration: trimmedDuration.toFixed(2)
            });

            // Guard against zero/negative duration (file is entirely/mostly silence)
            if (trimmedDuration <= 0.1) {
              logger.warn("FFmpeg", "Trimmed duration too short, returning original", { trimmedDuration });
              resolve({
                startTrimmed: 0,
                endTrimmed: 0,
                originalDuration,
                trimmedDuration: originalDuration
              });
              return;
            }

            // Now trim the audio
            ffmpeg(inputPath)
              .setStartTime(speechStart)
              .setDuration(trimmedDuration)
              .outputOptions([
                '-acodec', 'libmp3lame',
                '-ar', '48000',
                '-ac', '2',
                '-ab', '192k'
              ])
              .output(outputPath)
              .on('end', () => {
                resolve({
                  startTrimmed,
                  endTrimmed,
                  originalDuration,
                  trimmedDuration
                });
              })
              .on('error', (err: any) => {
                reject(new Error(`FFmpeg trim error: ${err.message}`));
              })
              .run();
          })
          .on('error', (err: any) => {
            reject(new Error(`FFmpeg silence detection error: ${err.message}`));
          })
          .run();
      });
    });
  }

  /**
   * Extract a video segment (no audio) by time range
   */
  async extractVideoSegment(
    videoPath: string,
    outputPath: string,
    startTime: number,
    endTime: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const duration = endTime - startTime;
      
      ffmpeg(videoPath)
        .inputOptions([
          "-ss", startTime.toString()  // Must be input option for codec copy
        ])
        .outputOptions([
          "-t", duration.toString(),
          "-an", // No audio
          "-c:v", "copy"
        ])
        .output(outputPath)
        .on("end", () => {
          logger.debug("FFmpeg", "Extracted audio segment", { startTime, endTime });
          resolve();
        })
        .on("error", (err: any) => reject(new Error(`FFmpeg segment extraction error: ${err.message}`)))
        .run();
    });
  }

  /**
   * Time-stretch a video segment (speed up or slow down)
   * ratio < 1.0 = speed up (compress timeline)
   * ratio > 1.0 = slow down (stretch timeline)
   * Example: ratio=0.8 means video plays 25% faster
   */
  async timeStretchVideoSegment(
    inputPath: string,
    outputPath: string,
    ratio: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info("FFmpeg", "Time-stretching video", { ratio: ratio.toFixed(3) });
      
      ffmpeg(inputPath)
        .videoFilter(`setpts=${ratio}*PTS`)
        .videoCodec("libx264")
        .outputOptions([
          "-preset", "fast",
          "-crf", "18",
          "-an"
        ])
        .output(outputPath)
        .on("end", () => {
          logger.debug("FFmpeg", "Video time-stretch complete");
          resolve();
        })
        .on("error", (err: any) => reject(new Error(`FFmpeg time-stretch error: ${err.message}`)))
        .run();
    });
  }

  /**
   * Concatenate multiple video segments (no audio)
   */
  async concatenateVideoSegments(
    segmentPaths: string[],
    outputPath: string
  ): Promise<void> {
    if (segmentPaths.length === 0) {
      throw new Error("No video segments to concatenate");
    }

    // Create concat file list
    const concatListPath = `/tmp/concat_video_${Date.now()}.txt`;
    const concatList = segmentPaths.map(p => `file '${p}'`).join('\n');
    await fs.writeFile(concatListPath, concatList);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy'])
        .output(outputPath)
        .on("end", async () => {
          await fs.unlink(concatListPath).catch(() => {});
          logger.info("FFmpeg", "Video segments concatenated", { segments: segmentPaths.length });
          resolve();
        })
        .on("error", async (err: any) => {
          await fs.unlink(concatListPath).catch(() => {});
          reject(new Error(`FFmpeg concat error: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Mix ambient audio with video
   */
  async mixAudioWithVideo(
    videoPath: string,
    ambientAudioPath: string,
    outputPath: string,
    options: {
      loop?: boolean;
      videoVolume?: number;
      ambientVolume?: number;
    } = {}
  ): Promise<void> {
    const { loop = true, videoVolume = 1.0, ambientVolume = 0.15 } = options;

    logger.debug("FFmpeg", "Mixing ambient audio with video", {
      video: path.basename(videoPath),
      ambient: path.basename(ambientAudioPath),
      loop,
      videoVol: videoVolume,
      ambientVol: ambientVolume
    });

    return new Promise((resolve, reject) => {
      const command = ffmpeg()
        .input(videoPath)
        .input(ambientAudioPath);

      if (loop) {
        // Loop ambient audio to match video duration
        command.inputOptions(['-stream_loop', '-1']); // Loop second input infinitely
      }

      command
        .complexFilter([
          // Mix audio streams: original video audio + ambient (looped if needed)
          // volume=1.0 keeps original, volume=0.15 makes ambient subtle
          `[0:a]volume=${videoVolume}[a0]`,
          `[1:a]volume=${ambientVolume}[a1]`,
          `[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]`
        ])
        .outputOptions([
          '-map', '0:v',      // Use video from first input
          '-map', '[aout]',   // Use mixed audio
          '-c:v', 'copy',     // Copy video codec (no re-encode)
          '-c:a', 'aac',      // Encode audio as AAC
          '-b:a', '192k',     // Audio bitrate
          '-shortest'         // End when shortest stream (video) ends
        ])
        .output(outputPath)
        .on("end", () => {
          logger.info("FFmpeg", "Audio mixing complete");
          resolve();
        })
        .on("error", (err: any) => {
          reject(new Error(`FFmpeg mix error: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Apply voice effect to video audio
   * Uses spawn directly instead of fluent-ffmpeg to properly handle filter_complex quoting
   */
  async applyVoiceFilter(
    videoPath: string,
    outputPath: string,
    options: {
      preset: "concert_hall" | "small_room" | "cathedral" | "telephone" | "radio" | "stadium";
      mix: number; // 0-100, how much effect to apply
    }
  ): Promise<void> {
    const { preset, mix } = options;
    const mixDecimal = mix / 100; // Convert to 0-1 range

    logger.debug("FFmpeg", "Applying voice effect", {
      video: path.basename(videoPath),
      preset,
      mix
    });

    // Define filter chains for each preset
    let audioFilter: string;
    
    switch (preset) {
      case "concert_hall":
        // Large reverb with long tail
        audioFilter = `aecho=0.8:0.9:1000|1800:0.3|0.25`;
        break;
      
      case "cathedral":
        // Very large reverb with very long tail
        audioFilter = `aecho=0.8:0.9:1500|2500|3500:0.4|0.3|0.2`;
        break;
      
      case "small_room":
        // Short, tight reverb
        audioFilter = `aecho=0.8:0.88:60|122:0.4|0.3`;
        break;
      
      case "stadium":
        // Medium-long reverb with some early reflections
        audioFilter = `aecho=0.8:0.9:500|1000|2000:0.35|0.3|0.25`;
        break;
      
      case "telephone":
        // Band-pass filter (300Hz - 3400Hz, typical telephone range)
        audioFilter = `highpass=f=300,lowpass=f=3400`;
        break;
      
      case "radio":
        // Band-pass with slight resonance (like AM radio)
        audioFilter = `highpass=f=200,lowpass=f=5000,equalizer=f=2500:width_type=h:width=1000:g=3`;
        break;
      
      default:
        throw new Error(`Unknown voice effect preset: ${preset}`);
    }

    // Apply filter with mix control
    // Split audio -> apply filter to one copy -> mix wet/dry
    const dryWeight = (1 - mixDecimal).toFixed(2);
    const wetWeight = mixDecimal.toFixed(2);
    
    // Source: https://ffmpeg.org/ffmpeg-filters.html#amix
    // Note: 'normalize' option doesn't exist in this FFmpeg version, removed
    const filterComplex = `[0:a]asplit=2[dry][wet];[wet]${audioFilter}[wet_processed];[dry][wet_processed]amix=inputs=2:weights='${dryWeight} ${wetWeight}'[aout]`;

    logger.debug("FFmpeg", "Filter complex", { filterComplex, audioFilter });

    // Use spawn directly to properly handle filter_complex quoting
    // fluent-ffmpeg doesn't quote the parameter correctly, causing shell parsing errors
    return new Promise((resolve, reject) => {
      const args = [
        '-i', videoPath,
        '-y',
        '-filter_complex', filterComplex,
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        outputPath
      ];

      logger.debug("FFmpeg", "Voice effect command args", { 
        ffmpegPath: ffmpegInstaller.path,
        args 
      });

      const ffmpegProcess = spawn(ffmpegInstaller.path, args);
      
      let stderrOutput = '';

      ffmpegProcess.stderr.on('data', (data) => {
        stderrOutput += data.toString();
      });

      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          logger.info("FFmpeg", "Voice effect applied", { preset, mix });
          resolve();
        } else {
          logger.error("FFmpeg", "Voice effect failed", { 
            code, 
            stderr: stderrOutput.slice(-500) // Last 500 chars
          });
          reject(new Error(`Failed to apply voice effect: ffmpeg exited with code ${code}`));
        }
      });

      ffmpegProcess.on('error', (err) => {
        reject(new Error(`Failed to apply voice effect: ${err.message}`));
      });
    });
  }
}
