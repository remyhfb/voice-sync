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

  /**
   * Get detailed metadata from an audio file using ffprobe
   * Returns duration, format, bitrate, and all available metadata tags
   */
  async getAudioMetadata(audioPath: string): Promise<{
    duration: number | null;
    format: string;
    size: number;
    bitrate: number | null;
    sampleRate: number | null;
    channels: number | null;
    tags: Record<string, any>;
    rawMetadata: any;
  }> {
    const stats = await fs.stat(audioPath);

    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err: any, metadata: any) => {
        if (err) {
          reject(new Error(`FFprobe error: ${err.message}`));
          return;
        }

        const audioStream = metadata.streams?.find((s: any) => s.codec_type === 'audio');

        resolve({
          duration: metadata.format.duration || null,
          format: metadata.format.format_name || "unknown",
          size: stats.size,
          bitrate: metadata.format.bit_rate ? parseInt(metadata.format.bit_rate) : null,
          sampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate) : null,
          channels: audioStream?.channels || null,
          tags: metadata.format.tags || {},
          rawMetadata: metadata.format
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
          logger.info("FFmpeg", "Re-encoded for browser compatibility");
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
   * Normalize audio to target loudness level using EBU R128 loudness normalization
   * Uses two-pass approach for accurate normalization and metadata preservation
   * Targets -14 LUFS (YouTube standard) for consistent volume levels
   */
  async normalizeAudioLoudness(
    inputPath: string,
    outputPath: string,
    options: {
      targetLoudness?: number;  // Target integrated loudness in LUFS (-14 default for YouTube)
      truePeak?: number;         // Maximum true peak in dBTP (-1.0 default)
      loudnessRange?: number;    // Target loudness range in LU (7.0 default)
    } = {}
  ): Promise<void> {
    const targetLoudness = options.targetLoudness ?? -14;  // -14 LUFS is YouTube standard
    const truePeak = options.truePeak ?? -1.0;              // Prevent clipping
    const loudnessRange = options.loudnessRange ?? 7.0;     // Natural dynamic range

    logger.debug("FFmpeg", "Normalizing audio loudness (two-pass)", {
      target: `${targetLoudness} LUFS`,
      truePeak: `${truePeak} dBTP`,
      loudnessRange: `${loudnessRange} LU`
    });

    // Two-pass loudnorm: measure first, then apply with measured values
    return new Promise((resolve, reject) => {
      let measuredValues = '';
      
      // Pass 1: Measure loudness
      ffmpeg(inputPath)
        .audioFilters(`loudnorm=I=${targetLoudness}:TP=${truePeak}:LRA=${loudnessRange}:print_format=json`)
        .outputOptions(['-f', 'null'])
        .output('-')
        .on('stderr', (stderrLine) => {
          // Capture loudnorm measurements from stderr
          measuredValues += stderrLine;
        })
        .on('end', () => {
          // Parse measured values from JSON output
          const jsonMatch = measuredValues.match(/\{[^}]*"input_i"[^}]*\}/);
          if (!jsonMatch) {
            // If measurement fails, fall back to single-pass
            logger.warn("FFmpeg", "Two-pass measurement failed, using single-pass normalization");
            this.normalizeSinglePass(inputPath, outputPath, targetLoudness, truePeak, loudnessRange)
              .then(resolve)
              .catch(reject);
            return;
          }

          const measured = JSON.parse(jsonMatch[0]);
          
          // Pass 2: Apply normalization with measured values
          ffmpeg(inputPath)
            .audioFilters(
              `loudnorm=I=${targetLoudness}:TP=${truePeak}:LRA=${loudnessRange}:` +
              `measured_I=${measured.input_i}:measured_LRA=${measured.input_lra}:` +
              `measured_TP=${measured.input_tp}:measured_thresh=${measured.input_thresh}:linear=true`
            )
            .outputOptions([
              '-f', 'mp3',
              '-acodec', 'libmp3lame',
              '-ar', '48000',
              '-ac', '2',
              '-ab', '192k',
              '-map_metadata', '0',
              '-id3v2_version', '3'
            ])
            .output(outputPath)
            .on('end', () => {
              logger.info("FFmpeg", "Two-pass audio normalization complete", { targetLoudness: `${targetLoudness} LUFS` });
              resolve();
            })
            .on('error', (err: any) => {
              reject(new Error(`FFmpeg normalization error (pass 2): ${err.message}`));
            })
            .run();
        })
        .on('error', (err: any) => {
          reject(new Error(`FFmpeg normalization error (pass 1): ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Single-pass normalization fallback
   */
  private normalizeSinglePass(
    inputPath: string,
    outputPath: string,
    targetLoudness: number,
    truePeak: number,
    loudnessRange: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters(`loudnorm=I=${targetLoudness}:TP=${truePeak}:LRA=${loudnessRange}`)
        .outputOptions([
          '-f', 'mp3',
          '-acodec', 'libmp3lame',
          '-ar', '48000',
          '-ac', '2',
          '-ab', '192k',
          '-map_metadata', '0',
          '-id3v2_version', '3'
        ])
        .output(outputPath)
        .on('end', () => {
          logger.info("FFmpeg", "Single-pass audio normalization complete", { targetLoudness: `${targetLoudness} LUFS` });
          resolve();
        })
        .on('error', (err: any) => {
          reject(new Error(`FFmpeg normalization error: ${err.message}`));
        })
        .run();
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
   * Generate voice effect preview (audio only, 30 seconds)
   * Extracts audio from video, applies effect, outputs MP3
   */
  async generateVoiceEffectPreview(
    videoPath: string,
    outputPath: string,
    options: {
      preset: "concert_hall_expert" | "cathedral_expert" | "stadium_expert" | "small_room_expert" | 
              "forest" | "canyon" | "open_field" | "beach" | "mountain_valley" |
              "telephone" | "radio" | "outdoor" | "outdoor_pro";
      mix: number; // 0-100, how much effect to apply
    }
  ): Promise<void> {
    const { preset, mix } = options;
    const mixDecimal = mix / 100;

    logger.debug("FFmpeg", "Generating voice effect preview", {
      video: path.basename(videoPath),
      preset,
      mix
    });

    // Define filter chains (same as applyVoiceFilter)
    let audioFilter: string;
    
    switch (preset) {
      // EXPERT-VALIDATED REVERB EFFECTS (from professional audio engineering)
      case "concert_hall_expert":
        // Expert parameters: proven in production audio systems
        audioFilter = `aecho=0.8:0.88:60|120|180|240|300:0.4|0.3|0.25|0.2|0.15`;
        break;
      
      case "cathedral_expert":
        // Expert parameters: massive cathedral space with extremely long decay
        audioFilter = `aecho=0.7:0.9:100|200|400|800|1200:0.5|0.45|0.4|0.35|0.3`;
        break;
      
      case "stadium_expert":
        // Expert parameters: large arena with strong early reflections
        audioFilter = `aecho=0.75:0.85:150|300|600|1000|1500:0.4|0.35|0.3|0.25|0.2`;
        break;
      
      case "small_room_expert":
        // Expert parameters: intimate close-miked acoustic
        audioFilter = `aecho=1.0:0.7:15|30:0.5|0.3`;
        break;
      
      // OUTDOOR ACOUSTIC EFFECTS (NEW)
      case "forest":
        // Forest: heavy absorption from trees/foliage, minimal reflections, soft diffuse reverb
        audioFilter = `aecho=0.5:0.3:25|50:0.15|0.1,highpass=f=200,lowpass=f=8000,equalizer=f=4000:width_type=h:width=2000:g=-3`;
        break;
      
      case "canyon":
        // Canyon: dramatic long echoes with 1-2 second delays, strong late reflections
        audioFilter = `aecho=0.6:0.8:800|1200|1800|2500:0.5|0.45|0.4|0.3,equalizer=f=500:width_type=h:width=300:g=2`;
        break;
      
      case "open_field":
        // Open field: almost no reflections, pure sound absorption, very minimal reverb
        audioFilter = `aecho=0.3:0.2:10|20:0.05|0.03,highpass=f=100,lowpass=f=10000`;
        break;
      
      case "beach":
        // Beach: water reflections, wind filtering, distant wave echoes, high-freq rolloff
        audioFilter = `aecho=0.5:0.4:300|600|1000:0.25|0.2|0.15,highpass=f=150,lowpass=f=6000,equalizer=f=5000:width_type=h:width=2000:g=-4`;
        break;
      
      case "mountain_valley":
        // Mountain valley: complex multi-path echoes from surrounding peaks, medium-long delays
        audioFilter = `aecho=0.65:0.75:400|700|1100|1600|2200:0.4|0.35|0.3|0.25|0.2,equalizer=f=300:width_type=h:width=200:g=1`;
        break;
      
      // COMMUNICATION EFFECTS (FIXED - more aggressive for audibility)
      case "telephone":
        // Telephone: very narrow band-pass (300-3000Hz), aggressive mid boost, 3x volume
        audioFilter = `highpass=f=300,lowpass=f=3000,equalizer=f=1500:width_type=h:width=800:g=12,volume=3.0`;
        break;
      
      case "radio":
        // AM Radio: narrow band-pass (500-4000Hz), strong resonance, 2.5x volume
        audioFilter = `highpass=f=500,lowpass=f=4000,equalizer=f=2000:width_type=h:width=600:g=15,volume=2.5`;
        break;
      
      // ORIGINAL OUTDOOR EFFECTS (kept for backward compatibility)
      case "outdoor":
        // Original experimental outdoor
        audioFilter = `aecho=0.6:0.5:30|80:0.15|0.1,highpass=f=100,lowpass=f=12000`;
        break;
      
      case "outdoor_pro":
        // Original professional outdoor with air absorption
        audioFilter = `aecho=0.5:0.4:70|100:0.25|0.15,highpass=f=400,lowpass=f=2500`;
        break;
      
      default:
        throw new Error(`Unknown voice effect preset: ${preset}`);
    }

    const dryWeight = (1 - mixDecimal).toFixed(2);
    const wetWeight = mixDecimal.toFixed(2);
    
    // Use space-separated weights for FFmpeg amix filter
    const filterComplex = `[0:a]asplit=2[dry][wet];[wet]${audioFilter}[wet_processed];[dry][wet_processed]amix=inputs=2:weights=${dryWeight} ${wetWeight}[aout]`;

    return new Promise((resolve, reject) => {
      const args = [
        '-i', videoPath,
        '-y',
        '-t', '30', // Only 30 seconds for preview
        '-filter_complex', filterComplex,
        '-map', '[aout]',
        '-c:a', 'libmp3lame',
        '-b:a', '192k',
        outputPath
      ];

      logger.debug("FFmpeg", "Voice effect preview command", { 
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
          logger.info("FFmpeg", "Voice effect preview generated", { preset, mix });
          resolve();
        } else {
          logger.error("FFmpeg", "Voice effect preview failed", { 
            code, 
            stderr: stderrOutput.slice(-500)
          });
          reject(new Error(`Failed to generate voice effect preview: ffmpeg exited with code ${code}`));
        }
      });

      ffmpegProcess.on('error', (err) => {
        reject(new Error(`Failed to generate voice effect preview: ${err.message}`));
      });
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
      preset: "concert_hall_expert" | "cathedral_expert" | "stadium_expert" | "small_room_expert" | 
              "forest" | "canyon" | "open_field" | "beach" | "mountain_valley" |
              "telephone" | "radio" | "outdoor" | "outdoor_pro";
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
      // EXPERT-VALIDATED REVERB EFFECTS (from professional audio engineering)
      case "concert_hall_expert":
        // Expert parameters: proven in production audio systems
        audioFilter = `aecho=0.8:0.88:60|120|180|240|300:0.4|0.3|0.25|0.2|0.15`;
        break;
      
      case "cathedral_expert":
        // Expert parameters: massive cathedral space with extremely long decay
        audioFilter = `aecho=0.7:0.9:100|200|400|800|1200:0.5|0.45|0.4|0.35|0.3`;
        break;
      
      case "stadium_expert":
        // Expert parameters: large arena with strong early reflections
        audioFilter = `aecho=0.75:0.85:150|300|600|1000|1500:0.4|0.35|0.3|0.25|0.2`;
        break;
      
      case "small_room_expert":
        // Expert parameters: intimate close-miked acoustic
        audioFilter = `aecho=1.0:0.7:15|30:0.5|0.3`;
        break;
      
      // OUTDOOR ACOUSTIC EFFECTS (NEW)
      case "forest":
        // Forest: heavy absorption from trees/foliage, minimal reflections, soft diffuse reverb
        audioFilter = `aecho=0.5:0.3:25|50:0.15|0.1,highpass=f=200,lowpass=f=8000,equalizer=f=4000:width_type=h:width=2000:g=-3`;
        break;
      
      case "canyon":
        // Canyon: dramatic long echoes with 1-2 second delays, strong late reflections
        audioFilter = `aecho=0.6:0.8:800|1200|1800|2500:0.5|0.45|0.4|0.3,equalizer=f=500:width_type=h:width=300:g=2`;
        break;
      
      case "open_field":
        // Open field: almost no reflections, pure sound absorption, very minimal reverb
        audioFilter = `aecho=0.3:0.2:10|20:0.05|0.03,highpass=f=100,lowpass=f=10000`;
        break;
      
      case "beach":
        // Beach: water reflections, wind filtering, distant wave echoes, high-freq rolloff
        audioFilter = `aecho=0.5:0.4:300|600|1000:0.25|0.2|0.15,highpass=f=150,lowpass=f=6000,equalizer=f=5000:width_type=h:width=2000:g=-4`;
        break;
      
      case "mountain_valley":
        // Mountain valley: complex multi-path echoes from surrounding peaks, medium-long delays
        audioFilter = `aecho=0.65:0.75:400|700|1100|1600|2200:0.4|0.35|0.3|0.25|0.2,equalizer=f=300:width_type=h:width=200:g=1`;
        break;
      
      // COMMUNICATION EFFECTS (FIXED - more aggressive for audibility)
      case "telephone":
        // Telephone: very narrow band-pass (300-3000Hz), aggressive mid boost, 3x volume
        audioFilter = `highpass=f=300,lowpass=f=3000,equalizer=f=1500:width_type=h:width=800:g=12,volume=3.0`;
        break;
      
      case "radio":
        // AM Radio: narrow band-pass (500-4000Hz), strong resonance, 2.5x volume
        audioFilter = `highpass=f=500,lowpass=f=4000,equalizer=f=2000:width_type=h:width=600:g=15,volume=2.5`;
        break;
      
      // ORIGINAL OUTDOOR EFFECTS (kept for backward compatibility)
      case "outdoor":
        // Original experimental outdoor
        audioFilter = `aecho=0.6:0.5:30|80:0.15|0.1,highpass=f=100,lowpass=f=12000`;
        break;
      
      case "outdoor_pro":
        // Original professional outdoor with air absorption
        audioFilter = `aecho=0.5:0.4:70|100:0.25|0.15,highpass=f=400,lowpass=f=2500`;
        break;
      
      default:
        throw new Error(`Unknown voice effect preset: ${preset}`);
    }

    // Apply filter with mix control
    // Split audio -> apply filter to one copy -> mix wet/dry
    const dryWeight = (1 - mixDecimal).toFixed(2);
    const wetWeight = mixDecimal.toFixed(2);
    
    // Use space-separated weights for FFmpeg amix filter
    const filterComplex = `[0:a]asplit=2[dry][wet];[wet]${audioFilter}[wet_processed];[dry][wet_processed]amix=inputs=2:weights=${dryWeight} ${wetWeight}[aout]`;

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
