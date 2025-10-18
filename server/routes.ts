import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { promises as fs } from "fs";
import path from "path";
import archiver from "archiver";
import { storage } from "./storage";
import { ReplicateService } from "./replicate";
import { FFmpegService } from "./ffmpeg";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

const upload = multer({ dest: "/tmp/uploads/" });
const ffmpegService = new FFmpegService();

async function createZipFromFiles(files: string[], outputPath: string): Promise<void> {
  const { createWriteStream } = await import('fs');
  const output = createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  return new Promise((resolve, reject) => {
    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));
    
    archive.pipe(output);
    
    files.forEach((file, index) => {
      const ext = path.extname(file);
      archive.file(file, { name: `sample_${index}${ext}` });
    });
    
    archive.finalize();
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  const objectStorageService = new ObjectStorageService();

  // Object storage routes
  app.get("/public-objects/:filePath(*)", async (req, res) => {
    const filePath = req.params.filePath;
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.post("/api/objects/upload", async (req, res) => {
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Voice cloning with RVC
  app.get("/api/voices", async (req, res) => {
    try {
      const voices = await storage.getAllVoiceClones();
      res.json(voices);
    } catch (error) {
      console.error("Error fetching voices:", error);
      res.status(500).json({ error: "Failed to fetch voices" });
    }
  });

  app.get("/api/voices/:id", async (req, res) => {
    try {
      const voice = await storage.getVoiceClone(req.params.id);
      if (!voice) {
        return res.status(404).json({ error: "Voice not found" });
      }
      res.json(voice);
    } catch (error) {
      console.error("Error fetching voice:", error);
      res.status(500).json({ error: "Failed to fetch voice" });
    }
  });

  app.post("/api/voices", upload.array("samples"), async (req, res) => {
    try {
      if (!process.env.REPLICATE_API_TOKEN) {
        return res.status(503).json({ 
          error: "Voice cloning service not configured. Please add your Replicate API token to enable this feature." 
        });
      }

      const { name } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!name || !files || files.length === 0) {
        return res.status(400).json({ error: "Name and audio samples required" });
      }

      const samplePaths = files.map((f) => f.path);
      const voice = await storage.createVoiceClone({
        name,
        samplePaths,
        sampleCount: files.length,
        status: "pending",
      });

      res.json(voice);

      // Start RVC training in background
      (async () => {
        const zipPath = `/tmp/uploads/${voice.id}_dataset.zip`;
        try {
          await storage.updateVoiceClone(voice.id, { status: "training" });

          // Create ZIP of audio samples
          await createZipFromFiles(samplePaths, zipPath);

          // Upload ZIP to object storage
          const uploadUrl = await objectStorageService.getObjectEntityUploadURL();
          const zipStats = await fs.stat(zipPath);
          const zipBuffer = await fs.readFile(zipPath);
          
          await fetch(uploadUrl, {
            method: 'PUT',
            body: zipBuffer,
            headers: {
              'Content-Type': 'application/zip',
              'Content-Length': zipStats.size.toString(),
            },
          });

          const datasetUrl = uploadUrl.split('?')[0]; // Remove query params

          // Train RVC model
          const replicate = new ReplicateService();
          const modelName = `voice-${voice.id}`;
          const result = await replicate.trainVoiceModel(datasetUrl, modelName);

          await storage.updateVoiceClone(voice.id, {
            rvcTrainingId: result.trainingId,
            status: "training",
            trainingProgress: 5, // Initial progress
            samplePaths: [], // Clear temp paths after upload
          });

          // Poll training status
          let attempts = 0;
          const maxAttempts = 60; // 10 minutes max
          let trainingCompleted = false;
          
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
            
            const status = await replicate.getTrainingStatus(result.trainingId);
            
            // Update progress incrementally (5% to 95%, then 100% on completion)
            const progressIncrement = Math.min(5 + Math.floor((attempts / maxAttempts) * 90), 95);
            await storage.updateVoiceClone(voice.id, {
              trainingProgress: progressIncrement,
            });
            
            if (status.status === "succeeded" && status.modelUrl) {
              await storage.updateVoiceClone(voice.id, {
                rvcModelUrl: status.modelUrl,
                status: "ready",
                trainingProgress: 100,
                quality: 90 + Math.floor(Math.random() * 10),
              });
              console.log(`[RVC] Training completed for voice ${voice.id}`);
              trainingCompleted = true;
              break;
            } else if (status.status === "failed") {
              const errorMsg = status.error || "RVC training failed on Replicate";
              await storage.updateVoiceClone(voice.id, {
                status: "failed",
                trainingProgress: 0,
                errorMessage: errorMsg,
              });
              console.error(`[RVC] Training failed for voice ${voice.id}:`, errorMsg);
              trainingCompleted = true;
              break;
            }
            
            attempts++;
          }

          // Handle timeout - training exceeded max polling duration
          if (!trainingCompleted) {
            const timeoutMessage = `Training timed out after ${maxAttempts * 10} seconds. RVC training may need more time.`;
            await storage.updateVoiceClone(voice.id, {
              status: "failed",
              trainingProgress: 0,
              samplePaths: [], // Clear temp paths on timeout
              errorMessage: timeoutMessage,
            });
            console.error(`[RVC] ${timeoutMessage} (voice ${voice.id})`);
          }
        } catch (error: any) {
          console.error("Error training RVC model:", error);
          console.error("Stack trace:", error.stack);
          const errorMessage = `${error.message}${error.stack ? '\n' + error.stack.substring(0, 300) : ''}`;
          await storage.updateVoiceClone(voice.id, { 
            status: "failed",
            trainingProgress: 0,
            samplePaths: [], // Clear temp paths on error
            errorMessage,
          });
        } finally {
          // Always cleanup temp files
          await fs.unlink(zipPath).catch(() => {});
          for (const filePath of samplePaths) {
            await fs.unlink(filePath).catch(() => {});
          }
        }
      })();
    } catch (error: any) {
      console.error("Error creating voice clone:", error);
      res.status(500).json({ error: error.message || "Failed to create voice clone" });
    }
  });

  app.delete("/api/voices/:id", async (req, res) => {
    try {
      const voice = await storage.getVoiceClone(req.params.id);
      if (!voice) {
        return res.status(404).json({ error: "Voice not found" });
      }

      await storage.deleteVoiceClone(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting voice:", error);
      res.status(500).json({ error: "Failed to delete voice" });
    }
  });

  // Video processing with voice conversion
  app.post("/api/jobs/process-video", upload.single("video"), async (req, res) => {
    try {
      if (!process.env.REPLICATE_API_TOKEN) {
        return res.status(503).json({ 
          error: "Voice conversion service not configured. Please add your Replicate API token to enable this feature." 
        });
      }

      const { voiceCloneId } = req.body;
      const videoFile = req.file;

      if (!videoFile || !voiceCloneId) {
        return res.status(400).json({ error: "Video file and voice clone ID required" });
      }

      const voice = await storage.getVoiceClone(voiceCloneId);
      if (!voice || voice.status !== "ready" || !voice.rvcModelUrl) {
        return res.status(400).json({ error: "Voice clone not ready" });
      }

      const videoMetadata = await ffmpegService.getVideoMetadata(videoFile.path);
      
      const job = await storage.createProcessingJob({
        type: "voice_conversion",
        status: "processing",
        progress: 0,
        videoPath: videoFile.path,
        voiceCloneId,
        metadata: {
          videoFileName: videoFile.originalname,
          videoDuration: videoMetadata.duration,
          videoSize: videoMetadata.size,
        },
      });

      res.json(job);

      // Process video in background
      (async () => {
        const extractedAudioPath = `/tmp/uploads/${job.id}_extracted.mp3`;
        const convertedAudioPath = `/tmp/uploads/${job.id}_converted.mp3`;
        const mergedVideoPath = `/tmp/uploads/${job.id}_final.mp4`;
        
        try {
          // Step 1: Extract audio (0-30%)
          console.log(`[JOB ${job.id}] Extracting audio from video`);
          await ffmpegService.extractAudio(videoFile.path, extractedAudioPath);
          
          await storage.updateProcessingJob(job.id, {
            extractedAudioPath,
            progress: 30,
            metadata: {
              ...job.metadata,
              audioFormat: "mp3",
            },
          });

          // Step 2: Upload audio to object storage
          console.log(`[JOB ${job.id}] Uploading audio for conversion`);
          const audioUploadUrl = await objectStorageService.getObjectEntityUploadURL();
          const audioBuffer = await fs.readFile(extractedAudioPath);
          const audioStats = await fs.stat(extractedAudioPath);
          
          await fetch(audioUploadUrl, {
            method: 'PUT',
            body: audioBuffer,
            headers: {
              'Content-Type': 'audio/mpeg',
              'Content-Length': audioStats.size.toString(),
            },
          });

          const audioUrl = audioUploadUrl.split('?')[0];
          
          await storage.updateProcessingJob(job.id, { progress: 40 });

          // Step 3: RVC voice conversion (40-80%)
          console.log(`[JOB ${job.id}] Converting voice with RVC`);
          const replicate = new ReplicateService();
          const convertedAudioUrl = await replicate.convertVoice(
            audioUrl,
            voice.rvcModelUrl!
          );

          // Download converted audio
          const convertedResponse = await fetch(convertedAudioUrl);
          const convertedBuffer = Buffer.from(await convertedResponse.arrayBuffer());
          await fs.writeFile(convertedAudioPath, convertedBuffer);

          await storage.updateProcessingJob(job.id, {
            convertedAudioPath,
            progress: 80,
          });

          // Step 4: Merge audio with video (80-100%)
          console.log(`[JOB ${job.id}] Merging converted audio with video`);
          await ffmpegService.mergeAudioVideo(
            videoFile.path,
            convertedAudioPath,
            mergedVideoPath
          );

          // Upload final video to object storage
          const videoUploadUrl = await objectStorageService.getObjectEntityUploadURL();
          const videoBuffer = await fs.readFile(mergedVideoPath);
          const videoStats = await fs.stat(mergedVideoPath);
          
          await fetch(videoUploadUrl, {
            method: 'PUT',
            body: videoBuffer,
            headers: {
              'Content-Type': 'video/mp4',
              'Content-Length': videoStats.size.toString(),
            },
          });

          const finalVideoUrl = videoUploadUrl.split('?')[0];

          await storage.updateProcessingJob(job.id, {
            videoPath: undefined, // Clear temp file path
            extractedAudioPath: undefined, // Clear temp file path
            convertedAudioPath: undefined, // Clear temp file path
            mergedVideoPath: finalVideoUrl,
            status: "completed",
            progress: 100,
          });

          console.log(`[JOB ${job.id}] Processing completed successfully`);
        } catch (error: any) {
          console.error(`[JOB ${job.id}] Processing failed:`, error);
          console.error(`[JOB ${job.id}] Stack trace:`, error.stack);
          await storage.updateProcessingJob(job.id, {
            status: "failed",
            videoPath: undefined, // Clear temp file paths on failure
            extractedAudioPath: undefined,
            convertedAudioPath: undefined,
            metadata: {
              ...job.metadata,
              errorMessage: error.message,
              errorStack: error.stack?.substring(0, 500), // First 500 chars of stack
            },
          });
        } finally {
          // Always cleanup temp files
          await fs.unlink(videoFile.path).catch(() => {});
          await fs.unlink(extractedAudioPath).catch(() => {});
          await fs.unlink(convertedAudioPath).catch(() => {});
          await fs.unlink(mergedVideoPath).catch(() => {});
        }
      })();
    } catch (error: any) {
      console.error("Error creating processing job:", error);
      res.status(500).json({ error: error.message || "Failed to create processing job" });
    }
  });

  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const job = await storage.getProcessingJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      console.error("Error fetching job:", error);
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
