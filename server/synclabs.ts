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

    const model = options.model || "lipsync-2"; // Use standard model by default

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
          path: "/v2/lipsync",
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
