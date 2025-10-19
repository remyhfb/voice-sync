import { type ProcessingJob, type InsertProcessingJob, processingJobs } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  getProcessingJob(id: string): Promise<ProcessingJob | undefined>;
  getAllProcessingJobs(): Promise<ProcessingJob[]>;
  createProcessingJob(job: InsertProcessingJob): Promise<ProcessingJob>;
  updateProcessingJob(id: string, updates: Partial<ProcessingJob>): Promise<ProcessingJob | undefined>;
  deleteProcessingJob(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private processingJobs: Map<string, ProcessingJob>;

  constructor() {
    this.processingJobs = new Map();
  }

  async getProcessingJob(id: string): Promise<ProcessingJob | undefined> {
    return this.processingJobs.get(id);
  }

  async getAllProcessingJobs(): Promise<ProcessingJob[]> {
    return Array.from(this.processingJobs.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async createProcessingJob(insertJob: InsertProcessingJob): Promise<ProcessingJob> {
    const id = randomUUID();
    const job: ProcessingJob = { 
      type: insertJob.type,
      status: insertJob.status ?? "pending",
      progress: insertJob.progress ?? 0,
      videoPath: insertJob.videoPath ?? null,
      extractedAudioPath: insertJob.extractedAudioPath ?? null,
      convertedAudioPath: insertJob.convertedAudioPath ?? null,
      mergedVideoPath: insertJob.mergedVideoPath ?? null,
      metadata: insertJob.metadata ?? null,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.processingJobs.set(id, job);
    return job;
  }

  async updateProcessingJob(id: string, updates: Partial<ProcessingJob>): Promise<ProcessingJob | undefined> {
    const job = this.processingJobs.get(id);
    if (!job) return undefined;
    
    const updated = { ...job, ...updates, updatedAt: new Date() };
    this.processingJobs.set(id, updated);
    return updated;
  }

  async deleteProcessingJob(id: string): Promise<boolean> {
    return this.processingJobs.delete(id);
  }
}

export class DatabaseStorage implements IStorage {
  async getProcessingJob(id: string): Promise<ProcessingJob | undefined> {
    const result = await db.select().from(processingJobs).where(eq(processingJobs.id, id));
    return result[0];
  }

  async getAllProcessingJobs(): Promise<ProcessingJob[]> {
    return db.select().from(processingJobs);
  }

  async createProcessingJob(insertJob: InsertProcessingJob): Promise<ProcessingJob> {
    const result = await db.insert(processingJobs).values([{
      ...insertJob,
      metadata: insertJob.metadata as any, // JSONB allows any valid JSON structure
    }]).returning();
    return result[0];
  }

  async updateProcessingJob(id: string, updates: Partial<ProcessingJob>): Promise<ProcessingJob | undefined> {
    const result = await db.update(processingJobs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(processingJobs.id, id))
      .returning();
    return result[0];
  }

  async deleteProcessingJob(id: string): Promise<boolean> {
    const result = await db.delete(processingJobs).where(eq(processingJobs.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
