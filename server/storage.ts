import { type VoiceClone, type InsertVoiceClone, type ProcessingJob, type InsertProcessingJob } from "@shared/schema";
import { randomUUID } from "crypto";

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

export const storage = new MemStorage();
