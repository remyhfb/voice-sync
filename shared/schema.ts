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
    syncLabsCredits?: number;
    originalVideoPath?: string;
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
    pacingAnalysis?: {
      summary: {
        totalPhrases: number;
        totalTimeDelta: number;
        avgTimeDelta: number;
        avgPercentDifference: number;
        tooFastCount: number;
        tooSlowCount: number;
        perfectCount: number;
      };
      phraseComparisons: Array<{
        phraseIndex: number;
        veoPhrase: {
          text: string;
          totalDuration: number;
          startTime: number;
          endTime: number;
        };
        userPhrase: {
          text: string;
          totalDuration: number;
          startTime: number;
          endTime: number;
        };
        timeDelta: number;
        percentDifference: number;
        status: "too_fast" | "too_slow" | "perfect";
      }>;
      recommendations: string[];
    };
    soundDesignAnalysis?: {
      status: "processing" | "completed" | "failed";
      detectedSounds: Array<{
        timestamp: number;
        label: string;
        confidence: number;
        category: "ambient" | "effect" | "music" | "other";
      }>;
      generatedPrompts: Array<{
        startTime: number;
        endTime: number;
        prompt: string;
        duration: number;
      }>;
      regeneratedAudioPaths: {
        ambientAudio?: string;
        effectsAudio?: string;
        mixedAudio?: string;
      };
      enhancedVideoPath?: string;
      errorMessage?: string;
    };
    ambientEnhancement?: {
      status: "processing" | "completed" | "failed";
      preset?: "office" | "cafe" | "nature" | "city" | "studio" | "home";
      customPrompt?: string;
      ambientPrompt?: string;
      enhancedVideoPath?: string;
      errorMessage?: string;
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

// Ambient enhancement request schema
export const AMBIENT_PRESETS = ["office", "cafe", "nature", "city", "studio", "home"] as const;
export type AmbientPreset = typeof AMBIENT_PRESETS[number];

export const enhanceAmbientSchema = z.object({
  preset: z.enum(AMBIENT_PRESETS).optional(),
  customPrompt: z.string()
    .min(5, "Custom prompt must be at least 5 characters")
    .max(200, "Custom prompt must be less than 200 characters")
    .optional(),
}).refine(
  (data) => data.preset || data.customPrompt,
  { message: "Either preset or customPrompt must be provided" }
).refine(
  (data) => !(data.preset && data.customPrompt),
  { message: "Cannot provide both preset and customPrompt - choose one" }
);

export type EnhanceAmbientRequest = z.infer<typeof enhanceAmbientSchema>;
