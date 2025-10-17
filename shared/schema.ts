import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const voiceClones = pgTable("voice_clones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  elevenLabsVoiceId: text("eleven_labs_voice_id"),
  sampleCount: integer("sample_count").notNull().default(0),
  samplePaths: jsonb("sample_paths").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("pending"), // pending, cloning, ready, failed
  quality: integer("quality"), // 0-100 similarity score
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const processingJobs = pgTable("processing_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // audio_extraction, transcription, voice_generation
  status: text("status").notNull().default("pending"), // pending, processing, awaiting_review, completed, failed
  progress: integer("progress").notNull().default(0), // 0-100
  videoPath: text("video_path"),
  extractedAudioPath: text("extracted_audio_path"),
  transcription: text("transcription"),
  editedTranscription: text("edited_transcription"),
  generatedAudioPath: text("generated_audio_path"),
  mergedVideoPath: text("merged_video_path"),
  voiceCloneId: varchar("voice_clone_id").references(() => voiceClones.id),
  metadata: jsonb("metadata").$type<{
    videoFileName?: string;
    videoDuration?: number;
    videoSize?: number;
    audioFormat?: string;
    audioFileName?: string;
    generatedAudioFormat?: string;
    generatedAudioDuration?: number;
    errorMessage?: string;
  }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVoiceCloneSchema = createInsertSchema(voiceClones).omit({
  id: true,
  createdAt: true,
});

export const insertProcessingJobSchema = createInsertSchema(processingJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVoiceClone = z.infer<typeof insertVoiceCloneSchema>;
export type VoiceClone = typeof voiceClones.$inferSelect;

export type InsertProcessingJob = z.infer<typeof insertProcessingJobSchema>;
export type ProcessingJob = typeof processingJobs.$inferSelect;
