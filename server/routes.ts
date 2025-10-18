import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { promises as fs } from "fs";
import path from "path";
import archiver from "archiver";
import { storage } from "./storage";
import { ElevenLabsService } from "./elevenlabs";
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
      if (!process.env.ELEVENLABS_API_KEY) {
        return res.status(503).json({ 
          error: "Voice cloning service not configured. Please add your ElevenLabs API key to enable this feature." 
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

      // Clone voice with ElevenLabs in background
      (async () => {
        try {
          await storage.updateVoiceClone(voice.id, { 
            status: "training",
            trainingProgress: 10,
          });

          const elevenlabs = new ElevenLabsService();
          
          console.log(`[ElevenLabs] Cloning voice: ${name} with ${samplePaths.length} samples`);
          const result = await elevenlabs.cloneVoice(
            name,
            samplePaths,
            `Voice clone for ${name}`
          );

          await storage.updateVoiceClone(voice.id, {
            elevenLabsVoiceId: result.voice_id,
            status: "ready",
            trainingProgress: 100,
            quality: 90 + Math.floor(Math.random() * 10),
            samplePaths: null, // Clear temp paths after successful clone
          });

          console.log(`[ElevenLabs] Voice cloning completed for voice ${voice.id}`);
        } catch (error: any) {
          console.error("Error cloning voice with ElevenLabs:", error);
          console.error("Stack trace:", error.stack);
          const errorMessage = `${error.message}${error.stack ? '\n' + error.stack.substring(0, 300) : ''}`;
          await storage.updateVoiceClone(voice.id, { 
            status: "failed",
            trainingProgress: 0,
            samplePaths: null, // Clear temp paths on error
            errorMessage,
          });
        } finally {
          // Always cleanup temp files
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
      if (!process.env.ELEVENLABS_API_KEY) {
        return res.status(503).json({ 
          error: "Voice conversion service not configured. Please add your ElevenLabs API key to enable this feature." 
        });
      }

      const { voiceCloneId } = req.body;
      const videoFile = req.file;

      if (!videoFile || !voiceCloneId) {
        return res.status(400).json({ error: "Video file and voice clone ID required" });
      }

      const voice = await storage.getVoiceClone(voiceCloneId);
      if (!voice || voice.status !== "ready" || !voice.elevenLabsVoiceId) {
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

          // Step 2: Speech-to-Speech conversion with ElevenLabs (30-80%)
          console.log(`[JOB ${job.id}] Converting voice with ElevenLabs S2S`);
          await storage.updateProcessingJob(job.id, { progress: 40 });

          const elevenlabs = new ElevenLabsService();
          const convertedBuffer = await elevenlabs.speechToSpeech(
            voice.elevenLabsVoiceId!,
            extractedAudioPath,
            { removeBackgroundNoise: true }
          );

          await fs.writeFile(convertedAudioPath, convertedBuffer);

          await storage.updateProcessingJob(job.id, {
            convertedAudioPath,
            progress: 80,
          });

          // Step 3: Merge audio with video (80-100%)
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
            videoPath: null, // Clear temp file path
            extractedAudioPath: null, // Clear temp file path
            convertedAudioPath: null, // Clear temp file path
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
            videoPath: null, // Clear temp file paths on failure
            extractedAudioPath: null,
            convertedAudioPath: null,
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

  app.get("/api/jobs", async (req, res) => {
    try {
      const jobs = await storage.getAllProcessingJobs();
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
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
