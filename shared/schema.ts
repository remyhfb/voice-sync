import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const processingJobs = pgTable("processing_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // lipsync
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  progress: integer("progress").notNull().default(0), // 0-100
  videoPath: text("video_path"),
  extractedAudioPath: text("extracted_audio_path"),
  convertedAudioPath: text("converted_audio_path"),
  mergedVideoPath: text("merged_video_path"),
  metadata: jsonb("metadata").$type<{
    videoFileName?: string;
    audioFileName?: string;
    videoDuration?: number;
    videoSize?: number;
    audioFormat?: string;
    convertedAudioDuration?: number;
    alignmentQuality?: "excellent" | "good" | "acceptable" | "poor";
    avgTimeStretchRatio?: number;
    syncLabsCredits?: number;
    alignmentReport?: {
      summary: {
        totalSegments: number;
        avgTimeStretchRatio: number;
        alignmentQuality: "excellent" | "good" | "acceptable" | "poor";
        overallTiming: "too_fast" | "too_slow" | "perfect";
        criticalIssues: number;
        majorIssues: number;
        minorIssues: number;
      };
      segments: Array<{
        segmentIndex: number;
        veoText: string;
        userText: string;
        textSimilarity: number;
        veoTiming: { start: number; end: number; duration: number };
        userTiming: { start: number; end: number; duration: number };
        timeStretchRatio: number;
        appliedRatio: number;
        adjustment: "stretched" | "compressed" | "unchanged";
        speedChange: string;
        severity: "critical" | "major" | "minor" | "perfect";
      }>;
      recommendations: string[];
      topProblemSegments: Array<{
        segmentIndex: number;
        text: string;
        issue: string;
        recommendation: string;
      }>;
    };
    silenceTrimmed?: {
      user: {
        startTrimmed: number;
        endTrimmed: number;
        originalDuration: number;
        trimmedDuration: number;
      };
      veo: {
        startTrimmed: number;
        endTrimmed: number;
        originalDuration: number;
        trimmedDuration: number;
      };
    };
    errorMessage?: string;
    errorStack?: string;
  }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProcessingJobSchema = createInsertSchema(processingJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProcessingJob = z.infer<typeof insertProcessingJobSchema>;
export type ProcessingJob = typeof processingJobs.$inferSelect;
