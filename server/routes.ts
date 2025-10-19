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
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      
      // Set proper Content-Type for videos
      if (req.path.includes('/uploads/')) {
        res.setHeader('Content-Type', 'video/mp4');
      }
      
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
          const rawLipsyncedPath = `/tmp/raw_lipsynced_${job.id}.mp4`;
          await fs.writeFile(rawLipsyncedPath, lipsyncedBuffer);
          
          // Re-encode for browser compatibility (H.264/AAC)
          console.log(`[JOB ${job.id}] [LIPSYNC] Re-encoding for browser compatibility`);
          await ffmpegService.reencodeForBrowser(rawLipsyncedPath, lipsyncedVideoPath);
          await fs.unlink(rawLipsyncedPath).catch(() => {});
          
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

          console.log(`[JOB ${job.id}] [LIPSYNC] Processing completed successfully`);
        } catch (error: any) {
          console.error(`[JOB ${job.id}] [LIPSYNC] Error:`, error.message);
          console.error(`[JOB ${job.id}] [LIPSYNC] Stack:`, error.stack);
          
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
