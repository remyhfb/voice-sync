import { type VoiceClone, type InsertVoiceClone, type ProcessingJob, type InsertProcessingJob, voiceClones, processingJobs } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  getVoiceClone(id: string): Promise<VoiceClone | undefined>;
  getAllVoiceClones(): Promise<VoiceClone[]>;
  createVoiceClone(voiceClone: InsertVoiceClone): Promise<VoiceClone>;
  updateVoiceClone(id: string, updates: Partial<VoiceClone>): Promise<VoiceClone | undefined>;
  deleteVoiceClone(id: string): Promise<boolean>;
  
  getProcessingJob(id: string): Promise<ProcessingJob | undefined>;
  getAllProcessingJobs(): Promise<ProcessingJob[]>;
  createProcessingJob(job: InsertProcessingJob): Promise<ProcessingJob>;
  updateProcessingJob(id: string, updates: Partial<ProcessingJob>): Promise<ProcessingJob | undefined>;
  deleteProcessingJob(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private voiceClones: Map<string, VoiceClone>;
  private processingJobs: Map<string, ProcessingJob>;

  constructor() {
    this.voiceClones = new Map();
    this.processingJobs = new Map();
  }

  async getVoiceClone(id: string): Promise<VoiceClone | undefined> {
    return this.voiceClones.get(id);
  }

  async getAllVoiceClones(): Promise<VoiceClone[]> {
    return Array.from(this.voiceClones.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async createVoiceClone(insertVoiceClone: InsertVoiceClone): Promise<VoiceClone> {
    const id = randomUUID();
    const voiceClone: VoiceClone = { 
      ...insertVoiceClone, 
      id,
      createdAt: new Date(),
    };
    this.voiceClones.set(id, voiceClone);
    return voiceClone;
  }

  async updateVoiceClone(id: string, updates: Partial<VoiceClone>): Promise<VoiceClone | undefined> {
    const voiceClone = this.voiceClones.get(id);
    if (!voiceClone) return undefined;
    
    const updated = { ...voiceClone, ...updates };
    this.voiceClones.set(id, updated);
    return updated;
  }

  async deleteVoiceClone(id: string): Promise<boolean> {
    return this.voiceClones.delete(id);
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
      ...insertJob, 
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
  async getVoiceClone(id: string): Promise<VoiceClone | undefined> {
    const result = await db.select().from(voiceClones).where(eq(voiceClones.id, id));
    return result[0];
  }

  async getAllVoiceClones(): Promise<VoiceClone[]> {
    return db.select().from(voiceClones);
  }

  async createVoiceClone(insertVoiceClone: InsertVoiceClone): Promise<VoiceClone> {
    const result = await db.insert(voiceClones).values([insertVoiceClone]).returning();
    return result[0];
  }

  async updateVoiceClone(id: string, updates: Partial<VoiceClone>): Promise<VoiceClone | undefined> {
    const result = await db.update(voiceClones)
      .set(updates)
      .where(eq(voiceClones.id, id))
      .returning();
    return result[0];
  }

  async deleteVoiceClone(id: string): Promise<boolean> {
    const result = await db.delete(voiceClones).where(eq(voiceClones.id, id)).returning();
    return result.length > 0;
  }

  async getProcessingJob(id: string): Promise<ProcessingJob | undefined> {
    const result = await db.select().from(processingJobs).where(eq(processingJobs.id, id));
    return result[0];
  }

  async getAllProcessingJobs(): Promise<ProcessingJob[]> {
    return db.select().from(processingJobs);
  }

  async createProcessingJob(insertJob: InsertProcessingJob): Promise<ProcessingJob> {
    const result = await db.insert(processingJobs).values([insertJob]).returning();
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
