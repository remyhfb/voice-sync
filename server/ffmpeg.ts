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

      // Extract audio without conversion - ElevenLabs accepts any format
      ffmpeg(videoPath)
        .outputOptions([
          "-vn",              // No video
          "-acodec", "copy"   // Copy original audio stream
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
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
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
        
        console.log(`[FFmpeg] Time-stretching: ${currentDuration}s → ${targetDuration}s (tempo: ${tempo})`);

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
          .on("error", (err) => reject(new Error(`FFmpeg time-stretch error: ${err.message}`)))
          .run();
      });
    });
  }

  /**
   * Concatenate multiple audio files
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
        .outputOptions(['-c', 'copy'])
        .output(outputPath)
        .on("end", async () => {
          await fs.unlink(concatListPath).catch(() => {});
          resolve();
        })
        .on("error", async (err) => {
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
        .on("error", (err) => reject(new Error(`FFmpeg merge error: ${err.message}`)))
        .run();
    });
  }
}
