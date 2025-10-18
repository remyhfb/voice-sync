import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { promises as fs } from "fs";
import path from "path";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export class FFmpegService {
  async extractAudio(
    videoPath: string,
    outputPath: string,
  ): Promise<{ duration: number; format: string }> {
    return new Promise((resolve, reject) => {
      let duration = 0;

      // Normalize audio for ElevenLabs compatibility
      // VEO 3 uses 48kHz AAC which doesn't work well with S2S
      // Convert to standard 44.1kHz mono MP3
      ffmpeg(videoPath)
        .outputOptions([
          "-vn",                    // No video
          "-acodec", "libmp3lame",  // MP3 codec (universally compatible)
          "-ar", "44100",           // 44.1kHz sample rate (ElevenLabs standard)
          "-ac", "1",               // Mono (reduces file size, S2S works better)
          "-ab", "128k"             // 128kbps bitrate (sufficient quality)
        ])
        .output(outputPath)
        .on("codecData", (data) => {
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
        .on("error", (err) => {
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
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
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
        .on("error", (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
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
        .on("error", (err) => reject(new Error(`FFmpeg merge error: ${err.message}`)))
        .run();
    });
  }
}
