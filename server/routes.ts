import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { promises as fs } from "fs";
import { storage } from "./storage";
import { ElevenLabsService } from "./elevenlabs";
import { FFmpegService } from "./ffmpeg";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { SyncLabsService } from "./synclabs";
import { SegmentAligner } from "./segment-aligner";
import { logger } from "./logger";

const upload = multer({ dest: "/tmp/uploads/" });
const ffmpegService = new FFmpegService();

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
      logger.error("ObjectStorage", "Error searching for public object", error as Error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      
      // Get file metadata
      const [metadata] = await objectFile.getMetadata();
      const fileSize = parseInt(metadata.size as string, 10);
      
      // Set proper Content-Type for videos
      if (req.path.includes('/uploads/')) {
        res.setHeader('Content-Type', 'video/mp4');
      }
      
      // Support for HTTP Range requests (required for video playback)
      const range = req.headers.range;
      
      if (range) {
        // Parse Range header (e.g., "bytes=0-1023")
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = (end - start) + 1;
        
        // Set 206 Partial Content headers
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', chunkSize);
        
        // Stream the requested byte range
        objectFile
          .createReadStream({ start, end })
          .on("error", (err) => {
            logger.error("ObjectStorage", "Error streaming file range", err as Error);
            res.status(500).send("Error streaming file");
          })
          .pipe(res);
      } else {
        // No Range header - stream entire file
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', fileSize);
        
        objectStorageService.downloadObject(objectFile, res);
      }
    } catch (error) {
      logger.error("ObjectStorage", "Error accessing object", error as Error);
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
      logger.error("ObjectStorage", "Error generating upload URL", error as Error);
      res.status(500).json({ error: "Failed to generate upload URL" });
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
          // Step 0.5: Upload original VEO video to object storage for future sound regeneration
          logger.info(`Job:${job.id}`, "Uploading original VEO video to object storage");
          const objectStorageServiceInit = new ObjectStorageService();
          const originalVideoUploadUrl = await objectStorageServiceInit.getObjectEntityUploadURL();
          const originalVideoBuffer = await fs.readFile(videoFile.path);
          const originalVideoStats = await fs.stat(videoFile.path);
          
          await fetch(originalVideoUploadUrl, {
            method: 'PUT',
            body: originalVideoBuffer,
            headers: {
              'Content-Type': 'video/mp4',
              'Content-Length': originalVideoStats.size.toString(),
            },
          });

          const originalUrlParts = originalVideoUploadUrl.split('?')[0].split('/');
          const originalObjectId = originalUrlParts[originalUrlParts.length - 1];
          const originalVideoPath = `/objects/uploads/${originalObjectId}`;

          // Store original video path in metadata
          await storage.updateProcessingJob(job.id, {
            metadata: {
              ...job.metadata,
              originalVideoPath,
            }
          });

          // Step 1: Extract VEO audio (0-10%)
          logger.info(`Job:${job.id}`, "Extracting VEO audio for transcription");
          await ffmpegService.extractAudio(videoFile.path, veoAudioPath);
          await storage.updateProcessingJob(job.id, { progress: 10 });

          // Step 2: Clean user audio with ElevenLabs (10-20%)
          logger.info(`Job:${job.id}`, "Cleaning user audio with ElevenLabs");
          const elevenlabs = new ElevenLabsService();
          const cleanedBuffer = await elevenlabs.isolateVoice(audioFile.path);
          await fs.writeFile(cleanedUserAudioPath, cleanedBuffer);
          await storage.updateProcessingJob(job.id, { progress: 15 });

          // Step 2.5: Trim silence from both audio files (15-20%)
          logger.info(`Job:${job.id}`, "Trimming silence from audio files");
          const trimmedUserAudioPath = `/tmp/uploads/${job.id}_trimmed_user.mp3`;
          const trimmedVeoAudioPath = `/tmp/uploads/${job.id}_trimmed_veo.mp3`;
          
          const [userTrimResult, veoTrimResult] = await Promise.all([
            ffmpegService.trimSilence(cleanedUserAudioPath, trimmedUserAudioPath),
            ffmpegService.trimSilence(veoAudioPath, trimmedVeoAudioPath)
          ]);

          logger.info(`Job:${job.id}`, "Silence trimmed from user audio", { 
            startTrimmed: userTrimResult.startTrimmed, 
            endTrimmed: userTrimResult.endTrimmed 
          });
          logger.info(`Job:${job.id}`, "Silence trimmed from VEO audio", { 
            startTrimmed: veoTrimResult.startTrimmed, 
            endTrimmed: veoTrimResult.endTrimmed 
          });
          
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
          logger.info(`Job:${job.id}`, "Transcribing audio with Whisper");
          const aligner = new SegmentAligner();
          
          const [veoSegments, userSegments] = await Promise.all([
            aligner.extractSegments(trimmedVeoAudioPath),
            aligner.extractSegments(trimmedUserAudioPath)
          ]);
          
          logger.info(`Job:${job.id}`, "Transcription complete", { 
            veoSegments: veoSegments.length, 
            userSegments: userSegments.length 
          });
          await storage.updateProcessingJob(job.id, { progress: 40 });

          // Step 4: Align segments and calculate time-stretch ratios (40-45%)
          logger.info(`Job:${job.id}`, "Aligning segments and calculating time-stretch ratios");
          const alignments = await aligner.alignSegments(veoSegments, userSegments);
          
          await storage.updateProcessingJob(job.id, { progress: 45 });

          // Step 5: Time-stretch video segments (45-70%)
          logger.info(`Job:${job.id}`, "Time-stretching video to match user timing");
          
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
          logger.info(`Job:${job.id}`, "Concatenating time-stretched segments", { count: segmentPaths.length });
          await ffmpegService.concatenateVideoSegments(segmentPaths, timeStretchedVideoPath);
          await storage.updateProcessingJob(job.id, { progress: 70 });

          // Step 6: Apply Sync Labs lip-sync (70-90%)
          logger.info(`Job:${job.id}`, "Uploading video and audio to GCS for Sync Labs");
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
          
          // Upload cleaned audio for Sync Labs
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
          
          // Upload VEO audio permanently for pacing analysis
          const veoAudioUploadUrl = await objectStorageService.getObjectEntityUploadURL();
          const veoAudioBuffer = await fs.readFile(trimmedVeoAudioPath);
          const veoAudioStats = await fs.stat(trimmedVeoAudioPath);
          await fetch(veoAudioUploadUrl, {
            method: 'PUT',
            body: veoAudioBuffer,
            headers: {
              'Content-Type': 'audio/mpeg',
              'Content-Length': veoAudioStats.size.toString(),
            },
          });
          
          // Save permanent paths for pacing analysis
          const veoAudioObjectId = veoAudioUploadUrl.split('?')[0].split('/').pop();
          const userAudioObjectId = audioUploadUrl.split('?')[0].split('/').pop();
          const extractedAudioPath = `/objects/uploads/${veoAudioObjectId}`;
          const convertedAudioPath = `/objects/uploads/${userAudioObjectId}`;
          
          await storage.updateProcessingJob(job.id, { 
            progress: 75,
            extractedAudioPath,
            convertedAudioPath
          });
          
          logger.info(`Job:${job.id}`, "Applying lip-sync with Sync Labs");
          const synclabs = new SyncLabsService();
          const syncLabsResult = await synclabs.lipSync(
            videoReadUrl,
            audioReadUrl,
            { model: "lipsync-2-pro" } // Using latest premium model for best quality
          );
          
          logger.info(`Job:${job.id}`, "Sync Labs completed", { creditsUsed: syncLabsResult.creditsDeducted });
          logger.debug(`Job:${job.id}`, "Downloading lip-synced video");
          const lipsyncedResponse = await fetch(syncLabsResult.videoUrl);
          if (!lipsyncedResponse.ok) {
            throw new Error(`Failed to download lip-synced video: ${lipsyncedResponse.statusText}`);
          }
          const lipsyncedBuffer = Buffer.from(await lipsyncedResponse.arrayBuffer());
          const rawLipsyncedPath = `/tmp/raw_lipsynced_${job.id}.mp4`;
          await fs.writeFile(rawLipsyncedPath, lipsyncedBuffer);
          
          // Re-encode for browser compatibility (H.264/AAC)
          logger.info(`Job:${job.id}`, "Re-encoding for browser compatibility");
          await ffmpegService.reencodeForBrowser(rawLipsyncedPath, lipsyncedVideoPath);
          await fs.unlink(rawLipsyncedPath).catch(() => {});
          
          await storage.updateProcessingJob(job.id, { progress: 90 });

          // Step 7: Upload final video (90-100%)
          logger.info(`Job:${job.id}`, "Uploading final video");
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

          // Get latest job data to preserve alignment report and other metadata
          const latestJob = await storage.getProcessingJob(job.id);
          if (!latestJob) {
            throw new Error("Job not found during final update");
          }

          await storage.updateProcessingJob(job.id, {
            videoPath: null,
            mergedVideoPath: finalVideoPath,
            status: "completed",
            progress: 100,
            metadata: {
              ...latestJob.metadata,
              syncLabsCredits: syncLabsResult.creditsDeducted,
            } as any, // metadata is JSONB, allows dynamic properties
          });

          logger.info(`Job:${job.id}`, "Processing completed successfully");
        } catch (error: any) {
          logger.error(`Job:${job.id}`, "Processing failed", error);
          
          // Get latest job data to preserve alignment report even on failure
          const latestJob = await storage.getProcessingJob(job.id);
          await storage.updateProcessingJob(job.id, {
            status: "failed",
            videoPath: null,
            metadata: {
              ...(latestJob?.metadata || job.metadata),
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
      logger.error("Routes", "Error creating lipsync job", error);
      res.status(500).json({ error: error.message || "Failed to create lipsync job" });
    }
  });

  app.get("/api/jobs", async (req, res) => {
    try {
      const jobs = await storage.getAllProcessingJobs();
      res.json(jobs);
    } catch (error) {
      logger.error("Routes", "Error fetching jobs", error as Error);
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
      logger.error("Routes", "Error fetching job", error as Error);
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  // Pacing analysis endpoint - runs independently from main pipeline
  app.post("/api/jobs/:id/analyze-pacing", async (req, res) => {
    try {
      const jobId = req.params.id;
      const job = await storage.getProcessingJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status !== "completed") {
        return res.status(400).json({ error: "Job must be completed before analyzing pacing" });
      }

      if (!job.extractedAudioPath || !job.convertedAudioPath) {
        return res.status(400).json({ 
          error: "Audio files not available for analysis. This job was processed before pacing analysis was available. Please process a new video to use this feature." 
        });
      }

      // Return immediately - analysis runs in background
      res.json({ message: "Pacing analysis started", jobId });

      // Run analysis asynchronously
      (async () => {
        try {
          const { PacingAnalyzer } = await import("./pacing-analyzer");
          const analyzer = new PacingAnalyzer();

          logger.info(`Job:${jobId}`, "Starting pacing analysis");
          
          // TypeScript: We already checked these exist above, so use non-null assertions
          const report = await analyzer.analyzePacing(
            job.extractedAudioPath!,
            job.convertedAudioPath!,
            objectStorageService
          );

          // Store simplified report in metadata (without full word arrays)
          const simplifiedReport = {
            summary: report.summary,
            phraseComparisons: report.phraseComparisons.map(pc => ({
              phraseIndex: pc.phraseIndex,
              veoPhrase: {
                text: pc.veoPhrase.text,
                totalDuration: pc.veoPhrase.totalDuration,
                startTime: pc.veoPhrase.startTime,
                endTime: pc.veoPhrase.endTime
              },
              userPhrase: {
                text: pc.userPhrase.text,
                totalDuration: pc.userPhrase.totalDuration,
                startTime: pc.userPhrase.startTime,
                endTime: pc.userPhrase.endTime
              },
              timeDelta: pc.timeDelta,
              percentDifference: pc.percentDifference,
              status: pc.status
            })),
            recommendations: report.recommendations
          };

          await storage.updateProcessingJob(jobId, {
            metadata: {
              ...job.metadata,
              pacingAnalysis: simplifiedReport
            }
          });

          logger.info(`Job:${jobId}`, "Pacing analysis complete");
        } catch (error: any) {
          logger.error(`Job:${jobId}`, "Pacing analysis failed", error);
        }
      })();
    } catch (error: any) {
      logger.error("Routes", "Error starting pacing analysis", error);
      res.status(500).json({ error: error.message || "Failed to start pacing analysis" });
    }
  });

  // Sound Design Regeneration (Stage 2) - Optional feature after lip-sync completion
  app.post("/api/jobs/:jobId/regenerate-sound-design", async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await storage.getProcessingJob(jobId);

      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status !== "completed") {
        return res.status(400).json({ error: "Job must be completed before regenerating sound design" });
      }

      if (!job.metadata?.originalVideoPath || !job.mergedVideoPath) {
        return res.status(400).json({ 
          error: "Required video files not available. Cannot regenerate sound design." 
        });
      }

      // Return immediately - regeneration runs in background
      res.json({ message: "Sound design regeneration started", jobId });

      // Run regeneration asynchronously
      (async () => {
        const originalVideoTempPath = `/tmp/original_video_${jobId}.mp4`;
        try {
          const { soundRegenerator } = await import("./sound-regenerator");
          
          logger.info(`Job:${jobId}`, "Starting sound design regeneration");
          
          // Update status to processing
          await storage.updateProcessingJob(jobId, {
            metadata: {
              ...job.metadata,
              soundDesignAnalysis: {
                status: "processing",
                detectedSounds: [],
                generatedPrompts: [],
                regeneratedAudioPaths: {}
              }
            }
          });

          // Download original video from object storage
          logger.info(`Job:${jobId}`, "Downloading original video from object storage");
          const originalVideoUrl = `${process.env.REPLIT_DOMAINS?.split(',')[0] || 'http://localhost:5000'}${job.metadata!.originalVideoPath!}`;
          const videoResponse = await fetch(originalVideoUrl);
          if (!videoResponse.ok) {
            throw new Error(`Failed to download original video: ${videoResponse.statusText}`);
          }
          const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
          await fs.writeFile(originalVideoTempPath, videoBuffer);

          // Run the complete pipeline
          const result = await soundRegenerator.regenerateSoundDesign(
            originalVideoTempPath,
            job.mergedVideoPath!,
            '/tmp/sound-design'
          );

          // Store results in metadata
          await storage.updateProcessingJob(jobId, {
            metadata: {
              ...job.metadata,
              soundDesignAnalysis: {
                status: "completed" as const,
                detectedSounds: result.detectedSounds as Array<{
                  timestamp: number;
                  label: string;
                  confidence: number;
                  category: "ambient" | "effect" | "music" | "other";
                }>,
                generatedPrompts: result.generatedPrompts,
                regeneratedAudioPaths: result.regeneratedAudioPaths,
                enhancedVideoPath: result.enhancedVideoPath
              }
            }
          });

          logger.info(`Job:${jobId}`, "Sound design regeneration complete", {
            detectedSounds: result.detectedSounds.length,
            hasEnhanced: !!result.enhancedVideoPath
          });
        } catch (error: any) {
          logger.error(`Job:${jobId}`, "Sound design regeneration failed", error);
          
          // Update with error status
          await storage.updateProcessingJob(jobId, {
            metadata: {
              ...job.metadata,
              soundDesignAnalysis: {
                status: "failed" as const,
                detectedSounds: [],
                generatedPrompts: [],
                regeneratedAudioPaths: {},
                errorMessage: error.message
              }
            }
          });
        } finally {
          // Cleanup temp file
          await fs.unlink(originalVideoTempPath).catch(() => {});
        }
      })();
    } catch (error: any) {
      logger.error("Routes", "Error starting sound design regeneration", error);
      res.status(500).json({ error: error.message || "Failed to start sound design regeneration" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
