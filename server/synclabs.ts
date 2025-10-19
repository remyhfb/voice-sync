import https from "https";
import { logger } from "./logger";

export class SyncLabsService {
  private apiKey: string;
  private baseUrl = "api.sync.so";

  constructor() {
    this.apiKey = process.env.SYNCLABS_API_KEY || "";
  }

  /**
   * Apply lip-sync to video using Sync Labs API
   * Uses job-based async API: POST /video with URLs, poll GET /video/{id}
   * 
   * Models:
   * - lipsync-2: Standard model ($0.04-$0.05/sec, ~$2.40-$3/min)
   * - lipsync-2-pro: Latest premium model with enhanced detail ($0.067-$0.083/sec, ~$4-$5/min)
   *   - Better beard/facial hair handling
   *   - Improved teeth generation
   *   - Superior detail preservation
   *   - Requires Scale plan or higher
   * 
   * @param videoUrl - Publicly accessible URL to video file
   * @param audioUrl - Publicly accessible URL to audio file
   * @param options - Configuration options
   * @returns URL to the generated lip-synced video
   */
  async lipSync(
    videoUrl: string,
    audioUrl: string,
    options: {
      model?: "lipsync-2" | "lipsync-2-pro";
      temperature?: number; // 0.3 (subtle) to 0.8 (expressive), default 0.6
      webhookUrl?: string;
    } = {}
  ): Promise<{
    videoUrl: string;
    creditsDeducted: number;
  }> {
    if (!this.apiKey) {
      throw new Error("Sync Labs API key not configured");
    }

    // Use lipsync-2-pro for best quality (requires Scale plan or paid credits)
    const model = options.model || "lipsync-2-pro";
    const temperature = options.temperature ?? 0.6; // Slightly expressive for natural speech

    logger.info("SyncLabs", "Creating lip-sync job", { model, temperature });

    // Step 1: Create job
    const jobId = await this.createJob(videoUrl, audioUrl, model, temperature, options.webhookUrl);
    logger.info("SyncLabs", "Job created", { jobId });

    // Step 2: Poll for completion
    const result = await this.pollJob(jobId);
    logger.info("SyncLabs", "Lip-sync completed");

    return result;
  }

  private createJob(
    videoUrl: string,
    audioUrl: string,
    model: string,
    temperature: number,
    webhookUrl?: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        input: [
          { type: "video", url: videoUrl },
          { type: "audio", url: audioUrl },
        ],
        model,
        options: {
          temperature,
        },
        ...(webhookUrl && { webhook: webhookUrl }),
      });

      const options = {
        hostname: this.baseUrl,
        path: "/v2/generate",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "x-api-key": this.apiKey,
        },
      };

      const req = https.request(options, (res) => {
        const chunks: Buffer[] = [];

        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString();

          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const data = JSON.parse(body);
              resolve(data.id);
            } catch (err) {
              reject(new Error(`Failed to parse response: ${body}`));
            }
          } else {
            reject(new Error(`Sync Labs API error: ${res.statusCode} - ${body}`));
          }
        });
      });

      req.on("error", (err) => reject(new Error(`Request failed: ${err.message}`)));
      req.write(payload);
      req.end();
    });
  }

  private async pollJob(jobId: string, maxAttempts = 120, intervalMs = 5000): Promise<{
    videoUrl: string;
    creditsDeducted: number;
  }> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.getJobStatus(jobId);

      logger.debug("SyncLabs", "Job status", { 
        jobId, 
        status: status.status, 
        step: status.step,
        attempt: attempt + 1 
      });

      if (status.status === "completed") {
        if (!status.videoUrl) {
          throw new Error("Job completed but no video URL returned");
        }
        const creditsUsed = status.creditsDeducted || 0;
        logger.info("SyncLabs", "Job completed", { creditsUsed });
        return {
          videoUrl: status.videoUrl,
          creditsDeducted: creditsUsed,
        };
      }

      if (status.status === "failed") {
        const errorDetails = status.errorMessage || "Unknown error";
        logger.error("SyncLabs", "Job failed", new Error(errorDetails));
        throw new Error(`Sync Labs job failed: ${errorDetails}`);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Sync Labs job polling timeout after ${(maxAttempts * intervalMs) / 1000 / 60} minutes`);
  }

  private getJobStatus(jobId: string): Promise<{
    id: string;
    status: "processing" | "completed" | "failed";
    videoUrl?: string;
    errorMessage?: string;
    creditsDeducted?: number;
    step?: string;
  }> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        path: `/v2/generate/${jobId}`,
        method: "GET",
        headers: {
          "x-api-key": this.apiKey,
        },
      };

      const req = https.request(options, (res) => {
        const chunks: Buffer[] = [];

        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString();

          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const data = JSON.parse(body);
              logger.debug("SyncLabs", "API response received");
              // Normalize response format
              const normalized = {
                id: data.id,
                status: (data.status || "").toLowerCase() as "processing" | "completed" | "failed",
                videoUrl: data.outputUrl || data.output_url || data.videoUrl,
                errorMessage: data.error || data.errorMessage,
                creditsDeducted: data.creditsDeducted || data.credits_deducted,
                step: data.step,
              };
              resolve(normalized);
            } catch (err) {
              reject(new Error(`Failed to parse response: ${body}`));
            }
          } else {
            reject(new Error(`Sync Labs API error: ${res.statusCode} - ${body}`));
          }
        });
      });

      req.on("error", (err) => reject(new Error(`Request failed: ${err.message}`)));
      req.end();
    });
  }
}
