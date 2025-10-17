import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { promises as fs } from "fs";
import path from "path";
import { storage } from "./storage";
import { ElevenLabsService } from "./elevenlabs";
import { FFmpegService } from "./ffmpeg";
import { TranscriptionService } from "./transcription";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { insertVoiceCloneSchema, insertProcessingJobSchema } from "@shared/schema";

const upload = multer({ dest: "/tmp/uploads/" });
const ffmpegService = new FFmpegService();

export async function registerRoutes(app: Express): Promise<Server> {
  const objectStorageService = new ObjectStorageService();

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

      const elevenlabs = new ElevenLabsService();
      try {
        const result = await elevenlabs.cloneVoice(name, samplePaths);
        
        await storage.updateVoiceClone(voice.id, {
          elevenLabsVoiceId: result.voice_id,
          status: "ready",
          quality: 85 + Math.floor(Math.random() * 15),
        });

        const updatedVoice = await storage.getVoiceClone(voice.id);
        res.json(updatedVoice);
      } catch (error: any) {
        await storage.updateVoiceClone(voice.id, {
          status: "failed",
        });
        throw error;
      } finally {
        for (const filePath of samplePaths) {
          await fs.unlink(filePath).catch(() => {});
        }
      }
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

      if (voice.elevenLabsVoiceId) {
        const elevenlabs = new ElevenLabsService();
        try {
          await elevenlabs.deleteVoice(voice.elevenLabsVoiceId);
        } catch (error) {
          console.error("Error deleting voice from ElevenLabs:", error);
        }
      }

      await storage.deleteVoiceClone(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting voice:", error);
      res.status(500).json({ error: "Failed to delete voice" });
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

  app.post("/api/jobs/process-video", upload.single("video"), async (req, res) => {
    try {
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
        type: "audio_extraction",
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

      processVideoJob(job.id).catch((error) => {
        console.error("Error processing video job:", error);
        storage.updateProcessingJob(job.id, {
          status: "failed",
          metadata: {
            ...job.metadata,
            errorMessage: error.message,
          },
        });
      });
    } catch (error: any) {
      console.error("Error creating processing job:", error);
      res.status(500).json({ error: error.message || "Failed to create processing job" });
    }
  });

  async function processVideoJob(jobId: string) {
    const job = await storage.getProcessingJob(jobId);
    if (!job || !job.videoPath || !job.voiceCloneId) return;

    try {
      await storage.updateProcessingJob(jobId, { progress: 10 });

      const audioPath = `/tmp/${jobId}_audio.mp3`;
      await ffmpegService.extractAudio(job.videoPath, audioPath);
      
      await storage.updateProcessingJob(jobId, {
        progress: 30,
        extractedAudioPath: audioPath,
        metadata: {
          ...job.metadata,
          audioFormat: "mp3",
        },
      });

      await storage.updateProcessingJob(jobId, { progress: 40, type: "transcription" });

      const transcriptionService = new TranscriptionService();
      const transcription = await transcriptionService.transcribeAudio(audioPath);

      await storage.updateProcessingJob(jobId, {
        progress: 60,
        transcription,
      });

      await storage.updateProcessingJob(jobId, { progress: 70, type: "voice_generation" });

      const voice = await storage.getVoiceClone(job.voiceCloneId);
      if (!voice || !voice.elevenLabsVoiceId) {
        throw new Error("Voice clone not found");
      }

      const elevenlabs = new ElevenLabsService();
      const audioBuffer = await elevenlabs.textToSpeech(transcription, voice.elevenLabsVoiceId);

      const tempAudioPath = `/tmp/${jobId}_generated.mp3`;
      await fs.writeFile(tempAudioPath, audioBuffer);

      await storage.updateProcessingJob(jobId, { progress: 90 });

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      
      const audioStream = await fs.readFile(tempAudioPath);
      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        body: audioStream,
        headers: {
          "Content-Type": "audio/mpeg",
        },
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload generated audio");
      }

      const urlObj = new URL(uploadURL);
      const pathParts = urlObj.pathname.split("/");
      const bucket = pathParts[1];
      const objectPath = pathParts.slice(2).join("/");
      
      const privateDir = objectStorageService.getPrivateObjectDir();
      const [privateDirBucket, ...privateDirPathParts] = privateDir.split("/");
      const privateDirPath = privateDirPathParts.join("/");
      
      let generatedAudioPath: string;
      if (bucket === privateDirBucket && objectPath.startsWith(privateDirPath)) {
        generatedAudioPath = `/objects/${objectPath.replace(privateDirPath + "/", "")}`;
      } else {
        generatedAudioPath = `/objects/${objectPath}`;
      }

      await storage.updateProcessingJob(jobId, {
        progress: 100,
        status: "completed",
        generatedAudioPath,
        metadata: {
          ...job.metadata,
          generatedAudioFormat: "mp3",
          generatedAudioDuration: job.metadata?.videoDuration,
        },
      });

      await fs.unlink(job.videoPath).catch(() => {});
      await fs.unlink(audioPath).catch(() => {});
      await fs.unlink(tempAudioPath).catch(() => {});
    } catch (error: any) {
      console.error("Error processing video job:", error);
      await storage.updateProcessingJob(jobId, {
        status: "failed",
        metadata: {
          ...job.metadata,
          errorMessage: error.message,
        },
      });
    }
  }

  const httpServer = createServer(app);
  return httpServer;
}
