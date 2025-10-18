import FormData from "form-data";
import fs from "fs";

export class SyncLabsService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.SYNCLABS_API_KEY || "";
  }

  /**
   * Apply lip-sync to video using Sync Labs API
   * Takes video + audio and generates perfectly synced output
   * 
   * Models:
   * - lipsync-2: Standard model ($0.04-$0.05/sec, ~$2.40-$3/min)
   * - lipsync-2-pro: Latest premium model with enhanced detail ($0.067-$0.083/sec, ~$4-$5/min)
   *   - Better beard/facial hair handling
   *   - Improved teeth generation
   *   - Superior detail preservation
   *   - Requires Scale plan or higher
   */
  async lipSync(
    videoPath: string,
    audioPath: string,
    options: {
      model?: "lipsync-2" | "lipsync-2-pro";
    } = {}
  ): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error("Sync Labs API key not configured");
    }

    // Use lipsync-2 for free tier, upgrade to lipsync-2-pro when on Scale plan
    const model = options.model || "lipsync-2";

    console.log(`[SyncLabs] Starting lip-sync with model: ${model}`);
    console.log(`[SyncLabs] Video: ${videoPath}, Audio: ${audioPath}`);

    return new Promise((resolve, reject) => {
      const formData = new FormData();
      
      formData.append("video", fs.createReadStream(videoPath), {
        filename: "video.mp4",
        contentType: "video/mp4",
      });
      
      formData.append("audio", fs.createReadStream(audioPath), {
        filename: "audio.mp3",
        contentType: "audio/mpeg",
      });
      
      formData.append("model", model);

      formData.submit(
        {
          protocol: "https:",
          host: "api.sync.so",
          path: "/lipsync",
          method: "POST",
          headers: {
            "x-api-key": this.apiKey,
          },
        },
        (err, response) => {
          if (err) {
            return reject(new Error(`Sync Labs API error: ${err.message}`));
          }

          const chunks: Buffer[] = [];
          response.on("data", (chunk) => {
            chunks.push(chunk);
          });

          response.on("end", () => {
            console.log(`[SyncLabs] Response status: ${response.statusCode}`);
            
            if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
              const videoBuffer = Buffer.concat(chunks);
              console.log(`[SyncLabs] Lip-sync completed: ${videoBuffer.length} bytes`);
              resolve(videoBuffer);
            } else {
              const errorText = Buffer.concat(chunks).toString();
              console.error(`[SyncLabs] Error response:`, errorText);
              reject(
                new Error(`Sync Labs API error: ${response.statusCode} - ${errorText}`)
              );
            }
          });

          response.on("error", (error) => {
            reject(new Error(`Sync Labs API error: ${error.message}`));
          });
        }
      );
    });
  }
}
