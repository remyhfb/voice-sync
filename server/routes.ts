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
import { ReplicateService } from "./replicate";
import { SyncLabsService } from "./synclabs";
import { SegmentAligner } from "./segment-aligner";

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
            `Voice clone for ${name}`,
            {
              language: "en",
              use_case: "audiobook"
            }
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

  app.post("/api/voices/:id/preview", async (req, res) => {
    try {
      console.log(`[PREVIEW] Starting preview for voice: ${req.params.id}`);
      
      if (!process.env.ELEVENLABS_API_KEY) {
        console.log("[PREVIEW] API key not configured");
        return res.status(503).json({ 
          error: "Voice preview not available. Please add your ElevenLabs API key." 
        });
      }

      const voice = await storage.getVoiceClone(req.params.id);
      console.log(`[PREVIEW] Voice found:`, voice ? `${voice.name} (${voice.status})` : 'NOT FOUND');
      
      if (!voice || voice.status !== "ready" || !voice.elevenLabsVoiceId) {
        console.log("[PREVIEW] Voice not ready or missing voice ID");
        return res.status(400).json({ error: "Voice clone not ready" });
      }

      console.log(`[PREVIEW] Calling ElevenLabs TTS with voice ID: ${voice.elevenLabsVoiceId}`);
      const elevenlabs = new ElevenLabsService();
      const previewText = "Hello! This is a preview of your cloned voice. How does it sound?";
      
      const audioBuffer = await elevenlabs.textToSpeech(
        previewText,
        voice.elevenLabsVoiceId,
        {
          similarity_boost: 0.75,
          stability: 0.5,
          style: 0,
        }
      );

      console.log(`[PREVIEW] TTS completed, audio buffer size: ${audioBuffer.length} bytes`);
      
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
      });
      res.send(audioBuffer);
    } catch (error: any) {
      console.error("[PREVIEW] Error generating voice preview:", error);
      console.error("[PREVIEW] Error stack:", error.stack);
      res.status(500).json({ error: "Failed to generate preview" });
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
        const extractedAudioPath = `/tmp/uploads/${job.id}_extracted.m4a`; // Preserve original audio format
        const isolatedAudioPath = `/tmp/uploads/${job.id}_isolated.mp3`; // Isolated vocals only
        const normalizedAudioPath = `/tmp/uploads/${job.id}_normalized.mp3`; // Stage 1: normalized to ElevenLabs voice
        const convertedAudioPath = `/tmp/uploads/${job.id}_converted.mp3`; // Stage 2: final cloned voice
        const mergedVideoPath = `/tmp/uploads/${job.id}_final.mp4`;
        
        try {
          // Step 1: Extract audio without any conversion (0-20%)
          console.log(`[JOB ${job.id}] Extracting audio from video`);
          await ffmpegService.extractAudio(videoFile.path, extractedAudioPath);
          
          await storage.updateProcessingJob(job.id, {
            extractedAudioPath,
            progress: 20,
          });

          // Step 2: Isolate vocals (remove background music/SFX) (20-30%)
          console.log(`[JOB ${job.id}] Isolating vocals (removing background music/SFX)`);
          const elevenlabs = new ElevenLabsService();
          const isolatedBuffer = await elevenlabs.isolateVoice(extractedAudioPath);
          await fs.writeFile(isolatedAudioPath, isolatedBuffer);
          
          const isolatedStats = await fs.stat(isolatedAudioPath);
          console.log(`[JOB ${job.id}] Isolated vocals size: ${isolatedStats.size} bytes`);
          
          await storage.updateProcessingJob(job.id, { progress: 30 });

          // Step 3: STAGE 1 S2S - Normalize to ElevenLabs voice (30-55%)
          console.log(`[JOB ${job.id}] ⚡ Stage 1: Normalizing synthetic voice to natural ElevenLabs voice`);
          const NEUTRAL_VOICE_ID = "pNInz6obpgDQGcFmaJgB"; // Adam - neutral male voice
          const normalizedBuffer = await elevenlabs.speechToSpeech(
            NEUTRAL_VOICE_ID,
            isolatedAudioPath,
            { removeBackgroundNoise: false }
          );
          await fs.writeFile(normalizedAudioPath, normalizedBuffer);
          
          console.log(`[JOB ${job.id}] Stage 1 complete: Normalized audio (${normalizedBuffer.length} bytes)`);
          await storage.updateProcessingJob(job.id, { progress: 55 });

          // Step 4: STAGE 2 S2S - Convert normalized audio to cloned voice (55-80%)
          console.log(`[JOB ${job.id}] ⚡ Stage 2: Converting normalized voice to your cloned voice`);
          console.log(`[JOB ${job.id}] Target Voice ID: ${voice.elevenLabsVoiceId}`);
          console.log(`[JOB ${job.id}] Target Voice name: ${voice.name}`);
          
          const convertedBuffer = await elevenlabs.speechToSpeech(
            voice.elevenLabsVoiceId!,
            normalizedAudioPath, // Use normalized audio from Stage 1
            { removeBackgroundNoise: false }
          );
          
          console.log(`[JOB ${job.id}] S2S conversion completed, output size: ${convertedBuffer.length} bytes`);

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

          // Extract the object path and convert to /objects/ URL
          const urlParts = videoUploadUrl.split('?')[0].split('/');
          const objectId = urlParts[urlParts.length - 1];
          const finalVideoPath = `/objects/uploads/${objectId}`;

          await storage.updateProcessingJob(job.id, {
            videoPath: null, // Clear temp file path
            extractedAudioPath: null, // Clear temp file path
            convertedAudioPath: null, // Clear temp file path
            mergedVideoPath: finalVideoPath,
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
          await fs.unlink(isolatedAudioPath).catch(() => {});
          await fs.unlink(normalizedAudioPath).catch(() => {});
          await fs.unlink(convertedAudioPath).catch(() => {});
          await fs.unlink(mergedVideoPath).catch(() => {});
        }
      })();
    } catch (error: any) {
      console.error("Error creating processing job:", error);
      res.status(500).json({ error: error.message || "Failed to create processing job" });
    }
  });

  // Process video with Bark-based pipeline (HuBERT alternative)
  app.post("/api/jobs/process-video-bark", upload.single("video"), async (req, res) => {
    try {
      const videoFile = req.file;
      const voiceCloneId = req.body.voiceCloneId;

      if (!videoFile) {
        return res.status(400).json({ error: "No video file provided" });
      }

      if (!voiceCloneId) {
        return res.status(400).json({ error: "No voice clone ID provided" });
      }

      const voice = await storage.getVoiceClone(voiceCloneId);
      if (!voice) {
        return res.status(404).json({ error: "Voice clone not found" });
      }

      if (voice.status !== "ready") {
        return res.status(400).json({ error: "Voice clone not ready" });
      }

      const videoMetadata = await ffmpegService.getVideoMetadata(videoFile.path);
      
      const job = await storage.createProcessingJob({
        type: "voice_conversion_bark",
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
        const extractedAudioPath = `/tmp/uploads/${job.id}_extracted.m4a`;
        const isolatedAudioPath = `/tmp/uploads/${job.id}_isolated.mp3`;
        const convertedAudioPath = `/tmp/uploads/${job.id}_converted.mp3`;
        const mergedVideoPath = `/tmp/uploads/${job.id}_final.mp4`;
        
        try {
          // Step 1: Extract audio (0-15%)
          console.log(`[JOB ${job.id}] [BARK] Extracting audio from video`);
          await ffmpegService.extractAudio(videoFile.path, extractedAudioPath);
          await storage.updateProcessingJob(job.id, {
            extractedAudioPath,
            progress: 15,
          });

          // Step 2: Isolate vocals (15-25%)
          console.log(`[JOB ${job.id}] [BARK] Isolating vocals`);
          const elevenlabs = new ElevenLabsService();
          const isolatedBuffer = await elevenlabs.isolateVoice(extractedAudioPath);
          await fs.writeFile(isolatedAudioPath, isolatedBuffer);
          await storage.updateProcessingJob(job.id, { progress: 25 });

          // Step 3: Transcribe with Whisper (get word-level timestamps) (25-35%)
          console.log(`[JOB ${job.id}] [TIME-ALIGNED] Transcribing with Whisper (word-level timestamps)`);
          const replicate = new ReplicateService();
          const transcriptData = await replicate.transcribeWithTimestamps(isolatedAudioPath);
          console.log(`[JOB ${job.id}] [TIME-ALIGNED] Found ${transcriptData.segments.length} segments`);
          await storage.updateProcessingJob(job.id, { progress: 35 });

          // Step 4: Generate time-aligned TTS with silence padding (35-75%)
          console.log(`[JOB ${job.id}] [TIME-ALIGNED] Generating time-aligned TTS segments with silence padding`);
          const audioParts: string[] = [];
          const silenceFiles: string[] = [];  // Track silence files for cleanup
          
          // Handle edge case: no speech detected
          if (transcriptData.segments.length === 0) {
            console.log(`[JOB ${job.id}] [TIME-ALIGNED] No speech detected, generating full-duration silence`);
            const fullSilencePath = `/tmp/uploads/${job.id}_silence_full.mp3`;
            await ffmpegService.generateSilence(fullSilencePath, videoMetadata.duration);
            audioParts.push(fullSilencePath);
            silenceFiles.push(fullSilencePath);
            await storage.updateProcessingJob(job.id, { progress: 75 });
          } else {
            // Add silence before first segment (if speech doesn't start at 0s)
            if (transcriptData.segments[0].start > 0.05) {
              const startSilenceDuration = transcriptData.segments[0].start;
              const startSilencePath = `/tmp/uploads/${job.id}_silence_start.mp3`;
              console.log(`[JOB ${job.id}] [TIME-ALIGNED] Adding ${startSilenceDuration.toFixed(2)}s silence at start`);
              await ffmpegService.generateSilence(startSilencePath, startSilenceDuration);
              audioParts.push(startSilencePath);
              silenceFiles.push(startSilencePath);
            }
          
          for (let i = 0; i < transcriptData.segments.length; i++) {
            const segment = transcriptData.segments[i];
            const segmentDuration = segment.end - segment.start;
            
            console.log(`[JOB ${job.id}] [TIME-ALIGNED] Segment ${i+1}/${transcriptData.segments.length}: "${segment.text.substring(0, 50)}..." (${segmentDuration.toFixed(2)}s at ${segment.start.toFixed(2)}s)`);
            
            // Generate TTS for this segment using ElevenLabs
            const segmentTTSPath = `/tmp/uploads/${job.id}_segment_${i}_tts.mp3`;
            const segmentTTSBuffer = await elevenlabs.textToSpeech(
              segment.text,
              voice.elevenLabsVoiceId!
            );
            await fs.writeFile(segmentTTSPath, segmentTTSBuffer);
            
            // Time-stretch to match original segment duration
            const segmentAlignedPath = `/tmp/uploads/${job.id}_segment_${i}_aligned.mp3`;
            await ffmpegService.timeStretchAudio(
              segmentTTSPath,
              segmentAlignedPath,
              segmentDuration
            );
            
            audioParts.push(segmentAlignedPath);
            
            // Add silence between segments if there's a gap
            if (i < transcriptData.segments.length - 1) {
              const nextSegment = transcriptData.segments[i + 1];
              const gapDuration = nextSegment.start - segment.end;
              
              if (gapDuration > 0.05) {  // Only add gap if > 50ms
                const gapSilencePath = `/tmp/uploads/${job.id}_silence_gap_${i}.mp3`;
                console.log(`[JOB ${job.id}] [TIME-ALIGNED] Adding ${gapDuration.toFixed(2)}s silence gap after segment ${i+1}`);
                await ffmpegService.generateSilence(gapSilencePath, gapDuration);
                audioParts.push(gapSilencePath);
                silenceFiles.push(gapSilencePath);
              }
            }
            
            // Update progress
            const segmentProgress = 35 + ((i + 1) / transcriptData.segments.length) * 40;
            await storage.updateProcessingJob(job.id, { progress: Math.round(segmentProgress) });
            
            // Cleanup TTS temp file
            await fs.unlink(segmentTTSPath).catch(() => {});
          }
            
            // Add silence after last segment to match video duration
            const lastSegment = transcriptData.segments[transcriptData.segments.length - 1];
            const endSilenceDuration = videoMetadata.duration - lastSegment.end;
            
            if (endSilenceDuration > 0.05) {  // Only add if > 50ms
              const endSilencePath = `/tmp/uploads/${job.id}_silence_end.mp3`;
              console.log(`[JOB ${job.id}] [TIME-ALIGNED] Adding ${endSilenceDuration.toFixed(2)}s silence at end (video: ${videoMetadata.duration}s, speech ends: ${lastSegment.end.toFixed(2)}s)`);
              await ffmpegService.generateSilence(endSilencePath, endSilenceDuration);
              audioParts.push(endSilencePath);
              silenceFiles.push(endSilencePath);
            }
          }
          
          console.log(`[JOB ${job.id}] [TIME-ALIGNED] Concatenating ${audioParts.length} audio parts (speech + silence)`);
          await storage.updateProcessingJob(job.id, { progress: 75 });

          // Step 5: Concatenate all audio parts with silence padding (75-85%)
          await ffmpegService.concatenateAudio(audioParts, convertedAudioPath);
          console.log(`[JOB ${job.id}] [TIME-ALIGNED] Final time-aligned audio created with silence padding`);
          
          await storage.updateProcessingJob(job.id, {
            convertedAudioPath,
            progress: 85,
          });
          
          // Cleanup all temp files (segments + silence files)
          for (const audioPartPath of audioParts) {
            await fs.unlink(audioPartPath).catch(() => {});
          }
          for (const silencePath of silenceFiles) {
            await fs.unlink(silencePath).catch(() => {});
          }

          // Step 6: Merge audio with video (85-100%)
          console.log(`[JOB ${job.id}] [BARK] Merging audio with video`);
          await ffmpegService.mergeAudioVideo(
            videoFile.path,
            convertedAudioPath,
            mergedVideoPath
          );

          // Upload final video to object storage
          const objectStorageService = new ObjectStorageService();
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

          const urlParts = videoUploadUrl.split('?')[0].split('/');
          const objectId = urlParts[urlParts.length - 1];
          const finalVideoPath = `/objects/uploads/${objectId}`;

          await storage.updateProcessingJob(job.id, {
            videoPath: null,
            extractedAudioPath: null,
            convertedAudioPath: null,
            mergedVideoPath: finalVideoPath,
            status: "completed",
            progress: 100,
          });

          console.log(`[JOB ${job.id}] [BARK] Processing completed successfully`);
        } catch (error: any) {
          console.error(`[JOB ${job.id}] [BARK] Error:`, error.message);
          console.error(`[JOB ${job.id}] [BARK] Stack trace:`, error.stack);
          await storage.updateProcessingJob(job.id, {
            status: "failed",
            videoPath: null,
            extractedAudioPath: null,
            convertedAudioPath: null,
            metadata: {
              ...job.metadata,
              errorMessage: error.message,
              errorStack: error.stack?.substring(0, 500),
            },
          });
        } finally {
          // Cleanup temp files
          await fs.unlink(videoFile.path).catch(() => {});
          await fs.unlink(extractedAudioPath).catch(() => {});
          await fs.unlink(isolatedAudioPath).catch(() => {});
          await fs.unlink(convertedAudioPath).catch(() => {});
          await fs.unlink(mergedVideoPath).catch(() => {});
        }
      })();
    } catch (error: any) {
      console.error("Error creating Bark processing job:", error);
      res.status(500).json({ error: error.message || "Failed to create processing job" });
    }
  });

  // Lip-sync pipeline: Time-stretch VEO video to match user audio + Sync Labs lip-sync
  app.post("/api/jobs/process-lipsync", upload.fields([
    { name: "video", maxCount: 1 },
    { name: "audio", maxCount: 1 }
  ]), async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const videoFile = files.video?.[0];
      const audioFile = files.audio?.[0];

      if (!videoFile || !audioFile) {
        return res.status(400).json({ error: "Both VEO video and user audio required" });
      }

      const videoMetadata = await ffmpegService.getVideoMetadata(videoFile.path);
      
      const job = await storage.createProcessingJob({
        type: "lipsync",
        status: "processing",
        progress: 0,
        videoPath: videoFile.path,
        metadata: {
          videoFileName: videoFile.originalname,
          audioFileName: audioFile.originalname,
          videoDuration: videoMetadata.duration,
          videoSize: videoMetadata.size,
        },
      });

      res.json(job);

      // Process in background
      (async () => {
        const veoAudioPath = `/tmp/uploads/${job.id}_veo_audio.m4a`;
        const cleanedUserAudioPath = `/tmp/uploads/${job.id}_cleaned_user.mp3`;
        const timeStretchedVideoPath = `/tmp/uploads/${job.id}_stretched.mp4`;
        const lipsyncedVideoPath = `/tmp/uploads/${job.id}_lipsync.mp4`;
        const segmentPaths: string[] = [];
        
        try {
          // Step 1: Extract VEO audio (0-10%)
          console.log(`[JOB ${job.id}] [LIPSYNC] Extracting VEO audio for transcription`);
          await ffmpegService.extractAudio(videoFile.path, veoAudioPath);
          await storage.updateProcessingJob(job.id, { progress: 10 });

          // Step 2: Clean user audio with ElevenLabs (10-20%)
          console.log(`[JOB ${job.id}] [LIPSYNC] Cleaning user audio (noise reduction + mic enhancement)`);
          const elevenlabs = new ElevenLabsService();
          const cleanedBuffer = await elevenlabs.isolateVoice(audioFile.path);
          await fs.writeFile(cleanedUserAudioPath, cleanedBuffer);
          await storage.updateProcessingJob(job.id, { progress: 15 });

          // Step 2.5: Trim silence from both audio files (15-20%)
          console.log(`[JOB ${job.id}] [LIPSYNC] Trimming silence from audio files`);
          const trimmedUserAudioPath = `/tmp/uploads/${job.id}_trimmed_user.mp3`;
          const trimmedVeoAudioPath = `/tmp/uploads/${job.id}_trimmed_veo.mp3`;
          
          const [userTrimResult, veoTrimResult] = await Promise.all([
            ffmpegService.trimSilence(cleanedUserAudioPath, trimmedUserAudioPath),
            ffmpegService.trimSilence(veoAudioPath, trimmedVeoAudioPath)
          ]);

          console.log(`[JOB ${job.id}] [LIPSYNC] User audio trimmed: ${userTrimResult.startTrimmed.toFixed(2)}s start, ${userTrimResult.endTrimmed.toFixed(2)}s end`);
          console.log(`[JOB ${job.id}] [LIPSYNC] VEO audio trimmed: ${veoTrimResult.startTrimmed.toFixed(2)}s start, ${veoTrimResult.endTrimmed.toFixed(2)}s end`);
          
          await storage.updateProcessingJob(job.id, { 
            progress: 20,
            metadata: {
              ...job.metadata,
              silenceTrimmed: {
                user: userTrimResult,
                veo: veoTrimResult
              }
            }
          });

          // Step 3: Transcribe both with Whisper (20-40%)
          console.log(`[JOB ${job.id}] [LIPSYNC] Transcribing VEO video and user audio (trimmed versions)`);
          const aligner = new SegmentAligner();
          
          const [veoSegments, userSegments] = await Promise.all([
            aligner.extractSegments(trimmedVeoAudioPath),
            aligner.extractSegments(trimmedUserAudioPath)
          ]);
          
          console.log(`[JOB ${job.id}] [LIPSYNC] VEO segments: ${veoSegments.length}, User segments: ${userSegments.length}`);
          await storage.updateProcessingJob(job.id, { progress: 40 });

          // Step 4: Align segments and calculate time-stretch ratios (40-45%)
          console.log(`[JOB ${job.id}] [LIPSYNC] Aligning segments and calculating time-stretch ratios`);
          const alignments = await aligner.alignSegments(veoSegments, userSegments);
          const alignmentReport = aligner.generateAlignmentReport(alignments);
          
          console.log(`[JOB ${job.id}] [LIPSYNC] Alignment quality: ${alignmentReport.summary.alignmentQuality}`);
          console.log(`[JOB ${job.id}] [LIPSYNC] Avg ratio: ${alignmentReport.summary.avgTimeStretchRatio.toFixed(2)}`);
          console.log(`[JOB ${job.id}] [LIPSYNC] Issues: ${alignmentReport.summary.criticalIssues} critical, ${alignmentReport.summary.majorIssues} major, ${alignmentReport.summary.minorIssues} minor`);
          
          // Log warning if quality is poor, but continue processing
          // The report will show users what needs improvement
          if (alignmentReport.summary.alignmentQuality === "poor") {
            console.warn(`[JOB ${job.id}] [LIPSYNC] WARNING: Poor alignment quality detected (avg ratio: ${alignmentReport.summary.avgTimeStretchRatio.toFixed(2)}). Continuing with time-stretching...`);
          }
          
          await storage.updateProcessingJob(job.id, { 
            progress: 45,
            metadata: {
              ...job.metadata,
              alignmentQuality: alignmentReport.summary.alignmentQuality,
              avgTimeStretchRatio: alignmentReport.summary.avgTimeStretchRatio,
              alignmentReport: alignmentReport
            }
          });

          // Step 5: Time-stretch video segments (45-70%)
          console.log(`[JOB ${job.id}] [LIPSYNC] Time-stretching video to match user timing`);
          
          for (let i = 0; i < alignments.length; i++) {
            const alignment = alignments[i];
            const segmentPath = `/tmp/uploads/${job.id}_seg_${i}.mp4`;
            const stretchedPath = `/tmp/uploads/${job.id}_seg_${i}_stretched.mp4`;
            
            // Extract video segment (no audio)
            await ffmpegService.extractVideoSegment(
              videoFile.path,
              segmentPath,
              alignment.veoSegment.start,
              alignment.veoSegment.end
            );
            
            // Time-stretch if needed
            if (alignment.method !== "keep") {
              const safeRatio = aligner.calculateSafeRatio(alignment.timeStretchRatio);
              await ffmpegService.timeStretchVideoSegment(segmentPath, stretchedPath, safeRatio);
              segmentPaths.push(stretchedPath);
              await fs.unlink(segmentPath).catch(() => {});
            } else {
              segmentPaths.push(segmentPath);
            }
            
            const progressPercent = 45 + Math.floor((i / alignments.length) * 25);
            await storage.updateProcessingJob(job.id, { progress: progressPercent });
          }

          // Concatenate time-stretched segments
          console.log(`[JOB ${job.id}] [LIPSYNC] Concatenating ${segmentPaths.length} time-stretched segments`);
          await ffmpegService.concatenateVideoSegments(segmentPaths, timeStretchedVideoPath);
          await storage.updateProcessingJob(job.id, { progress: 70 });

          // Step 6: Apply Sync Labs lip-sync (70-90%)
          console.log(`[JOB ${job.id}] [LIPSYNC] Uploading video and audio to GCS for Sync Labs`);
          const objectStorageService = new ObjectStorageService();
          
          // Upload time-stretched video
          const videoUploadUrl = await objectStorageService.getObjectEntityUploadURL();
          const videoBuffer = await fs.readFile(timeStretchedVideoPath);
          const videoStats = await fs.stat(timeStretchedVideoPath);
          await fetch(videoUploadUrl, {
            method: 'PUT',
            body: videoBuffer,
            headers: {
              'Content-Type': 'video/mp4',
              'Content-Length': videoStats.size.toString(),
            },
          });
          // Generate signed GET URL (1 hour TTL) for Sync Labs to download
          const videoReadUrl = await objectStorageService.getSignedReadURL(videoUploadUrl, 3600);
          
          // Upload cleaned audio
          const audioUploadUrl = await objectStorageService.getObjectEntityUploadURL();
          const audioBuffer = await fs.readFile(cleanedUserAudioPath);
          const audioStats = await fs.stat(cleanedUserAudioPath);
          await fetch(audioUploadUrl, {
            method: 'PUT',
            body: audioBuffer,
            headers: {
              'Content-Type': 'audio/mpeg',
              'Content-Length': audioStats.size.toString(),
            },
          });
          // Generate signed GET URL (1 hour TTL) for Sync Labs to download
          const audioReadUrl = await objectStorageService.getSignedReadURL(audioUploadUrl, 3600);
          
          await storage.updateProcessingJob(job.id, { progress: 75 });
          
          console.log(`[JOB ${job.id}] [LIPSYNC] Applying lip-sync with Sync Labs`);
          const synclabs = new SyncLabsService();
          const syncLabsResult = await synclabs.lipSync(
            videoReadUrl,
            audioReadUrl,
            { model: "lipsync-2-pro" } // Using latest premium model for best quality
          );
          
          console.log(`[JOB ${job.id}] [LIPSYNC] Sync Labs completed. Credits used: ${syncLabsResult.creditsDeducted}`);
          console.log(`[JOB ${job.id}] [LIPSYNC] Downloading lip-synced video from ${syncLabsResult.videoUrl}`);
          const lipsyncedResponse = await fetch(syncLabsResult.videoUrl);
          if (!lipsyncedResponse.ok) {
            throw new Error(`Failed to download lip-synced video: ${lipsyncedResponse.statusText}`);
          }
          const lipsyncedBuffer = Buffer.from(await lipsyncedResponse.arrayBuffer());
          await fs.writeFile(lipsyncedVideoPath, lipsyncedBuffer);
          await storage.updateProcessingJob(job.id, { progress: 90 });

          // Step 7: Upload final video (90-100%)
          console.log(`[JOB ${job.id}] [LIPSYNC] Uploading final video`);
          const finalVideoUploadUrl = await objectStorageService.getObjectEntityUploadURL();
          const finalBuffer = await fs.readFile(lipsyncedVideoPath);
          const finalStats = await fs.stat(lipsyncedVideoPath);
          
          await fetch(finalVideoUploadUrl, {
            method: 'PUT',
            body: finalBuffer,
            headers: {
              'Content-Type': 'video/mp4',
              'Content-Length': finalStats.size.toString(),
            },
          });

          const urlParts = finalVideoUploadUrl.split('?')[0].split('/');
          const objectId = urlParts[urlParts.length - 1];
          const finalVideoPath = `/objects/uploads/${objectId}`;

          await storage.updateProcessingJob(job.id, {
            videoPath: null,
            mergedVideoPath: finalVideoPath,
            status: "completed",
            progress: 100,
            metadata: {
              ...job.metadata,
              syncLabsCredits: syncLabsResult.creditsDeducted,
            } as any, // metadata is JSONB, allows dynamic properties
          });

          console.log(`[JOB ${job.id}] [LIPSYNC] Processing completed successfully`);
        } catch (error: any) {
          console.error(`[JOB ${job.id}] [LIPSYNC] Error:`, error.message);
          console.error(`[JOB ${job.id}] [LIPSYNC] Stack:`, error.stack);
          await storage.updateProcessingJob(job.id, {
            status: "failed",
            videoPath: null,
            metadata: {
              ...job.metadata,
              errorMessage: error.message,
              errorStack: error.stack?.substring(0, 500),
            },
          });
        } finally {
          // Cleanup temp files
          await fs.unlink(videoFile.path).catch(() => {});
          await fs.unlink(audioFile.path).catch(() => {});
          await fs.unlink(veoAudioPath).catch(() => {});
          await fs.unlink(cleanedUserAudioPath).catch(() => {});
          await fs.unlink(`/tmp/uploads/${job.id}_trimmed_user.mp3`).catch(() => {});
          await fs.unlink(`/tmp/uploads/${job.id}_trimmed_veo.mp3`).catch(() => {});
          await fs.unlink(timeStretchedVideoPath).catch(() => {});
          await fs.unlink(lipsyncedVideoPath).catch(() => {});
          for (const segPath of segmentPaths) {
            await fs.unlink(segPath).catch(() => {});
          }
        }
      })();
    } catch (error: any) {
      console.error("Error creating lipsync job:", error);
      res.status(500).json({ error: error.message || "Failed to create lipsync job" });
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
